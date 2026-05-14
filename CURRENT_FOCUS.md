# Current Focus

*Dan (or any Claude session starting work) updates this file at session start. Every other Claude session reads it first to avoid collisions.*

**Last updated:** 2026-05-14

---

## Active handoff

**Phase C is the bottleneck. 11 days to Memorial Day. Code is done — only Xcode + device mechanics remain.**

Confirmed 2026-05-14 via clean cherry-pick attempt: **everything that needed to ship from `feat/ios-siwa-capability` is already on main.** `App.entitlements` has `com.apple.developer.applesignin`, `nativeAuth.js` reads `result.idToken` (the Capgo field-name fix), and `apple.ts` has `APPLE_FETCH_TIMEOUT_MS = 15_000`. The `feat/ios-siwa-capability` branch is stale and can be abandoned — its useful commits already landed via other PRs, and the brand/UI commits are superseded by #159–#161.

**What's left is purely mechanical:** real-device smoke → Xcode archive → TestFlight upload → TestFlight smoke → ASC paste → Submit. ~3–4 hours of human time, then the clock is Apple's.

**Known parallel sessions:** `fix/codex-hardening-wave-2` (Denis's branch) — don't touch. CURRENT_FOCUS.md itself may be edited from another terminal — keep edits surgical.

---

## Where we are

**SIWA infrastructure: production-live (as of 2026-05-08).** Web Apple Sign-In tested end-to-end. Cron worker (`apple-revocation-retry`) verified under synthetic failure. Apple Dev verification **CLEARED 2026-05-13**.

**Heavy shipping 2026-05-12 → 2026-05-14:** PR #157 (SIWA capability + new app icon + iOS safe-area double-padding fix + Capgo Apple plugin field-name fix + Apple endpoint 15s timeouts + homepage polish), PRs #158/#159/#160/#161 (brand iteration including the PR #161 PNG-bake-wgh fix for iOS WebKit ignoring `font-optical-sizing`), PR #162 (surface user's own review on public dish page), PR #163 (ASC paperwork: description in Dan's voice + 4 of 5 screenshots at 1290×2796 + Codex-reviewed on-device smoke runbook), plus account-deletion fixes (`e328a8e` Apple identity lookup via Auth Admin API, `f037382` silent-500 logging, `99945ec` dish-modal prompt suppression, `e6e8e82` reset-password URL parsing).

**Real-device smoke (2026-05-14):** Dan walking `2026-05-13-onDevice-smoke-runbook.md`. Sections A (cold launch + anon browse) and B (auth — email, Apple first-time, Apple returning, Google) are GREEN. Sections C (authenticated actions on demo account), D (account deletion on Apple-relay user — Apple 5.1.1(v) gate), and E (regression checks) still to run.

**What's left to launch:**

1. **Phase C — Real Device + TestFlight (~2.5h focused, mechanical)**
   - Real-device smoke matrix on physical iPhone — see `docs/superpowers/specs/2026-05-07-b3-activate-execution-prep.md` §C.4 (all sign-in paths, account deletion, photo upload, universal links from email). Verify `PrivacyInfo.xcprivacy` is in the App group in Xcode before archiving.
   - Archive in Xcode → upload to TestFlight (~10–30 min processing)
   - Install via TestFlight on iPhone, run smoke matrix again

2. **App Store Connect submission (~30 min)** — open `docs/superpowers/specs/2026-05-06-app-store-submission-day.md`, walk top-to-bottom. All fields paste-ready. One TODO still flagged:
   - Real phone number in App Review Information (placeholder in doc)

3. **Apple review (1–3 days, possibly + 1 rejection cycle)** — rejection playbook in submission-day doc §10.

**Submission target: TODAY (2026-05-14).** Already one day past the original 5/13 ideal. Every day past today eats further into the one-rejection-cycle buffer before Memorial Day (5/25).

**Dropped from Phase C — do not reintroduce:** the `whatsgoodhere://` custom URL scheme branch was deleted 2026-05-12 (PR #154 closed). Codex review showed the implementation was dead weight (no producer, parser rejects the format, custom schemes have the same failure modes as universal links in third-party iOS email clients). The proper unified fix lives in [issue #156](https://github.com/PGD3311/What-s-Good-Here/issues/156) as a post-launch refactor (standardize email auth on `verifyOtp` + `token_hash` across web and native, retire the `exchangeCodeForSession` callback pipeline). **Do not block Phase C on this.**

---

## Recent shipped work (through 2026-05-08) — the 95%

### Phase A — Credential acquisition ✅
- App ID `com.whatsgoodhere.app` registered with Sign In with Apple + Associated Domains capabilities
- Services ID `com.whatsgoodhere.service` registered + configured (Primary App ID + return URL)
- SIWA Key v1 (JXT4ZZQW67) created — REVOKED later same day after .p8 chat exposure
- SIWA Key v2 (9LL6V25287) created — CURRENT, in 1Password
- Team ID K447QTHBR9 captured

### Phase B — B3-activate ✅
- 6 Apple secrets in Vault: `apple_signing_key_v1`, `apple_team_id`, `apple_key_id_v1`, `apple_services_id`, `apple_bundle_id`, `apple_encryption_master_key_v1`
- Supabase Apple provider configured (Services-ID-first, JWT in Secret Key)
- AASA Team ID replaced (PR #149) — `K447QTHBR9.com.whatsgoodhere.app` live at `wghapp.com/.well-known/apple-app-site-association`
- 3 Apple Edge Functions deployed: `apple-token-exchange`, `apple-revocation-retry`, `apple-token-persist`
- 3 underlying migrations applied: `user_apple_tokens`, `pending_apple_revocations`, `lease_apple_revocations` function
- pg_cron `apple-revocation-retry` scheduled every 15 min (jobid 28, using `cron_secret` from Vault)
- `VITE_FEATURES_APPLE_SIGNIN=true` in Vercel Production + Preview
- Web Apple Sign-In tested end-to-end on prod ✅

### Track A — Root fixes (PR #151) ✅
- `apple-revocation-retry` auth switched from `SUPABASE_SERVICE_ROLE_KEY` (Supabase silently swapping legacy JWT ↔ sb_secret_*) to `CRON_SECRET` (project-set, stable, matches menu-refresh + scraper-dispatcher)
- `verify_jwt = false` added in `supabase/config.toml` for `apple-revocation-retry`
- `.env.production` `VITE_FEATURES_APPLE_SIGNIN` flipped false → true (otherwise iOS Capacitor build bakes SIWA off in binary)
- Defensive 500s for missing env vars
- Plan B doc + B3-activate prep doc corrected: Services-ID-first ordering + cron pattern + Secret Key field guidance
- Test file (`apple-revocation-retry/index.test.ts`) updated to match new auth contract
- Codex audit applied 2x (11 findings → 9 fixes, 9 findings → 9 fixes)

### Track B — .p8 rotation (PR #152) ✅
- Old key v1 (JXT4ZZQW67) revoked at Apple — leaked .p8 from chat is now functionally inert
- New key v2 (9LL6V25287) created, .p8 in 1Password
- Vault re-uploaded with new .p8 (clean, 257 chars, no whitespace artifact)
- Vault `apple_key_id_v1` updated to new Key ID
- Fresh JWT generated, pasted into Supabase Apple provider Secret Key field
- `scripts/generate-apple-client-secret.mjs` `KEY_ID` constant updated

### Track C — Compliance smoke verification ✅ (with C.1 deferred)
- C.1 Web sign-in `user_apple_tokens` row capture — DEFERRED (Apple consent caching too sticky to reproduce first-time flow today; will retry post-cache-clear OR via native iOS path in Phase C)
- **C.2 Cron worker end-to-end ✅** — seeded synthetic pending row, manually invoked cron, verified: function reaches decryption, handles failure gracefully, increments attempts (0→1), schedules backoff (~16 min for attempts=1), releases lease, doesn't dead-letter prematurely
- C.3 Inline revocation flow — DEFERRED to Phase C real-device (needs Apple-signed-in user with token)

### PR #157 (2026-05-12) — feat(ios): SIWA + new app icon + iOS layout polish ✅
- `com.apple.developer.applesignin` entitlement; `DEVELOPMENT_TEAM = K447QTHBR9`; `PrivacyInfo.xcprivacy` re-registered with fresh fileRef UUIDs
- New WGH app icon (coral plate, italic wgh, star at 10 o'clock) across iOS launcher 1024, apple-touch-icon 180, favicon 64+SVG, iOS splash 2732×2732, og-image 1200×630
- `Seal.jsx` `variant` prop (`monogram` | `seal` | `icon`) — defaults backward-compat
- **iOS safe-area double-padding fix:** Capacitor `contentInset: 'always' → 'never'` + body-level CSS `env(safe-area-inset-top)` + Layout negative-margin (Codex-confirmed). Killed the huge empty coral band over the Seal + giant grey void over the homepage wordmark.
- Homepage rhythm tightened (search → chalkboards → Locals' Picks)
- Locals' Picks banner mark swapped from red ink-stamp to new coral app-icon mark
- Capgo Apple plugin field-name fix: `result.idToken` + `result.profile?.user` (was failing real-device with "Missing identityToken")
- Apple endpoint fetches get 15s AbortController timeout — fixes account-deletion silent 500
- Stale test fix: `signInWithGoogle` test aligned with PR #127's `access_token` drop

### Brand iteration + native fixes (2026-05-13) ✅
- **PR #158** — new wgh app icon — wide-rim plate
- **PR #159** — roll out new wgh plate icon across the app
- **PR #160** — force Fraunces display opsz at every size
- **PR #161** — bake wgh as PNG to defeat iOS WebKit ignoring `font-optical-sizing` (real-device finding; the mark was rendering distorted on iOS only)
- **PR #162** — surface user's own review on public Dish page
- `99945ec` — suppress 'rate now?' prompt when already rated this session
- `e6e8e82` — `parseAuthUrl` now recognizes `/reset-password` redirect paths
- `e328a8e` — delete-account uses Auth Admin API for Apple identity lookup
- `f037382` — log silent 500 paths in delete-account for diagnostics

### PR #163 (2026-05-13) — docs: App Store submission prep ✅
- `2026-05-13-app-store-description.md` — ~1,720 char description in Dan's voice for ASC's Description field
- `2026-05-13-screenshots/` — 4 of 5 ASC screenshots at exact 6.7" iPhone Pro Max spec (1290×2796), captured via Playwright with mobile emulation. Missing `04-profile-journal.png` — requires auth, Dan to AirDrop from device
- `2026-05-13-onDevice-smoke-runbook.md` — tap-by-tap smoke test for real-device pre-TestFlight, with explicit pass criteria tied to specific commits. Codex-reviewed (gpt-5.3-codex high effort): 5 additions, 2 corrections applied, 1 push-back on re-introducing custom URL scheme

---

## Daily ritual

Until App Store launch:
1. Check inbox for ASC notifications + `wghapp@wghapp.com` for reviewer follow-ups
2. If in active execution session, follow `docs/superpowers/specs/2026-05-07-b3-activate-execution-prep.md` for Phase C
3. Run major changes through Codex CLI before pushing (`/codex-cli`) — lesson learned 2026-05-07 + 2026-05-08

---

## Reference docs (all paste-ready)

| Topic | File |
|---|---|
| **Smoke runbook (use for real-device work — STARTS HERE)** | `docs/superpowers/specs/2026-05-13-onDevice-smoke-runbook.md` |
| **ASC description draft (Dan's voice)** | `docs/superpowers/specs/2026-05-13-app-store-description.md` |
| **ASC screenshots (4 of 5)** | `docs/superpowers/specs/2026-05-13-screenshots/` |
| Phase C execution playbook (Archive → TestFlight) | `docs/superpowers/specs/2026-05-07-b3-activate-execution-prep.md` §C.5–C.6 |
| ASC submission paste guide | `docs/superpowers/specs/2026-05-06-app-store-submission-day.md` |
| Reviewer notes copy | `docs/superpowers/specs/2026-05-03-app-store-reviewer-notes.md` |
| Description copy (earlier draft, superseded by `2026-05-13-app-store-description.md`) | `docs/superpowers/specs/2026-05-04-app-store-description-final.md` |
| Privacy nutrition labels | `docs/app-store-connect-privacy-details.md` |
| Age rating answers | `docs/superpowers/specs/2026-05-06-app-store-age-rating.md` |
| What's New v1.0 copy | `docs/superpowers/specs/2026-05-06-app-store-whats-new.md` |
| Google killswitch contingency | `docs/superpowers/specs/2026-05-06-google-killswitch-contingency.md` (NOT NEEDED — Plan A live) |
| JWT generator script | `scripts/generate-apple-client-secret.mjs` (KEY_ID = 9LL6V25287) |

---

## Not this session — recommended Memorial Day cuts (2026-05-12)

These were in scope earlier but at T-13 days the smart call is to ship without them. Land App Store first, ship these on the v1.1 follow-up.

- **Ask WGH** — was P1 in memory, but a conversational AI feature 13 days out is risk theater. Prompt tuning needs real user data to calibrate against. Ship post-launch when there's volume. Beli doesn't have this either, so it's a moat *expansion*, not a launch wedge.
- **Jitter WAR v2** — trust scoring without real review volume to calibrate against is theater. Wait for users.
- **Browser E2E test realignment** — 6 of 13 browser-chromium specs need per-spec UI realignment (see LAUNCH-READINESS line 42). PR-sized, but not launch-critical. Fix in the first week post-launch unless a regression surfaces.
- **`whatsgoodhere://` URL scheme rework** — parked in [issue #156](https://github.com/PGD3311/What-s-Good-Here/issues/156) as a post-launch unified `verifyOtp` refactor. Do not start before Memorial Day.
- **Anything that touches `fix/codex-hardening-wave-2`** — Denis's branch, other terminal's scope.

Pre-existing post-launch backlog (unchanged): scoring history, FriendsFeed, TastePersonalityCard, Specials/events/hub (Launch 2.0+).

---

## Protocol

- **Update BEFORE touching files.** If you skip the update, you are the collision.
- **Read the active handoff block.** If another session is on a surface you want to touch, STOP and ask.
- **If `Last updated` is >24h old, treat the file as stale** — ask Dan what's current.
- **Always Codex-review before shipping** — especially after Phase C work touches Xcode/native iOS where bugs are device-specific.
- **One active handoff per surface.** Parallel sessions OK if scopes don't overlap; append a second handoff block.
- **Tasks are the canonical to-do.** TaskList is the source of truth for what's pending.
