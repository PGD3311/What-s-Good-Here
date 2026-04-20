# User-Facing Flow Audit — March 30, 2026

Walked every user-facing flow, documented what's broken/incomplete/missing. 56 days to Memorial Day launch.

Previous audit (March 8) found 12 issues. **10 fixed, 1 remains, 1 partially fixed.** This audit adds new findings.

---

## Previous Audit Scorecard

| # | Issue | Status |
|---|-------|--------|
| 1 | Images 51MB in public/ | **FIXED** — 7.2MB now, all icons WebP |
| 2 | Missing RPC: get_my_jitter_profile | **FIXED** — in schema.sql |
| 3 | Five duplicate category IDs | **FIXED** — deduped |
| 4 | 22 dead files | **FIXED** — 21 deleted. `jitterScorer.js` + `tasteApi.js` still dead (2 files) |
| 5 | Six pages use raw useEffect | **NOT FIXED** — UserProfile.jsx, RestaurantDetail.jsx, useDishDetail still violate |
| 6 | Eight API files missing error handling | **FIXED** — all API files now have proper try/catch + createClassifiedError |
| 7 | pdfjs-dist ships to all users (334KB gz) | **FIXED** — dynamically imported in MenuImportWizard (`await import('pdfjs-dist')`) |
| 8 | No apple-touch-icon | **NOT FIXED** — plan written but never executed |
| 9 | No cache headers for root images | **FIXED** — vercel.json has .webp cache rules |
| 10 | react-window unused | **FIXED** — removed from package.json |
| 11 | ResetPassword direct Supabase call | **FIXED** — now uses `authApi.getSession()` and `authApi.updatePassword()` |
| 12 | Tailwind color violations | **FIXED** — Profile.jsx and MenuImportWizard now use CSS variables |

---

## Flow 1: Onboarding / First Launch

**What a brand new anonymous user sees:** They land directly on the homepage (Map.jsx list mode). No splash, no introduction, no explanation of what the app is. They see a search bar, category chips carousel, and a ranked dish list. This is fine for a food app — no gatekeeping. The UX is self-explanatory.

**But there's a gap:** The WelcomeModal only triggers for users who are **logged in** with `has_onboarded = false`. A tourist who opens the app, browses around, then creates an account will see the onboarding modal *after* they already understand the app. The modal teaches nothing they haven't already discovered. The onboarding is backwards.

### Issues Found

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| F1 | **Dead theme script in index.html** | MEDIUM | Line 49: `localStorage.getItem('wgh_theme')` — dark mode was removed months ago. Runs on every page load for nothing. Also a CLAUDE.md violation (direct localStorage access outside storage.js). |
| F2 | **theme-color meta is #000000 (black)** | MEDIUM | Leftover from dark mode. Should be `#F0ECE8` (warm stone) so the iOS status bar and Android chrome match the app. |
| F3 | **Brand "Good" color inconsistent** | LOW | WelcomeModal celebration uses `var(--color-primary)` (coral) for "Good" in "What's Good Here". CLAUDE.md spec says brand pattern uses `var(--color-accent-gold)`. Minor but the brand header should be consistent everywhere. |
| F4 | **Sign-up flow works** | PASS | Google OAuth + email/password + username check with availability. Solid. |
| F5 | **Login page has clear goals + how-it-works** | PASS | Good first impression for the login path. |

---

## Flow 2: Restaurant Discovery

**What works:** Restaurant list loads with Open/Closed tabs. Search filters by name. Tap navigates to detail page. Google Places integration adds "discover nearby" for authenticated users. AddRestaurantModal with duplicate detection. Maps toggle.

### Issues Found

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| F6 | **RestaurantDetail uses raw useEffect** | HIGH | Lines 39-68: restaurant fetch with manual loading/error state. Should be `useQuery`. Violates CLAUDE.md "React Query is the data fetching layer." No caching, no background refetch, no deduplication. |
| F7 | **Friends votes fetch is raw useEffect** | HIGH | RestaurantDetail.jsx fetches friends votes per dish in a useEffect loop. Each friend-vote-per-dish is a separate API call inside a loop — no batching. |
| F8 | **RestaurantDetail is 600+ lines** | MEDIUM | Above the ~400 line extraction threshold. Restaurant info card, dish tabs, specials, events all inline. |
| F9 | **No restaurant count visible** | LOW | User can't see how many restaurants are in the system. Would build trust to show "47 restaurants on Martha's Vineyard." |

---

## Flow 3: Dish-Level Experience

**What works:** Dish detail page has good skeleton loader. Stats card with rating, vote count, restaurant link. Photo gallery. Variant picker. Friends' votes. Smart snippet. Value badge. "Order Now" / "Directions" floating action bar.

### Issues Found

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| F10 | **useDishDetail is entirely raw useEffect** | HIGH | The entire dish detail data layer (dish fetch, variants, photos, reviews, friends votes) is a massive 200+ line custom hook using raw useState/useEffect. Zero React Query. No caching between dish visits, no background refetch, no deduplication. This is the most-visited page in the app. |
| F11 | **Hardcoded color on "Go Home" button** | LOW | Dish.jsx line 141: `color: '#FFFFFF'`. Should be `var(--color-text-on-primary)`. |
| F12 | **Floating action bar uses `color: 'white'`** | LOW | Dish.jsx lines 332, 351: "Order Now" and "See Menu" buttons use `color: 'white'` instead of CSS variable. |
| F13 | **"See on map" bridge works** | PASS | Navigates to homepage in map mode, flies to dish pin. Solid. |
| F14 | **10-vote minimum threshold works** | PASS | `MIN_VOTES_FOR_RANKING = 5` checked correctly. "Early" label shows for low-vote dishes. |

---

## Flow 4: Rating a Dish (Vote Flow)

**What works:** Binary vote (thumbs up/down) → rating slider (1-10) → optional review text → optional photo upload → submit. Auth gate catches unauthenticated users, saves pending vote to localStorage, replays after OAuth redirect. Optimistic UI updates. Haptic feedback. Screen reader announcements. JitterBox/WAR attestation. Back button interceptor during flow.

### Issues Found

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| F15 | **User's existing vote fetched via raw useEffect** | MEDIUM | ReviewFlow.jsx line 69-89: `authApi.getUserVoteForDish()` called in useEffect, not React Query. On revisiting a dish, the vote status isn't cached. |
| F16 | **Vote submission is fire-and-forget** | MEDIUM | ReviewFlow.jsx lines 259-271: `submitVote()` runs in a `.then()` chain after attestation, but errors are only logged. The user sees success immediately (optimistic update) but if the vote silently fails, they'll never know. No retry, no toast on failure. |
| F17 | **Review text not validated via `validateUserContent()`** | HIGH | CLAUDE.md says "All user-generated text must pass `validateUserContent()`." ReviewFlow.jsx only checks `MAX_REVIEW_LENGTH`. No blocklist check on review text before submission. |
| F18 | **Vote flow works end-to-end** | PASS | Including pending vote persistence across OAuth, back-button intercept, and JitterBox. |

---

## Flow 5: User Profile / Badges

**What works:** Profile shows HeroIdentityCard with avatar, name, stats. "Your Food Story" chalkboard with rating style, most loyal restaurant, best find, hot take. Unrated photos banner. JournalFeed with vote history. Follow counts with modal. Name editing with availability check.

### Issues Found

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| F19 | **jitterApi.getMyProfile() via raw useEffect** | MEDIUM | Profile.jsx line 36-46: fetches jitter profile without React Query. |
| F20 | **"Food Story" chalkboard uses hardcoded hex** | MEDIUM | Profile.jsx lines 172-175: `#2C3033` background, `rgba(255,255,255,*)` for text. Violates CSS variable rule. Should use `var(--color-*)` tokens. |
| F21 | **UserProfile.jsx is 835 lines** | HIGH | Double the ~400 line convention. Worst offender for page size. Contains 6+ raw useEffects, manual loading/error state, all inline. Should be split into a data hook (like useDishDetail) + smaller page component. |
| F22 | **UserProfile uses raw useEffect for all data** | HIGH | 6+ useEffects for: profile fetch, follow status, taste compat, rating bias, jitter badges, reviews, my ratings. Zero React Query. This is the page the previous audit flagged as "worst offender" — still unfixed. |
| F23 | **Empty profile state works** | PASS | ProfileSkeleton loader shown during loading. Empty states handled. |
| F24 | **Badges render** | PASS | get_user_badges / get_public_badges RPCs work. Badge rendering via component. |

---

## Flow 6: PWA Basics

### Issues Found

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| F25 | **No apple-touch-icon** | HIGH | `index.html` has zero `<link rel="apple-touch-icon">`. iOS home screen shows a screenshot instead of the app icon. `wgh-icon.png` (47KB, 180x180 equivalent) exists in public/ but is never linked. One-line fix. |
| F26 | **No PWA manifest** | HIGH | `vite.config.js` has `manifest: false`. Without a manifest.json, the "Add to Home Screen" install prompt WILL NOT fire on Android Chrome. iOS Safari will still allow adding (it uses meta tags), but the experience is degraded — no standalone window, no splash screen. |
| F27 | **PWA precache is 9MB** | MEDIUM | Workbox reports 153 precache entries at 9,067 KiB. On island cell service (often <1 Mbps), first visit downloads ~9MB before the app works offline. `maximumFileSizeToCacheInBytes` is 3MB — some category icon PNGs (ice-cream-clean.png 277KB, ice-cream-melting.png 431KB) still ship as PNG not WebP. |
| F28 | **Service worker caching works** | PASS | Workbox configured correctly: CacheFirst for Supabase storage images, NetworkFirst for API calls. Runtime caching for Unsplash. `skipWaiting` + `clientsClaim` for immediate updates. |
| F29 | **Back button behavior works** | PASS | `backButtonInterceptor` in main.jsx intercepts during vote flow. React Router handles other navigation. |
| F30 | **Offline/slow fallback is network-dependent** | MEDIUM | The service worker caches API responses for 5 minutes. After that, if offline, API calls fail and pages show errors. No dedicated offline screen or "you're offline" banner. |

---

## Cross-Cutting Issues (Found Across Multiple Flows)

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| C1 | **`color-mix()` CSS in 14 files (26 occurrences)** | HIGH | `color-mix(in srgb, ...)` is only supported in Safari 16.2+, Chrome 111+, Firefox 113+. CLAUDE.md targets Safari <16 compat. Won't crash — the CSS property just won't apply — but error/success states in Login, LoginModal, AcceptInvite, and BottomNav will have NO background color on older browsers. These are user-visible flows. |
| C2 | **360 lint errors** | HIGH | `npm run lint` reports 460 problems (360 errors, 100 warnings). Top categories: ~80 unused vars, ~30 missing useEffect deps, ~15 empty catch blocks, ~3 rules-of-hooks violations. This blocks any CI/CD gate. |
| C3 | ~~PDF.js ships to everyone~~ | ~~FIXED~~ | pdfjs-dist is now dynamically imported (`await import('pdfjs-dist')`) in MenuImportWizard. Correctly code-split. |
| C4 | **CLAUDE.md routes table is stale** | MEDIUM | Missing routes: `/curator-invite/:token` (AcceptCuratorInvite), `/my-list` (MyList). Lists `/discover` and `/hub` which don't exist. Lists `/how-reviews-work` and `/for-restaurants` correctly but those aren't in the routes table. |
| C5 | **CLAUDE.md hooks table is stale** | MEDIUM | Missing hooks: `useDishDetail`, `useLocalListDetail`, `useRestaurantSpecials`, `useRestaurantEvents`. Some listed hooks may no longer exist. |
| C6 | **vercel.json has debug HTML files in rewrites** | LOW | `logo-concepts.html`, `profile-redesign.html`, `profile-soul.html` are explicitly rewritten. These look like design mockups that shouldn't be in production routing. |
| C7 | **Unsplash preconnect in index.html** | LOW | Line 11: `<link rel="preconnect" href="https://images.unsplash.com">`. Per memory: no stock photos policy. If Unsplash is truly unused, remove the preconnect (it opens a connection on every page load). |
| C8 | **Display names skip content blocklist** | MEDIUM | `profileApi.updateProfile()` does NOT call `validateUserContent()` on display_name. Users could set offensive usernames. Reviews ARE validated, but names are not. |
| C9 | **SPEC.md RPC count is 29, actual is 54** | HIGH | SPEC.md is severely outdated. 25 RPCs exist in schema.sql that aren't documented. Tables: 23 actual vs 20 documented (missing `curator_invites`, `local_list_items`, `local_lists`). |
| C10 | **CLAUDE.md hooks/routes/API tables stale** | MEDIUM | 24 hooks exist vs 20 documented. 20 routes vs 18 documented. `localListsApi` undocumented. Phantom `/discover` route in SPEC.md. |
| C11 | **2 dead files remain** | LOW | `src/utils/jitterScorer.js` and `src/api/tasteApi.js` — zero importers. `SessionCard` barrel export also unused. |

---

## Ranked Punch List

### MUST FIX FOR LAUNCH (blocks launch or breaks core experience)

| Priority | Issue | Effort | Why |
|----------|-------|--------|-----|
| **P1** | F25: Add apple-touch-icon to index.html | 5 min | One-line HTML addition. `wgh-icon.png` already exists. Without this, iPhone home screen shortcuts look broken. |
| **P2** | F26: Create PWA manifest | 30 min | Without manifest.json, Android users can't "install" the app. Need manifest with name, icons (192 + 512px), display: standalone, colors. |
| **P3** | F1: Remove dead theme script from index.html | 2 min | Delete line 49. Dead code that runs on every page load. |
| **P4** | F2: Fix theme-color meta to #F0ECE8 | 2 min | Change `<meta name="theme-color" content="#000000">` to match app background. |
| **P5** | F17: Add `validateUserContent()` to review text | 15 min | Security gap. Reviews bypass the content blocklist. Add check before `submitVote()` in ReviewFlow. |
| **P6** | C1: Replace `color-mix()` with fallback colors | 2 hr | 26 occurrences across 14 files. Replace with pre-computed rgba values or CSS variable alternatives. Prevents invisible error/success states on older Safari. |
| **P7** | C2: Fix critical lint errors | 2-3 hr | At minimum fix: rules-of-hooks violations (3), empty catch blocks (15), and the unused vars blocking CI. The 30+ missing deps in useEffect can be deferred. |

### SHOULD FIX IF TIME (improves quality but not blocking)

| Priority | Issue | Effort | Why |
|----------|-------|--------|-----|
| **S1** | F10: Migrate useDishDetail to React Query | 3-4 hr | Most-visited page has zero caching. Every dish visit re-fetches everything. Biggest UX win for repeat visitors. |
| **S2** | F22: Migrate UserProfile.jsx to React Query | 3-4 hr | 835-line page with 6 raw useEffects. Worst data-layer offender. Split into a data hook + smaller page. |
| **S3** | F6: Migrate RestaurantDetail fetch to React Query | 1-2 hr | Manual loading/error state for restaurant data. Quick win. |
| **S4** | C8: Add `validateUserContent()` to display name updates | 15 min | Security gap. Offensive names bypass blocklist. Add check in profileApi.updateProfile(). |
| **S5** | F16: Add retry/notification on silent vote failure | 1 hr | If vote submission silently fails, user never knows. Add toast on error, optional retry. |
| **S6** | F20: Replace hardcoded hex in Food Story chalkboard | 30 min | `#2C3033` + rgba whites in Profile.jsx. Should use CSS variables. |
| **S7** | F27: Trim PWA precache to essentials | 1 hr | 9MB first-load on island cell service is painful. Exclude large PNGs, limit precache to critical routes + CSS + small icons. |
| **S8** | F30: Add offline/slow connection banner | 2 hr | Detect navigator.onLine + network quality. Show banner when offline instead of broken error states. |

### V2 (Post-Launch)

| Priority | Issue | Effort | Why |
|----------|-------|--------|-----|
| **V1** | Full React Query migration across all pages | 2-3 days | Systematic migration of all remaining raw useEffect data fetching to React Query. |
| **V2** | Full lint cleanup (460 → 0) | 1-2 days | Fix all unused vars, missing deps, export patterns. Enable lint in CI. |
| **V3** | UserProfile.jsx refactor | 4 hr | Split 835-line monolith into data hook + smaller page component. |
| **V4** | C9-C10: Sync SPEC.md + CLAUDE.md with reality | 3 hr | 54 RPCs vs 29 documented. 23 tables vs 20. 24 hooks vs 20. 2 missing routes. Phantom /discover. |
| **V5** | C6: Clean vercel.json debug rewrites | 5 min | Remove mockup HTML file rewrites from production config. |
| **V6** | C7+C11: Remove dead preconnects + dead files | 15 min | Unsplash preconnect, jitterScorer.js, tasteApi.js, SessionCard export. |
| **V7** | F9: Trust signal — show restaurant count | 1 hr | "47 restaurants. 1,790 dishes. Ranked by the community." |
| **V8** | Dynamic OG meta tags for shared links (T28) | 4 hr | Dish/restaurant shares show generic preview. Vercel middleware for crawlers. |

---

## What's Solid (No Action Needed)

- **Build:** Passes in 10.15s, zero warnings
- **Tests:** 285/285 pass (5.74s)
- **Auth:** Google OAuth + email/password, proper auth gates on voting/favorites/photos
- **Vote flow:** Full loop works — auth gate, pending vote persistence, OAuth redirect survival, optimistic updates, haptics
- **Search:** Client-side, instant (~1ms), works offline after first load
- **Map:** Dual-mode toggle, emoji pins, "See on map" bridge from dish detail
- **Rate limiting:** All 4 operations covered (vote, photo, dish create, restaurant create)
- **Error handling:** Classified errors, user-friendly messages in API layer
- **Security:** CSP headers, XSS sanitization, RLS policies, HSTS, no exposed secrets
- **Images:** Compressed from 51MB to 7.2MB since last audit
- **Dead code:** 21 of 22 flagged files deleted
- **No ES2023+ JS methods anywhere**
- **No direct console.* or localStorage violations in code**
