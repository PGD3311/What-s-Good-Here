# App Store Listing Assets — Draft

**Date:** 2026-04-27
**Owner:** Dan to capture / refine; pasted into App Store Connect when Apple Dev verification clears.
**Companion to:** `docs/superpowers/plans/2026-04-27-app-store-final-push.md` Section 4.

This doc is the **drafted-offline** App Store Connect listing material. When Apple Dev verification clears, the unlock sequence is: paste these into ASC, finalize copy in your voice, upload screenshots, submit.

---

## 1. Screenshot shot list

Apple requires **6.7"/6.9" iPhone** screenshots (e.g. iPhone 16 Pro Max — 1290×2796 portrait). 6.5" is no longer required but recommended for backward compatibility. iPad screenshots only if iPad is in supported devices (skip if iPhone-only at launch).

**Capture strategy:** use Xcode iOS Simulator (iPhone 16 Pro Max), navigate to each scene, hit ⌘+S. Screenshots come out at the right native resolution. Avoid simulator chrome — Apple's reviewers want clean app frames.

**Brand alert:** brand refresh is in flight in another terminal session. **Capture screenshots AFTER the new icons / Seal / favicon land** so the App Store listing matches the live app.

### Shot 1 — Map mode (the wedge)
**Story:** map-first food discovery for Martha's Vineyard. This is what makes WGH different from Yelp/Beli/Google.
**Setup:** open `/`, switch to map mode via the FAB. Make sure pins show across the island, not just one cluster.
**Caption (≤30 chars):** `Find the best dish nearby`
**Why this shot:** map is the one visual that says "this isn't a list app." Lead with it.

### Shot 2 — Top 10 list (the social proof)
**Story:** crowd-sourced rankings, not algorithmic. People here actually ate this.
**Setup:** open `/`, list mode (default). Pick a category that's well-populated (Seafood, Pizza). Scroll so #1, #2, #3 are visible with their medal icons + dish photos if available.
**Caption (≤30 chars):** `What's actually good here`
**Why this shot:** ranked list is the core mental model. Anchors expectations.

### Shot 3 — Dish detail (the depth)
**Story:** every dish has reviews, photos, friends-who-rated-it context.
**Setup:** pick a dish with 10+ ratings, at least one review, and 1+ photo. Native action buttons (Order / Directions / Call) visible if implemented by capture date.
**Caption (≤30 chars):** `Real ratings, real reviews`
**Why this shot:** answers "what do I see when I tap a dish?"

### Shot 4 — Profile / journal (the identity)
**Story:** "this is your food life" — your ratings, your shelves, your taste fingerprint.
**Setup:** sign in as a test user with 5+ rated dishes (the demo account walshdaniel143+wghdemo@gmail.com works). Journal feed showing recent activity. Favorites/photos optional — populated screens look richer but the empty-state for those tabs is acceptable.
**Caption (≤30 chars):** `Your food life, organized`
**Why this shot:** the "social" without saying social. Hooks foodies who care about tracking.

### Shot 5 — Restaurant detail (the loop close)
**Story:** every restaurant page is a menu of best-to-worst dishes. The loop closes.
**Setup:** pick a restaurant with 5+ rated dishes, at least one curated menu. Show the ranked dishes-at-this-restaurant list.
**Caption (≤30 chars):** `Order with confidence`
**Why this shot:** demonstrates the use case at a restaurant — "I'm here, what do I order?"

### Optional Shot 6 — Sign in / onboarding
Only if Apple reviewers raise auth concerns. Otherwise skip.

---

## 2. Reviewer notes (App Store Connect → "Notes for Review")

```
What's Good Here is a map-first food discovery app for Martha's Vineyard.
Users find the best dishes — not restaurants — ranked by crowd-sourced
votes from people who actually ate them.

Sign-in: email/password, Sign in with Apple, Sign in with Google. Some
features (voting, favorites, photo upload) require a free account; browse
and search are guest-accessible.

To test: open the app, allow location permission (location is optional —
the default location is Martha's Vineyard if denied). The home screen
shows a ranked list of nearby dishes by default. Tap the floating button
in the bottom-right to switch to map mode.

Demo account (please use this to test authenticated features):
  Email: [TODO_DEMO_EMAIL]
  Password: [TODO_DEMO_PASSWORD]

Account deletion is in Profile → Settings → Delete Account. Data is
permanently removed; the action is irreversible (per Apple Guideline 5.1.1(v)).

Privacy policy: https://wghapp.com/privacy
Terms: https://wghapp.com/terms
Support: support@wghapp.com (or wghapp.com/support)

Coverage area at launch: Martha's Vineyard. Nantucket and Cape Cod
expansion is planned post-launch — geofencing is intentional (data
quality over breadth).
```

**Action:** demo account already created (`walshdaniel143+wghdemo@gmail.com` / `WGH33!`) with 5 rated dishes + name set. Reviewer notes (canonical: `2026-05-03-app-store-reviewer-notes.md`) describe it as "pre-populated with rated dishes" — no photo or favorite claim, matches actual state. Don't recreate the contradiction.

---

## 3. App name + subtitle

- **App name (≤30 chars):** `What's Good Here`  *(15 chars — fits)*
- **Subtitle (≤30 chars, search-relevant):** options to choose between:
  - `The best dish on the island` *(28 chars — emotional, narrow)*
  - `Map-first food discovery` *(24 chars — descriptive, broad)*
  - `Find the best dish nearby` *(25 chars — action-oriented)*
  - `Locally rated dishes, mapped` *(28 chars — combines social proof + map wedge)*

  **Recommendation:** `Locally rated dishes, mapped` — survives the SEO/keyword scan and signals the wedge. **Dan to confirm.**

---

## 4. Keywords (≤100 chars total, comma-separated)

App Store keywords are search-only, never shown to users. Pack them tight, don't repeat words from the app name (Apple already indexes those).

```
food,dish,restaurant,menu,vineyard,nantucket,cape cod,review,rating,local,where,top,map
```
(75 chars — leaves room for refinement.)

**Notes:**
- "food", "restaurant", "review", "rating" — table-stakes search terms
- "vineyard", "nantucket", "cape cod" — geo-intent keywords (matches local-search behavior)
- "map", "where", "top", "local" — wedge keywords
- Don't duplicate "good" / "here" — already in the app name, Apple double-counts those automatically

---

## 5. Promotional text (≤170 chars, editable post-submission)

This is the ONLY field you can edit without re-submitting for review. Use it for seasonal / launch-week messaging.

**At launch:**
```
The best dishes on Martha's Vineyard, ranked by people who actually ate
them. Map-first discovery. New: Top 10 list for summer 2026.
```
(159 chars)

**Memorial Day weekend variant:**
```
Just landed on the Vineyard? Here's what's good. Crowd-rated dishes,
mapped. The local guide that's actually local.
```
(118 chars)

---

## 6. Description (≤4000 chars) — placeholder

**Status:** NOT drafted — needs Dan's voice + positioning input. Skeleton structure below; Dan or Claude with brand-voice context fills in.

```
[Hook — 1 short paragraph: what the app is, who it's for, why now]

What's Good Here

[The wedge — 1 paragraph: map-first vs list-first, dish-level vs
restaurant-level, locally-sourced vs algorithmic]

How it works:
- Browse dishes ranked by people who tried them
- Switch to map mode to see what's good nearby
- Rate dishes 1–10 — your ratings build your taste profile
- Save favorites and track your food life

Currently covering: Martha's Vineyard. Nantucket and Cape Cod soon.

[Closing line — emotional]
```

**Action:** Dan drafts in his voice. Optional: a follow-up Claude session with `feedback_app_soul.md` context can produce a draft for refinement.

---

## 7. Privacy nutrition labels (App Privacy section in ASC)

ASC will ask you to declare every category of data you collect. Pre-filled answers based on current code:

| Data type | Collected? | Linked to user? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Name | Yes (display name) | Yes | No | App functionality |
| Email | Yes | Yes | No | Auth |
| Photos | Yes (dish photos) | Yes | No | App functionality |
| User Content / Reviews | Yes | Yes | No | App functionality |
| Coarse Location | Yes (city-level) | No | No | App functionality (find nearby dishes) |
| Precise Location | Yes (when granted) | No | No | App functionality |
| Crash Data | Yes (Sentry) | No | No | Diagnostics |
| Performance Data | Yes (Sentry tracing) | No | No | Diagnostics |
| Product Interaction | Yes (PostHog events) | Yes | No | Analytics |
| Device ID | Maybe — verify PostHog config | ? | No | Analytics |

**Action:** Dan double-checks PostHog config (anonymous vs identified events) before submitting. If PostHog uses persistent device ID, declare it.

---

## 8. Submission checklist (paste-into-ASC order)

1. App name `What's Good Here`
2. Subtitle (pick from §3)
3. Bundle ID `com.whatsgoodhere.app` (locked — never change)
4. SKU (Apple's internal — pick something stable like `wgh-ios-001`)
5. Primary category: Food & Drink
6. Secondary category: Travel
7. Age rating: complete questionnaire (likely 4+, no objectionable content)
8. Pricing: Free
9. Availability: United States only at launch (geofence the rollout)
10. Promotional text (§5)
11. Description (§6 — Dan's voice)
12. Keywords (§4)
13. Support URL: `https://wghapp.com/support` (or `wghapp.com` if no /support page)
14. Marketing URL: `https://wghapp.com`
15. Privacy policy URL: `https://wghapp.com/privacy`
16. Screenshots (§1, 5 shots × 6.7" iPhone minimum)
17. Reviewer notes (§2)
18. Demo account credentials (§2 — created beforehand)
19. Sign-in info (filled in same field as reviewer notes)
20. App Privacy nutrition labels (§7)

---

## Notes for the next Claude session

- Items §1 (shot list), §2 (reviewer notes structure), §3 (subtitle options), §4 (keywords), §5 (promo text), §7 (privacy table), §8 (submission order) are deterministic and low-risk to ship.
- Items §6 (description) needs Dan's voice — don't draft 4000 chars without his input.
- Items §2 demo account credentials need Dan to create the account first.
- This file replaces the Section 4 admin items in the App Store Final Push plan once committed.
