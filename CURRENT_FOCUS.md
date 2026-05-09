# Current Focus

*Dan (or any Claude session starting work) updates this file at session start. Every other Claude session reads it first to avoid collisions.*

**Last updated:** 2026-05-08 (end-of-day)

---

## Active handoff

**Phase B + root-fix Tracks A & B + Track C verification all DONE today.** Apple Dev cleared this morning. By end of day: web Apple Sign-In working in prod, all SIWA infrastructure live, .p8 leaked-then-rotated, cron worker verified end-to-end. **Next session is Phase C — Xcode + real device + TestFlight + ASC submission.**

**17 days to Memorial Day.** ~1 focused day of execution + Apple's review clock = submittable + approved well before launch window.

**Known parallel session:** `fix/codex-hardening-wave-2` (Denis's branch). Don't touch that branch or its files.

---

## Where we are

**SIWA infrastructure: production-live.** Web Apple Sign-In tested end-to-end today (sign-in, lands signed in, brand wordmark with name, journal feed loads). Cron worker (`apple-revocation-retry`) manually invoked → 200 OK. Synthetic pending-revocation row seeded → cron drained, attempts incremented, backoff scheduled, lease released, dead-letter correctly NOT set. Worker is wired correctly under failure.

**What's left to launch:**

1. **Phase C — Xcode + Real Device + TestFlight (~7–9h focused)**
   - Add Sign in with Apple capability in Xcode → Signing & Capabilities (1 click)
   - Add `whatsgoodhere` custom URL scheme to `ios/App/App/Info.plist` (Codex flagged this — fallback when universal links fail)
   - Verify `PrivacyInfo.xcprivacy` not reverted by Xcode capability add
   - Real-device smoke matrix on physical iPhone — see `docs/superpowers/specs/2026-05-07-b3-activate-execution-prep.md` §C.4 (test all sign-in paths, account deletion, photo upload, universal links from email)
   - Archive in Xcode → upload to TestFlight (~10–30 min processing)
   - Install via TestFlight on iPhone, run smoke matrix again

2. **App Store Connect submission (~30 min)** — open `docs/superpowers/specs/2026-05-06-app-store-submission-day.md`, walk top-to-bottom. All fields paste-ready. Two TODOs flagged in the doc:
   - Real phone number in App Review Information (placeholder still in doc)
   - Demo-account already softened in reviewer notes — no enrichment needed unless Dan wants

3. **Apple review (1–3 days, possibly + 1 rejection cycle)** — rejection playbook in submission-day doc §10.

**Realistic submission window:** 2026-05-10 to 2026-05-13. Approval target: 2026-05-11 to 2026-05-16.

---

## Today's accomplishments (2026-05-08) — the 95%

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
| Phase C execution playbook | `docs/superpowers/specs/2026-05-07-b3-activate-execution-prep.md` |
| ASC submission paste guide | `docs/superpowers/specs/2026-05-06-app-store-submission-day.md` |
| Reviewer notes copy | `docs/superpowers/specs/2026-05-03-app-store-reviewer-notes.md` |
| Description copy | `docs/superpowers/specs/2026-05-04-app-store-description-final.md` |
| Privacy nutrition labels | `docs/app-store-connect-privacy-details.md` |
| Age rating answers | `docs/superpowers/specs/2026-05-06-app-store-age-rating.md` |
| What's New v1.0 copy | `docs/superpowers/specs/2026-05-06-app-store-whats-new.md` |
| Google killswitch contingency | `docs/superpowers/specs/2026-05-06-google-killswitch-contingency.md` (NOT NEEDED — Plan A live) |
| JWT generator script | `scripts/generate-apple-client-secret.mjs` (KEY_ID = 9LL6V25287) |

---

## Not this session

- Post-launch features: scoring history, Ask WGH, FriendsFeed, TastePersonalityCard
- Specials/events/hub (Launch 2.0+ per memory)
- Anything that touches `fix/codex-hardening-wave-2` (other terminal's scope)

---

## Protocol

- **Update BEFORE touching files.** If you skip the update, you are the collision.
- **Read the active handoff block.** If another session is on a surface you want to touch, STOP and ask.
- **If `Last updated` is >24h old, treat the file as stale** — ask Dan what's current.
- **Always Codex-review before shipping** — especially after Phase C work touches Xcode/native iOS where bugs are device-specific.
- **One active handoff per surface.** Parallel sessions OK if scopes don't overlap; append a second handoff block.
- **Tasks are the canonical to-do.** TaskList is the source of truth for what's pending.
