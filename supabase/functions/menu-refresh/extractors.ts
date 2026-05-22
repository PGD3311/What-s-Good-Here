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

// Tokens collapsed away during normalization. Glue words plus dietary
// shorthand letters that belong in dietary_tags, not the name.
const NORMALIZE_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'with', 'of', 'on', 'in', 'or', 'over', 'n',
  'gf', 'df', 'v', 've', 'vg', 'vgn',
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
// PRESERVE quantity/size info like "(3)", "(10 pc)", "(7-8 oz)". Identity-
// bearing parentheticals (counts, sizes, weights) should stay; identity-
// neutral parentheticals (region tags, descriptive notes) get stripped.
const NUMERIC_PAREN_RE = /\([^)]*\d[^)]*\)/g
const ANY_PAREN_RE = /\([^)]*\)/g

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

  // Step 2: protect parentheticals containing digits (quantity/size info
  // like "(3)" or "(10 pc)") by collapsing their contents into a single
  // identity token before stripping other parens. We replace e.g.
  // "Tacos (3)" with "tacos qty3"; quantity differences then survive
  // the rest of the pipeline.
  const protectedParens = lowered.replace(NUMERIC_PAREN_RE, (m) => {
    const digits = m.match(/\d+/g)?.join('-') ?? ''
    return ` qty${digits} `
  })

  // Step 3: strip remaining (non-numeric) parentheticals, asterisks,
  // apostrophes, and collapse punctuation.
  const cleaned = protectedParens
    .replace(ANY_PAREN_RE, ' ')
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
