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
    // If an auth header is present, try to identify the user for per-account rate limiting.
    const authHeader = req.headers.get('Authorization')
    let user = null

    if (authHeader) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } },
        })
        const { data } = await supabase.auth.getUser()
        user = data?.user ?? null

        if (user) {
          // Rate limit authed users: 20 requests/min
          const { data: rateCheck } = await supabase.rpc('check_and_record_rate_limit', {
            p_action: 'places_autocomplete',
            p_max_attempts: 20,
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
    const { input, lat, lng, radius } = await req.json()
    if (!input || input.trim().length < 2) {
      return new Response(JSON.stringify({ predictions: [] }), {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    // Call Google Places Autocomplete (New) API
    const url = 'https://places.googleapis.com/v1/places:autocomplete'
    const body: Record<string, unknown> = {
      input: input.trim(),
      includedPrimaryTypes: ['restaurant', 'cafe', 'bar', 'bakery', 'food'],
      languageCode: 'en',
    }

    if (lat && lng) {
      body.locationBias = {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: Math.min(radius || 50000, 50000), // Cap at 50km
        },
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY!,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Google Places API error:', errorText)
      return new Response(JSON.stringify({ error: 'Places API error', predictions: [] }), {
        status: 502,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    const data = await response.json()

    const predictions = (data.suggestions || [])
      .filter((s: { placePrediction?: unknown }) => s.placePrediction)
      .map((s: { placePrediction: { placeId: string; text: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }) => ({
        placeId: s.placePrediction.placeId,
        name: s.placePrediction.structuredFormat?.mainText?.text || s.placePrediction.text.text,
        address: s.placePrediction.structuredFormat?.secondaryText?.text || '',
      }))

    return new Response(JSON.stringify({ predictions }), {
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(JSON.stringify({ error: 'Internal error', predictions: [] }), {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
