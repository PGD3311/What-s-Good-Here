# App Store Submission Day — Single Source of Truth

**Date:** 2026-05-06
**Status:** Open this doc the moment Apple Dev verification clears. Walk top-to-bottom. Every field has paste-ready content. Estimated time start-to-submit: **30–60 minutes** (assuming build is already on TestFlight).

This consolidates: `2026-05-04-app-store-description-final.md` · `2026-05-03-app-store-reviewer-notes.md` · `app-store-connect-privacy-details.md` · `2026-04-27-app-store-listing-assets.md` · `2026-05-06-app-store-age-rating.md` · `2026-05-06-app-store-whats-new.md`.

If the source docs and this doc disagree, **trust this doc** — it's the latest reconciliation. Then update the source.

---

## §0 — Preflight (do BEFORE opening App Store Connect)

**All must be ✅ before pasting anything:**

- [ ] Apple Developer enrollment cleared (Account screen shows "Apple Developer Program" active, not pending)
- [ ] **SIWA path decided** (Codex 4.8 finding): either (A) ship SIWA end-to-end via B3-activate + B5 + Xcode capability, OR (B) hide Google sign-in button in the review build to avoid 4.8 violation. Cannot ship Google-without-Apple.
- [ ] **iPad path decided** (Codex finding): either drop `TARGETED_DEVICE_FAMILY` in `ios/App/App.xcodeproj/project.pbxproj` from `"1,2"` to `"1"` (iPhone only — recommended), OR shoot + upload iPad screenshots at 13" / 12.9" tiers.
- [ ] **PrivacyInfo.xcprivacy rebuilt into TestFlight build** — updated 2026-05-06 to add SearchHistory/UserID/DeviceID/OtherDataTypes (Jitter)/OtherDiagnosticData and remove PreciseLocation. Must be in the binary Apple scans, not just on disk.
- [ ] **Phone field has a real number** (not the placeholder in §8 below).
- [ ] B3-activate complete (if path A): Apple credentials in Supabase Vault, Auth provider configured, AASA Team ID replaced, `VITE_FEATURES_APPLE_SIGNIN=true` in prod
- [ ] B5 complete (if path A): Sign in with Apple capability added in Xcode (`App.entitlements` currently has NO `com.apple.developer.applesignin` key — verified 2026-05-06), real-device smoke passed
- [ ] TestFlight build uploaded and at least one internal tester has signed in successfully
- [ ] Demo account verified working in TestFlight build: `walshdaniel143+wghdemo@gmail.com` / `WGH33!`
- [x] **Demo account matches reviewer-notes wording** — reviewer-notes softened 2026-05-06 to claim only "rated dishes" (no photos, no favorites). Account has 5 ratings + name set, which matches. No enrichment needed.
- [ ] `https://wghapp.com/privacy` returns 200 (verified 2026-05-06 ✅) — and includes Anthropic + Jitter in third-party list (added 2026-05-06)
- [ ] `https://wghapp.com/terms` returns 200 (verified 2026-05-06 ✅)
- [ ] `https://wghapp.com/support` returns 200 (verified 2026-05-06 ✅)
- [ ] `wghapp@wghapp.com` is monitored or forwards to a monitored inbox
- [ ] 5 screenshots at 1320×2868 (or 1290×2796) saved + visually QAed (verified 2026-05-06 ✅)
- [ ] Account-deletion flow tested end-to-end on a fresh test account in TestFlight build (text now says "votes, reviews, photos, favorites, playlists, follows, and profile" — updated 2026-05-06 to match schema cascade)

If any of the above is ❌, stop and resolve before submitting.

---

## §1 — App Information (App Store Connect → My Apps → Create)

### Name
```
What's Good Here
```
*(15 chars / 30 max)*

### Subtitle
```
Locally rated dishes, mapped
```
*(28 chars / 30 max — Dan to confirm or pick alternate from `2026-04-27-app-store-listing-assets.md` §3)*

Alternates Dan can substitute:
- `Find the best dish nearby` (25 chars)
- `Map-first food discovery` (24 chars)
- `The best dish on the island` (28 chars)

### Bundle ID
```
com.whatsgoodhere.app
```
*(Locked — never change. Per `project_bundle_id` memory.)*

### SKU
```
wgh-ios-001
```
*(Internal Apple identifier; never exposed to users.)*

### Primary Language
```
English (U.S.)
```

### Category
- **Primary:** `Food & Drink`
- **Secondary:** `Travel`

### Content Rights
- **Does your app contain, show, or access third-party content?** **Yes**
- Specifically: Google Places data (restaurant discovery), OpenStreetMap tiles (map base layer)
- All sources have appropriate licensing (Google Places API agreement; OpenStreetMap ODbL)

---

## §2 — Pricing and Availability

| Field | Value |
|---|---|
| Price | **Free** (Tier 0) |
| Availability | **United States** at launch |
| Pre-order | **No** |
| Educational Discount | **No** |

*Geo-restricting to US at launch reduces surprise. Expand to Canada/UK post-launch when we have data quality confidence.*

---

## §3 — Age Rating

Paste-ready answers in `docs/superpowers/specs/2026-05-06-app-store-age-rating.md`. **Expected derived rating: 12+.**

Critical answers:
- Alcohol, Tobacco, or Drug Use or References → **Infrequent or Mild** (defensible — restaurant menus contain alcohol)
- User-Generated Content → **Yes** (with moderation controls)
- Unrestricted Web Access → **No**
- All violence/sexual/profanity questions → **None**
- Made for Kids → **No**

ASC computes the rating live as you click. Verify it lands at **12+** before saving. If it derives **17+**, double-check you didn't accidentally answer "Frequent or Intense" anywhere.

---

## §4 — App Privacy

Paste-ready in `docs/app-store-connect-privacy-details.md`. ASC asks two layers:

### Layer 1: Data types collected (check these boxes)
- Contact Info → ✅ Email Address, ✅ Name
- Location → ✅ Coarse Location *(NOT Precise — we don't use `enableHighAccuracy`)*
- User Content → ✅ Photos or Videos, ✅ Other User Content (ratings/reviews/favorites/playlists/reports/blocks)
- Search History → ✅ Search History (PostHog events)
- Identifiers → ✅ User ID, ✅ Device ID
- Usage Data → ✅ Product Interaction
- Diagnostics → ✅ Crash Data, ✅ Performance Data, ✅ Other Diagnostic Data
- Other Data → ✅ Other Data (Jitter Protocol keystroke cadence — flag in reviewer notes)

### Layer 2: For each data type
- **Tracking:** **No** for all (we do not share with data brokers, do not match against third-party data for ads)
- **Linked to identity:** YES for Email/Name/Photos/User Content/Search History/User ID/Device ID/Product Interaction/Jitter; **NO** for Coarse Location (in-session only, not persisted with user ID); **NO** for Crash Data / Performance Data / Other Diagnostic Data (Sentry initialized globally; no `Sentry.setUser()` call in src/ — verified 2026-05-06)
- **Purpose:** App Functionality for content/identity; Analytics for diagnostics + product interaction; App Functionality for Jitter (fraud prevention)

Full grid in `docs/app-store-connect-privacy-details.md`.

### ⚠️ Disclosures reviewers will probe (per Codex review 2026-05-06)
- **Anthropic Claude vision** processes user-uploaded dish photos for content-safety check before display. Disclosed in `Privacy.jsx` "Dish Photos" + third-party services list. Mention in reviewer notes if asked about photo moderation.
- **Jitter Protocol** receives keystroke metadata + `user_id` for review trust scoring. Disclosed in `Privacy.jsx` "Typing Cadence" + third-party services list.
- Both are required disclosures under Guideline 5.1.2(i) (third-party data sharing, including third-party AI).

---

## §5 — Version Information (1.0)

### Version Number
```
1.0
```

### Copyright
```
© 2026 Daniel Walsh
```
*(Update when LLC formed per `project_apple_dev_account` memory.)*

### Promotional Text (≤170 chars, editable post-launch without re-review)

**At launch:**
```
The best dishes on Martha's Vineyard, ranked by people who actually ate them. Map-first discovery. Memorial Day weekend, ready when you are.
```
*(146 chars)*

### Description (≤4000 chars) — paste-ready

```
Trying to find the best lobster roll near you? We got you.

What's Good Here is the local guide to what to actually order — every dish at every restaurant, rated 1 through 10 by people who've eaten it.

Pick a restaurant the old way. Then pick what to order the new way. We add the layer underneath: every dish on the menu, ranked by the people who've tried it. Whether you're new to a place or you've eaten there for years, the answer is in the app.

How it works:
- Browse dishes ranked by people who tried them
- Switch to map mode to see what's good near you
- Rate dishes 1–10 — your votes shape what's actually good
- Save the ones worth coming back for

What's good here? Now you know.
```
*(~810 chars / 4000 max — final per `2026-05-04-app-store-description-final.md`)*

#### ⚠️ Codex flagged 2 falsifiable claims (low risk, holding original)
- **"every dish at every restaurant"** — we don't actually have every dish; aspirational marketing
- **"by people who've eaten it"** — no purchase/checkin verification; community-submitted

**Decision: keep original copy.** Industry-standard claims (Yelp/OpenTable use equivalent language). Apple rarely rejects for aspirational marketing prose in descriptions. **Backup wording if Apple kicks back under 2.3:**

```
Trying to find the best lobster roll near you? We got you.

What's Good Here is the local guide to what to actually order — many of the dishes at the restaurants we cover, rated 1 through 10 by the community.

Pick a restaurant the old way. Then pick what to order the new way. We add the layer underneath: a ranked dish list for the restaurants we cover, built from real community ratings. Whether you're new to a place or you've eaten there for years, the answer is in the app.

How it works:
- Browse dishes ranked by community ratings
- Switch to map mode to see what's good near you
- Rate dishes 1–10 — your votes shape what's actually good
- Save the ones worth coming back for

What's good here? Now you know.
```

### Keywords (≤100 chars total, comma-separated, no spaces around commas)

```
food,dish,restaurant,menu,vineyard,nantucket,cape cod,review,rating,local,where,top,map
```
*(75 chars — leaves headroom)*

Notes:
- Don't repeat "good" or "here" — already indexed via app name
- Geo-keywords ("vineyard", "nantucket", "cape cod") match local-search behavior
- "where" and "top" capture intent queries ("where to eat", "top dishes")

### Support URL
```
https://wghapp.com/support
```
*(`/support` page is shipped and live — verified 2026-05-06.)*

### Marketing URL
```
https://wghapp.com
```

### Privacy Policy URL
```
https://wghapp.com/privacy
```

### Version Release
- **Manually release this version** (recommended) — gives Dan control over launch timing relative to Memorial Day push
- (Alternate: Automatically release after approval — risky for marketing coordination)

### What's New in This Version (≤4000 chars)

```
First release. The local guide to what to actually order — every dish at every restaurant, ranked 1 through 10 by people who've eaten it.

- Browse top-rated dishes near you
- Switch to map mode to see what's good around you
- Rate dishes 1–10 to shape what's actually good
- Save the ones worth coming back for

What's good here? Now you know.
```
*(287 chars — per `2026-05-06-app-store-whats-new.md`)*

---

## §6 — Screenshots (5 required, 6.9" tier)

**Location:** `~/Desktop/Simulator Screenshot - iPhone 17 Pro Max - 2026-05-06 at 14.{44.03,44.43,45.09,45.49,46.12}.png`
**Dimensions:** 1320×2868 (Apple-compliant, verified 2026-05-06)

Upload order in App Store Connect (drag in this sequence — first screenshot is the App Store hero):

1. **Map mode** — `14.44.03.png` (the wedge — what makes WGH different)
2. **Top 10 list** — `14.44.43.png` (social proof — crowd-rated dishes)
3. **Dish detail** — `14.45.09.png` (depth — ratings, reviews, Jitter trust badge)
4. **Profile** — `14.45.49.png` (identity — your food story)
5. **Restaurant detail** — `14.46.12.png` (loop close — order with confidence)

**Captions (App Store Connect lets you add overlay text — optional but recommended):** see `2026-04-27-app-store-listing-assets.md` §1 for caption per shot.

### App Preview Video
**Skip for v1.0.** Optional. Adds production overhead with no marginal install lift for first launch.

---

## §7 — Build (uploaded from Xcode → TestFlight → promoted here)

ASC pulls the build from your TestFlight uploads. Steps:
1. In App Store Connect → My Apps → What's Good Here → 1.0 → "Build" section
2. Click **"+"** → select the latest TestFlight build
3. Verify build number matches what passed real-device smoke
4. Apple will scan the build for entitlements + privacy manifest compliance — check no warnings before proceeding

---

## §8 — App Review Information

### Sign-In Information (required because the app has authenticated features)

| Field | Value |
|---|---|
| Sign-in required | **Yes** |
| Username | `walshdaniel143+wghdemo@gmail.com` |
| Password | `WGH33!` |
| Sign-in steps | (paste from §9 reviewer notes — covers location prompt + sign-in flow) |

### Contact Information

| Field | Value |
|---|---|
| First Name | `Daniel` |
| Last Name | `Walsh` |
| Phone | **⚠️ Dan to fill in real phone number — required field, can't ship placeholder** |
| Email | `walshdaniel143@gmail.com` *(personal — Apple uses this for review correspondence; NOT the public support address)* |

### Notes for Review

Paste verbatim from `docs/superpowers/specs/2026-05-03-app-store-reviewer-notes.md` §1 — the block between the triple-backticks. Reproduced here for paste convenience:

```
What's Good Here is a map-first food discovery app for Martha's Vineyard.
Users find the best DISHES (not restaurants), ranked by community-
submitted 1–10 ratings.

────────────────────────────
HOW TO TEST
────────────────────────────

1. Location is optional. If you deny the location prompt, the app
   defaults to Martha's Vineyard and core browsing still works.

2. The home screen shows a ranked list of nearby dishes by default.
   Tap the floating round button in the bottom-right corner to switch
   to map mode. Pins use category emoji (pizza slice, lobster, etc.)
   to indicate dish type.

3. Tap any dish to see its detail page: ratings, reviews, photo,
   restaurant info.

4. Tap any restaurant name to see the restaurant's ranked dish list.

5. To test authenticated features (voting, favorites, photo upload,
   profile), sign in with the demo account below using EMAIL +
   PASSWORD. Other features (browse, search, map) are guest-accessible.

────────────────────────────
DEMO ACCOUNT (email + password)
────────────────────────────

Email:    walshdaniel143+wghdemo@gmail.com
Password: WGH33!

This account is pre-populated with rated dishes to show representative
content (not an empty state).

PLEASE DO NOT DELETE THIS ACCOUNT — it is shared across all reviewers.
If you wish to test the account-deletion flow (Guideline 5.1.1(v)),
please create a new account via the email signup flow on the login
screen, then delete that account.

────────────────────────────
ACCOUNT DELETION (Guideline 5.1.1(v))
────────────────────────────

Path: Profile tab → tap the gear icon (top-right) → Delete Account.

Deletion is permanent and irreversible: votes, reviews, photos,
favorites, playlists, follows, and profile are removed. The action
requires an explicit confirm step.

────────────────────────────
USER-GENERATED CONTENT (Guideline 1.2)
────────────────────────────

- Dish photos pass an automated content-safety check (Anthropic Claude
  vision) before display.
- Review text is filtered against a profanity/slur/spam blocklist on
  submission.
- Users can report inappropriate content via the report button on any
  review, photo, dish, or profile.
- Users can block other users; blocked users' content is hidden.
- Reports are reviewed by our admin moderation queue (48h SLA).

────────────────────────────
PRIVACY
────────────────────────────

- Privacy policy: https://wghapp.com/privacy
- Terms of service: https://wghapp.com/terms
- Camera and photo library permissions are requested only when a user
  uploads a dish photo.
- We do not use third-party advertising SDKs.
- We do not track users across other companies' apps or websites.

────────────────────────────
SUPPORT
────────────────────────────

Email: wghapp@wghapp.com
```

### Attachment(s)
None required. If reviewers raise questions, attach screenshots showing the report/block/delete flows on follow-up.

---

## §9 — Submit for Review

After every section above is filled and saved:

1. Click **"Add for Review"** at the top right
2. ASC runs final validation — fix any red errors before submitting
3. Click **"Submit for Review"**
4. Status changes to **"Waiting for Review"** → **"In Review"** (typically 12–48h) → **"Pending Developer Release"** (because we set Manual release)
5. Once "Pending Developer Release", Dan clicks **"Release This Version"** at his chosen launch moment

**Apple review SLA:** typically 24–72h for apps without complex entitlements. SIWA + UGC may add a day. Build a 3–5 day buffer before Memorial Day for the rejection-and-resubmit cycle.

---

## §10 — Rejection Playbook (in case of)

Most likely rejections, ordered by historical frequency, with pre-staged responses:

### "Demo account doesn't work"
**Cause:** TestFlight build promoted to App Store had a regression OR demo account password was changed
**Response:** Verify locally on TestFlight build → fix → resubmit. Don't argue with reviewer.

### "Account deletion not found / unclear"
**Cause:** Reviewer can't find the path
**Response:** Reply with screenshot of: Profile → gear icon → Delete Account. Pin to first paragraph of follow-up.

### "Sign in with Apple required"
**Cause:** Apple requires SIWA whenever the app offers third-party social sign-in (Google). We have this — verify B3-activate is fully live in submitted build.
**Response:** Confirm SIWA is offered in the submitted build (not just behind a flag). If `VITE_FEATURES_APPLE_SIGNIN` was false in build, fix and resubmit.

### "Privacy nutrition label inaccurate"
**Cause:** Apple found data collection not declared (or vice versa)
**Response:** Most common miss: not declaring Device ID. We declared it ✅. If they cite something else, audit `docs/app-store-connect-privacy-details.md` against actual code.

### "Inappropriate content / UGC moderation insufficient"
**Cause:** Reviewer found content via search that they consider violating
**Response:** Cite UGC moderation block in reviewer notes. Show report flow. May need to flush specific content if cited explicitly.

### "Guideline 4.0 — Design"
**Cause:** Reviewer thinks the app is incomplete or low-utility
**Response:** This is rare for v1.0 of a well-positioned product. If raised, lean on the wedge: "ranked dish-level recommendations are not provided by Yelp or Google." Don't capitulate to "make it look more like Yelp" feedback.

---

## §11 — After Submission

- [ ] Set a calendar reminder to check status every 12 hours
- [ ] Monitor `walshdaniel143@gmail.com` for ASC notifications (review status, rejections)
- [ ] Monitor `wghapp@wghapp.com` in case Apple emails the public support address
- [ ] Keep a quick-fix branch ready for the 1–2 most likely rejections (demo account regression, missing screenshot, etc.)
- [ ] Do NOT push new builds to TestFlight while in review (it can confuse the reviewer about which build is canonical)

---

## §12 — Source Docs Index

| Topic | Source doc |
|---|---|
| Description copy | `docs/superpowers/specs/2026-05-04-app-store-description-final.md` |
| Reviewer notes | `docs/superpowers/specs/2026-05-03-app-store-reviewer-notes.md` |
| Privacy nutrition labels | `docs/app-store-connect-privacy-details.md` |
| Subtitle / keywords / promo / screenshots shotlist | `docs/superpowers/specs/2026-04-27-app-store-listing-assets.md` |
| Age rating | `docs/superpowers/specs/2026-05-06-app-store-age-rating.md` |
| What's New text | `docs/superpowers/specs/2026-05-06-app-store-whats-new.md` |
| Final push plan (engineering blocks) | `docs/superpowers/plans/2026-04-27-app-store-final-push.md` |
| Apple Dev wait + contingency | `docs/superpowers/plans/2026-05-06-apple-dev-wait-plan.md` |

If you find a discrepancy between this doc and a source, **this doc wins** — then update the source.
