import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { parseModeration, readDishContext, failClosed, type ModerationResult, type DishContext } from './parse.ts'

/**
 * Photo Moderation Edge Function
 *
 * Required for Apple App Store submission (Guideline 1.2 — UGC moderation).
 * Called from dishPhotosApi.uploadPhoto AFTER the file is in storage but BEFORE
 * the dish_photos row is inserted (which is what makes the photo visible to
 * other users).
 *
 * Sonnet vision evaluates the image and returns:
 *   { is_food_photo, is_unsafe, reason, dish_match, seen }
 *
 * dish_match ('likely' | 'unclear' | 'contradicts') answers "is this the dish
 * they say it is?" when the caller sends dish_name/category/restaurant_name.
 * The client only acts on 'contradicts', and only by ASKING the user
 * ("This looks like sushi, not Whole Belly Clams — add it anyway, or pick the
 * right dish?"). It never rejects: a fancy plating of the named dish is still
 * that dish, and the person holding the plate knows better than the model.
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

// Appended only when the caller tells us which dish the photo is being
// attached to. Deliberately conservative: the ONLY thing we want to catch is
// a photo of an obviously different kind of food. Never guess the dish.
function dishCheckPrompt(ctx: DishContext): string {
  const where = ctx.restaurantName ? ` at ${ctx.restaurantName}` : ''
  const cat = ctx.category ? ` (menu category: ${ctx.category})` : ''
  return `

DISH CHECK. The user is attaching this photo to the dish "${ctx.dishName}"${cat}${where}. Add two more fields to the JSON:
  "dish_match": "likely" | "unclear" | "contradicts",
  "seen": "2-6 plain words naming the food actually visible, e.g. 'sushi rolls', 'a frozen cocktail', 'fried clams in a basket'"

dish_match rules:
- "contradicts" ONLY when the visible food is clearly a different KIND of food from the named dish — e.g. the dish is fried clams and the photo shows sushi; the dish is a burger and the photo shows pancakes; the dish is a cocktail and the photo shows a plate of pasta.
- "likely" when the food plausibly is the named dish.
- "unclear" for everything else: unfamiliar or house-name dishes you can't judge ("Nancy's Roll", "Katama Roll"), unusual or upscale plating, partial views, table shots with several items, drinks in generic glassware, menus, interiors. When in doubt, "unclear". Restaurants plate dishes in ways that don't match the textbook version — that is NOT a contradiction.
- Never let the dish check change is_food_photo or is_unsafe.`
}

async function moderate(photoUrl: string, dish: DishContext | null): Promise<ModerationResult> {
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
        model: 'claude-sonnet-5',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: photoUrl } },
            { type: 'text', text: 'Moderate this photo per the system instructions.' },
          ],
        }],
        system: dish ? MODERATION_PROMPT + dishCheckPrompt(dish) : MODERATION_PROMPT,
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

  const result = parseModeration(raw)
  if (!result) {
    console.error('photo-moderate: unparseable Sonnet output:', raw.slice(0, 500))
    return failClosed("Couldn't verify photo. Please try again.")
  }
  // No dish context → no dish verdict, whatever the model said.
  if (!dish) result.dish_match = 'unclear'
  return result
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

  // Auth gate: require an authenticated caller. Without auth, any anonymous
  // visitor could burn Anthropic tokens by hitting this endpoint.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user: authUser } } = await authClient.auth.getUser()
  if (!authUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
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
  // Allowlist: only URLs from THIS project's dish-photos OR avatars buckets.
  // Without this, any authenticated user could ask us to moderate arbitrary
  // internet images and burn Anthropic tokens.
  //
  // Parse with `new URL` rather than substring-matching. Substring matching
  // is brittle to path-traversal sequences like `..` and to query-string
  // tricks. URL parsing normalizes the origin separately from the path so
  // we can assert origin == supabaseUrl exactly, then walk the pathname
  // segments without trusting their textual form.
  let parsedUrl: URL
  try {
    parsedUrl = new URL(photoUrl)
  } catch {
    return new Response(JSON.stringify({ error: 'photo_url is not a valid URL' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  const expectedOrigin = supabaseUrl ? new URL(supabaseUrl).origin : ''
  if (!expectedOrigin || parsedUrl.origin !== expectedOrigin) {
    return new Response(JSON.stringify({ error: 'photo_url must come from this Supabase project' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  // Strip leading slash and split. Empty segments (consecutive slashes) and
  // path-traversal markers ('.', '..') are rejected so we can't be tricked
  // into addressing a different file from what the textual path appears
  // to claim. Expected layout for both buckets:
  //   /storage/v1/object/public/<bucket>/<user_id>/<filename>
  const segments = parsedUrl.pathname.replace(/^\/+/, '').split('/')
  if (segments.some(s => s === '' || s === '.' || s === '..')) {
    return new Response(JSON.stringify({ error: 'photo_url has invalid path segments' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  const [s0, s1, s2, s3, bucket, ownerSegment] = segments
  if (s0 !== 'storage' || s1 !== 'v1' || s2 !== 'object' || s3 !== 'public') {
    return new Response(JSON.stringify({ error: 'photo_url must point to a public storage object' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  if (bucket !== 'dish-photos' && bucket !== 'avatars' && bucket !== 'menu-photos') {
    return new Response(JSON.stringify({ error: 'photo_url must point to the dish-photos, avatars, or menu-photos bucket' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Ownership check. Upload paths are `{user_id}/{dish_id}.jpg` (dish-photos)
  // or `{user_id}/avatar.jpg` (avatars) — in both buckets the first path
  // segment after the bucket prefix is the owner's UUID. Reject mismatches —
  // without this, any authenticated user could ask us to moderate any other
  // user's photo (still bucket-scoped, but they could enumerate URLs and burn
  // tokens at someone else's expense, plus it leaks no-cost photo existence
  // checks).
  if (!ownerSegment || ownerSegment !== authUser.id) {
    return new Response(JSON.stringify({ error: 'Photo does not belong to caller' }), {
      status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Per-user rate limit. 30/min — well above any legitimate per-upload
  // moderation flow; bounds Anthropic spend per user.
  const { data: rateCheck } = await authClient.rpc('check_and_record_rate_limit', {
    p_action: 'photo_moderate',
    p_max_attempts: 30,
    p_window_seconds: 60,
  })
  if (rateCheck && !rateCheck.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded', retry_after: rateCheck.retry_after_seconds }), {
      status: 429, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const result = await moderate(photoUrl, readDishContext(body))

  return new Response(JSON.stringify(result), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
