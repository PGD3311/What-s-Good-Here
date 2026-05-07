# Current Focus

*Dan (or any Claude session starting work) updates this file at session start. Every other Claude session reads it first to avoid collisions.*

**Last updated:** 2026-05-07

---

## Active handoff

**Dan + Claude session active — Apple Dev verification finally moving.** Dan got Apple support on the phone today (after the email + phone-escalation push). Case 102886008678 is now in **ID verification phase** — no longer a black-box wait. Once Dan completes whatever ID verification Apple requests, enrollment clears and the SIWA pipeline unblocks.

**18 days to Memorial Day.** The 5/11 PWA-contingency wall is still 4 days away. ID verification typically resolves in hours, not days, once Apple is engaged. Plan A (ship SIWA properly) is now the likely path.

**Known parallel session:** another terminal may still be on `fix/codex-hardening-wave-2` (Denis's branch). Don't touch that branch or its files.

---

## Where we are

**Apple Dev:** ID verification step pending. Dan to complete whatever Apple asks for (typically: government ID photo).

**The path forward when ID clears (~hours):**
1. Get Apple credentials: Team ID, Services ID, .p8 SIWA Key (see `2026-05-07-b3-activate-execution-prep.md` for step-by-step)
2. B3-activate (~4–6h): Vault upload, Supabase provider config, AASA Team ID replace, pg_cron activation, prod flag flip
3. B5 (~4–7h): Xcode SIWA capability, real-device smoke, TestFlight upload
4. App Store Connect submission (~30 min): paste from `2026-05-06-app-store-submission-day.md`
5. Apple review (1–3 days, possibly + rejection cycle)

**Realistic submission window:** 2026-05-09 to 2026-05-13 if ID verification clears today/tomorrow. Comfortable buffer for Memorial Day.

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
