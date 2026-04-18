import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://whats-good-here.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth is fully optional — guests can fetch place details without a session.
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } },
        })
        await supabase.auth.getUser()
      } catch (_) {
        // Auth check failed — continue as guest
      }
    }

    // Parse request
    const { placeId } = await req.json()
    if (!placeId) {
      return new Response(JSON.stringify({ error: 'placeId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Call Google Places Details (New) API.
    // `attributions` is required by Google's policy whenever third-party
    // attributions exist for the place and we display any of its data.
    const fields = 'displayName,formattedAddress,location,websiteUri,nationalPhoneNumber,googleMapsUri,rating,userRatingCount,attributions'
    const url = `https://places.googleapis.com/v1/places/${placeId}?languageCode=en`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': GOOGLE_API_KEY!,
        'X-Goog-FieldMask': fields,
      },
    })

    if (!response.ok) {
      console.error('Google Places Details upstream error')
      return new Response(JSON.stringify({ error: 'Upstream service error' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await response.json()

    // Transform to app format. Google returns attributions as
    // { provider, providerUri } objects — surface both so the client can
    // render them as plain strings or linked text.
    const attributions = Array.isArray(data.attributions)
      ? data.attributions
          .map((a: { provider?: string; providerUri?: string } | null | undefined) =>
            a && a.provider
              ? { provider: a.provider, url: a.providerUri || null }
              : null,
          )
          .filter((a): a is { provider: string; url: string | null } => a !== null)
      : []

    const details = {
      name: data.displayName?.text || '',
      address: data.formattedAddress || '',
      lat: data.location?.latitude || null,
      lng: data.location?.longitude || null,
      phone: data.nationalPhoneNumber || null,
      websiteUrl: data.websiteUri || null,
      menuUrl: data.menuUri || null,
      googleMapsUrl: data.googleMapsUri || null,
      googleRating: data.rating || null,
      googleReviewCount: data.userRatingCount || null,
      attributions,
    }

    return new Response(JSON.stringify(details), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
