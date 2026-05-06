# Current Focus

*Dan (or any Claude session starting work) updates this file at session start. Every other Claude session reads it first to avoid collisions.*

**Last updated:** 2026-05-06

---

## Active handoff

**Dan + Claude session active — Apple Dev wait + parallel work.** 19 days to Memorial Day. Apple Dev case 102886008678 hits SLA boundary today (no response yet).

**Known parallel session:** another terminal is working on `fix/codex-hardening-wave-2` (Denis's branch, security/scraper hardening). Don't touch that branch or its files.

---

## Where we are

**Apple Dev verification is THE wall.** Submission package is 100% paste-ready otherwise.

- Case 102886008678 — submitted 2026-05-04, SLA today, no response yet
- See `docs/superpowers/plans/2026-05-06-apple-dev-wait-plan.md` for the full wait + contingency playbook
- Decision tree: clears by 2026-05-11 → still native iOS for Memorial Day; otherwise → PWA-primary launch, native iOS for July 4

**Plan B (Sign in with Apple):** 4 of 6 PRs merged.
- ✅ B1 (PR #79), B2 (#85), B3-code (#99), B4 (#106)
- ⏳ B3-activate, B5 — both gated on Apple Dev verification

**What's done as of 2026-05-06 (the 70%):**
- ✅ All native iOS code shipped + tested in simulator end-to-end
- ✅ Native Google sign-in working (PR #127 + GCP setup + Supabase audience config)
- ✅ Search row-cap bug fixed via pagination (PR #129) — caught Leo Burger / Mo's Lunch issue
- ✅ App icon (Seal at 1024x1024) shipped (PR #131)
- ✅ Privacy + Terms with operator address shipped (PR #134)
- ✅ Reviewer notes finalized + Codex-reviewed, demo creds embedded (PR #135)
- ✅ Description final (lobster-roll hook, geo-agnostic body) (PR #136)
- ✅ Apple Dev wait + contingency plan documented (PR #137)
- ✅ 5 App Store screenshots captured at iPhone 17 Pro Max native res (1290×2796), saved to ~/Desktop
- ✅ Demo account live: walshdaniel143+wghdemo@gmail.com / WGH33! (5 ratings + name set)

**What's left after Apple clears (the 30%) — see Plan B doc for details:**
- B3-activate (4–6h): upload Apple credentials to Supabase, configure Apple provider, replace TEAMID placeholder, flip feature flag
- B5 (4–7h): add Sign in with Apple capability in Xcode, real-device smoke, TestFlight upload
- Submission (~30 min): paste reviewer notes + description into App Store Connect, upload screenshots, click submit
- Apple review (1–3 days, possibly + rejection cycle)

---

## What's tackleable RIGHT NOW (Apple-independent)

The full prioritized list lives in TaskList. Highest-leverage subset:

**P0 — do these even if Apple clears tomorrow:**
- **Task #14 [Dan only]** — Real-device smoke on physical iPhone (free provisioning, ~30 min). Catches device-only bugs invisible to simulator BEFORE TestFlight.
- **Task #15 [Dan thinking]** — First 100 users plan, ~60 min. Names, channels, sequencing for launch day.

**P1 — quality bumps + risk mitigation:**
- **Task #16 [Claude-driven]** — Pre-launch waitlist landing on wghapp.com (~60–90 min). Captures interest while Apple drags.
- **Task #17 [Dan only]** — Enrich demo account to 15 ratings + 1 photo + 3 favorites (~20 min). Reduces Apple rejection risk.
- **Task #18 [SQL + Dan]** — Audit + flip seasonal `is_open` flags. Memorial Day = restaurants opening; many still stuck on winter false.
- **Task #19 [Claude-driven]** — Sentry alerting policy verify + configure 5xx + unhandled-error rules.
- **Task #23 [Claude-driven]** — Write PWA-primary contingency plan BEFORE 5/11 deadline (~60 min).

**P2 — useful but not launch-blocking:**
- Task #20 — PostHog dashboards
- Task #21 — Launch post drafts (Twitter/Insta/Vineyard Gazette/FB)
- Task #22 — OG image render verification

**Deferred bugs:**
- Task #11 — Post-launch FTS migration (search architecture)
- Task #13 — Signup duplicate-name bug fix

---

## Daily ritual until Apple responds

Per `2026-05-06-apple-dev-wait-plan.md` §5:
1. Check inbox for case 102886008678 reply
2. Check developer.apple.com → Account for status changes
3. If >24h since last touch with no movement: send ONE polite nudge on the case
4. No spam — one nudge per day max

**Today (2026-05-06):** SLA hits EOD. Plan recommends parallel email follow-up + phone escalation (1-800-633-2152 → 4 → 1) with case number ready.

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
- **One active handoff per surface.** Parallel sessions OK if scopes don't overlap; append a second handoff block.
- **Tasks are the canonical to-do.** TaskList is the source of truth for what's pending. CURRENT_FOCUS.md summarizes; TaskList tracks per-item progress with owner/state.
