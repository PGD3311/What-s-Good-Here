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

export function scoreCandidate(url: string, context: string = ''): { score: number; evidence: string; hasNegative: boolean } {
  const decoded = `${normalize(url)} ${normalize(context)}`
  let score = 0
  let hasNegative = false
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
      hasNegative = true
      hits.push(`${weight}:${pattern.source}`)
    }
  }
  return { score, evidence: hits.join(' '), hasNegative }
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
  /\/(?:[\w-]*-)?menus?(?:-\d+)?\/?$/i,  // /menu, /menus, /menu-1, /our-menu, /boston-menus — but only as standalone path
]

// Anchor-text fallback for sites whose URLs don't follow the convention above —
// ASP.NET (Default.aspx?p=…), classic PHP (index.php?id=…), Vue/React route
// hashes, etc. Tighter than "contains a meal word": require either an explicit
// 'menu' token OR a standalone meal name (≤3 trimmed tokens), so that
// 'Lunch Club' / 'Birthday Brunch' / 'Dinner Party' don't become menu URLs.
// Decode &amp; before matching so `Lunch &amp; Dinner` reaches the multi-meal regex.
const SUB_MENU_ANCHOR_PATTERNS = [
  /\bmenus?\b/i,                                              // 'Menu', 'Menus', 'Lunch Menu', 'Our menu'
  /^\s*(brunch|lunch|dinner|breakfast)\s*$/i,                 // 'Lunch' alone
  /^\s*(brunch|lunch|dinner|breakfast)\s+(?:&|and|\+|\/)\s*(brunch|lunch|dinner|breakfast)\s*$/i,  // 'Lunch & Dinner', 'Lunch and Dinner', 'Lunch / Dinner'
]

// Anchor text that explicitly disqualifies a link even if it contains a menu
// word ("Drinks Menu" / "Catering Menu" / "Gift Cards Menu" / "Wine List").
// Applied to BOTH path-match and anchor-text-match modes so a /menu URL with
// text "Drinks Menu" doesn't sneak through.
const SUB_MENU_NEGATIVE_TEXT = [
  /\bbeverages?\b/i,
  /\bdrinks?\b/i,
  /\bcocktails?\b/i,
  /\bwines?\b/i,
  /\bspirits?\b/i,
  /\bbeers?\b/i,
  /\bbar\b/i,
  /\bhappy[\s-]?hour\b/i,
  /\bcatering\b/i,
  /\bevents?\b/i,
  /\bgift[\s-]?cards?\b/i,
  /\bprivate\b/i,
]

/**
 * Find sub-menu page URLs on a parent menu page. Used as Pattern 1 fallback
 * when the menu page itself yielded no dishes — many restaurants split their
 * menu across /brunch, /lunch, /dinner instead of putting it all on /menu.
 *
 * Two match strategies:
 *  - URL-path match (existing): `/brunch`, `/our-dinner`, etc. Dedup/output
 *    strip query/hash because the path uniquely identifies the resource.
 *  - Anchor-text match (new): for non-conventional URLs (Default.aspx?p=164,
 *    /page?id=42) where the query string IS the resource identifier. The
 *    full URL is preserved through dedup and output.
 *
 * Same-origin only. PDFs/images skipped (those are asset candidates).
 * Capped to keep cost bounded.
 */
export function findSubMenuPages(html: string, baseUrl: string, max = 4): string[] {
  const base = new URL(baseUrl)
  // Compute the base's dedup/self-link key the SAME way we compute candidate
  // targets below, so a link to the same logical page (under either matching
  // mode) is correctly recognised as a self-reference and skipped.
  const baseIsPathConventional = SUB_MENU_PATH_PATTERNS.some(p => p.test(base.pathname))
  const baseKey = baseIsPathConventional
    ? base.origin + base.pathname                                // /menu?ref=nav and /menu are the same page
    : base.origin + base.pathname + base.search                  // /Default.aspx?p=164 and /Default.aspx?p=200 are different
  const found = new Set<string>([baseKey])
  const out: string[] = []
  const anchorRegex = /<a\b[^>]*\shref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = anchorRegex.exec(html)) !== null) {
    let absolute: URL
    try {
      absolute = new URL(m[1], base)
    } catch {
      continue
    }
    if (absolute.origin !== base.origin) continue
    if (PDF_EXT.test(absolute.href) || IMAGE_EXT.test(absolute.href)) continue  // assets, not sub-pages

    // Decode &amp; / &#38; so multi-meal anchors like "Lunch &amp; Dinner"
    // reach the regex unaltered. stripTags doesn't decode entities.
    const innerText = stripTags(m[2]).replace(/&amp;/gi, '&').replace(/&#38;/g, '&').slice(0, 100)
    if (SUB_MENU_NEGATIVE_TEXT.some(p => p.test(innerText))) continue  // disqualify in BOTH modes

    const pathMatches = SUB_MENU_PATH_PATTERNS.some(p => p.test(absolute.pathname))
    let target: string
    if (pathMatches) {
      target = absolute.origin + absolute.pathname  // drop query/hash — path uniquely identifies the resource
    } else {
      const textMatches = SUB_MENU_ANCHOR_PATTERNS.some(p => p.test(innerText))
      if (!textMatches) continue
      // Preserve query (likely load-bearing) but DROP hash (fragments only
      // matter to the browser, not the fetcher; would otherwise burn `max`
      // slots on /page#a + /page#b duplicates).
      target = absolute.origin + absolute.pathname + absolute.search
    }

    if (found.has(target)) continue
    found.add(target)
    out.push(target)
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
 * Menu-context fallback (last resort): if the base URL pathname is clearly a
 * menu page (matches SUB_MENU_PATH_PATTERNS) AND no image cleared the > 0
 * threshold, promote the top neutral-score image (score === 0, no negative
 * keywords). Catches restaurants who upload their menu as a screenshot to
 * Squarespace/Wix with a generic filename like `Screen+Shot+2025-05-20.png`
 * that has no menu keyword for the scorer to latch onto. Capped to the single
 * top neutral image so we don't burn vision budget on gallery pages.
 *
 * Caller decides per-type caps.
 */
export function discoverMenuCandidates(html: string, baseUrl: string): MenuCandidate[] {
  const raw = extractRawMatches(html, baseUrl)
  const candidates: MenuCandidate[] = []
  const neutralImages: MenuCandidate[] = []
  for (const r of raw) {
    const type = classifyType(r.url)
    if (!type) continue
    const { score, evidence, hasNegative } = scoreCandidate(r.url, r.context)
    const passes = type === 'pdf' ? score >= 0 : score > 0
    if (passes) {
      candidates.push({ url: r.url, type, score, source: r.source, evidence })
    } else if (type === 'image' && score === 0 && !hasNegative) {
      // Truly unsignaled image (no positive keywords AND no negative keywords
      // matched). Eligible for the menu-context fallback below. Explicit
      // hasNegative check matters because score === 0 could also come from
      // positive+negative cancellation (menu+giftcards = +5-8 = -3 nope,
      // but menu+food+giftcards = +5+3-8 = 0 — we DO NOT want to try those).
      neutralImages.push({ url: r.url, type, score, source: r.source, evidence })
    }
  }

  // Only fire fallback when there are NO other candidates of any type. If a
  // scored image or even a score-0 PDF exists, prefer those — they're either
  // higher-confidence (scored image) or cheaper per token (PDF). We don't
  // want to slot a vision-mode neutral image ahead of a real candidate on
  // tie-break inside tryAssetExtraction.
  if (candidates.length === 0 && neutralImages.length > 0) {
    try {
      const basePath = new URL(baseUrl).pathname
      if (SUB_MENU_PATH_PATTERNS.some(p => p.test(basePath))) {
        // Top neutral in extractor order (anchors → imgs → generic attrs).
        // Don't burn vision budget on gallery pages — single image only.
        candidates.push(neutralImages[0])
      }
    } catch {
      // Bad baseUrl — skip the fallback rather than crash.
    }
  }

  // Sort by score desc; for tie-breaks (e.g. multiple score-0 PDFs) preserve order.
  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

/**
 * Find iframes that look like embedded third-party menu services.
 *
 * Some restaurants (e.g. State Road via checkle.menu, others via PopMenu /
 * SinglePlatform / Toast) embed their menu in a cross-origin iframe. The
 * parent page has almost no text content; the iframe URL serves the actual
 * menu HTML. findSubMenuPages skips iframes (it scans anchor tags) and
 * filters cross-origin, so those menus never get extracted.
 *
 * Match strategy: iframe src matches a known menu-service host OR contains
 * "menu" in its URL pathname. Cross-origin allowed — iframes intentionally
 * embed third-party content. Protocol-relative srcs (`//host/path`) are
 * upgraded to https.
 *
 * Security: SSRF-resilient. Scripts/comments are stripped before scanning
 * so injected iframe strings inside <script> or <!-- --> can't smuggle a URL.
 * Hostnames matching loopback / private CIDRs / link-local / cloud metadata
 * are rejected to prevent server-side request forgery via fetchRawHtml.
 *
 * Capped at `max` to keep cost bounded.
 */
// Exact apex hosts. Matching is exact-equality OR proper-subdomain (host
// ends with `.<apex>`). Substring matching would let attacker-controlled
// hostnames like `popmenu.com.evil` slip through as "trusted".
const KNOWN_MENU_IFRAME_HOSTS: string[] = [
  'checkle.menu',
  'popmenu.com',
  'singleplatform.com',
  'toasttab.com',
  'getbento.com',     // BentoBox's customer-site domain
  'menustar.com',
]

/**
 * Used by the iframe-render gate in index.ts: we only spend Browserless
 * cycles re-fetching iframe URLs that point at known menu-service hosts.
 * This both bounds spend and limits the SSRF surface — an attacker-controlled
 * iframe pointing at a public URL that 302s to internal infra can't trick
 * us into having Browserless render it.
 *
 * Matches exact apex OR proper subdomain only. `popmenu.com` → true,
 * `order.popmenu.com` → true, `popmenu.com.evil` → false, `xpopmenu.com` →
 * false. Hostname is normalized (lowercase, trailing-dot stripped) to match
 * isBlockedHostname's normalization.
 */
export function isKnownMenuIframeHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.+$/, '')
  return KNOWN_MENU_IFRAME_HOSTS.some(apex => lower === apex || lower.endsWith('.' + apex))
}

// isBlockedHostname (the SSRF host guard) now lives in the shared module so
// restaurant-scraper and menu-refresh share one implementation. Re-exported here
// so existing importers (fetchRawHtml, findMenuIframes below, the test suite)
// keep working unchanged.
import { isBlockedHostname } from '../_shared/ssrf.ts'
export { isBlockedHostname }

// Strip content the regex shouldn't peek into: HTML comments, script/style
// bodies, noscript, and inert text containers (<template>, <textarea>) that
// hold literal HTML text the browser never instantiates. Without this, an
// iframe-shaped string inside any of these would match the regex.
function stripNonRenderedContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, '')
    .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi, '')
}

export function findMenuIframes(html: string, max = 2): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const sanitized = stripNonRenderedContent(html)
  const iframeRegex = /<iframe\b[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi
  let m
  while ((m = iframeRegex.exec(sanitized)) !== null) {
    let src = m[1].trim()
    if (src.startsWith('//')) src = 'https:' + src
    if (!/^https?:\/\//i.test(src)) continue
    if (seen.has(src)) continue

    let parsed: URL
    try {
      parsed = new URL(src)
    } catch {
      continue
    }
    if (isBlockedHostname(parsed.hostname)) continue

    // Reuse the same exact-or-subdomain logic via isKnownMenuIframeHost so
    // discovery and the Browserless render gate stay in sync.
    const isKnown = isKnownMenuIframeHost(parsed.hostname)
    const hasMenuKeyword = /\bmenus?\b/i.test(parsed.pathname)
    if (!isKnown && !hasMenuKeyword) continue

    seen.add(src)
    out.push(src)
    if (out.length >= max) break
  }
  return out
}
