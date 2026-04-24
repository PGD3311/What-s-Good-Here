/**
 * Menu Candidate Discovery + Scoring
 *
 * Find every asset on a page that COULD be a food menu, score by how likely
 * it is to be one, and let the extractor try the best candidates first
 * regardless of format. This avoids hard-coding "PDFs before images" — when
 * a restaurant puts food menus as PNGs and only beverage menus as PDFs
 * (e.g. Shy Bird), the image score wins and food extraction succeeds.
 *
 * Scoring: positive keywords (menu/food/dinner/lunch/brunch/breakfast)
 * combine additively with negative keywords (drinks/beverage/cocktail/
 * wine/allergen/giftcard/logo/banner). URLs are decoded before scoring so
 * randomized CDN prefixes still expose the human filename
 * (e.g. /CLy6aX..._Dinner%20Menu%20-%20Digital.png → "Dinner Menu Digital").
 */

export type CandidateType = 'pdf' | 'image'

export interface MenuCandidate {
  url: string
  type: CandidateType
  score: number
  source: 'href' | 'src' | 'srcset' | 'data-src' | 'generic'
  evidence: string
}

interface KeywordWeight {
  pattern: RegExp
  weight: number
}

const POSITIVE_KEYWORDS: KeywordWeight[] = [
  { pattern: /\bmenus?\b/i, weight: 5 },
  { pattern: /\bdinner\b/i, weight: 4 },
  { pattern: /\blunch\b/i, weight: 4 },
  { pattern: /\bbreakfast\b/i, weight: 4 },
  { pattern: /\bbrunch\b/i, weight: 4 },
  { pattern: /\bfood\b/i, weight: 3 },
  { pattern: /\ball[\s-]?day\b/i, weight: 3 },
  { pattern: /\bentrees?\b/i, weight: 2 },
  { pattern: /\bseafood\b/i, weight: 2 },
  { pattern: /\braw[\s-]?bar\b/i, weight: 2 },
  { pattern: /\bappetizers?\b/i, weight: 2 },
]

const NEGATIVE_KEYWORDS: KeywordWeight[] = [
  { pattern: /\ballergens?\b/i, weight: -8 },
  { pattern: /\bnutrition(al)?\b/i, weight: -6 },
  { pattern: /\bgift[\s-]?cards?\b/i, weight: -8 },
  { pattern: /\bgiftcards?\b/i, weight: -8 },
  { pattern: /\bdrinks?\b/i, weight: -6 },
  { pattern: /\bbeverages?\b/i, weight: -6 },
  { pattern: /\bcocktails?\b/i, weight: -6 },
  { pattern: /\bwines?\b/i, weight: -5 },
  { pattern: /\bbeers?\b/i, weight: -5 },
  { pattern: /\bspirits?\b/i, weight: -5 },
  { pattern: /\bcatering\b/i, weight: -4 },
  { pattern: /\bprivate[\s-]?events?\b/i, weight: -6 },
  { pattern: /\bevents?\b/i, weight: -2 },
  { pattern: /\bkids?\b/i, weight: -2 },
  // Legal / HR docs — old extractPdfMenuUrls hard-rejected these. Keep them
  // strongly negative so /privacy-policy.pdf, /job-application.pdf, etc. fail
  // the score >= 0 PDF gate.
  { pattern: /\bterms\b/i, weight: -10 },
  { pattern: /\bprivacy\b/i, weight: -10 },
  { pattern: /\bpolicy\b/i, weight: -8 },
  { pattern: /\bapplication\b/i, weight: -8 },
  { pattern: /\bemployment\b/i, weight: -10 },
  { pattern: /\bjob\b/i, weight: -8 },
  { pattern: /\bcontract\b/i, weight: -8 },
  { pattern: /\bwaiver\b/i, weight: -10 },
  { pattern: /\brules\b/i, weight: -6 },
  // Filename noise — these never name a food menu
  { pattern: /\blogo\b/i, weight: -10 },
  { pattern: /\bfavicon\b/i, weight: -10 },
  { pattern: /\bicon\b/i, weight: -8 },
  { pattern: /\bheader\b/i, weight: -8 },
  { pattern: /\bbanner\b/i, weight: -8 },
  { pattern: /\bhero\b/i, weight: -8 },
  { pattern: /\bavatar\b/i, weight: -8 },
  { pattern: /\bthumbnail\b/i, weight: -6 },
  { pattern: /\bgallery\b/i, weight: -6 },
  { pattern: /\bpress\b/i, weight: -4 },
]

const PDF_EXT = /\.pdf(\?|#|$)/i
const IMAGE_EXT = /\.(png|jpe?g|webp)(\?|#|$)/i

function classifyType(url: string): CandidateType | null {
  if (PDF_EXT.test(url)) return 'pdf'
  if (IMAGE_EXT.test(url)) return 'image'
  return null
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

// CDN filenames glue words with `_` (e.g. `..._Dinner_Menu_Digital.png`).
// Underscore is a regex word-char, so `\bdinner\b` won't match between `_D`.
// Normalizing to spaces lets the keyword regexes work naturally.
function normalize(s: string): string {
  return safeDecode(s).replace(/_/g, ' ')
}

export function scoreCandidate(url: string, context: string = ''): { score: number; evidence: string } {
  const decoded = `${normalize(url)} ${normalize(context)}`
  let score = 0
  const hits: string[] = []
  for (const { pattern, weight } of POSITIVE_KEYWORDS) {
    if (pattern.test(decoded)) {
      score += weight
      hits.push(`+${weight}:${pattern.source}`)
    }
  }
  for (const { pattern, weight } of NEGATIVE_KEYWORDS) {
    if (pattern.test(decoded)) {
      score += weight
      hits.push(`${weight}:${pattern.source}`)
    }
  }
  return { score, evidence: hits.join(' ') }
}

interface RawMatch {
  url: string
  source: MenuCandidate['source']
  context: string
}

function absolutize(url: string, base: URL): string | null {
  try {
    return new URL(url, base).href
  } catch {
    return null
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function collectInnerAlt(innerHtml: string): string {
  const alts: string[] = []
  const altRegex = /\salt=["']([^"']*)["']/gi
  let m
  while ((m = altRegex.exec(innerHtml)) !== null) {
    if (m[1]) alts.push(m[1])
  }
  return alts.join(' ')
}

function extractRawMatches(html: string, baseUrl: string): RawMatch[] {
  const base = new URL(baseUrl)
  const seen = new Set<string>()
  const matches: RawMatch[] = []

  const push = (url: string | null, source: MenuCandidate['source'], context: string) => {
    if (!url) return
    if (seen.has(url)) return
    seen.add(url)
    matches.push({ url, source, context })
  }

  // <a href> — anchor text + alt of any inner <img> contribute context.
  // Captures full href attribute (preserves ?query and #hash for signed URLs).
  const anchorRegex = /<a\b[^>]*\shref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = anchorRegex.exec(html)) !== null) {
    const text = stripTags(m[2]).slice(0, 200)
    const innerAlt = collectInnerAlt(m[2]).slice(0, 200)
    push(absolutize(m[1], base), 'href', `${text} ${innerAlt}`.trim())
  }

  // <img> — parse whole tag once. alt/title carry the human label and apply
  // to all URLs in the tag (src, data-src, every srcset entry).
  const imgRegex = /<img\b[^>]*?>/gi
  while ((m = imgRegex.exec(html)) !== null) {
    const tag = m[0]
    const alt = tag.match(/\salt=["']([^"']*)["']/i)?.[1] || ''
    const title = tag.match(/\stitle=["']([^"']*)["']/i)?.[1] || ''
    const context = `${alt} ${title}`.trim()
    const src = tag.match(/\ssrc=["']([^"']+)["']/i)?.[1]
    const dataSrc = tag.match(/\sdata-src=["']([^"']+)["']/i)?.[1]
    const srcset = tag.match(/\ssrcset=["']([^"']+)["']/i)?.[1]
    if (src) push(absolutize(src, base), 'src', context)
    if (dataSrc) push(absolutize(dataSrc, base), 'data-src', context)
    if (srcset) {
      // srcset format: "url1 1x, url2 2x" or "url1 320w, url2 640w"
      for (const entry of srcset.split(',')) {
        const url = entry.trim().split(/\s+/)[0]
        if (url) push(absolutize(url, base), 'srcset', context)
      }
    }
  }

  // Catch-all for href/src/data attributes outside <a> and <img> (<link>, <object>,
  // <source>, JS strings). Capture the FULL attribute value so query strings and
  // anchors survive (signed URLs need ?token= preserved to be fetchable).
  const generic = /(?:href|src|data)=["']([^"']+\.(?:pdf|png|jpe?g|webp)[^"']*)["']/gi
  while ((m = generic.exec(html)) !== null) {
    push(absolutize(m[1], base), 'generic', '')
  }

  return matches
}

// Path patterns that name a sub-menu page (Webflow / WordPress sites often
// split their menu across /brunch, /lunch, /dinner, etc.). Anchor regex lets
// us match `/brunch`, `/our-brunch`, `/brunch-menu`, but not `/brunch-recipes`.
const SUB_MENU_PATH_PATTERNS = [
  /\/(?:[\w-]*-)?brunch(?:-menu)?\/?$/i,
  /\/(?:[\w-]*-)?lunch(?:-menu)?\/?$/i,
  /\/(?:[\w-]*-)?dinner(?:-menu)?\/?$/i,
  /\/(?:[\w-]*-)?breakfast(?:-menu)?\/?$/i,
  /\/(?:[\w-]*-)?menu(?:-\d+)?\/?$/i,  // /menu-1, /our-menu — but only as standalone path
]

/**
 * Find sub-menu page URLs on a parent menu page. Used as Pattern 1 fallback
 * when the menu page itself yielded no dishes — many restaurants split their
 * menu across /brunch, /lunch, /dinner instead of putting it all on /menu.
 *
 * Same-origin only (don't follow external links). Capped to keep cost bounded.
 */
export function findSubMenuPages(html: string, baseUrl: string, max = 4): string[] {
  const base = new URL(baseUrl)
  const baseNormalized = base.origin + base.pathname  // strip query/hash for self-link check
  const found = new Set<string>()
  const out: string[] = []
  const anchorRegex = /<a\b[^>]*\shref=["']([^"']+)["']/gi
  let m
  while ((m = anchorRegex.exec(html)) !== null) {
    let absolute: URL
    try {
      absolute = new URL(m[1], base)
    } catch {
      continue
    }
    if (absolute.origin !== base.origin) continue
    const normalized = absolute.origin + absolute.pathname  // drop ?query #hash
    if (normalized === baseNormalized) continue  // skip self-links (compare normalized)
    if (!SUB_MENU_PATH_PATTERNS.some(p => p.test(absolute.pathname))) continue
    if (found.has(normalized)) continue
    found.add(normalized)
    out.push(normalized)
    if (out.length >= max) break
  }
  return out
}

/**
 * Discover and score every menu candidate on the page, sorted by descending score.
 *
 * Threshold is asymmetric by type:
 * - PDFs pass with score >= 0 (PDFs on restaurant sites are mostly menus; the old
 *   path took every PDF except obvious negatives like terms/giftcards). This keeps
 *   us from regressing on opaque CDN URLs like /uploads/menu-83fa.pdf.
 * - Images require score > 0 (vision is per-pixel-token expensive; without a real
 *   menu signal we'd burn budget on logos/heroes/galleries).
 *
 * Caller decides per-type caps.
 */
export function discoverMenuCandidates(html: string, baseUrl: string): MenuCandidate[] {
  const raw = extractRawMatches(html, baseUrl)
  const candidates: MenuCandidate[] = []
  for (const r of raw) {
    const type = classifyType(r.url)
    if (!type) continue
    const { score, evidence } = scoreCandidate(r.url, r.context)
    const passes = type === 'pdf' ? score >= 0 : score > 0
    if (!passes) continue
    candidates.push({ url: r.url, type, score, source: r.source, evidence })
  }
  // Sort by score desc; for tie-breaks (e.g. multiple score-0 PDFs) preserve order.
  candidates.sort((a, b) => b.score - a.score)
  return candidates
}
