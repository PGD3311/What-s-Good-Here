import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://whats-good-here.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_RESTAURANTS_PER_RUN = 50
const DELAY_BETWEEN_CALLS_MS = 2000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Dual-path auth gate. Two valid invocation patterns:
    //   1. pg_cron sends `Bearer ${CRON_SECRET}` — a non-JWT shared secret
    //      that pairs with verify_jwt=false in supabase/config.toml.
    //   2. An admin invokes manually with their user JWT.
    // Mirrors the CRON_SECRET pattern menu-refresh uses (see PR #58 / #82).
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    let isAuthorized = false
    const cronSecret = Deno.env.get('CRON_SECRET')
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      isAuthorized = true
    }

    if (!isAuthorized) {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user: authUser } } = await authClient.auth.getUser()
      if (authUser) {
        const { data: adminRow } = await authClient
          .from('admins')
          .select('user_id')
          .eq('user_id', authUser.id)
          .maybeSingle()
        if (adminRow) isAuthorized = true
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get restaurants with website or facebook URLs
    const { data: restaurants, error } = await supabase
      .from('restaurants')
      .select('id, name, website_url, facebook_url')
      .or('website_url.not.is.null,facebook_url.not.is.null')
      .eq('is_open', true)
      .limit(MAX_RESTAURANTS_PER_RUN)

    if (error) {
      console.error('Error fetching restaurants:', error)
      return new Response(JSON.stringify({ error: 'Failed to fetch restaurants' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!restaurants || restaurants.length === 0) {
      return new Response(JSON.stringify({ message: 'No restaurants to scrape', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results: Array<{ restaurant_id: string; name: string; status: string; events?: number; specials?: number }> = []

    // Call restaurant-scraper for each restaurant with delay
    for (const restaurant of restaurants) {
      try {
        const scraperUrl = `${supabaseUrl}/functions/v1/restaurant-scraper`

        // Forward the caller's authHeader so restaurant-scraper can re-run
        // the same dual-path auth gate. Cron caller → CRON_SECRET stays
        // valid; admin caller → their JWT stays valid. Service-role keys
        // are NOT user JWTs and would fail restaurant-scraper's getUser()
        // path, which is the original Codex-flagged break.
        const response = await fetch(scraperUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({
            restaurant_id: restaurant.id,
            restaurant_name: restaurant.name,
            website_url: restaurant.website_url,
            facebook_url: restaurant.facebook_url,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          results.push({
            restaurant_id: restaurant.id,
            name: restaurant.name,
            status: 'success',
            events: data.events,
            specials: data.specials,
          })
        } else {
          results.push({
            restaurant_id: restaurant.id,
            name: restaurant.name,
            status: `error: ${response.status}`,
          })
        }
      } catch (err) {
        results.push({
          restaurant_id: restaurant.id,
          name: restaurant.name,
          status: `error: ${String(err)}`,
        })
      }

      // Rate limit between calls
      await sleep(DELAY_BETWEEN_CALLS_MS)
    }

    const totalEvents = results.reduce((sum, r) => sum + (r.events || 0), 0)
    const totalSpecials = results.reduce((sum, r) => sum + (r.specials || 0), 0)
    const successCount = results.filter(r => r.status === 'success').length

    return new Response(JSON.stringify({
      processed: restaurants.length,
      success: successCount,
      total_events: totalEvents,
      total_specials: totalSpecials,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Dispatcher error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
