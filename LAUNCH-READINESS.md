# Launch Readiness — Memorial Day 2026-05-25

**~22 days remaining as of 2026-05-03. Apple Dev verification is the critical-path blocker — see `docs/superpowers/plans/2026-04-27-app-store-final-push.md`. Dan has a call with Apple tomorrow (2026-05-04).**

Any Claude session (Dan's, Denis's, mine, a future one) can check items off as work ships. If you see `[ ]` and you just shipped the thing, tick it. If you see `[x]` on something that's actually broken, flip it back and leave a one-line note.

---

## 🚨 Apple Dev critical path (gates everything iOS-native)

- [ ] Apple Developer enrollment **verified** (submitted, pending Apple) — **the bottleneck**
- [ ] `VITE_GOOGLE_IOS_CLIENT_ID` provisioned in Vercel (Google Cloud → Credentials → iOS, Bundle `com.whatsgoodhere.app`)
- [ ] Apple Team ID + Key ID + Services ID + `.p8` uploaded to Supabase Vault (gated on Apple Dev)
- [ ] Supabase Auth → Apple provider configured (gated on Apple Dev)
- [ ] `<TEAMID>` placeholder in `public/.well-known/apple-app-site-association` replaced with real Team ID (gated on Apple Dev)
- [ ] Sign In with Apple capability added in Xcode → Signing & Capabilities (gated on Apple Dev)
- [ ] `VITE_FEATURES_APPLE_SIGNIN=true` flipped in prod env (gated on Apple Dev)
- [ ] TestFlight build uploaded + internal testers
- [ ] App Store review passed

**2026-04-30 contingency call:** if Apple Dev hasn't cleared, evaluate PWA-primary fallback per plan Section 7.

## Native iOS app (Capacitor)

- [x] Capacitor shell builds locally — simulator smoke passed 2026-04-20 (#62, #67–#72)
- [x] Native auth lifecycle wired (Plan B B1 #79, B2 #85, B3-code #99, B4 #106)
- [x] Universal links / AASA file shipped (B4 / PR #106) — placeholder Team ID until Apple Dev clears
- [x] Apple revocation backend wired (B3-code / PR #99) — dormant until provider config
- [x] Account deletion live + smoke-tested
- [x] PR #122 merged (2026-05-03) — camera/photo permission strings + PrivacyInfo.xcprivacy in main at `2e46e47`
- [ ] **Drag `ios/App/App/PrivacyInfo.xcprivacy` into Xcode App group** (1 click) — without this, file is in repo but not in app bundle
- [ ] Real-device smoke run on physical iPhone (free provisioning works without paid Apple Dev — do this now, don't wait)

## Core experience

- [ ] Dish rankings + map discovery — polished, verified on iOS + Android
- [ ] "50 Best Dishes on MV" curated list (Denis)
- [ ] Toast POS integration — Order Now buttons with auto-detected slugs (Denis)
- [ ] Ask WGH v1 — conversational dish finder, rate-limited (2 guest / 6 logged-in per hour), prompt-cached
- [ ] Check In + action buttons (Order / Directions / Call) on dishes + restaurants (Denis)
- [ ] Dual-mode homepage (list/map) tested end-to-end on mobile Safari + Chrome
  - ⚠️ **Browser E2E partially broken** — verified 2026-04-27: home.spec passes, but 6 of 13 browser-chromium tests fail because UI drifted (`/hub` removed, locals UI redesigned, restaurants/browse selectors changed). Memory `project_e2e_env_broken` was wrong — geolocation works. Real fix is per-spec UI realignment, not a config change. PR-sized.

## Trust & safety

- [x] Column-lock triggers on dishes/specials/events — PR #37
- [x] Vote-gated delete policy — PR #37
- [x] FK `ON DELETE` strategies unblock Delete Account — PR #36
- [x] H3 UGC reporting + blocking shipped (PR #53) — `reports`/`user_blocks` tables, RPCs, ReportModal, BlockUserModal, BlockedUsersModal all live
- [x] Account deletion live (edge function + migration + UI + smoke)
- [x] Security audit Apr 10 — 20 fixes shipped (Critical + High + Medium done, Low observations remain)
- [ ] Jitter WAR v2 — keystroke biometrics for review trust (Denis)
- [ ] Rate limiting verified under synthetic load
- [ ] Content safety (`validateUserContent`) verified end-to-end
- [ ] Admin moderation queue smoke-tested with a real report from H3 UI

## Infrastructure & performance

- [x] Supabase audit — 14 fixes across 5 migrations — PR #36
- [x] Sentry initialized in `src/main.jsx` (prod-only, replay with PII masking, browser tracing) — capture wired in `errorHandler.js` + `ErrorBoundary.jsx`
- [x] CSP locked in production `vercel.json` (recent fix in #109)
- [x] menu-refresh pipeline fixed — `verify_jwt = false` shipped (PR #58/#82/#83/#84)
- [ ] Sentry alerting policy configured on 5xx + unhandled — Dan to verify `VITE_SENTRY_DSN` set in Vercel prod + alert rules route to Slack/email in Sentry dashboard
- [ ] **Future polish (not launch-blocking):** add `Sentry.setUser({ id })` on auth state change so errors are filterable by user in Sentry dashboard
- [ ] PostHog funnels + retention dashboards live (analytics.js wired; dashboards unverified)
- [ ] `pg_stat_statements` baseline captured pre-launch
- [ ] `pg_stat_user_indexes` checked ~1 week post-launch (drop dead indexes)

## App Store admin (drafted offline, paste into ASC when Apple Dev clears)

**Drafted:** `docs/superpowers/specs/2026-04-27-app-store-listing-assets.md` covers shot list, reviewer notes, subtitle options, keywords, promo text, privacy nutrition labels, and submission checklist. Dan finishes description (§6, needs his voice) + creates demo account.

- [x] Shot list drafted (5 hero shots, captions, capture strategy)
- [x] Reviewer notes drafted (structure + boilerplate)
- [x] Subtitle options drafted (4 candidates, 1 recommended)
- [x] Keywords drafted (75 chars, geo + wedge)
- [x] Promotional text drafted (launch + Memorial Day variants)
- [x] Privacy nutrition labels pre-filled
- [x] Submission checklist sequenced
- [ ] App name reserved in ASC (verify "What's Good Here" available — Dan, when ASC accessible)
- [ ] Description (≤4000 chars) — needs Dan's voice
- [ ] Demo account created with rated dishes + photo + favorite
- [ ] Screenshots captured (6.7" iPhone, 5 shots — capture AFTER brand refresh ships)
- [ ] Virtual business address signed up (Stable / Anytime Mailbox, ~$10–30/mo) — Privacy/Terms blocker

## Google Places TOS (submission risks per `project_google_places_compliance`)

- [x] **Issue #1:** Verified 2026-05-03 — non-issue in current main. RestaurantMap renders only DB-sourced pins; no Places pins on Leaflet. The 2026-04-18 Codex flag referenced a code path that no longer exists.
- [x] **Issue #2:** Per-place `attributions` field rendering — `PlaceAttributions` + `PoweredByGoogle` shipped, wired in DishSearch / SearchAutocomplete / AddRestaurantModal / RestaurantDetail.

## Marketing / launch content

- [ ] Landing copy final
- [ ] Social share assets (OG images verified — note: brand-refresh session is currently regenerating these)
- [ ] Launch post drafted — where is it going?
- [ ] First 100 users plan — who, how, when

## Post-launch punch list (NOT blocking)

- Review decay system
- Shareable profile cards
- Biggest Movers feature
- Nantucket + Cape Cod expansion
- B2B analytics dashboard
- Local Picks homepage redesign (`docs/superpowers/specs/2026-03-10-locals-lists-design.md`)

---

## How to use this file

- One tick = shipped AND verified. If the PR merged but you haven't confirmed in prod, don't tick yet.
- Keep the "NOT blocking" section short. If a post-launch item starts creeping into scope, either move it up (and accept the tradeoff) or delete it.
- When Dan is slammed at work, this file is how any Claude session answers *"are we on track?"* without needing Dan's head.
