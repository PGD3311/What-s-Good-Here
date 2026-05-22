// Pure sanitization helpers for menu-refresh Sonnet output.
// No Deno imports here — kept dependency-free so the file is importable by
// both the Deno edge function and Node/Vitest unit tests.
// Spec: docs/superpowers/specs/2026-05-18-dish-descriptions-dietary-tags-design.md

export const ALLOWED_DIETARY_TAGS = ['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'nut_free'] as const
export type AllowedDietaryTag = typeof ALLOWED_DIETARY_TAGS[number]

export function sanitizeDietaryTags(raw: unknown): AllowedDietaryTag[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<AllowedDietaryTag>()
  for (const t of raw) {
    if (typeof t === 'string' && (ALLOWED_DIETARY_TAGS as readonly string[]).includes(t)) {
      seen.add(t as AllowedDietaryTag)
    }
  }
  return Array.from(seen)
}

export function sanitizeDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length <= 150) return trimmed
  const capped = trimmed.slice(0, 150)
  const lastSpace = capped.lastIndexOf(' ')
  const result = lastSpace >= 80 ? capped.slice(0, lastSpace) : capped
  return result.trimEnd().replace(/[,;:.·•\-–—]+$/, '')
}

// Order-insensitive string-array equality for change-detection on dietary_tags.
// Sanitized tags are already deduped, so this is a clean set-comparison.
export function sortedArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return false
  }
  return true
}

// Glue words collapsed away during normalization. Dietary shorthand
// letters (GF, V, VG, etc.) are intentionally NOT in this list — they
// are price-bearing identity tokens in practice (e.g., "GF Boston Cream"
// at $4 vs "Boston Cream" at $3.50 are different SKUs, not the same dish
// with a redundant marker).
const NORMALIZE_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'with', 'of', 'on', 'in', 'or', 'over', 'n',
])

// Common menu-code abbreviations that get expanded so "Chix Wrap" matches
// "Chicken Wrap". Conservative list — only widely-used menu shorthand.
const NORMALIZE_ABBREV: Record<string, string> = {
  chix: 'chicken',
  chkn: 'chicken',
  brgr: 'burger',
  burg: 'burger',
}

// Tokens that are redundant inside a name because they restate the dish's
// category. Keyed by the category column value. Add carefully — anything
// listed here will collapse "Foo X" and "Foo" into the same key when
// category=X. Only include words specific enough that they uniquely restate
// the category (e.g., 'donut' for category=donuts is safe; 'roll' for
// category=lobster-roll is too broad because lots of dishes are rolls).
const CATEGORY_REDUNDANT_WORDS: Record<string, string[]> = {
  donuts: ['donut', 'donuts'],
  burger: ['burger', 'burgers'],
  pizza: ['pizza', 'pizzas'],
  salad: ['salad', 'salads'],
  sandwich: ['sandwich', 'sandwiches'],
  'fish-sandwich': ['sandwich', 'sandwiches'],
  taco: ['taco', 'tacos'],
  burrito: ['burrito', 'burritos'],
  enchiladas: ['enchilada', 'enchiladas'],
  fries: ['fries'],
  'onion rings': ['rings'],
  pasta: ['pasta', 'pastas'],
  wrap: ['wrap', 'wraps'],
  wings: ['wings', 'wing'],
  cookie: ['cookie', 'cookies'],
}

// Matches parenthetical groups that contain at least one digit — used to
// collapse quantity/size info like "(3)" or "(10 pc)" into a single qty
// token so different counts stay distinct. Non-numeric parentheticals
// (e.g., "(Shrimp)", "(Half Dozen)", "(Ghana)") are LEFT IN PLACE — we
// can't reliably distinguish identity-neutral region tags from identity-
// bearing modifiers like protein options or portion sizes without a
// knowledge base. Erring on the side of "keep separate" prevents the
// upsert from silently merging different SKUs at different prices.
const NUMERIC_PAREN_RE = /\([^)]*\d[^)]*\)/g

/**
 * Build a normalized matching key for a dish name. Two dishes with the same
 * normalized key (within the same restaurant and category) should be treated
 * as the same dish for upsert purposes.
 *
 * Conservative — strips only structural noise (punctuation, parenthetical
 * tags, asterisks, dietary shorthand, redundant category words, common
 * menu-code abbreviations). Token order is normalized but content tokens
 * (sizes, modifiers, ingredients) are preserved, so "Half Roast Chicken"
 * and "Whole Roast Chicken" stay distinct.
 */
export function normalizeDishKey(rawName: string, category: string | null | undefined): string {
  if (!rawName) return ''
  const cat = (category || '').toLowerCase().trim()

  // Step 1: lowercase + Unicode-normalize so "café" matches "cafe" and
  // "jalapeño" matches "jalapeno". U+0300–U+036F is the combining-
  // diacritical-marks block, separated out by NFKD decomposition.
  const lowered = rawName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')

  // Step 2: collapse numeric parens to qty tokens so quantity differences
  // ("(3)" vs "(6)") survive the rest of the pipeline. Non-numeric parens
  // are LEFT IN PLACE — their contents become regular tokens that
  // differentiate variants like "(Shrimp)" vs "(Steak)" or "(Half Dozen)"
  // vs "(Dozen)".
  const protectedParens = lowered.replace(NUMERIC_PAREN_RE, (m) => {
    const digits = m.match(/\d+/g)?.join('-') ?? ''
    return ` qty${digits} `
  })

  // Step 3: strip asterisks, apostrophes, and remaining punctuation.
  // Paren BRACKETS are stripped here (punctuation), but their contents
  // were already preserved as plain tokens by step 2 (for numeric) or
  // left in place (for non-numeric).
  const cleaned = protectedParens
    .replace(/[*]/g, ' ')
    .replace(/['’`"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return ''

  const redundant = new Set(CATEGORY_REDUNDANT_WORDS[cat] || [])

  const tokens = cleaned
    .split(' ')
    .map((t) => NORMALIZE_ABBREV[t] ?? t)
    .filter((t) => t && !NORMALIZE_STOPWORDS.has(t))

  const filtered = tokens.filter((t) => !redundant.has(t))

  // If stripping category words would leave the name empty (rare — a dish
  // literally named "Donut" in category=donuts), fall back to the unfiltered
  // tokens so the key isn't ambiguous.
  const final = filtered.length > 0 ? filtered : tokens

  return final.slice().sort().join(' ')
}
