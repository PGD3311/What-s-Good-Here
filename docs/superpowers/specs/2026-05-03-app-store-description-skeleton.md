# App Store Description — Voice Scaffold

**Date:** 2026-05-03
**Status:** Skeleton + voice prompts. Dan fills the prose; structure is locked. Target ≤4000 chars (currently ~2400 with notes; final prose will land ~1800–2400).

This is the doc Dan opens when he sits down to write the description. Each section has the structure, the slot, and 2–3 voice options Dan can pick from or remix. Reviewer-facing copy has been kept out — that lives in the reviewer-notes doc.

---

## Voice constants (from `feedback_app_soul`)

- The app talks to the user. Editorial > data. Opinion > list.
- The energy: a local handing you a tip at the ferry terminal — not a spreadsheet.
- Real island facts, not marketing copy. Credibility matters.
- Aware of time, season, trends. Alive.

**Forbidden words:** "the best app for", "discover", "experience", "redefine", "revolutionize", "powered by AI". Anything that sounds like a Series A pitch.

---

## §1 — Hook (≤200 chars, lands above the fold on App Store)

This is the first sentence a user reads when they tap "more" on your listing. It either earns the next paragraph or it doesn't.

**Option A — local-tip voice (closest to memory):**
```
What's Good Here is the local tip you'd get at the ferry terminal —
which dish at which restaurant, ranked by people who actually eat here.
```

**Option B — wedge-first:**
```
The best app on Martha's Vineyard isn't a restaurant list. It's a
ranked list of dishes — the lobster roll at the place down the road,
not the place with five stars.
```

**Option C — opinionated:**
```
Stop reading restaurant reviews. You're not eating the restaurant —
you're eating the lobster roll. We rank dishes.
```

**Pick one, edit ruthlessly. The hook is half the listing.**

---

## §2 — The wedge (~3–4 sentences)

What makes WGH different from Yelp, Beli, Google Maps. From memory: dish-level vs restaurant-level. Map-first vs list-first. Locally rated vs algorithmic.

**Slot:**
```
[Most apps rank restaurants. We rank dishes — because that's what you
eat. Most apps show you a list. We show you a map of what's good
right around you. Most apps blend a million reviews into a five-star
average. We let people who actually ate it tell you on a 1–10 scale.]
```

The bracketed text is a draft. **Dan: rewrite in your voice. Three tries:**

1. The "we vs they" framing above (clean, but a little sales-y)
2. A "here's how this works" explainer voice (more honest, less punchy)
3. A single-sentence wedge ("It's like Beli, but for the lobster roll, not the lobster shack") — needs naming a competitor, which is risky in App Store copy

---

## §3 — How it works (4 short bullets)

Concrete. No abstractions. Reviewer + user both want to know what they'll DO in this app.

```
- Browse dishes ranked by people who actually ate them
- Switch to map mode to see what's good right around you
- Rate dishes 1–10 — your ratings build your taste profile
- Save favorites. Track the dishes that mattered.
```

**Voice notes:**
- "Save favorites" → consider "Bookmark the lobster roll you can't stop thinking about"? (More voice. Less generic. Cut if too cute.)
- The 4th bullet is weak. Rewrite to land the "food identity" framing — this is your wedge, not a feature.

---

## §4 — Coverage (1 sentence, factual)

**KEEP THIS NEUTRAL.** Don't claim a geofence we don't enforce. Don't promise expansion timing. (See reviewer-notes doc — saying "MV only" is falsifiable because towns.js already supports Nantucket and Cape Cod.)

**Slot:**
```
Currently focused on Martha's Vineyard — coastal Massachusetts coverage
expanding as it earns the data quality.
```

**Voice notes:**
- "Earns the data quality" is a soft signal that we don't ship empty regions. Keep.
- Don't say "Memorial Day" or any date. The description doesn't get re-reviewed when you edit it; promo text does. Save dated language for the promo field.

---

## §5 — Closing line (1 sentence, emotional)

The line that sits in the user's head after they close the listing. Make it specific, not generic.

**Option A:**
```
The dish makes the meal. Find yours.
```

**Option B:**
```
For people who'd rather eat the lobster roll than read a hundred
five-star reviews of the place that serves it.
```

**Option C — quietest, possibly best:**
```
What's good here? Now you know.
```

---

## §6 — What NOT to put in the description

- Apple keywords from the keyword field. They're indexed separately; repeating wastes characters.
- Press quotes you don't have.
- Roadmap / "coming soon" features.
- Memorial Day or any launch date (use the promo-text field — it's editable post-submission without re-review).
- Comparison to competitors by name (Yelp, Beli, Google) — keep wedge specific to product behavior, not competitor names.
- "Privacy-first" / "no ads" — those go in privacy nutrition labels and reviewer notes; in description copy they read defensive.

---

## §7 — Length budget (≤4000 chars total)

| Section | Char budget | Notes |
|---|---|---|
| Hook | ≤200 | One sentence, ruthlessly edited |
| Wedge | ≤500 | 3–4 sentences max |
| How it works | ≤300 | 4 bullets |
| Coverage | ≤150 | 1 sentence |
| Closing | ≤100 | 1 sentence |
| **Total** | **≤1250** | Leaves 2750 chars headroom — use them only if you have something earned to say |

The first version users see is the first ~170 chars (above the "more" fold on the listing card). Make sure the hook fits there with room.

---

## §8 — Final-write checklist

Before pasting into App Store Connect:

- [ ] Read it aloud. Does it sound like Dan, or does it sound like an AI?
- [ ] Cut every sentence that could appear in any food-app description.
- [ ] Verify no falsifiable claims (no "100% local", no "every dish on the island").
- [ ] No competitor names.
- [ ] Hook fits in 170 chars (above-the-fold).
- [ ] No emoji unless one earns its place.
- [ ] Promo text (≤170 chars, editable post-launch) drafted separately — has the seasonal/dated language the description shouldn't carry.
