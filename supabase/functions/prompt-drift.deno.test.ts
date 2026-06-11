// Prompt-drift tripwire. The menu-extraction prompt is deliberately COPIED into
// each self-contained edge function (dashboard deploys can't follow ../_shared
// imports). Copies are fine; SILENT drift is not — a prompt improvement in
// menu-refresh that doesn't reach menu-xray means scans extract differently
// than the cron. This test fails CI the moment any copy diverges.
//
// When the full extraction-core consolidation lands (TASKS.md), this test
// should be replaced by the shared module. Until then it IS the consolidation's
// guarantee. When PR #320 (extract-menu-from-photo) merges, add its path below.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

// Proper template-literal lexing: the prompt CONTAINS escaped backticks
// (\`V\` → \`vegetarian\`), so a lazy `[\s\S]*?` up to the next backtick
// silently truncates. Match any run of (non-backtick, non-backslash) chars
// or escape sequences, then the real closing backtick.
const PROMPT_RE = /const MENU_EXTRACTION_PROMPT = `((?:[^`\\]|\\[\s\S])*)`/
// menu-xray deliberately appends one rule the cron prompt doesn't need:
const XRAY_EXTRA_RULE =
  'If the image is NOT a menu (a person, a pet, scenery, a receipt), return exactly: {"dishes": [], "not_a_menu": true}'

// The prompt is ~16.7KB today; a capture far below that means the lexer
// truncated — and identical truncation on both sides would otherwise
// false-pass on matching prefixes.
const MIN_PROMPT_CHARS = 12000

function readPrompt(path: string): string {
  const src = Deno.readTextFileSync(path)
  const m = src.match(PROMPT_RE)
  assert(m, `Could not locate MENU_EXTRACTION_PROMPT in ${path} — extraction regex needs updating`)
  assert(
    m[1].length >= MIN_PROMPT_CHARS,
    `Prompt capture from ${path} is suspiciously short (${m[1].length} chars) — lexer truncation?`,
  )
  assert(
    !m[1].includes('${'),
    `Prompt in ${path} now contains \${} interpolation — PROMPT_RE only lexes static literals; rework the tripwire`,
  )
  return m[1]
}

Deno.test('menu-xray extraction prompt matches menu-refresh (modulo the deliberate not-a-menu rule)', () => {
  const refresh = readPrompt('supabase/functions/menu-refresh/index.ts')
  const xray = readPrompt('supabase/functions/menu-xray/lib.ts')

  const ruleOccurrences = xray.split(XRAY_EXTRA_RULE).length - 1
  assertEquals(
    ruleOccurrences,
    1,
    'menu-xray must contain the not-a-menu rule exactly once (zero = scans of non-menu photos ' +
      'will hallucinate dishes; more than one = the replace() below strips the wrong copy)',
  )
  const xrayNormalized = xray.replace(XRAY_EXTRA_RULE, '').replace(/\n+$/, '')
  const refreshNormalized = refresh.replace(/\n+$/, '')
  assertEquals(
    xrayNormalized,
    refreshNormalized,
    'PROMPT DRIFT: menu-xray/lib.ts and menu-refresh/index.ts no longer carry the same ' +
      'extraction prompt. Whoever changed one must change both (and bump ' +
      'CURRENT_EXTRACTOR_FINGERPRINT in menu-refresh if extraction output changed). ' +
      'Or: do the extraction-core consolidation in TASKS.md and delete this test.',
  )
})

Deno.test('menu-xray normalizeDishKey matches menu-refresh extractors.ts', () => {
  const FN_RE = /export function normalizeDishKey[\s\S]*?\n}\n/
  // Tail anchor: the function's final statement. If FN_RE's lazy match ever
  // stops at an inner standalone `}` (a future if/for block), the capture
  // loses this anchor and the test fails loudly instead of comparing prefixes.
  const FN_TAIL = ".sort().join(' ')"
  const a = Deno.readTextFileSync('supabase/functions/menu-refresh/extractors.ts').match(FN_RE)
  const b = Deno.readTextFileSync('supabase/functions/menu-xray/lib.ts').match(FN_RE)
  assert(a && b, 'Could not locate normalizeDishKey in one of the copies — regex needs updating')
  assert(
    a[0].includes(FN_TAIL) && b[0].includes(FN_TAIL),
    'normalizeDishKey capture lost its tail — FN_RE stopped at an inner brace; fix the regex',
  )
  assertEquals(
    b[0],
    a[0],
    'normalizeDishKey drifted between menu-refresh/extractors.ts and menu-xray/lib.ts — ' +
      'dedupe behavior must stay identical or scans and cron will disagree on duplicates.',
  )
})
