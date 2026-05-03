# Current Focus

*Dan (or any Claude session starting work) updates this file at session start. Every other Claude session reads it first to avoid collisions.*

**Last updated:** 2026-05-03 (afternoon)

---

## Active handoff

**Dan + Claude session active — App Store crunch.** 22 days to Memorial Day, Apple call tomorrow.

**Just shipped (2026-05-03):**
- ✅ **PR #122 admin-merged** — iOS camera/photo permission strings + PrivacyInfo.xcprivacy in main at `2e46e47`. **Pending Dan: drag `PrivacyInfo.xcprivacy` into Xcode App group on next Xcode open** (without this, file is in repo but not bundled).

**Still open:**
- **#117** — `refactor(auth): pass returnPath intent, not OAuth callback URLs` — held; refactor not launch-blocking, hold for post-launch.

---

## Where we are

**App Store final push — see `docs/superpowers/plans/2026-04-27-app-store-final-push.md`.**

**Plan B (OAuth + Apple revocation):** 4 of 6 PRs merged.
- ✅ B1 (PR #79), B2 (#85), B3-code (#99), B4 (#106)
- ⏳ B3-activate, B5 — both gated on Apple Dev verification

**Tonight's progress (2026-04-27):**
- ✅ **PR #117 — `refactor(auth): pass returnPath intent, not OAuth callback URLs`.** Root fix for the wrong-layer abstraction in Login/LoginModal that was building `capacitor://localhost/...` redirect URLs on native. Codex-reviewed. 445/445 tests pass. Branched from clean `origin/main` to avoid the brand-refresh session. Worktree at `/tmp/wgh-auth-fix` until merge.
- Apple Dev enrollment **submitted** but no response yet — Dan checking inbox + portal status.

---

## What Dan needs to do (not blocked by anything)

These move in parallel with Apple Dev verification. Knock them off whenever:

- [ ] **Apple Dev portal status check** — confirm "Pending Review" vs "Action Required". Search inbox for `from:apple.com developer`.
- [ ] **Provision `VITE_GOOGLE_IOS_CLIENT_ID`** — Google Cloud Console → Credentials → iOS OAuth client ID → Bundle `com.whatsgoodhere.app` → paste into Vercel preview + prod env. Without this, native Google sign-in fails on real device.
- [ ] **Real-device run** — Xcode free provisioning works without paid Apple Dev. Find device-only bugs now, not after TestFlight.
- [ ] **Virtual business address** — Stable / Anytime Mailbox, ~$10–30/mo. Privacy/Terms blocker.
- [ ] **App Store Connect listing draft** (drafted offline, paste into ASC when Apple Dev clears) — name, subtitle, description, keywords, screenshots, demo account, reviewer notes.

## What Claude can drive solo (engineering, not blocked)

- [ ] **Google Places TOS Issue #2** (`attributions` field) — known submission rejection risk per `project_google_places_compliance`. ~30 min.
- [ ] **Verify menu-refresh actually fixed** — memory says yes (PRs #58/#82/#83/#84), plan says no. Reconcile. ~5 min.
- [ ] **LAUNCH-READINESS.md audit** — match against actual repo state so we know what's truly green.

## The 2026-04-30 decision (3 days)

Don't let it sneak up. Original contingency: no TestFlight + no account deletion → flip to PWA-primary for Memorial Day.

- Account deletion ✅ shipped
- TestFlight gated on Apple Dev verification

Decision criteria locked in plan Section 7:
- Clears by 2026-05-04 → stay native, B3-activate + B5 in week of May 4, submit by 2026-05-12
- Clears 2026-05-04 to 2026-05-11 → still native, tight, submit by 2026-05-15
- Not clear by 2026-05-11 → PWA-primary for Memorial Day, native ships for July 4

## Known launch risks (not tonight)

- **iOS Google OAuth client ID** not yet provisioned — TestFlight-day blocker. (Architecture is solved per PR #117; just needs the env var.)
- **Google Places TOS** — Leaflet showing Places pins (Issue #1, deferred decision); missing attributions (Issue #2, ~30 min).
- **Virtual business address** — Privacy/Terms ship email-only without it.

## Not this session

- Post-launch features: scoring history, Ask WGH, FriendsFeed, TastePersonalityCard
- Specials/events/hub (Launch 2.0+ per memory)

---

## Protocol

- **Update BEFORE touching files.** If you skip the update, you are the collision.
- **Clear the "Active handoff" block when the brand session ends.** Stale handoff is worse than none.
- **If `Last updated` is >24h old, treat the file as stale** — ask Dan what's current.
- **One active handoff per surface.** Parallel sessions OK if scopes don't overlap; append a second handoff block.
