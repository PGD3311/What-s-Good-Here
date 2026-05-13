# On-Device Smoke Runbook — Pre-TestFlight

**Date:** 2026-05-13
**Build:** `feat/ios-siwa-capability` merged → main (commits `da7014a`+) installed on real iPhone via Xcode ▶ Run.
**Time budget:** 45–60 min if everything passes. Add ~30 min per fail.
**Demo account:** `walshdaniel143+wghdemo@gmail.com` / `WGH33!`

> Run this with the phone in hand, **not** the simulator. Apple reviewers will use a real device — anything that only breaks on hardware (camera permission, Sign in with Apple sheet, universal links, Keychain) will only surface here.

---

## Pre-flight (3 min)

- [ ] Xcode → device selected (your iPhone, not simulator)
- [ ] iPhone unlocked, on Wi-Fi (cellular is fine too — test both if you can)
- [ ] **Settings → Apps → Mail → Default Mail App** (iOS 18 path; iOS 17 was Settings → Mail → Default) — confirm Apple Mail. Universal-link test fails in 3rd-party mail clients — known, parked in issue #156.
- [ ] **SIWA reset before B2:** Settings → Apple ID (your name at top) → **Sign-In & Security** → **Sign in with Apple** → if "What's Good Here" is in the list, tap it → **Stop using Apple ID**. This guarantees B2's "first-time" is truly first-time.
- [ ] You can see Xcode console (⌘+⇧+C) for runtime errors

---

## Section A — Cold launch + browse (5 min, no auth)

| # | Tap sequence | Pass = | Fail = flag |
|---|---|---|---|
| A1 | Force-quit app → relaunch | Splash flashes coral with new mark, dismisses to homepage in <2s | Splash hangs / coral broken / old icon |
| A2 | Allow location when prompted | Home list shows dishes near you, "5 mi" in search bar | "No dishes found nearby" if location should have results |
| A3 | Deny location instead (force-quit, relaunch, deny) | App still loads with default MV location, no crash | Crash / blank screen / location prompt loops |
| A4 | Scroll the homepage | "What's Good Here" header sits cleanly under status bar (no overlap, no giant gap above it) | Status bar overlaps text OR huge empty space above wordmark — both = regressions from today's safe-area fix |
| A5 | Tap a chalkboard ("Lobster Roll" / "Most talked about") | Navigates into category or dish detail | Nothing happens / wrong destination |
| A6 | Bottom nav → Restaurants | Restaurant list loads, TopBar coral extends edge-to-edge, seal centered horizontally | Coral band too tall / seal floating wrong / cream gap above coral |
| A7 | Tap a restaurant → tap a dish on its menu → tap back | Returns to restaurant detail at the same scroll position | Crashes / loses position / wrong page |
| A8 | Map mode (FAB on home) | Map renders, MV island visible, dish pins clustered by category emoji | Map blank / tiles 404 / pins missing |
| A9 | Tap a pin → bottom sheet → "See on map" from dish detail | Round-trips home → list → dish → back to map | Loses map state |

---

## Section B — Auth (15 min) ⚠️ Apple reviewer focus

### B1 — Email sign-in (3 min)

- [ ] Tap "You" in bottom nav (or any auth-gated action) → Login screen
- [ ] Tap "Continue with Email" → enter `walshdaniel143+wghdemo@gmail.com` / `WGH33!`
- [ ] Sign in succeeds → lands on Home or last route
- [ ] Tap "You" → /profile loads, "PGD" identity card visible, "Your Food Story" chalkboard renders
- [ ] **PASS criterion:** no red errors in Xcode console, no "Network error" banner, journal feed has entries

### B2 — Apple sign-in, first time (5 min) ⚠️ highest review risk

- [ ] Sign out (Profile → gear → Sign Out)
- [ ] Tap "Continue with Apple"
- [ ] iOS native sheet appears with your Apple ID at top
- [ ] Choose **Hide My Email**
- [ ] **PASS criterion 1:** sheet completes without "Missing identityToken" error (this was the bug fixed in commit `4551d9f` — if it fires, the fix didn't ship)
- [ ] **PASS criterion 2:** lands signed in, brand wordmark shows name (your Apple-private email obscured)
- [ ] **PASS criterion 3:** Profile loads with new Apple-relay account state — no journal entries yet, "Building" status

### B3 — Apple sign-in, returning (1 min)

- [ ] Sign out
- [ ] "Continue with Apple" again — should skip consent (already authorized)
- [ ] **PASS criterion:** same account from B2 returned, NOT a new account (data persists)

### B4 — Google sign-in (3 min)

- [ ] Sign out
- [ ] "Continue with Google" → native account picker
- [ ] Pick your Google account
- [ ] **PASS criterion 1:** completes without `signInWithIdToken` errors (test fixed in commit `8ae2c0e` — confirms native handler doesn't pass `access_token` to Supabase)
- [ ] **PASS criterion 2:** lands signed in

### B5 — Magic link / Universal Link (3 min) ⚠️ Apple-fragile

> **Use a throwaway email** here, not the shared demo (`walshdaniel143+wghdemo@gmail.com`) — a successful reset rotates the demo password and breaks the next team session that needs to sign in.

- [ ] Sign out → Login → "Forgot password?" → enter a throwaway email you control (e.g. a `+ulink-test` alias of your personal email) → submit
- [ ] Open Apple Mail on the same iPhone (NOT Gmail app, NOT Outlook)
- [ ] Tap the reset link
- [ ] **PASS criterion 1:** link opens the **app**, not Safari (this is the universal-link wiring — AASA + Team ID)
- [ ] **PASS criterion 2:** reset password flow loads inside the app, not in a browser tab
- [ ] If it opens Safari → check `https://wghapp.com/.well-known/apple-app-site-association` is publicly fetchable + has the right Team ID. Known: 3rd-party mail apps fail this — that's a post-launch issue (#156), **not** a submission blocker; do **not** re-introduce the `whatsgoodhere://` custom URL scheme (PR #154 closed it for cause — see CURRENT_FOCUS.md).

---

## Section C — Authenticated actions (12 min)

> **Run this section on the demo account** (`walshdaniel143+wghdemo@gmail.com`), not the fresh Apple-relay account from B2. The demo has rated dishes already — Apple-relay is empty, so C3 (upload to a rated dish) will false-fail there.

| # | Action | Pass = |
|---|---|---|
| C1 | Navigate to any dish with ≥3 votes → tap "Rate this dish" → slide to 7.5 → write a short review → submit | Vote saves, review appears, returns to dish detail with new rating reflected |
| C2 | Tap heart on a dish card on Browse | Heart fills coral, appears in /profile → Saved tab |
| C3a | Photo via **camera**: go to a dish you have rated → tap photo upload → "Take Photo" → take photo | Camera permission prompts on first use (privacy string from PR #122), photo uploads, appears on dish detail |
| C3b | Photo via **library**: same dish → tap photo upload → "Photo Library" → pick an image | Photo Library permission prompts (separate `NSPhotoLibraryUsageDescription`), photo uploads. Both permissions are declared in `Info.plist` — both need to be tested |
| C4 | Pull-to-refresh on Home | Refresh spinner, dishes reload, no duplicates |
| C5 | UGC moderation — Report: on a dish detail, tap ⋯ → Report → pick a reason → submit | Toast confirms, no duplicate report banner. Apple Guideline 1.2 — reviewers commonly verify this on UGC apps |
| C6 | UGC moderation — Block: on any review card, tap ⋯ → Block user → confirm | Their reviews disappear from your view; blocked-users list in Settings shows them |

---

## Section D — Account deletion (5 min) ⚠️ Apple 5.1.1(v) gate

Apple will reject if account deletion is broken. **Test on the Apple-relay account from B2** — that's the real teardown path.

- [ ] Signed in as Apple-relay user → Profile → gear icon → "Delete Account"
- [ ] Confirm dialog → type `DELETE` → submit
- [ ] **PASS criterion 1:** request completes in <30s (commit `311cc7d` added a 15s timeout on the Apple endpoint fetch — if you hit the timeout, the catch should classify it as transient and let the cron retry)
- [ ] **PASS criterion 2:** UI signs you out, lands on Home as anon
- [ ] **PASS criterion 3:** sign back in with Apple — confirm it creates a **fresh empty account** (no journal entries, no favorites from the deleted user). If it returns the deleted user's data → cascade incomplete; this IS a launch blocker.

If C/Section D succeeds, **Apple's reviewer flow is satisfied**.

---

## Section E — Regressions to watch (10 min)

These are the areas this PR cycle touched. If anything here looks wrong, it's likely a side-effect.

| Area | What to verify |
|---|---|
| **TopBar** (Restaurants, Profile, every Layout page) | Coral band runs edge-to-edge to top of screen, status bar text legible over coral, seal centered between status bar and content, no cream gap above coral |
| **Homepage** | "What's Good Here" wordmark sits ~50-80pt below status bar (not 200pt — that was the bug pre-fix) |
| **Locals' Picks banner** (homepage) | Right side shows the new app-icon mark (coral rounded square, cream plate inside, italic wgh) — NOT the old red ink stamp |
| **App icon on home screen** | New coral mark with cream plate + star at 10 o'clock (cosmetic — not a blocker if iOS hasn't refreshed its cache; force-reinstall to verify) |
| **iOS splash** | First launch shows new coral splash with cream wgh plate, not Capacitor "X" |
| **Sign-in result for Apple** | Profile shows obscured name (Apple-relay), no "undefined" or empty name field |
| **App Tracking Transparency** | **No ATT prompt should appear anywhere.** PostHog is in cookieless / non-tracking mode and Privacy nutrition labels say "no tracking." If an ATT permission prompt appears → privacy disclosures and runtime behavior drifted → submission risk. Investigate before TestFlight. |

---

## What to do when something fails

1. **Screenshot it.** ⌘+S in Simulator, or hardware screenshot on device + AirDrop.
2. **Copy the Xcode console output** for the error stack.
3. **Decide:** submission-blocker or post-launch?
   - **Blocker:** anything in B1–B5, D, or any crash in A1–A4
   - **Post-launch ok:** cosmetic bugs in E, slow paths, edge-case data states
4. **Don't fix it on this branch.** Cherry-pick the fix into a fresh branch off main so this run's TestFlight upload stays clean.

---

## When it all passes

You're ready for §C.5 in `2026-05-07-b3-activate-execution-prep.md`: **Product → Archive → Distribute → App Store Connect → Upload**. Then re-run sections A, B, D on the TestFlight build (not the dev build) — TestFlight catches code-signing gotchas that dev builds hide.
