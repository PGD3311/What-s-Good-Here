# Typography System: Amatic SC + Outfit

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a consistent two-font typography system (Amatic SC for display, Outfit for body) across the entire app, removing all legacy font references (DM Sans, Cormorant, Typekit/Aglet Sans).

**Architecture:** Remove Cormorant from Google Fonts link. Replace all inline `fontFamily` references to DM Sans and Cormorant with either Amatic SC (display headings) or nothing (inherit Outfit from body). Add Amatic SC section headers to pages that currently have no display font treatment.

**Tech Stack:** Google Fonts (Amatic SC 700, Outfit 300-800), CSS custom properties, inline React styles.

---

## Font Roles

| Font | CSS value | Role | Where |
|------|-----------|------|-------|
| Amatic SC | `'Amatic SC', cursive` | Display: brand name, section headers, page titles, empty states | Headings, section labels |
| Outfit | `'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | Body: everything else | Inherited from body in index.css |
| SF Mono | `'SF Mono', 'Fira Code', 'Cascadia Code', monospace` | Technical: Jitter badges only | No changes needed |

## Files to Modify

| File | Change |
|------|--------|
| `index.html` | Remove Cormorant from Google Fonts link |
| `src/pages/Dish.jsx:553,606` | Remove DM Sans fontFamily (inherit Outfit) |
| `src/pages/Login.jsx:202` | Change Cormorant → Amatic SC, match homepage treatment |
| `src/components/WelcomeSplash.jsx:79` | Change Cormorant → Amatic SC |
| `src/components/Auth/WelcomeModal.jsx:122` | Change Cormorant → Amatic SC |
| `src/pages/Browse.jsx` | Add Amatic SC section header |
| `src/pages/Restaurants.jsx` | Add Amatic SC section headers |
| `src/pages/RestaurantDetail.jsx` | Add Amatic SC restaurant name |
| `src/components/restaurants/RestaurantMenu.jsx` | Add Amatic SC menu section names |
| `src/pages/Profile.jsx` | Add Amatic SC section headers |
| `src/pages/UserProfile.jsx` | Add Amatic SC section headers |
| `src/pages/Discover.jsx` | Add Amatic SC section headers |
| `CLAUDE.md` | Update font documentation |

---

## Chunk 1: Remove Legacy Fonts + Fix Existing References

### Task 1: Clean up Google Fonts link

**Files:**
- Modify: `index.html:15`

- [ ] **Step 1: Remove Cormorant from the Google Fonts link**

Change line 15 from:
```html
<link href="https://fonts.googleapis.com/css2?family=Amatic+SC:wght@400;700&family=Cormorant:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
```
To:
```html
<link href="https://fonts.googleapis.com/css2?family=Amatic+SC:wght@400;700&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
```

Also update the comment above it:
```html
<!-- Fonts: Amatic SC (display/headers), Outfit (body) -->
```

- [ ] **Step 2: Verify the app still loads**

Run: `npm run dev` — confirm no font loading errors in browser console.

---

### Task 2: Fix Dish.jsx — remove DM Sans

**Files:**
- Modify: `src/pages/Dish.jsx:553,606`

- [ ] **Step 1: Remove fontFamily from dish name heading (line ~553)**

Find:
```jsx
fontFamily: "'DM Sans', sans-serif",
fontWeight: 800,
fontSize: '22px',
```
Replace with:
```jsx
fontWeight: 800,
fontSize: '22px',
```

The dish name inherits Outfit from body — correct per our system (data/readability = Outfit).

- [ ] **Step 2: Remove fontFamily from rating score (line ~606)**

Find:
```jsx
fontFamily: "'DM Sans', sans-serif",
fontWeight: 800,
fontSize: '40px',
```
Replace with:
```jsx
fontWeight: 800,
fontSize: '40px',
```

- [ ] **Step 3: Verify dish page renders correctly**

Navigate to any dish page. Confirm dish name and rating display in Outfit (the body font).

---

### Task 3: Fix Login.jsx — Cormorant → Amatic SC

**Files:**
- Modify: `src/pages/Login.jsx:202`

- [ ] **Step 1: Update brand heading to Amatic SC**

Find:
```jsx
fontFamily: "'Cormorant', Georgia, serif",
fontSize: '36px',
fontWeight: 700,
```
Replace with:
```jsx
fontFamily: "'Amatic SC', cursive",
fontSize: '42px',
fontWeight: 700,
```

Also update the `letterSpacing` from `'-0.02em'` to `'0.04em'` (Amatic SC needs positive tracking, not negative).

- [ ] **Step 2: Add gold "Good" accent if the text says "What's Good Here"**

Check if the JSX renders "What's Good Here" as plain text. If so, change to:
```jsx
What's <span style={{ color: 'var(--color-accent-gold)' }}>Good</span> Here
```

- [ ] **Step 3: Verify login page**

Navigate to `/login`. Confirm heading matches homepage treatment.

---

### Task 4: Fix WelcomeSplash.jsx — Cormorant → Amatic SC

**Files:**
- Modify: `src/components/WelcomeSplash.jsx:79`

- [ ] **Step 1: Update brand heading**

Find:
```jsx
fontFamily: "'Cormorant', Georgia, serif",
fontSize: '40px',
fontWeight: 700,
```
Replace with:
```jsx
fontFamily: "'Amatic SC', cursive",
fontSize: '42px',
fontWeight: 700,
```

Update `letterSpacing` from `'-0.02em'` to `'0.04em'`.

---

### Task 5: Fix WelcomeModal.jsx — Cormorant → Amatic SC

**Files:**
- Modify: `src/components/Auth/WelcomeModal.jsx:122`

- [ ] **Step 1: Update brand heading**

Find:
```jsx
fontFamily: "'Cormorant', Georgia, serif",
fontSize: '46px',
fontWeight: 700,
```
Replace with:
```jsx
fontFamily: "'Amatic SC', cursive",
fontSize: '42px',
fontWeight: 700,
```

Update `letterSpacing` from `'-0.02em'` to `'0.04em'`.

- [ ] **Step 2: Add gold "Good" accent**

Change the text to:
```jsx
What's <span style={{ color: 'var(--color-accent-gold)' }}>Good</span> Here
```

---

### Task 6: Commit legacy font cleanup

- [ ] **Step 1: Run build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 2: Grep for any remaining DM Sans or Cormorant references**

Run: `grep -r "DM Sans\|Cormorant" src/`
Expected: Zero results.

- [ ] **Step 3: Commit**

```bash
git add index.html src/index.css src/pages/Dish.jsx src/pages/Login.jsx src/components/WelcomeSplash.jsx src/components/Auth/WelcomeModal.jsx
git commit -m "style: consolidate typography to Amatic SC + Outfit two-font system

Remove Cormorant and DM Sans. Amatic SC for display/headers,
Outfit for body/data. Consistent brand treatment across all
auth screens and dish pages."
```

---

## Chunk 2: Add Amatic SC Headers to Remaining Pages

Every page that shows a title or section header should use Amatic SC 700 for consistency. The pattern is always the same inline style:

```jsx
style={{
  fontFamily: "'Amatic SC', cursive",
  fontSize: '28px',    // section headers (24px for smaller, 32px for page titles)
  fontWeight: 700,
  letterSpacing: '0.02em',
  color: 'var(--color-text-primary)',
}}
```

### Task 7: Browse.jsx — add Amatic SC section header

**Files:**
- Modify: `src/pages/Browse.jsx`

- [ ] **Step 1: Find the category/section title heading**

Read the file and find where the section title or category name is rendered (e.g., "Burgers", "Top Rated"). Apply Amatic SC styling to that heading element.

- [ ] **Step 2: Verify browse page**

Navigate to `/browse`, select a category. Confirm section header is in Amatic SC.

---

### Task 8: Restaurants.jsx — add Amatic SC headers

**Files:**
- Modify: `src/pages/Restaurants.jsx`

- [ ] **Step 1: Find page title and tab headers**

Read the file. Apply Amatic SC to the page title ("Restaurants") and any section headers (Open/Closed tabs header text if applicable). Keep tab button labels in Outfit (they're interactive).

- [ ] **Step 2: Verify restaurants page**

Navigate to `/restaurants`. Confirm page title uses Amatic SC.

---

### Task 9: RestaurantDetail.jsx — restaurant name in Amatic SC

**Files:**
- Modify: `src/pages/RestaurantDetail.jsx`

- [ ] **Step 1: Find restaurant name heading**

Read the file. Find the `<h1>` or main heading that displays the restaurant name. Apply Amatic SC at 32px:

```jsx
style={{
  fontFamily: "'Amatic SC', cursive",
  fontSize: '32px',
  fontWeight: 700,
  letterSpacing: '0.02em',
}}
```

- [ ] **Step 2: Find section headers ("Top Rated", "Menu")**

If there are tab labels or section dividers, apply Amatic SC at 24px to the non-interactive section labels.

---

### Task 10: RestaurantMenu.jsx — menu section names

**Files:**
- Modify: `src/components/restaurants/RestaurantMenu.jsx`

- [ ] **Step 1: Find menu section headings**

Read the file. Find where section names ("Starters", "Entrees", "Desserts") are rendered. Apply Amatic SC at 22px — this gives the menu board feel:

```jsx
style={{
  fontFamily: "'Amatic SC', cursive",
  fontSize: '22px',
  fontWeight: 700,
  letterSpacing: '0.02em',
}}
```

Keep dish names, prices, and ratings in Outfit (inherited).

---

### Task 11: Profile.jsx — section headers

**Files:**
- Modify: `src/pages/Profile.jsx`

- [ ] **Step 1: Find section headers**

Read the file. Apply Amatic SC to section headers like "Your Ratings", "Favorites", badge section titles, etc. at 24-28px.

---

### Task 12: UserProfile.jsx — section headers

**Files:**
- Modify: `src/pages/UserProfile.jsx`

- [ ] **Step 1: Apply same treatment as Profile.jsx**

Any section headers get Amatic SC at 24-28px.

---

### Task 13: Discover.jsx — section headers

**Files:**
- Modify: `src/pages/Discover.jsx`

- [ ] **Step 1: Apply Amatic SC to section headers**

"Similar Taste", "Find Friends", etc. — Amatic SC at 24-28px.

---

### Task 14: Build verify + commit

- [ ] **Step 1: Run build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ src/components/restaurants/RestaurantMenu.jsx
git commit -m "style: apply Amatic SC headers across all pages

Consistent display typography: Amatic SC for section headers,
page titles, and restaurant names. Outfit for all body text,
data, and interactive elements."
```

---

## Chunk 3: Update Documentation

### Task 15: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update design tokens / fonts section**

Add or update typography documentation:

```markdown
### 4.6 Typography
| Font | Role | Weights | CSS |
|------|------|---------|-----|
| Amatic SC | Display: brand, section headers, page titles | 700 | `'Amatic SC', cursive` |
| Outfit | Body: everything else | 400-800 | Inherited from body |
| SF Mono | Technical: Jitter badges | 700 | `'SF Mono', 'Fira Code', monospace` |

**Rule:** Amatic SC = section/page headings. Outfit = data, actions, body text.
**Removed:** DM Sans, Cormorant, Aglet Sans (Typekit).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update typography system in CLAUDE.md"
```
