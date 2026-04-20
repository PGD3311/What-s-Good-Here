# Profile Redesign — Journal + Identity Card

## Summary

Two different profile experiences depending on whose profile you're viewing:
- **Your own profile** → The Journal (chronological food diary)
- **Someone else's profile** → The Identity Card (who they are as an eater, at a glance)

## Core Insight

Your own profile is personal — it's YOUR diary, your food life unfolding. Other people's profiles are about quick understanding — who is this person as an eater?

## My Profile — The Journal

**Layout (top to bottom):**
1. **Minimal header** — "Your Journal" in Amatic SC, small avatar + name + one-line stats ("87 dishes · 14 restaurants · Martha's Vineyard"), thin divider
2. **Chronological journal entries** — grouped by date markers (Today, Yesterday, 3 days ago, Last week, dates)
3. **Each entry** — card with category icon (56px), dish name (16px bold), restaurant (11px), review snippet (12px italic, 2-line clamp), rating number (28px bold, right-aligned)
4. **Pagination** — "Show more" link at bottom

**What's removed:**
- Dashboard cards (Recent Meals, Highlights) — the journal IS recent meals
- Shelf filter tabs (Good Here, Heard That's Good, Wasn't Good) — killed per design decision, journal shows all rated dishes chronologically
- Share My Picks button from hero — move to a menu/action

**What stays:**
- Jitter trust badge (in the header row, same as current)
- Display name editing (tap to edit)
- Follow counts (accessible but not dominant)

## Other Profile — The Identity Card

**Layout (top to bottom):**
1. **Centered hero** — back arrow, large avatar (80px), name (24px bold), one-line tagline ("Seafood obsessed · Harsh critic · MV local"), Follow button
2. **Stats strip** — 3-column card: dishes count, restaurants count, avg rating (green)
3. **Taste match** — "72% taste match with you — you both love seafood and The Bite"
4. **Their Top Picks** — top 3 rated dishes with rank medals, name, restaurant, rating
5. **Food Identity tags** — colored badges (Seafood Expert, Harsh Critic, MV Local, Adventurous) derived from their voting data
6. **Recent activity** — simple rows: dish name, restaurant, time ago, rating

## File Changes

- `src/pages/Profile.jsx` — refactor to journal layout
- `src/pages/UserProfile.jsx` — refactor to identity card layout
- `src/components/profile/JournalFeed.jsx` — simplify to pure chronological, remove shelf filtering
- `src/components/profile/JournalCard.jsx` — redesign to journal entry card
- `src/components/profile/HeroIdentityCard.jsx` — split into two: minimal journal header (own) vs centered identity hero (other)
- `src/components/profile/ShelfFilter.jsx` — remove (no longer needed)
- May need new: `IdentityTags.jsx`, `TasteMatch.jsx`, `TopPicks.jsx`

## Design Tokens

All existing WGH tokens. Key ones:
- Date markers: `#C48A12` (gold), 10px bold uppercase
- Journal cards: white on warm stone, 14px border-radius
- Rating numbers: 28px/800 weight, color from `getRatingColor()`
- Review text: 12px italic, `--color-text-secondary`
- Identity tags: colored pills (coral, black, gold, green) with white text

## What's NOT in scope
- Food Map visualization
- Badge system
- Jitter trust display (defer to later)
- "Heard That's Good" / favorites (removed for now, add back later)
