# Locals Homepage Redesign — Spec

**Date:** March 31, 2026
**Status:** Draft
**Mockup:** `.superpowers/brainstorm/9592-1774986699/content/locals-chalkboard-aggregate.html`

---

## Summary

Two changes to the homepage that surface local list data in the editorial chalkboard row and redesign the local lists section at the bottom.

1. **Locals Aggregate Chalkboards** — two new cards at the END of the chalkboard row showing the dish and restaurant that appear most frequently across all local lists
2. **Local Lists as Menu Cards** — redesign the bottom-of-page local lists section with restaurant-grouped menu-style cards

Plus: remove the color-coded-by-town restaurant initial avatars from restaurant display everywhere.

---

## Part 1: Locals Aggregate Chalkboards

### What

Two new chalkboard cards appended to the end of the existing editorial chalkboard scroll row. They aggregate ALL local lists and surface the consensus picks.

### Card 1: "Locals Agree" (Most-Appearing Dish)

- **Tag:** "🏆 locals agree"
- **Title:** Name of the dish that appears on the most local lists (e.g., "Lobster Roll")
- **Subtitle:** Restaurant name (e.g., "Larsen's Fish Market")
- **Stat badge:** "On 4 of 5 local lists" (count of lists containing this dish / total lists)
- **CTA:** "see why →"
- **Tap action:** Navigate to `/dish/:dishId`
- **Visual distinction:** Same chalkboard frame as all other cards — no special treatment. Slightly wider card (185px vs 155px standard) to fit the count badge.

### Card 2: "Island Favorite" (Most-Appearing Restaurant)

- **Tag:** "📍 island favorite"
- **Title:** Restaurant name (e.g., "Larsen's")
- **Subtitle:** Location detail (e.g., "Fish Market · Menemsha")
- **Stat badge:** "On every local list" or "On 4 of 5 local lists"
- **CTA:** "see the menu →"
- **Tap action:** Navigate to `/restaurants/:restaurantId`
- **Visual distinction:** Same standard chalkboard frame as all other cards. Slightly wider to fit count badge.

### Data Source

Query `local_list_items` joined with `local_lists` to count:
- Which `dish_id` appears in the most distinct lists → Card 1
- Which `restaurant_id` appears in the most distinct lists → Card 2

If there are ties, use the highest-rated dish/restaurant as tiebreaker.

If fewer than 2 local lists exist, don't show these cards (not enough data for "locals agree" to mean anything).

### Placement

Appended to the END of the chalkboard row, after all existing editorial cards (time-of-day, highest rated restaurant, chowder debate, most talked about, best value meal, best ice cream).

---

## Part 2: Local Lists as Menu Cards

### What

Redesign the `LocalListsSection` component. Replace the current white expandable card format with restaurant-grouped menu-style cards on cream parchment.

### Section Header

Centered title with flanking horizontal lines (same pattern as "Browse by Category" divider):

```
——— A Local's Guide to Martha's Vineyard ———
         Curated by people who live here
```

- Title in Amatic SC, 26px, bold. "Martha's Vineyard" in `var(--color-primary)`.
- Lines: 1px `var(--color-divider)`, flex to fill available space.
- Subtitle: 11px, `var(--color-text-tertiary)`, centered.

### Placement

Below the Top Rated Nearby dish list (at the bottom of the homepage scroll). Above the bottom nav safe area.

### Menu Card Design

Horizontal scroll of cream parchment cards (270px wide, scroll-snap).

Each card contains:
1. **Curator header:** Avatar circle (32px, colored) + name in Amatic SC 24px + tagline in italic 10px
2. **Divider line**
3. **Dishes grouped by restaurant:**
   - Restaurant name in Amatic SC 18px, `var(--color-accent-gold)`
   - Each dish row: name (13px, 500 weight) + dotted leader + rating (13px, 700 weight, `var(--color-rating)`)
4. **Footer:** "N restaurants · N dishes" stats + "See full list →" CTA in `var(--color-primary)`

Card styling:
- Background: `#FFFDF8` (warm cream)
- Border: `1px solid rgba(0,0,0,0.04)`
- Shadow: `0 1px 3px rgba(0,0,0,0.06), 0 6px 20px rgba(0,0,0,0.07)`
- Border-radius: 3px
- Subtle paper texture via radial gradients (gold top-right, coral bottom-left at 2% opacity)

### Tap Behavior

- Tap "See full list →" → navigates to `/user/:userId` (curator's profile where full list is visible)
- Tap a dish row → navigates to `/dish/:dishId`
- Tap a restaurant name → navigates to `/restaurants/:restaurantId`

### Data

Uses existing `useLocalLists` and `useLocalListDetail` hooks. The restaurant grouping is done client-side: group `local_list_items` by `restaurant_id`, sort groups by the first item's position in the list.

---

## Part 3: Remove Restaurant Initial Avatars

### What

Remove the color-coded-by-town initial circle avatars (e.g., a coral "L" circle for Larsen's) from restaurant display throughout the app.

### Where They Appear

- `RestaurantAvatar` component (if it exists)
- Restaurant list items on `/restaurants`
- Restaurant cards in various contexts
- Curator avatar circles in LocalListsSection can stay (those are people, not restaurants)

### Replacement

Replace initial circles with the **category food icons** from `public/categories/icons/`. Map the restaurant's `cuisine` field to the matching icon:

- Seafood restaurant → `seafood.webp`
- Pizza place → `pizza.webp`
- Sushi restaurant → `sushi.webp`
- General/American → use the restaurant's most-voted dish category icon
- No cuisine set → use a generic utensils icon or the app logo

Same size as current avatars (~38-48px), rounded square (border-radius: 10px) with `var(--color-surface)` background — matches the dish icon treatment in `DishListItem`. The icon tells you what kind of food the place serves, not what town it's in.

---

## What's NOT Changing

- The existing editorial chalkboard cards (Breakfast, Porto Pizza, Chowder, etc.) — unchanged
- The "Browse by Category" section — unchanged
- The "Top Rated Nearby" ranked dish list — unchanged
- The Map FAB and map mode — unchanged
- Bottom nav — unchanged

---

## Success Criteria

1. A first-time visitor sees "Locals Agree: [Dish]" in the chalkboard row within their first scroll
2. Scrolling to the bottom reveals menu-style cards that feel like picking up a local's personal guide
3. Tapping the aggregate chalkboard takes you directly to the dish/restaurant page
4. No color-coded initial avatars remain on restaurant display
5. `npm run build` passes
6. `npm run test` passes
