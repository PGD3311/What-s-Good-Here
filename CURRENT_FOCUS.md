# Current Focus

*Dan (or any Claude session starting work) updates this file at session start. Every other Claude session reads it first to avoid collisions.*

**Last updated:** 2026-06-10

---

## Active handoff

**Menu X-Ray session (Dan, 2026-06-10, branch `feat/menu-xray`) — building the hero feature:** scan a physical menu → Claude vision extracts → pg_trgm match → rating chips → quiet menu ingest. Spec: `docs/superpowers/specs/2026-06-10-menu-xray-design.md` · Plan: `docs/superpowers/plans/2026-06-10-menu-xray.md`. Validation spike PASSED 7/7 on real menu photos. **Claimed surfaces:** `supabase/functions/menu-xray/` (new), `src/components/scan/` (new), `src/pages/ScanMenu.jsx` (new), `src/utils/verdict.js`, `src/api/menuScanApi.js`, `src/hooks/useMenuScan.js`, `src/App.jsx` (/scan route), `src/pages/RestaurantDetail.jsx` (header button), `supabase/schema.sql` (appending menu_scans table + 4 RPCs). Reads menu-refresh code but NEVER edits it.

**Parallel session active (2026-06-09):** `feat/menu-url-reachability` — menu-refresh URL-reachability fix (Gap 7), design doc committed (`5b5d9c5`). Don't touch menu-refresh surfaces without checking.

Also live: `build/v2.2-build1` is origin/main + one local iOS build commit (`0a44e33`), pending Dan's Xcode archive + submit.

Where we are: **v1.0 shipped 5/15. v1.9 (build 5) shipped 5/31. v2.0 submitted 6/2** (rate-first UI + curator onboarding + add-dish discoverability). **v2.2 (build 1) cut 6/9** — profile redesign + locals tap-target/profile-link fixes (PRs #314–#316). Web users always current via Vercel; iOS lags by one submission cycle (Capacitor bundles `dist`, no `server.url` — frontend changes need a build, backend changes go live instantly).

The bar is still **care, not features** — every menu real, every restaurant open, every locals' list trustworthy.

---

## Next up (in order)

1. **#184 — mint-link signup redirect bug (Denis, 6/2, unanswered).** VERIFIED STILL BROKEN as of 6/9. PR #265 fixed the same-browser email-verification path only; the cross-device PKCE branch drops the destination: `AuthCallback.jsx:50-53` discards `safeNext` when the code verifier is missing (the normal mobile case — sign up in native app/in-app browser, open email in Safari), and `CrossDevicePkce.jsx:22` calls `signInWithMagicLink(email)` without the redirect arg it already supports. Fix: thread `safeNext` → cross-device state → `signInWithMagicLink(email, next)` → carry `?next` through the magic-link callback. **Two feature asks gated behind it:** shareable area-Top-10 mint link + "sign up & make your Top 10" link.
2. **#181 — review Share to Instagram (PR #298, open since 6/2).** Denis needs Dan for (a) eyeballing the 1080×1080 canvas share card (`npm run dev` → playlist → share) and (b) Xcode rebuild + real-iPhone test (new `@capacitor/filesystem` dep). Not in the v2.2 build; could ride the next one.
3. **Shareable Local Lists plan** — `docs/superpowers/plans/2026-05-27-shareable-local-lists.md` (untracked, never committed or executed). 8-task plan: clone-to-playlist RPC + Share/Save buttons on `/locals/:userId` + OG preview. Overlaps heavily with #184's feature asks — reconcile with Denis's version before building.
4. **T42 data-quality sweep** (see `TASKS.md`) — #3 stale menus IN PROGRESS (pipeline works, cron rolling); #1 closed restaurants, #2 seasonal-not-open, #4 garbage dishes, #5 list hygiene NOT STARTED.

---

## Waiting on Denis (nudges sent, no replies)

- **#174 / #180** — Jitter strategy reframe (liveness + App Attest) + iOS-keystroke-dead bug. Silent since 6/1. No more jitter work ships until he responds.
- **#182** — CHECK-constraint-on-mutable-rows pattern still on `restaurants.name`, `profiles.display_name`, `votes.review_text` — his call.
- **#185** — QR codes handoff (6/9, `marketing/qr-codes/`, pointing at wghapp.com).

Hotline housekeeping: #175/#176/#183 + ~15 FYI threads (#155–#171) are resolved but never closed. Unexpected third account (TerFree70) commented on #171 on 5/28 — glance at it.

---

## Known issues / debt

- **Browser E2E broken on main** — geolocation permission not granted in `playwright.config.js`; `[data-dish-id]` never visible. ~30min fix, affects all homepage-touching specs.
- **Menu-refresh Path A vs Path B consolidation** — post-launch P0 per Codex (Path B: dumber extractor, no locking).
- **Issue #156** — unify email auth on `verifyOtp` + `token_hash`, retire `exchangeCodeForSession` (related surface to the #184 fix — don't let them collide).
- **DEVLOG.md** — no entry since 2/25; either backfill or stop pretending it's current.
- Untracked `deno.lock` in the working tree (from Deno CI work) — commit or ignore.

---

## Daily ritual

1. Check inbox for App Store / TestFlight notifications, `wghapp@wghapp.com` for user reports
2. Check Sentry for unexpected error spikes
3. Check Agent Phone (`gh issue list --repo Denisgingras75/wgh-phone --state open --label "📨 for-dan"`)
4. Run major changes through Codex CLI before pushing (`/codex-cli`), one fix at a time

---

## Reference docs

| Topic | File |
|---|---|
| Post-launch data quality sweep | `TASKS.md` → T42 |
| Shareable local lists plan (unexecuted) | `docs/superpowers/plans/2026-05-27-shareable-local-lists.md` |
| Share to Instagram design/plan | `docs/superpowers/specs/2026-06-01-share-to-instagram-design.md` (in PR #298) |
| Launch readiness checklist (historical) | `LAUNCH-READINESS.md` |
| JWT generator script (Apple) | `scripts/generate-apple-client-secret.mjs` (KEY_ID = 9LL6V25287, expires 2026-11-04) |

---

## Protocol

- **Update BEFORE touching files.** If you skip the update, you are the collision.
- **Read the active handoff block.** If another session is on a surface you want to touch, STOP and ask.
- **If `Last updated` is >24h old, treat the file as stale** — ask Dan what's current.
- **Always Codex-review before shipping** — `/codex-cli` per fix, not batched.
- **One active handoff per surface.** Parallel sessions OK if scopes don't overlap; append a second handoff block.
- **Tasks are the canonical to-do.** T42 in `TASKS.md` is the source of truth for data-quality work.
