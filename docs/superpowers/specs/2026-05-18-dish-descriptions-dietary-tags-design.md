# Dish Descriptions + Dietary Tags — v1.3 Design Spec

**Date:** 2026-05-18
**Target release:** v1.3
**Status:** Approved by Dan; pending implementation plan

---

## Summary

Add two new fields to every dish: a terse one-line **description** and an array of **dietary tags**. Both are extracted by the existing `menu-refresh` Sonnet pipeline from the source content it already reads. Card preview gets a one-line description under the restaurant name (clean, no chips). Dish detail page gets the full description plus dietary tag pills and a disclaimer. Homepage gains a "Diet" button next to search that opens a multi-select bottom sheet for filtering.

**Goal:** Answer the "what's in it?" question every user has, and let dietary-restricted users filter the discovery feed without paging through every detail page.

---

## Locked decisions (from brainstorm 2026-05-18)

| # | Decision | Rationale |
|---|---|---|
| 1 | **Placement:** 1-line preview on card + full block on detail page | Card stays readable, detail page becomes the information hub |
| 2 | **Description style:** terse ingredient list, <80 chars, null on marketing fluff | Signal density. Fits one card line. Never invent. |
| 3 | **Backfill:** eager one-time mass refresh of all 177 restaurants on release | Launch feels complete; ~$5-6 one-time cost |
| 4 | **Search:** index descriptions alongside dish name | "Anchovy", "maple", "truffle" surface dishes that contain them |
| 5 | **Dietary tags:** ship in v1.3 alongside descriptions | Same model call, marginal cost, unlocks vegan/veg/GF/DF/NF filtering |
| 6 | **Safety:** strict — only emit tag when menu explicitly labels it | Allergen liability. Never infer from ingredients. |
| 7 | **Tag set:** `vegan`, `vegetarian`, `gluten_free`, `dairy_free`, `nut_free` | The five most-labeled tags. Skip halal/kosher (certification territory). |
| 8 | **Card UI:** no dietary chips on card. Tags on detail page only. | Card clutter rejected by Dan; filter row already shows dietary state at list level |
| 9 | **Homepage filter:** "Diet" button → multi-select bottom sheet | Saves vertical space vs always-visible chip row |
| 10 | **Null handling:** card renders normally when description is null (no placeholder) | Never force empty UI |

---

## Section 1 — Data layer

### Schema migration

One additive migration. New file: `supabase/migrations/add-dish-descriptions-and-dietary-tags.sql` (matches the kebab-case naming pattern used by existing migrations — no date prefix).

```sql
ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS dietary_tags TEXT[] DEFAULT '{}';

-- GIN index for fast tag filtering ("show me vegan dishes")
CREATE INDEX IF NOT EXISTS dishes_dietary_tags_idx
  ON dishes USING GIN (dietary_tags);

-- Trigram index for description search (matches the pattern from PR #213)
CREATE INDEX IF NOT EXISTS dishes_description_trgm_idx
  ON dishes USING GIN (description gin_trgm_ops);

-- No SQL rollback needed (pure additive change).
```

`schema.sql` must be updated first per CLAUDE.md ("source of truth"), then the migration runs in the Supabase SQL Editor.

### Allowed dietary tag values

Constrained at the application layer (no DB CHECK constraint — keeps flexibility to add future tags without a migration):

```ts
const ALLOWED_DIETARY_TAGS = [
  'vegan',
  'vegetarian',
  'gluten_free',
  'dairy_free',
  'nut_free',
] as const
```

Lives in `src/constants/dietaryTags.js` alongside display labels (`{ vegan: 'Vegan', gluten_free: 'Gluten-free', ... }`).

### Extractor changes — `supabase/functions/menu-refresh/index.ts`

Output schema grows from 4 fields to 6:

```ts
interface ExtractedDish {
  name: string
  category: string
  menu_section: string
  price: number | null
  description: string | null   // NEW
  dietary_tags: string[]       // NEW
}
```

**Prompt additions** (added to the existing rules block, after the price rule):

> **Description rule:** Output a terse ingredient/preparation line under 80 chars. Format: comma-separated nouns. Examples: "Hot lobster meat, drawn butter, split-top bun" / "Pepperoni, mozzarella, San Marzano tomato" / "Wagyu beef, bacon jam, brioche bun". If the menu has only marketing copy ("OUR SIGNATURE HAND-CRAFTED..."), output `null`. Never invent ingredients you don't see in the source.
>
> **Dietary tags rule:** Only emit a tag when the menu explicitly labels it. Allowed tags (and only these): `vegan`, `vegetarian`, `gluten_free`, `dairy_free`, `nut_free`. Triggers: explicit labels like "Vegan", "V", "GF", "Gluten-Free Available", "Dairy-Free", "Nut-Free" on the dish itself. **Inferring from ingredients is NOT allowed** — a tofu stir-fry with no animal products does NOT get `vegan` unless the menu labels it. Empty array `[]` when nothing is labeled. Never invent tags.

**Output validator** (in `parseExtraction` / equivalent):
- Drop any `dietary_tags` value not in `ALLOWED_DIETARY_TAGS`
- Truncate `description` to 80 chars if Sonnet exceeds (defensive — prompt should already enforce)
- Coerce empty string `""` → `null` for description

---

## Section 2 — UI

### Dish card (`src/components/DishListItem.jsx`)

Add one line under restaurant/distance, rendered only when `dish.description != null`:

```
[icon]  Lobster Roll                    8.4 ★
        Coast Cafe · 0.3 mi
        Hot lobster meat, drawn butter…
```

- Font: same family as restaurant line (Outfit), smaller size, `var(--color-text-tertiary)`
- Single line with CSS `text-overflow: ellipsis` (defensive — most descriptions will fit at <80 chars)
- No dietary chips. Card stays clean.
- When `description == null`, render the card exactly as today (no placeholder, no extra space).

Implement via the `frontend-design` skill to match the existing visual language.

### Dish detail page (`src/pages/Dish.jsx`)

Add a description block under the restaurant name, above the vote slider, rendered only when `description != null`:

```
Lobster Roll                            8.4 ★
Coast Cafe · Oak Bluffs

Hot lobster meat, drawn butter, split-top bun.

○ Vegan   ○ Vegetarian   ○ Dairy-free
ℹ️ Tags reflect menu labels. Confirm with restaurant for allergens.

[vote slider, photos, reviews…]
```

- Description: Outfit body weight, `var(--color-text-primary)`
- Tag pills: rounded chips, secondary surface color, body text. **Tappable** — tapping a tag navigates to `/?diet=<tag>` (homepage with that filter pre-applied)
- Disclaimer: small text, `var(--color-text-tertiary)`, info icon prefix
- When `dietary_tags` is empty, no pill row and no disclaimer renders

Implement via the `frontend-design` skill.

### Homepage Diet button + bottom sheet

**Button placement:** near the existing search bar on the homepage. Shows current state:
- `Diet · Off` when no filter active
- `Diet · Vegan` when one tag
- `Diet · 2 selected` when multi-select

**Bottom sheet** (uses the existing `BottomSheet` component from Denis's gesture-based work, per memory):

```
Dietary preferences

○ Vegan       ○ Vegetarian    ○ Gluten-free
○ Dairy-free  ○ Nut-free

ℹ️ Tags reflect menu labels. Always confirm
   with the restaurant for allergens.

         [ Reset ]   [ Apply ]
```

- Multi-select chips
- Reset clears all selections
- Apply closes sheet and updates URL: `/?diet=vegan,gluten_free`
- URL state round-trips so filters are shareable and survive back-button

Implement via the `frontend-design` skill.

### Constants & display

`src/constants/dietaryTags.js`:

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

---

## Section 3 — Search

`dishesApi.search()` (in `src/api/dishesApi.js`) extends to match against description:

- Add `description` to the `selectFields` string
- Add description to the search filter:
  ```js
  .or(`name.ilike.%${term}%,description.ilike.%${term}%`)
  ```
- Trigram index from the migration keeps this fast at 6,380 dishes

**Dietary filter** in `get_ranked_dishes` (or equivalent main feed RPC):
- Accept a new optional parameter `p_dietary_tags TEXT[]`
- When non-empty, add: `AND dishes.dietary_tags @> p_dietary_tags` (contains-all semantics: vegan AND GF = both required)
- When empty/null, behavior unchanged
- RPC changes deploy via Supabase SQL Editor per CLAUDE.md

URL parameter `?diet=vegan,gluten_free` parsed by the homepage and passed to the hook → API.

---

## Section 4 — Backfill + rollout

### PR sequence (each through `codex-cli` before commit)

1. **PR 1 — Schema migration**
   - Update `supabase/schema.sql`
   - Create migration file with `ALTER TABLE` + indexes
   - Run in Supabase SQL Editor
   - Verify with `\d dishes` that columns + indexes exist
   - Additive only → no breakage

2. **PR 2 — Extractor + backfill flag**
   - Update `menu-refresh/index.ts` interfaces, prompt rules, output validator
   - Add `?force_all=true&limit=N` query support that bypasses the `STALE_DAYS` staleness filter and processes up to `N` restaurants in one invocation (capped at 50 to stay under Edge Function timeout). When `force_all` is absent, behavior is unchanged. This is the mechanism the backfill (step 4) needs — `menu-refresh` today has no force flag, so without this addition the eager backfill can't happen.
   - Add `src/constants/dietaryTags.js`
   - Deploy Edge Function (via Dashboard "Edit" UI per memory — Dan's MCP only sees the old project)
   - Verify on one test restaurant (run menu-refresh manually with `?force_all=true&limit=1&restaurant_id=<id>`, inspect output)
   - 14-day cron starts populating new fields naturally from this point

3. **PR 3 — UI**
   - Card preview line in `DishListItem.jsx`
   - Detail page description block + tag pills + disclaimer in `Dish.jsx`
   - Diet button + bottom sheet on homepage
   - URL parameter parsing
   - Search includes description
   - Dietary filter passed through to RPC
   - Renders nothing when fields are null/empty — safe to ship before backfill completes

4. **Backfill run** (after PR 2 deployed)
   - Manually invoke `menu-refresh?force_all=true&limit=50` four times in sequence (each call processes up to 50 restaurants, 4 × 50 = 200 covers all 177)
   - Or write a tiny bash loop that calls the endpoint until it returns `{ processed: 0 }`
   - Total time: ~30-60 min
   - Total cost: ~$5-6

5. **Validation pass**
   - Spot-check 10 random restaurants in Supabase Dashboard:
     - Description: terse? <80 chars? No marketing fluff?
     - Dietary tags: only present when menu literally labels?
   - If quality off: tune prompt, re-run backfill (~$5 per iteration)

### Rollback plan

| Failure mode | Recovery |
|---|---|
| Migration breaks something (additive — unlikely) | Drop columns + indexes |
| Extractor produces garbage | Revert PR 2; new dishes get no description until prompt fixed; existing populated data harmless |
| UI breaks | Revert PR 3; data stays in columns, just not rendered |
| Backfill cost surprise | Stop the batch; the partial-populated state is fine (mixed cards render correctly because of null-safe UI) |

---

## Out of scope (v1.3)

- **`AddDishModal` description/tags input** — User-added dishes will land with `description = null` and `dietary_tags = []`. Card behavior is null-safe so they render fine. Adding optional inputs is a future enhancement, decided in design but explicitly punted from v1.3 scope to keep the PR set tight.
- **Halal / kosher / pescatarian tags** — Certification territory + rarely labeled. Out for v1.3.
- **Nut-free is in but rarely labeled** — Expect low coverage on cards. Acceptable for v1.3 — the data is correct (we only mark what's labeled); coverage grows as restaurants update menus.
- **Tag-based analytics on user behavior** — How many users filter by vegan? Out of v1.3, deferred to PostHog instrumentation post-launch.
- **Description editing UI for restaurant managers** — Managers can't override the Sonnet-extracted description in v1.3. If a restaurant manager complains, that's a real signal but not a v1.3 blocker.

---

## Implementation notes

- **UI work routes through the `frontend-design` skill** per Dan's direction (`Diet` button, bottom sheet, detail page block, disclaimer styling).
- **Every PR goes through `codex-cli` before commit** per Dan's standing rule (`feedback_run_each_fix_through_codex`).
- **Migration source of truth:** update `supabase/schema.sql` first, then run in Supabase SQL Editor per CLAUDE.md ("Never modify schema.sql without running the change in SQL Editor").
- **Edge Function deploy:** prefer Supabase Dashboard "Edit" UI per `reference_supabase_mcp_limitation` (Dan's MCP only sees the old project; Edge Functions live on Denis's project).
- **No direct Supabase calls from components:** all data access through `src/api/dishesApi.js` + React Query hooks per CLAUDE.md §1.4.
- **Logger only, never `console.*`:** per CLAUDE.md §1.7.
