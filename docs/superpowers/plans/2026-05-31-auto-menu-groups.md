# Auto Menu Groups (pills) from menu-refresh

**Date:** 2026-05-31
**Status:** Design approved (decisions locked below); implementation pending
**Context:** Saltie Girl (BentoBox) and Nancy's (manual) both want multiple menu "pills"
(Saltie: All Day vs Brunch; Nancy's: Snack Bar vs Upstairs). Today only Nancy's has pills,
set by hand. We want menu-refresh to create pills automatically when the source clearly
provides distinct menus — without over-pilling or clobbering manual setups.

## Data model (already exists)
- `restaurants.menu_group_order TEXT[]` — ordered pill labels. `>= 2` ⇒ the restaurant page
  shows pills (plus a pooled "Top Rated" tab). `RestaurantDetail.jsx` keys off this.
- `dishes.menu_group TEXT` — which pill a dish belongs to. `NULL` ⇒ shows in the first pill.
- `dishes.menu_section TEXT` — section within a pill (already populated by the extractor).

## Decisions (locked)
1. **Only auto-group from STRUCTURED sources.** Don't ask Sonnet to guess "separate menus vs
   sections" from flat HTML/PDF — too unreliable.
   - **BentoBox JSON-LD** — each tab is a named `@type:Menu` object (All Day, Brunch, Caviar,
     Cocktails, Dessert, Tin List). Deterministic. **Phase 1.**
   - **Sub-page menus** — menu-refresh already crawls `/brunch`, `/dinner`, `/lunch`; the
     slug/page-title names the group. **Phase 2.**
   - Everything else stays single-menu (current behavior), `menu_group = NULL`.
2. **Pill rule = HYBRID (main food menu + named meal-service/venue pills).** We tried two
   rejected approaches first: a service/venue name allow-list (too arbitrary, missed
   idiosyncratic names) and a pure structural "substantial multi-section menu" rule. A corpus
   scan of all 23 BentoBox sites proved the structural rule **over-pills badly** — drink lists
   (Wine, Cocktails, Beverages) and course-tabs (Antipasti, Entrees, Dessert) are multi-section
   too, so Capo got 6 pills incl. Wine/Cocktails. The hybrid that survived:
   - **Main group** = the largest FOOD menu (named, non-drink, non-retail), whatever it's called
     (All Day, Menu, Dinner, Luncheons…).
   - **Extra pill** = a food menu whose name denotes a distinct meal service or venue
     (`MEAL_VENUE_PATTERN`: breakfast, brunch, lunch, dinner, supper, happy hour, late night,
     upstairs, downstairs, patio, rooftop). NOT raw/oyster bar (those are sections).
   - **Fold into main** (NOT pills): drink menus (`DRINK_MENU_PATTERN`: wine/beer/cocktails/
     libations/beverages/drinks/cider…), retail/conservas (`RETAIL_MENU_PATTERN`), and
     course-tabs (Antipasti/Entrees/Dessert and anything else not meal/venue-named).
   - **≥2 groups required** or it stays flat.
   - Validated on the real corpus: 17/23 flat, 6/23 pill — all genuine meal splits (Saltie
     All Day/Brunch; Loco Brunch/Lunch/Dinner/Late Night/Happy Hour; Lincoln's weekday/weekend),
     zero drink or course pills. `MEAL_VENUE_PATTERN` / `DRINK_MENU_PATTERN` are the tunable knobs.
   - Saltie → pills `[All Day, Brunch]`; Caviar/Cocktails/Dessert fold into All Day as sections.
     (Tin List already dropped by the conservas rule.)
3. **The "main" group.** When ≥1 pill-worthy menu exists, all non-pill menus collapse into one
   default group named after the largest non-pill menu (Saltie: "All Day"; fallback label
   "Menu"). `menu_group_order = [mainName, ...pillNames]`.
4. **Only create pills when ≥2 groups result.** Single-group extractions leave `menu_group`
   NULL and DON'T touch `menu_group_order` — preserves today's behavior for the ~150 normal
   restaurants.
5. **Never clobber a manual grouping.** If an extraction yields NO groups but the restaurant
   already has `menu_group_order` set (e.g. Nancy's, sourced non-BentoBox), the upsert must
   PRESERVE existing `menu_group` values instead of nulling them. Guard: only write
   `menu_group` (incl. NULL) when the current extraction actually produced group labels.
   Consider a `restaurants.menu_groups_locked BOOLEAN` for hand-curated cases.

## Architecture
The product logic (pill rule) lives in **code** (testable); Sonnet only propagates labels.

1. **Adapter computes groups** (`bentobox.ts`): each parsed item already carries its source
   Menu name. Apply the pill rule → assign every item a `group` (pill name or the main label).
   Dedup across menus by (group? no —) by (name, section): shared items (towers, crudo) resolve
   to the FIRST menu encountered; iterate main-menu-first so shared items land in the main group
   and the Brunch pill shows only brunch-exclusive items. (Matches one-group-per-dish; the
   pooled "Top Rated" tab still shows everything.)
2. **Serialize with GROUP markers**:
   ```
   GROUP: All Day
   SECTION: Starters
   - ...
   GROUP: Brunch
   SECTION: Brunch Specials
   - ...
   ```
3. **Sonnet propagates** (`MENU_EXTRACTION_PROMPT` + schema): "Lines `GROUP: X` assign every
   following dish to menu_group X until the next GROUP marker. Output `menu_group` per dish, or
   `null` if the menu has no GROUP markers." Sonnet still does category/section/price/dietary —
   it just carries the group label through. (Keeps product logic out of the prompt.)
4. **upsertDishes writes `menu_group`** (new field, same pattern as menu_section).
5. **Handler sets `menu_group_order`** from the distinct groups in extraction order, but only
   when ≥2 groups exist (decision 4) and respecting the no-clobber guard (decision 5).

## Schema / pipeline changes
- `dishes.menu_group` — already exists. No migration.
- `MENU_EXTRACTION_PROMPT` — add the GROUP-marker rule + `menu_group` to the output schema.
- `extractMenuWithClaude` validate/map — pass `menu_group` through (default null).
- `bentobox.ts` — `BentoMenuItem.group`; pill-rule helper `classifyMenuGroups(menuNames)`;
  group-aware serialize; main-menu-first dedup ordering.
- `upsertDishes` — include `menu_group` in insert/update.
- Handler — compute + set `menu_group_order` (guarded); no-clobber on group-less extractions.
- Bump `CURRENT_EXTRACTOR_FINGERPRINT` (`|menu-groups-v1`).

## Phasing
- **Phase 1 — BentoBox.** Covers Saltie now + the other 22 BentoBox sites as they refresh.
  Deterministic, lowest risk. Ship + re-extract Saltie → verify `[All Day, Brunch]` pills.
- **Phase 2 — Sub-page menus.** Name groups from sub-page slug/title; reuse the same pill rule
  + Sonnet propagation. Larger blast radius; do after Phase 1 proves out.

## Risks / edge cases
- **Over-pilling** — mitigated by the service/venue allow-list (decision 2). Revisit the list
  as real menus surface odd names.
- **Shared-item placement** — towers/crudo land in the main group, not Brunch. Acceptable;
  Top Rated pools everything. Document so it's not mistaken for a bug.
- **Nancy's clobber** — decision 5 guard. Verify Nancy's stays `[Snack Bar, Upstairs]` after a
  refresh (her source yields no BentoBox groups).
- **Sonnet drops the GROUP label** — validate post-extraction; if a dish has a section that
  belongs to a known group but `menu_group` is null, backfill from the section→group map the
  adapter already knows.
- **Prompt regression** — adding a field can shift other outputs; validate against real menus
  (Saltie + a single-menu control) per the "validate prompts against real data" rule.
- **Stale `menu_group_order` (known Phase-1 limitation)** — `menu_group_order` is only *set*
  (when ≥2 groups), never *cleared*. If a BentoBox restaurant that had auto-pills later drops
  a menu (e.g. stops brunch), the old pills persist. We can't safely auto-clear because that
  same code path can't distinguish an auto-grouped restaurant from a manually-grouped one
  (Nancy's) without a `menu_groups_locked` flag. Deferred to Phase 2 (add the flag, then
  unlocked restaurants get full set/clear ownership). For now: rare, cosmetic, fixable by hand.

## Verification
- Saltie → `menu_group_order = [All Day, Brunch]`; Brunch pill = brunch-exclusive dishes;
  no tinned items; cocktails/dessert/caviar appear as sections under All Day.
- A normal single-menu restaurant re-extracts unchanged (`menu_group` NULL, no pills).
- Nancy's untouched after a refresh.
