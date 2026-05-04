import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://whats-good-here.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXTRACTION_PROMPT = `You are extracting events and specials from a restaurant webpage.

Extract any upcoming events (live music, trivia, comedy, karaoke, open mic, etc.) and daily/weekly specials or deals.

Return a JSON object with this exact structure:
{
  "events": [
    {
      "event_name": "string",
      "description": "string or null",
      "event_date": "YYYY-MM-DD",
      "start_time": "HH:MM" or null,
      "end_time": "HH:MM" or null,
      "event_type": "live_music" | "trivia" | "comedy" | "karaoke" | "open_mic" | "other",
      "recurring_pattern": "weekly" | "monthly" | null
    }
  ],
  "specials": [
    {
      "deal_name": "string",
      "description": "string or null",
      "price": number or null
    }
  ]
}

Rules:
- Only include events with specific dates. Skip vague mentions.
- For recurring events, include the next occurrence date and set recurring_pattern.
- event_type must be one of: live_music, trivia, comedy, karaoke, open_mic, other
- Prices should be numbers (e.g., 12.99), not strings.
- If no events or specials found, return empty arrays.
- Return ONLY valid JSON, no markdown or explanation.`

interface ExtractedEvent {
  event_name: string
  description: string | null
  event_date: string
  start_time: string | null
  end_time: string | null
  event_type: string
  recurring_pattern: string | null
}

interface ExtractedSpecial {
  deal_name: string
  description: string | null
  price: number | null
}

interface ExtractionResult {
  events: ExtractedEvent[]
  specials: ExtractedSpecial[]
}

/**
 * Fetch and extract text content from a URL
 */
async function fetchWebContent(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'WhatsGoodHere-EventBot/1.0',
        'Accept': 'text/html',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()

    // Strip HTML tags to get plain text, keep structure
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()

    // Truncate to ~8000 chars to stay within token limits
    return text.slice(0, 8000)
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Call Claude Haiku to extract structured events/specials data
 */
async function extractWithClaude(content: string, restaurantName: string): Promise<ExtractionResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Restaurant: ${restaurantName}\n\nToday's date: ${new Date().toISOString().split('T')[0]}\n\nWebpage content:\n${content}`,
        },
      ],
      system: EXTRACTION_PROMPT,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text || '{}'

  // Parse JSON from response, handling possible markdown wrapping
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { events: [], specials: [] }
  }

  const parsed = JSON.parse(jsonMatch[0])
  return {
    events: Array.isArray(parsed.events) ? parsed.events : [],
    specials: Array.isArray(parsed.specials) ? parsed.specials : [],
  }
}

const VALID_EVENT_TYPES = ['live_music', 'trivia', 'comedy', 'karaoke', 'open_mic', 'other']

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Dual-path auth gate: CRON_SECRET (cron caller) or admin user JWT.
    // Mirrors the dispatcher and menu-refresh's CRON_SECRET pattern.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const supabaseUrl_ = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey_ = Deno.env.get('SUPABASE_ANON_KEY')!

    let isAuthorized = false
    const cronSecret = Deno.env.get('CRON_SECRET')
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      isAuthorized = true
    }

    if (!isAuthorized) {
      const authClient = createClient(supabaseUrl_, supabaseAnonKey_, {
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

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use service role key for server-to-server calls
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request - expects { restaurant_id, restaurant_name, website_url?, facebook_url? }
    const { restaurant_id, restaurant_name, website_url, facebook_url } = await req.json()

    if (!restaurant_id) {
      return new Response(JSON.stringify({ error: 'restaurant_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const urls: string[] = []
    if (website_url) urls.push(website_url)
    if (facebook_url) urls.push(facebook_url)

    if (urls.length === 0) {
      return new Response(JSON.stringify({ events: 0, specials: 0, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let allEvents: ExtractedEvent[] = []
    let allSpecials: ExtractedSpecial[] = []

    // Fetch and process each URL
    for (const url of urls) {
      try {
        const content = await fetchWebContent(url)
        if (content.length < 100) continue // Skip mostly empty pages

        const extracted = await extractWithClaude(content, restaurant_name || 'Unknown')
        allEvents = allEvents.concat(extracted.events)
        allSpecials = allSpecials.concat(extracted.specials)
      } catch (err) {
        console.error(`Error processing ${url}:`, err)
        // Continue with other URLs
      }
    }

    // Stage-then-swap: insert new auto_scrape rows FIRST, then deactivate
    // the prior auto_scrape rows. Previously the order was reversed, so a
    // failed extraction or partial insert error left the restaurant with
    // zero active rows until the next successful run. With this order:
    //   - Total extraction failure (allEvents/allSpecials empty) → old
    //     rows stay live, deactivate is skipped per the guards below.
    //   - Partial insert failure → whatever new rows landed survive, old
    //     rows go inactive. Brief overlap during the insert window.
    // No SQL transaction is available from the Supabase JS client; the
    // soft-promote pattern below is the closest practical equivalent.
    const runStartedAt = new Date().toISOString()

    // Insert new events
    let eventsInserted = 0
    const today = new Date().toISOString().split('T')[0]

    for (const event of allEvents) {
      // Validate event_type
      if (!VALID_EVENT_TYPES.includes(event.event_type)) continue
      // Skip past events
      if (event.event_date < today) continue

      const { error } = await supabase.from('events').insert({
        restaurant_id,
        event_name: event.event_name,
        description: event.description || null,
        event_date: event.event_date,
        start_time: event.start_time || null,
        end_time: event.end_time || null,
        event_type: event.event_type,
        recurring_pattern: event.recurring_pattern || null,
        is_active: true,
        source: 'auto_scrape',
      })
      if (!error) eventsInserted++
    }

    // Insert new specials
    let specialsInserted = 0

    for (const special of allSpecials) {
      if (!special.deal_name) continue

      const { error } = await supabase.from('specials').insert({
        restaurant_id,
        deal_name: special.deal_name,
        description: special.description || null,
        price: special.price || null,
        is_active: true,
        source: 'auto_scrape',
      })
      if (!error) specialsInserted++
    }

    // Deactivate prior auto_scrape rows (those created before this run
    // started). Independent guards: only deactivate the table whose new
    // set landed at least one row, to protect against catastrophic
    // extraction failure. The `created_at < runStartedAt` filter ensures
    // the rows we just inserted aren't caught.
    if (eventsInserted > 0) {
      const { error: eventsDeactivateErr } = await supabase
        .from('events')
        .update({ is_active: false })
        .eq('restaurant_id', restaurant_id)
        .eq('source', 'auto_scrape')
        .lt('created_at', runStartedAt)
      if (eventsDeactivateErr) {
        console.error('restaurant-scraper: events deactivate failed', eventsDeactivateErr)
      }
    }
    if (specialsInserted > 0) {
      const { error: specialsDeactivateErr } = await supabase
        .from('specials')
        .update({ is_active: false })
        .eq('restaurant_id', restaurant_id)
        .eq('source', 'auto_scrape')
        .lt('created_at', runStartedAt)
      if (specialsDeactivateErr) {
        console.error('restaurant-scraper: specials deactivate failed', specialsDeactivateErr)
      }
    }

    return new Response(JSON.stringify({
      events: eventsInserted,
      specials: specialsInserted,
      restaurant_id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Restaurant scraper error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
