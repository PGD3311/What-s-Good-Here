# Apple Dev Verification — Wait + Contingency Plan

**Date:** 2026-05-06
**Memorial Day:** 2026-05-25 (19 days out)
**Apple Dev case:** 102886008678 (submitted 2026-05-04, SLA 2 business days, expiring EOD today)
**Status:** No response from Apple yet. SLA boundary today.

---

## 0. Where we actually are

**Submission package: 100% paste-ready.** When Apple verifies, the App Store Connect submission flow is ~10 minutes — paste reviewer notes, paste description, upload screenshots, click submit.

**Code-side: green.** Native iOS app builds, Google sign-in works end-to-end on simulator, search bug fixed (PR #129), home-screen icon shipped (#131), Privacy/Terms with real address (#134), demo account live (#135), description (#136).

**The wall:** Apple Developer enrollment verification. Without it, can't:
- Upload signing credentials (B3-activate)
- Add Sign In with Apple capability (B5)
- Submit TestFlight build
- Publish to App Store

Today is the 2-business-day SLA boundary on the support case.

---

## 1. Today's actions (right now, ≤30 min total)

Two parallel pushes — do both. They don't conflict and either could unblock.

### 1.1 Email follow-up on case 102886008678

Reply to the original support thread or visit https://developer.apple.com/contact/ → log in → "View Cases" → case 102886008678. Use this language:

> Following up on case 102886008678 — submitted Monday 2026-05-04 and still pending. I'm preparing an App Store launch for Memorial Day weekend (2026-05-25) and the enrollment-verification timing is becoming critical for downstream Sign in with Apple and TestFlight setup. Is there any additional information you need from me to move this forward?
>
> Thank you,
> Daniel Walsh

**Tone notes:** Apple support reads tone. Don't be aggressive — be specific about the launch date, name what's downstream of verification, ask if they need anything from you. Short email > long email.

### 1.2 Phone escalation

**Apple Developer Program phone line: 1-800-633-2152**

- Press **4** (App Store / Developer Program)
- Press **1** (account / enrollment issues)
- Have the case ID and your Apple ID ready
- Be prepared to verify identity

Phone often gets faster human triage than email. The agent can sometimes see why a case is stuck and either move it forward or escalate it internally.

**Do (1) before (2)** — that way if the phone agent asks "did you reply to the email," you have.

---

## 2. Parallel work this week — high leverage, no Apple needed

If Apple takes another 24–48h, none of this is wasted. All of it strengthens the launch regardless of native vs PWA path.

| Priority | Task | Time | Value |
|---|---|---|---|
| 1 | Real-device smoke on physical iPhone (free provisioning) | 30 min | Catches device-only bugs before TestFlight; doesn't need paid Apple Dev account |
| 2 | First 100 users plan — who, how, when | 60 min | Launch-day execution; the difference between a soft launch and a real one |
| 3 | Pre-launch landing / waitlist on `wghapp.com` | 60–90 min | Capture interest now, convert on launch day; keeps audience warm during Apple wait |
| 4 | Demo account enrichment (more ratings, photo upload, favorites) | 20 min | Richer reviewer experience reduces rejection risk |
| 5 | Brand polish — anything visually nagging | varies | Tomorrow you won't have time |

**Pick:** if you only do one, do (1) — it surfaces real-device issues that simulator misses, and Apple cares about real-device behavior even on submitted builds.

---

## 3. Decision tree — when to flip to PWA-primary

Per `docs/superpowers/plans/2026-04-27-app-store-final-push.md` §7, with today's date:

| Apple clears by | Path | Submit by |
|---|---|---|
| **2026-05-07 (Thu)** | Stay native, comfortable | 2026-05-13 |
| **2026-05-08 (Fri)** | Stay native, tight | 2026-05-15 |
| **2026-05-11 (Mon)** | Stay native, very tight | 2026-05-18 |
| **After 2026-05-11** | **Flip to PWA-primary** for Memorial Day; native iOS for July 4 weekend | n/a |

**The 2026-05-11 contingency is real.** If verification still hasn't cleared by Monday morning, the math doesn't work for native-iOS-on-Memorial-Day. App Store review averages 24–72h after submission, plus rejection-fix buffer; we'd run out of days.

---

## 4. PWA-primary fallback (if 2026-05-11 contingency fires)

This is what we ship for Memorial Day if Apple doesn't clear by Mon.

### 4.1 What that means
- Launch on `wghapp.com` as primary marketing — installable PWA, full functionality minus iOS-native polish
- Native iOS app continues to be developed in parallel; ships on TestFlight when Apple clears, then App Store for July 4 weekend (2026-07-04)
- All marketing/launch posts emphasize "available now on the web; download our iOS app for the full experience" — soft-pedal the iOS angle until it's ready

### 4.2 What stays the same
- All code-side work already done is still relevant
- All marketing assets (description, screenshots, demo account) carry over to the eventual App Store submission
- Privacy/Terms with mailing address — already live, no changes needed

### 4.3 What changes
- Launch announcement copy needs a "PWA-first, app coming soon" angle
- Consider a "Join the iOS waitlist" capture form on the site
- App Store screenshots remain in the package for the July submission

### 4.4 Pros and cons
**Pros:** Memorial Day launch happens regardless; doesn't blow the timing; PWA is fully functional; we use the wait time to polish further.

**Cons:** First impression is web, not native; iOS users on the Vineyard who try the PWA might bounce expecting an app icon; we lose some of the "real app" legitimacy that was the original organizing principle.

**On balance:** acceptable fallback. Memorial Day is a soft launch anyway — most users are tourists arriving for the weekend, not power users hitting the App Store search. The PWA covers them.

---

## 5. Daily check-in until Apple responds

Each weekday morning until verification clears:

1. **Check inbox** for Apple Dev support case reply
2. **Check developer.apple.com → Account** for status changes (sometimes the case email lags the portal)
3. **If no movement for >24h since last touch:** send a short follow-up reply on the case ("Still pending — any update?")
4. **Don't spam:** one nudge per day max. Apple's support team reads case history; multiple same-day pings hurts more than helps.

---

## 6. Stop conditions

End this plan and pivot when any of these become true:

- **Apple verifies enrollment** → switch to `2026-04-21-oauth-native-plan-b.md` §B3-activate + §B5
- **2026-05-11 arrives without verification** → switch to PWA-primary launch plan (write contingency plan that day)
- **Apple replies asking for additional info** → respond same-day with whatever they need; reset the SLA expectation but don't re-escalate yet

---

## 7. Memory + state to keep current

- **Case ID 102886008678** is in `memory/project_apple_dev_case.md` — already saved
- **Daily wait status** belongs in `CURRENT_FOCUS.md` so any future Claude session reads the latest

## Index

- Apple Dev case memory: `~/.claude/projects/.../memory/project_apple_dev_case.md`
- App Store final push plan: `docs/superpowers/plans/2026-04-27-app-store-final-push.md`
- Plan B (OAuth + revocation): `docs/superpowers/plans/2026-04-21-oauth-native-plan-b.md`
- Reviewer notes (paste-ready): `docs/superpowers/specs/2026-05-03-app-store-reviewer-notes.md`
- Description final (paste-ready): `docs/superpowers/specs/2026-05-04-app-store-description-final.md`
- Launch readiness checklist: `LAUNCH-READINESS.md`
