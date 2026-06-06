# Public Profile Parity (Part 3) — make `/user/:id` read like your own page

**Date:** 2026-06-06
**Status:** Design approved, pending Codex + user review
**Builds on:** Part 1 (food-story grid, shipped) and Part 2 (calm owner header + Grid/Lists/Saved tabs, shipped).

## Problem

Tapping into another user (`/user/:id`, `UserProfile.jsx`) still reads as busier
and less intentional than your own `/profile`. The owner page got the Part 2
declutter; the public page didn't. It already matches on avatar + name + trust
badge + two-tier stats, but it still carries: a big "Review Fingerprint" jitter
card, a heading above the grid (`{display_name}'s Ratings`), old "Journal /
Playlists" tab labels, and a dead location-filter banner. Part 3 aligns the
public page with the owner page — almost entirely removals.

## Decisions (locked in brainstorm)

All four alignment items are in scope. **Keep** the public-only essentials:
Follow button, taste-match % card, the ⋯ report/block menu, the trust badge,
two-tier stats, and the grid.

## Changes — `src/pages/UserProfile.jsx`

### 1. Remove the "Review Fingerprint" jitter card
- Delete the `{jitterBadgeData && (<div className="px-4 pt-3"><ProfileJitterCard .../></div>)}` block (≈ lines 670-681). Trust is already conveyed by the `TrustBadge` on the name row.
- Remove the now-dead `jitterBadgeData` state (`const [jitterBadgeData, setJitterBadgeData] = useState(null)`, line 75) and its `setJitterBadgeData(badges[0])` call (≈ line 188).
- **Keep** the `getJitterBadges([userId])` fetch and `setJitterBadgeType(jitterApi.getTrustBadgeType(badges[0]))` — those still feed the name-row `TrustBadge`.
- **Also fix a pre-existing stale-badge bug while here (Codex):** the jitter result handler only sets the badge when `badges.length > 0` and never clears it, so navigating client-side from a badged profile to an unbadged one leaves a stale `TrustBadge`. In the `badges` branch, add an `else { setJitterBadgeType(null) }` so an empty result clears the badge. (Confirm the exact branch around line 184-189 and add the else.)
- Update the import (line 19): drop `ProfileJitterCard`, keep `TrustBadge` → `import { TrustBadge } from '../components/jitter'`.
- **Delete `ProfileJitterCard` itself only if it has no other consumers.** Grep `ProfileJitterCard` across `src/`; if `UserProfile.jsx` was the only one, delete `src/components/jitter/ProfileJitterCard.jsx` + its barrel export in `src/components/jitter/index.js` (CLAUDE.md: no dead code). If other consumers exist, leave the component and only drop the local usage/import.

### 2. Rename tabs Journal → Grid, Playlists → Lists
- The tab strip (≈ line 720) maps `['journal', 'playlists']` and labels via
  `tab.charAt(0).toUpperCase() + tab.slice(1)`. Switch to a `{ key, label }`
  model — keys unchanged (`journal`/`playlists`), labels **Grid** / **Lists** —
  mirroring the owner profile's tab change. Default tab stays `journal`.

### 3. Drop the "My Ratings" heading above the grid
- In the `activeTab === 'journal'` block (≈ lines 742-768), remove the
  `<div className="px-4 pt-5 pb-1"><h2 …>{profile.display_name}'s Ratings</h2></div>`
  wrapper and the surrounding fragment, rendering `<ProfileGrid …>` directly with
  its existing props (`ratings`/`photoMap`/`loading`/`resetKey`/`emptyTitle`/
  `emptySubtitle` unchanged).

### 4. Remove the dead location-filter banner + its dead code
The feed's `restaurant_town` is not reliably present, so this filter is
vestigial. Remove the whole feature:
- The banner block `{locationFilter && (<div …>Showing picks in …</div>)}` (≈ lines 687-707).
- The filter block `if (locationFilter) { … journalRatings = journalRatings.filter(…) }` (≈ lines 322-330).
- The `restaurant_town` field in the `journalRatings` `.map` object (line 312) — now unused after the filter is gone.
- `const locationFilter = searchParams.get('location')` (line 56).
- `useSearchParams` usage: `const [searchParams, setSearchParams] = useSearchParams()` (line 54) — remove if `searchParams`/`setSearchParams` are now unused (grep first; the banner's `setSearchParams({})` was their only other use). Drop `useSearchParams` from the `react-router-dom` import if no longer referenced.
- `LOCATION_NAMES` (lines 27-31) and `formatLocationName` (lines 33-37) — delete if now unreferenced (they were only used by the banner).

### 5. Remove one trivially-dead import (Codex)
- `PlaylistStripCard` is imported but unused (the page uses `PlaylistGridCard` for the playlists tab). Drop the unused `PlaylistStripCard` import. (Grep to confirm zero uses first.)

## Keep exactly as-is
Header (avatar + name + `TrustBadge` + two-tier stats with tappable follow
counts), the **Taste Compatibility** card, the **Follow** button + ⋯ actions
menu (Report/Block), the `LocalListCard` (curator lists), the blocked-user
short-circuit, and `ProfileGrid` itself.

## Edge cases
- **Blocked-user path** must still short-circuit before the header/grid — do not touch it.
- **Logged-out viewer** — grid + taste-match/Follow gating unchanged.
- **Stale `?location=` URLs** — after removal the param is simply ignored (no banner, no filter); the full grid shows. Acceptable.
- **A user with no jitter badge** — name row already handles `jitterBadgeType` null (no badge); unaffected by removing the card.

## Non-negotiables (CLAUDE.md)
- Brand colors via `var(--color-*)`; no Tailwind color classes.
- No `console.*`; no `toSorted`/`Array.at`.
- No direct Supabase in components.
- No dead code left (remove orphaned imports/vars/helpers/components).
- `ProfileGrid`/`DishListItem` untouched (chrome-only change).

## Testing
- There is no `UserProfile.test.*` today; this is a removal-heavy chrome change verified primarily by build + lint + manual.
- Build passes; lint shows no new errors/warnings in `UserProfile.jsx` (and no newly-unused vars from the removals).
- `npx vitest run` full suite stays green (no regressions).
- Manual / production: public profile shows no jitter card, no "My Ratings" heading, no location banner; tabs read Grid / Lists; Follow + taste-match + ⋯ menu still work; blocked user still blocked.

## Out of scope (YAGNI)
- Follow / taste-match / report-block behavior (kept as-is).
- Any grid/tile change.
- Owner profile (already done in Part 2).
- Re-introducing location filtering in a working form (separate feature if ever wanted).
- **`myRatings` and `ratingBias` dead-code removal (deferred).** Codex flagged both as fetched-but-unused in `UserProfile.jsx`. They live inside the indexed `Promise.allSettled` fetch array, so removing them safely means re-indexing the `results[…]` reads — more delicate than Part 3's surface and easy to get subtly wrong. Left for a focused follow-up cleanup so this change stays low-risk. (Noted, not forgotten.)
