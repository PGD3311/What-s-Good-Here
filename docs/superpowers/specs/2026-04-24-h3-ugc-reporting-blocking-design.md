# H3 — UGC Reporting + Blocking

**Status:** Approved 2026-04-24. Pre-implementation design.
**Why:** App Store Guideline 1.2 requires UGC apps to ship a content reporting mechanism, a user blocking mechanism, content filtering, and published contact info. Without these, Apple auto-rejects.
**Approach:** A (lean Apple-compliant) — see `docs/superpowers/plans/2026-04-13-app-store-readiness.md` § H3 for the original audit.

---

## Goal

Ship the smallest correct surface that satisfies Apple Guideline 1.2 and gives Dan a working moderation loop. Anything more is post-launch polish.

## Core invariants

These two ideas are different mechanisms with different consequences. Conflating them is the architectural mistake we're avoiding.

- **Block = personal mute.** "I don't want to see this person." Affects only the blocker's view. Standard pattern across Twitter, Reddit, Instagram. Does not propagate to anyone else, does not affect aggregate signals.
- **Report = escalation to admin.** "This person or this content is harming the platform." Lands in the moderation queue, triggers admin attention, can result in ban/removal/no-action. Independent of blocking.

A user can block without reporting (don't want drama) or report without blocking (still want to see the content, just want admin to know). Both flows must work standalone.

---

## What's reportable

| Target | Justification |
|---|---|
| Reviews (text) | Hate speech, slurs, harassment, spam |
| Dish photos | Inappropriate or off-topic imagery |
| Dish names | AI menu extraction occasionally produces weird/offensive names |
| Restaurant names | Same — bad data, offensive, fake listings |
| Users | Apple wants this surface; supports cases where the issue isn't tied to one piece of content |

`user_blocks` only applies to users, not content.

## Report reasons (enum)

Pinned set, presented as radio buttons in `ReportModal`. Free-text "additional details" field, optional, max 500 chars.

```
'spam'                  -- promotional, scam, repeated identical content
'hate_speech'           -- slurs, attacks on protected categories
'harassment'            -- targeted abuse, personal attacks
'misinformation'        -- false claims about a restaurant/dish
'inappropriate'         -- sexual, violent, off-topic imagery
'other'                 -- requires the details field to be non-empty
```

All other categories deliberately omitted to keep the moderation queue scannable.

---

## Schema

### `reports` table

```sql
CREATE TABLE IF NOT EXISTS public.reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type     TEXT NOT NULL CHECK (target_type IN
                    ('review', 'dish_photo', 'dish', 'restaurant', 'user')),
  target_id       UUID NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN
                    ('spam', 'hate_speech', 'harassment',
                     'misinformation', 'inappropriate', 'other')),
  details         TEXT CHECK (length(details) <= 500),
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_notes     TEXT
);

CREATE INDEX idx_reports_status_created ON reports (status, created_at DESC);
CREATE INDEX idx_reports_reporter ON reports (reporter_id);
CREATE INDEX idx_reports_target ON reports (target_type, target_id);
```

Notes:
- `target_id` is intentionally untyped (UUID without FK). It refers into different tables depending on `target_type`. Wiring six FKs adds complexity for little gain — we validate the target's existence in the `submit_report` RPC.
- `reason = 'other'` requires `details IS NOT NULL AND length(trim(details)) > 0`. Enforced in the RPC, not as a CHECK (CHECK across columns is verbose; RPC is simpler).
- `status = 'actioned'` reserved for "I banned the user / removed the content as a result of this report." Helps with audit trail.

### `user_blocks` table

```sql
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX idx_user_blocks_blocker ON user_blocks (blocker_id);
CREATE INDEX idx_user_blocks_blocked ON user_blocks (blocked_id);
```

Notes:
- Composite primary key inherently enforces uniqueness — no separate unique constraint needed.
- `blocker_id <> blocked_id` constraint prevents the user-blocks-self edge case at the DB level.

---

## RLS

### `reports`

```sql
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Users can insert their own reports
CREATE POLICY reports_insert_own ON reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

-- Users CANNOT read others' reports — admin-only via service role / admin RPC
-- Users can read their own report history (lets us show "you reported this" in UI)
CREATE POLICY reports_select_own ON reports
  FOR SELECT USING (reporter_id = auth.uid());

-- No update/delete from clients. Admin actions go through RPCs running as service role.
```

### `user_blocks`

```sql
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_blocks_insert_own ON user_blocks
  FOR INSERT WITH CHECK (blocker_id = auth.uid());

CREATE POLICY user_blocks_select_own ON user_blocks
  FOR SELECT USING (blocker_id = auth.uid());

CREATE POLICY user_blocks_delete_own ON user_blocks
  FOR DELETE USING (blocker_id = auth.uid());
```

Note: `blocked_id` users cannot read rows where they are the blocked party. The block is silent (one-way) — blocked users have no client-readable signal that they were blocked. Admin-only.

---

## RPCs

### `submit_report(p_target_type, p_target_id, p_reason, p_details)`

Returns `{ id: UUID, success: boolean }`. SECURITY DEFINER (so we can validate target existence regardless of viewer's read permissions).

Flow:
1. Authenticate caller (auth.uid() not null)
2. Rate limit: if `reports_count_last_hour > 5 OR last_24h > 20` → throw `RATE_LIMITED`
3. Validate `target_type` exists in CHECK list
4. Validate `target_id` exists in the corresponding table:
   - `review` → `votes WHERE id = target_id AND review_text IS NOT NULL`
   - `dish_photo` → `dish_photos WHERE id = target_id`
   - `dish` → `dishes WHERE id = target_id`
   - `restaurant` → `restaurants WHERE id = target_id`
   - `user` → `auth.users WHERE id = target_id`
5. Validate `reason` in enum
6. Enforce: if `reason = 'other'` then `details` non-empty
7. INSERT and return `id`
8. Trigger does the email alert (see § Email alert)

### `block_user(p_blocked_id)`

Returns `{ success: boolean, already_blocked: boolean }`.

Flow:
1. Auth check
2. Validate `p_blocked_id <> auth.uid()` (CHECK constraint also catches it but we want a readable error)
3. INSERT ... ON CONFLICT (blocker_id, blocked_id) DO NOTHING
4. Return whether row was new

### `unblock_user(p_blocked_id)`

Returns `{ success: boolean }`.

Flow:
1. Auth check
2. DELETE FROM user_blocks WHERE blocker_id = auth.uid() AND blocked_id = p_blocked_id

### `get_my_blocked_users()`

Returns list of `{ user_id, display_name, avatar_url, blocked_at }` for the Profile blocked-users settings section. Uses RLS-filtered SELECT against `user_blocks` joined to `profiles`.

---

## Where blocks are filtered

This is the architectural decision Approach A made explicit. Block filtering is applied **only** to surfaces that show identifiable per-user contributions. NOT to aggregate ranking signals.

### Filtered surfaces

| Surface | RPC / file | How |
|---|---|---|
| Review list on dish detail | `get_dish_reviews` (or wherever Dish.jsx pulls reviews) | LEFT JOIN against `user_blocks` for current viewer; exclude rows where viewer has blocked the author |
| Friends feed votes | `get_friends_votes_for_dish`, `get_friends_votes_for_restaurant` | Same join filter |
| Dish photos | `get_dish_photos` | Same |
| Profile follower/following lists | `getFollowCounts` & friends | Filter blocked user IDs out |
| User search results | `searchUsers` (if exists) or `useTasteCompatibility` | Filter blocked user IDs out |

### NOT filtered (deliberate)

| Surface | Why not |
|---|---|
| `get_ranked_dishes` (home, browse, restaurant detail) | Aggregate score is anonymous data — votes count as crowd signal. Adding per-viewer block joins to the hot path is a performance regression and conflates block (personal) with ban (admin). If a user is bad enough to scrub from rankings, ban them. |
| `get_smart_snippet` (best review snippet for a dish) | Same — snippet is curated content, not personal interaction. Edge case: if Dan bans a user, their snippets vanish via existing review-deletion logic. |
| Dish/restaurant aggregate vote counts, average ratings, value scores | Same. |

If a user complains "I blocked X but their dish review is being shown as the snippet" — that's a feature request, not a bug, and we revisit post-launch with anti-brigade considerations.

---

## Frontend surfaces

### `ReportModal` (new shared component)

Location: `src/components/Auth/ReportModal.jsx` (or `src/components/Moderation/ReportModal.jsx` — pick during plan).

Props: `{ isOpen, onClose, target: { type, id, label } }` where `label` is human-readable ("Dan W's review of Beach Plum Burger" or similar).

Form:
- Radio: report reasons (6 options)
- Optional textarea: details (max 500, char counter)
- Submit button → `reportsApi.submitReport(target, reason, details)`
- On success: toast "Thanks, we'll review this"; close modal
- On rate-limit: show readable error
- On validation error: inline form error

### Kebab menu placements

Each surface gets a "⋯" or three-dot icon button. Tap opens a small popover with "Report" (and "Block user" where applicable).

| Surface | What's reportable | What's blockable |
|---|---|---|
| Review card (DishEvidence) | Review | Author |
| Dish photo (gallery item) | Photo | Uploader |
| Dish detail page header | Dish | — |
| Restaurant detail page header | Restaurant | — |
| User profile page | User | User |

Never show "Block self" — guard against `target.author_id === currentUser.id`.

### Profile → Blocked users section

New section in `/profile` (existing page). List of blocked users with display name + avatar + "Unblock" button. Empty state: "You haven't blocked anyone."

---

## API layer

New file: `src/api/reportsApi.js` (or merge into existing — keep single-domain).

```js
export const reportsApi = {
  async submitReport({ targetType, targetId, reason, details }) { ... },
  async blockUser(userId) { ... },
  async unblockUser(userId) { ... },
  async getMyBlockedUsers() { ... },
}
```

All methods follow the established pattern:
- `validateUserContent(details)` for the optional details field (CLAUDE.md §1.9)
- `createClassifiedError` on caught errors
- `logger.error/warn` not `console.*`

Hook: `src/hooks/useBlockedUsers.js` — React Query for the blocked-users list with optimistic update on block/unblock.

---

## Email alert flow

Goal: Dan gets an email when a report comes in. No in-app moderation queue for launch.

Implementation: Postgres trigger on `reports` INSERT that calls a Supabase Edge Function `report-alert`. Edge Function:
- Reads `RESEND_API_KEY` from env
- Sends formatted email to `dan@wghapp.com` (or whatever Dan picks)
- Subject: `[WGH Report] <reason> — <target_type>`
- Body: report id, reporter id, target details, reason, details, link to admin SQL

Failure path: alert send is best-effort. If Resend is down, the report is still in the DB; Dan can find it by SQL query.

Why trigger + Edge Function vs. pg_cron:
- Latency: trigger fires immediately on insert, cron polls
- Simplicity: no cron job to manage

Why not Slack: Resend is already in the stack from B1, no new integration. If Dan wants Slack later, swap the Edge Function body.

---

## Rate limits

Rate limits enforced server-side in the `submit_report` RPC.

| Limit | Value | Why |
|---|---|---|
| Reports per hour | 5 | Prevents harassment-via-mass-reporting of a target |
| Reports per 24h | 20 | Prevents medium-term griefing |
| Block per minute | 10 | Trivially loose; blocks are personal, no abuse vector |

Reads from `reports` table; no separate rate-limit table.

---

## Apple compliance summary

What this design satisfies in Guideline 1.2:

| Apple requirement | Design coverage |
|---|---|
| Method to filter objectionable material | Pre-existing `validateUserContent` blocklist + new `reports` table for community filtering |
| Mechanism to report content | `submit_report` RPC + `ReportModal` component on every UGC surface |
| Mechanism to block users | `block_user` RPC + kebab menu + Profile management |
| Published contact for moderation issues | Update `Privacy.jsx` to add `support@wghapp.com` (or chosen) for moderation-specific contact |
| Acting on reports | Email alert pipeline gives Dan immediate visibility; manual triage via SQL until in-app queue ships post-launch |

Privacy.jsx and Terms.jsx need a moderation section — covered as part of the H3 plan, not separately.

---

## Out of scope (deliberately)

- **Auto-hide content after N reports.** Griefable without anti-brigade logic. Add post-launch with thought.
- **In-app admin moderation queue.** Email + SQL is sufficient for launch volume. Build queue UI post-launch.
- **Block propagation to ranking RPCs.** Conflates block with ban. Add only if real user complaints demand it.
- **Mute (without block).** Twitter has both; we don't need both for v1.
- **Reporting from anonymous (logged-out) users.** Auth-gated. Anonymous abuse is rare for our scale.
- **Bulk admin actions** (mass-resolve, batch-ban). Single-row SQL fine for now.
- **Webhooks / Slack alerts.** Email is the universal medium. Add Slack later if Dan wants.

---

## Testing approach

- **Schema migration:** run in dev Supabase, verify tables exist, RLS enforced, sample inserts work
- **RPC unit tests:** vitest doesn't run Postgres — defer to integration tests via the existing E2E persona tests if there's time, otherwise smoke-test via the UI
- **Frontend tests:** vitest + RTL on `ReportModal` (form validation, submit, error states), `useBlockedUsers` (optimistic update + rollback)
- **Manual smoke:** report flow on a review, block a user, verify they disappear from your feed, unblock, verify they return, verify Dan receives the email alert
- **RLS validation:** add to `supabase/tests/` per existing patterns — confirm a non-admin user cannot SELECT another user's reports

---

## Migration safety

- Pure additive (new tables, new RPCs, new policies). No `-- ROLLBACK:` block needed per CLAUDE.md §1.5.
- Existing RPCs untouched in this PR; block-filter additions to specific RPCs (`get_dish_reviews`, friends-feed RPCs) are CREATE OR REPLACE — naturally reversible.

---

## Implementation sequencing (rough)

The plan doc will detail this. Rough cut:

1. Schema migration + RLS
2. RPCs (submit_report, block_user, unblock_user, get_my_blocked_users)
3. `reportsApi` + `useBlockedUsers`
4. `ReportModal` component
5. Block filter additions to user-content RPCs (one or two)
6. Kebab menus on each surface (parallelizable across surfaces)
7. Profile blocked-users section
8. Edge Function `report-alert` + DB trigger
9. Privacy/Terms moderation copy update
10. Manual smoke + E2E touch-up

Estimated effort: 10-15h. Half schema/backend, half UI surfaces.
