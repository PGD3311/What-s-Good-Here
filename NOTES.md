# Project Notes

A living reference document. Updated as the project evolves.

---

## Build Order Tracker

What we actually did (left) vs. ideal order (right). Left side updated as work continues.

```
WHAT WE DID                             IDEAL ORDER (for next time)
────────────────────────────────────    ────────────────────────────────────
Jan 6-7 (Week 1)                        Week 1: Foundation
├─ Schema + Auth + UI + Data            ├─ Discovery & spec document
│  (all in one commit)                  ├─ Define MVP scope + metrics
├─ Category additions (14 commits)      ├─ Architecture decisions
└─ No design system                     └─ Design tokens & patterns

Jan 11-14 (Week 2)                      Week 2: Data & Core
├─ Image debugging (10+ commits)        ├─ Schema (with room to grow)
├─ Pizza animations (premature)         ├─ API layer structure
├─ Navigation structure (late)          ├─ Auth flow (properly tested)
├─ 20+ redesign commits                 └─ Seed data strategy
└─ Design tokens (finally)

Jan 14-15 (Week 3)                      Week 3: Core Flow
├─ Auth bug fixes (6+ commits)          ├─ Core screens (Home, Browse)
├─ Refactor: AuthContext, API layer     ├─ Primary user flow
├─ Analytics added (late)               ├─ Analytics instrumentation
└─ Testing setup                        └─ Error handling

Jan 15-16 (Week 4)                      Week 4: Polish
├─ Gamification & impact feedback       ├─ Secondary features
├─ Photo quality system                 ├─ Polish & animations
├─ TopBar brand anchor                  ├─ Onboarding flows
├─ Welcome splash for first-timers      └─ Testing & QA
└─ Build retrospective

Jan 19-20 (Week 5)                      Week 5: Social & Identity
├─ Dark mode overhaul → Island Depths   ├─ Social system (follows, profiles)
├─ Custom SVG category icons            ├─ Gamification (streaks, badges)
├─ Profile polish, analytics            └─ Theme/identity finalization
└─ PostHog vote events for pitching

Jan 22 (Week 6)                         Week 6: Hardening
├─ Full social system (follows,         ├─ Security audit & RLS cleanup
│  public profiles, notifications)      ├─ Schema hardening (search_path,
├─ User search & follow lists           │  FK indexes, auth caching)
├─ Taste compatibility                  ├─ Error handling audit
└─ Rating comparisons on profiles       └─ CI / automated testing

Jan 23-27 (Week 7)                      Week 7: Congruence
├─ Security: rate limits, CSP,          ├─ Spec & task documentation
│  schema hardening (search_path)       ├─ Codebase-wide consistency pass
├─ Share mechanic (post-vote)           ├─ Migration cleanup
├─ HEIC photo support                   └─ Pre-launch QA
└─ Back button fix in vote flow

Jan 28+ (Week 8)                        Week 8: Stability
├─ SDD: SPEC.md, TASKS.md, CLAUDE.md   ├─ Performance optimization
├─ Congruence pass (32 files:           ├─ Edge case testing
│  CSS vars, classified errors,         └─ Launch prep
│  storage helpers, React Query)
├─ Completed 13/20 audit tasks
├─ Restaurant menu view
├─ Consensus trigger fix (late voters)
└─ RLS policy cleanup (16 duplicates)
────────────────────────────────────    ────────────────────────────────────
```

### Ideal Build Order — Explained

Why each item belongs in its week. Reference for next project.

#### Week 1: Foundation

| Item | What It Means | Why It Goes First |
|------|--------------|-------------------|
| **Discovery & spec document** | Write down what you're building before writing code. Who's the user? What's the core loop? What does "done" look like? | Everything downstream depends on knowing what you're building. Without this, you end up with 14 category commits because you're figuring it out as you go. |
| **Define MVP scope + metrics** | Draw a hard line around what ships v1. Pick 2-3 numbers that tell you if it's working (e.g., votes per user, return visits). | Prevents scope creep. Gamification landed Week 4, social features Week 6 — some of that might not have been needed for launch. A scope doc forces the "not yet" conversation early. |
| **Architecture decisions** | Choose your stack, decide on data access patterns (API layer vs direct calls), pick your state management approach, settle auth strategy. | These are expensive to change later. AuthContext was refactored in Week 3, the API layer in Week 3 — because these weren't decided upfront. Every refactor is rework. |
| **Design tokens & patterns** | Define your color palette, typography, spacing scale, and component patterns before building any UI. | Design tokens didn't land until end of Week 2, then the entire theme was overhauled in Week 5 (Island Depths). That's two full visual rewrites. Tokens-first means you paint once. |

#### Week 2: Data & Core

| Item | What It Means | Why Week 2 |
|------|--------------|------------|
| **Schema with room to grow** | Design your database tables thoughtfully — think about relationships, constraints, and fields you'll need for features on your roadmap. Add nullable columns for future use. | Schema changes after you have data are painful. The `yes_votes` column (T14) is dead because the trigger was never updated. A deliberate schema design phase catches these gaps. |
| **API layer structure** | Build the `src/api/` abstraction layer before any UI touches the database. Define the pattern: how errors are handled, how RPCs are called, how results are transformed. | UI was built first, then the API layer was extracted in Week 3. That meant every component had direct Supabase calls that all had to be migrated. API-first means UI only ever knows one pattern. |
| **Auth flow (properly tested)** | Implement login, session persistence, redirects, and edge cases (expired tokens, magic link return) with test coverage. | There were 6+ auth bug fix commits in Week 3. Auth is foundational — if it's flaky, users can't vote, can't save favorites, can't do anything. Get it rock-solid before building on top. |
| **Seed data strategy** | Plan how you'll populate the database for development and demos. Script it so it's repeatable. | Ended up with 17+ seed files in `supabase/seed/`. Having a strategy early means every developer (and every demo) starts from the same known state. Ad-hoc seeding leads to inconsistent test data. |

#### Week 3: Core Flow

| Item | What It Means | Why Week 3 |
|------|--------------|------------|
| **Core screens (Home, Browse)** | Build the 2-3 screens that represent the primary user journey. No bells and whistles — just the skeleton with real data flowing through. | With foundation (Week 1) and data layer (Week 2) done, you can now build screens that actually work end-to-end. You're not guessing at the data shape or fighting auth bugs. |
| **Primary user flow** | The one path that matters most: Browse dishes → Vote → See result. Make this feel complete and tight before anything else. | This is your product. If this flow is broken or clunky, nothing else matters. Gamification, photos, social features — none of it helps if the core vote loop doesn't feel good. |
| **Analytics instrumentation** | Add event tracking (PostHog, etc.) to the core flow from the start. Track votes, page views, search queries. | Analytics were added "late" in Week 3. The problem: you miss all the early user behavior data. If you instrument from the start, you have data to inform every decision that follows. |
| **Error handling** | Build your `createClassifiedError` pattern, user-friendly messages, loading states, and failure recovery. | Errors are inevitable. Without a pattern, each component handles errors differently (or not at all). The error handling audit much later had to retrofit 32 files. Doing it in Week 3 means every screen built after this has errors handled correctly from day one. |

#### Week 4: Polish

| Item | What It Means | Why Week 4 |
|------|--------------|------------|
| **Secondary features** | Features that enhance but aren't core: favorites, photo uploads, restaurant detail pages, search refinements. | The core flow is solid. Now layer on features that make users stay longer or come back. These are additive — if any one of them breaks, the app still works. |
| **Polish & animations** | Micro-interactions, transitions, loading skeletons, hover states. The things that make it feel "premium." | Polish on a broken foundation is wasted effort. Pizza animations were built in Week 2 before the nav structure existed — that work was thrown away. Polish after function. |
| **Onboarding flows** | Welcome splash, first-time user guidance, tooltip explanations. | You need a working app to onboard someone into. Building onboarding before the app works means you're onboarding people into something that might change. Week 4 is when the app is stable enough to guide someone through. |
| **Testing & QA** | Write tests for the core flow, run through edge cases (no votes, null prices, missing photos), cross-browser testing. | You have a working, polished app. Now stress-test it. This is where you'd catch the `toSorted()` Safari crash, the ES2023+ issues, the edge cases with 0 votes. Finding these before users do is the whole point. |

#### Week 5: Social & Identity

| Item | What It Means | Why Week 5 |
|------|--------------|------------|
| **Social system (follows, profiles)** | The follows table, public profiles, user search, follow lists, notifications — the whole social graph. | Social features touch many tables and create complex relationships (follows, notifications, taste compatibility). You need a stable core app first because social features multiply the surface area for bugs. |
| **Gamification (streaks, badges)** | Streak tracking, badge evaluation, leaderboards — the retention mechanics. | Gamification only works if users are already doing the core action (voting). Build it after the vote flow is polished so the rewards feel earned, not forced. Also, badge criteria depend on vote data patterns you can only understand after the core flow exists. |
| **Theme/identity finalization** | Lock in the final visual identity. No more color palette changes after this. | There were two theme overhauls (initial → dark mode → Island Depths). Ideally you'd explore visual identity in Week 1 (tokens), build with it through Weeks 2-4, and finalize in Week 5 after seeing it with real content. One final pass, then it's locked. |

#### Week 6: Hardening

| Item | What It Means | Why Week 6 |
|------|--------------|------------|
| **Security audit & RLS cleanup** | Review every RLS policy, verify they match your schema, remove duplicates, ensure no unintended access. | With all features built, you can now audit the full attack surface. 16 duplicate RLS policies were found and a DELETE policy that could orphan data. These audits only make sense when the schema is stable. |
| **Schema hardening** | Pin `search_path` on functions, add FK indexes for join performance, fix `auth.uid()` caching, add `SECURITY DEFINER` where needed. | These are the "you won't notice until production" issues. FK indexes prevent slow cascading queries at scale. `search_path` pinning prevents schema injection. Do this after features are done because schema changes during active development create noise. |
| **Error handling audit** | Grep every API file for unclassified errors, verify every page has loading states, ensure no raw error objects render. | Classified errors were retrofitted across 32 files. If the error pattern existed from Week 3, this audit is a quick verification pass instead of a massive refactor. |
| **CI / automated testing** | GitHub Actions running `npm run build` and `npm run test` on every PR. | T15 is still open. CI is Week 6 because you need tests to exist first (Week 4) and a stable codebase to avoid noisy false failures. Once it's set up, it catches regressions automatically. |

#### Week 7: Congruence

| Item | What It Means | Why Week 7 |
|------|--------------|------------|
| **Spec & task documentation** | Write SPEC.md (what exists today), TASKS.md (what's left), keep CLAUDE.md accurate. | After all features are built and hardened, document the system as-is. This is your handoff document — for future you, for collaborators, for AI assistants. Doing it earlier means constant rewrites as things change. |
| **Codebase-wide consistency pass** | Ensure every file follows the same patterns: CSS variables not Tailwind colors, storage helpers not raw localStorage, logger not console.log, React Query not raw useEffect. | The congruence pass touched 32 files. In the ideal world, this is smaller because patterns were established early. But a final sweep always finds stragglers. |
| **Migration cleanup** | Reconcile `schema.sql` with what's actually in production. Archive old migrations. Verify every RPC name matches. | There were stale migration files, a `fix-profiles-rls.sql` sitting untracked, and `_archive/` backup files. Clean house before launch so the repo reflects reality. |
| **Pre-launch QA** | Full end-to-end testing on real devices. Safari, Chrome, slow connections, first-time users, power users. | The last gate before real users. Everything should be working — this is about finding the 5% of issues that only show up in real conditions. |

#### Week 8: Stability

| Item | What It Means | Why Week 8 |
|------|--------------|------------|
| **Performance optimization** | Lazy loading, bundle splitting, query optimization, image compression. Measure first, then fix. | Premature optimization wastes time. By Week 8, you have real usage patterns and can measure what's actually slow. The `lazyWithRetry()` pattern is a good example — but you'd also profile RPC query times, bundle size, and initial load. |
| **Edge case testing** | What happens with 0 votes? Null prices? Missing photos? A dish with no restaurant? A user who follows nobody? | These are the bugs that embarrass you in demos. Systematic edge case testing after everything is built catches the long tail of issues that unit tests miss. |
| **Launch prep** | DNS, monitoring alerts, error tracking thresholds, rollback plan, seed production data, invite beta testers. | The app is done. Now make sure the infrastructure is ready for real traffic. Sentry alerts, PostHog dashboards, a plan for if something breaks at 2am. |

---

### Recent Work (update this as you go)
| Date | What Changed | Category |
|------|--------------|----------|
| Feb 14 | Hero tagline "the #1 bite near you": muted coral uppercase whisper below title | Design |
| Feb 14 | Headlines elevated: "MV Top 10 Right Now" at 19px bold rust, category headlines match | Design |
| Feb 14 | Disabled personal Top 10 toggle + favorite categories in Profile (code preserved for later) | Feature |
| Feb 14 | Icon row elevated: muted food photos (brightness/saturation filters), toned-down town picker | Design |
| Feb 14 | Hero typography hierarchy: title→tagline tight (one idea), tagline→search tighter (next action) | Polish |
| Feb 14 | Restaurant-first hierarchy: restaurant name leads everywhere (cards, search, browse, profile, dish detail) | Design |
| Feb 14 | Category pills redesigned: vertical chips (icon top, label below), no boxes/borders, 56px circles | UX |
| Feb 14 | Town picker: ocean waves + filled gold pin, matches category pill style and size | UX |
| Feb 14 | Category scroll alignment: left-aligned under search box, tightened icon spacing to 4px | Polish |
| Feb 14 | Browse results match Top 10 style: podium 1-3, Apple grouped list 4-10, no emojis | Design |
| Feb 14 | Search dropdown matches Top 10 compact row style: rank + restaurant · dish + rating | Design |
| Feb 14 | Ranks 4-10: Apple-style grouped list (surface bg, inset dividers, chevrons, two-line layout) | Design |
| Feb 14 | Fixed light-mode bleed on restaurant menu nav dark theme | Bugfix |
| Jan 17 | Category architecture: shortcuts not containers | Architecture |
| Feb 13 | Homepage simplification: removed emoji medals, card wrapper, gradients, uppercase labels | Design |
| Feb 13 | Categories moved to horizontal scroll under town picker | UX |
| Feb 13 | Added fish, clams, chicken, pork to browse shortcuts (19 total) | Data |
| Feb 13 | Divider color fix: gold→rust tint to prevent green on dark navy | Design |
| Jan 17 | Browse reduced to 14 curated shortcuts | UX |
| Jan 17 | Search now returns results sorted by rating | Feature |
| Jan 16 | Added quesadilla category, fixed steak items | Data |
| Jan 16 | Category cleanup: steak, chicken, seafood split | Data |
| Jan 16 | Welcome splash (tap to dismiss) | Onboarding |
| Jan 16 | TopBar with brand tint | Polish |
| Jan 16 | Responsive logo scaling | Polish |
| Jan 16 | Photo quality + tiers | Feature |
| Jan 15 | Gamification phase 1 | Feature |
| Jan 15 | Sentry + PostHog | Infrastructure |
| Jan 15 | API layer refactor | Architecture |

---

## Ranking: Bayesian Prior Strength (m)

The `dish_search_score()` function uses Bayesian shrinkage to adjust ratings by vote confidence. The `m` parameter controls how many votes a dish needs before its score reflects its actual rating vs the global mean.

**Current value: m=3** (early stage, few votes per dish)

| Total app votes | Set m to | Why |
|----------------|----------|-----|
| 0-500 | **3** | Early data. Need rankings to feel responsive. |
| 500-1000 | **5** | Moderate data. Can afford more skepticism. |
| 1000+ | **10** | Mature data. 10 is the ceiling — don't go higher. |

**How to change:** Update the single `v_prior_strength` constant in `dish_search_score()` in Supabase SQL Editor. One line, 30 seconds.

**How to check current vote count:** `SELECT COUNT(*) FROM votes;`

---

## Design Tokens (Dual Theme)

Defined in `src/index.css`. Light "Appetite" is the default (`:root`); dark "Island Depths" toggled via `[data-theme="dark"]` on `<html>`. Controlled by `ThemeContext` + `wgh_theme` localStorage key.

### Default — Appetite (Light)
| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#E45A35` (Warm Coral) | CTAs, primary actions |
| `--color-accent-gold` | `#E9A115` (Warm Yellow) | Links, secondary accents |
| `--color-accent-orange` | `#E07856` (Warm Orange) | Hover states |
| `--color-rating` | `#16A34A` (Bright Green) | Rating displays |
| `--color-text-primary` | `#1A1A1A` (Near Black) | Main text |
| `--color-text-secondary` | `#6B7280` (Cool Gray) | Secondary text |
| `--color-text-tertiary` | `#9CA3AF` (Light Gray) | Tertiary text |
| `--color-text-on-primary` | `#FFFFFF` (White) | Text on primary-colored backgrounds |
| `--color-bg` | `#F0ECE8` (Warm Stone) | Page background |
| `--color-surface` | `#F7F4F1` (Near White) | Surface areas |
| `--color-surface-elevated` | `#FFFFFF` (White) | Cards, modals |
| `--color-card` | `#FFFFFF` (White) | Card backgrounds |
| `--color-medal-gold` | `#C48A12` (Warm Amber) | #1 rank, gold medal |
| `--color-category-strip` | `#FADCC8` (Warm Orange) | Category icon area |

### Toggle — Island Depths (Dark)
| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#C85A54` (Deep Rust) | CTAs, primary actions, danger |
| `--color-accent-gold` | `#D9A765` (Warm Gold) | Links, secondary accents |
| `--color-accent-orange` | `#E07856` (Warm Orange) | Hover states |
| `--color-rating` | `#6BB384` (Muted Green) | Rating displays, success |
| `--color-text-primary` | `#F5F1E8` (Soft Cream) | Main text |
| `--color-text-secondary` | `#B8A99A` (Warm Taupe) | Secondary text |
| `--color-text-tertiary` | `#7D7168` (Brown Gray) | Tertiary text |
| `--color-text-on-primary` | `#1A1A1A` | Text on primary-colored backgrounds |
| `--color-bg` | `#0D1B22` (Deep Charcoal-Navy) | Page background |
| `--color-surface` | `#0F1F2B` | Slightly lighter surface |
| `--color-card` | `#1A3A42` (Navy-Teal) | Card backgrounds |

---

## Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Body | DM Sans | 400 | 14-16px |
| Headings | DM Sans | 600-700 | 18-24px |
| Labels | DM Sans | 500 | 12-14px |
| Hints | DM Sans | 400 | 12px |

---

## Spacing Scale

Using Tailwind defaults:
- `1` = 4px
- `2` = 8px
- `3` = 12px
- `4` = 16px
- `6` = 24px
- `8` = 32px

---

## Key File Locations

| What | Where |
|------|-------|
| Design tokens | `src/index.css` (lines 1-30) |
| API layer | `src/api/*.js` |
| React hooks | `src/hooks/*.js` |
| Auth context | `src/context/AuthContext.jsx` |
| Location context | `src/context/LocationContext.jsx` |
| Page components | `src/pages/*.jsx` |
| Shared components | `src/components/*.jsx` |
| Supabase client | `src/lib/supabase.js` |
| Database schema | `supabase/schema.sql` |

---

## Category Architecture (LOCKED)

**Core principle:**
```
If it exists, it's searchable.
If it's popular, it gets a shortcut.
If it's good, it rises.
```

**Categories are shortcuts, NOT containers.**

- Browse shows ~19 curated, high-frequency categories only
- These are shortcuts to common decisions ("best X near me")
- Browse is NOT meant to be exhaustive

**Dishes without Browse shortcuts:**
- Still fully searchable by name
- Appear on restaurant pages
- Votable and rankable
- Live in search + rankings, not Browse

**Data model:**
- A dish can have 0, 1, or many categories
- Categories do NOT own dishes
- Search is the universal access layer

**UX implications:**
- No "See all categories" - Browse is intentionally curated
- Search must find ANY dish by name
- Category absence ≠ dish absence

---

## Browse Shortcuts (19 curated)

These appear on the Browse page and Home page category scroll:

| Shortcut | Why Included |
|----------|--------------|
| Pizza | High frequency |
| Burgers | High frequency |
| Tacos | High frequency |
| Wings | High frequency |
| Sushi | Clear decision |
| Breakfast | Clear decision |
| Lobster Roll | MV signature |
| Seafood | MV signature |
| Chowder | MV signature |
| Pasta | Common decision |
| Steak | Common decision |
| Sandwiches | Common decision |
| Salads | Common decision |
| Tenders | Common decision |
| Desserts | Common decision |
| Fish | MV signature |
| Clams | MV signature |
| Chicken | Common decision |
| Pork | Common decision |

---

## Searchable-Only Dishes

These categories/dishes exist and are searchable but don't have Browse shortcuts:

- Apps, Appetizers, Calamari
- Breakfast Sandwiches
- Clams (strips, bellies, steamers)
- Entrees, Main courses
- Fries, Sides
- Poke Bowls
- Soups (non-chowder)
- Quesadillas
- Fried Chicken
- Specific wing flavors
- Any niche or one-off dishes

**Remember:** These dishes still rank, still appear on restaurant pages, still get votes. They just don't clutter Browse.

---

## Photo Quality Tiers

Defined in `src/constants/photoQuality.js`:

| Tier | Score Range | Placement |
|------|-------------|-----------|
| Featured | 90-100 | Hero image, top of gallery |
| Community | 70-89 | Standard gallery |
| Hidden | 0-69 | Only visible in "See all" |
| Rejected | N/A | Not uploaded (fails hard gates) |

### Hard Gates (instant reject)
- File size > 10MB
- Resolution < 800px (shortest side)
- Not JPEG/PNG/WebP
- Too dark (avg brightness < 30)
- Too bright (avg brightness > 240)

---

## localStorage Keys

| Key | Purpose |
|-----|---------|
| `whats-good-here-auth` | Supabase auth session |
| `wgh_has_seen_splash` | Welcome splash shown flag |
| `wgh_has_onboarded` | Welcome modal (name entry) shown |
| `whats_good_here_pending_vote` | Vote data saved before auth (5-min TTL) |
| `wgh_remembered_email` | Email for magic link convenience |

---

## Dish Variants System

Parent-child relationship for dishes with multiple flavors/styles (e.g., Wings → Buffalo, BBQ, Garlic Parm).

### How It Works

| Dish Type | `parent_dish_id` | Behavior |
|-----------|------------------|----------|
| Standalone | NULL | Shows normally with its own votes |
| Parent | NULL (has children) | Shows aggregated stats from children |
| Child variant | UUID (points to parent) | Hidden from main lists, shown when expanding parent |

### Database Columns

```sql
dishes.parent_dish_id  -- NULL = parent/standalone, UUID = child variant
dishes.display_order   -- Sort order within variant list (lower = first)
```

### Linking Variants

```sql
-- Find dishes to link
SELECT id, name, restaurant_id FROM dishes WHERE name ILIKE '%wings%';

-- Link children to parent
UPDATE dishes SET parent_dish_id = 'PARENT_ID', display_order = 1 WHERE id = 'CHILD_ID';
UPDATE dishes SET parent_dish_id = 'PARENT_ID', display_order = 2 WHERE id = 'ANOTHER_CHILD_ID';
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `get_restaurant_dishes(uuid)` | Returns parent dishes with aggregated variant stats |
| `get_dish_variants(uuid)` | Returns all variants for a parent dish |
| `get_ranked_dishes(...)` | Excludes child variants, shows parents only |

### UI Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `VariantPicker` | `src/components/VariantPicker.jsx` | Expandable variant list |
| `VariantBadge` | `src/components/VariantPicker.jsx` | "X flavors" badge |
| `VariantSelector` | `src/components/VariantPicker.jsx` | Horizontal pill selector |

### API Methods

```js
dishesApi.getVariants(parentDishId)     // Get variants for a parent
dishesApi.hasVariants(dishId)           // Check if dish has variants
dishesApi.getParentDish(dishId)         // Get parent info for a variant
dishesApi.getSiblingVariants(dishId)    // Get other variants of same parent
```

---

## Category Icon Prompt Templates

For generating category icons used in the plate circles on Home/Browse. PNGs stored in `public/categories/`. Referenced via `CATEGORY_NEON_IMAGES` in `src/constants/categories.js`.

### Dark Mode — Island Depths (dark navy bg `#0D1B22`)

Vibrant, slightly luminous colors that pop against deep navy. The current icons use this.

```
[Category Name]

Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a [food item]. Color palette: [color 1 name] [hex], [color 2 name] [hex], [color 3 name] [hex]. Transparent background, designed for a dark navy background.
```

**Example (Sandwiches — Dark):**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a sandwich. Color palette: warm bread amber #C89858, muted deli filling #A08868, soft lettuce green #7A9A6A. Transparent background, designed for a dark navy background.
```

### Light Mode — Appetite (warm stone bg `#F0ECE8`, card `#F2CDBC`)

Deeper, richer, more saturated tones that stand out against the copper peach card color. The icon circle uses `#F2CDBC` (30% atmosphere / card color) which reads as a warm plate sitting on the `#F0ECE8` stone background.

```
[Category Name]

Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a [food item]. Color palette: [color 1 name] [hex], [color 2 name] [hex], [color 3 name] [hex]. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

#### All 19 Light Mode Prompts

**1. Pizza:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a pizza slice. Color palette: rich tomato red #B83A2A, golden melted cheese #C8922A, toasted crust brown #8B6842. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**2. Burgers:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a burger. Color palette: seared patty brown #6B3A28, golden bun amber #B87D3A, fresh lettuce green #4A7A3A. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**3. Seafood:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a shrimp. Color palette: deep coral #C45A42, ocean teal #2A7A7A, shell pink-brown #9A6252. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**4. Wings:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of chicken wings. Color palette: hot sauce red-orange #C44A22, crispy golden brown #A87A3A, charred amber #7A5228. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**5. Sushi:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of sushi rolls. Color palette: salmon orange #C86A42, nori dark green #2A5A3A, rice cream #B8A882. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**6. Breakfast:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of eggs and bacon on a plate. Color palette: egg yolk gold #C89A2A, crispy bacon burgundy #8A3A2A, warm toast brown #A87A52. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**7. Lobster Rolls:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a lobster roll. Color palette: lobster red #B84A32, buttered bun gold #C89A52, butter cream #A88A52. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**8. Chowder:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a bowl of chowder. Color palette: creamy bisque #B89A6A, ceramic bowl brown #7A5A3A, herb green #4A6A3A. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**9. Pasta:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a plate of pasta. Color palette: rich marinara red #B84232, golden pasta #C8A252, basil green #3A6A2A. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**10. Steak:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a steak. Color palette: seared beef burgundy #7A2A22, charred crust brown #5A3A28, rosemary green #4A6A42. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**11. Sandwiches:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a sandwich. Color palette: toasted bread brown #A67C52, roasted meat sienna #7A4B32, deep olive green #4A6B3A. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**12. Salads:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a salad bowl. Color palette: deep leafy green #3A6A2A, tomato red #B84A32, wooden bowl brown #8A6A42. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**13. Tacos:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a taco. Color palette: corn tortilla gold #B88A3A, seasoned meat brown #7A4A2A, cilantro green #3A7A3A. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**14. Tenders:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of chicken tenders. Color palette: crispy golden #B88A32, fried coating amber #9A7232, dipping sauce red #B84A2A. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**15. Desserts:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a slice of cake. Color palette: rich chocolate brown #6A3A22, strawberry red #B84252, frosting cream #A89A72. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**16. Fish:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a whole fish. Color palette: ocean blue-teal #2A6A7A, silver scale grey #6A7A7A, lemon gold #C8A232. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**17. Clams:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of clam shells. Color palette: shell sand brown #8A7252, deep ocean teal #2A5A6A, pearl cream #A89A7A. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**18. Chicken:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of a roasted chicken leg. Color palette: roasted golden brown #A87A32, crispy skin amber #8A6228, herb sage green #4A6A42. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

**19. Pork:**
```
Flat vector icon in the style of Zach Roszczewski. Soft rounded shapes, limited color palette (3-4 colors max), subtle tonal shading within each color, no black outlines, smooth gradients for depth, friendly and approachable, polished emoji aesthetic, slightly dimensional but not fully 3D, clean geometric forms with organic warmth. Icon of pork ribs. Color palette: smoked meat burgundy #7A3A2A, BBQ glaze brown #9A5A32, char amber #6A4A28. Flat solid circular background #F2CDBC, no plate, no rim, no shadow — just the food icon on a plain colored circle. Use rich, saturated mid-tones — no pastels. Clean and editorial.
```

### Poster / Zine Style — Bold black outlines + coral-orange fill (transparent bg)

For the homepage redesign. PNGs stored in `public/categories/poster/`. Referenced via `posterIcons` map in `src/components/home/CategoryIcons.jsx`. Generated via ChatGPT image generation.

**Base prompt template:**
```
Simple bold food icon of a [FOOD ITEM]. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**1. Pizza:** ✅ Done

**2. Burger:**
```
Simple bold food icon of a hamburger with bun, patty, and cheese. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**3. Seafood:**
```
Simple bold food icon of a seafood boil with shrimp, corn on the cob, and a crab leg spilling out. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**4. Wings:**
```
Simple bold food icon of a chicken wing drumette with bone sticking out. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**5. Sushi:**
```
Simple bold food icon of a nigiri sushi piece, fish on rice. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**6. Breakfast:**
```
Simple bold food icon of a fried egg sunny side up. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**7. Lobster Roll:**
```
Simple bold food icon of a lobster claw, single open claw. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**8. Chowder:**
```
Simple bold food icon of a steaming bowl of soup with steam curls. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**9. Pasta:**
```
Simple bold food icon of a fork twirling spaghetti noodles. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**10. Steak:**
```
Simple bold food icon of a T-bone steak with visible bone. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**11. Sandwich:**
```
Simple bold food icon of a triangle sandwich half with visible layers. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**12. Salad:**
```
Simple bold food icon of a salad bowl with leafy greens poking out. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**13. Taco:**
```
Simple bold food icon of a taco with curved shell and fillings. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**14. Tendys (Chicken Tenders):**
```
Simple bold food icon of two crispy chicken tenders/strips crossed. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**15. Dessert:**
```
Simple bold food icon of a cupcake with swirled frosting. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**16. Fish:**
```
Simple bold food icon of a whole fish with tail fin and eye. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**17. Clams:**
```
Simple bold food icon of an open clam shell with ridged texture. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**18. Chicken:**
```
Simple bold food icon of a roasted chicken drumstick with bone. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

**19. Pork:**
```
Simple bold food icon of a pork chop with bone on one side. Thick black outlines (4px+ stroke weight), flat fill using only coral-orange #E4440A and white. No gradients, no shadows, no texture, no background. Cartoon pictogram style — chunky confident shapes, minimal detail, instantly readable at 32px. Like a bold screen-printed sticker or punk food zine illustration. Clean vector, transparent background. Square format.
```

---

---

## For Denis: Feb 25 Session Changes (Dan's side)

Hey Denis — here's what changed today on Dan's branch. Sending this so your Claude can review and make sure nothing conflicts with your 67-commit merge.

### What changed

**1. Map page crash fix (CRITICAL)**
- `lazyWithRetry(() => import('./pages/Map'), 'Map')` requires a **named export** (`export function Map()`), not a default export. We accidentally changed it and the whole page crashed with a cryptic React error. Every page file must match: `lazyWithRetry(..., 'Name')` expects `export function Name()`.

**2. Icons swapped from neon to poster**
- All `CategoryIcon` imports now point to `src/components/home/CategoryIcons.jsx` (the poster PNGs — thick black outlines, red-orange fill) instead of the neon `CategoryIcon.jsx`.
- The poster system has ~50 dish-name-specific icons (fish sandwich, eggs benedict, calamari, etc.) via the `dishNameIcons` array. Dish name matching runs before category fallback.
- Added: pizza, salmon, tuna, swordfish, roasted/rotisserie chicken overrides.
- Map pins also use poster icons now via `getPosterIconSrc()`.

**3. Map page list uses same ranking as Home**
- Was using `useMapDishes` (raw `avg_rating` sort). Now uses `useDishes` (the `get_ranked_dishes` RPC) for the bottom sheet list. Same algorithm, same order on both pages.

**4. Map list → pin interaction (new)**
- Tapping a dish in the map's bottom sheet list now: collapses the sheet, flies the map to that restaurant's pin, enlarges the pin (44px → 60px) with a glowing coral border, shows the mini-card. Previously it just navigated to the dish page — no way to find the restaurant on the map.

**5. Bottom nav reordered**
- New order: Hub, Map, Home, Restaurants, You (Home in center)

**6. Homepage cleanup**
- Removed `TopDishesNearYou` horizontal row (redundant with Map page)
- Town picker stays, radius picker stays on Map only

**7. Dish icon sizes**
- Home page dish list icons bumped to 50px
- Map page category chip icons at 46px

### Dan's reflection

> "I like this flow now. More interactive. It's still janky but it's getting there. Simplicity is work. Learning that now."

The map interaction pattern (tap list item → fly to pin → pin lights up) is the right direction. It makes the connection between the list and the physical place. Still rough around the edges — the pin coordinates are approximate (not geocoded), the transition could be smoother, and clustered restaurants are hard to distinguish. But the bones are there.

### Files touched
- `src/pages/Map.jsx` — list tap handler, focusDishId state, useDishes for ranking
- `src/pages/Home.jsx` — removed TopDishesNearYou
- `src/components/BottomNav.jsx` — reordered tabs
- `src/components/CategoryChips.jsx` — poster icon import
- `src/components/DishListItem.jsx` — poster icon import, size 50, dishName prop
- `src/components/CategoryPicker.jsx` — poster icon import
- `src/components/restaurants/TopDishesNearYou.jsx` — poster icon import
- `src/components/restaurants/RestaurantMap.jsx` — poster icons, FlyToLocation, selected pin glow
- `src/components/home/CategoryIcons.jsx` — added getPosterIconSrc export, new dish overrides
- `src/components/profile/JournalCard.jsx` — poster icon import
- `src/pages/Discover.jsx` — poster icon import

*Last updated: Feb 25, 2026*

### Apple Vault Keys

- `apple_encryption_master_key_v1` — AES-256-GCM key for `user_apple_tokens.encrypted_refresh_token` and `pending_apple_revocations.encrypted_refresh_token`. Corresponds to `key_version = 'v1'` in those tables.
- `apple_signing_key_v1` — contents of the `.p8` private key from Apple Developer portal. Used to sign Apple client secret JWTs. Uploaded in B3-activate.
- `apple_team_id`, `apple_key_id_v1`, `apple_services_id`, `apple_bundle_id` — non-secret identifiers kept in Vault for deployment consistency and single-lookup loading in `_shared/apple.ts`.
- Key rotation: write a new vault secret `apple_encryption_master_key_v2`, update encryption-write paths to use v2, leave decryption paths reading key by `key_version` column. Re-encryption of existing rows is a background job (post-launch).
