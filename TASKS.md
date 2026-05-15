# TASKS.md — High-Leverage Backlog

> Atomic tasks ranked by impact on correctness, data integrity, UX clarity, or shipping velocity.
> Each task includes acceptance criteria (observable behavior) and likely files to touch.

---

## ~~T01: Remove `profiles_delete_own` RLS policy from schema.sql~~ DONE

**Why:** Users should not be able to delete their own profile row. Doing so would orphan votes, follows, and other FK-referencing data. Owner confirmed this is wrong.

**Acceptance criteria:**
- `schema.sql` no longer contains `profiles_delete_own` policy
- `DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;` has been run in Supabase SQL Editor
- Verified via: `SELECT policyname FROM pg_policies WHERE tablename = 'profiles';` shows no DELETE policy

**Files:** `supabase/schema.sql:398`

---

## ~~T02: Verify production RLS matches schema.sql — clean up duplicate policies~~ DONE

**Why:** `schema.sql:1927-1964` documents known duplicate policies in production (follows, profiles, dishes, specials, storage.objects). If not cleaned up, redundant policies increase evaluation cost on every row access and could create unexpected permission grants.

**Acceptance criteria:**
- Run in Supabase dashboard: `SELECT tablename, policyname, cmd FROM pg_policies ORDER BY tablename, policyname;`
- Compare against `schema.sql` section 3
- Drop any policy that duplicates an existing one
- Document which policies were dropped in DEVLOG.md

**Files:** `supabase/schema.sql` (section 17), `supabase/fix-profiles-rls.sql` (apply or delete)

---

## ~~T03: Fix stale design tokens in CLAUDE.md~~ DONE

**Why:** CLAUDE.md says primary is `#F47A1F` (orange) and rating is `#E6B84C` (gold), but actual CSS uses `#C85A54` (Deep Rust) and `#D9A765` (Warm Gold). This misleads anyone reading CLAUDE.md.

**Acceptance criteria:**
- CLAUDE.md design tokens section matches `src/index.css:35-79`
- Colors listed: Primary `#C85A54`, Accent Gold `#D9A765`, Rating `#6BB384`, BG `#0D1B22`
- Theme name "Island Depths" is mentioned

**Files:** `CLAUDE.md:70-73`

---

## ~~T04: Fix pending vote storage key mismatch in CLAUDE.md~~ DONE

**Why:** CLAUDE.md says key is `wgh_pending_vote` but actual code uses `whats_good_here_pending_vote`. Anyone reading CLAUDE.md would use the wrong key.

**Acceptance criteria:**
- CLAUDE.md localStorage keys section lists the correct key: `whats_good_here_pending_vote`

**Files:** `CLAUDE.md:78`

---

## ~~T05: Migrate `useFavorites` to React Query~~ DONE

**Why:** `useFavorites` uses raw `useEffect` + `useState` for data fetching, violating the stated architecture principle "React Query is the data fetching layer... Never add raw `useEffect` + `fetch` patterns." This means favorites don't benefit from React Query's caching, deduplication, or background refetching.

**Acceptance criteria:**
- `useFavorites` uses `useQuery` for fetching and `useMutation` for add/remove
- Optimistic updates preserved via React Query's `onMutate`/`onError` rollback
- No raw `useEffect` for data fetching remains in the hook
- `npm run build` passes
- `npm run test` passes

**Files:** `src/hooks/useFavorites.js`, `src/api/favoritesApi.js`

---

## ~~T06: Move `LocationContext` to use `storage.js` helpers~~ DONE

**Why:** `LocationContext.jsx` calls `localStorage.getItem/setItem` directly in 6+ places, violating the CLAUDE.md rule "Direct localStorage calls (use `src/lib/storage.js`)". This bypasses the in-memory cache and private-browsing safety wrappers in `storage.js`.

**Acceptance criteria:**
- All `localStorage.getItem`/`setItem` calls in `LocationContext.jsx` replaced with `getStorageItem`/`setStorageItem` from `src/lib/storage.js`
- Behavior unchanged (radius, town, permission state persist across reloads)
- `npm run build` passes

**Files:** `src/context/LocationContext.jsx`

---

## ~~T07: Move `AuthContext` to use `storage.js` helpers for non-Supabase storage~~ DONE

**Why:** `AuthContext.jsx:77-81` directly calls `sessionStorage.removeItem` and `localStorage.removeItem` to clear email. Should use storage helpers for consistency and private-browsing safety.

**Acceptance criteria:**
- Direct `sessionStorage`/`localStorage` calls in `AuthContext.jsx` replaced with `removeStorageItem` from `src/lib/storage.js`
- Sign-out still clears cached email
- `npm run build` passes

**Files:** `src/context/AuthContext.jsx:77-81`, `src/lib/storage.js`

---

## ~~T08: `dishesApi.search` — audit string interpolation in `.or()` for injection safety~~ DONE

**Why:** `dishesApi.search` constructs a PostgREST `.or()` filter with string interpolation: `` .or(`name.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`) ``. While `sanitizeSearchQuery` is called first, PostgREST filter syntax characters (`.`, `,`, `(`, `)`) in the search term could break the filter or produce unexpected behavior. The `.replace(/[.,()]/g, '')` only strips some characters.

**Acceptance criteria:**
- Verify `sanitizeSearchQuery` strips or escapes all PostgREST-significant characters (`.`, `,`, `(`, `)`, `%`, `*`)
- Add a test case: search for `"name.ilike.%"` and confirm it doesn't bypass the filter
- If gaps exist, tighten `sanitizeSearchQuery` or switch to PostgREST's structured filter API

**Files:** `src/api/dishesApi.js:164-170`, `src/utils/sanitize.js`

---

## ~~T09: `dishesApi.getDishById` computes `avg_rating` client-side — use pre-computed column instead~~ DONE

**Why:** `getDishById` fetches all votes for a dish and computes `avg_rating` in JS, but the `dishes` table already has a pre-computed `avg_rating` column maintained by the `update_dish_avg_rating` trigger. The client-side calculation could disagree with the pre-computed value and wastes bandwidth fetching all vote rows.

**Acceptance criteria:**
- `getDishById` returns `dish.avg_rating` directly from the dishes table
- Separate vote fetch only needed for `total_votes` and `yes_votes` counts (or use pre-computed `total_votes`/`yes_votes` columns)
- `npm run build` passes

**Files:** `src/api/dishesApi.js:352-412`

---

## ~~T10: Apply or delete `supabase/fix-profiles-rls.sql`~~ DONE

**Why:** This uncommitted file drops old RLS policies but doesn't create replacements (they already exist in `schema.sql`). It's been sitting as an untracked file. Either apply it in production and delete, or just delete if the old policies were already cleaned up.

**Acceptance criteria:**
- If old policies still exist in production: run the DROP statements in Supabase SQL Editor
- Delete `supabase/fix-profiles-rls.sql` from the repo
- Verify via `SELECT policyname FROM pg_policies WHERE tablename = 'profiles';`

**Files:** `supabase/fix-profiles-rls.sql`

---

## ~~T11: `value_score.sql` migration view lacks `SECURITY INVOKER`~~ DONE

**Why:** The standalone `value_score.sql` migration creates `category_median_prices` view without `WITH (security_invoker = true)`, but `schema.sql:264` has it. If the migration was run after the schema, it may have overwritten the SECURITY INVOKER setting, meaning the view runs as the creator's permissions instead of the caller's.

**Acceptance criteria:**
- Verify in Supabase: `SELECT schemaname, viewname, definition FROM pg_views WHERE viewname = 'category_median_prices';`
- If `security_invoker` is not set, run `CREATE OR REPLACE VIEW` with the `schema.sql:262-271` version
- Update `supabase/migrations/value_score.sql` to include `WITH (security_invoker = true)` for consistency

**Files:** `supabase/migrations/value_score.sql:10-16`, `supabase/schema.sql:262-271`

---

## ~~T12: `ALL_CATEGORIES` has duplicate `seafood` entry~~ DONE

**Why:** `categories.js` line 47 adds `{ id: 'seafood', label: 'Seafood', emoji: '🦐' }` to `ALL_CATEGORIES`, but `seafood` already exists in `MAIN_CATEGORIES` (line 38) which is spread into `ALL_CATEGORIES`. The duplicate means `getCategoryById('seafood')` may return inconsistent results and `matchCategories` returns duplicate suggestions.

**Acceptance criteria:**
- `ALL_CATEGORIES` contains exactly one entry per category ID
- No duplicate IDs in the array
- `matchCategories('seafood')` returns one result, not two

**Files:** `src/constants/categories.js:45-61`

---

## ~~T13: Consensus trigger doesn't re-score existing voters when new consensus is reached~~ DONE

**Why:** `check_consensus_after_vote` (schema.sql:1601-1677) only fires the consensus scoring loop when `consensus_ready` transitions from FALSE to TRUE. Votes cast after consensus is already reached are never scored — they don't get `scored_at` set, don't create `bias_events`, and don't update `user_rating_stats`. This means late voters never see how they compared.

**Acceptance criteria:**
- Votes cast after `consensus_ready = TRUE` are still scored against the consensus
- `bias_events` are created for late voters
- `user_rating_stats` updated for late voters
- OR: document this as intentional behavior with a comment in the trigger

**Files:** `supabase/schema.sql:1601-1677`

---

## ~~T14: `dishes.yes_votes` column exists but is never populated by triggers~~ DONE

**Why:** The `dishes` table has `yes_votes INT DEFAULT 0` (schema.sql:51), but the `update_dish_avg_rating` trigger (schema.sql:1679-1695) only updates `avg_rating` and `total_votes` — it never updates `yes_votes`. The column is always 0 in the database. The RPCs compute yes_votes on-the-fly from the votes table, so the column is effectively dead.

**Acceptance criteria:**
- Either: add `yes_votes` update to the `update_dish_avg_rating` trigger
- Or: remove the `yes_votes` column from `dishes` table if it's truly unused
- Verify no client code relies on `dishes.yes_votes` directly

**Files:** `supabase/schema.sql:51,1679-1695`

---

## ~~T15: No automated CI for `npm run build` or `npm run test`~~ DONE

**Why:** CLAUDE.md mandates "npm run build must pass" and "npm run test must pass" before calling anything done, but there's no CI config (GitHub Actions, Vercel build checks beyond deploy). Regressions can ship silently.

**Acceptance criteria:**
- A `.github/workflows/ci.yml` (or equivalent) runs `npm run build` and `npm run test` on PRs to main
- Or: Vercel build step includes `npm run test` before deploy
- Build failures block merge/deploy

**Files:** New: `.github/workflows/ci.yml` or `vercel.json` build command update

---

## ~~T16: `_archive/` directory in `src/` contains stale backup~~ DONE

**Why:** `src/_archive/BrowseCategoryGrid.jsx.bak` is dead code checked into the repo. Per CLAUDE.md: "Delete unused code immediately — Don't let dead code accumulate."

**Acceptance criteria:**
- `src/_archive/` directory is deleted
- No imports reference it
- `npm run build` passes

**Files:** `src/_archive/BrowseCategoryGrid.jsx.bak`

---

## ~~T17: `get_ranked_dishes` missing `SECURITY DEFINER` — leaks restaurant/dish data via RLS bypass~~ DONE

**Why:** `get_ranked_dishes` is `STABLE` but not `SECURITY DEFINER`. Since restaurants and dishes have public SELECT policies this is fine today, but if SELECT policies were ever tightened (e.g., hiding closed restaurants), the function would respect the caller's RLS and might return inconsistent results depending on auth state. Most other RPCs that need cross-table access use `SECURITY DEFINER`.

**Acceptance criteria:**
- Verify this is intentional: `get_ranked_dishes` only reads public-read tables
- If intentional, add a comment: `-- Intentionally NOT SECURITY DEFINER: all referenced tables have public SELECT`
- If not intentional, add `SECURITY DEFINER`

**Files:** `supabase/schema.sql:538`

---

## ~~T18: Rate limit cleanup is probabilistic — old entries may accumulate~~ DONE

**Why:** `check_and_record_rate_limit` (schema.sql:1461) only cleans up old entries with `random() < 0.01` (1% chance per call). Under low traffic, rate_limits table entries older than 1 hour can accumulate indefinitely. The pg_cron job for value percentiles exists but there's no scheduled cleanup for rate_limits.

**Acceptance criteria:**
- Either: add a pg_cron job to run `DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '1 hour'` hourly
- Or: increase the cleanup probability to 5-10%
- Or: document this as acceptable for the current scale

**Files:** `supabase/schema.sql:1461`

---

## ~~T19: `compute_value_score` trigger lacks `SECURITY DEFINER`~~ DONE

**Why:** Other trigger functions (`on_vote_insert`, `check_consensus_after_vote`, `update_dish_avg_rating`, `update_user_streak_on_vote`) all have `SECURITY DEFINER`. `compute_value_score` (schema.sql:1740) does not, which means it runs with the invoking user's permissions. Since it reads `category_median_prices` view (which has `SECURITY INVOKER`), the chain works today because dishes have public SELECT. But inconsistency with other triggers is a maintenance risk.

**Acceptance criteria:**
- Add `SECURITY DEFINER` to `compute_value_score` for consistency with other trigger functions
- Or: document why it's intentionally different

**Files:** `supabase/schema.sql:1740-1771`

---

## ~~T20: CLAUDE.md project structure section lists `seed.sql` but actual structure is `seed/` directory~~ DONE

**Why:** CLAUDE.md says `supabase/seed.sql` but actual seed data is in `supabase/seed/` with 17+ files. This misleads developers looking for seed data.

**Acceptance criteria:**
- CLAUDE.md project structure updated to show `supabase/seed/` directory
- Mention that seed files are run manually in SQL Editor

**Files:** `CLAUDE.md:36-37`

---

## ~~T21: Add Open/Closed tabs to Restaurants page~~ DONE

**Why:** People search "what's open on MV" — the restaurant list needs Open/Closed filtering.

**Acceptance criteria:**
- Open/Closed tab switcher on restaurant list (defaults to Open)
- Closed restaurants show at 0.6 opacity with "Closed for Season" badge
- Tab-aware empty states
- `npm run build` passes

**Files:** `src/pages/Restaurants.jsx`

---

## ~~T22: Populate menu_section data on all dishes~~ DONE

**Why:** Menu tab showed "Menu not set up yet" because dishes lacked `menu_section` data.

**Acceptance criteria:**
- All dishes have `menu_section` populated based on category mapping
- Each restaurant has `menu_section_order` array in canonical display order
- Migration run in Supabase SQL Editor successfully
- Menu tab shows grouped sections

**Files:** `supabase/migrations/populate-menu-sections.sql`

---

## ~~T23: Redesign Menu tab as split-pane layout~~ DONE

**Why:** Vertical scrolling through all menu sections was too long. Split-pane (section nav left, dishes right) is more intuitive and mirrors real menu navigation.

**Acceptance criteria:**
- Left panel: section names as nav (33% width), gold accent on active
- Right panel: dishes sorted by rating, typographic layout with name/price/rating
- Tapping dish navigates to detail page
- Search filters work across sections
- `npm run build` passes

**Files:** `src/components/restaurants/RestaurantMenu.jsx`, `src/components/restaurants/index.js`

---

## T24: Add dessert dishes to restaurants

**Why:** Desserts category exists in the app but no restaurants have dessert dishes seeded yet.

**Acceptance criteria:**
- Dessert dishes added to relevant restaurants with correct prices
- `category = 'dessert'`, `menu_section = 'Desserts'`
- `menu_section_order` updated to include 'Desserts' for each restaurant
- Template ready at `supabase/seed/menus/add-desserts.sql`

**Status:** Waiting on specific restaurant + dessert list from owner

**Files:** `supabase/seed/menus/add-desserts.sql`

---

## ~~T25: Convert specific restaurants to breakfast menu sections~~ REMOVED

**Reason:** No longer needed — menus are being manually curated to match each restaurant's actual menu.

---

## ~~T33: Simplify Dish Detail Page + Vote Flow~~ DONE

**Why:** Dish page had too much competing for attention — text overlaid the photo, stats bar overlapped, floating CTAs. Vote flow was 5 screens (yes/no → rating → review prompt → write review → photo → share) causing momentum loss.

**What was done:**
- Photo is now pure — no gradient overlay, no text, no CTA
- Dish name, price, restaurant link, and rating live in stats card below photo
- Vote flow collapsed to 2 screens: Yes/No → Rate + optional review + optional photo
- Review field is tap-to-expand ("What stood out?") — doesn't clutter until wanted
- Photo upload moved into vote flow, always tied to a vote
- Share prompt killed (will revisit when app has traction)
- Empty "No reviews yet" placeholder removed
- DishPlaceholder cleaned up (showCTA removed)

**Files:** `src/pages/Dish.jsx`, `src/components/ReviewFlow.jsx`, `src/components/DishPlaceholder.jsx`

---

## ~~T35: Search Engine V2 — Tags, Ranking, Multi-Word Search~~ DONE

**Why:** Search was broken (multi-word queries only used first word), ranking was naive (raw `avg_rating DESC` rewards low-vote dishes), and dishes had no semantic tags for discovery.

**What was done:**
- **32 intent-driven tags** defined in `src/constants/tags.js` across 8 groups (texture, flavor, occasion, dietary, format, price, local, meta)
- **Tag synonym expansion** at query time — "light" also searches fresh, healthy
- **Multi-word search rewrite** — 4-level fallback ladder: phrase match → AND tokens → cross-field (name/category/tags) → OR broadest
- **Bayesian confidence-adjusted ranking** — `dish_search_score()` function with m=3 prior strength, distance bonus, trend bonus
- **Tag population migrations** — round 1 (regex pattern matching) + round 2 (category-wide defaults) achieved 81.8% coverage (1,464/1,790 dishes with 3+ tags)
- **Misspelling normalization** — common food cuisine typos auto-corrected

**Files:** `src/constants/tags.js`, `src/api/dishesApi.js`, `src/api/dishesApi.test.js`, `supabase/schema.sql`, `supabase/migrations/add-search-score.sql`, `supabase/migrations/populate-intent-tags.sql`, `supabase/migrations/populate-intent-tags-round2.sql`, `NOTES.md`

---

## ~~T36: Migrate search to client-side filtering~~ DONE

**Why:** The 4-level Supabase API fallback search ladder made up to 5 sequential network calls for ~300 dishes. On island cell service: 400ms-1.2s per search. We'd already shipped a tag-leak bug from the complexity.

**What was done:**
- `searchDishes()` pure function in `src/utils/dishSearch.js` — single-pass scoring (phrase match 100, all-tokens-in-name 80, cross-field 60, tag overlap 40, partial 20), tag synonym expansion, misspelling normalization, stop words
- `dishesApi.getAllSearchable()` fetches all dishes into React Query cache (~50KB, 5-min staleTime)
- `useAllDishes` hook wraps the cache; `useDishSearch` rewritten to filter locally via `useMemo`
- `DishSearch.jsx` and `Browse.jsx` switched from direct API calls to the hook
- Deleted `dishesApi.search()` (~230 lines) and old mock-heavy tests (~148 lines)
- 33 new pure-function tests, 454 total unit tests passing
- Search is now ~1ms (zero network), works offline after first load

**Files:** `src/utils/dishSearch.js`, `src/utils/dishSearch.test.js`, `src/hooks/useAllDishes.js`, `src/hooks/useDishSearch.js`, `src/api/dishesApi.js`, `src/components/DishSearch.jsx`, `src/pages/Browse.jsx`

---

## T34: Dish placeholder photos

**Why:** Dishes without user photos show a generic restaurant avatar or category neon icon. The placeholder situation needs a better solution — either better generated placeholders, a prompt to upload, or a different visual treatment.

**Status:** Needs design thinking

**Files:** `src/components/DishPlaceholder.jsx`, `src/components/RestaurantAvatar.jsx`

---

## T26: Homepage — trust signal, emotional hook, brand signature — IN PROGRESS

**Why:** After the layout simplification (Feb 13), the homepage is clean and functional but lacks magnetism.

**What's done (Feb 15):**
- Brand font established: Aglet Sans Bold (700) via Adobe Fonts (Typekit) for all "What's Good Here" headings
- Two-font system: Aglet Sans (brand header) + DM Sans (everything else)
- #1 Hero Card: `NumberOneHero` component — typographic hero announcement for top-ranked dish with gold accent
- "The Contenders" section header for ranks #2-10 (replaces generic "Top 10")
- Inline search: results render directly on homepage without page navigation
- Category nav: compact 44px photo circles with labels in horizontal scroll
- CSP fix for Adobe Fonts on deployed versions

**What's done (Feb 16):**
- Contender rows (2-10) aligned to top-to-bottom reading flow matching hero card — rating moved below restaurant name
- Chevron removed from finalist rows (4-10)
- Expandable category lists — "Show all N [Category]" / "Show less" toggle when >10 dishes

**What's done (Feb 17):**
- Light mode now default — V1 white + orange theme (every user tested preferred it)
- Theme CSS swapped: light = `:root`, dark = `[data-theme="dark"]`
- Hero card dramatic redesign: 28px/800 gold dish name, 36px rating, gold edge glow, floating shadow
- Typography hierarchy: heavier brand title (800), lighter tagline (400)
- Richer coral primary `#E45A35`, warmer medal gold `#C48A12`
- Silver/bronze podium rows sized up
- Category icons: floating shadows, 1.05x scale on active
- Search bars white across all pages

**What's remaining:**
- Trust signal: deferred until vote counts are more impressive (live stats looked empty)
- Category icon PNGs need transparent backgrounds (currently baked peach circles)
- Logo animation: creative brief written (`docs/plans/2026-02-15-logo-creative-brief.md`), needs external designer
- Further brand signature refinement as the visual identity matures

**Files:** `src/pages/Home.jsx`, `src/components/home/SearchHero.jsx`, `src/components/home/Top10Compact.jsx`

---

## T27: Add OG image for social sharing previews

**Why:** `index.html` references `/og-image.png` but the file doesn't exist. When someone shares the app link on Instagram, iMessage, Slack, or Twitter — no preview image shows up. This makes the app look broken or unfinished on every share.

**Acceptance criteria:**
- `public/og-image.png` exists (1200x630px)
- Image shows app branding (logo, tagline, dark background matching Island Depths theme)
- Sharing the app URL on iMessage/Instagram/Twitter shows the image in the preview card
- `index.html` og:image and twitter:image URLs resolve correctly

**Status:** Ready — needs design asset created then dropped into `public/`

**Files:** `public/og-image.png`, `index.html`

---

## T28: Dynamic OG meta tags via Vercel edge middleware (pre-launch)

**Why:** Every shared link shows the same generic preview: "What's Good Here — Find the best dishes..." When someone shares a specific dish like `/dish/abc123`, the preview should say "Lobster Roll at Larsen's Fish Market" with the dish photo. Without this, shared links have no context and get fewer clicks. Client-side solutions (`react-helmet-async`) don't work because social crawlers (Facebook, iMessage, Twitter) don't execute JavaScript.

**Approach:** Vercel edge middleware that detects crawler user agents, fetches dish/restaurant data from Supabase, and returns a minimal HTML page with correct og:title, og:description, og:image. Normal users get the regular SPA.

**Acceptance criteria:**
- Vercel middleware intercepts crawler requests to `/dish/:id` and `/restaurants/:id`
- Dish links preview as `{dish_name} at {restaurant_name}` with dish photo and rating summary
- Restaurant links preview with restaurant name
- Non-crawler requests pass through to SPA unchanged
- `npm run build` passes

**Status:** Deferred to pre-launch

**Files:** `middleware.js` (new), `vercel.json`

---

## T29: Add apple-touch-icon for iOS home screen

**Why:** When someone adds the app to their iPhone home screen, iOS looks for an `apple-touch-icon`. Without one, it takes a screenshot of the page instead of showing the app icon. Makes the home screen shortcut look unprofessional.

**Acceptance criteria:**
- `<link rel="apple-touch-icon" href="/wgh-icon.png">` added to `index.html` (or a dedicated 180x180px icon)
- Icon displays correctly when adding to iOS home screen
- Icon matches app branding

**Status:** Ready

**Files:** `index.html`, potentially `public/apple-touch-icon.png`

---

## ~~T30: Fix BrowseCard hooks-after-early-return (crash risk)~~ DONE

**Why:** `BrowseCard.jsx` has `if (!dish) return null` on line 11, before `useState`/`useRef`/`useEffect` calls on lines 12+. Violates React Rules of Hooks. Will crash the component tree if a dish transitions from truthy to falsy between renders.

**Acceptance criteria:**
- All hooks called before any early return
- `if (!dish) return null` guard moved below all hook calls
- No "Rendered fewer hooks than expected" error when dishes update

**Status:** Ready — CRITICAL

**Files:** `src/components/BrowseCard.jsx:11-41`

---

## ~~T31: Add error handling to Profile page async operations~~ DONE

**Why:** `handleSaveName`, `handleVote`, and `adminApi.isAdmin()` call in Profile.jsx have no try-catch. Failed saves leave the UI in a broken state with no feedback. `handleToggleFavorite` in Browse.jsx also unhandled.

**Acceptance criteria:**
- `handleSaveName` wrapped in try-catch, shows error message on failure
- `handleVote` refetch wrapped in try-catch, logs on failure
- `adminApi.isAdmin()` has `.catch()` handler
- `handleToggleFavorite` in Browse.jsx wrapped in try-catch

**Files:** `src/pages/Profile.jsx`, `src/pages/Browse.jsx`

---

## ~~T32: Fix DishSearch inputRef null check~~ DONE

**Why:** `inputRef.current.contains(e.target)` in the click-outside handler lacks optional chaining. Race condition during unmount can crash. Browse.jsx already does this correctly with `?.`.

**Acceptance criteria:**
- `!inputRef.current?.contains(e.target)` with optional chaining

**Files:** `src/components/DishSearch.jsx:56`

---

## ~~T37: Local Hub — Events, Specials & Automated Scraping~~ DONE (Denis)

**What was done:**
- Events table + RLS policies + EventCard component
- EventsManager for restaurant admin portal
- Restaurant scraper edge function (menu + events)
- Scraper dispatcher for batch processing
- Menu refresh edge function
- Specials now support `is_promoted` and `source` fields

**Files:** `supabase/schema.sql`, `supabase/functions/restaurant-scraper/`, `src/components/EventCard.jsx`, `src/components/restaurant-admin/EventsManager.jsx`

---

## ~~T38: Memorial Day Launch Infrastructure~~ DONE (Denis)

**What was done:**
- Jitter Protocol (behavioral biometrics for human verification)
- Review seeding via Google Places + Claude Haiku
- Vote source weighting (ai_estimated at 0.5x)
- TrustBadge component for review provenance
- Google Places integration (autocomplete, details, nearby search)
- AddRestaurantModal with duplicate detection
- Restaurant map (Leaflet)
- OG image generation (Vercel serverless)
- Social share rewrites for rich previews

**Files:** Multiple — see `docs/plans/2026-02-21-memorial-day-launch-design.md`

---

## ~~T39: Fix source weighting inconsistency~~ DONE

**Why:** `update_dish_avg_rating` trigger used `AVG(rating_10)` treating all votes equally, but RPCs (`get_ranked_dishes`, `get_restaurant_dishes`) weight `ai_estimated` at 0.5x. Dish detail pages showed different ratings than Browse listings.

**What was done:**
- Fixed trigger to apply `0.5x` weighting for `ai_estimated` source votes
- Migration includes one-time recompute of all dish ratings
- `variant_stats` CTE was already correct (inherits from `dish_stats` which applies weighting)

**Files:** `supabase/schema.sql:1846`, `supabase/migrations/fix-avg-rating-source-weighting.sql`

---

## ~~T40: Convert TopDishCard hardcoded hex to CSS variables~~ DONE

**Why:** 16 hardcoded hex colors in TopDishCard.jsx breaking dark mode (Island Depths theme).

**What was done:**
- All `#FFFFFF`, `#1A1A1A`, `#BBBBBB`, `#E4440A`, `#16A34A`, `#999999`, `#F5F5F5`, `#FFF0EB`, `#E0E0E0` converted to CSS variables
- Dark mode now works correctly for restaurant dish cards

**Files:** `src/components/restaurants/TopDishCard.jsx`

---

## ~~T41: Homepage Toggle — Kill BottomSheet, Add List/Map Modes~~ DONE

**Why:** The BottomSheet half-state was always a compromise — neither map nor list got full attention. Users couldn't commit to either mode.

**What was done:**
- Replaced BottomSheet with two committed full-screen modes (List default, Map toggle)
- Floating pill FAB (bottom-right) toggles between modes
- List mode: search + category chips + ranked dish list
- Map mode: search + zoom/radius + full-screen Leaflet with pins
- Scroll position preserved across mode switches
- Dish detail "See on map" button navigates to homepage in map mode
- BottomNav center tab renamed from "Map" to "Home"

**Files:** `src/pages/Map.jsx`, `src/components/ModeFAB.jsx`, `src/components/BottomNav.jsx`, `src/pages/Dish.jsx`

---

### Binary vote removal — Phase 2 (follow-up PR, ~1 release after Phase 1 deploys)

- [ ] Drop server-side shadow-write in `submit_vote_atomic` (param becomes NULL-passthrough).
- [ ] Drop `p_would_order_again` parameter from `submit_vote_atomic`.
- [ ] Drop `yes_votes`, `percent_worth_it` from `get_ranked_dishes`, `get_restaurant_dishes`, `get_dish_variants` return signatures.
- [ ] Drop `would_order_again` from `get_friends_votes_for_dish`, `get_friends_votes_for_restaurant`.
- [ ] Drop `would_order_again` from the `public_votes` view.
- [ ] Update `seed-reviews` Edge Function: insert `NULL` instead of deriving; update snippet-generation to not depend on it.
- [ ] Drop legacy PostHog event name `vote_submitted` (keep `rating_submitted`).
- [ ] Also drop the photo Keep/Replace/Remove UI dependency on `authApi.getUserVoteForDish` returning a `photo_url` — either add the projection back or wire a dishPhotosApi.getMyPhotoForDish helper and pass `existingPhotoUrl` into ReviewFlow from Dish.jsx.

Do NOT start Phase 2 until Phase 1 has been live for ≥7 days and Sentry shows no regressions from stale bundles.

---

## T42: Post-App-Store data quality sweep — menus, hours, closed restaurants

**Why:** App is feature-complete and submitted to Apple (2026-05-15). The bar from here is *care*, not features. Anyone who opens the app over Memorial Day weekend tries 3–5 places — every menu needs to be real, every restaurant they tap needs to actually be open, every "9.5 lobster roll" needs to be at a place serving lobster rolls *today*. Stale data is the single biggest credibility risk now that the trust UX is solid.

**Attack in this order — no point refreshing menus for places that closed last year.**

### 1. Permanently closed restaurants
- Pull `business_status` from Google Places for every restaurant in `restaurants` where `google_place_id IS NOT NULL`
- Anything returning `CLOSED_PERMANENTLY` → hide or flag for manual review
- Anything returning `CLOSED_TEMPORARILY` → log to a separate review list (might be off-season, not gone)
- Script lives in `scripts/` or as a one-shot Edge Function call
- Acceptance: zero `CLOSED_PERMANENTLY` restaurants visible in the homepage/restaurants list

### 2. Seasonal-only restaurants not yet open
- MV is ~half "Memorial Day → Columbus Day." Some places are still dark this week.
- Heuristic: no Google review in the last 30 days = probably not open yet
- Flag these for a "Opens soon" badge or hide until first recent activity
- Don't auto-delete; many will open within days

### 3. Stale menus
- Query `restaurants` where `menu_last_refreshed_at IS NULL OR menu_last_refreshed_at < now() - interval '30 days'`
- Trigger `menu-refresh` Edge Function for each (Sonnet-backed per memory; quality is decent)
- Batch with rate limiting — Google Places + Anthropic API both have quotas
- Acceptance: median `menu_last_refreshed_at` < 14 days across active restaurants

### 4. Garbage dishes
- Find dishes where any of: name matches placeholder regex (`^Item \d+$`, `^Menu Item`, pure numeric), `price IS NULL`, `description IS NULL OR description = ''`, `category IS NULL`
- These are the ones that look bad on a dish detail page or in search results
- Acceptance: zero dishes with placeholder names; reasonable price/description coverage on top-ranked dishes

**Files / surfaces:** new audit scripts in `scripts/` (e.g. `audit-closed-restaurants.mjs`, `audit-stale-menus.mjs`, `audit-garbage-dishes.mjs`); possibly a one-off Edge Function for bulk menu-refresh; updates to `restaurants` table flagging hidden/seasonal entries (may need a new `visibility_status` column).

**Do NOT block on Apple verdict.** This work ships independently — every fix improves the live web experience immediately, and rides into the next TestFlight automatically.

Spec: `docs/superpowers/specs/2026-04-12-binary-vote-removal-design.md`.
