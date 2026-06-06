# Profile = Your Food Story (Instagram-style grid)

**Date:** 2026-06-06
**Status:** Design approved (v2, post-Codex), pending spec review
**Branch:** `feat/profile-food-story-grid` (based on `origin/main`, includes #310/#311 two-tier header stats)

## Problem

The profile page accumulated six independent sections across separate sprints —
hero card, people search, Food Story chalkboard, unrated-photos banner, curator
entry, and a four-tab strip (Journal / Visits / Playlists / Saved). There is no
organizing principle. It reads as "a pile of features," not "an intentional
page." Viewing another user (`/user/:id`) carries most of the same chrome, so a
visitor doesn't get a clean read of *who that person is as an eater*.

## The Idea

Reorganize the profile around a single spine: an **Instagram-style grid of
everything the user has rated** — their food story, told as a visual timeline.
Identity sits at the top; the grid is the body of the page.

## Decisions (locked in brainstorm)

1. **Option A** — a "post" is just a *rating*. No new posting action. The grid
   displays rating history. Rating and posting stay one act.
2. **Tile content (no emojis, ever):**
   - **Photo exists** (the profile user's *own* photo) → full-bleed food photo +
     rating badge + dish/restaurant label.
   - **No photo** → the rating *is* the tile: large `getRatingColor` number +
     dish name + restaurant. **No category icon / emoji.**
   - **No photo + a review** → "quote card": rating + the review in italics +
     dish + restaurant, on a warm-tint background for rhythm.
3. **Newest first** — reverse-chronological (the journey).
4. **Their own photos** — the tile photo is the *profile user's* photo from
   `dish_photos` (keyed by `dish_id, user_id`), **not** the shared
   `dishes.photo_url`. No schema change (the data already exists); this is a new
   join, not a new table.
5. **Phased rollout** — see below. V1 swaps the journal body to a grid; the
   header/identity reorg is V2.

## ⚠️ Correction to an early assumption (caught by Codex review)

The first draft claimed the grid was "free — photos already in the feed." That
was wrong on two counts, both verified in code:

- The existing feeds select `dishes.photo_url` (the dish's single shared
  representative photo), **not** the user's own photo. A user's own photos live
  in `dish_photos` (`onConflict: 'dish_id,user_id'`, see
  `src/api/dishPhotosApi.js`). Showing "their" photos requires joining
  `dish_photos` filtered to the profile's `user_id`. Still no schema change.
- `/profile` and `/user/:id` do **not** expose the same array today. Owner gets
  inline `review_text` via `votesApi.getDetailedVotesForUser()`; the public
  profile gets votes **without** review text in `followsApi.getUserProfile()`,
  then fetches reviews separately via `votesApi.getReviewsForUser()` and joins by
  `dish_id` in `UserProfile.jsx`. V1 must define one shared grid-item contract
  (below) rather than assume a common shape.

## V1 — scope (ship first)

**Goal:** replace the vertical journal feed body with the grid, on both surfaces,
with correct per-user photos and the no-emoji tile logic. No header/identity
restructure.

### Grid item contract (the shared shape)

**Reuse `DishListItem`'s existing normalization — do not invent a new camelCase
shape.** `DishListItem` already normalizes the snake_case/nested dish shape
(`dish_name`, `restaurant_name`, `photo_url`, `rating_10`, `review_text`). The
grid feeds it that same shape, so the `grid` variant is a new *render branch*,
not a new normalization layer (resolves Codex v2 finding #2). The only twist:
**override `photo_url` with the user's own photo** before passing in.

```
gridDish = {
  dish_id, dish_name, restaurant_name,
  rating_10,         // items with null rating are EXCLUDED
  review_text,       // string | null
  photo_url,         // set to the user's OWN photo (dish_photos) or null — NOT dishes.photo_url
  voted_at,          // for sort
}
```

- **Rated-only:** filter out `rating_10 == null` before building items (the
  current `ratedDishes`/`recent_votes` arrays can include null ratings — they are
  misnamed). Filter on both surfaces.
- **Own photo:** a batched lookup behind a **React Query hook**
  (`useUserDishPhotos(userId, dishIds)` → `dishPhotosApi.getUserPhotoMap()`
  returning `{dishId: photoUrl}`), merged client-side to set `photo_url`. **Do
  not** add another page-level `useEffect` for this — `UserProfile.jsx` already
  fetches via `useEffect` (a pre-existing CLAUDE.md §1.4 violation); the new
  lookup must use React Query, not extend that pattern (Codex v2 finding #3).
  This keeps the stabilized profile queries (#310/#311) untouched.
  - *Privacy note:* the photos storage bucket is globally public, so blocking a
    user hides the `dish_photos` DB row (RLS) but not a raw file URL someone
    already holds. Accepted tradeoff for V1 — same as today's dish photos.
- **Review text (both surfaces, explicit — Codex v2 finding #1):** the public
  profile currently fetches `getReviewsForUser(userId)` with a **default
  `limit = 20`** while vote lists cap at 500, so most reviewed items would
  silently degrade to rating-only. V1 fix: fetch reviews up to the same 500 cap
  and **exclude `source = 'ai_estimated'`** (matching the public dish/restaurant
  review paths), then map into `review_text`. Items with no human review →
  `review_text` null → rating-only tile.

### Components

| Component | Status | Responsibility |
|---|---|---|
| `DishListItem` | **extend** | add a `grid` variant (alongside `ranked`/`voted`/`compact`) that renders the square tile per the three-state logic, **reusing the existing normalizer** (no new field shape). Honors CLAUDE.md "DishListItem is THE one list component." Keep the new branch in its own small `renderGridTile()` to avoid bloating the default renderer. |
| `ProfileGrid` | **new (thin)** | 3-col CSS grid wrapper: takes the normalized dish array, sorts newest-first, paginates, renders `DishListItem variant="grid"`, owns the empty state. No per-tile logic. |
| `useUserDishPhotos` | **new hook** | React Query hook → `dishPhotosApi.getUserPhotoMap(userId, dishIds)`; returns `{dishId: ownPhotoUrl}`. No `useEffect`. |
| `JournalFeed` / `JournalCard` | retained | not deleted in V1; still the row view. Revisit removal only once nothing consumes them. |

Rationale for the variant (resolves Codex finding #6): a square media tile is a
genuinely different *layout* from the existing row variants, but the **dish
normalization, rating color, and link target are shared** — so it belongs as a
`DishListItem` variant, not a parallel component that re-implements the same
logic (which `JournalCard` already does and we should not multiply).

### Tile rendering (DishListItem `grid` variant)

- Square (`aspect-ratio: 1/1`), 3 columns, 3px gap, `border-radius: 4px`.
- `ownPhotoUrl` present → full-bleed `object-fit: cover`; rating badge top-right
  (dark translucent pill, number colored by `getRatingColor`); bottom gradient
  label with dish name (700) + restaurant (dimmed), single-line ellipsis each.
- `ownPhotoUrl` null, `reviewText` null → rating-only card: large number
  (`getRatingColor`), dish name + restaurant pinned to the bottom. Background
  `var(--color-card)`.
- `ownPhotoUrl` null, `reviewText` present → quote card: rating number, review in
  italics (3-line clamp, `var(--color-text-secondary)`), dish + restaurant at
  bottom. Warm-tint background (gradient of warm surface tones) for rhythm.
- **No emoji / no `CategoryIcon` in any state.**
- Whole tile is a `<Link to={'/dish/' + dishId}>`.

### Sorting & pagination

- Sort: `slice().sort((a,b) => new Date(b.votedAt||0) - new Date(a.votedAt||0))`
  — **not `toSorted`** (CLAUDE.md 1.1). Null `votedAt` sorts last.
- Feeds cap at 500 items; the grid must **not** mount 500 tiles at once. V1:
  render an initial page (e.g. 30) and lazy-load more on scroll / "Show more,"
  reusing `JournalFeed`'s existing incremental-reveal approach rather than
  inventing a new one.

### Edge cases (V1)

- **Zero rated items:** empty state. Own: "Rate your first dish to start your
  food story →". Other: "Hasn't rated anything yet." (No grid, no crash.)
- **Blocked user** (`/user/:id`): the existing blocked-view path takes
  precedence — grid not rendered. Don't regress this.
- **`?location=` deep link on `/user/:id`:** already vestigial (the feed doesn't
  carry `restaurant_town`). V1 does not add location filtering to the grid; if
  the existing filter code is dead, note it for cleanup but don't expand it.
- **Long names / reviews:** ellipsis (names) and line-clamp (review).
- **Logged-out viewing `/user/:id`:** grid visible; existing signup CTA stays.

### V1 explicitly does NOT touch

- The header / two-tier stats (`#310/#311`) — leave as-is.
- People-search placement, curator entry, unrated-photos banner.
- The Food Story chalkboard (stays where it is for V1).
- Tab IA (Journal→Grid rename is fine; no tab reshuffle).

## V2 — deferred (identity reorg)

Once V1 is live and the grid is proven, do the "intentional page" restructure:

- Header taste-bio one-liner (derived from `computeRatingStyle`; note: public
  profile must compute this too — net-new cross-surface plumbing).
- Convert Food Story chalkboard → IG-style **highlights rings** strip (best find
  / hot take / most loyal / top category). `topCategory` is currently owner-only
  in `useUserVotes`; public needs the same computation.
- People search → 🔍 header icon. Unrated-photos → slim nudge. Curator entry →
  header. Tabs collapse to Grid-first (Grid / Lists / Saved / Visits).

V2 gets its own spec + plan; it is the part that overlaps the recently
stabilized header and therefore deserves its own careful, reviewed pass.

## Non-negotiables checklist (CLAUDE.md)

- No `toSorted`/`Array.at`.
- Brand colors via `var(--color-*)`; rating colors via `getRatingColor`.
- No Tailwind color classes (layout/spacing only).
- No direct Supabase calls in components — photo lookup goes through
  `dishPhotosApi`, feeds through existing hooks/api.
- `DishListItem` remains the one dish-display component (grid is a variant).
- Loading skeletons preserved (`ProfileSkeleton`).

## Testing

- Unit (`DishListItem` grid variant): renders photo tile when `ownPhotoUrl`
  set; rating-only card when no photo/review; quote card when review present;
  **never** renders a `CategoryIcon`/emoji; badge color = `getRatingColor`;
  links to `/dish/:id`.
- Unit (`ProfileGrid`): sorts newest-first; excludes null-rating items; empty
  state at zero; paginates (doesn't mount all 500).
- Unit: `getUserPhotoMap` returns this user's photos only.
- E2E (pioneer): own profile grid renders, tile tap → dish detail.
- E2E (browser): `/user/:id` grid renders; blocked-user path still blocks.
- Visual: an all-no-photo grid still looks intentional (typographic cards).

## Out of scope (YAGNI)

- No new "post"/caption flow.
- No new photo-upload entry beyond the existing rate flow + unrated nudge.
- No grid filter/sort controls (newest-first only).
- No `JournalFeed`/`JournalCard` deletion in V1.
- No schema/RPC changes.
- All V2 items above.

## Resolved by Codex review (decisions locked)

1. **Photo lookup** → batched `getUserPhotoMap` behind a React Query hook (not
   feed-select changes, not `useEffect`).
2. **Public review text** → fetch up to the 500 cap, exclude `ai_estimated`;
   reviews show on public profiles too (no silent degrade-to-rating).
3. **Tile shape** → reuse `DishListItem`'s existing normalizer; override
   `photo_url` with the user's own photo; grid is a new render branch.

## Open question (minor, decide in plan)

- Pagination mechanism: reuse `JournalFeed`'s incremental reveal vs.
  intersection-observer infinite scroll. (Either is fine; reuse preferred.)
