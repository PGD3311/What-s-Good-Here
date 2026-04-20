# Code Audit — March 8, 2026

Full codebase audit after the big Denis merge. 5 parallel agents checked: CLAUDE.md rule compliance, dead code, build/perf, API/data layer, and docs accuracy.

---

## CRITICAL (fix before launch)

### 1. Images are way too big — 51MB in public/
New flat icons are 400KB-1.8MB each (22MB total for icons alone). Splash, logo, thumbs-up/down are all ~2MB each. PWA precaches **54MB** on first visit. On island cell service this is brutal.
- Convert all PNGs to WebP — icons should be ~20-30KB each, not 1MB+
- `seed-photos/` (5.2MB) is shipping to production — shouldn't be
- **Status:** NOT FIXED

### 2. Missing RPC: `get_my_jitter_profile`
Called in `jitterApi.js` but not in `schema.sql`. Denis needs to add this or it fails silently.
- **Status:** NOT FIXED — needs Denis

### 3. Five duplicate category IDs in ALL_CATEGORIES
`clams`, `oysters`, `coffee`, `cocktails`, `ice cream` appear in both `MAIN_CATEGORIES` and again in the `ALL_CATEGORIES` extras. T12 was marked done but only fixed `seafood`.
- **File:** `src/constants/categories.js`
- **Status:** NOT FIXED

---

## HIGH (should fix before launch)

### 4. 22 dead files — unused code
Dead pages:
- `src/pages/Home.jsx` (replaced by Map.jsx)

Dead components:
- `src/components/BottomSheet.jsx`
- `src/components/HeartIcon.jsx`
- `src/components/ReviewsIcon.jsx`
- `src/components/DishPlaceholder.jsx`
- `src/components/UserSearch.jsx`
- `src/components/AddDishModal.jsx`
- `src/components/SimilarTasteUsers.jsx`
- `src/components/CategoryPicker.jsx`
- `src/components/profile/EditFavoritesSection.jsx`
- `src/components/profile/PhotosInfoSection.jsx`
- `src/components/profile/MissionSection.jsx`
- `src/components/restaurants/RestaurantCard.jsx`
- `src/components/restaurants/TopDishesNearYou.jsx`
- `src/components/browse/ValueBadge.jsx`
- `src/components/home/DishPhotoFade.jsx`
- `src/components/jitter/JitterInput.jsx` (barrel only)
- `src/components/jitter/ProfileJitterCard.jsx` (barrel only)
- `src/components/jitter/JitterExplainer.jsx` (barrel only)

Dead hooks:
- `src/hooks/useGuides.js`
- `src/hooks/useMapDishes.js`
- `src/hooks/useTrendingDishes.js`

Dead API modules:
- `src/api/ratingIdentityApi.js`
- `src/api/menuScrapingApi.js`

Dead constants:
- `src/constants/categoryImages.js`

Unused utility:
- `src/utils/jitterScorer.js`

- **Status:** NOT FIXED

### 5. Six pages use raw useEffect instead of React Query
| Page | useEffect count | Severity |
|------|----------------|----------|
| `UserProfile.jsx` | 6+ | Worst offender |
| `Dish.jsx` | 4 | Heavy page |
| `RestaurantDetail.jsx` | 2 | |
| `Admin.jsx` | 1 | |
| `ManageRestaurant.jsx` | 1 | |
| `AcceptInvite.jsx` | 1 | |

These miss caching, deduplication, and background refetch. Won't crash but tech debt.
- **Status:** NOT FIXED

### 6. Eight API files missing proper error handling
| File | Issue |
|------|-------|
| `followsApi.js` | 4 bare `throw err` without `createClassifiedError` guard |
| `tasteApi.js` | No `createClassifiedError` import at all, returns `[]` on error |
| `notificationsApi.js` | No `logger` import, no try/catch wrappers |
| `specialsApi.js` | Methods lack try/catch |
| `eventsApi.js` | Methods lack try/catch |
| `restaurantManagerApi.js` | Many methods lack try/catch |
| `restaurantsApi.js` | `search()` lacks try/catch |
| `dishesApi.js` | `create()` throws plain Error without classification |

- **Status:** NOT FIXED

### 7. `pdfjs-dist` ships to all users (335KB gzipped: 99KB)
Only used by admin `MenuImportWizard`. Should be dynamically imported so regular users never download it.
- **Status:** NOT FIXED

---

## MEDIUM (fix when you can)

### 8. No apple-touch-icon
iOS home screen shows a screenshot instead of the app icon. Need `<link rel="apple-touch-icon">` in index.html + 180x180 icon.
- **Status:** NOT FIXED

### 9. No cache headers for static images
Only `/assets/` gets immutable caching in vercel.json. Root-level PNGs (`/logo.png`, `/og-image.png`, etc.) have no cache headers.
- **Status:** NOT FIXED

### 10. `react-window` unused
Zero imports anywhere in src/. Can remove from package.json.
- **Status:** NOT FIXED

### 11. `ResetPassword.jsx` calls Supabase directly
Only page violating the API layer rule. Imports `supabase` and calls `supabase.auth.getSession()` directly.
- **File:** `src/pages/ResetPassword.jsx:19`
- **Status:** NOT FIXED

### 12. Three Tailwind color class violations
| File | Line | Class |
|------|------|-------|
| `Profile.jsx` | 370 | `bg-white/20` |
| `MenuImportWizard.jsx` | 96 | `text-white` |
| `MenuImportWizard.jsx` | 173 | `text-white` |

- **Status:** NOT FIXED

---

## DOCS OUT OF SYNC

### CLAUDE.md phantom features (stuff documented but doesn't exist)
- ThemeContext / ThemeProvider / dark mode token table — all removed, docs still reference
- `/discover` and `/hub` routes — no pages, no routes in App.jsx
- Provider order says "ThemeProvider > AuthProvider > ..." — ThemeProvider is gone
- 3 stale localStorage keys: `wgh_theme`, `wgh_has_seen_splash`, `wgh_has_onboarded`
- Missing from docs: `/jitter` route, `useAllDishes` hook, 3 constants files (`jitter.js`, `searchSuggestions.js`, `categoryImages.js`)
- Constants count says 9, actual is 10

### SPEC.md gaps
- Says 29 RPCs, actual is 37 (missing 11 from docs)
- Lists Discover page that doesn't exist
- Missing 6 routes from route table
- RPC count header says 9 edge functions but table lists 10
- Trigger count header says 6 but lists 7

### TASKS.md
- T12 marked DONE but 5 duplicate categories remain
- T41 marked DONE but `BottomSheet.jsx` file still exists (dead code)
- Missing tasks for: icon system v3.0, /jitter route, Discover/Hub removal, WelcomeSplash redesign

---

## PASSING (solid)

- No ES2023+ methods anywhere
- No direct console.* calls (all use logger)
- No direct localStorage violations (all use storage.js)
- Auth gates on voting/favorites/photos — all check login
- Rate limiting on all 4 operations (vote, photo, dish create, restaurant create)
- 497 unit tests passing
- Build succeeds (8.13s)
- All 21 RPCs called in code exist in schema.sql (except 1 jitter gap)
- No stale imports pointing to deleted files
- No duplicate npm dependencies
- CSP headers are solid
- OG meta tags correct, og-image.png exists

---

## Recommended Fix Order

1. **Compress images** — biggest impact, 54MB → ~3MB
2. **Delete dead files** — 22+ files, clean sweep
3. **Fix duplicate categories** — 5-line edit in categories.js
4. **Update CLAUDE.md** — remove dark mode phantom docs, fix route/hook/constants tables
5. **Flag `get_my_jitter_profile` to Denis** — he deploys the RPC
6. **API error handling cleanup** — 8 files need try/catch + createClassifiedError
7. **useEffect → React Query migration** — 6 pages, biggest being UserProfile.jsx
8. **Dynamic import pdfjs-dist** — saves 335KB for non-admin users
9. **apple-touch-icon** — need the asset
10. **Remove react-window** — `npm uninstall react-window`
