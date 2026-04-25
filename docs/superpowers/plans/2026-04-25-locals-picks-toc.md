# Locals' Picks Banner + TOC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4-card `LocalListsSection` carousel on the homepage with a single cream-paper "Locals' Picks" banner, and add a new `/locals` table-of-contents route + `/locals/:userId` curator menu route. Mockup: `.tmp/local-list-as-section.html`.

**Architecture:** Banner sits in the same DOM slot the carousel occupies today (between `ChalkboardSection` and `Top10Carousel` in `HomeListMode.jsx`). Tap → `/locals` page with 3 tabs (Read = consensus strip + curator rows, Search = full-text picks, Index = A-Z dish aggregator). Tap a curator row → `/locals/:userId` rendered as a menu (dotted leaders, rating in price slot, italic notes). All data via Supabase RPCs with `is_active = true` filter; React Query for client cache.

**Tech Stack:** React 19 + Vite, Supabase Postgres + RPCs, React Query, React Router v7, Playwright for E2E. No new dependencies.

---

## Decisions locked in (from brainstorm)

| # | Decision |
|---|---|
| Route | `/locals` (TOC) and `/locals/:userId` (curator detail) |
| Tabs | Read + Search + Index all ship in L1 |
| Curator menu detail | New page (`LocalsCurator.jsx`), reuses existing `get_local_list_by_user` RPC |
| Curator order in TOC | follower count DESC, then `display_name` ASC |
| Chalkboards 7 & 8 (`locals agree` / `island favorite`) | Deleted — banner is the new entry point |
| Banner copy counts (`23 islanders · 230 dishes`) | Dynamic from `get_local_picks_curators` data |

---

## Sequencing rule

**Additive-first, cleanup-last.** Tasks 1–11 add new code and cut the homepage over to it without touching old files. Task 12 is the single point where every old file/method/RPC is removed — at that point nothing in the repo or the live app references the old code anymore. This avoids any commit window where `npm run build` is broken or the live app calls a dropped RPC.

---

## File map

**Create:**
- `supabase/migrations/2026-04-25-locals-picks-toc.sql` — 4 new RPCs (additive)
- `supabase/migrations/2026-04-25-locals-picks-toc-cleanup.sql` — drops `get_locals_aggregate` after cutover
- `src/components/home/LocalsPicksBanner.jsx`
- `src/components/home/LocalsPicksStamp.jsx`
- `src/pages/Locals.jsx` — TOC page with 3-tab state (Read / Search / Index)
- `src/pages/LocalsCurator.jsx`
- `src/hooks/useLocalPicksConsensus.js`
- `src/hooks/useLocalPicksCurators.js`
- `src/hooks/useLocalPicksSearch.js`
- `src/hooks/useLocalPicksIndex.js`
- `e2e/browser/locals.spec.js`

**Modify:**
- `src/index.css` — add three new color tokens (cream-paper light/dark + stamp-red)
- `supabase/schema.sql` — append 4 new RPCs (Task 2); remove `get_locals_aggregate` (Task 12)
- `src/api/localListsApi.js` — add 4 methods (Task 4); remove `getAggregate` (Task 12)
- `src/components/home/index.js` — add banner export (Task 7); remove `LocalListsSection` export (Task 12)
- `src/components/home/HomeListMode.jsx` — cut over to banner + remove chalkboards 7/8 (Task 11)
- `src/App.jsx` — register `/locals` and `/locals/:userId` lazy routes (Task 10)

**Delete (Task 12 only):**
- `src/components/home/LocalListsSection.jsx`
- `src/hooks/useLocalsAggregate.js`

---

## Task 1 — Add color tokens to `src/index.css`

The cream-paper background and stamp red are brand-defining surfaces (CLAUDE.md §1.3 — must go through `var(--color-*)`). Tokenize before any component uses them.

**Files:**
- Modify: `src/index.css` (insert after line 69, in the existing `:root` block)

- [ ] **Step 1.1: Insert the three new tokens**

In `src/index.css`, find the line `--color-success-border: rgba(22, 163, 74, 0.30);` (≈ line 69). After it, insert:

```css
  /* Locals' Picks — cream-paper menu surface + ink stamp */
  --color-paper-cream-light: #FBF5E8;
  --color-paper-cream-dark: #F4EAD3;
  --color-stamp-red: #B82617;
```

- [ ] **Step 1.2: Verify CSS still parses**

Run:
```bash
npm run build
```
Expected: build succeeds (token additions don't break anything).

- [ ] **Step 1.3: Commit**

```bash
git add src/index.css
git commit -m "feat(tokens): add cream-paper + stamp-red tokens for locals' picks surface"
```

---

## Task 2 — Sync `supabase/schema.sql` with the four new RPCs (source of truth FIRST)

Per CLAUDE.md §1.4: `schema.sql` is the source of truth — update it before running anything in SQL Editor.

**Files:**
- Modify: `supabase/schema.sql` (append after the last `save_my_local_list` block in §13z, ≈ line 3240)

- [ ] **Step 2.1: Confirm `follows.followed_id` is the followed-user column**

```bash
grep -n "CREATE TABLE IF NOT EXISTS follows" -A 8 supabase/schema.sql
```
Expected: shows `follower_id` and `followed_id`. If column names differ, use the actual ones in Step 2.2.

- [ ] **Step 2.2: Append the four new RPC definitions to `schema.sql`**

After the last function in the local-lists block, paste this verbatim. Do NOT delete `get_locals_aggregate` here — that's Task 12.

```sql
-- ============================================================
-- Locals' Picks — TOC route data layer
-- ============================================================

-- 1. Consensus — dishes >=2 active locals picked
DROP FUNCTION IF EXISTS get_local_picks_consensus();
CREATE OR REPLACE FUNCTION get_local_picks_consensus()
RETURNS TABLE (
  dish_id UUID,
  dish_name TEXT,
  restaurant_id UUID,
  restaurant_name TEXT,
  avg_rating NUMERIC,
  pick_count INT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    d.id          AS dish_id,
    d.name        AS dish_name,
    r.id          AS restaurant_id,
    r.name        AS restaurant_name,
    d.avg_rating,
    COUNT(DISTINCT ll.user_id)::INT AS pick_count
  FROM local_list_items li
  JOIN local_lists ll ON ll.id = li.list_id
  JOIN dishes d       ON d.id = li.dish_id
  JOIN restaurants r  ON r.id = d.restaurant_id
  WHERE ll.is_active = true
  GROUP BY d.id, d.name, r.id, r.name, d.avg_rating
  HAVING COUNT(DISTINCT ll.user_id) >= 2
  ORDER BY pick_count DESC, d.avg_rating DESC NULLS LAST, d.name ASC;
$$;
GRANT EXECUTE ON FUNCTION get_local_picks_consensus() TO anon, authenticated;

-- 2. Curators — every active curator + their #1 pick + follower count + item count
DROP FUNCTION IF EXISTS get_local_picks_curators();
CREATE OR REPLACE FUNCTION get_local_picks_curators()
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  curator_tagline TEXT,
  follower_count INT,
  item_count INT,
  top_dish_id UUID,
  top_dish_name TEXT,
  top_restaurant_id UUID,
  top_restaurant_name TEXT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    ll.user_id,
    p.display_name,
    p.avatar_url,
    ll.curator_tagline,
    COALESCE((SELECT COUNT(*)::INT FROM follows f WHERE f.followed_id = ll.user_id), 0) AS follower_count,
    (SELECT COUNT(*)::INT FROM local_list_items li2 WHERE li2.list_id = ll.id) AS item_count,
    top.dish_id          AS top_dish_id,
    top.dish_name        AS top_dish_name,
    top.restaurant_id    AS top_restaurant_id,
    top.restaurant_name  AS top_restaurant_name
  FROM local_lists ll
  JOIN profiles p ON p.id = ll.user_id
  LEFT JOIN LATERAL (
    SELECT
      d.id   AS dish_id,
      d.name AS dish_name,
      r.id   AS restaurant_id,
      r.name AS restaurant_name
    FROM local_list_items li
    JOIN dishes d      ON d.id = li.dish_id
    JOIN restaurants r ON r.id = d.restaurant_id
    WHERE li.list_id = ll.id AND li.position = 1
    LIMIT 1
  ) top ON TRUE
  WHERE ll.is_active = true
  ORDER BY follower_count DESC, p.display_name ASC;
$$;
GRANT EXECUTE ON FUNCTION get_local_picks_curators() TO anon, authenticated;

-- 3. Search — ILIKE across dish/restaurant/curator/note, prefix-match boost
DROP FUNCTION IF EXISTS search_local_picks(TEXT);
CREATE OR REPLACE FUNCTION search_local_picks(p_query TEXT)
RETURNS TABLE (
  dish_id UUID,
  dish_name TEXT,
  restaurant_id UUID,
  restaurant_name TEXT,
  avg_rating NUMERIC,
  curator_user_id UUID,
  curator_display_name TEXT,
  position INT,
  note TEXT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    d.id           AS dish_id,
    d.name         AS dish_name,
    r.id           AS restaurant_id,
    r.name         AS restaurant_name,
    d.avg_rating,
    ll.user_id     AS curator_user_id,
    p.display_name AS curator_display_name,
    li.position,
    li.note
  FROM local_list_items li
  JOIN local_lists ll ON ll.id = li.list_id
  JOIN profiles p     ON p.id = ll.user_id
  JOIN dishes d       ON d.id = li.dish_id
  JOIN restaurants r  ON r.id = d.restaurant_id
  WHERE ll.is_active = true
    AND p_query IS NOT NULL
    AND length(trim(p_query)) > 0
    AND (
      d.name         ILIKE '%' || p_query || '%'
      OR r.name      ILIKE '%' || p_query || '%'
      OR p.display_name ILIKE '%' || p_query || '%'
      OR li.note     ILIKE '%' || p_query || '%'
    )
  ORDER BY
    CASE WHEN d.name ILIKE p_query || '%' THEN 0 ELSE 1 END,
    d.name ASC,
    p.display_name ASC
  LIMIT 100;
$$;
GRANT EXECUTE ON FUNCTION search_local_picks(TEXT) TO anon, authenticated;

-- 4. Index — A-Z by dish, with curator-names array
DROP FUNCTION IF EXISTS get_local_picks_index();
CREATE OR REPLACE FUNCTION get_local_picks_index()
RETURNS TABLE (
  dish_id UUID,
  dish_name TEXT,
  restaurant_id UUID,
  restaurant_name TEXT,
  avg_rating NUMERIC,
  pick_count INT,
  curator_names TEXT[]
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    d.id          AS dish_id,
    d.name        AS dish_name,
    r.id          AS restaurant_id,
    r.name        AS restaurant_name,
    d.avg_rating,
    COUNT(DISTINCT ll.user_id)::INT AS pick_count,
    ARRAY_AGG(DISTINCT p.display_name ORDER BY p.display_name) AS curator_names
  FROM local_list_items li
  JOIN local_lists ll ON ll.id = li.list_id
  JOIN profiles p     ON p.id = ll.user_id
  JOIN dishes d       ON d.id = li.dish_id
  JOIN restaurants r  ON r.id = d.restaurant_id
  WHERE ll.is_active = true
  GROUP BY d.id, d.name, r.id, r.name, d.avg_rating
  ORDER BY d.name ASC;
$$;
GRANT EXECUTE ON FUNCTION get_local_picks_index() TO anon, authenticated;
```

- [ ] **Step 2.3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(schema): add locals'-picks RPCs to schema.sql (source of truth)"
```

---

## Task 3 — Run additive migration in Supabase SQL Editor

**Files:**
- Create: `supabase/migrations/2026-04-25-locals-picks-toc.sql`

This migration is **purely additive**. It creates the four new RPCs. It does NOT drop `get_locals_aggregate` — that happens in Task 12 after the homepage has been cut over.

- [ ] **Step 3.1: Write the migration file**

Create `supabase/migrations/2026-04-25-locals-picks-toc.sql` with the four `DROP FUNCTION IF EXISTS … / CREATE OR REPLACE FUNCTION … / GRANT EXECUTE …` blocks copy-pasted from Step 2.2. Append at the bottom:

```sql
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS get_local_picks_consensus();
-- DROP FUNCTION IF EXISTS get_local_picks_curators();
-- DROP FUNCTION IF EXISTS search_local_picks(TEXT);
-- DROP FUNCTION IF EXISTS get_local_picks_index();
```

- [ ] **Step 3.2: Run in Supabase SQL Editor**

Open the Supabase dashboard for project `vpioftosgdkyiwvhxewy`, paste the entire migration into SQL Editor, run.
Expected: "Success. No rows returned" for each `CREATE OR REPLACE FUNCTION` and `GRANT`.

- [ ] **Step 3.3: Verify each RPC**

In SQL Editor:
```sql
SELECT * FROM get_local_picks_consensus() LIMIT 10;
SELECT user_id, display_name, follower_count, item_count, top_dish_name, top_restaurant_name FROM get_local_picks_curators();
SELECT dish_name, restaurant_name, curator_display_name FROM search_local_picks('lobster');
SELECT * FROM search_local_picks('') LIMIT 5;       -- expect 0 rows
SELECT dish_name, pick_count, curator_names FROM get_local_picks_index() LIMIT 20;
```

- [ ] **Step 3.4: Commit migration file**

```bash
git add supabase/migrations/2026-04-25-locals-picks-toc.sql
git commit -m "feat(db): add additive migration for locals'-picks RPCs"
```

---

## Task 4 — Extend `localListsApi` (additive)

**Files:**
- Modify: `src/api/localListsApi.js`

- [ ] **Step 4.1: Append four new methods**

Open `src/api/localListsApi.js`. Do NOT remove `getAggregate` yet (Task 12 handles that). Add these methods inside the `localListsApi` object, preserving the existing pattern:

```js
  async getConsensus() {
    try {
      const { data, error } = await supabase.rpc('get_local_picks_consensus')
      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Failed to fetch local picks consensus:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getCurators() {
    try {
      const { data, error } = await supabase.rpc('get_local_picks_curators')
      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Failed to fetch local picks curators:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async searchPicks(query) {
    try {
      const trimmed = (query || '').trim()
      if (!trimmed) return []
      const { data, error } = await supabase.rpc('search_local_picks', { p_query: trimmed })
      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Failed to search local picks:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getIndex() {
    try {
      const { data, error } = await supabase.rpc('get_local_picks_index')
      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Failed to fetch local picks index:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
```

- [ ] **Step 4.2: Smoke-check from the browser console**

Run `npm run dev` in a separate terminal if not already running. In the browser console at localhost:5173:
```js
const { localListsApi } = await import('/src/api/index.js')
console.table(await localListsApi.getCurators())
console.table(await localListsApi.getConsensus())
console.table(await localListsApi.searchPicks('lobster'))
console.table(await localListsApi.getIndex())
```
Expected: shapes match Step 3.3.

- [ ] **Step 4.3: Commit**

```bash
git add src/api/localListsApi.js
git commit -m "feat(api): add localListsApi.getConsensus/getCurators/searchPicks/getIndex"
```

---

## Task 5 — Add four new hooks (additive)

**Files:**
- Create: `src/hooks/useLocalPicksConsensus.js`
- Create: `src/hooks/useLocalPicksCurators.js`
- Create: `src/hooks/useLocalPicksSearch.js`
- Create: `src/hooks/useLocalPicksIndex.js`

Do NOT delete `useLocalsAggregate.js` here — Task 12 handles that.

- [ ] **Step 5.1: `useLocalPicksConsensus.js`**

```js
import { useQuery } from '@tanstack/react-query'
import { localListsApi } from '../api/localListsApi'
import { getUserMessage } from '../utils/errorHandler'

export function useLocalPicksConsensus() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['localPicks', 'consensus'],
    queryFn: function () { return localListsApi.getConsensus() },
    staleTime: 1000 * 60 * 10,
  })

  return {
    consensus: data || [],
    loading: isLoading,
    error: error ? { message: getUserMessage(error, 'loading consensus picks') } : null,
  }
}
```

- [ ] **Step 5.2: `useLocalPicksCurators.js`**

```js
import { useQuery } from '@tanstack/react-query'
import { localListsApi } from '../api/localListsApi'
import { getUserMessage } from '../utils/errorHandler'

export function useLocalPicksCurators() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['localPicks', 'curators'],
    queryFn: function () { return localListsApi.getCurators() },
    staleTime: 1000 * 60 * 10,
  })

  return {
    curators: data || [],
    loading: isLoading,
    error: error ? { message: getUserMessage(error, 'loading curators') } : null,
  }
}
```

- [ ] **Step 5.3: `useLocalPicksSearch.js`**

```js
import { useQuery } from '@tanstack/react-query'
import { localListsApi } from '../api/localListsApi'
import { getUserMessage } from '../utils/errorHandler'

export function useLocalPicksSearch(query, enabled) {
  const trimmed = (query || '').trim()
  const { data, isLoading, error } = useQuery({
    queryKey: ['localPicks', 'search', trimmed],
    queryFn: function () { return localListsApi.searchPicks(trimmed) },
    enabled: !!enabled && trimmed.length > 0,
    staleTime: 1000 * 60 * 5,
  })

  return {
    results: data || [],
    loading: isLoading,
    error: error ? { message: getUserMessage(error, 'searching picks') } : null,
  }
}
```

- [ ] **Step 5.4: `useLocalPicksIndex.js`**

```js
import { useQuery } from '@tanstack/react-query'
import { localListsApi } from '../api/localListsApi'
import { getUserMessage } from '../utils/errorHandler'

export function useLocalPicksIndex(enabled) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['localPicks', 'index'],
    queryFn: function () { return localListsApi.getIndex() },
    enabled: !!enabled,
    staleTime: 1000 * 60 * 10,
  })

  return {
    index: data || [],
    loading: isLoading,
    error: error ? { message: getUserMessage(error, 'loading index') } : null,
  }
}
```

- [ ] **Step 5.5: Commit**

```bash
git add src/hooks/useLocalPicksConsensus.js src/hooks/useLocalPicksCurators.js src/hooks/useLocalPicksSearch.js src/hooks/useLocalPicksIndex.js
git commit -m "feat(hooks): add 4 locals'-picks hooks"
```

---

## Task 6 — `LocalsPicksStamp` SVG component

The "tried & true" red ink stamp recurs in the banner and the TOC. Extract once.

**Files:**
- Create: `src/components/home/LocalsPicksStamp.jsx`

CLAUDE.md §1.3 explicitly exempts SVG fills from the token rule. The hex `#B82617` inside this SVG is fine. (Outside the SVG — banner backgrounds, count bubble — we use `var(--color-stamp-red)` from Task 1.)

- [ ] **Step 6.1: Write the component**

```jsx
// "Tried & true" red ink stamp used on the banner and TOC.
// `seed` varies the ink-jitter so two stamps on one page don't look identical.
// SVG fills use literal hex per CLAUDE.md §1.3 (SVG illustration exception).
export function LocalsPicksStamp({ seed = 4, includeRibbon = true, size = 72 }) {
  var filterId = 'lp-stamp-ink-' + seed
  var pathId = 'lp-stamp-path-' + seed

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence baseFrequency="0.9" numOctaves="2" seed={seed} />
          <feDisplacementMap in="SourceGraphic" scale="1" />
        </filter>
        <path id={pathId} d="M 50 50 m -36 0 a 36 36 0 1 1 72 0 a 36 36 0 1 1 -72 0" />
      </defs>
      <g filter={'url(#' + filterId + ')'} fill="none" stroke="#B82617" strokeOpacity="0.9">
        <circle cx="50" cy="50" r="42" strokeWidth="1.2" />
        <circle cx="50" cy="50" r="39" strokeWidth="2" />
        <circle cx="50" cy="50" r="26" strokeWidth="1" />
        {includeRibbon && (
          <>
            <text fontFamily="Outfit, sans-serif" fontSize="6.6" fontWeight="800" letterSpacing="1.4" fill="#B82617" stroke="none">
              <textPath href={'#' + pathId} startOffset="6%">WHAT'S GOOD HERE</textPath>
            </text>
            <text fontFamily="Outfit, sans-serif" fontSize="5.6" fontWeight="700" letterSpacing="2" fill="#B82617" stroke="none">
              <textPath href={'#' + pathId} startOffset="62%">★ LOCALS ONLY ★</textPath>
            </text>
          </>
        )}
        <text x="50" y="50" textAnchor="middle" fontFamily="'Amatic SC', cursive" fontSize="17" fontWeight="700" fill="#B82617" stroke="none">tried &amp;</text>
        <text x="50" y="63" textAnchor="middle" fontFamily="'Amatic SC', cursive" fontSize="17" fontWeight="700" fill="#B82617" stroke="none">true</text>
      </g>
    </svg>
  )
}
```

- [ ] **Step 6.2: Commit**

```bash
git add src/components/home/LocalsPicksStamp.jsx
git commit -m "feat(components): add LocalsPicksStamp shared svg"
```

---

## Task 7 — `LocalsPicksBanner` component (additive — keeps `LocalListsSection` exported alongside)

**Files:**
- Create: `src/components/home/LocalsPicksBanner.jsx`
- Modify: `src/components/home/index.js` — ADD banner export, leave `LocalListsSection` export in place

- [ ] **Step 7.1: Write the banner**

```jsx
import { useNavigate } from 'react-router-dom'
import { useLocalPicksCurators } from '../../hooks/useLocalPicksCurators'
import { LocalsPicksStamp } from './LocalsPicksStamp'

var BANNER_OUTER = {
  position: 'relative',
  background: 'linear-gradient(180deg, var(--color-paper-cream-light) 0%, var(--color-paper-cream-dark) 100%)',
  borderRadius: '14px',
  padding: '14px 14px 12px 16px',
  margin: '10px 16px 4px',
  border: '1px solid rgba(196, 138, 18, 0.18)',
  boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 20px rgba(180, 130, 60, 0.12)',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  overflow: 'hidden',
  textAlign: 'left',
  width: 'calc(100% - 32px)',
}
var BANNER_GRAIN = {
  content: '""',
  position: 'absolute',
  inset: 0,
  backgroundImage:
    'radial-gradient(circle at 20% 30%, rgba(196,138,18,.05), transparent 50%),' +
    'radial-gradient(circle at 80% 70%, rgba(228,68,10,.04), transparent 50%)',
  pointerEvents: 'none',
}
var BANNER_BODY = { flex: 1, position: 'relative', zIndex: 2, minWidth: 0 }
var EYEBROW = {
  fontFamily: "'Amatic SC', cursive",
  fontSize: '15px',
  fontWeight: 700,
  color: 'var(--color-accent-gold)',
  lineHeight: 1,
  letterSpacing: '0.02em',
}
var TITLE = {
  fontFamily: "'Amatic SC', cursive",
  fontWeight: 700,
  fontSize: '34px',
  lineHeight: 0.95,
  color: 'var(--color-text-primary)',
  margin: '-2px 0 2px',
}
var TITLE_ACCENT = { color: 'var(--color-primary)' }
var SUB = {
  fontSize: '12px',
  color: 'var(--color-text-secondary)',
  marginTop: '2px',
  lineHeight: 1.4,
  fontWeight: 500,
}
var SUB_BOLD = { color: 'var(--color-text-primary)', fontWeight: 700 }
var CTA = {
  fontSize: '12px',
  fontWeight: 700,
  color: 'var(--color-primary)',
  marginTop: '8px',
}
var STAMP_WRAP = {
  position: 'relative',
  zIndex: 2,
  width: '72px',
  height: '72px',
  flexShrink: 0,
  transform: 'rotate(-6deg)',
}

export function LocalsPicksBanner() {
  var navigate = useNavigate()
  var { curators, loading } = useLocalPicksCurators()

  if (loading) return null
  if (!curators || curators.length === 0) return null

  var curatorCount = curators.length
  var dishCount = curators.reduce(function (sum, c) { return sum + (c.item_count || 0) }, 0)

  return (
    <button
      type="button"
      onClick={function () { navigate('/locals') }}
      style={BANNER_OUTER}
      className="active:scale-[0.99] transition-transform"
      aria-label={'Open Locals’ Picks. ' + curatorCount + ' islanders, ' + dishCount + ' dishes.'}
    >
      <div style={BANNER_GRAIN} />
      <div style={BANNER_BODY}>
        <div style={EYEBROW}>ask a local</div>
        <div style={TITLE}>The Locals' <span style={TITLE_ACCENT}>Picks</span></div>
        <div style={SUB}>
          What <span style={SUB_BOLD}>{curatorCount} islander{curatorCount === 1 ? '' : 's'}</span> actually order &mdash;<br />
          their {dishCount} favorite dish{dishCount === 1 ? '' : 'es'}.
        </div>
        <div style={CTA}>See what they order <span style={{ fontWeight: 800, marginLeft: '1px' }}>&rarr;</span></div>
      </div>
      <div style={STAMP_WRAP}>
        <LocalsPicksStamp seed={4} />
      </div>
    </button>
  )
}
```

- [ ] **Step 7.2: Add the export to the barrel — DO NOT remove `LocalListsSection` here**

Open `src/components/home/index.js` and add:
```js
export { LocalsPicksBanner } from './LocalsPicksBanner'
```
Both `LocalListsSection` and `LocalsPicksBanner` are exported simultaneously through Task 11. The dangling `LocalListsSection` export is removed in Task 12.

- [ ] **Step 7.3: Verify build**

```bash
npm run build
```
Expected: clean.

- [ ] **Step 7.4: Commit**

```bash
git add src/components/home/LocalsPicksBanner.jsx src/components/home/index.js
git commit -m "feat(components): add LocalsPicksBanner alongside existing LocalListsSection"
```

---

## Task 8 — `Locals.jsx` page (TOC with 3 tabs)

**Files:**
- Create: `src/pages/Locals.jsx`

All identity-bearing surface colors use `var(--color-paper-cream-*)`, `var(--color-card)`, and `var(--color-stamp-red)` per CLAUDE.md §1.3.

- [ ] **Step 8.1: Write the page**

```jsx
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocalPicksConsensus } from '../hooks/useLocalPicksConsensus'
import { useLocalPicksCurators } from '../hooks/useLocalPicksCurators'
import { useLocalPicksSearch } from '../hooks/useLocalPicksSearch'
import { useLocalPicksIndex } from '../hooks/useLocalPicksIndex'
import { LocalsPicksStamp } from '../components/home/LocalsPicksStamp'

var PAGE_OUTER = {
  background: 'linear-gradient(180deg, var(--color-paper-cream-light) 0%, var(--color-paper-cream-dark) 100%)',
  minHeight: '100vh',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  display: 'flex',
  flexDirection: 'column',
}
var PAGE_GRAIN = {
  position: 'fixed',
  inset: 0,
  backgroundImage:
    'radial-gradient(circle at 20% 20%, rgba(196,138,18,.05), transparent 50%),' +
    'radial-gradient(circle at 80% 80%, rgba(228,68,10,.04), transparent 50%)',
  pointerEvents: 'none',
  zIndex: 0,
}
var SCROLL = { flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1 }
var INNER = { padding: '20px 20px 96px', position: 'relative', maxWidth: '720px', margin: '0 auto' }

var NAV_ROW = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }
var CLOSE_BTN = { fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.02em', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }
var PAGENO = { fontFamily: "'Amatic SC', cursive", fontSize: '16px', fontWeight: 700, color: 'var(--color-text-tertiary)' }

var STAMP_TINY = { position: 'absolute', top: '54px', right: '20px', width: '44px', height: '44px', transform: 'rotate(10deg)', opacity: 0.8, zIndex: 2 }

var HEADER = { textAlign: 'center', marginBottom: '16px' }
var EYEBROW = { fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'var(--color-accent-gold)', lineHeight: 1 }
var TITLE = { fontFamily: "'Amatic SC', cursive", fontWeight: 700, fontSize: '42px', lineHeight: 1, color: 'var(--color-text-primary)', margin: '2px 0 4px' }
var TITLE_ACCENT = { color: 'var(--color-primary)' }
var SUB = { fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 500 }

var SECTION_LABEL = { fontFamily: "'Amatic SC', cursive", fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', margin: '14px 0 4px', lineHeight: 1 }
var SECTION_SUB = { fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '8px' }

var ROW_CARD = {
  background: 'var(--color-card)',
  borderRadius: '10px',
  padding: '10px 12px',
  marginBottom: '6px',
  boxShadow: '0 1px 2px rgba(0,0,0,.04)',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  border: '1px solid rgba(196, 138, 18, 0.18)',
  width: '100%',
  textAlign: 'left',
}

var COUNT_BUBBLE = { width: '30px', height: '30px', borderRadius: '50%', background: 'var(--color-stamp-red)', color: 'var(--color-text-on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Amatic SC', cursive", fontSize: '20px', fontWeight: 700, lineHeight: 1, flexShrink: 0 }
var ROW_BODY = { flex: 1, minWidth: 0 }
var DISH_NAME = { fontSize: '13px', fontWeight: 700, lineHeight: 1.1, color: 'var(--color-text-primary)' }
var ROW_REST = { fontSize: '10.5px', color: 'var(--color-accent-gold)', marginTop: '1px' }
var RATING = { fontSize: '15px', fontWeight: 700, color: 'var(--color-rating)', flexShrink: 0 }

var CURATOR_NAME_LINE = { display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '2px' }
var CURATOR_NAME = { fontFamily: "'Amatic SC', cursive", fontSize: '20px', fontWeight: 700, lineHeight: 1, color: 'var(--color-text-primary)' }
var CURATOR_ROLE = { fontSize: '10.5px', color: 'var(--color-text-tertiary)' }
var CURATOR_PICK = { fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.2 }
var CHEVRON = { color: 'var(--color-text-tertiary)', fontSize: '18px', fontWeight: 300, flexShrink: 0 }

var TAB_BAR = {
  display: 'flex',
  gap: '4px',
  padding: '8px 12px calc(8px + env(safe-area-inset-bottom, 0px))',
  background: 'var(--color-card)',
  borderTop: '1px solid var(--color-divider)',
  position: 'sticky',
  bottom: 0,
  zIndex: 5,
}
var TAB = { flex: 1, padding: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-tertiary)', borderRadius: '8px', background: 'none', border: 'none', cursor: 'pointer' }
var TAB_ACTIVE = Object.assign({}, TAB, { background: 'var(--color-text-primary)', color: 'var(--color-text-on-primary)', fontWeight: 700 })

var SEARCH_INPUT = {
  width: '100%',
  border: '1px solid rgba(196, 138, 18, 0.25)',
  background: 'var(--color-card)',
  borderRadius: '12px',
  padding: '10px 14px',
  fontSize: '13px',
  outline: 'none',
  marginBottom: '10px',
  fontFamily: 'inherit',
}

var INDEX_HEAD = { fontFamily: "'Amatic SC', cursive", fontSize: '28px', fontWeight: 700, color: 'var(--color-primary)', margin: '14px 0 4px', lineHeight: 1 }

var EMPTY = { textAlign: 'center', padding: '20px 0', fontSize: '12px', color: 'var(--color-text-tertiary)', fontWeight: 500 }

export function Locals() {
  var navigate = useNavigate()
  var [activeTab, setActiveTab] = useState('read')

  return (
    <div style={PAGE_OUTER}>
      <div style={PAGE_GRAIN} />
      <div style={SCROLL}>
        <div style={INNER}>
          <div style={NAV_ROW}>
            <button type="button" style={CLOSE_BTN} onClick={function () { navigate('/') }}>&larr; Close</button>
            <span style={PAGENO}>the menu</span>
          </div>

          <div style={STAMP_TINY}>
            <LocalsPicksStamp seed={7} includeRibbon={false} size={44} />
          </div>

          {activeTab === 'read' && <ReadTab />}
          {activeTab === 'search' && <SearchTab />}
          {activeTab === 'index' && <IndexTab />}
        </div>
      </div>
      <div style={TAB_BAR} role="tablist">
        <button type="button" role="tab" aria-selected={activeTab === 'read'} style={activeTab === 'read' ? TAB_ACTIVE : TAB} onClick={function () { setActiveTab('read') }}>Read</button>
        <button type="button" role="tab" aria-selected={activeTab === 'search'} style={activeTab === 'search' ? TAB_ACTIVE : TAB} onClick={function () { setActiveTab('search') }}>Search</button>
        <button type="button" role="tab" aria-selected={activeTab === 'index'} style={activeTab === 'index' ? TAB_ACTIVE : TAB} onClick={function () { setActiveTab('index') }}>Index</button>
      </div>
    </div>
  )
}

function Header({ curatorCount, dishCount, year }) {
  return (
    <div style={HEADER}>
      <div style={EYEBROW}>ask a local</div>
      <div style={TITLE}>The Locals' <span style={TITLE_ACCENT}>Picks</span></div>
      <div style={SUB}>{curatorCount} islander{curatorCount === 1 ? '' : 's'} &middot; {dishCount} dish{dishCount === 1 ? '' : 'es'} &middot; {year}</div>
    </div>
  )
}

function ReadTab() {
  var navigate = useNavigate()
  var consensusData = useLocalPicksConsensus()
  var curatorsData = useLocalPicksCurators()

  var consensus = consensusData.consensus
  var curators = curatorsData.curators
  var loading = consensusData.loading || curatorsData.loading
  var error = consensusData.error || curatorsData.error

  var curatorCount = curators.length
  var dishCount = curators.reduce(function (s, c) { return s + (c.item_count || 0) }, 0)
  var year = new Date().getFullYear()

  if (error) {
    return (
      <>
        <Header curatorCount={0} dishCount={0} year={year} />
        <p style={EMPTY}>{error?.message || 'Could not load picks.'}</p>
      </>
    )
  }
  if (loading && curators.length === 0) {
    return (
      <>
        <Header curatorCount={0} dishCount={0} year={year} />
        <p style={EMPTY}>Loading&hellip;</p>
      </>
    )
  }

  return (
    <>
      <Header curatorCount={curatorCount} dishCount={dishCount} year={year} />

      {consensus.length > 0 && (
        <>
          <div style={SECTION_LABEL}>everyone agrees</div>
          <div style={SECTION_SUB}>dishes more than one local picked</div>
          {consensus.map(function (row) {
            return (
              <button
                key={row.dish_id}
                type="button"
                style={ROW_CARD}
                onClick={function () { navigate('/dish/' + row.dish_id) }}
                className="active:scale-[0.99] transition-transform"
              >
                <div style={COUNT_BUBBLE}>{row.pick_count}</div>
                <div style={ROW_BODY}>
                  <div style={DISH_NAME}>{row.dish_name}</div>
                  <div style={ROW_REST}>{row.restaurant_name}</div>
                </div>
                <div style={RATING}>{row.avg_rating != null ? Number(row.avg_rating).toFixed(1) : '—'}</div>
              </button>
            )
          })}
        </>
      )}

      <div style={SECTION_LABEL}>or pick a local</div>
      <div style={SECTION_SUB}>scan their #1 &mdash; find one that catches your eye</div>

      {curators.map(function (c) {
        return (
          <button
            key={c.user_id}
            type="button"
            style={ROW_CARD}
            onClick={function () { navigate('/locals/' + c.user_id) }}
            className="active:scale-[0.99] transition-transform"
            aria-label={'Open ' + (c.display_name || 'curator') + '’s list'}
          >
            <div style={ROW_BODY}>
              <div style={CURATOR_NAME_LINE}>
                <span style={CURATOR_NAME}>{c.display_name || 'Anonymous'}</span>
                {c.curator_tagline && <span style={CURATOR_ROLE}>{c.curator_tagline}</span>}
              </div>
              {c.top_dish_name && (
                <div style={CURATOR_PICK}>
                  #1 <b style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{c.top_dish_name}</b>
                  {c.top_restaurant_name && <span> at <span style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>{c.top_restaurant_name}</span></span>}
                </div>
              )}
            </div>
            <span style={CHEVRON}>&rsaquo;</span>
          </button>
        )
      })}
    </>
  )
}

function SearchTab() {
  var navigate = useNavigate()
  var [query, setQuery] = useState('')
  var { results, loading, error } = useLocalPicksSearch(query, true)

  return (
    <>
      <div style={HEADER}>
        <div style={EYEBROW}>ask a local</div>
        <div style={TITLE}>Search the <span style={TITLE_ACCENT}>Picks</span></div>
        <div style={SUB}>vegan &middot; raw bar &middot; cheap eats &middot; chowder</div>
      </div>
      <input
        type="search"
        value={query}
        onChange={function (e) { setQuery(e.target.value) }}
        placeholder="What are you looking for?"
        style={SEARCH_INPUT}
        aria-label="Search locals' picks"
      />

      {error && <p style={EMPTY}>{error?.message || 'Search failed.'}</p>}
      {!error && loading && query.trim() && <p style={EMPTY}>Searching&hellip;</p>}
      {!error && !loading && query.trim() && results.length === 0 && (
        <p style={EMPTY}>Nothing matches &ldquo;{query}&rdquo;.</p>
      )}
      {results.map(function (r) {
        return (
          <button
            key={r.dish_id + ':' + r.curator_user_id}
            type="button"
            style={ROW_CARD}
            onClick={function () { navigate('/dish/' + r.dish_id) }}
            className="active:scale-[0.99] transition-transform"
          >
            <div style={ROW_BODY}>
              <div style={DISH_NAME}>{r.dish_name}</div>
              <div style={ROW_REST}>{r.restaurant_name} &middot; picked by {r.curator_display_name}</div>
              {r.note && <div style={{ fontSize: '11px', fontStyle: 'italic', color: 'var(--color-text-secondary)', marginTop: '3px', lineHeight: 1.3 }}>&ldquo;{r.note}&rdquo;</div>}
            </div>
            <div style={RATING}>{r.avg_rating != null ? Number(r.avg_rating).toFixed(1) : '—'}</div>
          </button>
        )
      })}
    </>
  )
}

function IndexTab() {
  var navigate = useNavigate()
  var { index, loading, error } = useLocalPicksIndex(true)

  var grouped = useMemo(function () {
    var map = new Map()
    for (var i = 0; i < index.length; i++) {
      var row = index[i]
      var letter = (row.dish_name || '?').charAt(0).toUpperCase()
      if (!/[A-Z]/.test(letter)) letter = '#'
      if (!map.has(letter)) map.set(letter, [])
      map.get(letter).push(row)
    }
    var letters = []
    map.forEach(function (rows, letter) { letters.push({ letter: letter, rows: rows }) })
    letters.sort(function (a, b) { return a.letter < b.letter ? -1 : 1 })
    return letters
  }, [index])

  return (
    <>
      <div style={HEADER}>
        <div style={EYEBROW}>ask a local</div>
        <div style={TITLE}>The <span style={TITLE_ACCENT}>Index</span></div>
        <div style={SUB}>every dish picked by anyone &mdash; A to Z</div>
      </div>

      {error && <p style={EMPTY}>{error?.message || 'Could not load index.'}</p>}
      {!error && loading && index.length === 0 && <p style={EMPTY}>Loading&hellip;</p>}

      {grouped.map(function (group) {
        return (
          <div key={group.letter}>
            <div style={INDEX_HEAD}>{group.letter}</div>
            {group.rows.map(function (row) {
              return (
                <button
                  key={row.dish_id}
                  type="button"
                  style={ROW_CARD}
                  onClick={function () { navigate('/dish/' + row.dish_id) }}
                  className="active:scale-[0.99] transition-transform"
                >
                  <div style={ROW_BODY}>
                    <div style={DISH_NAME}>{row.dish_name}</div>
                    <div style={ROW_REST}>{row.restaurant_name} &middot; {row.pick_count} pick{row.pick_count === 1 ? '' : 's'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>{(row.curator_names || []).join(' · ')}</div>
                  </div>
                  <div style={RATING}>{row.avg_rating != null ? Number(row.avg_rating).toFixed(1) : '—'}</div>
                </button>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
```

- [ ] **Step 8.2: Commit**

```bash
git add src/pages/Locals.jsx
git commit -m "feat(pages): add Locals.jsx (Read/Search/Index tabs)"
```

---

## Task 9 — `LocalsCurator.jsx` page (menu format)

**Files:**
- Create: `src/pages/LocalsCurator.jsx`

Reuses the existing `useLocalListDetail(userId)` hook.

- [ ] **Step 9.1: Write the page**

```jsx
import { useNavigate, useParams } from 'react-router-dom'
import { useLocalListDetail } from '../hooks/useLocalListDetail'
import { LocalsPicksStamp } from '../components/home/LocalsPicksStamp'

var PAGE = {
  background: 'linear-gradient(180deg, var(--color-paper-cream-light) 0%, var(--color-paper-cream-dark) 100%)',
  minHeight: '100vh',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  position: 'relative',
}
var GRAIN = {
  position: 'fixed',
  inset: 0,
  backgroundImage:
    'radial-gradient(circle at 20% 20%, rgba(196,138,18,.05), transparent 50%),' +
    'radial-gradient(circle at 80% 80%, rgba(228,68,10,.04), transparent 50%)',
  pointerEvents: 'none',
  zIndex: 0,
}
var INNER = { padding: '20px 24px 80px', position: 'relative', zIndex: 1, maxWidth: '720px', margin: '0 auto' }

var NAV_ROW = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }
var CLOSE = { fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }
var PAGENO = { fontFamily: "'Amatic SC', cursive", fontSize: '16px', fontWeight: 700, color: 'var(--color-text-tertiary)' }

var STAMP_TINY = { position: 'absolute', top: '54px', right: '24px', width: '44px', height: '44px', transform: 'rotate(10deg)', opacity: 0.8, zIndex: 2 }

var EYEBROW = { fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'var(--color-accent-gold)', marginBottom: '-2px' }
var TITLE = { fontFamily: "'Amatic SC', cursive", fontWeight: 700, fontSize: '52px', lineHeight: 0.95, color: 'var(--color-text-primary)' }
var BYLINE = { fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '16px' }

var ITEM = { marginBottom: '11px', padding: '0 2px' }
var ITEM_HEAD = { display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '1px' }
var ITEM_NAME = { fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }
var DOTS = { flex: 1, minWidth: '8px', borderBottom: '1.5px dotted rgba(0,0,0,.25)', alignSelf: 'flex-end', marginBottom: '5px' }
var RATING = { fontWeight: 700, fontSize: '16px', color: 'var(--color-rating)', fontVariantNumeric: 'tabular-nums' }
var META = { display: 'flex', gap: '6px', fontSize: '11px', paddingLeft: '2px' }
var REST = { color: 'var(--color-accent-gold)', fontWeight: 600 }
var NOTE = { fontSize: '12.5px', color: 'var(--color-text-secondary)', lineHeight: 1.4, marginTop: '4px', paddingLeft: '2px', fontStyle: 'italic' }

var EMPTY = { textAlign: 'center', padding: '40px 0', fontSize: '13px', color: 'var(--color-text-tertiary)' }

export function LocalsCurator() {
  var { userId } = useParams()
  var navigate = useNavigate()
  var { items, loading, error } = useLocalListDetail(userId)

  if (loading) {
    return <div style={PAGE}><div style={GRAIN} /><div style={INNER}><p style={EMPTY}>Loading&hellip;</p></div></div>
  }
  if (error) {
    return <div style={PAGE}><div style={GRAIN} /><div style={INNER}><p style={EMPTY}>{error?.message || 'Could not load this list.'}</p></div></div>
  }
  if (!items || items.length === 0) {
    return <div style={PAGE}><div style={GRAIN} /><div style={INNER}><p style={EMPTY}>This local hasn't shared a list yet.</p></div></div>
  }

  var first = items[0]

  return (
    <div style={PAGE}>
      <div style={GRAIN} />
      <div style={INNER}>
        <div style={NAV_ROW}>
          <button type="button" style={CLOSE} onClick={function () { navigate('/locals') }}>&larr; All locals</button>
          <span style={PAGENO}>the menu</span>
        </div>
        <div style={STAMP_TINY}>
          <LocalsPicksStamp seed={11} includeRibbon={false} size={44} />
        </div>

        <div style={EYEBROW}>a local's picks</div>
        <h1 style={TITLE}>{first.display_name || 'Anonymous'}</h1>
        <div style={BYLINE}>{first.description || (first.title || '')}</div>

        {items.map(function (item) {
          return (
            <div key={item.dish_id} style={ITEM}>
              <div style={ITEM_HEAD}>
                <span style={ITEM_NAME}>
                  <button
                    type="button"
                    onClick={function () { navigate('/dish/' + item.dish_id) }}
                    style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                  >
                    {item.dish_name}
                  </button>
                </span>
                <span style={DOTS} />
                <span style={RATING}>{item.avg_rating != null ? Number(item.avg_rating).toFixed(1) : '—'}</span>
              </div>
              <div style={META}>
                <button
                  type="button"
                  onClick={function () { navigate('/restaurants/' + item.restaurant_id) }}
                  style={Object.assign({ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }, REST)}
                >
                  {item.restaurant_name}
                </button>
              </div>
              {item.note && <div style={NOTE}>&ldquo;{item.note}&rdquo;</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 9.2: Commit**

```bash
git add src/pages/LocalsCurator.jsx
git commit -m "feat(pages): add LocalsCurator.jsx (menu format)"
```

---

## Task 10 — Routing

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 10.1: Add lazy imports + routes**

In the lazy-loaded pages section (around line 50-57), add:
```js
const Locals = lazyWithRetry(() => import('./pages/Locals'), 'Locals')
const LocalsCurator = lazyWithRetry(() => import('./pages/LocalsCurator'), 'LocalsCurator')
```

In the `<Routes>` block (after `/jitter`, before `<Route path="*" element={<NotFound />} />`), add:
```jsx
<Route path="/locals" element={<Layout><Locals /></Layout>} />
<Route path="/locals/:userId" element={<Layout><LocalsCurator /></Layout>} />
```

- [ ] **Step 10.2: Smoke-check routes**

`npm run dev` if not running. In the browser:
- http://localhost:5173/locals — TOC page should load with "Read" tab active.
- Tap a curator row — URL changes to `/locals/<uuid>`, curator's menu renders.
- Tap "← All locals" — back to `/locals`.
- Tap "← Close" on `/locals` — back to `/`.

(Homepage at `/` still shows the OLD `LocalListsSection` carousel at this point — that's expected; cutover happens in Task 11.)

- [ ] **Step 10.3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(routes): wire /locals and /locals/:userId"
```

---

## Task 11 — Cut-over `HomeListMode.jsx`

This is the hinge step. After this commit, nothing in `src/` references the old code, which makes Task 12's deletes safe.

**Files:**
- Modify: `src/components/home/HomeListMode.jsx`

- [ ] **Step 11.1: Replace import line**

In `src/components/home/HomeListMode.jsx`, change line 8:
```js
import { LocalListsSection, Top10Carousel } from './'
```
to:
```js
import { LocalsPicksBanner, Top10Carousel } from './'
```

- [ ] **Step 11.2: Remove `useLocalsAggregate` import + state**

Delete line 9:
```js
import { useLocalsAggregate } from '../../hooks/useLocalsAggregate'
```

Delete lines 34-35 (the `localsAggregateData` declaration + the `localsAggregate` derived var).

- [ ] **Step 11.3: Remove `localsAggregate` from `ChalkboardSection` props**

In the JSX call inside the rendered tree (around line 179-186), remove the `localsAggregate={localsAggregate}` prop. The call should now be:
```jsx
<ChalkboardSection
  topRestaurant={topRestaurant}
  mostVotedDish={mostVotedDish}
  bestValueMeal={bestValueMeal}
  bestIceCream={bestIceCream}
  onExpandCategory={handleCategorySelect}
/>
```

- [ ] **Step 11.4: Replace `<LocalListsSection ...>` with `<LocalsPicksBanner />`**

Around line 189, replace:
```jsx
<LocalListsSection onListExpanded={onLocalListExpanded} />
```
with:
```jsx
<LocalsPicksBanner />
```

- [ ] **Step 11.5: Strip chalkboards 7 & 8 + the helper component**

Find `function ChalkboardSection({ topRestaurant, mostVotedDish, bestValueMeal, bestIceCream, localsAggregate, onExpandCategory })`.

- Remove `localsAggregate` from destructured params.
- Remove the two `{localsAggregate && ...}` JSX blocks at the bottom of the function (Boards 7 and 8).
- Remove the entire `function LocalsChalkboardCard(...)` definition.
- Remove the `COUNT_BADGE` style constant (only used by `LocalsChalkboardCard`).
- Remove the `BOARD_OUTER_WIDE` style constant (only used by `LocalsChalkboardCard`).

- [ ] **Step 11.6: Verify build + lint pass**

```bash
npm run lint
npm run build
```
Both should be clean.

- [ ] **Step 11.7: Smoke-check homepage**

`npm run dev`. Open http://localhost:5173. Confirm:
- Chalkboard strip shows 4-6 boards (no "locals agree" / "island favorite").
- Cream-paper "Locals' Picks" banner appears below chalkboards, above Top 10.
- Tapping the banner navigates to `/locals`.
- Top 10 carousel still renders normally below the banner.

- [ ] **Step 11.8: Commit**

```bash
git add src/components/home/HomeListMode.jsx
git commit -m "feat(home): cut HomeListMode over to LocalsPicksBanner; remove chalkboards 7+8"
```

---

## Task 12 — Cleanup (deletes only — safe because nothing in `src/` references the old code anymore)

**Files:**
- Modify: `src/api/localListsApi.js` — remove `getAggregate`
- Modify: `src/components/home/index.js` — remove `LocalListsSection` export
- Modify: `supabase/schema.sql` — remove `get_locals_aggregate` block
- Delete: `src/components/home/LocalListsSection.jsx`
- Delete: `src/hooks/useLocalsAggregate.js`
- Create: `supabase/migrations/2026-04-25-locals-picks-toc-cleanup.sql`

- [ ] **Step 12.1: Confirm no callers of the old surface remain**

```bash
grep -rn "LocalListsSection\|useLocalsAggregate\|getAggregate\|get_locals_aggregate" src/ supabase/schema.sql 2>/dev/null
```
Expected output:
- `src/api/localListsApi.js` — has `async getAggregate()` and the RPC string.
- `src/components/home/LocalListsSection.jsx` — itself.
- `src/components/home/index.js` — its own export line.
- `src/hooks/useLocalsAggregate.js` — itself.
- `supabase/schema.sql` — the function definition block.

NO references in `src/components/home/HomeListMode.jsx` or any other consumer. If any consumer still references the old surface, STOP and fix Task 11 before continuing.

- [ ] **Step 12.2: Remove `getAggregate` from `localListsApi.js`**

Delete the entire `async getAggregate() { ... }` block.

- [ ] **Step 12.3: Remove `LocalListsSection` export from barrel**

In `src/components/home/index.js`, delete the `export { LocalListsSection } from './LocalListsSection'` line.

- [ ] **Step 12.4: Remove `get_locals_aggregate` block from `schema.sql`**

Find the block beginning `DROP FUNCTION IF EXISTS get_locals_aggregate();` (≈ line 2930) ending after the function body's `$$;`. Delete the whole block.

- [ ] **Step 12.5: Delete the two source files**

```bash
rm src/components/home/LocalListsSection.jsx src/hooks/useLocalsAggregate.js
```

- [ ] **Step 12.6: Write the cleanup migration**

Create `supabase/migrations/2026-04-25-locals-picks-toc-cleanup.sql`:
```sql
-- Cleanup: drop get_locals_aggregate now that the chalkboard cards that called it are gone.
DROP FUNCTION IF EXISTS get_locals_aggregate();

-- ROLLBACK:
-- Restore the function body from the previous schema.sql (or supabase/migrations/locals-aggregate.sql).
-- No data is lost by the drop; this RPC computes aggregates over local_lists/local_list_items.
```

- [ ] **Step 12.7: Run cleanup migration in Supabase SQL Editor**

⚠ Only run this AFTER the PR with Task 11 is merged and the new homepage code is deployed to production. Otherwise the live deployed app will throw on chalkboard 7/8 RPC calls.

If the PR has not yet merged: skip to Step 12.8 and revisit after deploy.

In SQL Editor: paste the cleanup migration, run.
Expected: "Success. No rows returned".

Verify the function is gone:
```sql
SELECT proname FROM pg_proc WHERE proname = 'get_locals_aggregate';
-- Expected: 0 rows.
```

- [ ] **Step 12.8: Verify build + lint after deletes**

```bash
npm run lint
npm run build
```
Both clean.

- [ ] **Step 12.9: Commit cleanup**

```bash
git add src/api/localListsApi.js src/components/home/index.js src/components/home/LocalListsSection.jsx src/hooks/useLocalsAggregate.js supabase/schema.sql supabase/migrations/2026-04-25-locals-picks-toc-cleanup.sql
git commit -m "chore: remove LocalListsSection, useLocalsAggregate, getAggregate, get_locals_aggregate"
```

---

## Task 13 — E2E smoke test

**Files:**
- Create: `e2e/browser/locals.spec.js`

- [ ] **Step 13.1: Write the test**

```js
import { test, expect } from '../fixtures/test.js'

test.describe("Home — Locals' Picks banner + TOC", () => {
  test('banner appears on homepage and opens /locals', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-dish-id]').first()).toBeVisible({ timeout: 20_000 })

    const banner = page.getByRole('button', { name: /Open Locals’ Picks/i })
    await expect(banner).toBeVisible({ timeout: 10_000 })
    await banner.click()

    await expect(page).toHaveURL(/\/locals$/)
    await expect(page.getByText(/The Locals'\s*Picks/i).first()).toBeVisible()

    const readTab = page.getByRole('tab', { name: 'Read' })
    await expect(readTab).toHaveAttribute('aria-selected', 'true')
  })

  test('TOC tab switching works', async ({ page }) => {
    await page.goto('/locals')
    await expect(page.getByText(/The Locals'\s*Picks/i).first()).toBeVisible({ timeout: 15_000 })

    await page.getByRole('tab', { name: 'Search' }).click()
    await expect(page.getByPlaceholder(/What are you looking for\?/i)).toBeVisible()

    await page.getByRole('tab', { name: 'Index' }).click()
    await expect(page.getByText(/every dish picked/i)).toBeVisible()

    await page.getByRole('tab', { name: 'Read' }).click()
    await expect(page.getByText(/or pick a local/i)).toBeVisible()
  })

  test('curator row opens menu page', async ({ page }) => {
    await page.goto('/locals')

    const curatorBtn = page.getByRole('button', { name: /Open .* list/i }).first()
    await expect(curatorBtn).toBeVisible({ timeout: 15_000 })
    await curatorBtn.click()

    await expect(page).toHaveURL(/\/locals\/[0-9a-f-]+$/)
    await expect(page.getByText(/the menu/i).first()).toBeVisible()

    await page.getByRole('button', { name: /All locals/i }).click()
    await expect(page).toHaveURL(/\/locals$/)
  })
})
```

- [ ] **Step 13.2: Run the test**

```bash
npm run test:e2e:browser -- --grep "Locals' Picks"
```
Expected: 3 tests pass. If the curator-row test fails, the staging DB likely has no active local lists — check with `SELECT COUNT(*) FROM local_lists WHERE is_active = true;` and seed if needed.

- [ ] **Step 13.3: Commit**

```bash
git add e2e/browser/locals.spec.js
git commit -m "test(e2e): banner -> TOC -> curator menu smoke flow"
```

---

## Task 14 — Final verification + PR

- [ ] **Step 14.1: Full local verification**

Run in parallel:
```bash
npm run lint
npm run test
npm run build
```
All three pass.

- [ ] **Step 14.2: Manual UI smoke**

`npm run dev`. Walk `SMOKE-TEST.md` golden paths plus the new flow:
1. Homepage loads → banner visible below chalkboards, no "locals agree" / "island favorite" boards.
2. Tap banner → `/locals` opens, header counts correct.
3. Read tab: consensus + curator rows scroll smoothly.
4. Search tab: type "lobster" → results appear with restaurant + curator.
5. Index tab: A-Z headings appear, dishes grouped under correct letter.
6. Tap curator row → menu format, dotted leaders, rating in price slot, italic notes.
7. Tap dish in menu → dish detail page.
8. Browser back → returns to `/locals`.

- [ ] **Step 14.3: Confirm not on main, push, open PR**

```bash
git branch --show-current     # MUST NOT print main / master
git push -u origin HEAD
gh pr create --title "feat(home): Locals' Picks banner + TOC route (replaces 4-card carousel)" --body "$(cat <<'EOF'
## Summary
- Replaces the 4-card LocalListsSection carousel on the homepage with a single cream-paper "Locals' Picks" banner in the same DOM slot
- Adds /locals TOC route with three tabs: Read (consensus + curator rows showing each curator's #1 as bait), Search (full-text across dishes/restaurants/curators/notes), Index (A-Z dish aggregator)
- Adds /locals/:userId curator menu route — dotted leaders, rating in price slot, italic notes
- Removes chalkboards #7 ("locals agree") and #8 ("island favorite") since the banner now owns that entry point
- Drops the now-unused get_locals_aggregate RPC (cleanup migration runs after deploy)
- Adds three new tokens (--color-paper-cream-light/dark, --color-stamp-red) so the banner identity is one-file-changeable
- Mockup: .tmp/local-list-as-section.html

## Test plan
- [x] schema.sql synced first; migration 2026-04-25-locals-picks-toc.sql deployed; four new RPCs verified via SQL editor
- [x] npm run lint passes
- [x] npm run test passes
- [x] npm run build passes
- [x] npm run test:e2e:browser passes (incl. new locals.spec.js)
- [x] Manual smoke: banner -> TOC -> Read/Search/Index tabs -> curator menu -> dish detail
- [ ] After deploy: run supabase/migrations/2026-04-25-locals-picks-toc-cleanup.sql in SQL Editor to drop get_locals_aggregate
EOF
)"
```

- [ ] **Step 14.4: Post-deploy follow-up**

After PR merges and Vercel deploys to production, run `supabase/migrations/2026-04-25-locals-picks-toc-cleanup.sql` in the SQL Editor (Step 12.7). Confirm via `SELECT proname FROM pg_proc WHERE proname = 'get_locals_aggregate';` returns 0 rows.

---

## Self-review

**Spec coverage:**

| Mockup section | Covered by |
|---|---|
| Cream-paper banner with "tried & true" stamp | Tasks 6 + 7 |
| Banner sits in current carousel slot | Task 11 (Step 11.4) |
| `/locals` TOC route | Task 10 |
| Consensus strip ("everyone agrees") | Task 2 §1, Task 8 (`ReadTab`) |
| Curator rows with #1 as bait, ordered by followers→alpha | Task 2 §2, Task 8 (`ReadTab`) |
| Read/Search/Index tabs (all L1) | Task 2 §3+§4, Task 8 |
| Curator menu detail with rating-in-price-slot + dotted leaders + italic notes | Task 9 |
| Remove chalkboards 7+8 | Task 11 (Step 11.5) |
| Drop unused `get_locals_aggregate` | Task 12 (Steps 12.4 / 12.6 / 12.7) |
| Dynamic banner counts | Task 7 reads `useLocalPicksCurators` |
| Brand-defining colors via tokens | Task 1 + tokens used in Tasks 7/8/9 |
| Schema.sql is source-of-truth before SQL Editor | Tasks 2 → 3 ordering |
| No commit window with broken build or broken live RPC | Additive Tasks 1-10, cutover Task 11, cleanup Task 12 |

**Placeholder scan:** No `TBD`, no "implement later", no "similar to Task N", no `add error handling` — every step has explicit code, exact paths, and exact commands.

**Type/name consistency:**
- RPC names: `get_local_picks_consensus`, `get_local_picks_curators`, `search_local_picks`, `get_local_picks_index` — used identically across schema.sql, migration, API, hooks.
- API methods: `getConsensus`, `getCurators`, `searchPicks`, `getIndex` — used identically across API and hooks.
- Hook names: `useLocalPicksConsensus`, `useLocalPicksCurators`, `useLocalPicksSearch`, `useLocalPicksIndex`.
- Existing `useLocalListDetail(userId)` reused for `LocalsCurator.jsx`.
- Tokens: `--color-paper-cream-light`, `--color-paper-cream-dark`, `--color-stamp-red` — defined in Task 1, used in Tasks 7/8/9.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-25-locals-picks-toc.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
