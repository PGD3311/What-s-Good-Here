# WGH Codebase Audit — 2026-05-25

**Auditor:** Claude Opus 4.7 + two specialized agents (security, backend reliability)
**Scope:** Full codebase. Backend = supabase/schema.sql + migrations + edge functions. Frontend = src/. Methodology was parallel agent investigation + manual verification + targeted grep.
**Honest note:** Agent claims were filtered against actual file state — about 30% of the agents' "critical" findings were false positives, surfaced and removed below. Only verified findings are presented.

---

## TL;DR — Where the codebase actually stands

**For a solo-founder + AI-assisted project at this stage, the code is well above average.** Architecture rigor (separation of concerns, single-source-of-truth schema, no anti-patterns in UI data fetching) is genuinely uncommon. Backed by 47 test files (33 unit + 14 E2E Playwright), code-organization discipline, and a CLAUDE.md that documents conventions properly.

**The risk profile is "fast iteration tech debt" — not architectural rot.** Specifically:
1. **One real reliability bomb** (no DB-level rating validation) that should be patched this week.
2. **A pattern of denormalized state maintained by triggers** that has already broken once (follower_count) and would benefit from being designed away.
3. **A small but real security hygiene gap** (tracked .env files).
4. **Tech debt baseline** (538 lint problems, 9 over-400-line files) that's manageable but worth a cleanup pass.

**No findings would block a soft launch to MV locals.** A few should be fixed before any wider Android/national push.

---

## Codebase footprint

| Metric | Count |
|---|---|
| JS/JSX files (frontend) | 272 (~50k lines) |
| TS files (edge functions) | 34 |
| Components | 108 across 11 subdirs |
| Pages | 28 |
| Custom hooks | 41 (32 use React Query, 92 React Query call sites) |
| API modules | 33 |
| Unit test files | 33 |
| E2E Playwright spec files | 14 |
| Top-level Supabase migrations | 102 |
| Edge Functions | 18 |
| schema.sql | 5,668 lines |
| Production JS bundle | 2.1 MB (8.8 MB total dist) |
| Commits last 30 days | 179 |
| Runtime deps | 19 |
| Dev deps | 22 |

---

## Things to be proud of (verified)

These are real and concrete, not flattery:

### 1. Discipline metrics — zero violations across the board
The CLAUDE.md rules aren't just documentation; they hold:

| Rule | Violations |
|---|---|
| No direct `supabase.*` calls from pages/components | **0** |
| No raw `useEffect + fetch` (React Query mandatory) | **0** |
| No direct `console.*` outside `logger.js` | **0** |
| No direct `localStorage.*` outside `lib/storage.js` | **0** |
| No Tailwind color classes (CSS-var-only) | **0** |

For a 50k-line codebase, that's striking. Most teams of 5+ engineers can't maintain that.

### 2. Architectural separation is clean
- `src/api/` is the only place that calls Supabase. 33 modules, one per domain.
- React Query is the canonical state layer — 32 hooks, 92 query/mutation call sites.
- `lib/storage.js` is the only place that touches `localStorage`.
- `utils/logger.js` is the only place that calls `console.*`.
- 108 components in 11 organized subdirs (`Auth/`, `browse/`, `home/`, `jitter/`, `profile/`, `restaurant-admin/`, `restaurants/`, `dish/`, `playlists/`).

### 3. Schema-as-code, properly versioned
- `supabase/schema.sql` is the source of truth (5,668 lines, documented).
- 102 forward migrations under `supabase/migrations/`.
- 41 RLS policies enforcing per-user data scope at the database layer.
- Triggers maintain derived state. Yes, with known fragility — see weaknesses — but the *pattern* of pushing invariants into the DB is correct.

### 4. Defense-in-depth security primitives
- RLS on every user-data table.
- Auth gates checked client-side AND server-side via SECURITY DEFINER RPCs.
- Server-side rate-limit RPCs (`check_vote_rate_limit`, `check_photo_upload_rate_limit`, etc.) on top of client guards.
- Content filtering (`validateUserContent`) at user-input boundaries.
- Vote source weighting (AI estimates 0.5x) baked into ranking aggregations.
- The Jitter Protocol (keystroke biometrics) for trust scoring of reviews — most consumer apps don't do this.

### 5. Test coverage is non-trivial
- 33 unit/component test files (Vitest).
- 14 Playwright E2E spec files across 3 personas (tourist/foodie/manager).
- 637 unit tests passing (per most recent CI log).
- E2E covers homepage, dish detail, voting, favorites, login, profile, social, business portal.

---

## Things to fix (severity-ordered, verified findings only)

### 🟥 P0 — Reliability bomb (fix this week)

**No CHECK constraint on `votes.rating_10`** — schema.sql:97
```sql
rating_10 DECIMAL(3, 1),  -- no CHECK
```
`DECIMAL(3, 1)` accepts values up to ±99.9. An authenticated user can submit `rating_10 = 99.9` or `-50` and corrupt the dish's `consensus_avg`, `avg_rating`, and downstream `user_rating_bias` calculations. The trigger pipeline (`on_vote_insert` → `update_dish_avg_rating` → `check_consensus_after_vote`) trusts the value.

**Why this is P0:** silent data corruption with no visible error. Hostile actor with one account can poison ranking for popular dishes. Fix is a one-line migration:
```sql
ALTER TABLE votes ADD CONSTRAINT rating_10_in_range
  CHECK (rating_10 IS NULL OR (rating_10 >= 1 AND rating_10 <= 10));
```
Plus a matching server-side check in `submit_vote_atomic()` so the error is friendly instead of a constraint-violation error code.

### 🟧 P1 — Fragile patterns (fix this month, before wider launch)

**1. Migration replay-footguns** — `supabase/migrations/{comprehensive_schema_sync,full-schema-sync,denis-sync/step-10-triggers}.sql`

PR #273 (the follower-count fix earlier today) already hardened the *update_follow_counts* function in those files, but the broader pattern remains: large "sync" migration files that redefine many functions with `CREATE OR REPLACE`. Re-applying one is a silent regression vector. Recommended: stop generating new sync files; rely on incremental migrations only. Schema.sql is the source of truth — it doesn't need a "sync from migrations" path.

**2. Denormalized derived state with trigger maintenance** — schema.sql:124, 4204, 332

Columns that mirror what could be a live query:
- `profiles.follower_count` / `following_count` (maintained by `trigger_update_follow_counts`)
- `user_playlists.follower_count`
- `dishes.avg_rating` / `total_votes` / `value_score` / `consensus_*` (chain of triggers)
- `jitter_profiles.consistency_score` (maintained on jitter_samples INSERT)

Every one of these is load-bearing on a trigger that can be silently overwritten by a sync migration, bypassed by service-role inserts, or downgraded by `protect_profile_fields`. The follower_count fix from earlier today started PR1 of a 2-PR plan to eliminate that read-side dependency for follower lists; the broader principle should extend.

**Recommendation:** treat the live query as the source of truth wherever the column read isn't on a hot path. The `dishes.avg_rating` read IS on a hot path (every list query) so leave it; the `profiles.follower_count` read isn't (just a few subtitle locations) so remove the denorm dependency (already in flight). Audit each denorm column with the same test.

**3. Unbounded query parameters** — schema.sql:1106 (`get_ranked_dishes`)
```sql
radius_miles INT DEFAULT 50,  -- no clamp
```
Used at line 1144: `lat_delta DECIMAL := radius_miles / 69.0`. A client passing `radius_miles = 999999` triggers an unbounded geo scan. Apply `LEAST(GREATEST(radius_miles, 1), 500)` clamp. Same pattern in `get_restaurants_within_radius` (line 3085). Worth a sweep across all RPCs that accept LIMIT, radius, array params.

**4. Env files in git** — `.env.development` and `.env.production` are tracked.

Currently they only contain `VITE_FEATURES_APPLE_SIGNIN=true` (benign). But every developer (and every future Claude session) who edits them locally is one `git add .` away from leaking a real secret. Move to `.env*` in `.gitignore` and document required env vars in `.env.example` only.

### 🟨 P2 — Maintenance risks (post-launch hardening)

**1. Lint baseline of 538 problems** (452 errors + 86 warnings)

CI on `main` is currently red and we've been admin-merging through it. The top error categories:
- 124× `no-empty` (empty blocks)
- 94× `no-undef` (mostly globals declared via build-time replacement that lint can't see)
- 47× `no-prototype-builtins`
- 42× `no-unused-vars`
- 19× `no-fallthrough`

Many of the 94 `no-undef` are likely false positives from ESLint not knowing about Vite-injected globals. But 124 empty blocks + 19 fallthroughs are real signal. A targeted cleanup PR could probably drop this to <50 problems.

**2. Heavy files** (`> 400` lines, per CLAUDE.md threshold)

| File | Lines |
|---|---|
| `src/pages/Admin.jsx` | 1,050 |
| `src/pages/UserProfile.jsx` | 1,024 |
| `src/pages/RestaurantDetail.jsx` | 844 |
| `src/components/restaurants/RestaurantMap.jsx` | 839 |
| `src/pages/Login.jsx` | 678 |
| `src/pages/Profile.jsx` | 623 |
| `src/pages/Dish.jsx` | 598 |
| `src/pages/MyList.jsx` | 594 |
| `src/components/AddRestaurantModal.jsx` | 566 |

Admin.jsx and UserProfile.jsx are the most worth splitting. Page-level orchestration is OK to be long; what's heavy is in-line component definitions that should be extracted.

**3. No TypeScript on the frontend**

34 TS files exist (edge functions) but `src/` is pure JavaScript. At 50k lines, runtime type errors are a real risk. Migration would be substantial (weeks, not days) but progressively achievable — Vite supports mixed JS/TS and Vitest reads both. Suggest deferring until post-MV launch but flagging as a strategic debt item.

**4. CI is red on main**

Per `gh run list --branch main` the last three runs all failed at `npm run test -- --run` because `VITE_SUPABASE_URL` isn't set in the CI environment. Single test file (`src/hooks/useDishDetail.test.js`) imports the supabase client at module-eval time, which errors out without env. Fix is either to set the env var in CI (already in vercel's preview deploy) or to mock `lib/supabase` for that test. ~30 minutes of work. Worth fixing soon — admin-merging through red CI hides real regressions.

### 🟩 Observations (lower priority)

- **Reports table has no per-user rate limit on `submit_report` RPC** (schema.sql:5019). Easy to spam the moderation queue. Add a "max 1 report per (reporter_id, reported_id, reported_type) per 24h" check inside the RPC.
- **Photo EXIF stripping not verified** in `supabase/functions/photo-moderate/`. Worth verifying the function strips GPS/timestamp metadata before storing the photo URL. Avatar uploads do strip via `resizeToSquareJpeg()`; dish photos go through a different path.
- **`menu-refresh` timeout behavior** — memory mentions a prior infinite-loop bug that was fixed in PRs #232 + #236 + #241. Pattern (extractor fingerprint + Path A vs Path B) is sound but the agent flagged that fetch calls inside `menu-refresh` may not have explicit timeouts. Worth a focused read of that function before relying on it at scale.
- **Trigger naming inconsistency** — some are `trigger_X`, some are `X_trigger`, some are bare verbs. Stylistic only; not a correctness issue.

---

## What the security audit explicitly did NOT find

It's worth being explicit about what's *not* a problem (because the agent claimed they were and I verified otherwise):

- ❌ **No OpenAI API key or DB password committed to git.** Agent saw your local `.env` (which is gitignored) and incorrectly reported it as committed. Git history confirms `.env` was never committed.
- ❌ **No "missing INSERT policy" bug on reports / user_blocks tables.** Those tables write via SECURITY DEFINER RPCs (`submit_report`, `block_user`, `unblock_user`) by design — that's the standard Supabase pattern for moderation operations and it's correct.
- ❌ **No JS files with TypeScript hidden in them**, no committed secrets, no obvious SSRF in edge functions sampled.
- ❌ **No vote-table data leak**, no orphaned auth flows, no obvious privilege escalation in the SECURITY DEFINER RPCs sampled.

---

## Recommended schedule

**Today / this week:**
1. Add the `CHECK (rating_10 BETWEEN 1 AND 10)` constraint + validation in `submit_vote_atomic()`. Migration + matching app-layer error message. ~30 minutes.
2. Gitignore `.env.development` and `.env.production`; move any non-secret defaults into `.env.example`. ~10 minutes.
3. Fix CI's `useDishDetail.test.js` failure (mock supabase or stub env). ~30 minutes.

**This month (before any push beyond MV):**
4. PR2 of the follower_count plan — drop the column, the trigger, the bypass flag, and the sync-migration redefinitions. Already planned. ~half a day.
5. Add LIMIT / radius clamps to `get_ranked_dishes` and similar RPCs. ~1 hour.
6. Lint cleanup pass — focus on `no-empty` and `no-fallthrough` (real bugs hide here). ~half a day.
7. Verify EXIF stripping in `photo-moderate` edge function. ~1 hour.
8. Split Admin.jsx and UserProfile.jsx into sub-components. ~half a day each.

**Before any national / Android / VC-grade public scale:**
9. Hire a senior dev for a focused 2-4 day audit. ~$1.5–5k. Focus on: RLS coverage in edge cases, rate-limiting at the load-balancer layer, observability, backup/restore verification.
10. Plan a JS → TS migration (not a one-shot — gradual conversion of new code first, then high-traffic files).
11. Consider moving denormalized derived state to materialized views (refreshed on schedule) instead of trigger-maintained columns. Eliminates the entire class of "trigger gets bypassed" bugs.

---

## Bottom line

The code is solid enough to soft-launch to MV. There's one P0 to patch this week (the rating CHECK constraint), a small set of P1 hardening tasks before wider promotion, and an honest tech-debt baseline that's manageable but real. The architecture's bones are good — the failure modes are the ones you'd expect from fast iteration, not from structural mistakes.

If a senior engineer joined the team tomorrow, they'd be impressed by the discipline (the zero-violation metrics above are real), and they'd push back on the same fragility patterns this audit flagged. Both reactions would be correct.

— end audit
