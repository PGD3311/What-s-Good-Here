import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY')

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  try {
    // Auth is fully optional — guests can search without a session.
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } },
        })
        const { data } = await supabase.auth.getUser()
        const user = data?.user ?? null

        if (user) {
          // Rate limit authed users: 10 requests/min
          const { data: rateCheck } = await supabase.rpc('check_and_record_rate_limit', {
            p_action: 'places_nearby_search',
            p_max_attempts: 10,
            p_window_seconds: 60,
          })
          if (rateCheck && !rateCheck.allowed) {
            return new Response(JSON.stringify({ error: 'Rate limit exceeded', retry_after: rateCheck.retry_after_seconds }), {
              status: 429,
              headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
            })
          }
        }
      } catch (_) {
        // Auth check failed — continue as guest
      }
    }

    // Parse request
    const { lat, lng, radiusMeters } = await req.json()
    if (!lat || !lng) {
      return new Response(JSON.stringify({ error: 'lat and lng are required', places: [] }), {
        status: 400,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    // Cap radius at 40234m (~25 miles) — covers MV + Cape Cod
    const clampedRadius = Math.min(radiusMeters || 40234, 40234)

    // Call Google Places Nearby Search (New) API
    const url = 'https://places.googleapis.com/v1/places:searchNearby'
    const body = {
      includedTypes: ['restaurant', 'cafe', 'bar', 'bakery'],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: clampedRadius,
        },
      },
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY!,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Google Places Nearby Search error:', errorText)
      return new Response(JSON.stringify({ error: 'Places API error', places: [] }), {
        status: 502,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    const data = await response.json()

    // Transform to app format
    const places = (data.places || []).map((p: {
      id: string
      displayName?: { text: string }
      formattedAddress?: string
      location?: { latitude: number; longitude: number }
    }) => ({
      placeId: p.id,
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
      lat: p.location?.latitude || null,
      lng: p.location?.longitude || null,
    }))

    return new Response(JSON.stringify({ places }), {
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(JSON.stringify({ error: 'Internal error', places: [] }), {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
