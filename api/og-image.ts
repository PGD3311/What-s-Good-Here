import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * Dynamic OG Image Generator
 *
 * Generates an SVG-based OG image for dishes and restaurants.
 * Returns an SVG that social crawlers render as the preview image.
 *
 * Usage:
 *   /api/og-image?type=dish&id=uuid
 *   /api/og-image?type=restaurant&id=uuid
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { type, id } = req.query

  if (!type || !id || typeof type !== 'string' || typeof id !== 'string') {
    return res.status(400).json({ error: 'type and id required' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  let title = "What's Good Here"
  let subtitle = 'Find the best dishes near you'
  let rating = ''
  let badge = ''

  try {
    if (type === 'dish') {
      const { data: dish } = await supabase
        .from('dishes')
        .select('name, category, price, photo_url, restaurant_id, avg_rating, total_votes')
        .eq('id', id)
        .maybeSingle()

      if (dish) {
        title = dish.name

        // Get restaurant name
        const { data: restaurant } = await supabase
          .from('restaurants')
          .select('name, town')
          .eq('id', dish.restaurant_id)
          .maybeSingle()

        subtitle = restaurant ? `${restaurant.name} · ${restaurant.town || ''}` : ''

        // Rating-first stats (no binary vote)
        const { count: totalVotes } = await supabase
          .from('votes')
          .select('*', { count: 'exact', head: true })
          .eq('dish_id', id)

        const votes = dish.total_votes ?? totalVotes ?? 0
        const avg = dish.avg_rating != null ? Number(dish.avg_rating) : null

        if (votes >= 5 && avg != null) {
          rating = `${avg.toFixed(1)}/10 · ${votes} ratings`
          if (avg >= 9.0) badge = 'GREAT'
          else if (avg >= 8.0) badge = 'Great Here'
        } else if (votes > 0) {
          rating = `${votes} rating${votes === 1 ? '' : 's'}`
        }

        if (dish.price) {
          subtitle += ` · $${dish.price}`
        }
      }
    } else if (type === 'restaurant') {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('name, town, address')
        .eq('id', id)
        .maybeSingle()

      if (restaurant) {
        title = restaurant.name
        subtitle = restaurant.town || restaurant.address || ''

        // Get dish count
        const { count } = await supabase
          .from('dishes')
          .select('*', { count: 'exact', head: true })
          .eq('restaurant_id', id)

        if (count) {
          rating = `${count} dishes ranked`
        }
      }
    }
  } catch {
    // Fall through with defaults
  }

  // Generate SVG OG image (1200x630 is the standard)
  const svg = generateOgSvg(title, subtitle, rating, badge)

  res.setHeader('Content-Type', 'image/svg+xml')
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).send(svg)
}

function generateOgSvg(title: string, subtitle: string, rating: string, badge: string): string {
  // Escape XML entities
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  // Truncate title if too long
  const displayTitle = title.length > 40 ? title.slice(0, 37) + '...' : title
  const titleSize = displayTitle.length > 25 ? 48 : 56

  // Appetite palette: warm stone bg, near-black ink, amber accent, coral primary
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <!-- Background -->
  <rect width="1200" height="630" fill="#F0ECE8"/>

  <!-- Top accent strip -->
  <rect x="0" y="0" width="1200" height="8" fill="#E4440A"/>
  <!-- Bottom accent strip -->
  <rect x="0" y="622" width="1200" height="8" fill="#C48A12"/>

  <!-- Brand wordmark -->
  <text x="80" y="80" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="800" fill="#1A1A1A" letter-spacing="1">
    WHAT'S <tspan fill="#C48A12">GOOD</tspan> HERE
  </text>

  ${badge ? `
  <!-- Badge -->
  <rect x="80" y="140" width="${badge.length * 18 + 40}" height="44" rx="22" fill="#E4440A" opacity="0.12"/>
  <text x="100" y="168" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#E4440A" letter-spacing="1.5">${esc(badge)}</text>
  ` : ''}

  <!-- Main title -->
  <text x="80" y="${badge ? 250 : 220}" font-family="system-ui, -apple-system, sans-serif" font-size="${titleSize}" font-weight="800" fill="#1A1A1A">
    ${esc(displayTitle)}
  </text>

  <!-- Subtitle -->
  <text x="80" y="${badge ? 305 : 275}" font-family="system-ui, -apple-system, sans-serif" font-size="26" fill="#555555">
    ${esc(subtitle)}
  </text>

  ${rating ? `
  <!-- Rating -->
  <text x="80" y="${badge ? 370 : 340}" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="700" fill="#16A34A">
    ${esc(rating)}
  </text>
  ` : ''}

  <!-- Bottom domain -->
  <text x="80" y="580" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="#999999" letter-spacing="2">
    WGHAPP.COM
  </text>
</svg>`
}
