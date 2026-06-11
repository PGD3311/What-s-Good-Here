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

function readPrompt(path: string): string {
  const src = Deno.readTextFileSync(path)
  const m = src.match(PROMPT_RE)
  assert(m, `Could not locate MENU_EXTRACTION_PROMPT in ${path} — extraction regex needs updating`)
  return m[1]
}

Deno.test('menu-xray extraction prompt matches menu-refresh (modulo the deliberate not-a-menu rule)', () => {
  const refresh = readPrompt('supabase/functions/menu-refresh/index.ts')
  const xray = readPrompt('supabase/functions/menu-xray/lib.ts')

  assert(
    xray.includes(XRAY_EXTRA_RULE),
    'menu-xray lost its not-a-menu rule — scans of non-menu photos will hallucinate dishes',
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
  const a = Deno.readTextFileSync('supabase/functions/menu-refresh/extractors.ts').match(FN_RE)
  const b = Deno.readTextFileSync('supabase/functions/menu-xray/lib.ts').match(FN_RE)
  assert(a && b, 'Could not locate normalizeDishKey in one of the copies — regex needs updating')
  assertEquals(
    b[0],
    a[0],
    'normalizeDishKey drifted between menu-refresh/extractors.ts and menu-xray/lib.ts — ' +
      'dedupe behavior must stay identical or scans and cron will disagree on duplicates.',
  )
})
