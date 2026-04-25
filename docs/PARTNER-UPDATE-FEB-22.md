# What Changed Since the Unified Merge

**Date:** Feb 22, 2026
**Branch:** `main` (live on Vercel: wghapp.com)
**Since:** commit `42e3275` — "unified merge — partner's polished UI + Denis's infrastructure"
**Commits:** 22 | **Files changed:** 67 | **Lines added:** ~22,000

This covers everything built on top of the merged codebase. Organized by feature area.

---

## 1. Post-Merge Stabilization

Right after combining both codebases, a cleanup pass fixed compatibility and consistency issues.

- **Security & standards compliance** — removed direct Supabase calls from components, wrapped all API errors in `createClassifiedError()`, replaced `console.log` with `logger`
- **Dark mode color fixes** — replaced ~50 hardcoded Tailwind color classes (`text-gray-900`, `bg-white`, etc.) with CSS variable inline styles across every component. Both "Appetite" (light) and "Island Depths" (dark) themes now work correctly everywhere.
- **Bug fixes** — search showing "undefined%" on dishes with no consensus, TownPicker not readable in dark mode, skeleton loading screens using wrong theme colors

---

## 2. Database & Schema Sync

A comprehensive migration brought the production database in sync with the full schema.

- **`comprehensive_schema_sync.sql`** — 2,133 lines. Added all missing tables (`favorites`, `follows`, `events`, `specials`, `badges`, `notifications`, etc.), RPCs, indexes, and RLS policies that existed in `schema.sql` but weren't deployed yet.
- **`handle_new_user` trigger** — automatically creates a profile row when someone signs up via Google OAuth. No manual profile creation needed.
- **`fix_missing_db_objects.sql`** — catch-all for any objects the sync missed.

---

## 3. Trust & Identity System

Made the Jitter Protocol (behavioral biometrics for review authenticity) visible to users.

- **Trust badges on profiles** — "Verified Human" badge shows on Profile and UserProfile pages when the system confirms authentic voting behavior
- **Trust badges on dish pages** — each review card shows the reviewer's trust status
- **Trust banner** — profile page shows a banner explaining your trust level
- **Consensus percentage** — dishes now show Rotten-Tomatoes-style "92% would order again" consensus score
- **OAuth profile auto-fill** — Google sign-in pulls display name and avatar automatically

---

## 4. Google OAuth Setup

- **Frontend complete** — sign-in button, auth flow, redirect handling all wired up
- **Setup guide** at `docs/google-oauth-setup.md` — step-by-step for configuring Supabase Dashboard (Google Cloud Console client ID + secret)
- **Migration guide** at `docs/pending-migrations.md` — tracks what SQL needs to be run in production

---

## 5. Restaurant Management Portal (Upgraded)

The self-service portal for restaurant owners got major upgrades.

- **Menu Import Wizard** (`MenuImportWizard.jsx`) — restaurant managers can paste their menu text and it gets parsed into dishes automatically. Uses an edge function (`supabase/functions/parse-menu/`) to intelligently extract dish names, descriptions, prices, and categories from raw menu text.
- **Dishes Manager** — improved UI for adding/editing/removing dishes with better category handling
- **Specials Manager** — create daily specials with descriptions, prices, and scheduling
- **Events Manager** — post events (live music, wine dinners, etc.) with date/time
- **Pitch system** — `seed-pitch-restaurants.sql` and `generate-pitch-invites.sql` for generating restaurant invite links to onboard MV restaurants

---

## 6. Data Seeding (Making the App Feel Alive)

A huge push to make the app feel populated on day one, not empty.

- **Bad Martha's + Noman's full menus** seeded (58 + 67 dishes)
- **Broader MV seeding** — `seed-broader-mv.sql` adds more restaurants and dishes across all towns
- **Killer lists** — `seed-killer-lists.sql` creates curated "Best Lobster Rolls", "Best Chowder", etc. lists
- **AI review text** — `seed-review-text.sql` adds 683 food-category-specific review templates (lobster, seafood, chowder, etc.) at different rating tiers. These were the initial "make it feel alive" reviews.
- **Vote seeder edge function** — `supabase/functions/seed-reviews/` improved to generate more realistic vote distributions

---

## 7. Dish Page Redesign — "Quick Read, Quick Vote"

The dish page is the most important screen — it's where tourists decide what to order and where foodies leave reviews. Full rework.

- **Section reorder** — Reviews and voting used to be buried below photos, variants, and friend ratings. Now: Hero > Stats > Smart Snippet > Vote buttons > Reviews > everything else. Core content above the fold.
- **Smart snippet** — Best review for each dish shows as a pull quote right below the stats card. Uses the `getSmartSnippetForDish` API that was built but never wired up. Instant social proof.
- **Flattened vote flow** — Was a 2-step process that felt like page navigation (yes/no > animation > slider/review form). Now it's inline: tap yes/no, the slider + review textarea + photo upload expand below the buttons. No page transition, no back button. Review textarea visible immediately — not hidden behind a tap. Biggest friction reducer for getting review text.
- **Review cards restyled** — Look like social posts now: card backgrounds with rounded corners (not divider lines), timestamp in header next to name (like Twitter), rating badge top-right, trust badge bottom. Review text is the visual hero.
- **Order CTA** — "View menu & order" button linking to restaurant website.
- **Design tightening** — Tighter padding, smaller hero, compact stats. More content before scrolling.

---

## 8. Hub Page — "What's Happening"

Brand new page in the bottom nav. Events and specials feed for the island.

- **Smart heading** — "Friday Night", "Saturday Afternoon", etc. based on current time
- **Featured Tonight card** — today's events get a hero card at top
- **Filter tabs** — All / Events / Specials
- **Event + Special cards** with restaurant names, dates, descriptions
- **Empty states** for off-season (restaurants adding events for summer)

Feeds from the `events` and `specials` tables that restaurants manage through their portal.

---

## 9. Home Page — Distance Radius Chip

Tappable radius filter chip on Home: "Within 5 mi". Lets users adjust search distance. Integrates with `LocationContext`.

---

## 10. Bottom Nav Reorder

**Home > Restaurants > Hub > You** (was Home > Hub > Restaurants > You). Restaurants is higher priority for launch.

---

## 11. Real Review Data Pipeline

The app had AI-generated template reviews that read like AI. We replaced them with real human voices.

### Built a 3-step pipeline (`scripts/harvest-reviews.mjs`):

1. **Harvest** — Calls Google Places API for all 96 MV restaurants. Saves 461 real reviews with author names, dates, star ratings, and full text to JSON.
2. **Match** — Quality-filters and matches reviews to specific dishes in our database. Exact dish name matching first, then strong keyword matching. Rejects vague/low-quality reviews. **287 verified matches covering 227 dishes.**
3. **Generate** — Creates SQL INSERT statements with full attribution: real author name, real date, Google rating converted to 10-point scale, match confidence.

### Also:
- 63 hand-curated reviews from food blogs, MV Times, TripAdvisor, local press — real quotes about specific dishes
- Every review tagged with `source_metadata` for "via Google Reviews" attribution
- Pipeline supports Yelp (just needs API key) — would add ~288 more reviews
- **Total: 350 real reviews ready to seed.** Run the SQL in Supabase SQL Editor to activate.

---

## Summary Table

| # | Change | User Impact | Status |
|---|--------|------------|--------|
| 1 | Post-merge stabilization | Dark mode works, no crashes | Live |
| 2 | Database schema sync | All features have backing tables | Live |
| 3 | Trust badges + consensus % | Users see review authenticity | Live |
| 4 | Google OAuth | One-tap sign in | Frontend ready, needs Supabase config |
| 5 | Restaurant portal upgrades | Managers can import menus, post events | Live |
| 6 | Data seeding | App feels populated on day one | Live |
| 7 | Dish page redesign | Faster to read, faster to vote | Live |
| 8 | Hub page | Events & specials feed | Live |
| 9 | Distance radius chip | Better location filtering | Live |
| 10 | Nav reorder | Restaurants more prominent | Live |
| 11 | Real review pipeline | 350 real reviews matched to dishes | SQL needs to be run |

**22 commits. 67 files. ~22,000 lines. $0 in new infrastructure costs.**

---

## What's Next

- **Run the review SQL** — 350 real Google/curated reviews ready to go
- **Configure Google OAuth** in Supabase Dashboard (guide: `docs/google-oauth-setup.md`)
- **Add Yelp reviews** — free API key from fusion.yelp.com, pipeline already supports it
- **Seed Hub events** — populate summer 2026 events so the Hub page has content
- **Restaurant outreach** — pitch invites are generated, ready to send to MV restaurants
