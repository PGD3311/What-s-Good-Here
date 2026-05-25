# Check-ins v1 — implementation spec

**Status:** Draft for codex review
**Authors:** Dan + MV-002
**Background:** Brainstorm completed 2026-04-26 — see [project_check_ins_design.md memory](../../). 9 design decisions locked. This spec converts those decisions into concrete schema, RPCs, hooks, components, and ship boundaries.

---

## 1. Goal

Let a logged-in user record "I was at this restaurant." Two verbs:

- **Live check-in** — GPS-confirmed, within 150m of the restaurant pin
- **Logged visit** — manual, retroactive, any past date

Both write to the same table, distinguished by a `kind` column. A check-in can optionally tag one or more dishes from that restaurant's menu (the "rate this" completion path).

## 2. Scope (this PR vs follow-ups)

Locked-decision Submission bucket is bigger than one PR. Cutting into 3 ships so reviews stay scannable:

| Ship | Surface | What lands |
|---|---|---|
| **v1 (this spec)** | Schema + Restaurant detail | Tables, RPCs, hook, `<CheckInButton>` on restaurant-detail page (live or retro depending on GPS), optional dish-tag picker. Logged-in users only. Native-iOS-gated (`Capacitor.isNativePlatform()`). |
| **v2** | Profile + nudges | Cold-open banner for unrated-but-checked-in dishes, Journal "Pending" shelf, profile check-in count badge ("37 visits this season"). |
| **v3** | Map + social | Places-been Leaflet map on profile (pins from `votes ∪ check_ins`), "12 friends have been here" on restaurant page, `useFollowing` integration. |

Push notifications, public feed on UserProfile, profile-side "Add a visit" entry, and background-location detection stay in fast-follow per the locked decision.

**This spec covers v1 only.** v2/v3 specs come after v1 lands.

## 3. Data model

### 3.1 `check_ins` table

```sql
CREATE TABLE check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('live', 'logged')),

  -- Live: server-set to NOW(). Logged: client-supplied past date.
  visited_at TIMESTAMPTZ NOT NULL,

  -- Optional: only set for kind='live'. Lets us audit proximity later
  -- and gives the v3 map something to draw with sub-restaurant precision
  -- (different tables at the same restaurant, dock vs. street, etc.).
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,

  -- Optional free-text note ("first time trying the bisque"). 280 char cap.
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent accidental double-tap on Live (debounce at DB level).
-- Same user can't have two live check-ins to the same restaurant within 1h.
CREATE UNIQUE INDEX uniq_live_recent ON check_ins (user_id, restaurant_id)
WHERE kind = 'live' AND visited_at > NOW() - INTERVAL '1 hour';

CREATE INDEX idx_check_ins_user_visited ON check_ins (user_id, visited_at DESC);
CREATE INDEX idx_check_ins_restaurant ON check_ins (restaurant_id, visited_at DESC);
```

### 3.2 `check_in_dishes` join table

```sql
CREATE TABLE check_in_dishes (
  check_in_id UUID NOT NULL REFERENCES check_ins(id) ON DELETE CASCADE,
  dish_id UUID NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  PRIMARY KEY (check_in_id, dish_id)
);

CREATE INDEX idx_check_in_dishes_dish ON check_in_dishes (dish_id);
```

### 3.3 RLS

```sql
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_in_dishes ENABLE ROW LEVEL SECURITY;

-- Read: own check-ins, plus check-ins of public users (block-list filtered
-- via existing is_blocked_pair helper).
CREATE POLICY check_ins_select_own_or_public ON check_ins
  FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR (auth.uid() IS NULL OR NOT is_blocked_pair(auth.uid(), user_id))
  );

-- Write: only your own
CREATE POLICY check_ins_insert_own ON check_ins
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY check_ins_delete_own ON check_ins
  FOR DELETE USING (user_id = (select auth.uid()));

-- Join table inherits via the check_in row's RLS
CREATE POLICY check_in_dishes_via_check_in ON check_in_dishes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM check_ins ci
      WHERE ci.id = check_in_dishes.check_in_id
        AND (ci.user_id = (select auth.uid()) OR NOT is_blocked_pair((select auth.uid()), ci.user_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM check_ins ci
      WHERE ci.id = check_in_dishes.check_in_id
        AND ci.user_id = (select auth.uid())
    )
  );
```

## 4. RPCs

### 4.1 `submit_check_in`

```sql
CREATE OR REPLACE FUNCTION submit_check_in(
  p_restaurant_id UUID,
  p_kind TEXT,                          -- 'live' | 'logged'
  p_visited_at TIMESTAMPTZ DEFAULT NULL, -- required for logged, ignored for live
  p_lat DOUBLE PRECISION DEFAULT NULL,   -- live only
  p_lng DOUBLE PRECISION DEFAULT NULL,   -- live only
  p_note TEXT DEFAULT NULL,
  p_dish_ids UUID[] DEFAULT NULL
)
RETURNS check_ins AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
  v_visited_at TIMESTAMPTZ;
  v_distance_m DOUBLE PRECISION;
  v_check_in check_ins;
  v_dish UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_kind NOT IN ('live', 'logged') THEN
    RAISE EXCEPTION 'kind must be live or logged';
  END IF;

  -- Note length guard (UI also enforces; defense in depth)
  IF p_note IS NOT NULL AND length(p_note) > 280 THEN
    RAISE EXCEPTION 'note exceeds 280 chars';
  END IF;

  IF p_kind = 'live' THEN
    IF p_lat IS NULL OR p_lng IS NULL THEN
      RAISE EXCEPTION 'live check-in requires lat/lng';
    END IF;

    -- Server-side proximity check (≤150m). Belt and suspenders against
    -- a tampered client that lies about its GPS.
    SELECT haversine_meters(p_lat, p_lng, r.lat, r.lng)
      INTO v_distance_m
      FROM restaurants r WHERE r.id = p_restaurant_id;

    IF v_distance_m IS NULL THEN
      RAISE EXCEPTION 'restaurant not found';
    END IF;

    IF v_distance_m > 150 THEN
      RAISE EXCEPTION 'too far from restaurant for live check-in (%.0fm)', v_distance_m;
    END IF;

    v_visited_at := NOW();
  ELSE  -- logged
    IF p_visited_at IS NULL THEN
      RAISE EXCEPTION 'logged check-in requires visited_at';
    END IF;
    IF p_visited_at > NOW() THEN
      RAISE EXCEPTION 'visited_at cannot be in the future';
    END IF;
    v_visited_at := p_visited_at;
  END IF;

  -- Rate limit: 20 check-ins/hour per user (lightweight abuse cap)
  IF (SELECT COUNT(*) FROM check_ins
      WHERE user_id = v_user_id
        AND created_at > NOW() - INTERVAL '1 hour') >= 20 THEN
    RAISE EXCEPTION 'rate_limit: too many check-ins this hour';
  END IF;

  INSERT INTO check_ins (user_id, restaurant_id, kind, visited_at, lat, lng, note)
  VALUES (
    v_user_id, p_restaurant_id, p_kind, v_visited_at,
    CASE WHEN p_kind = 'live' THEN p_lat END,
    CASE WHEN p_kind = 'live' THEN p_lng END,
    p_note
  )
  RETURNING * INTO v_check_in;

  -- Optional dish tags. We trust the IDs but constrain to dishes at this
  -- restaurant — caller can't tag dishes from another restaurant.
  IF p_dish_ids IS NOT NULL THEN
    FOREACH v_dish IN ARRAY p_dish_ids LOOP
      IF EXISTS (SELECT 1 FROM dishes d
                 WHERE d.id = v_dish AND d.restaurant_id = p_restaurant_id) THEN
        INSERT INTO check_in_dishes (check_in_id, dish_id)
        VALUES (v_check_in.id, v_dish)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN v_check_in;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION submit_check_in TO authenticated;
```

`haversine_meters` already exists in the codebase (used by `find_nearby_restaurants`). Reuse it.

### 4.2 `delete_check_in`

```sql
CREATE OR REPLACE FUNCTION delete_check_in(p_check_in_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
  v_deleted INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM check_ins
  WHERE id = p_check_in_id AND user_id = v_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION delete_check_in TO authenticated;
```

### 4.3 `get_user_check_ins`

```sql
CREATE OR REPLACE FUNCTION get_user_check_ins(p_user_id UUID, p_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID,
  restaurant_id UUID,
  restaurant_name TEXT,
  restaurant_town TEXT,
  kind TEXT,
  visited_at TIMESTAMPTZ,
  note TEXT,
  dish_count INT
) AS $$
  SELECT
    ci.id,
    ci.restaurant_id,
    r.name,
    r.town,
    ci.kind,
    ci.visited_at,
    ci.note,
    COALESCE((SELECT COUNT(*) FROM check_in_dishes cid WHERE cid.check_in_id = ci.id)::INT, 0)
  FROM check_ins ci
  JOIN restaurants r ON r.id = ci.restaurant_id
  WHERE ci.user_id = p_user_id
    AND (auth.uid() IS NULL OR NOT is_blocked_pair(auth.uid(), p_user_id))
  ORDER BY ci.visited_at DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_user_check_ins TO anon, authenticated;
```

## 5. Client layer

### 5.1 New API module: `src/api/checkInsApi.js`

Standard pattern (matches `votesApi.js`):

```js
export const checkInsApi = {
  async submitCheckIn({ restaurantId, kind, visitedAt = null, lat = null, lng = null, note = null, dishIds = null }) { ... },
  async deleteCheckIn(checkInId) { ... },
  async getUserCheckIns(userId, limit = 50) { ... },
}
```

### 5.2 New hook: `src/hooks/useCheckIn.js`

Wraps `useMutation` for submitCheckIn with optimistic update (insert into local cache, rollback on error). Invalidates `['check-ins', userId]` cache key.

### 5.3 New hook: `src/hooks/useUserCheckIns.js`

Wraps `useQuery` for `getUserCheckIns`.

### 5.4 New component: `src/components/restaurants/CheckInButton.jsx`

Mounted in `RestaurantDetail.jsx` for native-iOS users only:

```jsx
import { Capacitor } from '@capacitor/core'

export function CheckInButton({ restaurant, nearbyRestaurant }) {
  if (!Capacitor.isNativePlatform()) return null

  const isHere = nearbyRestaurant?.id === restaurant.id
  const label = isHere ? 'Check in here' : "I've been here"

  return <button onClick={() => openSheet(isHere ? 'live' : 'logged')}>{label}</button>
}
```

### 5.5 New component: `src/components/restaurants/CheckInSheet.jsx`

Bottom sheet (matches `DietSheet` pattern). Two modes:

- **Live mode** — confirms restaurant, optional note, optional dish-tag picker (multi-select from `useDishesForRestaurant`), submit
- **Logged mode** — same as Live + a date picker (HTML5 `<input type="date">` first cut)

### 5.6 Wire-in to `RestaurantDetail.jsx`

One line: `<CheckInButton restaurant={restaurant} nearbyRestaurant={nearby} />` near the existing action buttons (Order/Directions). Already has `useNearbyRestaurant` data flowing through if needed.

## 6. Native-iOS gating

Per locked decision #7: all check-in UI is gated to `Capacitor.isNativePlatform()`. Web/PWA never mounts `CheckInButton` or any v2/v3 surface.

Rationale: GPS reliability on PWA varies wildly across browsers; native gives us a clean story for the "live presence is real" promise. Once Capacitor APNs is wired in v2, push notifications land on native first anyway.

**Reasoning that's NEW since the brainstorm:** we're past v1.0 launch. Native-gating now is even safer than at design time — no risk of a "feature visible on web but broken on native" cliff, since v1.3 is the next App Store cut and ships with check-ins.

## 7. Verification checklist

- [ ] Migration runs cleanly in Supabase SQL Editor
- [ ] `submit_check_in` rejects: not-authenticated, wrong kind, future visited_at, missing GPS for live, GPS >150m for live, note >280 chars, >20 in an hour, dish_ids that don't belong to the restaurant
- [ ] `submit_check_in` accepts: valid live, valid logged, with dish tags, without dish tags
- [ ] RLS: user A can read their own + public B's; cannot read blocked B's; cannot insert as B
- [ ] `useCheckIn` rollback fires on error
- [ ] CheckInButton hides on PWA (web), shows on native simulator
- [ ] Submit sheet copy: explicit about live vs logged, the 150m radius if denied
- [ ] No new ES2023+ syntax (CLAUDE.md 1.1)
- [ ] No direct Supabase from components (CLAUDE.md 1.4)
- [ ] No `console.*` — use `logger` (CLAUDE.md 1.7)
- [ ] Brand colors via `var(--color-*)`, no Tailwind color classes (CLAUDE.md 1.3)

## 8. Open questions (codex pass + Dan)

1. **`uniq_live_recent` partial index with `NOW()` predicate** — Postgres rejects non-IMMUTABLE functions in partial index predicates. Need to enforce the 1-hour dedupe in the RPC body instead, OR use a different mechanism (e.g. application-level unique on `(user_id, restaurant_id, date_trunc('hour', visited_at))` for the partial index). I'll likely move the check into `submit_check_in`.
2. **`get_user_check_ins` exposes `note` to all readers** — fine for v1, but if v3 adds a "private check-in" toggle, the SELECT policy + RPC return need updating in lockstep.
3. **Dish tagging on logged (retroactive) check-ins** — the dish must have existed at the restaurant on `visited_at`. We don't track dish add dates strictly. Living with "trust current menu" for v1; flag if abuse emerges.
4. **Rate limit (20/hr) generous or tight?** — matches vote rate limit. Live check-ins probably don't hit it; abuse vector is logged-spam.
5. **Push notification scope for v2** — APNs token capture needs Capacitor plugin install. Out of scope here.

## 9. Implementation order

1. Migration file: `supabase/migrations/2026-05-25-check-ins.sql` (+ rollback block per CLAUDE.md 1.5)
2. RPCs in same migration
3. `checkInsApi.js` + tests
4. `useCheckIn` + `useUserCheckIns` hooks
5. `CheckInSheet` + `CheckInButton` components
6. Wire into `RestaurantDetail.jsx`
7. Update `schema.sql` to reflect new tables/RPCs
8. Manual smoke test on iOS simulator
9. PR

---

*v2 spec (Profile + nudges) and v3 spec (Map + social) come after v1 lands.*
