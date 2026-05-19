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
  return trimmed.length > 80 ? trimmed.slice(0, 80) : trimmed
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
