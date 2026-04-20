# Profile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform own-profile into a food journal and other-profiles into identity cards.

**Architecture:** Modify Profile.jsx to remove dashboard cards, shelf filter, and share button — replace with simplified journal header + chronological JournalFeed. Modify JournalFeed to add date group headers and remove shelf logic. Redesign JournalCard for journal-entry styling. UserProfile.jsx gets identity card layout later (Task 4).

**Tech Stack:** React 19, existing hooks (useUserVotes, useProfile, useFavorites), WGH design tokens

---

### Task 1: Simplify Profile.jsx — Journal Layout

**Files:**
- Modify: `src/pages/Profile.jsx`

- [ ] **Step 1: Remove imports and state no longer needed**

Remove: `ShelfFilter`, `SharePicksButton` imports. Remove `SHELVES` constant. Remove `activeShelf` state. Remove `favorites`/`useFavorites` hook (heard is killed). Remove `enrichedAvoid` memo (avoid still exists in data, just not shown separately). Keep: `useFavorites` import removed, `ShelfFilter` import removed, `SharePicksButton` import removed.

- [ ] **Step 2: Replace the JSX between HeroIdentityCard and JournalFeed**

Remove:
- Dashboard cards section (lines ~254-369: "Recent" + "Highlights" cards)
- SharePicksButton section (lines ~371-377)
- ShelfFilter section (lines ~414-419)

Replace with a simple journal title + divider:
```jsx
{/* Journal title */}
<div style={{ padding: '16px 20px 0' }}>
  <h2 style={{
    fontFamily: "'Amatic SC', cursive",
    fontSize: '28px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  }}>
    Your Journal
  </h2>
</div>
```

- [ ] **Step 3: Simplify JournalFeed props — remove shelf filtering**

Change JournalFeed invocation to only pass worthIt + avoid combined (no shelf, no heard):
```jsx
<JournalFeed
  entries={enrichedWorthIt.concat(enrichedAvoid)}
  loading={votesLoading}
/>
```

- [ ] **Step 4: Clean up unused state and variables**

Remove: `activeShelf`, `SHELVES`, `handleTriedIt` (heard is gone), favorites-related code. Keep unrated photos banner and DishModal — those still work.

- [ ] **Step 5: Run build and verify**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 6: Commit**

```bash
git add src/pages/Profile.jsx
git commit -m "refactor: simplify Profile to journal layout — remove shelves, dashboard cards, share button"
```

---

### Task 2: Redesign JournalFeed — Date Groups, No Shelves

**Files:**
- Modify: `src/components/profile/JournalFeed.jsx`

- [ ] **Step 1: Change props interface**

New props: `entries` (pre-merged array of dishes with `voted_at`), `loading`. Remove: `worthIt`, `avoid`, `heard`, `activeShelf`, `onTriedIt`.

- [ ] **Step 2: Add date grouping logic**

Group entries by date label (Today, Yesterday, N days ago, or formatted date). Sort reverse-chronological first, then group.

```jsx
function getDateLabel(timestamp) {
  if (!timestamp) return ''
  var date = new Date(timestamp)
  var now = new Date()
  var diffMs = now - date
  var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return diffDays + ' days ago'
  if (diffDays < 14) return 'Last week'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
```

- [ ] **Step 3: Render with date headers**

```jsx
// Sort entries
var sorted = entries.slice().sort(function(a, b) {
  return new Date(b.voted_at || 0) - new Date(a.voted_at || 0)
})

// Group and render with date markers
var lastLabel = ''
var visibleEntries = sorted.slice(0, visibleCount)

return (
  <div style={{ padding: '0 16px 16px' }}>
    {visibleEntries.map(function(dish) {
      var label = getDateLabel(dish.voted_at)
      var showLabel = label !== lastLabel
      lastLabel = label
      return (
        <div key={dish.dish_id || dish.id}>
          {showLabel && (
            <div style={{
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--color-accent-gold)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              padding: '14px 0 6px',
            }}>
              {label}
            </div>
          )}
          <JournalCard dish={dish} />
        </div>
      )
    })}
    {/* Show more button */}
  </div>
)
```

- [ ] **Step 4: Run build and verify**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/JournalFeed.jsx
git commit -m "refactor: JournalFeed — date-grouped chronological, remove shelf filtering"
```

---

### Task 3: Redesign JournalCard — Journal Entry Style

**Files:**
- Modify: `src/components/profile/JournalCard.jsx`

- [ ] **Step 1: Simplify to single variant**

Remove `variant` prop, remove "heard" variant entirely. Every card is a rated dish. Keep the Link wrapper to `/dish/:id`.

- [ ] **Step 2: Implement journal entry layout**

Layout: `[icon 56px] [dish name + restaurant + review snippet] [big rating]`

```jsx
export function JournalCard({ dish }) {
  var dishName = dish.dish_name || dish.name
  var restaurantName = dish.restaurant_name
  var dishId = dish.dish_id || dish.id
  var categoryId = dish.category
  var photoUrl = dish.photo_url
  var rating = dish.rating
  var reviewText = dish.review_text
  var wouldOrderAgain = dish.would_order_again

  return (
    <Link
      to={'/dish/' + dishId}
      data-testid="journal-card"
      className="flex gap-3 rounded-xl"
      style={{
        background: 'var(--color-card)',
        padding: '14px',
        marginBottom: '8px',
        textDecoration: 'none',
        opacity: wouldOrderAgain === false ? 0.7 : 1,
      }}
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '12px',
          background: 'var(--color-category-strip)',
        }}
      >
        {photoUrl ? (
          <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
        ) : (
          <CategoryIcon categoryId={categoryId} dishName={dishName} size={40} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          {dishName}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>
          {restaurantName}
        </div>
        {reviewText && (
          <div style={{
            fontSize: '12px',
            color: 'var(--color-text-secondary)',
            marginTop: '6px',
            fontStyle: 'italic',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            "{reviewText}"
          </div>
        )}
      </div>

      {/* Rating */}
      {rating != null && (
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{
            fontSize: '28px',
            fontWeight: 800,
            color: getRatingColor(rating),
            lineHeight: 1,
          }}>
            {Math.round(rating)}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>/10</div>
        </div>
      )}
    </Link>
  )
}
```

- [ ] **Step 3: Run build and verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/JournalCard.jsx
git commit -m "refactor: JournalCard — clean journal entry style, remove heard variant"
```

---

### Task 4: Update barrel export — remove ShelfFilter from Profile imports

**Files:**
- Modify: `src/components/profile/index.js`

- [ ] **Step 1: Remove ShelfFilter from barrel if it's only used in Profile**

Check if ShelfFilter is used in UserProfile.jsx. If yes, keep the export. If no, remove.

- [ ] **Step 2: Run build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/components/profile/index.js
git commit -m "chore: clean up profile barrel exports"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run full build**

Run: `npm run build`

- [ ] **Step 2: Run tests**

Run: `npm run test`

- [ ] **Step 3: Visual check in dev server**

Run: `npm run dev` — check `/profile` page loads, journal entries display, date groups work, jitter badge shows.

- [ ] **Step 4: Commit any fixes and push**

```bash
git push origin main
```
