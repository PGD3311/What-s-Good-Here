# App Store Connect — Reviewer Notes (final form)

**Date:** 2026-05-03 (last touched 2026-05-06)
**Status:** Final-form copy ready to paste into App Store Connect → "App Review Information" → "Notes". Demo credentials filled in; no remaining blanks.

This replaces the §2 stub in `docs/superpowers/specs/2026-04-27-app-store-listing-assets.md`. Codex (gpt-5.4 / high) reviewed the prior draft 2026-05-03 — this version applies its findings.

---

## 1. Reviewer notes — paste into ASC

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

---

## 2. Pre-submission checklist

Before pasting into ASC, verify each placeholder is real:

- [x] Demo account credentials filled in (created 2026-05-04)
- [x] Demo account is populated (5 rated dishes, profile name set — sufficient for "not empty" reviewer bar). §1 wording softened 2026-05-06 to match actual account state (no photo claim, no favorites claim).
- [ ] `https://wghapp.com/privacy` resolves to a live Privacy page (not 404)
- [ ] `https://wghapp.com/terms` resolves to a live Terms page (not 404)
- [ ] `wghapp@wghapp.com` is monitored OR forwards to a monitored address
- [ ] Account deletion path actually works on a fresh test account (smoke test)
- [ ] The submitted build can sign in with the demo email + password (do this on TestFlight before promoting to App Store review)

---

## 3. What changed vs the previous draft (Codex critique applied)

- **Recommended only one auth path** (email + password). Apple sign-in is feature-gated on `VITE_FEATURES_APPLE_SIGNIN`; native Google requires the iOS client ID provisioned. Don't advertise auth methods we can't guarantee in the submitted build.
- **Demo-account self-own fixed.** Explicitly tell reviewers not to delete the shared demo account; tell them how to test deletion safely.
- **Cut coverage-area paragraph.** Towns constants already include Nantucket, Cape Cod, Boston — claiming "MV only" is falsifiable.
- **Lead with "Location is optional"** instead of "Allow location" — matches the actual UX (app works without location).
- **Replaced "people who actually ate them"** (unverifiable) with "community-submitted 1–10 ratings."
- **Added UGC-safety block** citing Guideline 1.2: report/block flows + photo moderation. H3 reporting/blocking is shipped per memory.
- **Removed internal file-path references** (PrivacyInfo.xcprivacy, Info.plist) — reviewers can't verify those, only binary behavior.
- **Email unified to `wghapp@wghapp.com`** (matches Privacy.jsx and Terms.jsx).
- **Cut 30–40% length** per Codex — reviewer notes should read like test instructions, not internal rationale.

## 4. What NOT to add

- Marketing language ("the best app for foodies!"). Reviewers ignore it.
- Feature roadmap or post-launch plans. They review what's submitted.
- Apologies, qualifications, or "we know this is rough." Builds reviewer doubt.
- Anything tying the submission to a marketing date (Memorial Day, etc.). Apple does not accelerate review for marketing dates.
- Sign-in methods that aren't verified active in the submitted build.
