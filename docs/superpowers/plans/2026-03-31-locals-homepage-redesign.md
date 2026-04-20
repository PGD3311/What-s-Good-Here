# Locals Homepage Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface local list aggregate data in the chalkboard row, redesign the local lists section as menu-style cards, and replace restaurant initial avatars with food category icons.

**Architecture:** New RPC for aggregate data (most-appearing dish/restaurant across lists). New `LocalsAggregate` chalkboard component + gold-frame variant. Rewrite `LocalListsSection` as menu cards. Replace `RestaurantAvatar` internals — same API, new rendering.

**Tech Stack:** React, Supabase RPC, existing design tokens (Amatic SC, Outfit, CSS variables)

**Spec:** `docs/superpowers/specs/2026-03-31-locals-homepage-redesign.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `supabase/migrations/locals-aggregate.sql` | RPC: get most-appearing dish + restaurant across all local lists |
| Modify | `src/api/localListsApi.js` | Add `getAggregate()` method |
| Create | `src/hooks/useLocalsAggregate.js` | React Query hook for aggregate data |
| Modify | `src/components/home/HomeListMode.jsx` | Add aggregate chalkboards to ChalkboardSection, add locals divider |
| Modify | `src/components/home/LocalListsSection.jsx` | Full rewrite — menu-style cards |
| Modify | `src/components/RestaurantAvatar.jsx` | Replace town-colored initials with food category icons |
| Modify | `src/components/home/index.js` | Export new component if needed |

---

### Task 1: Create the Locals Aggregate RPC

**Files:**
- Create: `supabase/migrations/locals-aggregate.sql`
- Modify: `supabase/schema.sql` (add function definition)

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/locals-aggregate.sql
-- Returns the dish and restaurant that appear on the most local lists

DROP FUNCTION IF EXISTS get_locals_aggregate();

CREATE OR REPLACE FUNCTION get_locals_aggregate()
RETURNS TABLE (
  top_dish_id UUID,
  top_dish_name TEXT,
  top_dish_restaurant_name TEXT,
  top_dish_restaurant_id UUID,
  top_dish_list_count INT,
  top_restaurant_id UUID,
  top_restaurant_name TEXT,
  top_restaurant_town TEXT,
  top_restaurant_list_count INT,
  total_lists INT
)
LANGUAGE SQL STABLE
AS $$
  WITH list_count AS (
    SELECT COUNT(DISTINCT ll.id)::INT AS total
    FROM local_lists ll
    JOIN local_list_items li ON li.list_id = ll.id
  ),
  dish_counts AS (
    SELECT
      li.dish_id,
      d.name AS dish_name,
      r.name AS restaurant_name,
      d.restaurant_id,
      COUNT(DISTINCT ll.id)::INT AS list_count,
      MAX(d.avg_rating) AS avg_rating
    FROM local_list_items li
    JOIN local_lists ll ON ll.id = li.list_id
    JOIN dishes d ON d.id = li.dish_id
    JOIN restaurants r ON r.id = d.restaurant_id
    GROUP BY li.dish_id, d.name, r.name, d.restaurant_id
    ORDER BY list_count DESC, avg_rating DESC NULLS LAST
    LIMIT 1
  ),
  restaurant_counts AS (
    SELECT
      d.restaurant_id,
      r.name AS restaurant_name,
      r.town,
      COUNT(DISTINCT ll.id)::INT AS list_count
    FROM local_list_items li
    JOIN local_lists ll ON ll.id = li.list_id
    JOIN dishes d ON d.id = li.dish_id
    JOIN restaurants r ON r.id = d.restaurant_id
    GROUP BY d.restaurant_id, r.name, r.town
    ORDER BY list_count DESC
    LIMIT 1
  )
  SELECT
    dc.dish_id AS top_dish_id,
    dc.dish_name AS top_dish_name,
    dc.restaurant_name AS top_dish_restaurant_name,
    dc.restaurant_id AS top_dish_restaurant_id,
    dc.list_count AS top_dish_list_count,
    rc.restaurant_id AS top_restaurant_id,
    rc.restaurant_name AS top_restaurant_name,
    rc.town AS top_restaurant_town,
    rc.list_count AS top_restaurant_list_count,
    lc.total AS total_lists
  FROM dish_counts dc, restaurant_counts rc, list_count lc;
$$;
```

- [ ] **Step 2: Add function to schema.sql**

Add the same function definition to `supabase/schema.sql` after the existing `get_local_lists_for_homepage` function (around line 2465).

- [ ] **Step 3: Run in Supabase SQL Editor**

Run the migration SQL in the Supabase dashboard SQL Editor. Verify with:

```sql
SELECT * FROM get_locals_aggregate();
```

Expected: one row with the top dish and top restaurant, or empty if no local lists exist.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/locals-aggregate.sql supabase/schema.sql
git commit -m "feat: add get_locals_aggregate RPC for chalkboard cards"
```

---

### Task 2: API + Hook for Aggregate Data

**Files:**
- Modify: `src/api/localListsApi.js`
- Create: `src/hooks/useLocalsAggregate.js`

- [ ] **Step 1: Add getAggregate to localListsApi**

Add this method to the `localListsApi` object in `src/api/localListsApi.js`, after the existing `getForHomepage` method:

```javascript
  async getAggregate() {
    try {
      const { data, error } = await supabase.rpc('get_locals_aggregate')
      if (error) throw createClassifiedError(error)
      return data && data.length > 0 ? data[0] : null
    } catch (error) {
      logger.error('Failed to fetch locals aggregate:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
```

- [ ] **Step 2: Create the hook**

```javascript
// src/hooks/useLocalsAggregate.js
import { useQuery } from '@tanstack/react-query'
import { localListsApi } from '../api/localListsApi'

export function useLocalsAggregate() {
  var { data, isLoading } = useQuery({
    queryKey: ['localsAggregate'],
    queryFn: function () { return localListsApi.getAggregate() },
    staleTime: 1000 * 60 * 10, // 10 min — aggregate changes slowly
  })

  return {
    aggregate: data || null,
    loading: isLoading,
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/api/localListsApi.js src/hooks/useLocalsAggregate.js
git commit -m "feat: add useLocalsAggregate hook for chalkboard cards"
```

---

### Task 3: Add Locals Aggregate Chalkboards to the Editorial Row

**Files:**
- Modify: `src/components/home/HomeListMode.jsx`

- [ ] **Step 1: Import the hook**

At the top of `HomeListMode.jsx`, add the import alongside the existing ones:

```javascript
import { useLocalsAggregate } from '../../hooks/useLocalsAggregate'
```

- [ ] **Step 2: Add gold-frame chalkboard styles**

After the existing `BOARD_SURFACE` constant (line ~214), add these module-level constants:

```javascript
// Locals chalkboards use the same surface/frame as all other boards — no special treatment
var BOARD_OUTER_WIDE = { flexShrink: 0, width: '185px' }
var CHALK_GOLD = { fontFamily: "'Amatic SC', cursive", color: 'var(--color-accent-gold)', fontWeight: 700 }
var COUNT_BADGE = { fontFamily: "'Outfit', sans-serif", display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(196, 138, 18, 0.2)', color: 'var(--color-accent-gold)', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', marginTop: '4px' }
```

- [ ] **Step 3: Create the GoldChalkboardCard component**

Add this function after the existing `ChalkboardCard` component (around line 256):

```javascript
function LocalsChalkboardCard({ tag, title, titleSize, sub, countText, cta, onClick }) {
  return (
    <button
      onClick={onClick}
      className="active:scale-[0.97] transition-transform"
      style={BOARD_OUTER_WIDE}
    >
      <div style={BOARD_SURFACE}>
        <div style={BOARD_FRAME} />
        <div style={BOARD_DUST} />
        <div style={BOARD_CONTENT}>
          <p style={Object.assign({}, CHALK_FAINT, { fontSize: '13px', margin: 0 })}>{tag}</p>
          <p style={Object.assign({}, CHALK_BIG, { fontSize: titleSize || '30px', fontWeight: 700, lineHeight: 0.95, margin: '2px 0 0' })}>{title}</p>
          {sub && <p style={Object.assign({}, CHALK_MED, { fontSize: '15px', margin: 0 })}>{sub}</p>}
          <div style={CHALK_LINE} />
          {countText && <span style={COUNT_BADGE}>{countText}</span>}
          {countText && <div style={{ marginTop: '4px' }} />}
          <p style={Object.assign({}, CHALK_CTA, { fontSize: '18px', fontWeight: 700, margin: 0 })}>{cta}</p>
        </div>
      </div>
    </button>
  )
}
```

- [ ] **Step 4: Wire aggregate data into ChalkboardSection**

Update the `ChalkboardSection` function signature to accept the new props:

```javascript
function ChalkboardSection({ topRestaurant, mostVotedDish, bestValueMeal, bestIceCream, localsAggregate, onExpandCategory }) {
```

Then add the two gold chalkboard cards at the END of the row (after the bestIceCream card, before the closing `</div>`):

```javascript
      {/* Board: Locals Agree — most-appearing dish */}
      {localsAggregate && localsAggregate.top_dish_id && localsAggregate.total_lists >= 2 && (
        <LocalsChalkboardCard
          tag={'\uD83C\uDFC6 locals agree'}
          title={localsAggregate.top_dish_name}
          sub={localsAggregate.top_dish_restaurant_name}
          countText={'On ' + localsAggregate.top_dish_list_count + ' of ' + localsAggregate.total_lists + ' local lists'}
          cta={'see why \u2192'}
          onClick={function () { navigate('/dish/' + localsAggregate.top_dish_id) }}
        />
      )}

      {/* Board: Island Favorite — most-appearing restaurant */}
      {localsAggregate && localsAggregate.top_restaurant_id && localsAggregate.total_lists >= 2 && (
        <LocalsChalkboardCard
          tag={'\uD83D\uDCCD island favorite'}
          title={localsAggregate.top_restaurant_name}
          sub={localsAggregate.top_restaurant_town || ''}
          countText={localsAggregate.top_restaurant_list_count >= localsAggregate.total_lists ? 'On every local list' : 'On ' + localsAggregate.top_restaurant_list_count + ' of ' + localsAggregate.total_lists + ' local lists'}
          cta={'see the menu \u2192'}
          onClick={function () { navigate('/restaurants/' + localsAggregate.top_restaurant_id) }}
        />
      )}
```

- [ ] **Step 5: Pass aggregate data from HomeListMode**

In the `HomeListMode` component, call the hook and pass data to `ChalkboardSection`:

After the existing `useDishSearch` call (around line ~115), add:

```javascript
  var localsAggregateData = useLocalsAggregate()
  var localsAggregate = localsAggregateData.aggregate
```

Then update the `ChalkboardSection` usage (around line 174) to pass the new prop:

```javascript
            <ChalkboardSection
              topRestaurant={topRestaurant}
              mostVotedDish={mostVotedDish}
              bestValueMeal={bestValueMeal}
              bestIceCream={bestIceCream}
              localsAggregate={localsAggregate}
              onExpandCategory={function (cat) {
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/home/HomeListMode.jsx
git commit -m "feat: add locals aggregate chalkboards with gold frame to editorial row"
```

---

### Task 4: Rewrite LocalListsSection as Menu Cards

**Files:**
- Modify: `src/components/home/LocalListsSection.jsx`

- [ ] **Step 1: Rewrite the full component**

Replace the entire content of `src/components/home/LocalListsSection.jsx` with:

```javascript
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLocalLists } from '../../hooks/useLocalLists'
import { useLocalListDetail } from '../../hooks/useLocalListDetail'

// Menu card styles — module-level constants
var MENU_CARD = {
  flexShrink: 0, width: '270px', scrollSnapAlign: 'start',
  background: '#FFFDF8', borderRadius: '3px', padding: '20px 16px 14px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 6px 20px rgba(0,0,0,0.07)',
  border: '1px solid rgba(0,0,0,0.04)', position: 'relative',
}
var CURATOR_AVATAR = {
  width: '32px', height: '32px', borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontWeight: 700, fontSize: '13px', color: '#fff', flexShrink: 0,
  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
}
var CURATOR_NAME = { fontFamily: "'Amatic SC', cursive", fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1 }
var CURATOR_TAGLINE = { fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '1px', fontStyle: 'italic' }
var RESTAURANT_HEADER = { fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'var(--color-accent-gold)', letterSpacing: '0.02em', marginBottom: '3px' }
var DISH_NAME_STYLE = { fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }
var DISH_DOTS = { flex: 1, borderBottom: '1px dotted var(--color-divider)', minWidth: '12px', alignSelf: 'baseline', marginBottom: '3px' }
var DISH_RATING_STYLE = { fontSize: '13px', fontWeight: 700, color: 'var(--color-rating)', flexShrink: 0 }
var MENU_FOOTER = { borderTop: '1px solid var(--color-divider)', paddingTop: '10px', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }

// Rotating avatar colors for curators
var AVATAR_COLORS = ['var(--color-primary)', 'var(--color-accent-gold)', 'var(--color-rating)', '#3B82F6', '#9333EA']

function MenuCard({ list, index }) {
  var navigate = useNavigate()
  var { items, loading } = useLocalListDetail(list.user_id)

  var initial = (list.display_name || '?').charAt(0).toUpperCase()
  var avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length]

  // Group items by restaurant
  var groups = []
  var groupMap = {}
  if (items && items.length > 0) {
    items.forEach(function (item) {
      var rid = item.restaurant_id
      if (!groupMap[rid]) {
        groupMap[rid] = { restaurant_name: item.restaurant_name, restaurant_id: rid, dishes: [] }
        groups.push(groupMap[rid])
      }
      groupMap[rid].dishes.push(item)
    })
  }

  var restaurantCount = groups.length
  var dishCount = items ? items.length : (list.item_count || 0)

  return (
    <div style={MENU_CARD} className="active:scale-[0.98] transition-transform">
      {/* Curator header */}
      <div className="flex items-center gap-2.5" style={{ marginBottom: '10px' }}>
        {list.avatar_url ? (
          <img src={list.avatar_url} alt="" className="rounded-full" style={{ width: '32px', height: '32px', objectFit: 'cover', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }} />
        ) : (
          <div style={Object.assign({}, CURATOR_AVATAR, { background: avatarColor })}>{initial}</div>
        )}
        <div>
          <p style={CURATOR_NAME}>{list.display_name}</p>
          {list.curator_tagline && <p style={CURATOR_TAGLINE}>{list.curator_tagline}</p>}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--color-divider)', marginBottom: '10px' }} />

      {/* Restaurant-grouped dishes */}
      {loading ? (
        <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '8px 0' }}>Loading...</p>
      ) : groups.length > 0 ? (
        groups.slice(0, 3).map(function (group) {
          return (
            <div key={group.restaurant_id} style={{ marginBottom: '8px' }}>
              <button
                onClick={function (e) { e.stopPropagation(); navigate('/restaurants/' + group.restaurant_id) }}
                style={RESTAURANT_HEADER}
              >
                {group.restaurant_name}
              </button>
              {group.dishes.slice(0, 3).map(function (dish) {
                return (
                  <button
                    key={dish.dish_id}
                    onClick={function (e) { e.stopPropagation(); navigate('/dish/' + dish.dish_id) }}
                    className="flex items-baseline w-full text-left"
                    style={{ padding: '2px 0 2px 6px', gap: '6px' }}
                  >
                    <span style={DISH_NAME_STYLE}>{dish.dish_name}</span>
                    <span style={DISH_DOTS} />
                    <span style={DISH_RATING_STYLE}>{dish.avg_rating ? Number(dish.avg_rating).toFixed(1) : '—'}</span>
                  </button>
                )
              })}
            </div>
          )
        })
      ) : null}

      {/* Footer */}
      <div style={MENU_FOOTER}>
        <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
          {restaurantCount > 0 ? restaurantCount + ' restaurant' + (restaurantCount === 1 ? '' : 's') + ' \u00B7 ' : ''}{dishCount} dish{dishCount === 1 ? '' : 'es'}
        </span>
        <button
          onClick={function () { navigate('/user/' + list.user_id) }}
          style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-primary)' }}
        >
          See full list →
        </button>
      </div>
    </div>
  )
}

export function LocalListsSection({ onListExpanded }) {
  var { user } = useAuth()
  var { lists, loading } = useLocalLists(user ? user.id : null)

  if (loading || lists.length === 0) return null

  return (
    <div style={{ padding: '8px 0 24px' }}>
      {/* Section header — centered with flanking lines */}
      <div className="flex items-center gap-4" style={{ padding: '0 20px', marginBottom: '4px' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-divider)' }} />
        <div style={{ textAlign: 'center' }}>
          <p style={{
            fontFamily: "'Amatic SC', cursive", fontSize: '26px', fontWeight: 700,
            color: 'var(--color-text-primary)', whiteSpace: 'nowrap', lineHeight: 1.1,
          }}>
            A Local's Guide to <span style={{ color: 'var(--color-primary)' }}>Martha's Vineyard</span>
          </p>
        </div>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-divider)' }} />
      </div>
      <p style={{ textAlign: 'center', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-tertiary)', padding: '2px 20px 14px' }}>
        Curated by people who live here
      </p>

      {/* Horizontal scroll of menu cards */}
      <div
        className="flex overflow-x-auto"
        style={{
          gap: '14px', padding: '0 20px 8px',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
      >
        {lists.map(function (list, i) {
          return <MenuCard key={list.list_id} list={list} index={i} />
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Verify tests**

Run: `npm run test -- --run`
Expected: All 285 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/components/home/LocalListsSection.jsx
git commit -m "feat: redesign LocalListsSection as restaurant-grouped menu cards"
```

---

### Task 5: Replace RestaurantAvatar with Food Category Icons

**Files:**
- Modify: `src/components/RestaurantAvatar.jsx`

- [ ] **Step 1: Rewrite RestaurantAvatar**

Replace the entire content of `src/components/RestaurantAvatar.jsx`:

```javascript
import { memo } from 'react'
import { getCategoryNeonImage } from '../constants/categories'

/**
 * Map restaurant cuisine to category icon.
 * Falls back to the restaurant's most common dish category,
 * then to a generic utensils placeholder.
 */
var CUISINE_TO_CATEGORY = {
  'seafood': 'seafood',
  'pizza': 'pizza',
  'sushi': 'sushi',
  'japanese': 'sushi',
  'mexican': 'tacos',
  'italian': 'pasta',
  'chinese': 'asian',
  'asian': 'asian',
  'thai': 'asian',
  'indian': 'curry',
  'breakfast': 'breakfast',
  'bakery': 'bakery',
  'burgers': 'burger',
  'american': 'burger',
  'bbq': 'steak',
  'steakhouse': 'steak',
}

function getCuisineIcon(cuisine, dishCategory) {
  // Try cuisine first
  if (cuisine) {
    var key = cuisine.toLowerCase().trim()
    var mapped = CUISINE_TO_CATEGORY[key]
    if (mapped) {
      var src = getCategoryNeonImage(mapped)
      if (src) return src
    }
  }
  // Fall back to dish category
  if (dishCategory) {
    var src2 = getCategoryNeonImage(dishCategory)
    if (src2) return src2
  }
  return null
}

/**
 * RestaurantAvatar - Shows food category icon for the restaurant
 * Replaces the old town-colored initial circles
 */
export var RestaurantAvatar = memo(function RestaurantAvatar({
  name,
  town,
  cuisine,
  dishCategory,
  size = 48,
  fill = false,
  className = ''
}) {
  var iconSrc = getCuisineIcon(cuisine, dishCategory)

  // Fallback: show first letter if no icon found
  if (!iconSrc) {
    var initial = name ? name.charAt(0).toUpperCase() : '?'
    return (
      <div
        className={fill ? '' : 'rounded-lg flex items-center justify-center flex-shrink-0 ' + className}
        style={fill
          ? { position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: (size * 0.4) + 'px', fontWeight: 700 }
          : { width: size, height: size, background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', fontSize: (size * 0.4) + 'px', fontWeight: 700 }
        }
        aria-label={(name || 'Restaurant') + ' icon'}
      >
        {initial}
      </div>
    )
  }

  return (
    <div
      className={fill ? '' : 'rounded-lg flex items-center justify-center flex-shrink-0 ' + className}
      style={fill
        ? { position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
        : { width: size, height: size, background: 'var(--color-surface)' }
      }
      aria-label={(name || 'Restaurant') + ' icon'}
    >
      <img
        src={iconSrc}
        alt=""
        style={{
          width: size * 0.7,
          height: size * 0.7,
          objectFit: 'contain',
        }}
      />
    </div>
  )
})

// Keep getTownStyle export for backwards compat (used by EventCard, SpecialCard)
// but mark as deprecated — callers should migrate to cuisine-based display
export function getTownStyle(town) {
  return { bg: 'var(--color-surface)', text: 'var(--color-text-tertiary)', isGradient: false }
}
```

- [ ] **Step 2: Check callers for prop updates**

The callers that import `RestaurantAvatar` are:
- `src/components/DishListItem.jsx` — passes `name` and `town`. Need to also pass `cuisine` or `dishCategory` where available.
- `src/components/EventCard.jsx` — passes `name` and `town`.
- `src/components/SpecialCard.jsx` — passes `name` and `town`.

In `DishListItem.jsx`, the dish object has a `category` field. Update the `RestaurantAvatar` usage to pass it:

Find the `<RestaurantAvatar` usage and add `dishCategory={category}`:

```javascript
<RestaurantAvatar name={restaurantName} town={restaurantTown} dishCategory={category} size={38} />
```

For `EventCard.jsx` and `SpecialCard.jsx`, the restaurant cuisine may not be available — the fallback initial letter will display, which is acceptable for now.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Verify tests**

Run: `npm run test -- --run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/RestaurantAvatar.jsx src/components/DishListItem.jsx
git commit -m "feat: replace restaurant initial avatars with food category icons"
```

---

### Task 6: Final Integration + Verification

**Files:**
- No new files — verify everything works together

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: PASS with no warnings

- [ ] **Step 2: Run tests**

Run: `npm run test -- --run`
Expected: All tests pass

- [ ] **Step 3: Visual verification on dev server**

Run: `npm run dev`

Check in browser:
1. Homepage chalkboard row scrolls to show gold-framed "Locals Agree" and "Island Favorite" cards at the end
2. Tapping "Locals Agree" card navigates to the dish page
3. Tapping "Island Favorite" card navigates to the restaurant page
4. Scrolling to bottom shows "A Local's Guide to Martha's Vineyard" section with flanking lines
5. Menu cards show curator name, restaurant-grouped dishes with dotted leaders and ratings
6. Tapping dish name in menu card navigates to dish page
7. Tapping restaurant name navigates to restaurant page
8. Restaurant avatars throughout the app show food category icons instead of colored initials
9. If no local lists exist (< 2), aggregate chalkboards don't appear

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "feat: locals homepage redesign — aggregate chalkboards, menu cards, food icons"
```

- [ ] **Step 5: Update TASKS.md**

Add completed task entry. Update SPEC.md if the local lists feature description changed.
