# App Store Age Rating Questionnaire — Answers

**Date:** 2026-05-06
**Status:** Paste-ready answers for App Store Connect → "Age Rating" questionnaire.
**Expected result:** **12+** (driven by user-generated content + infrequent alcohol references via restaurant data).

App Store Connect computes the final age rating from these answers. There is no "I want 4+" override — Apple derives it. The bar to clear for our wedge: **avoid 17+** (which would happen with frequent/intense content, unrestricted web access, or graphic UGC).

---

## Apple Apps Age Rating Questionnaire (IARC-aligned)

### Violence & Gore

| Question | Answer | Rationale |
|---|---|---|
| Cartoon or Fantasy Violence | **None** | Food app — no characters, no combat. |
| Realistic Violence | **None** | Food app — no violence depicted. |
| Prolonged Graphic or Sadistic Realistic Violence | **No** | N/A. |
| Violence — Realistic, Prolonged Graphic | **No** | N/A. |

### Sexual Content

| Question | Answer | Rationale |
|---|---|---|
| Sexual Content or Nudity | **None** | None depicted. UGC reviews are filtered via `validateUserContent` (blocklist) and reportable. |
| Graphic Sexual Content and Nudity | **No** | N/A. Photos are user-uploaded dish images; review queue catches violations. |

### Profanity & Crude Humor

| Question | Answer | Rationale |
|---|---|---|
| Profanity or Crude Humor | **None** | UGC reviews pass `validateUserContent` profanity blocklist before display. Reportable post-display. |

### Suggestive / Mature Themes

| Question | Answer | Rationale |
|---|---|---|
| Mature/Suggestive Themes | **None** | Food and dining content only. |
| Horror/Fear Themes | **None** | N/A. |

### Medical / Treatment

| Question | Answer | Rationale |
|---|---|---|
| Medical/Treatment Information | **None** | App does not provide medical advice. |

### Alcohol, Tobacco, Drugs

| Question | Answer | Rationale |
|---|---|---|
| Alcohol, Tobacco, or Drug Use or References | **Infrequent or Mild** | ⚠️ Judgment call. Restaurant menus include cocktails, beer, wine; dish names and descriptions occasionally reference alcohol (e.g. "Aperol Spritz", "rum cake"). The app does not promote consumption. **"None" is defensible** if Apple reviewers parse "the app itself doesn't reference alcohol" — but **"Infrequent or Mild" is safer** because reviewers may search restaurant menus and find alcohol items. Recommend "Infrequent or Mild" to avoid a rejection-and-resubmit cycle. |

### Gambling

| Question | Answer | Rationale |
|---|---|---|
| Simulated Gambling | **None** | No gambling mechanics. |
| Real Gambling | **No** | N/A. |
| Contests | **No** | No contests, sweepstakes, or prize draws. |

### Web / External

| Question | Answer | Rationale |
|---|---|---|
| Unrestricted Web Access | **No** | App opens specific external URLs (restaurant sites, Order Now via Toast, Privacy/Terms pages). It is not a general-purpose browser. On native iOS, outbound links open via `@capacitor/browser` (SFSafariViewController) — a sandboxed Safari view, not a free-form WKWebView under our control. The user has no address bar, cannot navigate to arbitrary URLs from inside the app. |

### User-Generated Content

| Question | Answer | Rationale |
|---|---|---|
| User-Generated Content | **Yes** | Users submit dish ratings (1–10), text reviews (200 char max), and photos. |
| Does your app have UGC moderation controls? | **Yes** | (1) `validateUserContent` blocklist filters submissions before display. (2) Three-dot Report button on every review/photo/dish/profile. (3) Block button on user profiles. (4) Admin moderation queue with 48h SLA. (5) Photo moderation tier classification. |

### Medical / Healthcare

| Question | Answer | Rationale |
|---|---|---|
| Medical/Treatment Information | **None** | N/A — repeats the earlier question; same answer. |

### Other

| Question | Answer | Rationale |
|---|---|---|
| In-app purchases | **No** | App is free with no IAP. |
| Made for Kids | **No** | App is general audience, not specifically for children under 13. |

---

## Expected Final Rating

Based on the above, App Store Connect should derive: **12+**

The drivers for 12+:
- "Infrequent or Mild" alcohol references → 12+ minimum
- UGC with moderation controls → does not bump to 17+ when filtered/reported

If Dan answers "None" for alcohol, the rating will likely be **9+** or **4+** depending on Apple's UGC weighting. **Recommend 12+ for defensibility** — comparable category apps (Yelp, Beli, OpenTable, Resy) are rated 12+ to 17+. Going lower invites a "you have alcohol references" rejection.

---

## How to enter in App Store Connect

1. Go to **App Store Connect → My Apps → What's Good Here → App Information → Age Rating**
2. Click **Edit**
3. Answer each row above. The system auto-derives the final rating in real time as you click — verify it lands at **12+** when complete.
4. Save.

If Apple's questionnaire UI has questions not covered above, default to the most conservative "None" / "No" answer and document it inline in this file for the next session.

---

## Why not 4+

A "4+" rating is achievable only if alcohol = "None" AND UGC moderation is sufficient. Two risks:
1. **Reviewer can find alcohol in the restaurant data** — restaurants serve alcohol; their menus list cocktails; Apple's reviewer will see this when testing the demo account.
2. **UGC apps without explicit "Infrequent or Mild" mature content typically get pushed to 12+ on appeal.** Better to set 12+ at submission than fight an "incorrect age rating" rejection.

The App Store doesn't penalize a higher rating for installs — both 4+ and 12+ apps are downloadable by the same audience (subject to Screen Time controls).

---

## Why not 17+

17+ is for apps with frequent intense content. WGH would only reach 17+ if:
- We added unrestricted web access (in-app browser to arbitrary URLs)
- Reviews/photos showed graphic content unfiltered
- App promoted alcohol consumption (e.g. "best spots to get drunk")

None of these apply. 12+ is the correct band.
