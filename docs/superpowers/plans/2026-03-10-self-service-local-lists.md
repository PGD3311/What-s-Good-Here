# Self-Service Local Lists Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve Local Lists from admin-seeded (6 people) to a self-service flow supporting 20-30 local curators with invite links, a dish picker UI, and taste compatibility matching.

**Architecture:** Token-based invite flow (mirrors existing `restaurant_invites` pattern). New `curator_invites` table + `is_local_curator` flag on profiles. Curators manage their own list via `/my-list` page with client-side dish search. Homepage cards show taste match % using inline compatibility calculation in the existing `get_local_lists_for_homepage` RPC.

**Tech Stack:** Supabase (PostgreSQL, RLS, SECURITY DEFINER RPCs), React Query (queries + mutations), React Router (2 new lazy-loaded routes), existing `useDishSearch` hook for dish picker.

**Spec:** `docs/superpowers/specs/2026-03-10-locals-lists-design.md` (original), this plan extends it.

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `src/pages/AcceptCuratorInvite.jsx` | Invite acceptance page at `/curator-invite/:token` — validates token, shows welcome, accepts invite, redirects to `/my-list` |
| `src/pages/MyList.jsx` | Dish picker page at `/my-list` — tagline input, dish search, add/remove/reorder up to 10 items, save/publish |
| `src/hooks/useMyLocalList.js` | React Query hook — fetches own list via `get_my_local_list` RPC, exposes `saveList` mutation |

### Modified Files

| File | Change |
|---|---|
| `supabase/schema.sql` | Add `is_local_curator` to profiles, `curator_invites` table, RLS updates, 5 new RPCs |
| `src/api/localListsApi.js` | Add 4 methods: `getCuratorInviteDetails`, `acceptCuratorInvite`, `getMyList`, `saveMyList` |
| `src/App.jsx` | Add 2 lazy-loaded routes: `/curator-invite/:token`, `/my-list` |
| `src/hooks/useLocalLists.js` | Pass viewer user ID to RPC for taste matching |
| `src/components/home/LocalListsSection.jsx` | Show compatibility % on expandable cards |
| `SPEC.md` | Document new tables, RPCs, pages |
| `TASKS.md` | Add task entry |

---

## Chunk 1: Schema — Profile Flag, Curator Invites, RLS Updates, RPCs

### Task 1: Add `is_local_curator` column to profiles

**Files:**
- Modify: `supabase/schema.sql` (profiles table definition, around line 72)

- [ ] **Step 1: Add column to schema.sql**

In the profiles table definition, after the existing columns, add:

```sql
is_local_curator BOOLEAN DEFAULT false,
```

- [ ] **Step 2: Deploy to Supabase SQL Editor**

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_local_curator BOOLEAN DEFAULT false;
```

Verify:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'is_local_curator';
```

Expected: one row, `boolean`, `false`.

- [ ] **Step 3: Create helper function**

Add to `schema.sql` after the existing `is_admin()` function (around line 576):

```sql
CREATE OR REPLACE FUNCTION is_local_curator()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT is_local_curator FROM profiles WHERE id = auth.uid()),
    false
  );
$$;
```

Deploy to SQL Editor. Verify:
```sql
SELECT is_local_curator();
```
Expected: `false` (for any non-curator user).

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add is_local_curator flag to profiles + helper function"
```

### Task 2: Create `curator_invites` table

**Files:**
- Modify: `supabase/schema.sql` (add after `restaurant_invites` table, around line 262)

- [ ] **Step 1: Add table to schema.sql**

```sql
-- 1r. curator_invites
CREATE TABLE IF NOT EXISTS curator_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 2: Add indexes**

```sql
CREATE INDEX IF NOT EXISTS idx_curator_invites_token ON curator_invites(token);
CREATE INDEX IF NOT EXISTS idx_curator_invites_created_by ON curator_invites(created_by);
```

- [ ] **Step 3: Add RLS**

```sql
ALTER TABLE curator_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage curator invites" ON curator_invites FOR ALL USING (is_admin());
```

- [ ] **Step 4: Deploy all to SQL Editor**

Run CREATE TABLE, indexes, and RLS. Verify:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'curator_invites';
```
Expected: one row.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add curator_invites table with RLS"
```

### Task 3: Update local_lists / local_list_items RLS for curator self-management

**Files:**
- Modify: `supabase/schema.sql` (RLS section for local_lists, around lines 2280-2316)

Currently all writes are admin-only. We need curators to manage their own list + items.

- [ ] **Step 1: Update local_lists RLS in schema.sql**

Replace the existing admin-only INSERT/UPDATE/DELETE policies with:

```sql
-- local_lists write policies (admin OR own list if curator)
CREATE POLICY "local_lists_admin_insert"
  ON local_lists FOR INSERT
  WITH CHECK (is_admin() OR (auth.uid() = user_id AND is_local_curator()));

CREATE POLICY "local_lists_admin_update"
  ON local_lists FOR UPDATE
  USING (is_admin() OR (auth.uid() = user_id AND is_local_curator()));

CREATE POLICY "local_lists_admin_delete"
  ON local_lists FOR DELETE
  USING (is_admin() OR (auth.uid() = user_id AND is_local_curator()));
```

- [ ] **Step 2: Update local_list_items RLS in schema.sql**

Replace the existing admin-only INSERT/UPDATE/DELETE policies with:

```sql
-- local_list_items write policies (admin OR items in own list)
CREATE POLICY "local_list_items_admin_insert"
  ON local_list_items FOR INSERT
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM local_lists ll
      WHERE ll.id = list_id AND ll.user_id = auth.uid()
    )
  );

CREATE POLICY "local_list_items_admin_update"
  ON local_list_items FOR UPDATE
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM local_lists ll
      WHERE ll.id = list_id AND ll.user_id = auth.uid()
    )
  );

CREATE POLICY "local_list_items_admin_delete"
  ON local_list_items FOR DELETE
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM local_lists ll
      WHERE ll.id = list_id AND ll.user_id = auth.uid()
    )
  );
```

- [ ] **Step 3: Deploy RLS changes to SQL Editor**

Must DROP old policies first, then CREATE new ones:

```sql
-- Drop old local_lists write policies
DROP POLICY IF EXISTS "local_lists_admin_insert" ON local_lists;
DROP POLICY IF EXISTS "local_lists_admin_update" ON local_lists;
DROP POLICY IF EXISTS "local_lists_admin_delete" ON local_lists;

-- Create new local_lists write policies
CREATE POLICY "local_lists_admin_insert"
  ON local_lists FOR INSERT
  WITH CHECK (is_admin() OR (auth.uid() = user_id AND is_local_curator()));

CREATE POLICY "local_lists_admin_update"
  ON local_lists FOR UPDATE
  USING (is_admin() OR (auth.uid() = user_id AND is_local_curator()));

CREATE POLICY "local_lists_admin_delete"
  ON local_lists FOR DELETE
  USING (is_admin() OR (auth.uid() = user_id AND is_local_curator()));

-- Drop old local_list_items write policies
DROP POLICY IF EXISTS "local_list_items_admin_insert" ON local_list_items;
DROP POLICY IF EXISTS "local_list_items_admin_update" ON local_list_items;
DROP POLICY IF EXISTS "local_list_items_admin_delete" ON local_list_items;

-- Create new local_list_items write policies
CREATE POLICY "local_list_items_admin_insert"
  ON local_list_items FOR INSERT
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM local_lists ll
      WHERE ll.id = list_id AND ll.user_id = auth.uid()
    )
  );

CREATE POLICY "local_list_items_admin_update"
  ON local_list_items FOR UPDATE
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM local_lists ll
      WHERE ll.id = list_id AND ll.user_id = auth.uid()
    )
  );

CREATE POLICY "local_list_items_admin_delete"
  ON local_list_items FOR DELETE
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM local_lists ll
      WHERE ll.id = list_id AND ll.user_id = auth.uid()
    )
  );
```

Verify:
```sql
SELECT policyname, cmd FROM pg_policies
WHERE tablename IN ('local_lists', 'local_list_items')
ORDER BY tablename, cmd;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: update local lists RLS — curators can manage own list"
```

### Task 4: Create invite and self-management RPCs

**Files:**
- Modify: `supabase/schema.sql` (add after existing local list RPCs, around line 2396)

- [ ] **Step 1: Add `create_curator_invite` RPC to schema.sql**

Admin-only function to generate invite links:

```sql
CREATE OR REPLACE FUNCTION create_curator_invite()
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
BEGIN
  IF NOT is_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Admin only');
  END IF;

  INSERT INTO curator_invites (created_by)
  VALUES (auth.uid())
  RETURNING * INTO v_invite;

  RETURN json_build_object(
    'success', true,
    'token', v_invite.token,
    'expires_at', v_invite.expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

- [ ] **Step 2: Add `get_curator_invite_details` RPC**

Public-facing (SECURITY DEFINER bypasses RLS on curator_invites):

```sql
CREATE OR REPLACE FUNCTION get_curator_invite_details(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
BEGIN
  SELECT * INTO v_invite FROM curator_invites WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'error', 'Invite not found');
  END IF;
  IF v_invite.used_by IS NOT NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Invite already used');
  END IF;
  IF v_invite.expires_at < NOW() THEN
    RETURN json_build_object('valid', false, 'error', 'Invite has expired');
  END IF;

  RETURN json_build_object('valid', true, 'expires_at', v_invite.expires_at);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

- [ ] **Step 3: Add `accept_curator_invite` RPC**

Accepts invite, sets curator flag, creates empty list:

```sql
CREATE OR REPLACE FUNCTION accept_curator_invite(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
  v_user_id UUID;
  v_display_name TEXT;
  v_list_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_invite FROM curator_invites WHERE token = p_token FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invite not found');
  END IF;
  IF v_invite.used_by IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invite already used');
  END IF;
  IF v_invite.expires_at < NOW() THEN
    RETURN json_build_object('success', false, 'error', 'Invite has expired');
  END IF;

  -- Set curator flag
  UPDATE profiles SET is_local_curator = true WHERE id = v_user_id;

  -- Get display name for default title
  SELECT display_name INTO v_display_name FROM profiles WHERE id = v_user_id;

  -- Create empty list (is_active = false until they add dishes)
  INSERT INTO local_lists (user_id, title, is_active)
  VALUES (v_user_id, COALESCE(v_display_name, 'My') || '''s Top 10', false)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_list_id;

  -- If list already existed, just get its ID
  IF v_list_id IS NULL THEN
    SELECT id INTO v_list_id FROM local_lists WHERE user_id = v_user_id;
  END IF;

  -- Mark invite as used
  UPDATE curator_invites SET used_by = v_user_id, used_at = NOW() WHERE id = v_invite.id;

  RETURN json_build_object('success', true, 'list_id', v_list_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

- [ ] **Step 4: Add `get_my_local_list` RPC**

Returns the authenticated user's own list regardless of `is_active` status. Uses LEFT JOINs so an empty list still returns metadata:

```sql
CREATE OR REPLACE FUNCTION get_my_local_list()
RETURNS TABLE (
  list_id UUID,
  title TEXT,
  description TEXT,
  curator_tagline TEXT,
  is_active BOOLEAN,
  "position" INT,
  dish_id UUID,
  dish_name TEXT,
  restaurant_name TEXT,
  restaurant_id UUID,
  avg_rating NUMERIC,
  total_votes INT,
  category TEXT,
  note TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    ll.id AS list_id,
    ll.title,
    ll.description,
    ll.curator_tagline,
    ll.is_active,
    li."position",
    d.id AS dish_id,
    d.name AS dish_name,
    r.name AS restaurant_name,
    r.id AS restaurant_id,
    d.avg_rating,
    d.total_votes,
    d.category,
    li.note
  FROM local_lists ll
  LEFT JOIN local_list_items li ON li.list_id = ll.id
  LEFT JOIN dishes d ON d.id = li.dish_id
  LEFT JOIN restaurants r ON r.id = d.restaurant_id
  WHERE ll.user_id = auth.uid()
  ORDER BY li."position";
$$;
```

- [ ] **Step 5: Add `save_my_local_list` RPC**

Atomic save: updates metadata, replaces all items. Sets `is_active = true` when items exist:

```sql
CREATE OR REPLACE FUNCTION save_my_local_list(
  p_tagline TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_list_id UUID;
  v_item JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check curator status
  IF NOT is_local_curator() THEN
    RETURN json_build_object('success', false, 'error', 'Not a local curator');
  END IF;

  -- Validate item count
  IF jsonb_array_length(p_items) > 10 THEN
    RETURN json_build_object('success', false, 'error', 'Maximum 10 dishes allowed');
  END IF;

  -- Get existing list
  SELECT id INTO v_list_id FROM local_lists WHERE user_id = v_user_id;

  IF v_list_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No list found — accept an invite first');
  END IF;

  -- Update list metadata
  UPDATE local_lists
  SET curator_tagline = p_tagline,
      is_active = jsonb_array_length(p_items) > 0
  WHERE id = v_list_id;

  -- Replace all items
  DELETE FROM local_list_items WHERE list_id = v_list_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO local_list_items (list_id, dish_id, "position", note)
    VALUES (
      v_list_id,
      (v_item->>'dish_id')::UUID,
      (v_item->>'position')::INT,
      v_item->>'note'
    );
  END LOOP;

  RETURN json_build_object('success', true, 'list_id', v_list_id, 'item_count', jsonb_array_length(p_items));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

- [ ] **Step 6: Deploy all RPCs to SQL Editor**

Run all 5 CREATE FUNCTION statements. Verify each:

```sql
SELECT create_curator_invite();
-- Expected: {"success": true, "token": "...", "expires_at": "..."}

SELECT get_curator_invite_details('nonexistent');
-- Expected: {"valid": false, "error": "Invite not found"}

SELECT get_my_local_list();
-- Expected: empty result set (no list for current user)
```

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add curator invite + self-management RPCs"
```

---

## Chunk 2: Invite Acceptance Flow

### Task 5: Add invite API methods to localListsApi

**Files:**
- Modify: `src/api/localListsApi.js`

- [ ] **Step 1: Add 4 new methods**

Add after the existing `getByUser` method:

```js
  async getCuratorInviteDetails(token) {
    try {
      const { data, error } = await supabase.rpc('get_curator_invite_details', { p_token: token })
      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('Failed to fetch curator invite details:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async acceptCuratorInvite(token) {
    try {
      const { data, error } = await supabase.rpc('accept_curator_invite', { p_token: token })
      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('Failed to accept curator invite:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getMyList() {
    try {
      const { data, error } = await supabase.rpc('get_my_local_list')
      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Failed to fetch my local list:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async saveMyList({ tagline, items }) {
    try {
      const { data, error } = await supabase.rpc('save_my_local_list', {
        p_tagline: tagline || null,
        p_items: JSON.stringify(items),
      })
      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('Failed to save local list:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/api/localListsApi.js
git commit -m "feat: add curator invite + self-management API methods"
```

### Task 6: Create AcceptCuratorInvite page

**Files:**
- Create: `src/pages/AcceptCuratorInvite.jsx`

This mirrors the existing `AcceptInvite.jsx` pattern (restaurant invites). Key differences: no restaurant name display, redirects to `/my-list` instead of `/manage`.

- [ ] **Step 1: Write the page component**

```jsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { localListsApi } from '../api/localListsApi'
import { logger } from '../utils/logger'

export function AcceptCuratorInvite() {
  var { token } = useParams()
  var navigate = useNavigate()
  var location = useLocation()
  var { user, loading: authLoading } = useAuth()

  var [invite, setInvite] = useState(null)
  var [loading, setLoading] = useState(true)
  var [accepting, setAccepting] = useState(false)
  var [error, setError] = useState(null)

  useEffect(function () {
    var cancelled = false

    async function fetchInvite() {
      try {
        var details = await localListsApi.getCuratorInviteDetails(token)
        if (cancelled) return
        if (!details.valid) {
          setError(details.error || 'Invalid invite link')
        } else {
          setInvite(details)
        }
      } catch (err) {
        if (cancelled) return
        logger.error('Error fetching curator invite:', err)
        setError('Failed to load invite details')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchInvite()
    return function () { cancelled = true }
  }, [token])

  async function handleAccept() {
    setAccepting(true)
    setError(null)

    try {
      var result = await localListsApi.acceptCuratorInvite(token)
      if (result.success) {
        navigate('/my-list')
      } else {
        setError(result.error || 'Failed to accept invite')
      }
    } catch (err) {
      logger.error('Error accepting curator invite:', err)
      setError(err.message || 'Failed to accept invite')
    } finally {
      setAccepting(false)
    }
  }

  function handleSignIn() {
    navigate('/login', { state: { from: location } })
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: 'var(--color-primary)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading invite...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center max-w-md px-6">
          <div className="text-4xl mb-4">😕</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            Invalid Invite
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            {error?.message || error}
          </p>
          <button
            onClick={function () { navigate('/') }}
            className="px-6 py-3 rounded-xl font-semibold"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="text-center max-w-md px-6">
        <div className="text-5xl mb-4">🍽️</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Become a Local Curator
        </h1>
        <p className="text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          You've been invited to share your
        </p>
        <p className="text-lg font-bold mb-2" style={{ color: 'var(--color-primary)' }}>
          Top 10 Dishes on Martha's Vineyard
        </p>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-tertiary)' }}>
          Your picks help visitors discover the best food on the island.
        </p>

        {user ? (
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-50"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            {accepting ? 'Setting up...' : 'Accept & Build My Top 10'}
          </button>
        ) : (
          <button
            onClick={handleSignIn}
            className="w-full px-6 py-3 rounded-xl font-semibold transition-all"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            Sign In to Accept
          </button>
        )}

        <p className="mt-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Expires {new Date(invite.expires_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/AcceptCuratorInvite.jsx
git commit -m "feat: add AcceptCuratorInvite page"
```

### Task 7: Add routes to App.jsx

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add lazy imports**

After the existing lazy imports (around line 68), add:

```js
const AcceptCuratorInvite = lazyWithRetry(() => import('./pages/AcceptCuratorInvite'), 'AcceptCuratorInvite')
const MyList = lazyWithRetry(() => import('./pages/MyList'), 'MyList')
```

- [ ] **Step 2: Add routes**

After the `/invite/:token` route (line 136), add:

```jsx
<Route path="/curator-invite/:token" element={<AcceptCuratorInvite />} />
<Route path="/my-list" element={<ProtectedRoute><Layout><MyList /></Layout></ProtectedRoute>} />
```

Note: `/my-list` is behind `ProtectedRoute` since it requires authentication. The `MyList` page itself will check `is_local_curator` status and show an appropriate message if the user isn't a curator.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds. (MyList page doesn't exist yet, but lazy loading won't fail at build time.)

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add curator-invite and my-list routes"
```

---

## Chunk 3: Dish Picker — My List Page

### Task 8: Create useMyLocalList hook

**Files:**
- Create: `src/hooks/useMyLocalList.js`

- [ ] **Step 1: Write the hook**

```js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { localListsApi } from '../api/localListsApi'
import { getUserMessage } from '../utils/errorHandler'

export function useMyLocalList() {
  var queryClient = useQueryClient()

  var { data, isLoading, error } = useQuery({
    queryKey: ['myLocalList'],
    queryFn: function () { return localListsApi.getMyList() },
    staleTime: 1000 * 60 * 2,
  })

  var saveMutation = useMutation({
    mutationFn: function (payload) {
      return localListsApi.saveMyList(payload)
    },
    onSuccess: function () {
      queryClient.invalidateQueries({ queryKey: ['myLocalList'] })
      queryClient.invalidateQueries({ queryKey: ['localLists'] })
      queryClient.invalidateQueries({ queryKey: ['localList'] })
    },
  })

  // Parse the raw RPC rows into structured data
  var items = data || []
  var listMeta = items.length > 0 ? {
    listId: items[0].list_id,
    title: items[0].title,
    description: items[0].description,
    curatorTagline: items[0].curator_tagline,
    isActive: items[0].is_active,
  } : null

  // Filter out rows where dish_id is null (empty list returns 1 row with nulls due to LEFT JOIN)
  var dishes = items.filter(function (row) { return row.dish_id != null })

  return {
    listMeta: listMeta,
    dishes: dishes,
    loading: isLoading,
    error: error ? { message: getUserMessage(error, 'loading your list') } : null,
    saveList: saveMutation.mutateAsync,
    saving: saveMutation.isPending,
    saveError: saveMutation.error
      ? { message: getUserMessage(saveMutation.error, 'saving your list') }
      : null,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useMyLocalList.js
git commit -m "feat: add useMyLocalList hook with query + mutation"
```

### Task 9: Create MyList page

**Files:**
- Create: `src/pages/MyList.jsx`

This is the core dish picker UI. Layout:
- Back button + title
- Tagline input
- Current list items (numbered, with remove + up/down reorder)
- "Add a dish" search section
- Save button (fixed bottom)

- [ ] **Step 1: Write the page component**

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMyLocalList } from '../hooks/useMyLocalList'
import { useDishSearch } from '../hooks/useDishSearch'
import { getCategoryEmoji } from '../constants/categories'
import { logger } from '../utils/logger'

export function MyList() {
  var navigate = useNavigate()
  var { listMeta, dishes, loading, saveList, saving } = useMyLocalList()

  // Local state for editing
  var [tagline, setTagline] = useState('')
  var [items, setItems] = useState([])
  var [searchQuery, setSearchQuery] = useState('')
  var [showSearch, setShowSearch] = useState(false)
  var [saveMessage, setSaveMessage] = useState(null)

  var { results: searchResults } = useDishSearch(searchQuery, 20)

  // Initialize from server data
  useEffect(function () {
    if (dishes.length > 0 && items.length === 0) {
      setItems(dishes.map(function (d) {
        return {
          dish_id: d.dish_id,
          dish_name: d.dish_name,
          restaurant_name: d.restaurant_name,
          category: d.category,
          note: d.note || '',
        }
      }))
    }
    if (listMeta && !tagline && listMeta.curatorTagline) {
      setTagline(listMeta.curatorTagline)
    }
  }, [dishes, listMeta])

  // Not a curator
  if (!loading && !listMeta) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center px-6">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            Local Curators Only
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            You need an invite link to become a local curator.
          </p>
          <button
            onClick={function () { navigate('/') }}
            className="px-6 py-3 rounded-xl font-semibold"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--color-primary)' }} />
      </div>
    )
  }

  function handleAddDish(dish) {
    if (items.length >= 10) return
    // Don't add duplicates
    if (items.some(function (item) { return item.dish_id === (dish.dish_id || dish.id) })) return

    setItems(function (prev) {
      return prev.concat([{
        dish_id: dish.dish_id || dish.id,
        dish_name: dish.dish_name || dish.name,
        restaurant_name: dish.restaurant_name,
        category: dish.category,
        note: '',
      }])
    })
    setSearchQuery('')
    setShowSearch(false)
  }

  function handleRemoveDish(dishId) {
    setItems(function (prev) {
      return prev.filter(function (item) { return item.dish_id !== dishId })
    })
  }

  function handleMoveUp(index) {
    if (index === 0) return
    setItems(function (prev) {
      var copy = prev.slice()
      var temp = copy[index - 1]
      copy[index - 1] = copy[index]
      copy[index] = temp
      return copy
    })
  }

  function handleMoveDown(index) {
    if (index >= items.length - 1) return
    setItems(function (prev) {
      var copy = prev.slice()
      var temp = copy[index + 1]
      copy[index + 1] = copy[index]
      copy[index] = temp
      return copy
    })
  }

  function handleNoteChange(index, note) {
    setItems(function (prev) {
      var copy = prev.slice()
      copy[index] = Object.assign({}, copy[index], { note: note })
      return copy
    })
  }

  async function handleSave() {
    setSaveMessage(null)
    try {
      var payload = {
        tagline: tagline || null,
        items: items.map(function (item, i) {
          return {
            dish_id: item.dish_id,
            position: i + 1,
            note: item.note || null,
          }
        }),
      }
      var result = await saveList(payload)
      if (result.success) {
        setSaveMessage('Saved! ' + (items.length > 0 ? 'Your list is live.' : 'List unpublished.'))
      } else {
        setSaveMessage('Error: ' + (result.error || 'Failed to save'))
      }
    } catch (err) {
      logger.error('Save list error:', err)
      setSaveMessage('Error: ' + (err.message || 'Failed to save'))
    }
  }

  // Filter search results to exclude already-added dishes
  var addedIds = {}
  items.forEach(function (item) { addedIds[item.dish_id] = true })
  var filteredResults = searchResults.filter(function (dish) {
    return !addedIds[dish.dish_id || dish.id]
  })

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', paddingBottom: '100px' }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 style={{
          fontSize: '22px',
          fontWeight: 800,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.02em',
        }}>
          My Top 10
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
          Pick up to 10 dishes visitors should try
        </p>
      </div>

      {/* Tagline */}
      <div className="px-4 mb-4">
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
          Your tagline
        </label>
        <input
          type="text"
          value={tagline}
          onChange={function (e) { setTagline(e.target.value) }}
          placeholder="e.g. Manager at Nancy's, lifelong islander"
          maxLength={80}
          className="w-full rounded-lg"
          style={{
            padding: '10px 12px',
            fontSize: '14px',
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-divider)',
            color: 'var(--color-text-primary)',
            outline: 'none',
          }}
        />
      </div>

      {/* Current items */}
      <div className="px-4">
        {items.length === 0 ? (
          <div
            className="rounded-xl text-center"
            style={{
              padding: '24px 16px',
              background: 'var(--color-surface-elevated)',
              border: '1px dashed var(--color-divider)',
            }}
          >
            <p style={{ fontSize: '14px', color: 'var(--color-text-tertiary)' }}>
              No dishes yet — add your first pick below
            </p>
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: '8px' }}>
            {items.map(function (item, i) {
              var emoji = getCategoryEmoji(item.category) || '🍽️'
              return (
                <div
                  key={item.dish_id}
                  className="rounded-xl"
                  style={{
                    background: 'var(--color-surface-elevated)',
                    border: '1px solid var(--color-divider)',
                    padding: '12px',
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank number */}
                    <span style={{
                      fontSize: '16px',
                      fontWeight: 800,
                      color: 'var(--color-text-tertiary)',
                      width: '24px',
                      textAlign: 'center',
                    }}>
                      {i + 1}
                    </span>

                    {/* Emoji */}
                    <span style={{ fontSize: '20px' }}>{emoji}</span>

                    {/* Name + restaurant */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {item.dish_name}
                      </p>
                      <p className="truncate" style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {item.restaurant_name}
                      </p>
                    </div>

                    {/* Reorder buttons */}
                    <div className="flex flex-col" style={{ gap: '2px' }}>
                      <button
                        onClick={function () { handleMoveUp(i) }}
                        disabled={i === 0}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px 6px',
                          fontSize: '14px',
                          color: i === 0 ? 'var(--color-divider)' : 'var(--color-text-secondary)',
                          cursor: i === 0 ? 'default' : 'pointer',
                        }}
                      >
                        ▲
                      </button>
                      <button
                        onClick={function () { handleMoveDown(i) }}
                        disabled={i >= items.length - 1}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px 6px',
                          fontSize: '14px',
                          color: i >= items.length - 1 ? 'var(--color-divider)' : 'var(--color-text-secondary)',
                          cursor: i >= items.length - 1 ? 'default' : 'pointer',
                        }}
                      >
                        ▼
                      </button>
                    </div>

                    {/* Remove */}
                    <button
                      onClick={function () { handleRemoveDish(item.dish_id) }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '4px 8px',
                        fontSize: '16px',
                        color: 'var(--color-text-tertiary)',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Note */}
                  <div style={{ marginTop: '8px', marginLeft: '56px' }}>
                    <input
                      type="text"
                      value={item.note}
                      onChange={function (e) { handleNoteChange(i, e.target.value) }}
                      placeholder="Add a quick note (optional)"
                      maxLength={120}
                      className="w-full"
                      style={{
                        padding: '6px 8px',
                        fontSize: '12px',
                        fontStyle: item.note ? 'normal' : 'italic',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--color-divider)',
                        color: 'var(--color-text-secondary)',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add dish section */}
      {items.length < 10 && (
        <div className="px-4 mt-4">
          {!showSearch ? (
            <button
              onClick={function () { setShowSearch(true) }}
              className="w-full rounded-xl"
              style={{
                padding: '12px',
                background: 'none',
                border: '1.5px dashed var(--color-primary)',
                color: 'var(--color-primary)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add a dish ({10 - items.length} remaining)
            </button>
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-divider)',
              }}
            >
              <div className="flex items-center" style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-divider)' }}>
                <span style={{ fontSize: '16px', marginRight: '8px', color: 'var(--color-text-tertiary)' }}>🔍</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={function (e) { setSearchQuery(e.target.value) }}
                  placeholder="Search dishes..."
                  autoFocus
                  className="flex-1"
                  style={{
                    padding: '4px 0',
                    fontSize: '14px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={function () { setShowSearch(false); setSearchQuery('') }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '13px',
                    color: 'var(--color-text-tertiary)',
                    cursor: 'pointer',
                    padding: '4px 8px',
                  }}
                >
                  Cancel
                </button>
              </div>

              {/* Search results */}
              {searchQuery.length >= 2 && (
                <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                  {filteredResults.length === 0 ? (
                    <p style={{ padding: '12px', fontSize: '13px', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                      No dishes found
                    </p>
                  ) : (
                    filteredResults.slice(0, 8).map(function (dish) {
                      var emoji = getCategoryEmoji(dish.category) || '🍽️'
                      return (
                        <button
                          key={dish.dish_id || dish.id}
                          onClick={function () { handleAddDish(dish) }}
                          className="w-full text-left flex items-center gap-3"
                          style={{
                            padding: '10px 12px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px solid var(--color-divider)',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ fontSize: '18px' }}>{emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="truncate" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                              {dish.dish_name || dish.name}
                            </p>
                            <p className="truncate" style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                              {dish.restaurant_name}
                            </p>
                          </div>
                          <span style={{ fontSize: '18px', color: 'var(--color-primary)' }}>+</span>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save button (fixed bottom) */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 16px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          background: 'var(--color-bg)',
          borderTop: '1px solid var(--color-divider)',
          zIndex: 50,
        }}
      >
        {saveMessage && (
          <p style={{
            fontSize: '12px',
            color: saveMessage.startsWith('Error') ? 'var(--color-danger)' : 'var(--color-success)',
            marginBottom: '8px',
            textAlign: 'center',
          }}>
            {saveMessage}
          </p>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl font-semibold transition-all disabled:opacity-50"
          style={{
            padding: '14px',
            fontSize: '16px',
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : items.length > 0 ? 'Save & Publish' : 'Save (Unpublished)'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MyList.jsx
git commit -m "feat: add MyList dish picker page for local curators"
```

---

## Chunk 4: Taste Matching on Homepage

### Task 10: Update homepage RPC to include compatibility

**Files:**
- Modify: `supabase/schema.sql` (the `get_local_lists_for_homepage` function, around line 2319)

- [ ] **Step 1: Update RPC in schema.sql**

The function gets an optional `p_viewer_id` parameter. When provided, it computes taste compatibility inline using the same formula as `get_taste_compatibility` (needs 3+ shared dishes for a percentage).

Replace the existing `get_local_lists_for_homepage` function with:

```sql
DROP FUNCTION IF EXISTS get_local_lists_for_homepage();
DROP FUNCTION IF EXISTS get_local_lists_for_homepage(UUID);

CREATE OR REPLACE FUNCTION get_local_lists_for_homepage(p_viewer_id UUID DEFAULT NULL)
RETURNS TABLE (
  list_id UUID,
  user_id UUID,
  title TEXT,
  description TEXT,
  display_name TEXT,
  avatar_url TEXT,
  curator_tagline TEXT,
  item_count INT,
  preview_dishes TEXT[],
  compatibility_pct INT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    ll.id AS list_id,
    ll.user_id,
    ll.title,
    ll.description,
    p.display_name,
    p.avatar_url,
    ll.curator_tagline,
    (SELECT COUNT(*)::INT FROM local_list_items WHERE list_id = ll.id) AS item_count,
    (SELECT ARRAY_AGG(d.name ORDER BY li."position")
     FROM local_list_items li
     JOIN dishes d ON d.id = li.dish_id
     WHERE li.list_id = ll.id AND li."position" <= 4) AS preview_dishes,
    CASE
      WHEN p_viewer_id IS NOT NULL AND p_viewer_id != ll.user_id THEN (
        SELECT CASE
          WHEN COUNT(*) >= 3 THEN ROUND(100 - (AVG(ABS(a.rating_10 - b.rating_10)) / 9.0 * 100))::INT
          ELSE NULL
        END
        FROM votes a
        JOIN votes b ON a.dish_id = b.dish_id
        WHERE a.user_id = p_viewer_id AND b.user_id = ll.user_id
          AND a.rating_10 IS NOT NULL AND b.rating_10 IS NOT NULL
      )
      ELSE NULL
    END AS compatibility_pct
  FROM local_lists ll
  JOIN profiles p ON p.id = ll.user_id
  WHERE ll.is_active = true
  ORDER BY RANDOM()
  LIMIT 8;
$$;
```

Key changes from the original:
- New `p_viewer_id` parameter (default NULL for anonymous)
- New `compatibility_pct` return column
- `LIMIT 8` (up from 6) to show more locals as the pool grows
- `ORDER BY RANDOM()` for rotation fairness with 20-30 locals

- [ ] **Step 2: Deploy to SQL Editor**

Run the DROP + CREATE statements. Verify:

```sql
SELECT * FROM get_local_lists_for_homepage(NULL);
```
Expected: returns active lists with `compatibility_pct` as NULL.

```sql
SELECT * FROM get_local_lists_for_homepage('YOUR_USER_UUID_HERE');
```
Expected: returns active lists with `compatibility_pct` populated where 3+ shared votes exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add taste compatibility to homepage local lists RPC"
```

### Task 11: Update useLocalLists hook to pass viewer ID

**Files:**
- Modify: `src/hooks/useLocalLists.js`

- [ ] **Step 1: Update the hook to accept and pass user ID**

```js
import { useQuery } from '@tanstack/react-query'
import { localListsApi } from '../api/localListsApi'
import { getUserMessage } from '../utils/errorHandler'

export function useLocalLists(viewerId) {
  var { data, isLoading, error } = useQuery({
    queryKey: ['localLists', 'homepage', viewerId || 'anon'],
    queryFn: function () { return localListsApi.getForHomepage(viewerId) },
    staleTime: 1000 * 60 * 5,
  })

  return {
    lists: data || [],
    loading: isLoading,
    error: error ? { message: getUserMessage(error, 'loading local lists') } : null,
  }
}
```

- [ ] **Step 2: Update localListsApi.getForHomepage to accept viewerId**

In `src/api/localListsApi.js`, update the `getForHomepage` method:

```js
  async getForHomepage(viewerId) {
    try {
      const params = viewerId ? { p_viewer_id: viewerId } : {}
      const { data, error } = await supabase.rpc('get_local_lists_for_homepage', params)
      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Failed to fetch local lists for homepage:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useLocalLists.js src/api/localListsApi.js
git commit -m "feat: pass viewer ID to local lists hook for taste matching"
```

### Task 12: Show taste match on homepage cards

**Files:**
- Modify: `src/components/home/LocalListsSection.jsx`

- [ ] **Step 1: Pass user ID to useLocalLists**

Add auth import and pass user ID:

```js
import { useAuth } from '../../context/AuthContext'
```

Inside the `LocalListsSection` function, before the existing `useLocalLists` call:

```js
var { user } = useAuth()
var { lists, loading } = useLocalLists(user ? user.id : null)
```

- [ ] **Step 2: Add compatibility badge to card header**

Inside the `ExpandableListCard` component (or the card rendering in `LocalListsSection`), after the curator tagline and before the chevron, add a compatibility display:

```jsx
{list.compatibility_pct != null && (
  <div
    className="flex-shrink-0 rounded-full"
    style={{
      padding: '2px 8px',
      fontSize: '11px',
      fontWeight: 700,
      background: list.compatibility_pct >= 80
        ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
        : 'color-mix(in srgb, var(--color-accent-gold) 15%, transparent)',
      color: list.compatibility_pct >= 80
        ? 'var(--color-success)'
        : 'var(--color-accent-gold)',
    }}
  >
    {list.compatibility_pct}% match
  </div>
)}
```

Place this inside the `flex items-center gap-3` container, between the content div and the chevron div.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/home/LocalListsSection.jsx
git commit -m "feat: show taste compatibility % on local list cards"
```

---

## Chunk 5: Documentation & Verification

### Task 13: Update docs

**Files:**
- Modify: `SPEC.md`
- Modify: `TASKS.md`

- [ ] **Step 1: Update SPEC.md**

Add to the Tables section:
- `curator_invites` — Token-based invite links for local curator access. Columns: id, token, created_by, expires_at, used_by, used_at, created_at

Add to RPCs section:
- `create_curator_invite()` — Admin generates invite link, returns token
- `get_curator_invite_details(p_token)` — Validates invite token
- `accept_curator_invite(p_token)` — Sets is_local_curator flag, creates empty list
- `get_my_local_list()` — Returns authenticated user's own list + items
- `save_my_local_list(p_tagline, p_items)` — Atomic save of list items + metadata

Update existing `get_local_lists_for_homepage` entry to note the `p_viewer_id` parameter and `compatibility_pct` return column.

Add to Routes section:
- `/curator-invite/:token` → AcceptCuratorInvite (No auth required)
- `/my-list` → MyList (Auth required)

- [ ] **Step 2: Add task to TASKS.md**

```markdown
## ~~T42: Self-Service Local Lists~~ DONE

**Why:** Scale from 6 admin-seeded lists to 20-30 locals with self-service invite + dish picker flow.

**What was done:**
- `curator_invites` table for token-based invite links (30-day expiry)
- `is_local_curator` profile flag set on invite acceptance
- RLS updated: curators can manage own list + items
- AcceptCuratorInvite page at `/curator-invite/:token`
- MyList dish picker page at `/my-list` with search, reorder, notes
- `save_my_local_list` atomic RPC (replaces all items, auto-publishes)
- Taste compatibility % on homepage list cards via updated RPC
- Homepage shows random 8 of all active lists

**Files:** `supabase/schema.sql`, `src/pages/AcceptCuratorInvite.jsx`, `src/pages/MyList.jsx`, `src/hooks/useMyLocalList.js`, `src/api/localListsApi.js`, `src/App.jsx`, `src/hooks/useLocalLists.js`, `src/components/home/LocalListsSection.jsx`
```

- [ ] **Step 3: Commit**

```bash
git add SPEC.md TASKS.md
git commit -m "docs: document self-service local lists in SPEC + TASKS"
```

### Task 14: Final verification

- [ ] **Step 1: Build check**

```bash
npm run build
```

Expected: Passes.

- [ ] **Step 2: Test check**

```bash
npx vitest --run
```

Expected: Passes (no new tests needed — this is primarily UI + RPCs).

- [ ] **Step 3: End-to-end smoke test**

Manual verification checklist:
1. Generate invite: run `SELECT create_curator_invite();` in SQL Editor — get token
2. Open `/curator-invite/<token>` while logged in — see welcome page
3. Accept invite — redirected to `/my-list`
4. Add 3+ dishes via search — see them numbered with reorder buttons
5. Set tagline — type occupation/connection
6. Save — see "Saved! Your list is live." message
7. Go to homepage — see your list in Local Lists section
8. If you have 3+ shared votes with a curator — see "X% match" badge
9. Expand a list card — see full dish items

---

## Operational Notes

### Generating invite links

Dan generates invite links for locals by running in Supabase SQL Editor:

```sql
SELECT create_curator_invite();
```

This returns `{"success": true, "token": "abc123...", "expires_at": "..."}`.

The invite URL is: `https://wghapp.com/curator-invite/<token>`

Share this URL with the local via text/email. They click it, sign in (or create account), accept, and build their list.

### Revoking curator access

To remove someone's curator status:

```sql
UPDATE profiles SET is_local_curator = false WHERE display_name = 'TheirName';
UPDATE local_lists SET is_active = false WHERE user_id = (SELECT id FROM profiles WHERE display_name = 'TheirName');
```

### Monitoring list quality

Check how many curators have published lists:

```sql
SELECT p.display_name, ll.curator_tagline,
  (SELECT COUNT(*) FROM local_list_items WHERE list_id = ll.id) AS item_count,
  ll.is_active, ll.created_at
FROM local_lists ll
JOIN profiles p ON p.id = ll.user_id
ORDER BY ll.created_at;
```
