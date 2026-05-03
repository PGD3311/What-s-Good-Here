# App Store Final Push — Plan

**Date:** 2026-04-27
**Memorial Day:** 2026-05-25 (28 days)
**Internal checkpoint:** 2026-04-30 (3 days)
**One-line pitch:** Get the iOS app submitted to the App Store before Memorial Day, with a defensible PWA-primary fallback if Apple's review timeline blows up.

---

## 0. Where we are

### Plan B (OAuth + Apple revocation) — 4 of 6 PRs in main
- ✅ **B1** — Web Apple token capture (PR #79)
- ✅ **B2** — Native auth bridge with Capgo + SIWA button (PR #85)
- ✅ **B3-code** — Apple revocation backend (PR #99) — `pending_apple_revocations` queue, `apple-token-exchange` Edge Function, `apple-revocation-retry` cron worker, extended `delete-account`, `lease_apple_revocations` RPC, observability tests
- ✅ **B4** — Universal links + deep-link auth returns (PR #106) — AASA file, Xcode entitlement, `appUrlOpen` routing, cross-device PKCE recovery page, Privacy disclosure, E2E test
- ⏳ **B3-activate** — credentials + provider config (gated on Apple Dev verification)
- ⏳ **B5** — SIWA capability + TestFlight (gated on Apple Dev verification)

### What's structurally complete
Everything that doesn't need Apple Dev credentials is shipped to main. The native iOS Apple sign-in path, server-side token exchange, account-deletion revocation, durable retry queue, cron worker, universal-link routing, AASA file, and Privacy disclosures are all in production code paths — dormant until Apple Dev verification clears.

### The single critical-path block
**Apple Developer enrollment verification.** Until this clears, B3-activate, B5, TestFlight, and App Store submission cannot proceed. If you have not submitted enrollment yet, that is the highest priority action in this plan.

---

## 1. Prerequisites Status

| # | Item | Status | Owner | Risk |
|---|---|---|---|---|
| 1 | Apple Developer account verification | Pending external | Apple | **Highest — gates everything iOS-native** |
| 2 | `wghapp.com` DNS → Vercel + cert | Done (live) | — | Resolved |
| 3 | Google Cloud iOS OAuth client ID | **Not done** | Dan | Blocks native Google sign-in on real device |
| 4 | Supabase Auth → Apple provider config | **Not done** | Dan | Gated on prereq #1 |
| 5 | Apple Team ID + Key ID + Services ID + `.p8` | **Not done** | Dan + Apple | Gated on prereq #1 |
| 6 | Virtual business address | **Not done** | Dan | Privacy/Terms ship email-only without it |

---

## 2. Tonight (≤30 min, high leverage)

These can ship before bed and unblock tomorrow.

- [ ] **Refresh `CURRENT_FOCUS.md`** (5 min) — currently 2026-04-20 stale. Replace with: "B3-code + B4 shipped tonight. Next: real-device testing, Google Cloud iOS OAuth client, prep for B3-activate."
- [ ] **Provision Google Cloud iOS OAuth client ID** (5 min) — Google Cloud Console → APIs → Credentials → Create OAuth client ID → iOS → Bundle ID `com.whatsgoodhere.app`. Paste the resulting client ID into `VITE_GOOGLE_IOS_CLIENT_ID` in Vercel env (preview + prod). Unblocks B2 native Google sign-in on real device.
- [ ] **Real-device run** (15–20 min) — plug iPhone into Mac, select device in Xcode, run. Sign in with email (verified working on simulator) + try native Google sign-in (will exercise the new client ID). Note anything that breaks vs simulator. Don't fix tonight — capture the list.
- [ ] **Submit Apple Developer enrollment** if not already done. This is the long-lead-time external dependency.

---

## 3. This Week — Engineering, Not Blocked

- [ ] **Menu-refresh 401 fix** — broken since 2026-04-12 (per memory). Cron hits gateway 401 every minute. Fix is `verify_jwt = false` on the function deploy. ~15 min. Ugly to ship the launch with this still failing in logs.
- [ ] **Google Places TOS fixes** (per memory `project_google_places_compliance`):
  - **Issue 1:** Leaflet map renders Google Places pins. Google's TOS forbids using Places data on non-Google maps. Two options:
    - (A) Swap the Places-discovery layer to a Google Map for that view only
    - (B) Hide Places pins on Leaflet — only show pins for restaurants we have in our DB
    - Trade-off: (A) is more work, preserves the discovery UX. (B) is one-line, sacrifices Waze-mode value. Decide.
  - **Issue 2:** Missing Places `attributions` field rendering. Google requires we display per-place attributions when we use their data. ~30 min to add to the Places autocomplete/details renderers.
- [ ] **Real-device fix list** — whatever broke on physical iPhone tonight. Triage: launch-blocker or post-launch.

---

## 4. This Week — Admin (non-engineering, ~3–5h total)

These can be drafted before TestFlight is up. When Apple Dev clears, you're ready to submit same-day.

- [ ] **App Store Connect listing draft**:
  - App name: "What's Good Here" (verify availability)
  - Subtitle (≤30 chars)
  - Description (≤4000 chars) — emphasize map-first dish discovery, locally rated, MV-focused
  - Keywords
  - Promotional text (≤170 chars)
  - Support URL: https://wghapp.com (or dedicated /support page)
  - Marketing URL: https://wghapp.com
  - Privacy policy URL: https://wghapp.com/privacy
  - Age rating questionnaire — likely 4+ (no objectionable content)
  - Category: Food & Drink (primary), Travel (secondary)
- [ ] **Screenshots** (6.7" + 6.5" + 5.5" sizes per Apple requirements):
  - Map mode with dish pins
  - Top 10 list (ranked dishes)
  - Dish detail
  - Profile / journal
  - Restaurant detail
- [ ] **Demo account** — create test user with credentials Apple reviewers can use. Document credentials in App Store Connect "Sign-in information" field.
- [ ] **Reviewer notes** — short note explaining the app: "Map-first food discovery for Martha's Vineyard. Sign in with email/Apple/Google. The 'Top 10' dish lists are ranked by user votes."
- [ ] **Virtual business address** — sign up at Stable or Anytime Mailbox (~$10–30/mo per memory `project_business_address`). Update Privacy + Terms to reference it. Before submission.

---

## 5. Once Apple Dev Clears (B3-activate + B5)

These two PRs unlock TestFlight and App Store submission. Plan B has them detailed end-to-end.

### B3-activate (4–6h)
**Plan:** `docs/superpowers/plans/2026-04-21-oauth-native-plan-b.md` lines 3499–3601.

- [ ] Upload Apple credentials to Supabase Vault: `apple_signing_key_v1` (.p8 contents), `apple_team_id`, `apple_key_id_v1`, `apple_services_id`, `apple_bundle_id`
- [ ] Configure Supabase Auth → Providers → Apple in dashboard
- [ ] Replace `<TEAMID>` placeholder in `public/.well-known/apple-app-site-association` with real Team ID
- [ ] Uncomment + run `cron.schedule('apple-revocation-retry', ...)` from `supabase/migrations/20260421_apple_revocation_cron.sql`
- [ ] Flip prod env `VITE_FEATURES_APPLE_SIGNIN=true`
- [ ] Smoke test: web Apple sign-in captures `user_apple_tokens` row; native Apple sign-in via Capgo plugin POSTs to `apple-token-exchange`
- [ ] AASA CI workflow now passes (was passing on placeholder shape; now passes on real Team ID)

### B5 (4–7h)
**Plan:** `docs/superpowers/plans/2026-04-21-oauth-native-plan-b.md` lines 3971–4100.

- [ ] Add Sign In with Apple capability in Xcode → Signing & Capabilities
- [ ] Audit Info.plist for required keys (Apple HIG)
- [ ] Audit PrivacyInfo (data collection disclosures)
- [ ] Real-device smoke (60–90 min) — sign in with Apple, account deletion flow, magic-link, password reset, all on a real iPhone
- [ ] TestFlight upload + internal testers
- [ ] Verify universal links work end-to-end (open password-reset email on iPhone → app opens at `/reset-password`)

---

## 6. Submission Window

After B3-activate + B5 + TestFlight + at least 1–2 days of internal testing on TestFlight:

- [ ] Submit to App Store via App Store Connect
- [ ] Apple review timeline: typically 24–72h, can be longer
- [ ] If rejected: fix, resubmit. Common rejections: missing privacy disclosures, broken demo account, missing attributions

**Realistic submission window:** Latest 2026-05-15 to land approval before Memorial Day with rejection-fix buffer.

---

## 7. Contingency — PWA-primary fallback

Per memory `project_app_store_launch.md`, the original 2026-04-30 checkpoint says: if no TestFlight build + account deletion live by then, flip to PWA-primary for Memorial Day launch.

**Today is 2026-04-27.** Account deletion is live. TestFlight requires Apple Dev verification.

**Decision tree:**
- If Apple Dev verification clears by 2026-04-30: stay native-iOS path, run B3-activate + B5 within the week of May 4
- If Apple Dev verification has not cleared by 2026-04-30: re-evaluate. Options:
  - (A) Continue native path, accept later launch (post-Memorial Day)
  - (B) Flip to PWA-primary for Memorial Day, ship native iOS post-launch
  - (C) Soft launch on PWA, parallel track native iOS for July 4 weekend

PWA-primary is fully functional today — the iOS native build adds polish (haptics, offline support, push notifications) but doesn't gate any core feature.

---

## 8. Verify Before Submit (LAUNCH-READINESS items)

These are tracked in `LAUNCH-READINESS.md` and should all be ✅ before App Store submission:

### Core experience
- [ ] Dish rankings + map discovery polished, verified on iOS + Android
- [ ] "50 Best Dishes on MV" curated list (Denis)
- [ ] Toast POS integration — Order Now buttons (Denis)
- [ ] Ask WGH v1 — conversational dish finder
- [ ] Check In + action buttons on dishes + restaurants (Denis)
- [ ] Dual-mode homepage tested mobile Safari + Chrome

### Trust & safety
- [ ] Jitter WAR v2 — keystroke biometrics for review trust (Denis)
- [ ] Rate limiting verified under synthetic load
- [ ] Content safety (`validateUserContent`) verified end-to-end
- [ ] Admin moderation queue smoke-tested with a real report

### Infrastructure & performance
- [ ] `pg_stat_statements` baseline captured pre-launch
- [ ] Sentry alerting wired on 5xx + unhandled client errors
- [ ] CSP locked in production `vercel.json`
- [ ] PostHog funnels + retention dashboards live

### Marketing / launch content
- [ ] Landing copy final
- [ ] Social share assets (OG images verified)
- [ ] Launch post drafted
- [ ] First 100 users plan — who, how, when

---

## 9. Single Most Important Decision Tomorrow

**Submit Apple Developer enrollment if it has not been submitted yet.**

Every other item in this plan moves on its own schedule. Apple's response time is the single variable you cannot compress. The cost of waiting one extra day for the application is one extra day Apple takes to review you. Submit today; iterate everything else in parallel.

---

## Index

- Plan B (OAuth + revocation): `docs/superpowers/plans/2026-04-21-oauth-native-plan-b.md`
- Memorial Day launch plan (older, broader): `docs/superpowers/plans/2026-04-13-memorial-day-launch-plan.md`
- Launch readiness checklist: `LAUNCH-READINESS.md`
- Memory keys most relevant: `project_app_store_launch`, `project_apple_dev_account`, `project_canonical_domain`, `project_google_places_compliance`, `project_business_address`, `project_menu_refresh_401_broken`
