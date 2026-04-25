import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * Share Link Handler — Dynamic OG Tags for Social Previews
 *
 * Routes: /api/share?type=dish&id=uuid
 *         /api/share?type=restaurant&id=uuid
 *
 * For social crawlers: returns minimal HTML with OG meta tags
 * For browsers: redirects to the SPA route
 *
 * vercel.json rewrites /dish/:id and /restaurant/:id through this
 * function for bot user agents.
 */

const BOT_PATTERNS = [
  'facebookexternalhit', 'Facebot', 'Twitterbot', 'LinkedInBot',
  'WhatsApp', 'Slackbot', 'Discordbot', 'TelegramBot', 'Applebot',
  'Pinterestbot', 'Embedly', 'SkypeUriPreview', 'vkShare',
  'redditbot', 'Googlebot', 'bingbot',
]

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const BASE_URL = 'https://wghapp.com'

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { type, id } = req.query

  if (!type || !id || typeof type !== 'string' || typeof id !== 'string') {
    return res.redirect(302, '/')
  }

  // Validate type against allowlist to prevent open redirect
  const ALLOWED_TYPES: Record<string, string> = { dish: 'dish', restaurant: 'restaurants' }
  const routePath = ALLOWED_TYPES[type]
  if (!routePath) {
    return res.redirect(302, '/')
  }

  // Validate UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.redirect(302, '/')
  }

  // Check if this is a social crawler
  const ua = req.headers['user-agent'] || ''
  const isBot = BOT_PATTERNS.some(bot => ua.toLowerCase().includes(bot.toLowerCase()))

  // For browsers, redirect to SPA
  if (!isBot) {
    return res.redirect(302, `/${routePath}/${id}`)
  }

  // For bots, fetch data and serve OG tags
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  let title = "What's Good Here"
  let description = 'The best dishes, ranked by locals'
  let imageUrl = `${BASE_URL}/og-image.png`
  const pageUrl = `${BASE_URL}/${routePath}/${id}`

  try {
    if (type === 'dish') {
      const { data: dish } = await supabase
        .from('dishes')
        .select('name, category, price, photo_url, restaurant_id, avg_rating, total_votes')
        .eq('id', id)
        .maybeSingle()

      if (dish) {
        const { data: restaurant } = await supabase
          .from('restaurants')
          .select('name, town')
          .eq('id', dish.restaurant_id)
          .maybeSingle()

        const restName = restaurant?.name || 'a local spot'
        const town = restaurant?.town || ''
        title = `${dish.name} at ${restName}`

        // Vote stats (for fallback count; dishes.total_votes is preferred source of truth)
        const { count: totalVotes } = await supabase
          .from('votes')
          .select('*', { count: 'exact', head: true })
          .eq('dish_id', id)

        const effectiveVotes = dish.total_votes ?? totalVotes ?? 0
        const avgRating = dish.avg_rating != null ? Number(dish.avg_rating).toFixed(1) : null

        if (effectiveVotes >= 5 && avgRating != null) {
          description = `${avgRating}/10 · ${effectiveVotes} ratings · ${town}`
        } else {
          description = `Rated on What's Good Here · ${town}`
        }

        if (dish.photo_url) {
          imageUrl = dish.photo_url
        } else {
          imageUrl = `${BASE_URL}/api/og-image?type=dish&id=${id}`
        }
      }
    } else if (type === 'restaurant') {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('name, town')
        .eq('id', id)
        .maybeSingle()

      if (restaurant) {
        title = restaurant.name
        description = `See what's good at ${restaurant.name}${restaurant.town ? ' in ' + restaurant.town : ''}`
        imageUrl = `${BASE_URL}/api/og-image?type=restaurant&id=${id}`
      }
    }
  } catch {
    // Fall through with defaults
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escHtml(title)}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(description)}">
<meta property="og:image" content="${escHtml(imageUrl)}">
<meta property="og:url" content="${escHtml(pageUrl)}">
<meta property="og:site_name" content="What's Good Here">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
<meta name="twitter:description" content="${escHtml(description)}">
<meta name="twitter:image" content="${escHtml(imageUrl)}">
</head>
<body>
<p>Loading <a href="${escHtml(pageUrl)}">${escHtml(title)}</a>...</p>
</body>
</html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).send(html)
}
