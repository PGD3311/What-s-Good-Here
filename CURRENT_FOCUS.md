# Current Focus

*Dan (or any Claude session starting work) updates this file at session start. Every other Claude session reads it first to avoid collisions.*

**Last updated:** 2026-05-08

---

## Active handoff

**B3-activate paused mid-execution. Dan stepped away to focus.** Apple Dev verification cleared 2026-05-08. Phase A (credential acquisition on developer.apple.com) is **complete**. Phase B (Vault + Supabase config) is **paused at B.1.5** — the encryption master key step. Resume here when Dan returns.

**Resume point:** open Supabase SQL Editor → generate `openssl rand -base64 32` locally → `vault.create_secret(<key>, 'apple_encryption_master_key_v1', '...')` → verify → then move to the 5 Apple secrets (B.1). Detailed steps in `docs/superpowers/specs/2026-05-07-b3-activate-execution-prep.md` §2.B.

**17 days to Memorial Day.** Plan A (ship SIWA) is the path.

**Known parallel session:** another terminal may still be on `fix/codex-hardening-wave-2` (Denis's branch). Don't touch that branch or its files.

---

## Where we are

**Apple Dev:** ✅ cleared 2026-05-08. Welcome email received.

**Phase A — credential acquisition (DONE 2026-05-08):**
- ✅ Team ID captured (in Dan's notes/1Password)
- ✅ App ID `com.whatsgoodhere.app` registered with **Sign In with Apple** + **Associated Domains** capabilities
- ✅ Services ID `com.whatsgoodhere.service` registered + configured (Primary App ID = com.whatsgoodhere.app, domain = wghapp.com, return URL = https://vpioftosgdkyiwvhxewy.supabase.co/auth/v1/callback)
- ✅ Sign in with Apple Key created — Key ID captured, .p8 file stashed in 1Password

**Phase B — B3-activate (IN PROGRESS, paused at B.1.5):**
- ⏳ B.1.5 Encryption master key (`apple_encryption_master_key_v1`) — verified MISSING from Vault (must create before B.1)
- ⏳ B.1 Vault upload — 5 Apple secrets (signing key, team ID, key ID, services ID, bundle ID)
- ⏳ B.2 Supabase Apple provider config (dashboard)
- ⏳ B.3 AASA Team ID replace in `public/.well-known/apple-app-site-association`
- ⏳ B.4 pg_cron `apple-revocation-retry` activation
- ⏳ B.5 Prod env `VITE_FEATURES_APPLE_SIGNIN=true` flip
- ⏳ B.6 Smoke tests (web Apple sign-in, account deletion revocation, cron retry)

**After Phase B → Phase C (B5):** Xcode SIWA capability, Info.plist URL-scheme fallback, PrivacyInfo verify, real-device smoke, TestFlight upload (~6–8h).

**Then:** App Store Connect submission (~30 min, paste from `2026-05-06-app-store-submission-day.md`) → Apple review 1–3 days.

**Realistic submission window:** 2026-05-10 to 2026-05-13. Comfortable buffer for Memorial Day.

**What's done as of 2026-05-07 (the 75%):**
- ✅ All native iOS code shipped + tested in simulator end-to-end
- ✅ Native Google sign-in working (PR #127 + GCP setup + Supabase audience config)
- ✅ Search row-cap bug fixed via pagination (PR #129)
- ✅ App icon (Seal at 1024x1024) shipped (PR #131)
- ✅ Privacy + Terms with operator address shipped (PR #134)
- ✅ Reviewer notes finalized + Codex-reviewed, demo creds embedded (PR #135)
- ✅ Description final shipped (PR #136)
- ✅ Apple Dev wait + contingency plan documented (PR #137)
- ✅ 5 App Store screenshots at 1320×2868 (iPhone 17 Pro Max), visually QA'd, Apple-compliant
- ✅ Demo account live: walshdaniel143+wghdemo@gmail.com / WGH33! (5 ratings + name set)
- ✅ App Store packet Codex-reviewed twice; 13 of 16 findings fixed (PR #140 + #142)
- ✅ Email corrected to canonical wghapp@wghapp.com everywhere (PR #140)
- ✅ Privacy nutrition manifest updated: SearchHistory, UserID, DeviceID, Jitter, OtherDiagnosticData added; PreciseLocation removed (PR #140)
- ✅ Anthropic + Jitter Protocol disclosed in Privacy.jsx third-party services (PR #140)
- ✅ Account-deletion text consistent across UI + Privacy + reviewer notes (PR #142)
- ✅ iPad target dropped — TARGETED_DEVICE_FAMILY = "1" iPhone-only (PR #143)
- ✅ Google killswitch contingency pre-staged (`2026-05-06-google-killswitch-contingency.md`)
- ✅ B3-activate execution prep doc (`2026-05-07-b3-activate-execution-prep.md`)

**What's left (the 25%):**
- ⏳ Dan: complete ID verification with Apple
- ⏳ B3-activate (4–6h, gated on credentials)
- ⏳ B5 — Xcode SIWA capability + real-device smoke + TestFlight (4–7h, gated on B3-activate)
- ⏳ Apple HIG button fix — current SIWA button is hand-drawn SVG; Apple HIG requires their official asset. Should ship before TestFlight upload so the first build Apple reviews is clean.
- ⏳ App Store Connect submission (~30 min, gated on B5)
- ⏳ Apple review (1–3 days)

---

## What's tackleable RIGHT NOW (Apple-independent)

**P0 — do these regardless of ID-verify timing:**
- **Real-device smoke on physical iPhone (Dan, ~30 min)** — free provisioning. Catches device-only bugs invisible to simulator. Pre-stages B5's smoke test.
- **HIG button fix (Claude-driven, 30–60 min)** — drop in `react-apple-signin-auth` for compliant button styling, or integrate Apple's official asset. Auth flow stays on Supabase.

**P1 — quality bumps + risk mitigation:**
- Pre-launch waitlist landing on wghapp.com (~60–90 min) — captures interest while we finish prep
- Sentry alerting policy — 5xx + unhandled-error rules
- Audit + flip seasonal `is_open` flags for restaurants opening Memorial Day
- First 100 users plan (Dan, ~60 min)

**P2 — useful but not launch-blocking:**
- PostHog dashboards
- Launch post drafts (Twitter/Insta/Vineyard Gazette/FB)
- OG image render verification

**Deferred bugs:**
- Post-launch FTS migration (search architecture)
- Signup duplicate-name bug fix

---

## Daily ritual

Until B3-activate ships:
1. Check inbox + developer.apple.com for ID verification status
2. Once ID clears: start B3-activate per `2026-05-07-b3-activate-execution-prep.md`
3. Run major changes through Codex CLI before pushing (`/codex-cli`)

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
- **Always Codex-review before shipping** — even small doc changes (lesson learned 2026-05-07).
- **One active handoff per surface.** Parallel sessions OK if scopes don't overlap; append a second handoff block.
- **Tasks are the canonical to-do.** TaskList is the source of truth for what's pending.
