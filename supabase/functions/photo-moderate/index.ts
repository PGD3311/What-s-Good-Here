import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * Photo Moderation Edge Function
 *
 * Required for Apple App Store submission (Guideline 1.2 — UGC moderation).
 * Called from dishPhotosApi.uploadPhoto AFTER the file is in storage but BEFORE
 * the dish_photos row is inserted (which is what makes the photo visible to
 * other users).
 *
 * Sonnet vision evaluates the image and returns:
 *   { is_food_photo: bool, is_unsafe: bool, reason: string }
 *
 * Caller is responsible for deleting the storage object if rejected.
 *
 * Behavior on degraded service (Anthropic down, key unset, parse failure):
 * fail CLOSED — return is_unsafe=true with a "couldn't verify" reason. Better
 * to block legit users for a few minutes than let bad content through during
 * an outage. Apple compliance requires good-faith filtering, not 100% uptime.
 */

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const MODERATION_PROMPT = `You are reviewing a photo uploaded to the dish-photo section of a food discovery app. Users are supposed to upload photos of the dish they're rating, the restaurant they ate at, or food-related context (table setting, menu, restaurant interior).

Evaluate the image and return ONLY valid JSON (no markdown, no fences):
{
  "is_food_photo": boolean,
  "is_unsafe": boolean,
  "reason": "short explanation under 80 chars"
}

is_food_photo: TRUE if the photo shows food, a dish, a drink, a meal context, a menu, a restaurant interior or exterior, or food packaging. FALSE if the photo is unrelated content (selfies without food, pets, scenery without food, screenshots, memes, blank/test images).

is_unsafe: TRUE if the photo contains: nudity, sexually suggestive content, violence, gore, weapons, hate symbols, drugs, alcohol abuse imagery, or any content unsafe for general audiences. FALSE for normal food/restaurant content (a glass of wine on a table is fine; a person clearly intoxicated is not).

reason: brief, user-facing explanation (under 80 chars). Examples: "Please upload a food photo." / "This photo isn't allowed." / "Looks good!"

If you can't tell what the image is (corrupted, blank, ambiguous), set is_food_photo=false with reason "Couldn't read this photo. Please try a clearer image."`

interface ModerationResult {
  is_food_photo: boolean
  is_unsafe: boolean
  reason: string
}

function failClosed(reason: string): ModerationResult {
  return { is_food_photo: false, is_unsafe: true, reason }
}

async function moderate(photoUrl: string): Promise<ModerationResult> {
  if (!ANTHROPIC_API_KEY) {
    console.error('photo-moderate: ANTHROPIC_API_KEY not configured')
    return failClosed("Couldn't verify photo. Please try again.")
  }

  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: photoUrl } },
            { type: 'text', text: 'Moderate this photo per the system instructions.' },
          ],
        }],
        system: MODERATION_PROMPT,
      }),
    })
  } catch (err) {
    console.error('photo-moderate: fetch failed', err)
    return failClosed("Couldn't verify photo. Please try again.")
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '<unreadable>')
    console.error(`photo-moderate: Anthropic ${response.status} — ${text.slice(0, 500)}`)
    return failClosed("Couldn't verify photo. Please try again.")
  }

  let raw: string
  try {
    const data = await response.json()
    raw = data.content?.[0]?.text || ''
  } catch (err) {
    console.error('photo-moderate: response.json() failed', err)
    return failClosed("Couldn't verify photo. Please try again.")
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('photo-moderate: no JSON in Sonnet output:', raw.slice(0, 500))
    return failClosed("Couldn't verify photo. Please try again.")
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (err) {
    console.error('photo-moderate: JSON parse failed', err, raw.slice(0, 500))
    return failClosed("Couldn't verify photo. Please try again.")
  }

  return {
    is_food_photo: parsed.is_food_photo === true,
    is_unsafe: parsed.is_unsafe === true,
    reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : '',
  }
}

serve(async (req) => {
  const cors = corsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const photoUrl = typeof body.photo_url === 'string' ? body.photo_url : ''
  if (!photoUrl) {
    return new Response(JSON.stringify({ error: 'photo_url required' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  // Sonnet image URL source requires HTTPS — same constraint we hit in menu-refresh.
  if (!photoUrl.startsWith('https://')) {
    return new Response(JSON.stringify({ error: 'photo_url must be https' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  // Allowlist: only URLs from THIS project's dish-photos bucket. Without this,
  // any authenticated user could burn the Anthropic budget asking us to moderate
  // arbitrary internet images. JWT auth alone scopes WHO can call; this scopes
  // WHAT they can ask us to moderate.
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const allowedPrefix = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/dish-photos/` : ''
  if (!allowedPrefix || !photoUrl.startsWith(allowedPrefix)) {
    return new Response(JSON.stringify({ error: 'photo_url must point to the dish-photos bucket' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const result = await moderate(photoUrl)

  return new Response(JSON.stringify(result), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
