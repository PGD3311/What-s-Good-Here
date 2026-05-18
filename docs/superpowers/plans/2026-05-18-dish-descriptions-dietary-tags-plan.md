# Dish Descriptions + Dietary Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a terse one-line `description` and a strict-label `dietary_tags[]` array to every dish, extracted by the existing menu-refresh Sonnet pipeline. Render description on the card and detail page; add a multi-select "Diet" bottom sheet filter on the homepage.

**Architecture:** Three load-bearing PRs in order — (1) schema migration + RPC signature updates (must deploy first or RPC calls fail), (2) extractor + upsert + force_all backfill flag, (3) UI (card line + detail block + Diet sheet + URL reactivity fix + client-side search extension). Followed by a manual eager backfill of all 177 production restaurants. Spec is at `docs/superpowers/specs/2026-05-18-dish-descriptions-dietary-tags-design.md` — refer to it for locked decisions; do not re-litigate.

**Tech Stack:** React 19, Vite 7, Supabase Postgres + Edge Functions (Deno), Claude Sonnet 4.6 for menu extraction, Vitest for unit tests, React Router v7.

**Standing rules per Dan:**
- Every PR through `codex-cli` before commit (per `feedback_run_each_fix_through_codex` memory)
- UI work routes through the `frontend-design` skill
- Schema changes follow schema.sql-first-then-SQL-Editor pattern per CLAUDE.md
- No direct Supabase calls from components — all data access through `src/api/`
- Logger only (`src/utils/logger.js`), never `console.*` in `src/`

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/schema.sql` | Modify | Source of truth — add columns to `dishes`, extend RPC signatures + bodies |
| `supabase/migrations/2026-05-18-dish-descriptions-and-dietary-tags.sql` | Create | Runnable migration — ALTER TABLE + indexes + CREATE OR REPLACE FUNCTION blocks |
| `src/constants/dietaryTags.js` | Create | `ALLOWED_DIETARY_TAGS`, `DIETARY_TAG_LABELS`, `DIETARY_DISCLAIMER` |
| `src/constants/dietaryTags.test.js` | Create | Sanity checks on the constants |
| `supabase/functions/menu-refresh/index.ts` | Modify | Extend `ExtractedDish` interface, prompt rules, `parseExtraction` validator, `upsertDishes` to persist new fields, add `force_all` query handling |
| `supabase/functions/menu-refresh/cms-detect.test.ts` | Modify | Add tests for output validator (description truncation, tag whitelist, null coercion) |
| `src/api/dishesApi.js` | Modify | `getRankedDishes` passes `filter_dietary_tags`; `getAllSearchable` selects `description` + `dietary_tags` |
| `src/api/dishesApi.test.js` | Modify | Tests for new param passing + new fields in result shape |
| `src/utils/dishSearch.js` | Modify | `searchDishes` matches against `description` in addition to name |
| `src/utils/dishSearch.test.js` | Modify | Tests for description-based match |
| `src/utils/dietUrlParams.js` | Create | Sanitization helper for `?diet=...` URL state |
| `src/utils/dietUrlParams.test.js` | Create | Tests for invalid/duplicate/empty handling |
| `src/pages/Map.jsx` | Modify | Replace one-shot mount-time URL read with reactive `useSearchParams` for `diet` param |
| `src/components/DishListItem.jsx` | Modify | Add 1-line description preview under restaurant/distance, null-safe |
| `src/components/DishListItem.test.jsx` | Create or modify | Test description line renders when present, omits when null |
| `src/pages/Dish.jsx` | Modify | Add description block + tag pills + disclaimer above vote slider, null-safe |
| `src/components/DietButton.jsx` | Create | Pill button next to search showing filter state (`Diet · Off` / `Diet · Vegan` / `Diet · 2 selected`) |
| `src/components/DietSheet.jsx` | Create | Modal overlay with multi-select chips, Reset + Apply buttons, disclaimer copy |
| `src/components/DietSheet.test.jsx` | Create | Test multi-select state, Reset behavior, Apply emits selection |
| `scripts/backfill-menu-descriptions.sh` | Create | Bash loop that POSTs to menu-refresh with force_all until processed:0 |

---

## PR 1 — Schema migration + RPC signature updates

### Task 1.1: Branch off main

- [ ] **Step 1:** Verify on main and clean

```bash
cd /Users/danielwalsh/.local/bin/whats-good-here
git checkout main
git pull --ff-only
git status --short
```

Expected: no modified files other than known untracked drift (.tmp/, deno.lock, ios swiftpm).

- [ ] **Step 2:** Create the feature branch

```bash
git checkout -b feat/dish-descriptions-schema
git branch --show-current
```

Expected output: `feat/dish-descriptions-schema`

### Task 1.2: Update `supabase/schema.sql` — `dishes` table

**Files:**
- Modify: `supabase/schema.sql` (around line 51, the `CREATE TABLE dishes` block)

- [ ] **Step 1:** Open the file and find the `dishes` table definition (line 51). Find the `created_at` line (currently the last column).

- [ ] **Step 2:** Insert two new column lines BEFORE `created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`:

```sql
  description TEXT,
  dietary_tags TEXT[] DEFAULT '{}',
```

The block should now end with:
```sql
  ...
  category_median_price DECIMAL(6, 2),
  description TEXT,
  dietary_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

- [ ] **Step 3:** No commit yet — `schema.sql` and the migration are committed together at Task 1.7.

### Task 1.3: Update `supabase/schema.sql` — `get_ranked_dishes` RPC

**Files:**
- Modify: `supabase/schema.sql` (around line 1067, `CREATE OR REPLACE FUNCTION get_ranked_dishes`)

- [ ] **Step 1:** In the signature, change the last param line from:

```sql
  filter_town TEXT DEFAULT NULL
)
```

To:

```sql
  filter_town TEXT DEFAULT NULL,
  filter_dietary_tags TEXT[] DEFAULT NULL
)
```

- [ ] **Step 2:** In the `RETURNS TABLE` block (immediately below), append two columns BEFORE the closing `)`:

```sql
  description TEXT,
  dietary_tags TEXT[],
```

The block ends with `order_url TEXT, description TEXT, dietary_tags TEXT[]) AS $$`.

- [ ] **Step 3:** In the `SELECT` statement inside the function body, append `, d.description, d.dietary_tags` to the column list (preserving existing column order). The dish table alias is `d` (or whatever the function uses — confirm by reading the body).

- [ ] **Step 4:** In the `WHERE` clause inside the function body, after the existing `filter_town` clause, add:

```sql
  AND (
    filter_dietary_tags IS NULL
    OR array_length(filter_dietary_tags, 1) IS NULL
    OR d.dietary_tags @> filter_dietary_tags
  )
```

### Task 1.4: Audit + extend other dish-feed RPCs

- [ ] **Step 1:** Find every dish-feed RPC that powers a UI list:

```bash
grep -n "RETURNS TABLE" supabase/schema.sql
```

- [ ] **Step 2:** For each RPC consumed by `DishListItem` or the dish detail page, perform the same surgery as Task 1.3 — add `description TEXT, dietary_tags TEXT[]` to `RETURNS TABLE` and `d.description, d.dietary_tags` to the `SELECT`. Known candidates: `get_restaurant_dishes`, `get_dish_variants`.

For `get_dish_variants` and `get_restaurant_dishes`, do NOT add the `filter_dietary_tags` param — only the new return columns. The dietary filter only applies to the main feed.

- [ ] **Step 3:** No commit yet.

### Task 1.5: Create the migration file

**Files:**
- Create: `supabase/migrations/2026-05-18-dish-descriptions-and-dietary-tags.sql`

- [ ] **Step 1:** Write the migration with the ALTER TABLE + indexes block:

```sql
-- 2026-05-18: dish descriptions + dietary tags
-- Spec: docs/superpowers/specs/2026-05-18-dish-descriptions-dietary-tags-design.md
-- Additive only. No SQL rollback needed.

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS dietary_tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS dishes_dietary_tags_idx
  ON dishes USING GIN (dietary_tags);

CREATE INDEX IF NOT EXISTS dishes_description_trgm_idx
  ON dishes USING GIN (description gin_trgm_ops);
```

- [ ] **Step 2:** Below the ALTER TABLE block, copy the COMPLETE `CREATE OR REPLACE FUNCTION get_ranked_dishes` body from `supabase/schema.sql` (the one you edited in Task 1.3). Same for `get_restaurant_dishes`, `get_dish_variants`, and any other RPC you edited in Task 1.4.

These blocks must be the full `CREATE OR REPLACE FUNCTION ... AS $$ ... $$ LANGUAGE plpgsql;` form so they can be pasted directly into the SQL Editor.

### Task 1.6: Apply migration to production database

- [ ] **Step 1:** Open Supabase Dashboard for Denis's project (`vpioftosgdkyiwvhxewy`) → SQL Editor.

- [ ] **Step 2:** Paste the contents of `supabase/migrations/2026-05-18-dish-descriptions-and-dietary-tags.sql` into a new SQL Editor query.

- [ ] **Step 3:** Run it. Expected: `Success. No rows returned.` for each block.

- [ ] **Step 4:** Verify columns exist:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'dishes'
  AND column_name IN ('description', 'dietary_tags');
```

Expected: two rows — `description TEXT NULL`, `dietary_tags ARRAY '{}'::text[]`.

- [ ] **Step 5:** Verify indexes:

```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'dishes'
  AND indexname IN ('dishes_dietary_tags_idx', 'dishes_description_trgm_idx');
```

Expected: both index names returned.

- [ ] **Step 6:** Spot-call `get_ranked_dishes` with default args + a sample lat/lng:

```sql
SELECT dish_id, dish_name, description, dietary_tags
FROM get_ranked_dishes(41.4540, -70.5660, 50)
LIMIT 3;
```

Expected: three rows, `description` is `NULL`, `dietary_tags` is `{}`.

### Task 1.7: Codex review + commit + push + PR + admin-merge

- [ ] **Step 1:** Run codex on the schema diff. Pass model gpt-5.3-codex, medium reasoning:

```bash
git diff main -- supabase/schema.sql supabase/migrations/2026-05-18-dish-descriptions-and-dietary-tags.sql | \
  head -500 > /tmp/pr1-diff.txt

echo "Review the v1.3 dish descriptions + dietary tags schema migration. Diff at /tmp/pr1-diff.txt. Check for: (1) any RPC body that selects columns by index vs name (positional return mismatch risk), (2) trigger or view dependencies on the dishes table that might break with added columns, (3) WHERE clause logic for filter_dietary_tags handles NULL and empty array correctly, (4) any other dish-feed RPC the migration missed." | \
  npx @openai/codex exec --skip-git-repo-check -m gpt-5.3-codex --config model_reasoning_effort="medium" --sandbox read-only 2>/dev/null
```

- [ ] **Step 2:** Apply any real codex findings inline (re-run SQL Editor for any RPC changes).

- [ ] **Step 3:** Stage and commit:

```bash
git add supabase/schema.sql supabase/migrations/2026-05-18-dish-descriptions-and-dietary-tags.sql
git diff --cached --stat

git commit -m "$(cat <<'EOF'
feat(schema): add dish description + dietary_tags columns and RPC signatures

Additive migration for v1.3 dish descriptions + dietary tags feature.
Schema source of truth + runnable migration with ALTER TABLE, GIN indexes
for dietary tag filtering and description trigram search, and updated
RETURNS TABLE on get_ranked_dishes (plus filter_dietary_tags param),
get_restaurant_dishes, get_dish_variants.

Migration already applied to production via SQL Editor — columns and
indexes verified present, RPC spot-calls return new columns as expected.
This PR exists for source-of-truth alignment; main branch must catch up
to deployed state before PR 2 (extractor) lands.

Per spec docs/superpowers/specs/2026-05-18-dish-descriptions-dietary-tags-design.md.

Co-authored-by: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4:** Push + open PR + admin-merge:

```bash
git push -u origin feat/dish-descriptions-schema

gh pr create --base main --title "feat(schema): dish description + dietary_tags columns + RPC signatures" --body "$(cat <<'EOF'
## Summary
PR 1 of 3 for v1.3 dish descriptions + dietary tags. Schema-only change. Production DB already updated via SQL Editor; this PR catches main up to deployed state so PR 2 (extractor) and PR 3 (UI) can build on it.

## Review trail
- Codex (gpt-5.3-codex / medium) review on the diff before commit.
- Additive only: dishes table gains `description TEXT` + `dietary_tags TEXT[]`. RPC signatures extended additively.

## Deployment status
Already applied to production. Verified: columns exist, indexes exist, RPC spot-call returns new columns as NULL/empty.

## Test plan
- [ ] After merge, `npm run build` still passes (no client breakage from RPC return shape changes — clients ignore extra columns)
- [ ] Existing dish lists still render — pizza/burger card on homepage looks identical
- [ ] `get_ranked_dishes(...)` SQL Editor call returns `description` + `dietary_tags`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# Wait for Vercel preview check to pass, then admin-merge:
PR_NUM=$(gh pr view --json number -q .number)
gh pr checks $PR_NUM
gh pr merge $PR_NUM --admin --squash --delete-branch
```

- [ ] **Step 5:** Sync local main:

```bash
git checkout main
git pull --ff-only
git log --oneline -1
```

Expected: top commit is the merged PR.

---

## PR 2 — Extractor + upsert + backfill flag

### Task 2.1: Branch off main

- [ ] **Step 1:**

```bash
cd /Users/danielwalsh/.local/bin/whats-good-here
git checkout main
git pull --ff-only
git checkout -b feat/dish-descriptions-extractor
git branch --show-current
```

Expected: `feat/dish-descriptions-extractor`

### Task 2.2: Create `src/constants/dietaryTags.js` (TDD)

**Files:**
- Create: `src/constants/dietaryTags.js`
- Create: `src/constants/dietaryTags.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/constants/dietaryTags.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { ALLOWED_DIETARY_TAGS, DIETARY_TAG_LABELS, DIETARY_DISCLAIMER } from './dietaryTags'

describe('dietaryTags constants', () => {
  it('exports five allowed tags in fixed order', () => {
    expect(ALLOWED_DIETARY_TAGS).toEqual([
      'vegan',
      'vegetarian',
      'gluten_free',
      'dairy_free',
      'nut_free',
    ])
  })

  it('has a human label for every allowed tag', () => {
    for (const tag of ALLOWED_DIETARY_TAGS) {
      expect(DIETARY_TAG_LABELS[tag]).toBeTruthy()
      expect(typeof DIETARY_TAG_LABELS[tag]).toBe('string')
    }
  })

  it('has no labels for tags outside the allowed list', () => {
    expect(Object.keys(DIETARY_TAG_LABELS).sort()).toEqual([...ALLOWED_DIETARY_TAGS].sort())
  })

  it('exports a non-empty disclaimer mentioning allergens', () => {
    expect(DIETARY_DISCLAIMER).toContain('allergen')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test -- --run src/constants/dietaryTags.test.js
```

Expected: FAIL — `dietaryTags` module not found.

- [ ] **Step 3: Write the constants**

Create `src/constants/dietaryTags.js`:

```js
export const ALLOWED_DIETARY_TAGS = ['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'nut_free']

export const DIETARY_TAG_LABELS = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  gluten_free: 'Gluten-free',
  dairy_free: 'Dairy-free',
  nut_free: 'Nut-free',
}

export const DIETARY_DISCLAIMER = 'Tags reflect menu labels. Always confirm with the restaurant for allergens.'
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm run test -- --run src/constants/dietaryTags.test.js
```

Expected: PASS, 4 tests.

### Task 2.3: Update `menu-refresh` interfaces

**Files:**
- Modify: `supabase/functions/menu-refresh/index.ts` (line 151 — `ExtractedDish` interface)

- [ ] **Step 1:** Find the `ExtractedDish` interface (currently lines 151-156):

```ts
interface ExtractedDish {
  name: string
  category: string
  menu_section: string
  price: number | null
}
```

Replace with:

```ts
interface ExtractedDish {
  name: string
  category: string
  menu_section: string
  price: number | null
  description: string | null
  dietary_tags: string[]
}
```

- [ ] **Step 2:** No test yet — interface change has no runtime effect alone. Tests follow in Task 2.4.

### Task 2.4: Add output validator + tests

**Files:**
- Modify: `supabase/functions/menu-refresh/index.ts` (the `parseExtraction` function, around line 740)
- Modify: `supabase/functions/menu-refresh/cms-detect.test.ts` (add new describe block)

- [ ] **Step 1:** Read the current `parseExtraction` function body (around line 740) and identify the `.map((d: ExtractedDish) => ({ ...d, category: ... }))` step.

- [ ] **Step 2:** Add a constant near the top of `menu-refresh/index.ts` (after `VALID_CATEGORIES`):

```ts
const ALLOWED_DIETARY_TAGS = ['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'nut_free'] as const
type AllowedDietaryTag = typeof ALLOWED_DIETARY_TAGS[number]

function sanitizeDietaryTags(raw: unknown): AllowedDietaryTag[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<AllowedDietaryTag>()
  for (const t of raw) {
    if (typeof t === 'string' && (ALLOWED_DIETARY_TAGS as readonly string[]).includes(t)) {
      seen.add(t as AllowedDietaryTag)
    }
  }
  return Array.from(seen)
}

function sanitizeDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  return trimmed.length > 80 ? trimmed.slice(0, 80) : trimmed
}
```

- [ ] **Step 3:** In `parseExtraction`, extend the `.map` to apply the new sanitizers:

Find:
```ts
.map((d: ExtractedDish) => ({
  ...d,
  category: VALID_CATEGORIES.includes(d.category) ? d.category : 'entree',
}))
```

Replace with:
```ts
.map((d: ExtractedDish) => ({
  ...d,
  category: VALID_CATEGORIES.includes(d.category) ? d.category : 'entree',
  description: sanitizeDescription(d.description),
  dietary_tags: sanitizeDietaryTags(d.dietary_tags),
}))
```

- [ ] **Step 4: Write the failing tests**

Add to `supabase/functions/menu-refresh/cms-detect.test.ts` (or create a sibling test file `extractors.test.ts` if cms-detect doesn't make sense — check existing file structure first). New describe block:

```ts
import { describe, it, expect } from 'vitest'
// If the helpers are not exported today, export them from index.ts for testability,
// or replicate them in a new module like supabase/functions/menu-refresh/extractors.ts
// and import from there.

describe('sanitizeDescription', () => {
  it('returns null for non-string input', () => {
    expect(sanitizeDescription(null)).toBe(null)
    expect(sanitizeDescription(undefined)).toBe(null)
    expect(sanitizeDescription(42)).toBe(null)
  })

  it('returns null for empty/whitespace strings', () => {
    expect(sanitizeDescription('')).toBe(null)
    expect(sanitizeDescription('   ')).toBe(null)
  })

  it('truncates strings over 80 chars', () => {
    const long = 'x'.repeat(120)
    expect(sanitizeDescription(long)?.length).toBe(80)
  })

  it('passes through short trimmed strings', () => {
    expect(sanitizeDescription('  Hot lobster, drawn butter  ')).toBe('Hot lobster, drawn butter')
  })
})

describe('sanitizeDietaryTags', () => {
  it('returns empty array for non-array input', () => {
    expect(sanitizeDietaryTags(null)).toEqual([])
    expect(sanitizeDietaryTags('vegan')).toEqual([])
  })

  it('drops tags outside the whitelist', () => {
    expect(sanitizeDietaryTags(['vegan', 'paleo', 'keto', 'gluten_free']))
      .toEqual(['vegan', 'gluten_free'])
  })

  it('dedupes duplicates', () => {
    expect(sanitizeDietaryTags(['vegan', 'vegan', 'vegetarian']))
      .toEqual(['vegan', 'vegetarian'])
  })

  it('drops non-string entries', () => {
    expect(sanitizeDietaryTags(['vegan', 42, null, 'gluten_free']))
      .toEqual(['vegan', 'gluten_free'])
  })
})
```

- [ ] **Step 5:** If the helpers aren't exported from `index.ts`, export them:

At the bottom of `menu-refresh/index.ts`, add:

```ts
export { sanitizeDescription, sanitizeDietaryTags, ALLOWED_DIETARY_TAGS }
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
npm run test -- --run supabase/functions/menu-refresh/
```

Expected: all new tests PASS.

### Task 2.5: Update Sonnet prompt rules

**Files:**
- Modify: `supabase/functions/menu-refresh/index.ts` (the prompt string, around the rules block ~line 115)

- [ ] **Step 1:** Find rule 9 in the prompt (`9. **One category per dish**`).

- [ ] **Step 2:** Insert new rules 10 and 11 after rule 9:

```text
10. **Description rule:** Output a terse ingredient/preparation line under 80 chars as `description`. Format: comma-separated nouns. Examples: "Hot lobster meat, drawn butter, split-top bun" / "Pepperoni, mozzarella, San Marzano tomato" / "Wagyu beef, bacon jam, brioche bun". If the menu has only marketing copy ("OUR SIGNATURE HAND-CRAFTED..."), output `null`. Never invent ingredients you don't see in the source.

11. **Dietary tags rule:** Output a `dietary_tags` array. Only emit a tag when the menu explicitly labels it. Allowed tags (and only these): `vegan`, `vegetarian`, `gluten_free`, `dairy_free`, `nut_free`. Triggers: explicit labels like "Vegan", "V", "GF", "Gluten-Free Available", "Dairy-Free", "Nut-Free" on the dish itself. **Inferring from ingredients is NOT allowed** — a tofu stir-fry with no animal products does NOT get `vegan` unless the menu labels it. Empty array `[]` when nothing is labeled. Never invent tags.
```

- [ ] **Step 3:** Update the example output JSON shape in the prompt (search for the `"dishes":` example near `## Output Format`):

```json
{
  "dishes": [
    {
      "name": "Dish Name",
      "category": "category_id",
      "menu_section": "Section Name",
      "price": 18.00,
      "description": "ingredient, ingredient, prep",
      "dietary_tags": ["vegan"]
    }
  ],
  "menu_section_order": ["Section 1", "Section 2"]
}
```

### Task 2.6: Extend `upsertDishes` to persist new fields

**Files:**
- Modify: `supabase/functions/menu-refresh/index.ts` (around line 758)

- [ ] **Step 1:** Find the existing `SELECT` of existing dishes (around line 766) and extend it:

Change:
```ts
.select('id, name, category, menu_section, price, photo_url')
```

To:
```ts
.select('id, name, category, menu_section, price, photo_url, description, dietary_tags')
```

- [ ] **Step 2:** Find the change-detection block (around line 786):

```ts
const priceChanged = dish.price !== null && dish.price !== existing.price
const categoryChanged = dish.category !== existing.category
const sectionChanged = dish.menu_section !== existing.menu_section
```

Extend with two new detectors:

```ts
const descriptionChanged = (dish.description ?? null) !== (existing.description ?? null)
const tagsChanged = !arraysEqual(dish.dietary_tags || [], existing.dietary_tags || [])
```

- [ ] **Step 3:** Add the `arraysEqual` helper near the top of the file (after imports):

```ts
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false
  return true
}
```

- [ ] **Step 4:** Extend the `if (priceChanged || categoryChanged || sectionChanged)` condition + updates object:

Change:
```ts
if (priceChanged || categoryChanged || sectionChanged) {
  const updates: Record<string, unknown> = {}
  if (categoryChanged) updates.category = dish.category
  if (sectionChanged) updates.menu_section = dish.menu_section
  if (priceChanged) updates.price = dish.price
```

To:
```ts
if (priceChanged || categoryChanged || sectionChanged || descriptionChanged || tagsChanged) {
  const updates: Record<string, unknown> = {}
  if (categoryChanged) updates.category = dish.category
  if (sectionChanged) updates.menu_section = dish.menu_section
  if (priceChanged) updates.price = dish.price
  if (descriptionChanged) updates.description = dish.description
  if (tagsChanged) updates.dietary_tags = dish.dietary_tags
```

- [ ] **Step 5:** Extend the INSERT (around line 808):

Change:
```ts
.insert({
  restaurant_id: restaurantId,
  name: dish.name,
  category: dish.category,
  menu_section: dish.menu_section || null,
  price: dish.price || null,
})
```

To:
```ts
.insert({
  restaurant_id: restaurantId,
  name: dish.name,
  category: dish.category,
  menu_section: dish.menu_section || null,
  price: dish.price || null,
  description: dish.description ?? null,
  dietary_tags: dish.dietary_tags || [],
})
```

- [ ] **Step 6:** No new unit test for upsertDishes itself (it's a Supabase-coupled function) — the verification in Task 2.9 (manual test against one restaurant) covers this end-to-end.

### Task 2.7: Add `force_all` + `limit` query handling

**Files:**
- Modify: `supabase/functions/menu-refresh/index.ts` (the batch fallback section around line 1510)

- [ ] **Step 1:** At the top of the handler (where query params are parsed), add force flag extraction. Find the request URL parsing (look for `new URL(req.url)`); if it doesn't exist, add it after the auth check:

```ts
const url = new URL(req.url)
const forceAll = url.searchParams.get('force_all') === 'true'
const forceLimit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10)))
```

- [ ] **Step 2:** In the batch fallback block (around line 1513-1524), branch on `forceAll`:

Change:
```ts
const staleDate = new Date()
staleDate.setDate(staleDate.getDate() - STALE_DAYS)

const { data, error } = await supabase
  .from('restaurants')
  .select('id, name, menu_url, menu_content_hash')
  .not('menu_url', 'is', null)
  .eq('is_open', true)
  .or(`menu_last_checked.is.null,menu_last_checked.lt.${staleDate.toISOString()}`)
  .limit(MAX_RESTAURANTS_PER_RUN)
```

To:
```ts
let query = supabase
  .from('restaurants')
  .select('id, name, menu_url, menu_content_hash')
  .not('menu_url', 'is', null)
  .eq('is_open', true)

if (!forceAll) {
  const staleDate = new Date()
  staleDate.setDate(staleDate.getDate() - STALE_DAYS)
  query = query.or(`menu_last_checked.is.null,menu_last_checked.lt.${staleDate.toISOString()}`)
}

const { data, error } = await query.limit(forceAll ? forceLimit : MAX_RESTAURANTS_PER_RUN)
```

- [ ] **Step 3:** Add a log line so backfill operators can see what's happening:

After the query, before the error check:
```ts
if (forceAll) {
  console.log(`menu-refresh: force_all=true, limit=${forceLimit}, found ${data?.length || 0} restaurants`)
}
```

### Task 2.8: Deploy Edge Function to production

- [ ] **Step 1:** Open Supabase Dashboard for Denis's project (`vpioftosgdkyiwvhxewy`) → Edge Functions → `menu-refresh` → Edit.

- [ ] **Step 2:** Paste the full updated `supabase/functions/menu-refresh/index.ts` into the editor and Deploy.

- [ ] **Step 3:** Wait for deploy to complete (~30s).

### Task 2.9: Verify on one test restaurant

- [ ] **Step 1:** Pick a known-good restaurant with a scrapable menu. Get its UUID:

```bash
URL="https://vpioftosgdkyiwvhxewy.supabase.co"
KEY="<production anon key from .env>"
curl -s "$URL/rest/v1/restaurants?select=id,name,menu_url&menu_url=not.is.null&limit=1" \
  -H "apikey: $KEY"
```

- [ ] **Step 2:** Trigger menu-refresh for that one restaurant (use the existing single-restaurant payload pattern — read `menu-refresh/index.ts` for the exact body shape; pass `{ restaurant_id: "<uuid>" }` typically):

```bash
CRON_SECRET="<from supabase function secrets>"
curl -X POST "$URL/functions/v1/menu-refresh" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"restaurant_id": "<uuid>"}'
```

- [ ] **Step 3:** Query the dishes table for that restaurant and inspect the new fields:

```bash
curl -s "$URL/rest/v1/dishes?restaurant_id=eq.<uuid>&select=name,description,dietary_tags&limit=5" \
  -H "apikey: $KEY"
```

Expected: at least some dishes have a non-null `description` under 80 chars. If the menu had labels like "Vegan" or "GF", those dishes should have populated `dietary_tags`. If no menu items were labeled, `dietary_tags` is `[]` everywhere — that's correct behavior, not a bug.

- [ ] **Step 4:** If description quality is bad (marketing fluff slipping through), tune the prompt and redeploy before continuing.

### Task 2.10: Codex review + commit + push + PR + admin-merge

- [ ] **Step 1:** Codex review on the extractor diff:

```bash
git diff main -- supabase/functions/menu-refresh/index.ts src/constants/dietaryTags.js | \
  head -800 > /tmp/pr2-diff.txt

echo "Review the v1.3 menu-refresh extractor changes. Diff at /tmp/pr2-diff.txt. Check for: (1) upsertDishes change-detection covers all six fields correctly including null/undefined edge cases, (2) force_all + limit handling has no auth bypass (CRON_SECRET still required), (3) prompt rule changes are unambiguous to Sonnet, (4) output validator correctly handles malformed Sonnet output (string instead of array, etc), (5) any regression to the existing single-restaurant POST path." | \
  npx @openai/codex exec --skip-git-repo-check -m gpt-5.3-codex --config model_reasoning_effort="medium" --sandbox read-only 2>/dev/null
```

- [ ] **Step 2:** Apply real codex findings inline. Re-deploy Edge Function if any file changes.

- [ ] **Step 3:** Run all tests:

```bash
npm run test -- --run
```

Expected: all pass (pre-existing nativeAuth.test.js may fail — that's unrelated, ignore).

- [ ] **Step 4:** Stage, commit, push, PR:

```bash
git add supabase/functions/menu-refresh/index.ts \
        supabase/functions/menu-refresh/cms-detect.test.ts \
        src/constants/dietaryTags.js \
        src/constants/dietaryTags.test.js

git commit -m "$(cat <<'EOF'
feat(menu-refresh): extract description + dietary_tags, add force_all backfill flag

PR 2 of 3 for v1.3 dish descriptions + dietary tags. Sonnet prompt now
asks for a terse <80 char description and a strict-label dietary_tags
array (vegan, vegetarian, gluten_free, dairy_free, nut_free). Output
validator drops out-of-whitelist tags, truncates oversize descriptions,
coerces empty strings to null. upsertDishes extended to persist both
new fields with change-detection (idempotent on no-op refreshes).

Added force_all=true&limit=N query handling to bypass STALE_DAYS for
the eager backfill of all 177 production restaurants. CRON_SECRET still
required.

Edge Function already deployed to production. Verified on one test
restaurant: description quality good, tags only present where menu
explicitly labels.

Per spec docs/superpowers/specs/2026-05-18-dish-descriptions-dietary-tags-design.md.

Co-authored-by: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push -u origin feat/dish-descriptions-extractor

gh pr create --base main --title "feat(menu-refresh): description + dietary_tags extraction + force_all flag" --body "$(cat <<'EOF'
## Summary
PR 2 of 3 for v1.3 dish descriptions + dietary tags. Extends the Sonnet extractor and upsert pipeline; adds force_all backfill mechanism for the eager 177-restaurant refresh.

## Review trail
- Codex (gpt-5.3-codex / medium) review on the diff before commit.
- Verified end-to-end on one production restaurant.

## Deployment status
Edge Function already deployed via Supabase Dashboard. The 14-day cron now naturally populates new fields. Backfill (separate from this PR) runs after merge.

## Test plan
- [ ] Trigger menu-refresh on a known-labeled menu (one with "Vegan"/"GF" markers) — verify both fields populate correctly
- [ ] Trigger menu-refresh on a menu with marketing fluff only — verify description is null, no tags
- [ ] Confirm force_all=true bypasses STALE_DAYS but still requires CRON_SECRET
- [ ] Existing 14-day cron continues to work unchanged

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

PR_NUM=$(gh pr view --json number -q .number)
gh pr merge $PR_NUM --admin --squash --delete-branch
git checkout main && git pull --ff-only
```

---

## PR 3 — UI: card preview, detail block, Diet sheet, URL state, search

### Task 3.1: Branch off main

- [ ] **Step 1:**

```bash
cd /Users/danielwalsh/.local/bin/whats-good-here
git checkout main
git pull --ff-only
git checkout -b feat/dish-descriptions-ui
git branch --show-current
```

Expected: `feat/dish-descriptions-ui`

### Task 3.2: Extend `dishesApi.getRankedDishes` (TDD)

**Files:**
- Modify: `src/api/dishesApi.js` (line 24, `getRankedDishes` signature + RPC call)
- Modify: `src/api/dishesApi.test.js`

- [ ] **Step 1: Write the failing test**

In `src/api/dishesApi.test.js`, add to the `describe('getRankedDishes', ...)` block:

```js
it('passes filter_dietary_tags to the RPC when provided', async () => {
  const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null })
  supabase.rpc = mockRpc

  await dishesApi.getRankedDishes({
    lat: 41.45,
    lng: -70.56,
    radiusMiles: 25,
    dietaryTags: ['vegan', 'gluten_free'],
  })

  expect(mockRpc).toHaveBeenCalledWith('get_ranked_dishes', expect.objectContaining({
    filter_dietary_tags: ['vegan', 'gluten_free'],
  }))
})

it('omits filter_dietary_tags when dietaryTags is empty or undefined', async () => {
  const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null })
  supabase.rpc = mockRpc

  await dishesApi.getRankedDishes({ lat: 41.45, lng: -70.56, radiusMiles: 25 })

  const callArg = mockRpc.mock.calls[0][1]
  expect(callArg.filter_dietary_tags ?? null).toBe(null)
})
```

(Verify the mock pattern matches existing tests in the file — adjust if `supabase` is imported differently.)

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test -- --run src/api/dishesApi.test.js
```

Expected: FAIL — RPC isn't passing `filter_dietary_tags`.

- [ ] **Step 3: Implement**

In `src/api/dishesApi.js` around line 24, change:

```js
async getRankedDishes({ lat, lng, radiusMiles, category = null }) {
```

To:

```js
async getRankedDishes({ lat, lng, radiusMiles, category = null, dietaryTags = null }) {
```

In the `.rpc('get_ranked_dishes', { ... })` call inside the function body, add to the args object:

```js
filter_dietary_tags: (dietaryTags && dietaryTags.length > 0) ? dietaryTags : null,
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm run test -- --run src/api/dishesApi.test.js
```

Expected: PASS.

### Task 3.3: Extend `dishesApi.getAllSearchable` (TDD)

**Files:**
- Modify: `src/api/dishesApi.js` (around line 276 — `getAllSearchable`)
- Modify: `src/api/dishesApi.test.js`

- [ ] **Step 1: Write the failing test**

In `src/api/dishesApi.test.js`:

```js
describe('getAllSearchable', () => {
  it('includes description and dietary_tags in selectFields', async () => {
    const mockFrom = vi.fn().mockReturnThis()
    const mockSelect = vi.fn().mockReturnThis()
    const mockNot = vi.fn().mockResolvedValue({ data: [], error: null })

    supabase.from = mockFrom
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ not: mockNot })

    await dishesApi.getAllSearchable()

    const selectArg = mockSelect.mock.calls[0][0]
    expect(selectArg).toContain('description')
    expect(selectArg).toContain('dietary_tags')
  })
})
```

- [ ] **Step 2: Run test, confirm fail**

```bash
npm run test -- --run src/api/dishesApi.test.js
```

- [ ] **Step 3:** In `dishesApi.js` line ~280, find the `selectFields` template literal in `getAllSearchable` and add `description` and `dietary_tags` to it. Also include them in the `.map()` transform that produces the output row shape.

- [ ] **Step 4: Run test, confirm pass**

### Task 3.4: Extend client-side search to match description (TDD)

**Files:**
- Modify: `src/utils/dishSearch.js`
- Modify: `src/utils/dishSearch.test.js`

- [ ] **Step 1: Write the failing test**

In `src/utils/dishSearch.test.js`, add:

```js
describe('searchDishes — description matching', () => {
  it('matches dishes by description ingredient', () => {
    const dishes = [
      { id: '1', name: 'Pad Thai', description: 'rice noodle, peanut, lime, tamarind', avg_rating: 8 },
      { id: '2', name: 'Spaghetti', description: 'tomato, basil', avg_rating: 7 },
    ]
    const results = searchDishes(dishes, 'peanut', { limit: 5 })
    expect(results.map(r => r.id)).toEqual(['1'])
  })

  it('returns no match when description is null', () => {
    const dishes = [{ id: '1', name: 'Mystery Dish', description: null, avg_rating: 8 }]
    const results = searchDishes(dishes, 'peanut', { limit: 5 })
    expect(results).toEqual([])
  })
})
```

- [ ] **Step 2: Run test, confirm fail**

- [ ] **Step 3:** In `dishSearch.js`, find `scoreDish` (read the existing implementation first to match style). Add a description-match path: when description is non-null, tokenize it and score matches at a weight below the name match weight (so name matches still win). Suggested weight: half the weight of a restaurant_name match.

- [ ] **Step 4: Run test, confirm pass + ensure existing tests still pass**

```bash
npm run test -- --run src/utils/dishSearch.test.js
```

### Task 3.5: Create URL param helper (TDD)

**Files:**
- Create: `src/utils/dietUrlParams.js`
- Create: `src/utils/dietUrlParams.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { parseDietParam, serializeDietParam } from './dietUrlParams'

describe('parseDietParam', () => {
  it('returns empty array for null/undefined/empty', () => {
    expect(parseDietParam(null)).toEqual([])
    expect(parseDietParam(undefined)).toEqual([])
    expect(parseDietParam('')).toEqual([])
    expect(parseDietParam(',,,')).toEqual([])
  })

  it('parses a single valid tag', () => {
    expect(parseDietParam('vegan')).toEqual(['vegan'])
  })

  it('parses multiple comma-separated valid tags', () => {
    expect(parseDietParam('vegan,gluten_free')).toEqual(['vegan', 'gluten_free'])
  })

  it('drops invalid tag values', () => {
    expect(parseDietParam('vegan,paleo,gluten_free')).toEqual(['vegan', 'gluten_free'])
  })

  it('dedupes repeats', () => {
    expect(parseDietParam('vegan,vegan,gluten_free')).toEqual(['vegan', 'gluten_free'])
  })

  it('trims whitespace', () => {
    expect(parseDietParam('vegan , gluten_free')).toEqual(['vegan', 'gluten_free'])
  })
})

describe('serializeDietParam', () => {
  it('returns empty string for empty array', () => {
    expect(serializeDietParam([])).toBe('')
  })

  it('joins with commas', () => {
    expect(serializeDietParam(['vegan', 'gluten_free'])).toBe('vegan,gluten_free')
  })
})
```

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3:** Implement:

```js
import { ALLOWED_DIETARY_TAGS } from '../constants/dietaryTags'

export function parseDietParam(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return []
  const seen = new Set()
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (ALLOWED_DIETARY_TAGS.includes(trimmed)) {
      seen.add(trimmed)
    }
  }
  return Array.from(seen)
}

export function serializeDietParam(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return ''
  return tags.filter(t => ALLOWED_DIETARY_TAGS.includes(t)).join(',')
}
```

- [ ] **Step 4: Run, pass.**

### Task 3.6: Fix `Map.jsx` URL reactivity for `diet` param

**Files:**
- Modify: `src/pages/Map.jsx`

- [ ] **Step 1:** Read `Map.jsx` lines 27-50 to understand the current pattern. The file uses `useSearchParams` to seed `initialCategory` and `initialQuery` once at mount.

- [ ] **Step 2:** Add a new piece of state for dietary filter:

```js
import { parseDietParam, serializeDietParam } from '../utils/dietUrlParams'
// ...
var initialDiet = parseDietParam(searchParams.get('diet'))
var [dietaryTags, setDietaryTags] = useState(initialDiet)
```

- [ ] **Step 3:** Critical fix: add a `useEffect` that syncs state when URL changes:

```js
useEffect(() => {
  const fromUrl = parseDietParam(searchParams.get('diet'))
  // shallow array equality
  if (fromUrl.length !== dietaryTags.length ||
      fromUrl.some((t, i) => t !== dietaryTags[i])) {
    setDietaryTags(fromUrl)
  }
}, [searchParams])
```

This is the fix for the codex-flagged bug: navigation to `/?diet=vegan` from the detail page now re-applies the filter on return.

- [ ] **Step 4:** Wire `dietaryTags` into the dish-fetching hook (likely `useDishes` or wherever `getRankedDishes` is consumed):

```js
// example shape — match the actual hook signature in Map.jsx
const { dishes } = useDishes({ lat, lng, radiusMiles: radius, dietaryTags })
```

- [ ] **Step 5:** When the user updates filter via Diet sheet (built in Task 3.7), update the URL via `setSearchParams`, NOT just local state. The `useEffect` above will sync state back.

- [ ] **Step 6:** Run dev server, manually verify navigating to `/?diet=vegan` from address bar applies the filter to the list.

```bash
npm run dev
# Visit http://localhost:5173/?diet=vegan in browser
```

### Task 3.7: Build DietButton + DietSheet (frontend-design skill)

**Files:**
- Create: `src/components/DietButton.jsx`
- Create: `src/components/DietSheet.jsx`
- Create: `src/components/DietSheet.test.jsx`

- [ ] **Step 1:** Invoke the `frontend-design` skill to design and implement the DietButton + DietSheet components. Pass these requirements:

> Build two React components for the v1.3 dietary filter:
>
> 1. **DietButton** — Small pill button placed next to the homepage search bar. Shows current filter state: "Diet · Off" / "Diet · Vegan" / "Diet · 2 selected". Tap opens DietSheet. Visual language must match existing buttons (search bar, ModeFAB) — Outfit font, warm color palette, var(--color-*) tokens.
>
> 2. **DietSheet** — Modal overlay (or fullscreen bottom sheet) with:
>    - Header "Dietary preferences" in Amatic SC display font
>    - Multi-select chip row: Vegan, Vegetarian, Gluten-free, Dairy-free, Nut-free (use `DIETARY_TAG_LABELS` from `src/constants/dietaryTags.js`)
>    - Disclaimer line at bottom (use `DIETARY_DISCLAIMER` constant) with info icon prefix, in `var(--color-text-tertiary)` small text
>    - Helper copy under the chips: "All selected restrictions must apply"
>    - Reset button (clears selection) + Apply button (closes sheet, emits selection)
>    - Native keyboard + escape-key dismissal
>
> Wire DietButton onClick to open DietSheet. DietSheet's Apply callback receives the selected tag array. Parent component (Map.jsx) handles URL update via setSearchParams.
>
> Constraints: light theme only, no Tailwind color classes, brand colors via var(--color-*), Outfit body + Amatic SC display, no console.* (use logger if needed).

- [ ] **Step 2:** Review the frontend-design output for taste + match to existing components (DishListItem, CategoryIcons). Iterate if needed.

- [ ] **Step 3:** Add unit tests for DietSheet state in `DietSheet.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DietSheet } from './DietSheet'

describe('DietSheet', () => {
  it('starts with provided initial selection', () => {
    render(<DietSheet open initial={['vegan']} onApply={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('checkbox', { name: /vegan/i })).toBeChecked()
  })

  it('Reset clears all selections', () => {
    render(<DietSheet open initial={['vegan', 'gluten_free']} onApply={() => {}} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(screen.getByRole('checkbox', { name: /vegan/i })).not.toBeChecked()
  })

  it('Apply emits the current selection and closes', () => {
    const onApply = vi.fn()
    const onClose = vi.fn()
    render(<DietSheet open initial={[]} onApply={onApply} onClose={onClose} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /vegan/i }))
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    expect(onApply).toHaveBeenCalledWith(['vegan'])
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 4:** Mount DietButton in `Map.jsx` near the search bar. Wire the Apply callback to update `setSearchParams({ diet: serializeDietParam(tags) })` (or remove the param when array is empty).

### Task 3.8: Card preview line in `DishListItem.jsx` (TDD)

**Files:**
- Modify: `src/components/DishListItem.jsx`
- Create: `src/components/DishListItem.test.jsx` (if it doesn't exist; if it does, extend it)

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { DishListItem } from './DishListItem'

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>)

describe('DishListItem description preview', () => {
  it('renders description line when description is non-null', () => {
    renderWithRouter(
      <DishListItem dish={{
        dish_id: '1',
        dish_name: 'Lobster Roll',
        restaurant_name: 'Coast Cafe',
        category: 'lobster roll',
        description: 'Hot lobster meat, drawn butter, split-top bun',
        avg_rating: 8.4,
      }} />
    )
    expect(screen.getByText(/hot lobster meat, drawn butter/i)).toBeInTheDocument()
  })

  it('omits description line when description is null', () => {
    renderWithRouter(
      <DishListItem dish={{
        dish_id: '1',
        dish_name: 'Lobster Roll',
        restaurant_name: 'Coast Cafe',
        category: 'lobster roll',
        description: null,
        avg_rating: 8.4,
      }} />
    )
    // No element should match a description selector — assert via test id or class
    expect(screen.queryByTestId('dish-description-preview')).toBeNull()
  })
})
```

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3:** In `DishListItem.jsx`, find the "Name + restaurant + distance" block (around line 158). Below the restaurant/distance line, add (rendered conditionally):

```jsx
{dish.description ? (
  <div
    data-testid="dish-description-preview"
    style={{
      fontFamily: 'Outfit, sans-serif',
      fontSize: '13px',
      color: 'var(--color-text-tertiary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      marginTop: '2px',
    }}
  >
    {dish.description}
  </div>
) : null}
```

- [ ] **Step 4: Run, pass + verify all other card tests still pass.**

### Task 3.9: Detail page description block + tag pills + disclaimer (frontend-design skill)

**Files:**
- Modify: `src/pages/Dish.jsx`

- [ ] **Step 1:** Invoke `frontend-design` with:

> Add a description block to `src/pages/Dish.jsx` between the restaurant header and the vote slider. Layout:
>
> ```
> [restaurant header / hero]
>
> <description text>            ← Outfit body, var(--color-text-primary)
>
> ○ Vegan  ○ Vegetarian  ○ GF   ← tag pills (rounded chips, secondary surface)
> ℹ️ Tags reflect menu labels.   ← disclaimer (small, tertiary text)
>    Confirm with restaurant
>    for allergens.
>
> [vote slider]
> ```
>
> Conditional rendering:
> - Description block hidden when `dish.description` is null
> - Tag pill row + disclaimer hidden when `dish.dietary_tags` is empty
> - Use `DIETARY_TAG_LABELS` and `DIETARY_DISCLAIMER` from `src/constants/dietaryTags.js`
>
> Tag pills are clickable — clicking a pill navigates to `/?diet=<tag>` (use `useNavigate`).
>
> Constraints: brand colors via var(--color-*), no Tailwind color classes, no console.*.

- [ ] **Step 2:** Review output and iterate.

### Task 3.10: Manual smoke test end-to-end

- [ ] **Step 1:** Run dev server, sign in, verify:

```bash
npm run dev
```

- [ ] **Step 2:** Test each surface:
  - [ ] Homepage list shows description lines on cards that have descriptions (after PR 2 backfill or for newly-refreshed restaurants)
  - [ ] Homepage list cards WITHOUT a description render identically to today (no extra space, no placeholder)
  - [ ] Search "anchovy" or another ingredient returns dishes with that ingredient in description
  - [ ] Tap dish card → detail page renders description + tag pills + disclaimer correctly
  - [ ] Tap a tag pill → returns to homepage with that filter applied (URL shows `?diet=<tag>`)
  - [ ] Diet button shows current state, opens sheet
  - [ ] Sheet multi-select + Apply updates URL and filters list (AND semantics: vegan + gluten_free = both)
  - [ ] Reset clears selection
  - [ ] Back button restores prior filter state

### Task 3.11: Codex review + commit + push + PR + admin-merge

- [ ] **Step 1:** Codex review:

```bash
git diff main -- src/ > /tmp/pr3-diff.txt

echo "Review the v1.3 dish descriptions UI PR. Diff at /tmp/pr3-diff.txt. Check for: (1) Map.jsx URL reactivity actually works for late navigations (not just initial mount), (2) DishListItem description rendering is null-safe and doesn't break existing card layouts, (3) URL sanitization handles tampered ?diet= values safely, (4) tag pill tap navigation preserves other URL state (category, query) instead of clobbering it, (5) test coverage gaps for edge cases, (6) any direct console.* usage that should be logger." | \
  npx @openai/codex exec --skip-git-repo-check -m gpt-5.3-codex --config model_reasoning_effort="medium" --sandbox read-only 2>/dev/null
```

- [ ] **Step 2:** Apply codex findings inline.

- [ ] **Step 3:** Run lint + tests + build in parallel:

```bash
npm run lint &
npm run test -- --run &
npm run build &
wait
```

Expected: all green (pre-existing `nativeAuth.test.js` may fail — ignore).

- [ ] **Step 4:** Stage, commit, push, PR, merge:

```bash
git add src/
git diff --cached --stat

git commit -m "$(cat <<'EOF'
feat(ui): dish description preview, detail block, Diet filter sheet

PR 3 of 3 for v1.3 dish descriptions + dietary tags. UI surfaces:

- Card preview: 1-line description under restaurant/distance, null-safe
- Dish detail page: full description + tag pills + allergen disclaimer
- Tag pill tap → /?diet=<tag> applies homepage filter
- Diet button + multi-select bottom sheet (built via frontend-design skill)
- Map.jsx URL reactivity fix — late navigations to /?diet=... now apply
- Client-side search indexes description (search "anchovy" finds it)
- dishesApi.getRankedDishes passes filter_dietary_tags to the RPC

Renders nothing when fields are null/empty — safe to ship before backfill.

Per spec docs/superpowers/specs/2026-05-18-dish-descriptions-dietary-tags-design.md.

Co-authored-by: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push -u origin feat/dish-descriptions-ui

gh pr create --base main --title "feat(ui): dish description preview + detail block + Diet filter sheet" --body "$(cat <<'EOF'
## Summary
PR 3 of 3 for v1.3 dish descriptions + dietary tags. All UI surfaces — card preview, detail page block + pills + disclaimer, Diet button + multi-select sheet, URL state with Map.jsx reactivity fix, client-side description search, RPC param passthrough.

## Review trail
- Codex (gpt-5.3-codex / medium) review on the diff before commit.
- UI components built via frontend-design skill.
- Manual smoke test of all surfaces.

## Test plan
- [ ] Homepage cards show description line when populated, omit cleanly when null
- [ ] Search "anchovy" / "truffle" / "maple" surfaces dishes with those ingredients
- [ ] Detail page description block + tag pills + disclaimer render correctly
- [ ] Tag pill tap navigates to homepage with filter applied
- [ ] Diet button → sheet → multi-select → Apply updates list and URL
- [ ] Browser back/forward preserves filter state
- [ ] AND semantics: vegan + gluten-free returns only dishes with BOTH tags

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

PR_NUM=$(gh pr view --json number -q .number)
gh pr merge $PR_NUM --admin --squash --delete-branch
git checkout main && git pull --ff-only
```

---

## Backfill

### Task B.1: Create backfill script

**Files:**
- Create: `scripts/backfill-menu-descriptions.sh`

- [ ] **Step 1:** Create the script:

```bash
#!/usr/bin/env bash
# scripts/backfill-menu-descriptions.sh
# Eager backfill for v1.3 dish descriptions + dietary tags.
# Requires: SUPABASE_URL, CRON_SECRET env vars.
set -euo pipefail

: "${SUPABASE_URL:?must set SUPABASE_URL}"
: "${CRON_SECRET:?must set CRON_SECRET}"

ENDPOINT="$SUPABASE_URL/functions/v1/menu-refresh?force_all=true&limit=50"
TOTAL=0

while true; do
  echo "→ POST $ENDPOINT"
  RESPONSE=$(curl -s -X POST "$ENDPOINT" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json")
  echo "  response: $RESPONSE"

  PROCESSED=$(echo "$RESPONSE" | grep -oE '"processed":[0-9]+' | grep -oE '[0-9]+' || echo "0")
  TOTAL=$((TOTAL + PROCESSED))
  echo "  processed: $PROCESSED (running total: $TOTAL)"

  if [ "$PROCESSED" -eq 0 ]; then
    echo "✓ Done. Total restaurants backfilled: $TOTAL"
    break
  fi

  sleep 5
done
```

- [ ] **Step 2:** Make executable:

```bash
chmod +x scripts/backfill-menu-descriptions.sh
```

### Task B.2: Run backfill

- [ ] **Step 1:** Source env vars (production):

```bash
export SUPABASE_URL="https://vpioftosgdkyiwvhxewy.supabase.co"
export CRON_SECRET="<from Supabase function secrets dashboard>"
```

- [ ] **Step 2:** Run:

```bash
./scripts/backfill-menu-descriptions.sh
```

Expected: 4 invocations (~50 restaurants each), final "Total restaurants backfilled: 177" (or close to it; some may be skipped if `menu_url` is null or `is_open=false`).

Total elapsed: ~30-60 min.

### Task B.3: Validation pass

- [ ] **Step 1:** Spot-check 10 random restaurants via Supabase Dashboard SQL Editor:

```sql
SELECT
  r.name AS restaurant,
  d.name AS dish,
  d.description,
  d.dietary_tags
FROM dishes d
JOIN restaurants r ON r.id = d.restaurant_id
ORDER BY random()
LIMIT 30;
```

- [ ] **Step 2:** Check:
  - Are descriptions terse and ingredient-focused (not marketing fluff)?
  - Are they under 80 chars?
  - Are dietary tags only present when menus literally label?
  - Any tag values outside `vegan, vegetarian, gluten_free, dairy_free, nut_free`? (Should be impossible — validator drops these.)

- [ ] **Step 3:** If description quality is poor, tune the prompt in `menu-refresh/index.ts`, redeploy via Dashboard, and re-run the backfill script. Cost per iteration: ~$5.

- [ ] **Step 4:** Commit the backfill script (no new PR needed if already on main):

```bash
git checkout main
git pull --ff-only
git checkout -b chore/backfill-script
git add scripts/backfill-menu-descriptions.sh
git commit -m "chore(scripts): add backfill-menu-descriptions for v1.3

One-time eager backfill helper for the dish descriptions + dietary tags
feature. Loops POSTs to menu-refresh with force_all=true until processed:0.

Co-authored-by: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push -u origin chore/backfill-script
gh pr create --base main --title "chore(scripts): add menu description backfill script" --body "Helper script used for the one-time eager backfill during v1.3 launch. Lives in scripts/ for future use if we need to re-run extraction."
PR_NUM=$(gh pr view --json number -q .number)
gh pr merge $PR_NUM --admin --squash --delete-branch
```

---

## Done check

After all PRs merged + backfill complete, verify the user-visible feature:

- [ ] Homepage: descriptions render on cards that have them
- [ ] Search "anchovy" or another ingredient: results appear
- [ ] Dish detail page: description + tag pills + disclaimer render
- [ ] Diet button: opens sheet, multi-select works, Apply filters list
- [ ] URL state survives: refresh `/?diet=vegan,gluten_free` preserves filter
- [ ] Browser back/forward: filter state restored correctly
- [ ] No regressions: existing card layout, vote slider, photos all still work
