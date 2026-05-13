# App Store Screenshots — Paste-Ready

**Date:** 2026-05-13
**Resolution:** 1290 × 2796 (6.7"/6.9" iPhone Pro Max — meets Apple's primary required size)
**Captured from:** local dev server (`npm run dev`) via Playwright with mobile emulation + MV geolocation. Brand refresh from PR #157 is rendered. iOS-simulator captures would look identical at this size.

## Files

| File | Caption | Scene |
|---|---|---|
| `01-map-mode.png` | `Find the best dish nearby` | Map mode, MV islands visible, dish pins clustered |
| `02-top10-list.png` | `What's actually good here` | Home / list mode — brand header + chalkboards + Locals' Picks + Top Rated Nearby |
| `03-dish-detail.png` | `Real ratings, real reviews` | Grilled Octopus @ Sweet Life Cafe — 8.5 rating, 18 ratings, reviews, Jitter verification, Rate this dish CTA |
| `05-restaurant-detail.png` | `Order with confidence` | La Choza MV — menu highlights, categories, Order Now |

## Still missing — needs you, signed in

**Shot 4 — Profile / journal (`04-profile-journal.png`)**

Requires auth, so I couldn't automate it cleanly. Easiest path: sign into the demo account on the iOS Simulator and capture there with ⌘S.

Demo account (from memory): `walshdaniel143+wghdemo@gmail.com` / `WGH33!`

Target scene per the listing-assets shot list:
- Profile page (`/profile`) showing the journal feed
- 5+ rated dishes visible
- Hero identity card with name + taste fingerprint

Or, equivalent web capture if you don't want to fight Xcode: `http://localhost:5173/profile` signed in.

## Upload order in App Store Connect

Apple shows screenshots in the order you upload them. Recommended order — strongest wedge first:

1. `01-map-mode.png` — the wedge (map-first, not list-first)
2. `02-top10-list.png` — the proof (crowd-ranked)
3. `03-dish-detail.png` — the depth (per-dish reviews)
4. `04-profile-journal.png` — the hook (your food life)
5. `05-restaurant-detail.png` — the close (order with confidence)

## Notes / spot-issues to fix before upload

- **`01-map-mode.png`:** the bottom-left has a partial "Dish categories" sheet hint peeking up — that's the category chip strip clipped. Either crop it out in Preview or re-capture with the category sheet collapsed. Apple won't reject for it, but it's a polish point.
- **`02-top10-list.png`:** "Top Rated Nearby" section shows only dish #1 + #2 + part of "Arctic Char" #3. If you want all three medals visible above the fold, scroll down ~80pt before capture, but the current crop reads fine as-is.
- **`03-dish-detail.png`:** the reviews section ends with a vertical card slice on the right edge (horizontal scroll teaser). Acceptable — signals more content. If it bothers you, crop tighter.
- **`05-restaurant-detail.png`:** all-coral "Order Now" bar at the bottom is strong. Menu highlights have a few "No votes yet" rows — that's real data state, not a problem to show.

## Regeneration

If you want me to recapture any of these (e.g. after another UI tweak), the script lives at `/tmp/wgh-screenshots/capture-4.mjs`. Requires `npm run dev` running on localhost:5173.
