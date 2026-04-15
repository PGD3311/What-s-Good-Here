# H3 — UGC Reporting + Blocking (Schema Spec v3.2 — APPROVED)

**Status:** Approved for migration — 2026-04-15. Final Codex gpt-5.4 verdict after three review rounds: **ship** (pending Dan's sign-off on D1-D5).
**Apple rule:** Guideline 1.2 — hard gate (UGC apps must offer report + block)
**Plan:** `docs/superpowers/plans/2026-04-13-app-store-readiness.md` §H3
**Effort (schema):** 13-16h (up from v2's 12h after adding RLS-level filters + fixing SQL/plpgsql errors)

> v2 had three CRITICAL bugs Codex caught on second pass: (a) my filter patches for `get_local_lists_*` and `get_taste_compatibility` used plpgsql syntax inside LANGUAGE SQL functions — they wouldn't compile; (b) the "RPC-only filter" strategy left a gaping hole because dish detail pages read `public_votes` + `dish_photos` directly, bypassing every RPC filter; (c) `is_blocked_pair` privilege model was a block-graph oracle. v3 closes all three by moving the primary filter boundary down to RLS / view layer, and by making `is_blocked_pair` self-restricting (returns TRUE only when caller = p_viewer). Two follow-up passes (v3.1, v3.2) closed remaining oracle + caller-trust gaps. Final verdict from Codex: **ship**. See revision logs at the bottom.

---

## Design decisions (need Dan's sign-off)

### D1 — Block filter scope (revised)

**Filter applies to individual content, including embedded individual artifacts on aggregate views. Aggregate numeric metrics (ratings, counts) stay global.**

| Surface | Filtered? |
|---|---|
| Dish avg_rating, total_votes | No — aggregate stays global |
| `get_ranked_dishes.featured_photo_url` (community photo on ranking row) | **Yes — embedded individual artifact** |
| `get_smart_snippet` (one review shown on dish page) | Yes |
| `get_friends_votes_*` (friend cards on dish/restaurant) | Yes |
| Blocked user's profile page | Yes (show "You blocked this user" placeholder) |
| Local Lists (`get_local_lists_*`) | Yes (curator's list hidden) |
| Taste-match discovery (`get_similar_taste_users`, `get_category_experts`) | Yes |
| Photo grids rendered from `dish_photos` | Yes |

**Why not full aggregate filter:** per-viewer rating calculations kill caching, create ordering drift across viewers, and Apple 1.2 doesn't require it (Instagram, Twitter, Reddit, Yelp all ship individual-only filtering). Version 1 of this spec was too absolute — Codex correctly caught that embedded individual content (photos, snippets) on aggregate rows still needs filtering.

### D2 — Block deletes follows both directions AND prevents future follows

Existing `follows_insert_own` policy is permissive — after A blocks B, B can still insert a new follow row for A. **v2 fixes this with a helper function called from the insert policy.** Plus the `block_user` RPC deletes existing follows in both directions.

Unblock does NOT restore follows — user re-follows manually.

### D3 — Polymorphic reports table

One `reports` table with `reported_type` CHECK enum. Polymorphic `reported_id` (no FK). Denormalized `reported_user_id` for admin-queue sort. Alternative (4 separate tables) rejected as over-engineered.

### D4 — Server-side reverse-block enforcement via `is_blocked_pair()` + RLS primary boundary (v3 revised)

All block-sensitive paths use a central helper. The helper checks both directions of `user_blocks`:

```sql
CREATE OR REPLACE FUNCTION is_blocked_pair(p_viewer UUID, p_subject UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Self-restricting: returns TRUE only when the caller IS p_viewer (or is
  -- service_role). This prevents authenticated users from using the helper as
  -- a block-graph oracle while still allowing RLS/view expressions to work,
  -- because RLS policies evaluate with the querying user's auth.uid() and
  -- pass that exact value as p_viewer.
  SELECT p_viewer IS NOT NULL
    AND p_subject IS NOT NULL
    AND (
      p_viewer = (select auth.uid())
      OR auth.role() = 'service_role'
    )
    AND EXISTS (
      SELECT 1 FROM user_blocks
      WHERE (blocker_id = p_viewer AND blocked_id = p_subject)
         OR (blocker_id = p_subject AND blocked_id = p_viewer)
    );
$$;

-- Execute must be available to both anon and authenticated so RLS/view
-- expressions can call it from any query context. Self-restriction inside
-- the function body is the actual authorization.
GRANT EXECUTE ON FUNCTION is_blocked_pair(UUID, UUID) TO anon, authenticated;
```

**v3 architecture — RLS + view as primary filter boundary, NOT per-RPC:**

v2's strategy of "add `NOT is_blocked_pair(...)` to every RPC WHERE clause" missed the fact that `votesApi`, `dishPhotosApi`, `followsApi` all issue **direct table/view queries**, bypassing RPCs entirely. That made the RPC-only filter architecturally wrong.

v3 puts the filter at the lowest layer that every call path crosses:

| Surface | Filter layer | Reason |
|---|---|---|
| `dish_photos` (photo grids, dish detail photos) | RLS SELECT policy | Read from direct queries in `dishPhotosApi.js:106+` |
| `follows` (follower lists, modals, profile counts) | RLS SELECT policy | Read from direct queries in `followsApi.js:21+` |
| `public_votes` VIEW (dish reviews list) | View WHERE clause | Read from `votesApi.js:353+` direct view queries |
| `profiles` | UI placeholder, not RLS | Searches need to find blocked users to unblock them — matches Instagram/Twitter norm |
| RPCs that join `votes` directly (not via public_votes) | RPC-level WHERE | `get_smart_snippet`, `get_ranked_dishes.best_photos`, `get_friends_votes_*`, discovery RPCs, local_lists RPCs |

RLS-level filter means EVERY query through every code path gets filtered without having to refactor API calls. Much stronger than RPC-only.

`get_my_blocks` is now secondary — used only to render the "Blocked Users" settings list.

### D5 — Report content snapshots (NEW)

Reports store a `target_snapshot JSONB` of the offending content at report time. If the author deletes their account or edits the content before admin review, evidence is preserved. Small addition, high evidence value.

---

## Tables

### `reports`

```sql
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_type TEXT NOT NULL
    CHECK (reported_type IN ('dish', 'review', 'photo', 'user')),
  reported_id UUID NOT NULL,
  -- Denormalized author of reported content. Null only when the content
  -- has no author (dish with NULL created_by — possible after account deletion).
  -- Populated by submit_report RPC, not client.
  reported_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL
    CHECK (reason IN (
      'spam', 'hate_speech', 'harassment', 'misinformation',
      'inappropriate_content', 'impersonation', 'other'
    )),
  details TEXT CHECK (details IS NULL OR length(details) <= 500),
  -- D5: evidence preservation
  -- Shape per reported_type:
  --   review: { review_text, rating_10, dish_id, dish_name, author_name }
  --   photo:  { photo_url, dish_id, dish_name, author_name }
  --   dish:   { dish_name, restaurant_name, category }
  --   user:   { display_name, avatar_url }
  target_snapshot JSONB,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique: one active report per reporter per target. Re-report
-- allowed after status becomes 'dismissed' — no DELETE needed, history
-- preserved (fixes v1 audit-trail contradiction).
CREATE UNIQUE INDEX IF NOT EXISTS reports_active_unique_idx
  ON reports (reporter_id, reported_type, reported_id)
  WHERE status IN ('open', 'reviewed', 'actioned');

CREATE INDEX IF NOT EXISTS reports_queue_idx
  ON reports (created_at DESC) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS reports_by_target_user_idx
  ON reports (reported_user_id, created_at DESC)
  WHERE reported_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reports_by_reporter_idx
  ON reports (reporter_id, created_at DESC);
```

### `user_blocks`

```sql
CREATE TABLE IF NOT EXISTS user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx ON user_blocks (blocker_id);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id);
```

---

## RLS policies

```sql
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- Reports: admin-only SELECT. Reporter reads own reports via get_my_reports
-- RPC which projects safe columns (no reviewer_notes leak — v1 bug).
CREATE POLICY "reports_select_admin" ON reports
  FOR SELECT USING (is_admin());

CREATE POLICY "reports_update_admin" ON reports
  FOR UPDATE USING (is_admin());

-- No direct INSERT policy — must go through submit_report RPC
-- No DELETE — audit trail preserved

-- Blocks: users read own; no direct INSERT/DELETE (must use RPCs)
CREATE POLICY "user_blocks_select_own" ON user_blocks
  FOR SELECT USING ((select auth.uid()) = blocker_id);
```

### Follows policies — SELECT + INSERT both block-aware (v3)

**v3 adds SELECT filter** so direct `follows` reads from `followsApi.js` (follower lists, follower modals, counts) hide blocked users automatically.

```sql
-- Replace existing follows_select_public
DROP POLICY IF EXISTS "follows_select_public" ON follows;
CREATE POLICY "follows_select_not_blocked" ON follows
  FOR SELECT USING (
    (select auth.uid()) IS NULL
    OR (
      NOT is_blocked_pair((select auth.uid()), follower_id)
      AND NOT is_blocked_pair((select auth.uid()), followed_id)
    )
  );

-- Replace existing follows_insert_own
DROP POLICY IF EXISTS "follows_insert_own" ON follows;
CREATE POLICY "follows_insert_own_not_blocked" ON follows
  FOR INSERT WITH CHECK (
    (select auth.uid()) = follower_id
    AND NOT is_blocked_pair((select auth.uid()), followed_id)
  );
```

SELECT policy hides any follow row where either participant is blocked by the viewer. Prevents blocked users appearing in follower lists or counts.

INSERT policy prevents **future** follow rows from being created when a block exists either direction — i.e., after A's `block_user` transaction commits, B can't then follow A. The policy does NOT serialize against a concurrent follow/block: if A blocks and B follows simultaneously, the follow insert may commit before the block is visible, leaving a dangling row.

**Known limitations (accepted for launch):**
- **Concurrent block/follow race:** `follows` row may be written concurrently with a block. The SELECT policy hides the dangling row from the two involved authenticated users (both ends are blocked-pair), but `profiles.follower_count` / `following_count` (maintained by trigger `schema.sql:1798`) and anon counts can be off by one. Hardening would require an advisory lock in `block_user` around the cleanup, or a `follow_user` RPC that serializes. Deferred.
- **service_role bypass:** service jobs that write `follows` (none today) must enforce the block check themselves.

### Dish photos — block-aware SELECT (v3 NEW)

```sql
-- Replace existing "Public read access" ON dish_photos
DROP POLICY IF EXISTS "Public read access" ON dish_photos;
CREATE POLICY "dish_photos_select_not_blocked" ON dish_photos
  FOR SELECT USING (
    (select auth.uid()) IS NULL
    OR NOT is_blocked_pair((select auth.uid()), user_id)
  );
```

Covers every photo surface — dish detail photo grids, dish list featured photos, direct lookups in `dishPhotosApi.js:106+, 132+, 166+, 242+, 276+, 306+, 350+, 364+, 392+, 418+, 450+`. The RPC-level filter on `get_ranked_dishes.best_photos` becomes defense-in-depth.

### public_votes view — block-aware filter (v3 NEW)

The `public_votes` view is SECURITY DEFINER (`schema.sql:340`) so RLS on underlying `votes` doesn't apply. Embed the filter directly in the view:

```sql
CREATE OR REPLACE VIEW public_votes AS
SELECT
  id, dish_id, rating_10, review_text, review_created_at, user_id, source
FROM votes
WHERE auth.uid() IS NULL
   OR NOT is_blocked_pair(auth.uid(), user_id);
```

This is the primary filter for dish reviews. Every dish detail page query (`votesApi.js:353, 422, 471, 562, 611`) automatically gets filtered. The RPC-level filter on `get_smart_snippet` becomes redundant but harmless (it joins `votes` directly, not through the view — keep it).

---

## RPCs — writes

### `submit_report` (revised v2)

Validation order corrected: cheap validation → target existence → self-check → rate limit → insert. Invalid inputs don't burn rate-limit quota.

```sql
CREATE OR REPLACE FUNCTION submit_report(
  p_reported_type TEXT,
  p_reported_id UUID,
  p_reason TEXT,
  p_details TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reporter_id UUID;
  v_reported_user_id UUID;
  v_target_exists BOOLEAN;
  v_snapshot JSONB;
  v_rate_limit JSONB;
  v_report_id UUID;
BEGIN
  v_reporter_id := (select auth.uid());
  IF v_reporter_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Cheap validation first (no quota burn)
  IF p_reported_type NOT IN ('dish', 'review', 'photo', 'user') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid reported_type');
  END IF;

  IF p_reason NOT IN ('spam','hate_speech','harassment','misinformation',
                      'inappropriate_content','impersonation','other') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid reason');
  END IF;

  IF p_details IS NOT NULL AND length(p_details) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Details too long (max 500 chars)');
  END IF;

  -- Resolve target + build snapshot
  CASE p_reported_type
    WHEN 'dish' THEN
      SELECT
        d.created_by,
        jsonb_build_object(
          'dish_name', d.name,
          'restaurant_name', r.name,
          'category', d.category
        ),
        TRUE
      INTO v_reported_user_id, v_snapshot, v_target_exists
      FROM dishes d
      LEFT JOIN restaurants r ON r.id = d.restaurant_id
      WHERE d.id = p_reported_id;
      -- v_reported_user_id may legitimately be NULL (dishes.created_by nullable)

    WHEN 'review' THEN
      -- votes.user_id is NOT NULL — NULL means row not found
      SELECT v.user_id,
        jsonb_build_object(
          'review_text', v.review_text,
          'rating_10', v.rating_10,
          'dish_id', v.dish_id,
          'dish_name', d.name,
          'author_name', p.display_name
        ),
        TRUE
      INTO v_reported_user_id, v_snapshot, v_target_exists
      FROM votes v
      LEFT JOIN dishes d ON d.id = v.dish_id
      LEFT JOIN profiles p ON p.id = v.user_id
      WHERE v.id = p_reported_id;

    WHEN 'photo' THEN
      SELECT dp.user_id,
        jsonb_build_object(
          'photo_url', dp.photo_url,
          'dish_id', dp.dish_id,
          'dish_name', d.name,
          'author_name', p.display_name
        ),
        TRUE
      INTO v_reported_user_id, v_snapshot, v_target_exists
      FROM dish_photos dp
      LEFT JOIN dishes d ON d.id = dp.dish_id
      LEFT JOIN profiles p ON p.id = dp.user_id
      WHERE dp.id = p_reported_id;

    WHEN 'user' THEN
      SELECT p.id,
        jsonb_build_object(
          'display_name', p.display_name,
          'avatar_url', p.avatar_url
        ),
        TRUE
      INTO v_reported_user_id, v_snapshot, v_target_exists
      FROM profiles p
      WHERE p.id = p_reported_id;
  END CASE;

  IF v_target_exists IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reported content not found');
  END IF;

  -- Self-check using resolved author (v_reported_user_id may be null for
  -- orphan dishes — no self-report to check in that case)
  IF v_reported_user_id IS NOT NULL AND v_reported_user_id = v_reporter_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot report your own content');
  END IF;

  -- Rate limit last (only burn quota on otherwise-valid submission)
  v_rate_limit := check_and_record_rate_limit('report', 10, 3600);
  IF NOT (v_rate_limit->>'allowed')::BOOLEAN THEN
    RETURN v_rate_limit;
  END IF;

  INSERT INTO reports (
    reporter_id, reported_type, reported_id, reported_user_id,
    reason, details, target_snapshot
  ) VALUES (
    v_reporter_id, p_reported_type, p_reported_id, v_reported_user_id,
    p_reason, NULLIF(TRIM(p_details), ''), v_snapshot
  )
  RETURNING id INTO v_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', v_report_id);

EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'You already reported this. Our team is reviewing it.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_report(TEXT, UUID, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION submit_report(TEXT, UUID, TEXT, TEXT) FROM anon, public;
```

### `block_user` / `unblock_user`

```sql
CREATE OR REPLACE FUNCTION block_user(p_blocked_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_blocker_id UUID;
  v_rate_limit JSONB;
BEGIN
  v_blocker_id := (select auth.uid());
  IF v_blocker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF v_blocker_id = p_blocked_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot block yourself');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_blocked_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_rate_limit := check_and_record_rate_limit('block', 30, 3600);
  IF NOT (v_rate_limit->>'allowed')::BOOLEAN THEN
    RETURN v_rate_limit;
  END IF;

  INSERT INTO user_blocks (blocker_id, blocked_id)
  VALUES (v_blocker_id, p_blocked_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

  -- Follow cleanup both directions
  DELETE FROM follows
  WHERE (follower_id = v_blocker_id AND followed_id = p_blocked_id)
     OR (follower_id = p_blocked_id AND followed_id = v_blocker_id);

  -- Notification cleanup
  DELETE FROM notifications
  WHERE (user_id = v_blocker_id AND (data->>'follower_id') = p_blocked_id::text)
     OR (user_id = p_blocked_id AND (data->>'follower_id') = v_blocker_id::text);

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION block_user(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION block_user(UUID) FROM anon, public;


CREATE OR REPLACE FUNCTION unblock_user(p_blocked_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_blocker_id UUID;
BEGIN
  v_blocker_id := (select auth.uid());
  IF v_blocker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  DELETE FROM user_blocks
  WHERE blocker_id = v_blocker_id AND blocked_id = p_blocked_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION unblock_user(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION unblock_user(UUID) FROM anon, public;
```

### `review_report` (NEW — closes Codex #11)

Admin action RPC. Sets status + reviewed_by + reviewed_at + reviewer_notes atomically. Without this we can't demonstrate "timely response" per Apple 1.2.

```sql
CREATE OR REPLACE FUNCTION review_report(
  p_report_id UUID,
  p_action TEXT,  -- 'reviewed' | 'dismissed' | 'actioned'
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID;
BEGIN
  v_admin := (select auth.uid());
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  IF p_action NOT IN ('reviewed', 'dismissed', 'actioned') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  UPDATE reports
  SET status = p_action,
      reviewed_by = v_admin,
      reviewed_at = NOW(),
      reviewer_notes = NULLIF(TRIM(p_notes), '')
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION review_report(UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION review_report(UUID, TEXT, TEXT) TO authenticated;
-- is_admin() check inside the function body gates admin-only
```

---

## RPCs — reads

### `get_my_blocks`

```sql
CREATE OR REPLACE FUNCTION get_my_blocks()
RETURNS TABLE (blocked_id UUID, display_name TEXT, avatar_url TEXT, blocked_at TIMESTAMPTZ)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ub.blocked_id, p.display_name, p.avatar_url, ub.created_at AS blocked_at
  FROM user_blocks ub
  LEFT JOIN profiles p ON p.id = ub.blocked_id
  WHERE ub.blocker_id = (select auth.uid())
  ORDER BY ub.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION get_my_blocks() FROM public, anon;
GRANT EXECUTE ON FUNCTION get_my_blocks() TO authenticated;
```

### `get_my_reports` (v3 — projection including safe fields)

Hides `reviewer_notes` (internal) and `reviewed_by` (PII). Returns `reviewed_at` and `details` and `target_snapshot` so reporter can review the report they filed. Replaces the v1 RLS leak.

```sql
CREATE OR REPLACE FUNCTION get_my_reports()
RETURNS TABLE (
  report_id UUID,
  reported_type TEXT,
  reported_id UUID,
  reason TEXT,
  details TEXT,
  target_snapshot JSONB,
  status TEXT,
  created_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.reported_type, r.reported_id, r.reason, r.details,
         r.target_snapshot, r.status, r.created_at, r.reviewed_at
  FROM reports r
  WHERE r.reporter_id = (select auth.uid())
  ORDER BY r.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION get_my_reports() FROM public, anon;
GRANT EXECUTE ON FUNCTION get_my_reports() TO authenticated;
```

### `get_open_reports` (admin — revised)

Adds target_snapshot to return columns, clamps limit.

```sql
CREATE OR REPLACE FUNCTION get_open_reports(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  report_id UUID,
  reporter_id UUID,
  reporter_name TEXT,
  reported_type TEXT,
  reported_id UUID,
  reported_user_id UUID,
  reported_user_name TEXT,
  reason TEXT,
  details TEXT,
  target_snapshot JSONB,
  created_at TIMESTAMPTZ,
  target_user_open_report_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Clamp limit to prevent runaway queries
  p_limit := LEAST(GREATEST(p_limit, 1), 200);
  p_offset := GREATEST(p_offset, 0);

  RETURN QUERY
  SELECT
    r.id, r.reporter_id, rp.display_name,
    r.reported_type, r.reported_id, r.reported_user_id, up.display_name,
    r.reason, r.details, r.target_snapshot, r.created_at,
    COALESCE((
      SELECT COUNT(*) FROM reports r2
      WHERE r2.reported_user_id = r.reported_user_id AND r2.status = 'open'
    ), 0) AS target_user_open_report_count
  FROM reports r
  LEFT JOIN profiles rp ON rp.id = r.reporter_id
  LEFT JOIN profiles up ON up.id = r.reported_user_id
  WHERE r.status = 'open'
  ORDER BY target_user_open_report_count DESC, r.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_open_reports(INT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_open_reports(INT, INT) TO authenticated;
-- Admin gate inside function body (is_admin check) is the true authorization;
-- GRANT to authenticated is required so the function is callable at all.
```

---

## RPCs updated for block filter

All use `is_blocked_pair((select auth.uid()), <author_id>)` — central helper keeps direction logic in one place.

### `get_ranked_dishes` — patch only the `best_photos` CTE (D1 scope)

```sql
-- Inside get_ranked_dishes, replace the best_photos CTE:
best_photos AS (
  SELECT DISTINCT ON (dp.dish_id)
    dp.dish_id, dp.photo_url
  FROM dish_photos dp
  INNER JOIN dishes d2 ON dp.dish_id = d2.id
  INNER JOIN filtered_restaurants fr2 ON d2.restaurant_id = fr2.id
  WHERE dp.status IN ('featured', 'community')
    AND d2.parent_dish_id IS NULL
    AND NOT is_blocked_pair((select auth.uid()), dp.user_id)
  ORDER BY dp.dish_id,
    CASE dp.source_type WHEN 'restaurant' THEN 0 ELSE 1 END,
    CASE dp.status WHEN 'featured' THEN 0 ELSE 1 END,
    dp.quality_score DESC NULLS LAST,
    dp.created_at DESC
)
```

**Vote aggregation stays untouched.** Global ratings preserved per D1.

### `get_smart_snippet`

```sql
CREATE OR REPLACE FUNCTION get_smart_snippet(p_dish_id UUID)
RETURNS TABLE (
  review_text TEXT, rating_10 DECIMAL, display_name TEXT,
  user_id UUID, review_created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE v_viewer_id UUID := (select auth.uid());
BEGIN
  RETURN QUERY
  SELECT v.review_text, v.rating_10, p.display_name, v.user_id, v.review_created_at
  FROM votes v
  INNER JOIN profiles p ON v.user_id = p.id
  WHERE v.dish_id = p_dish_id
    AND v.review_text IS NOT NULL AND v.review_text != ''
    AND (v_viewer_id IS NULL OR NOT is_blocked_pair(v_viewer_id, v.user_id))
  ORDER BY
    CASE WHEN v.rating_10 >= 9 THEN 0 ELSE 1 END,
    v.rating_10 DESC NULLS LAST,
    v.review_created_at DESC NULLS LAST
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

### `get_friends_votes_for_dish` / `get_friends_votes_for_restaurant`

Two changes: (1) add block filter, (2) enforce `p_user_id = auth.uid()` (Codex #4 — pre-existing bug, fixing while we touch the file).

```sql
CREATE OR REPLACE FUNCTION get_friends_votes_for_dish(
  p_user_id UUID,
  p_dish_id UUID
)
RETURNS TABLE (
  user_id UUID, display_name TEXT, rating_10 DECIMAL(3, 1),
  voted_at TIMESTAMPTZ, category_expertise TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Enforce caller identity (was unchecked in v1 schema — Codex #4)
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.display_name, v.rating_10, v.created_at,
    CASE
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id
                   AND ub.badge_key = 'authority_' || REPLACE(d.category, ' ', '_')) THEN 'authority'
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id
                   AND ub.badge_key = 'specialist_' || REPLACE(d.category, ' ', '_')) THEN 'specialist'
      ELSE NULL
    END AS category_expertise
  FROM follows f
  JOIN profiles p ON p.id = f.followed_id
  JOIN votes v ON v.user_id = f.followed_id AND v.dish_id = p_dish_id
  JOIN dishes d ON d.id = p_dish_id
  WHERE f.follower_id = p_user_id
    AND NOT is_blocked_pair(p_user_id, f.followed_id)
  ORDER BY v.created_at DESC;
END;
$$;
```

(Same treatment for `get_friends_votes_for_restaurant`.)

### `get_local_lists_for_homepage` (v3.2 — derive viewer server-side, Codex caught trust issue)

All three lists-related functions are LANGUAGE SQL. Filter must be expressed in the WHERE clause, not with `IF...RETURN`. **Critical: filter uses `auth.uid()` directly, not `p_viewer_id`** — trusting the caller-supplied ID lets an attacker pass NULL or another user's ID and bypass the filter (the self-restricting helper returns false when `p_viewer != auth.uid()`).

```sql
-- Inside the existing function, add to the main WHERE clause:
WHERE ll.is_active = true
  AND (
    (select auth.uid()) IS NULL
    OR NOT is_blocked_pair((select auth.uid()), ll.user_id)
  )
```

`p_viewer_id` is still used for the `compatibility_pct` calculation (backward compat for any callers), but NOT for block filtering. Callers who pass a wrong p_viewer_id get wrong compatibility numbers, not a block-filter bypass.

### `get_local_list_by_user` (v3 — pure SQL filter)

```sql
-- Inside the existing function, add to the main WHERE clause:
WHERE ll.user_id = target_user_id
  AND ll.is_active = true
  AND (
    (select auth.uid()) IS NULL
    OR NOT is_blocked_pair((select auth.uid()), target_user_id)
  )
```

Returns zero rows when target curator is blocked by viewer. Client renders empty/placeholder state.

### `get_similar_taste_users` (v3 — full rewrite)

Converting to plpgsql so we can add caller guard + block filter:

```sql
CREATE OR REPLACE FUNCTION get_similar_taste_users(
  p_user_id UUID,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  shared_dishes INT,
  compatibility_pct INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Caller must be asking about themselves (Codex #4 consistency)
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT b.user_id AS other_id,
           COUNT(*)::INT AS shared,
           ROUND((100 - (AVG(ABS(a.rating_10 - b.rating_10))::NUMERIC / 9.0 * 100)))::INT AS compat
    FROM votes a
    JOIN votes b ON a.dish_id = b.dish_id
      AND b.user_id != p_user_id
      AND b.rating_10 IS NOT NULL
    WHERE a.user_id = p_user_id AND a.rating_10 IS NOT NULL
    GROUP BY b.user_id
    HAVING COUNT(*) >= 3
  )
  SELECT c.other_id, p.display_name, c.shared, c.compat
  FROM candidates c
  JOIN profiles p ON p.id = c.other_id
  WHERE NOT EXISTS (
    SELECT 1 FROM follows f
    WHERE f.follower_id = p_user_id AND f.followed_id = c.other_id
  )
  AND NOT is_blocked_pair(p_user_id, c.other_id)
  ORDER BY c.compat DESC, c.shared DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_similar_taste_users(UUID, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_similar_taste_users(UUID, INT) TO authenticated;
```

### `get_category_experts` (v3)

Already SECURITY DEFINER + LANGUAGE SQL. Add to WHERE:

```sql
WHERE b.category = p_category AND b.family = 'category'
  AND ((select auth.uid()) IS NULL OR NOT is_blocked_pair((select auth.uid()), ub.user_id))
```

### `get_taste_compatibility` (v3 — pure SQL filter, Codex caught v2 syntax bug)

LANGUAGE SQL. Express the block check and caller guard inline. Convert to plpgsql for the caller guard:

```sql
CREATE OR REPLACE FUNCTION get_taste_compatibility(
  p_user_id UUID,
  p_other_user_id UUID
)
RETURNS TABLE (
  shared_dishes INT,
  avg_difference DECIMAL(3, 1),
  compatibility_pct INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Caller must be asking about themselves (Codex #4 consistency)
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF is_blocked_pair(p_user_id, p_other_user_id) THEN
    RETURN;  -- zero rows when blocked
  END IF;

  RETURN QUERY
  WITH shared AS (
    SELECT a.rating_10 AS rating_a, b.rating_10 AS rating_b
    FROM votes a
    JOIN votes b ON a.dish_id = b.dish_id
    WHERE a.user_id = p_user_id AND b.user_id = p_other_user_id
      AND a.rating_10 IS NOT NULL AND b.rating_10 IS NOT NULL
  )
  SELECT
    COUNT(*)::INT,
    ROUND(AVG(ABS(rating_a - rating_b))::NUMERIC, 1),
    CASE
      WHEN COUNT(*) >= 3 THEN ROUND((100 - (AVG(ABS(rating_a - rating_b))::NUMERIC / 9.0 * 100)))::INT
      ELSE NULL
    END
  FROM shared;
END;
$$;
```

---

## Client-side enforcement

With RLS + view filters covering `dish_photos`, `follows`, and `public_votes` automatically (v3), the client-side `useBlockedUsers()` hook serves two purposes:

1. **Render the blocked-users settings list** on `/profile`
2. **Render the "You blocked this user" placeholder** on `/user/:userId` when the viewer navigates directly to a blocked user's profile (since profiles table stays publicly readable for unblock-search UX)

**What's NOT needed anymore (v3 change from v2):** no client-side filter passes on review/photo/follower lists. The RLS/view layer handles it server-side for every code path.

---

## Migration file

`supabase/migrations/20260415_h3_ugc_reporting_blocking.sql`:

1. `CREATE TABLE reports` + indexes
2. `CREATE TABLE user_blocks` + indexes
3. `CREATE OR REPLACE FUNCTION is_blocked_pair` + `GRANT EXECUTE TO anon, authenticated` (authorization is enforced inside the function body via `p_viewer = auth.uid()` self-restriction — no REVOKE needed)
4. `ALTER TABLE ... ENABLE RLS` + policies for `reports` + `user_blocks`
5. **RLS-level block filters (v3 primary boundary):**
   - Replace `follows_select_public` → `follows_select_not_blocked`
   - Replace `follows_insert_own` → `follows_insert_own_not_blocked`
   - Replace `Public read access` on `dish_photos` → `dish_photos_select_not_blocked`
   - `CREATE OR REPLACE VIEW public_votes` with embedded block filter
6. RPCs (writes): `submit_report`, `block_user`, `unblock_user`, `review_report` + GRANTs/REVOKEs
7. RPCs (reads): `get_my_blocks`, `get_my_reports`, `get_open_reports` + GRANTs/REVOKEs
8. `CREATE OR REPLACE` the filter-layer RPCs:
   - `get_ranked_dishes` (best_photos CTE only)
   - `get_smart_snippet`
   - `get_friends_votes_for_dish` + p_user_id=auth.uid() guard
   - `get_friends_votes_for_restaurant` + p_user_id=auth.uid() guard
   - `get_local_lists_for_homepage` (pure SQL WHERE filter)
   - `get_local_list_by_user` (pure SQL WHERE filter)
   - `get_similar_taste_users` (converted to plpgsql + guard + filter)
   - `get_category_experts` (pure SQL WHERE filter)
   - `get_taste_compatibility` (converted to plpgsql + guard + filter)

Deploy order: update `schema.sql` first (append new tables + helper, replace updated RPCs + policies + view inline). Run migration file in SQL Editor per CLAUDE.md 1.5. Verify with queries below.

---

## Verification queries (post-deploy)

Two throwaway test users A + B:

```sql
-- Setup: A votes on a dish + uploads a photo + writes a review
-- A follows B, B follows A

-- 1. A blocks B
SELECT block_user('<B_id>');  -- as A
SELECT * FROM get_my_blocks();  -- expect B

-- 2. Follow cleanup
SELECT * FROM follows
WHERE (follower_id='<A_id>' AND followed_id='<B_id>')
   OR (follower_id='<B_id>' AND followed_id='<A_id>');
-- expect 0 rows

-- 3. Future-follow blocked (D2)
-- As B: INSERT INTO follows (follower_id, followed_id)
--         VALUES ('<B_id>', '<A_id>');
-- expect: policy violation

-- 4. Smart snippet filter
-- B's high-rating review on dish X, A queries get_smart_snippet(X)
-- expect: B's review NOT returned

-- 5. Ranked dishes photo filter (D1 revised)
-- B uploaded a photo to dish Y (B's only content on it)
-- A queries get_ranked_dishes — dish Y's featured_photo_url should NOT be B's photo

-- 6. Friends votes filter
-- (first re-follow from a separate test — block prevents new follows)
-- With block in place, get_friends_votes_for_dish should exclude B

-- 7. Local lists filter
-- B is a curator; A queries get_local_lists_for_homepage
-- expect: B's list not in results

-- 8. Taste match filter
-- SELECT * FROM get_similar_taste_users('<A_id>'); -- expect: no B

-- 9. Report flow with snapshot
SELECT submit_report('review', '<B_review_id>', 'spam', 'test');
-- expect: success, target_snapshot populated with review_text + author_name

-- 10. Reporter cannot read reviewer_notes (Codex #6)
-- As admin: UPDATE reports SET reviewer_notes = 'internal' WHERE id = <report_id>;
-- As A: SELECT * FROM get_my_reports();
-- expect: rows returned, NO reviewer_notes column exposed

-- 11. Admin action RPC
SELECT review_report('<report_id>', 'actioned', 'user warned');
-- expect: success, status updated, reviewed_by = admin uid

-- 12. Re-report after dismissal (partial unique index)
-- Admin: review_report('<report_id>', 'dismissed', null)
-- A: submit_report('review', '<same_review_id>', 'harassment', 'repeat offender')
-- expect: success (partial unique index allows)

-- 13. Validation order (no quota burn on invalid input)
-- Call submit_report('bogus_type', ...) 20 times
-- Then call submit_report with valid inputs → should succeed
-- (rate_limit counter not advanced by invalid-type calls)

-- 14. Review/photo missing vs orphan-author distinction (Codex #7)
-- submit_report('review', '<nonexistent_uuid>', 'spam', null)
-- expect: success=false, 'Reported content not found'

-- 15. RLS filter on dish_photos (v3)
-- B has uploaded a photo on dish X, A has A blocked B.
-- As A: SELECT * FROM dish_photos WHERE dish_id = '<X>';
-- expect: B's photo NOT in results

-- 16. public_votes view filter (v3)
-- B has a review on dish X.
-- As A with A-blocks-B: SELECT * FROM public_votes WHERE dish_id = '<X>';
-- expect: B's review NOT in results

-- 17. follows RLS filter (v3)
-- C follows B. A has A-blocks-B.
-- As A: SELECT * FROM follows WHERE followed_id = '<B>';
-- expect: zero rows (follows row hidden because one participant is blocked by A)

-- 18. is_blocked_pair self-restriction (v3.1)
-- As anon: SELECT is_blocked_pair('<A>', '<B>');
-- expect: false (function returns false for null auth.uid())

-- 19. is_blocked_pair not a block-graph oracle (v3.1)
-- A has A-blocks-B. Login as a THIRD user C (unrelated).
-- SELECT is_blocked_pair('<A>', '<B>');
-- expect: false (C is not A, so self-restriction denies the probe)

-- 20. get_local_lists_for_homepage viewer spoofing blocked (v3.2)
-- A has A-blocks-B. B is an active curator.
-- Login as A, call get_local_lists_for_homepage(NULL) — client would try to bypass
-- expect: B's list is STILL filtered out (function uses auth.uid() for filter,
-- not p_viewer_id)
-- Same call with get_local_lists_for_homepage('<wrong_user_id>')
-- expect: B's list STILL filtered out (same reason)
```

---

## Open questions for Dan (v2)

1. **D1 revised scope OK?** Filter embedded individual content (photos, snippets) on aggregate views, but leave vote aggregates global.
2. **D2 follows policy tightening OK?** Dropping + replacing the existing policy — no code change needed in app since inserts still go through same path.
3. **D3 polymorphic OK?** No change from v1.
4. **D4 `is_blocked_pair` helper OK?** Central function called from every filter. Clean pattern.
5. **D5 target_snapshot OK?** ~500 bytes per report average. Worth the evidence preservation.
6. **Direct-table RLS tightening deferred to v1.1 post-launch?** RPC filters cover all primary surfaces. Direct reads of `profiles`/`dish_photos` are only used on explicit-navigation routes. Acceptable.
7. **Report reasons list** — same as v1: spam, hate_speech, harassment, misinformation, inappropriate_content, impersonation, other. Good?
8. **Report rate limit 10/hour** — same as v1. OK?

---

## Dependencies

**Blocks:** H3 frontend (ReportModal, BlockUserModal, Profile → Blocked Users, admin queue UI at `/admin`).
**Blocked by:** None.
**Related:**
- H1 account deletion — `reports`, `user_blocks` cascade on user delete. No extra work in `delete-account` Edge Function. `reported_user_id` goes to NULL on cascade (SET NULL) — target_snapshot preserves evidence.
- L1 Privacy/Terms — moderation section + SLA commitment (24-48h response time) in `Terms.jsx`.
- Apple App Store Connect — age rating 12+ or 17+ due to UGC.

---

## Effort v3

- Tables + indexes + `is_blocked_pair` helper: **1.5h**
- `submit_report` (with validation reorder + snapshot): **2h**
- `block_user` / `unblock_user`: **1.5h**
- `review_report`: **0.5h**
- `get_my_blocks` / `get_my_reports` / `get_open_reports`: **1h**
- RLS-level filters (dish_photos, follows, public_votes view): **1.5h**
- Updating 9 RPCs (filter + plpgsql conversions + caller guards): **2.5h**
- RLS policies + explicit GRANTs/REVOKEs: **0.75h**
- Migration + deploy + verify: **1.5h**
- Two-user test matrix (18 scenarios now): **2.5h**

**Schema total: 15.25h.** Up from v2's 12h. At the top of H3's 10-15h budget — acceptable because the v3 architecture eliminates 3-5h of frontend rework that v2 would have triggered (client-side filter passes on reviews/photos/followers).

---

## Revision log v1 → v2

**CRITICAL fixes from Codex gpt-5.4 review:**
- **Codex #1** `get_ranked_dishes.featured_photo_url` leaked blocked user's photo — added `is_blocked_pair` filter to `best_photos` CTE. D1 scope revised to include embedded individual artifacts on aggregate views.
- **Codex #3** Future follows bypassed block — replaced `follows_insert_own` with block-aware policy using `is_blocked_pair`.
- **Codex #6** Reporter could SELECT `reviewer_notes`/`reviewed_by` via RLS — removed reporter SELECT policy, added `get_my_reports` projection RPC.
- **Codex #11** No admin action RPC — added `review_report(p_report_id, p_action, p_notes)`.
- **Codex #12** Local Lists RPCs unfiltered — added `is_blocked_pair` filter to `get_local_lists_for_homepage` and `get_local_list_by_user`.
- **Codex #13** Discovery RPCs unfiltered — filters added to `get_similar_taste_users`, `get_category_experts`, `get_taste_compatibility`.

**IMPORTANT fixes:**
- **Codex #2** Reverse blocks enforced via central `is_blocked_pair` helper called from every filter (addressed D4).
- **Codex #4** `get_friends_votes_*` now verifies `p_user_id = auth.uid()` (pre-existing bug fixed in-place).
- **Codex #7** `submit_report` distinguishes missing row (error) from null author (allowed for orphan dishes only).
- **Codex #8+9** Replaced full UNIQUE constraint with partial unique index on active statuses — re-report after dismissal works, audit trail preserved.
- **Codex #10** Validation reordered: cheap checks → target existence → self-check → rate limit. Invalid inputs don't burn quota.
- **Codex #14** Added `target_snapshot JSONB` (D5) so deleted content still has evidence at review time.
- **Codex #15** Explicit `GRANT EXECUTE` / `REVOKE` on all new RPCs matching existing schema pattern.

**SUGGESTIONS accepted:**
- **Codex #16** D1 phrasing rewritten to distinguish aggregate metrics (not filtered) from embedded individual artifacts (filtered).
- **Codex #17** `get_open_reports` clamps `p_limit` to 200.
- **Codex #18** Central `is_blocked_pair` helper (D4) replaces scattered inline NOT EXISTS subqueries.

**Deferred to v1.1 (documented, not in H3):**
- Apple token revocation in account deletion (H1.1) — separate spec.

---

## Revision log v2 → v3

Second Codex gpt-5.4 review surfaced three CRITICAL issues with v2:

**CRITICAL fixes:**
- **v2 filter patches for `get_local_lists_for_homepage` + `get_local_list_by_user` + `get_taste_compatibility` used plpgsql syntax (`IF ... RETURN`, variable references) inside LANGUAGE SQL functions.** They wouldn't compile. v3 rewrites each patch in pure SQL (WHERE clause filter) where the function stays SQL, and converts to plpgsql where a caller guard is needed (`get_similar_taste_users`, `get_taste_compatibility`).
- **v2 relied on per-RPC WHERE filters + deferred direct-table tightening to v1.1.** Codex caught that `votesApi.js`, `dishPhotosApi.js`, `followsApi.js` issue direct table/view queries that bypass every RPC filter — dish detail pages would still show blocked users' reviews and photos. v3 moves the primary filter boundary down to the lowest layer that every code path crosses: RLS policies on `dish_photos` and `follows`, and an embedded WHERE on the `public_votes` view. Per-RPC filters become defense-in-depth.
- **`is_blocked_pair` lacked explicit REVOKE from public/anon.** v3 adds `REVOKE EXECUTE ... FROM public, anon; GRANT ... TO authenticated` pattern to every new RPC (including all read-only ones — `get_my_blocks`, `get_my_reports`, `get_open_reports`).

**IMPORTANT fixes:**
- `get_my_reports` was too thin. v3 adds `details`, `target_snapshot`, `reviewed_at` to the projection. Still hides `reviewer_notes` and `reviewed_by`.
- `get_similar_taste_users` + `get_taste_compatibility` now include `p_user_id = auth.uid()` caller guard (matches `get_friends_votes_*` after the Codex #4 fix).
- `is_blocked_pair` body hardened to handle NULL viewer/subject gracefully.
- Note added documenting service_role bypass + concurrent follow-then-block race as acceptable known limitations.

**ACCEPTED-AS-IS from Codex's second review:**
- `review_report` shape is queue-state only (no content-hiding / user-suspension). Acceptable for launch — a reviewer writing "actioned" can separately delete content via admin tooling. Consider a bundled `act_on_report` RPC post-launch.
- `profiles` table stays publicly readable. Blocked users must remain searchable so the blocker can unblock them. UI handles the blocked-profile placeholder.
- `target_snapshot` shape could add `created_at` — minor, not blocking. Keep v3 shape.

---

## Revision log v3.1 → v3.2 (final Codex pass)

**IMPORTANT fix:**
- `get_local_lists_for_homepage` trusted caller-supplied `p_viewer_id` for block filtering. With the new self-restricting `is_blocked_pair`, passing `p_viewer_id = NULL` (or a different user's ID) would bypass the filter entirely (`is_blocked_pair` returns false when viewer != auth.uid()). Fixed by deriving the viewer from `auth.uid()` inside the filter. `p_viewer_id` still used for `compatibility_pct` (backward compat) but cannot be used to bypass block filtering.

---

## Revision log v3 → v3.1 (second round of v3 Codex review)

**CRITICAL fix:**
- `is_blocked_pair` privilege model was a block-graph oracle — revoking from anon broke anon-reachable RLS/view paths; granting to authenticated let any user probe `is_blocked_pair(A, B)` for arbitrary A/B. Fixed by self-restricting the helper: returns TRUE only when `p_viewer = (select auth.uid())` or caller is service_role. Now safe to `GRANT EXECUTE TO anon, authenticated` — RLS/view expressions still work because they pass `auth.uid()` as p_viewer.

**IMPORTANT fixes:**
- Softened the "INSERT policy closes the race" claim — the policy blocks future inserts after block commits, but concurrent follow+block transactions can still leave dangling rows. Documented as accepted launch-time limitation; advisory-lock hardening deferred.
- `get_similar_taste_users` — replaced fragment-only patch with full `CREATE OR REPLACE FUNCTION` body to avoid the v2-style SQL/plpgsql syntax mistake.

---

## Revision log v1 → v2 (retained for history)

First Codex review of v1:
