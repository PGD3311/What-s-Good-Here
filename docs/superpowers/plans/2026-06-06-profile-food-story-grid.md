# Profile Food-Story Grid (V1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vertical journal feed on `/profile` and `/user/:id` with an Instagram-style grid of the user's rated dishes — their own photos where they posted one, typographic rating/quote cards (no emoji) otherwise, newest-first.

**Architecture:** A new `grid` variant of the existing `DishListItem` renders one square tile (photo / rating-only / quote-card). A thin `ProfileGrid` wrapper filters to rated-only, overrides each tile's photo with the *profile user's own* photo (from `dish_photos` via a new batched API + React Query hook), sorts newest-first, and paginates. Both pages build the same snake_case dish array and hand it to `ProfileGrid`. No schema changes. V2 (header/identity reorg) is a separate plan.

**Tech Stack:** React 19, React Query (@tanstack/react-query), Vitest + React Testing Library, Supabase JS, Tailwind (layout only), CSS variable design tokens.

**Spec:** `docs/superpowers/specs/2026-06-06-profile-food-story-grid-design.md`

---

## File Structure

- `src/api/dishPhotosApi.js` — **modify**: add `getUserPhotoMap(userId, dishIds)` (batched own-photo lookup).
- `src/hooks/useUserDishPhotos.js` — **create**: React Query hook wrapping `getUserPhotoMap`.
- `src/api/votesApi.js` — **modify**: `getReviewsForUser` — raise default limit, exclude `ai_estimated`.
- `src/components/DishListItem.jsx` — **modify**: add `variant === 'grid'` branch + `renderGridTile()`.
- `src/components/profile/ProfileGrid.jsx` — **create**: grid wrapper (filter/override/sort/paginate/empty).
- `src/components/profile/index.js` — **modify**: export `ProfileGrid`.
- `src/pages/Profile.jsx` — **modify**: swap `JournalFeed` → `ProfileGrid` in the journal tab; wire own-photo map.
- `src/pages/UserProfile.jsx` — **modify**: swap `JournalFeed` → `ProfileGrid`; build dish array from votes + reviews; wire own-photo map; preserve blocked-user path.
- Tests alongside each new/changed unit.

---

## Task 1: `getUserPhotoMap` API method

**Files:**
- Modify: `src/api/dishPhotosApi.js` (add method near `getUserPhotoForDish`, ~line 270)
- Test: `src/api/dishPhotosApi.getUserPhotoMap.test.js` (create)

- [ ] **Step 1: Write the failing test**

```js
// src/api/dishPhotosApi.getUserPhotoMap.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

var selectResult = { data: [], error: null }
var inMock = vi.fn(() => Promise.resolve(selectResult))
var neqMock = vi.fn(() => ({ in: inMock }))
var eqMock = vi.fn(() => ({ neq: neqMock }))
var selectMock = vi.fn(() => ({ eq: eqMock }))
vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({ select: selectMock })) },
}))

import { dishPhotosApi } from './dishPhotosApi'

describe('dishPhotosApi.getUserPhotoMap', () => {
  beforeEach(() => { selectResult = { data: [], error: null } })

  it('returns {} for empty inputs without querying', async () => {
    expect(await dishPhotosApi.getUserPhotoMap(null, [])).toEqual({})
    expect(await dishPhotosApi.getUserPhotoMap('u1', [])).toEqual({})
  })

  it('maps dish_id -> photo_url for the given user', async () => {
    selectResult = {
      data: [
        { dish_id: 'd1', photo_url: 'http://x/1.jpg', status: 'featured' },
        { dish_id: 'd2', photo_url: 'http://x/2.jpg', status: 'community' },
      ],
      error: null,
    }
    var map = await dishPhotosApi.getUserPhotoMap('u1', ['d1', 'd2'])
    expect(map).toEqual({ d1: 'http://x/1.jpg', d2: 'http://x/2.jpg' })
    expect(eqMock).toHaveBeenCalledWith('user_id', 'u1')
    expect(neqMock).toHaveBeenCalledWith('status', 'hidden')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/dishPhotosApi.getUserPhotoMap.test.js`
Expected: FAIL — `getUserPhotoMap is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add this method inside the `dishPhotosApi` object (after `getUserPhotoForDish`):

```js
  /**
   * Batched lookup of a specific user's own photos for a set of dishes.
   * Used by the profile grid to show "their" photo (not the shared
   * dishes.photo_url). Excludes moderation-hidden photos.
   * @param {string} userId
   * @param {string[]} dishIds
   * @returns {Promise<Object>} { [dishId]: photo_url }
   */
  async getUserPhotoMap(userId, dishIds) {
    try {
      if (!userId || !dishIds || dishIds.length === 0) return {}
      const { data, error } = await supabase
        .from('dish_photos')
        .select('dish_id, photo_url, status')
        .eq('user_id', userId)
        .neq('status', 'hidden')
        .in('dish_id', dishIds)
      if (error) throw createClassifiedError(error)
      const map = {}
      for (const row of data || []) {
        // First non-hidden photo per dish wins; prefer 'featured' if seen later.
        if (!map[row.dish_id] || row.status === 'featured') {
          map[row.dish_id] = row.photo_url
        }
      }
      return map
    } catch (error) {
      logger.error('Error fetching user photo map:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/dishPhotosApi.getUserPhotoMap.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/dishPhotosApi.js src/api/dishPhotosApi.getUserPhotoMap.test.js
git commit -m "feat(profile): add dishPhotosApi.getUserPhotoMap for per-user grid photos"
```

---

## Task 2: `useUserDishPhotos` React Query hook

**Files:**
- Create: `src/hooks/useUserDishPhotos.js`
- Test: `src/hooks/useUserDishPhotos.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/hooks/useUserDishPhotos.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/dishPhotosApi', () => ({
  dishPhotosApi: { getUserPhotoMap: vi.fn(() => Promise.resolve({ d1: 'p1' })) },
}))

import { useUserDishPhotos } from './useUserDishPhotos'
import { dishPhotosApi } from '../api/dishPhotosApi'

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useUserDishPhotos', () => {
  it('returns {} and does not query when disabled', () => {
    const { result } = renderHook(() => useUserDishPhotos(null, []), { wrapper })
    expect(result.current).toEqual({})
    expect(dishPhotosApi.getUserPhotoMap).not.toHaveBeenCalled()
  })

  it('returns the photo map when enabled', async () => {
    const { result } = renderHook(() => useUserDishPhotos('u1', ['d1']), { wrapper })
    await waitFor(() => expect(result.current).toEqual({ d1: 'p1' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useUserDishPhotos.test.jsx`
Expected: FAIL — cannot find module `./useUserDishPhotos`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/hooks/useUserDishPhotos.js
import { useQuery } from '@tanstack/react-query'
import { dishPhotosApi } from '../api/dishPhotosApi'

/**
 * Returns { [dishId]: ownPhotoUrl } for a given user across the supplied dish
 * IDs. Used by the profile grid to render the profile user's OWN photo.
 */
export function useUserDishPhotos(userId, dishIds) {
  const ids = dishIds || []
  const { data } = useQuery({
    queryKey: ['userDishPhotos', userId, ids.slice().sort()],
    queryFn: () => dishPhotosApi.getUserPhotoMap(userId, ids),
    enabled: !!userId && ids.length > 0,
    staleTime: 1000 * 60 * 5,
  })
  return data || {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useUserDishPhotos.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUserDishPhotos.js src/hooks/useUserDishPhotos.test.jsx
git commit -m "feat(profile): add useUserDishPhotos React Query hook"
```

---

## Task 3: Public reviews — full coverage, exclude AI

**Files:**
- Modify: `src/api/votesApi.js` — `getReviewsForUser` signature + query (~line 608)
- Test: `src/api/votesApi.getReviewsForUser.test.js` (create)

**Why:** Public profile maps these reviews onto grid tiles. Default `limit = 20`
silently dropped most reviews (vote lists cap at 500), and AI-estimated reviews
were not excluded. The `public_votes` view exposes a `source` column
(`supabase/schema.sql:460`).

- [ ] **Step 1: Write the failing test**

```js
// src/api/votesApi.getReviewsForUser.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

var captured = {}
function makeBuilder() {
  var b = {}
  b.select = vi.fn(() => b)
  b.eq = vi.fn((col, val) => { captured[col] = val; return b })
  b.not = vi.fn(() => b)
  b.neq = vi.fn(() => b)
  b.order = vi.fn(() => b)
  b.range = vi.fn((from, to) => { captured.range = [from, to]; return Promise.resolve({ data: [], error: null }) })
  b.in = vi.fn(() => Promise.resolve({ data: [], error: null }))
  return b
}
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(() => makeBuilder()) } }))
vi.mock('../utils/errorHandler', () => ({ createClassifiedError: (e) => e }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

import { votesApi } from './votesApi'

describe('votesApi.getReviewsForUser', () => {
  beforeEach(() => { captured = {} })

  it('defaults to a 500-row range and excludes ai_estimated', async () => {
    await votesApi.getReviewsForUser('u1')
    expect(captured.range).toEqual([0, 499])
    expect(captured.source).toBe('user')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/votesApi.getReviewsForUser.test.js`
Expected: FAIL — range is `[0, 19]` and `captured.source` is undefined.

- [ ] **Step 3: Edit the implementation**

In `src/api/votesApi.js`, change the signature default and add the source filter:

```js
  async getReviewsForUser(userId, { limit = 500, offset = 0 } = {}) {
```

And in the `public_votes` select chain, add `.eq('source', 'user')` immediately
after `.eq('user_id', userId)`:

```js
        .eq('user_id', userId)
        .eq('source', 'user')
        .not('review_text', 'is', null)
        .neq('review_text', '')
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/votesApi.getReviewsForUser.test.js`
Expected: PASS.

- [ ] **Step 5: Run the existing votesApi suite to check for regressions**

Run: `npx vitest run src/api/ -t "Reviews"`
Expected: PASS (no other caller depends on the old limit default).

- [ ] **Step 6: Commit**

```bash
git add src/api/votesApi.js src/api/votesApi.getReviewsForUser.test.js
git commit -m "fix(profile): full review coverage + exclude AI reviews in getReviewsForUser"
```

---

## Task 4: `DishListItem` grid variant

**Files:**
- Modify: `src/components/DishListItem.jsx` (add branch after the `voted` branch, ~line 81; add `renderGridTile` after `renderVotedCard`, ~line 498)
- Test: `src/components/DishListItem.grid.test.jsx` (create)

**Tile logic (no emoji, ever):** photo present → photo + badge + label; no photo + no review → rating-only card; no photo + review → quote card (warm tint). Reads `dish.photo_url` (already overridden to the user's own photo by `ProfileGrid`), `dish.rating_10`, `dish.review_text`.

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/DishListItem.grid.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DishListItem } from './DishListItem'

function renderTile(dish) {
  return render(
    <MemoryRouter>
      <DishListItem dish={dish} variant="grid" />
    </MemoryRouter>
  )
}

describe('DishListItem grid variant', () => {
  it('renders the food photo when photo_url is present', () => {
    renderTile({ dish_id: 'd1', dish_name: 'Tuna crudo', restaurant_name: 'The Port', rating_10: 9, photo_url: 'http://x/1.jpg' })
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe('http://x/1.jpg')
    expect(screen.getByText('Tuna crudo')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('renders a rating-only card (no img, no emoji) when there is no photo or review', () => {
    renderTile({ dish_id: 'd2', dish_name: 'Lobster roll', restaurant_name: 'The Bite', rating_10: 10, photo_url: null })
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('Lobster roll')).toBeInTheDocument()
  })

  it('renders the review as a quote card when present without a photo', () => {
    renderTile({ dish_id: 'd3', dish_name: 'Fried oysters', restaurant_name: "Nancy's", rating_10: 8, photo_url: null, review_text: 'Crispy and briny' })
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText(/Crispy and briny/)).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('links to the dish detail page', () => {
    renderTile({ dish_id: 'd4', dish_name: 'X', restaurant_name: 'Y', rating_10: 7, photo_url: null })
    expect(screen.getByTestId('grid-tile').getAttribute('data-dish-id')).toBe('d4')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/DishListItem.grid.test.jsx`
Expected: FAIL — grid variant falls through to the ranked renderer; assertions don't match.

- [ ] **Step 3: Add the variant branch**

In `DishListItem.jsx`, immediately after the voted branch (after line 81 `}`):

```js
  // --- GRID VARIANT (profile food-story grid) ---
  if (variant === 'grid') {
    return renderGridTile()
  }
```

- [ ] **Step 4: Add the `renderGridTile` function**

Add inside the component, after `renderVotedCard` (before the final `}` of the component, ~line 498):

```js
  // --- GRID TILE RENDERER (no emoji; photo / rating / quote-card) ---
  function renderGridTile() {
    var rating = dish.rating_10
    var review = dish.review_text
    var ratingColor = getRatingColor(rating)
    var ratingLabel = rating == null ? '' : (rating % 1 === 0 ? rating : Number(rating).toFixed(1))

    return (
      <button
        type="button"
        data-testid="grid-tile"
        data-dish-id={dishId}
        onClick={function (e) { e.stopPropagation(); handleClick(e) }}
        className="relative block w-full text-left overflow-hidden active:scale-[0.98]"
        style={{
          aspectRatio: '1 / 1',
          borderRadius: '4px',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          background: photoUrl
            ? 'var(--color-surface)'
            : (review
              ? 'linear-gradient(150deg, var(--color-category-strip), var(--color-surface))'
              : 'var(--color-card)'),
        }}
      >
        {photoUrl ? (
          <>
            <img src={photoUrl} alt={dishName} loading="lazy" className="w-full h-full object-cover" />
            <span
              style={{
                position: 'absolute', top: '6px', right: '6px',
                minWidth: '22px', height: '22px', padding: '0 5px',
                borderRadius: '7px', background: 'rgba(0,0,0,0.6)',
                color: ratingColor, fontWeight: 800, fontSize: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {ratingLabel}
            </span>
            <div
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                padding: '14px 7px 6px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0))',
                color: '#fff',
              }}
            >
              <div className="truncate" style={{ fontSize: '11px', fontWeight: 700, lineHeight: 1.15 }}>{dishName}</div>
              <div className="truncate" style={{ fontSize: '9.5px', opacity: 0.85 }}>{restaurantName}</div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col" style={{ padding: '10px 9px' }}>
            <span style={{ fontSize: '32px', fontWeight: 800, lineHeight: 0.9, color: ratingColor }}>{ratingLabel}</span>
            {review && (
              <p
                className="italic"
                style={{
                  fontSize: '10px', color: 'var(--color-text-secondary)', lineHeight: 1.3,
                  marginTop: '5px', display: '-webkit-box', WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}
              >
                &ldquo;{review}&rdquo;
              </p>
            )}
            <div style={{ marginTop: 'auto' }}>
              <div className="truncate" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.15 }}>{dishName}</div>
              <div className="truncate" style={{ fontSize: '9.5px', color: 'var(--color-text-tertiary)' }}>{restaurantName}</div>
            </div>
          </div>
        )}
      </button>
    )
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/DishListItem.grid.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/DishListItem.jsx src/components/DishListItem.grid.test.jsx
git commit -m "feat(profile): add DishListItem grid variant (no-emoji food-story tile)"
```

---

## Task 5: `ProfileGrid` wrapper component

**Files:**
- Create: `src/components/profile/ProfileGrid.jsx`
- Modify: `src/components/profile/index.js` (add export)
- Test: `src/components/profile/ProfileGrid.test.jsx`

**Responsibility:** take `ratings` (snake_case dish array) + `photoMap`, drop null-rating items, override `photo_url` with the user's own photo, sort newest-first (`slice().sort`, NOT `toSorted`), paginate (30/page), render the empty state, render `DishListItem variant="grid"`.

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/profile/ProfileGrid.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProfileGrid } from './ProfileGrid'

function setup(props) {
  return render(<MemoryRouter><ProfileGrid {...props} /></MemoryRouter>)
}

const RATINGS = [
  { dish_id: 'd1', dish_name: 'Old', restaurant_name: 'R', rating_10: 7, voted_at: '2026-01-01' },
  { dish_id: 'd2', dish_name: 'New', restaurant_name: 'R', rating_10: 9, voted_at: '2026-06-01' },
  { dish_id: 'd3', dish_name: 'Unrated', restaurant_name: 'R', rating_10: null, voted_at: '2026-06-02' },
]

describe('ProfileGrid', () => {
  it('shows the empty state when there are no rated items', () => {
    setup({ ratings: [], photoMap: {}, emptyTitle: 'Nothing yet', emptySubtitle: 'Go rate' })
    expect(screen.getByText('Nothing yet')).toBeInTheDocument()
  })

  it('excludes null-rating items', () => {
    setup({ ratings: RATINGS, photoMap: {} })
    expect(screen.queryByText('Unrated')).toBeNull()
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(screen.getByText('Old')).toBeInTheDocument()
  })

  it('renders newest first', () => {
    setup({ ratings: RATINGS, photoMap: {} })
    const tiles = screen.getAllByTestId('grid-tile')
    expect(tiles[0].getAttribute('data-dish-id')).toBe('d2')
  })

  it('overrides the tile photo with the user own photo map', () => {
    setup({ ratings: [{ dish_id: 'd1', dish_name: 'X', restaurant_name: 'R', rating_10: 8, voted_at: '2026-06-01', photo_url: 'SHARED' }], photoMap: { d1: 'MINE' } })
    expect(screen.getByRole('img').getAttribute('src')).toBe('MINE')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/profile/ProfileGrid.test.jsx`
Expected: FAIL — cannot find module `./ProfileGrid`.

- [ ] **Step 3: Write the component**

```jsx
// src/components/profile/ProfileGrid.jsx
import { useState, useEffect } from 'react'
import { DishListItem } from '../DishListItem'

var PAGE_SIZE = 30

/**
 * ProfileGrid — Instagram-style grid of a user's rated dishes (their food story).
 *
 * Props:
 *   ratings       - snake_case dish array ({ dish_id, dish_name, restaurant_name,
 *                   rating_10, review_text, voted_at })
 *   photoMap      - { [dishId]: ownPhotoUrl } — overrides each tile's photo with
 *                   the PROFILE USER's own photo (null -> typographic tile)
 *   loading       - show skeletons
 *   emptyTitle    - empty-state heading
 *   emptySubtitle - empty-state subtext
 */
export function ProfileGrid({ ratings = [], photoMap = {}, loading, emptyTitle = 'No dishes yet', emptySubtitle = 'Start rating to build your food story' }) {
  var [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(function () { setVisibleCount(PAGE_SIZE) }, [ratings.length])

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-[3px] p-[3px]">
        {[0, 1, 2, 3, 4, 5].map(function (i) {
          return (
            <div
              key={i}
              data-testid="grid-skeleton"
              className="animate-pulse"
              style={{ aspectRatio: '1 / 1', borderRadius: '4px', background: 'var(--color-surface-elevated)' }}
            />
          )
        })}
      </div>
    )
  }

  // Rated-only, newest-first. slice().sort — NOT toSorted (CLAUDE.md 1.1).
  var entries = (ratings || [])
    .filter(function (d) { return d && d.rating_10 != null })
    .slice()
    .sort(function (a, b) { return new Date(b.voted_at || 0) - new Date(a.voted_at || 0) })

  if (entries.length === 0) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border p-8 text-center" style={{ background: 'var(--color-card)', borderColor: 'var(--color-divider)' }}>
          <p className="font-semibold" style={{ color: 'var(--color-text-secondary)', fontSize: '15px' }}>{emptyTitle}</p>
          <p className="mt-1" style={{ color: 'var(--color-text-tertiary)', fontSize: '13px' }}>{emptySubtitle}</p>
        </div>
      </div>
    )
  }

  var visible = entries.slice(0, visibleCount)
  var hasMore = entries.length > visibleCount

  return (
    <div className="p-[3px]">
      <div className="grid grid-cols-3 gap-[3px]">
        {visible.map(function (dish) {
          var ownPhoto = photoMap[dish.dish_id] || null
          var tileDish = { ...dish, photo_url: ownPhoto }
          return (
            <DishListItem key={dish.dish_id} dish={tileDish} variant="grid" />
          )
        })}
      </div>
      {hasMore && (
        <button
          onClick={function () { setVisibleCount(visibleCount + PAGE_SIZE) }}
          className="w-full py-3 rounded-xl font-semibold text-center active:scale-[0.98] mt-3"
          style={{ fontSize: '14px', color: 'var(--color-accent-gold)', background: 'var(--color-card)', border: '1.5px solid var(--color-divider)' }}
        >
          Show more
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Export from the barrel**

In `src/components/profile/index.js`, add:

```js
export { ProfileGrid } from './ProfileGrid'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/profile/ProfileGrid.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/profile/ProfileGrid.jsx src/components/profile/index.js src/components/profile/ProfileGrid.test.jsx
git commit -m "feat(profile): add ProfileGrid wrapper (rated-only, newest-first, own-photo override)"
```

---

## Task 6: Wire grid into own profile (`/profile`)

**Files:**
- Modify: `src/pages/Profile.jsx` (imports; journal-tab body ~line 528-552)
- Manual verification (no new unit test; covered by E2E in Task 8)

- [ ] **Step 1: Add imports**

At the top of `src/pages/Profile.jsx`, alongside the existing profile imports:

```js
import { ProfileGrid } from '../components/profile'
import { useUserDishPhotos } from '../hooks/useUserDishPhotos'
```

(Leave the existing `JournalFeed` import in place — it is still imported elsewhere and removing it is out of scope for V1.)

- [ ] **Step 2: Build the own-photo map from rated dishes**

After the `useUserVotes` line (`const { ratedDishes, stats, ... } = useUserVotes(user?.id)`, ~line 42), add:

```js
  const ratedDishIdsForGrid = useMemo(
    () => (ratedDishes || []).filter(d => d.rating_10 != null).map(d => d.dish_id),
    [ratedDishes]
  )
  const ownPhotoMap = useUserDishPhotos(user?.id, ratedDishIdsForGrid)
```

(`useMemo` is already imported in Profile.jsx.)

- [ ] **Step 3: Replace JournalFeed with ProfileGrid in the journal tab**

In the `activeTab === 'journal'` block (~line 528-552), replace the heading text and the `<JournalFeed .../>` with:

```jsx
          {/* --- Journal tab (food-story grid) --- */}
          {activeTab === 'journal' && (
            <>
              <div className="px-4 pt-5 pb-1">
                <h2
                  style={{
                    fontFamily: "'Amatic SC', cursive",
                    color: 'var(--color-text-primary)',
                    fontSize: '32px',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                  }}
                >
                  Your Food Story
                </h2>
              </div>
              <ProfileGrid
                ratings={ratedDishes}
                photoMap={ownPhotoMap}
                loading={votesLoading}
                emptyTitle="Your food story starts here"
                emptySubtitle="Rate your first dish to fill the grid"
              />
            </>
          )}
```

- [ ] **Step 4: Verify build + start dev**

Run: `npm run build`
Expected: build succeeds.

Run: `npm run dev` and open `http://localhost:5173/profile` (logged in as a test account with ratings). Confirm the grid renders, photo tiles show your own photos, no-photo dishes show rating/quote cards, no emojis, newest first, tapping a tile opens the dish.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Profile.jsx
git commit -m "feat(profile): render food-story grid on own profile"
```

---

## Task 7: Wire grid into public profile (`/user/:id`)

**Files:**
- Modify: `src/pages/UserProfile.jsx` (imports; build dish array; journal-tab body ~line 894-918)

**Context:** `UserProfile.jsx` already computes a recent-votes array for `JournalFeed` and fetches `userReviews` via `getReviewsForUser`. V1 merges review text into the dish array, overrides photos with the viewed user's own photos, and renders `ProfileGrid`. The blocked-user path (~line 448) must continue to short-circuit before the grid.

- [ ] **Step 1: Add imports**

```js
import { ProfileGrid } from '../components/profile'
import { useUserDishPhotos } from '../hooks/useUserDishPhotos'
```

- [ ] **Step 2: Build the grid dish array (votes + review text), and the photo map**

Find where the JournalFeed `ratings` array is assembled (the recent-votes list, near the stats computation ~line 316, and `userReviews` set ~line 144/386). Add a `useMemo` that merges review text by `dish_id` and collects dish IDs. Place it after `userReviews` is available:

```js
  // Merge human review text onto each rated vote, keyed by dish_id, for the grid.
  const gridRatings = useMemo(() => {
    const reviewByDish = {}
    for (const r of (userReviews || [])) {
      if (r.dish_id && r.review_text) reviewByDish[r.dish_id] = r.review_text
    }
    return (recentVotesForFeed || [])
      .filter(v => v.rating_10 != null)
      .map(v => ({
        dish_id: v.dish_id || v.dishes?.id,
        dish_name: v.dish_name || v.dishes?.name,
        restaurant_name: v.restaurant_name || v.dishes?.restaurants?.name,
        rating_10: v.rating_10,
        review_text: reviewByDish[v.dish_id || v.dishes?.id] || v.review_text || null,
        voted_at: v.voted_at || v.created_at,
      }))
  }, [recentVotesForFeed, userReviews])

  const gridDishIds = useMemo(() => gridRatings.map(d => d.dish_id), [gridRatings])
  const ownPhotoMap = useUserDishPhotos(userId, gridDishIds)
```

> **Implementer note:** `recentVotesForFeed` is the variable currently passed as `ratings={...}` to `<JournalFeed>` in this file. Use whatever that local is actually named (grep `<JournalFeed`). If review text already rides on those vote rows, the `reviewByDish` merge is a harmless no-op fallback.

- [ ] **Step 3: Replace JournalFeed with ProfileGrid**

In the `activeTab === 'journal'` block (~line 895-918), replace `<JournalFeed ratings={...} loading={...} />` with:

```jsx
          <ProfileGrid
            ratings={gridRatings}
            photoMap={ownPhotoMap}
            loading={reviewsLoading}
            emptyTitle="No food story yet"
            emptySubtitle="This person hasn't rated anything yet"
          />
```

- [ ] **Step 4: Confirm blocked-user path still short-circuits**

Read the blocked-user branch (~line 448). Confirm it returns/renders before the tabs/grid so a blocked user's grid never renders. Do not modify it; just verify by reading.

- [ ] **Step 5: Verify build + manual check**

Run: `npm run build`
Expected: succeeds.

Run: `npm run dev`, open `/user/<someUserIdWithRatings>`. Confirm: grid renders, that user's own photos appear, review quote-cards show their reviews, no emoji, no edit/search chrome, blocked users show the blocked view (not a grid).

- [ ] **Step 6: Commit**

```bash
git add src/pages/UserProfile.jsx
git commit -m "feat(profile): render food-story grid on public profile"
```

---

## Task 8: Full verification + E2E + finalize

**Files:**
- Possibly modify: `e2e/pioneer/profile.spec.*` and `e2e/browser/*` only if selectors changed (the grid tile exposes `data-dish-id`, preserving existing dish-tap selectors).

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no new errors in the touched files.

- [ ] **Step 2: Full unit suite**

Run: `npm run test`
Expected: PASS, including the four new test files.

- [ ] **Step 3: ES2023 guard**

Run: `npm run build`
Expected: succeeds. Confirm no `toSorted`/`.at(` introduced: `grep -rn "toSorted\|\.at(" src/components/profile/ProfileGrid.jsx src/components/DishListItem.jsx` → no matches.

- [ ] **Step 4: CLAUDE.md hard-rule grep checks**

Run: `grep -rn "supabase\." src/components/profile/ProfileGrid.jsx src/components/DishListItem.jsx` → zero.
Run: `grep -rn "text-gray-\|bg-blue-\|text-white" src/components/profile/ProfileGrid.jsx` → zero.
Run: `grep -rn "console\." src/api/dishPhotosApi.js src/hooks/useUserDishPhotos.js` → zero.

- [ ] **Step 5: E2E (geolocation env caveat — see project_e2e_env_broken)**

Run: `npm run test:e2e:pioneer`
Expected: profile specs pass; if homepage-dependent specs fail on the known geolocation env issue, note it — it is pre-existing, not a regression from this change.

- [ ] **Step 6: Run the diff through Codex (per project rule)**

```bash
git diff origin/main...HEAD | head -2000
```
Then review the diff with Codex (default model): focus on the two page wirings (Task 6/7) and the grid tile rendering.

- [ ] **Step 7: Final commit / ready for PR**

```bash
git log --oneline origin/main..HEAD
```
Confirm the task commits are present, branch is `feat/profile-food-story-grid`, ready to open a PR for review.

---

## Self-Review Notes (spec coverage)

- Own photos via `dish_photos` join → Tasks 1, 2, 5 (override), 6/7 (wire). ✓
- No-emoji tile (photo / rating / quote) → Task 4. ✓
- Newest-first, rated-only → Task 5. ✓
- Shared snake_case contract (reuse DishListItem normalizer) → Tasks 4, 5. ✓
- Public review coverage + exclude AI → Task 3, consumed in Task 7. ✓
- Pagination (not 500 at once) → Task 5 (`PAGE_SIZE = 30`). ✓
- Blocked-user path preserved → Task 7 Step 4. ✓
- DishListItem stays the one dish component (grid is a variant) → Task 4. ✓
- No `toSorted`/Tailwind colors/direct supabase/console → Task 8. ✓
- V2 (header/bio/rings/search/tabs) intentionally excluded. ✓
