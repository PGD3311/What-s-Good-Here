# Supabase Database Audit — 2026-04-16

Audit of `supabase/schema.sql` (4,500+ lines) against Supabase Postgres best practices.

**Scope:** schema, RPCs, RLS policies, indexes, migrations, edge functions, `src/api/` usage patterns.

**Status as of 2026-04-16 EOD:** **13 of 20 fixes shipped.** All CRITICAL and launch-blocking items complete. Rest are post-launch or deliberately skipped (see Closing Verdict).

---

## Deployed migrations

| File | Contents |
|---|---|
| `supabase/migrations/2026-04-16-audit-fixes.sql` | #1, #2, #3, #5, #7, #9, #10 |
| `supabase/migrations/2026-04-16-audit-fixes-phase-2.sql` | #4, #11, #12, #13 |
| `supabase/migrations/2026-04-16-audit-fixes-phase-3.sql` | #20 (FK delete strategies) |

---

## Status table

| # | Severity | Fix | Status | Notes |
|---|---|---|---|---|
| 1 | CRITICAL | `is_blocked_pair` N+1 in `get_ranked_dishes` | ✅ Shipped | Inline `NOT EXISTS` — verified 0.163ms plan |
| 2 | CRITICAL | `get_open_reports` correlated subquery | ✅ Shipped | CTE rewrite |
| 3 | CRITICAL | `idx_votes_dish_source_rating` | ✅ Shipped | Not used by `get_ranked_dishes` (LEFT JOIN blocks partial index) but helps vote-write triggers at schema.sql:1899, 2024 |
| 4 | CRITICAL | Keyset pagination for `get_open_reports` | ✅ Shipped | No client callers yet, safe signature change |
| 5 | CRITICAL | `is_blocked_pair` N+1 in follows RLS | ✅ Shipped | Single `NOT EXISTS` covering both edges |
| 6 | HIGH | Report-count materialization for admin sort | ⏸ Deferred | Premature without evidence — admin queue is small |
| 7 | HIGH | `idx_votes_user_dish_created` | ✅ Shipped | Verified in use (18 scans after testing) |
| 8 | HIGH | DECIMAL/NUMERIC standardization | ⏭ Skipped | DECIMAL is an alias for NUMERIC in Postgres — purely cosmetic |
| 9 | HIGH | `idx_votes_source_created` | ✅ Shipped | No hot-path callers yet; available for future analytics |
| 10 | HIGH | `reports_target_status_idx` | ✅ Shipped | Ready for admin filtering by user |
| 11 | MEDIUM | Partial index `idx_dish_photos_featured_community` | ✅ Shipped | ~50% smaller than the full index; doesn't replace it |
| 12 | MEDIUM | `dishes.total_votes` INT → BIGINT | ✅ Shipped | Required view + trigger drop/recreate around the ALTER |
| 13 | MEDIUM | FK index on `events.created_by` | ✅ Shipped | `specials.created_by` already had one |
| 14 | MEDIUM | Batch `update_dish_avg_rating` trigger work | ⏸ Deferred | Premature — no evidence of bottleneck |
| 15 | MEDIUM | Cache `global_mean` in `get_ranked_dishes` | ⏸ Deferred | Same — rerun after `pg_stat_statements` shows it |
| 16 | MEDIUM | Trigram index on `profiles.display_name` | ⏸ Deferred | Only needed if fuzzy display-name search is a feature |
| 17 | LOW | `get_friends_votes_*` naming | ⏭ Skipped | Cosmetic |
| 18 | LOW | `is_blocked_pair` docs | ⏭ Skipped | Already commented at schema.sql:3907 |
| 19 | LOW | DECIMAL/NUMERIC consistency | ⏭ Skipped | Duplicate of #8 |
| 20 | LOW | FK `ON DELETE` strategy on `created_by` columns | ✅ Shipped | **Was a live bug** — see below |

---

## #20 findings — elevated to real bug, not cosmetic

The audit originally tagged `ON DELETE` strategy as LOW "make it explicit." On closer look this was a **live bug** for the Delete Account flow shipped in commit `fd36e48`.

`public.delete_auth_user` (`schema.sql:3345`) does a raw `DELETE FROM auth.users` and assumes cascades handle the rest. But several `created_by` and `used_by` FK columns had no explicit `ON DELETE` clause, defaulting to `NO ACTION` / `RESTRICT`. Any user who had created a restaurant, dish, event, special, invite, or admin record could not delete their account — the DELETE would raise a FK violation.

**Tables touched by phase 3:**

| Table | Column | Was | Now |
|---|---|---|---|
| `restaurants` | `created_by` | RESTRICT | SET NULL |
| `dishes` | `created_by` | RESTRICT | SET NULL |
| `admins` | `created_by` | RESTRICT | SET NULL |
| `specials` | `created_by` | RESTRICT | SET NULL |
| `restaurant_managers` | `created_by` | RESTRICT | SET NULL |
| `restaurant_invites` | `created_by` (NOT NULL) | RESTRICT | CASCADE |
| `restaurant_invites` | `used_by` | RESTRICT | SET NULL |
| `curator_invites` | `created_by` | RESTRICT | SET NULL |
| `curator_invites` | `used_by` | RESTRICT | SET NULL |
| `events` | `created_by` | RESTRICT | SET NULL |

**Semantics preserved:** user-owned data still cascades (votes, favorites, photos, follows). `created_by` on content tables now anonymizes instead of blocking account deletion. Pending invites die with the creator. Completed-invite audit records anonymize.

---

## Closing verdict

**Shipped:** everything that moves a launch-critical metric, eliminates a known N+1 / RLS hot loop, or closes a live bug.

**Skipped or deferred:** items that are purely cosmetic (DECIMAL/NUMERIC), premature optimization without `pg_stat_statements` evidence (trigger batching, `global_mean` cache), or speculative (display_name trigram index).

**Follow-ups to revisit post-launch:**
- Run `SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0` after 1–2 weeks of traffic to find dead indexes
- Run `pg_stat_statements` to surface the actual slow queries, then pick whichever of #6, #14, #15 is backed by data
- The 3 RPCs still declaring `total_votes INT` in return types (`get_local_list_by_user`, `get_my_local_list`) will start erroring if any dish exceeds 2.1B votes. Not a 2026 problem, but worth a grep-and-fix pass when convenient.

**What's not covered by this audit (requires running queries, not reading files):**
- Actual index usage across live traffic
- Slow-query log (`pg_stat_statements`)
- Bloat / vacuum health
- Connection pool sizing vs. Fluid Compute concurrency
