# App Store Connect — App Privacy details

Draft answers for the App Privacy questionnaire in App Store Connect. Paste into the form when creating the app record. Based on code audit of WGH as of 2026-04-19 (post-H3, post-L1, post-L3).

**Apple framing reminder:** "Tracking" = using data to track a user across apps/sites owned by other companies, OR sharing user data with data brokers. We do NONE of this. Every answer below should mark "Not used for tracking."

---

## Data types we collect

Check these in the form:

### Contact Info
- [x] **Email Address** — collected
- [x] **Name** — collected (display name; from Google/Apple OAuth or user-set)
- [ ] ~~Phone Number~~ — not collected
- [ ] ~~Physical Address~~ — not collected
- [ ] ~~Other User Contact Info~~ — not collected

### Health & Fitness
- [ ] — none

### Financial Info
- [ ] — none

### Location
- [x] **Coarse Location** — collected (in-session only; not stored on servers — used to show nearby dishes/restaurants)
- [ ] ~~Precise Location~~ — technically coarse because we only use it for nearby lookups, never store the exact coords

### Sensitive Info
- [ ] — none

### Contacts
- [ ] — none

### User Content
- [x] **Photos or Videos** — collected (dish photos user uploads)
- [x] **Other User Content** — collected (ratings, reviews, favorites, playlists, reports, blocks)
- [ ] ~~Emails or Text Messages~~
- [ ] ~~Audio Data~~
- [ ] ~~Gameplay Content~~
- [ ] ~~Customer Support~~ — interactive support chat is via email only, not captured in-app

### Browsing History
- [ ] — none

### Search History
- [x] **Search History** — collected (in-app search queries for dishes/restaurants; stored in PostHog events for product improvement)

### Identifiers
- [x] **User ID** — collected (Supabase auth.users.id; core to the app)
- [x] **Device ID** — collected (PostHog and Sentry each assign one for session stitching)

### Purchases
- [ ] — app is free; no IAP

### Usage Data
- [x] **Product Interaction** — collected (PostHog analytics: page views, feature interactions, session recordings with form inputs masked)
- [x] **Advertising Data** — ❌ **NO** — we don't serve or partner with ad networks
- [ ] ~~Other Usage Data~~

### Diagnostics
- [x] **Crash Data** — collected (Sentry — crashes include device model, OS, browser, stack trace)
- [x] **Performance Data** — collected (Sentry Session Replay on error; PostHog session recordings)
- [x] **Other Diagnostic Data** — collected (Sentry breadcrumbs)

### Surroundings
- [ ] — none

### Body
- [ ] — none

### Other Data
- [x] **Other Data** — collected: **keystroke cadence patterns (Jitter Protocol)** for bot/fraud prevention on reviews. See disclosure wording below. This is the judgment-call answer — worth flagging with Apple reviewer if they ask.

---

## For each data type: the four follow-up questions

Apple asks four things about every checked data type. Standard answers for WGH follow.

### Q1: Is this data used for tracking?
**NO** for all data types. We do not:
- Share data with data brokers
- Match user data with third-party data for ad targeting
- Use data across apps/sites owned by other companies for advertising

PostHog and Sentry are service providers processing data on our behalf — they're not independently using it for tracking (per their DPA-level agreements).

### Q2: Is this data linked to the user's identity?

| Data type | Linked? | Why |
|---|---|---|
| Email | ✅ Yes | Account identifier |
| Name | ✅ Yes | Display name on profile, reviews |
| Coarse Location | ❌ No | In-session only, never persisted with user ID |
| Photos | ✅ Yes | User-uploaded content shown with attribution |
| Other User Content (ratings/reviews/favorites/playlists/reports/blocks) | ✅ Yes | Core data, linked to auth.users.id |
| Search History | ✅ Yes | PostHog events attached to identified user |
| User ID | ✅ Yes | Inherently |
| Device ID | ✅ Yes | PostHog identifies devices to users on login |
| Product Interaction | ✅ Yes | PostHog events linked to user |
| Crash Data | ✅ Yes | Sentry user scope is set when logged in |
| Performance Data | ✅ Yes | Linked via session recording + replay |
| Other Diagnostic Data | ✅ Yes | Sentry breadcrumbs linked to session |
| Other Data (Jitter cadence) | ✅ Yes | Stored under user account |

### Q3: What are the purposes of using this data?

Allowed purposes per Apple: Third-Party Advertising, Developer's Advertising or Marketing, Analytics, Product Personalization, App Functionality, Other.

| Data type | Purposes |
|---|---|
| Email | App Functionality |
| Name | App Functionality |
| Coarse Location | App Functionality |
| Photos | App Functionality |
| Other User Content | App Functionality |
| Search History | Analytics |
| User ID | App Functionality, Analytics |
| Device ID | Analytics |
| Product Interaction | Analytics, Product Personalization |
| Crash Data | Analytics (bug detection) |
| Performance Data | Analytics |
| Other Diagnostic Data | Analytics |
| Other Data (Jitter cadence) | App Functionality (fraud / bot prevention) |

### Q4: Is this data collection optional?

- **Account creation data** (email, name, user ID) — required to create an account; optional in the sense that users choose whether to sign up
- **Location** — explicit permission prompt; can be declined and the app still works (shows default MV content)
- **Photos** — optional; users upload if they want to
- **Jitter cadence** — measured automatically while typing a review; users can skip writing reviews entirely

---

## App Privacy "Data Used to Contact You" section

**Primary contact:** `hello@whatsgoodhere.app`
**Developer:** Daniel Walsh (individual enrollment)
**Support URL:** `https://whats-good-here.vercel.app/support` (or the final custom domain once set)
**Privacy Policy URL:** `https://whats-good-here.vercel.app/privacy`
**Marketing URL (optional):** `https://whats-good-here.vercel.app` (homepage works as marketing)

---

## Reviewer-notes draft (for the "Notes for Reviewer" field)

Paste this into the App Store Connect "App Review Information → Notes" field. It preempts the most likely reviewer questions:

> What's Good Here is a community food-rating app for Martha's Vineyard. Users rate dishes, write reviews, upload photos, and build food playlists.
>
> **Moderation:** Every review, photo, dish, and user profile has a Report affordance (three-dot menu). Reports go to an admin queue with 48h SLA. Users can also Block other users (tap kebab on their profile → Block); the Blocked users list is managed in Settings → gear icon → Blocked users.
>
> **Account deletion:** Settings → gear icon → Delete Account. Requires typing "DELETE" to confirm. Immediately removes votes, reviews, photos, favorites, playlists, and profile.
>
> **Sign-in methods:** Google OAuth and Apple Sign-In (both wired; Apple is the default offered alongside Google on the login modal).
>
> **Jitter Protocol (keystroke cadence):** We measure typing cadence on reviews to detect bot-generated content. This is disclosed in our Privacy Policy and is not used to identify individual users.
>
> **Google Places data:** Used to help users discover and add unclaimed restaurants. Attribution ("Google Maps" or "Powered by Google") is shown wherever Places data appears. Places data is only rendered in list views, never on our Leaflet map, per Google's TOS.
>
> **Test account for Apple reviewer:** [fill in: email + password of a pre-populated test account so reviewer can see the full app without signing up]

---

## Things to double-check before submitting

- [ ] All Privacy URLs resolve (test `/privacy`, `/terms`, `/support`)
- [ ] Test account created and documented in reviewer notes
- [ ] Apple Sign-In actually wired on the login modal (H2 must ship before submission — see `docs/superpowers/plans/2026-04-13-h2-sign-in-with-apple.md`)
- [ ] Privacy policy physical address reflects whatever mailing address Dan sets up (currently email-only — may need a UPS Store PMB address before submission depending on reviewer strictness)
- [ ] `attributions` field display confirmed rendering on RestaurantDetail + NearbyPlaceCard in prod

---

## Caveats on specific answers

**Location precision.** Apple's definition: "Precise Location" is location that allows the device/user to be identified with a typical accuracy of three meters or better. Browser `navigator.geolocation.getCurrentPosition()` without `enableHighAccuracy: true` returns coarser (~tens of meters) — we use the default. So **Coarse Location** is the correct Apple category for us. If we ever turn on `enableHighAccuracy: true` or use Core Location's precise flag in Capacitor, we'll need to switch this to Precise Location and re-submit.

**Why Jitter is "Other Data" not "Sensitive Info / Biometric."** Apple's "Biometric Data" category specifically covers fingerprints, face scans, voice prints — physical biometric identifiers. Keystroke cadence is behavioral-biometric-adjacent but Apple's category list doesn't have a "behavioral biometrics" bucket, so "Other Data" with an explanatory comment is the cleanest fit. Worth flagging with Apple reviewer in the notes if they ask.

**Why PostHog session recordings are "Performance Data" not "Customer Support."** Session replays are for our internal product improvement, not in response to user support tickets. If we ever use a replay to resolve a specific user's bug report, it's still analytics-driven, not customer-support-driven in Apple's sense.

**Why we skip "Purchases."** The app is free with no in-app purchases. When we eventually add paid tiers (B2B analytics, restaurant manager premium), we'll add this category and re-submit.
