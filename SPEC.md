# SPEC.md — What's Good Here

> This document describes **what exists today**. No future features. Every claim is labeled VERIFIED, INFERRED, or UNKNOWN.

---

## App Description

**VERIFIED** — `CLAUDE.md`, `src/App.jsx`, live deployment

What's Good Here is a mobile-first food discovery app for Martha's Vineyard. Users vote on dishes with a "Would you order this again?" binary plus a 1–10 rating scale, and the app ranks dishes by crowd-sourced consensus. The core loop is: browse/search dishes → vote → see how your taste compares. A gamification layer (badges) and social features (follows, taste compatibility) drive retention.

Tech: React 19, Vite, Tailwind CSS, React Router v7, Supabase (Postgres + Auth + Storage), deployed on Vercel at `wghapp.com`. Analytics via PostHog + Sentry.

---

## Core Data Model

### Tables (20)

Evidence: `supabase/schema.sql:24-259`

| Table | PK | Key Columns | Relationships | Constraints | Status |
|---|---|---|---|---|---|
| **restaurants** | `id` UUID | name, address, lat/lng, is_open, cuisine, town, menu_section_order[], website_url, facebook_url, instagram_url, phone, google_place_id, menu_url, created_by | — | name must pass `is_offensive()` content filter | **VERIFIED** |
| **dishes** | `id` UUID | name, category, menu_section, price, avg_rating, total_votes, consensus_*, value_score, parent_dish_id, tags[] | FK → restaurants; self-ref parent_dish_id (variants) | name must pass `is_offensive()` content filter | **VERIFIED** |
| **votes** | `id` UUID | dish_id, user_id, would_order_again (bool), rating_10 (decimal), review_text, vote_position, category_snapshot, purity_score, source, source_metadata | FK → dishes, auth.users; partial UNIQUE(dish_id, user_id) WHERE source='user' | review_text max 200 chars; source IN (user, ai_estimated); review_text must pass `is_offensive()` | **VERIFIED** |
| **profiles** | `id` UUID = auth.users(id) | display_name, has_onboarded, preferred_categories[], follower_count, following_count | PK references auth.users | unique lowercase display_name; display_name must pass `is_offensive()` | **VERIFIED** |
| **favorites** | `id` UUID | user_id, dish_id | FK → auth.users, dishes; UNIQUE(user_id, dish_id) | — | **VERIFIED** |
| **admins** | `id` UUID | user_id (unique), created_by | FK → auth.users | — | **VERIFIED** |
| **dish_photos** | `id` UUID | dish_id, user_id, photo_url, quality_score, status, source_type, dimensions, brightness stats | FK → dishes, auth.users; UNIQUE(dish_id, user_id) | status IN (featured, community, hidden, rejected); source_type IN (user, restaurant) | **VERIFIED** |
| **follows** | `id` UUID | follower_id, followed_id | FK → auth.users x2; UNIQUE(follower, followed) | CHECK(follower != followed) | **VERIFIED** |
| **notifications** | `id` UUID | user_id, type, data (JSONB), read (bool) | FK → auth.users | — | **VERIFIED** |
| **user_rating_stats** | `user_id` UUID | rating_bias (MAD), bias_label, votes_with_consensus, votes_pending, dishes_helped_establish, category_biases (JSONB) | FK → auth.users | — | **VERIFIED** |
| **bias_events** | `id` UUID | user_id, dish_id, dish_name, user_rating, consensus_rating, deviation, was_early_voter, bias_before/after, seen | FK → auth.users, dishes | — | **VERIFIED** |
| **badges** | `key` TEXT | name, subtitle, description, icon, is_public_eligible, sort_order, rarity, family, category | — | 41 seeded badges | **VERIFIED** |
| **user_badges** | `id` UUID | user_id, badge_key, unlocked_at, metadata_json | FK → auth.users, badges; UNIQUE(user_id, badge_key) | — | **VERIFIED** |
| **specials** | `id` UUID | restaurant_id, deal_name, description, price, is_active, is_promoted, source, expires_at, created_by | FK → restaurants, auth.users | source IN (manual, auto_scrape) | **VERIFIED** |
| **events** | `id` UUID | restaurant_id, event_name, description, event_date, start_time, end_time, event_type, recurring_pattern, recurring_day_of_week, is_active, is_promoted, source, created_by | FK → restaurants, auth.users | event_type IN (live_music, trivia, comedy, karaoke, open_mic, other); source IN (manual, auto_scrape) | **VERIFIED** |
| **jitter_profiles** | `user_id` UUID (PK) | profile_data (JSONB), review_count, confidence_level, consistency_score, flagged | FK → auth.users | confidence_level IN (low, medium, high) | **VERIFIED** |
| **jitter_samples** | `id` UUID | user_id, sample_data (JSONB), collected_at | FK → auth.users | auto-pruned to 30 per user | **VERIFIED** |
| **restaurant_managers** | `id` UUID | user_id, restaurant_id, role, invited_at, accepted_at, created_by | FK → auth.users, restaurants; UNIQUE(user_id, restaurant_id) | — | **VERIFIED** |
| **restaurant_invites** | `id` UUID | token (unique hex), restaurant_id, created_by, expires_at, used_by, used_at | FK → restaurants, auth.users | expires after 7 days | **VERIFIED** |
| **rate_limits** | `id` UUID | user_id, action, created_at | FK → auth.users | pg_cron hourly cleanup | **VERIFIED** |

### Views (1)

| View | Definition | Status |
|---|---|---|
| **category_median_prices** | Median price per category for dishes with price > 0 and total_votes >= 8. SECURITY INVOKER. | **VERIFIED** — `schema.sql:262-271` |

### Key Relationships

```
restaurants ──< dishes ──< votes >── auth.users ──< profiles
                  │                      │
                  ├──< dish_photos        ├──< favorites
                  │                      ├──< follows (follower/followed)
                  └── self-ref           ├──< notifications
                     (parent_dish_id)    ├──< user_rating_stats
                                         ├──< bias_events
                                         ├──< user_badges
                                         └──< restaurant_managers
```

**VERIFIED** — FK declarations in `schema.sql`

### RLS Policies

Evidence: `schema.sql:351-461`

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| restaurants | public | admin only | admin only | admin only |
| dishes | public | admin or manager | admin or manager | admin only |
| votes | public | own (auth.uid) | own | own |
| profiles | public if display_name set, else own | own | own (with check) | — (removed: prevents orphaning FKs) |
| favorites | own only | own | — | own |
| admins | admins only | — | — | — |
| dish_photos | public | own | own | own |
| follows | public | own (follower_id) | — | own (follower_id) |
| notifications | own only | service_role only | own | own |
| user_rating_stats | public | — | — | — |
| bias_events | own | — | own (mark seen) | — |
| badges | public | — | — | — |
| user_badges | own + public-eligible | own | — | — |
| specials | active OR admin/manager | admin/manager | admin/manager | admin/manager |
| restaurant_managers | admin OR own | — (via invite) | — | — |
| restaurant_invites | admin only | — | — | — |
| rate_limits | own | — (via RPC) | — | — |

**VERIFIED** — all policies read directly from schema.sql

### RPCs (29 functions)

Evidence: `schema.sql:506-1531`

**Core Data:**
| Function | Purpose | Returns | Auth |
|---|---|---|---|
| `get_ranked_dishes(lat, lng, radius, category?, town?)` | Main browse feed — ranked dishes with distance, variants, value score | TABLE | STABLE |
| `get_restaurant_dishes(restaurant_id)` | Dishes for one restaurant with variant aggregation, includes tags[] | TABLE | — |
| `get_dish_variants(parent_dish_id)` | Variant sizes/options for a parent dish | TABLE | — |
| `get_smart_snippet(dish_id)` | Best review snippet (9+ rated first) | TABLE | — |

**Social:**
| Function | Purpose | Returns | Auth |
|---|---|---|---|
| `get_friends_votes_for_dish(user_id, dish_id)` | Friends' votes on a dish with category expertise | TABLE | STABLE |
| `get_friends_votes_for_restaurant(user_id, restaurant_id)` | Friends' votes at a restaurant | TABLE | STABLE |
| `get_taste_compatibility(user_id, other_id)` | Taste match % (shared dishes, avg difference) | TABLE | STABLE |
| `get_similar_taste_users(user_id, limit?)` | Users with similar taste you don't follow | TABLE | STABLE |
| `is_following(follower, followed)` | Check follow status | BOOLEAN | STABLE |
| `get_follower_count(user_id)` / `get_following_count(user_id)` | Count helpers | INTEGER | STABLE |

**Rating Identity (MAD-based):**
| Function | Purpose | Returns | Auth |
|---|---|---|---|
| `get_user_rating_identity(target_user_id)` | Rating bias, label, consensus stats, per-category biases | TABLE | SECURITY DEFINER |
| `get_unseen_reveals(target_user_id)` | Unseen bias reveal notifications (max 10) | TABLE | SECURITY DEFINER |
| `mark_reveals_seen(event_ids[])` | Mark reveal events as seen | VOID | SECURITY DEFINER |

**Badges:**
| Function | Purpose | Returns | Auth |
|---|---|---|---|
| `get_badge_evaluation_stats(user_id)` | All data for badge evaluation in one round-trip | JSON | SECURITY DEFINER |
| `evaluate_user_badges(user_id)` | Evaluate and award badges | TABLE | — |
| `get_user_badges(user_id, public_only?)` | User's unlocked badges | TABLE | STABLE |
| `get_public_badges(user_id)` | Public badges for display (max 6) | TABLE | STABLE |
| `get_category_experts(category, limit?)` | Experts for a category (deduped by tier) | TABLE | SECURITY DEFINER |
| `get_expert_votes_for_restaurant(restaurant_id)` | Expert vote counts per dish at a restaurant | TABLE | STABLE |

**Rate Limiting:**
| Function | Purpose | Returns | Auth |
|---|---|---|---|
| `check_and_record_rate_limit(action, max, window)` | Generic rate limiter | JSONB | SECURITY DEFINER |
| `check_vote_rate_limit()` | Vote rate limit (10/min) | JSONB | SECURITY DEFINER |
| `check_photo_upload_rate_limit()` | Photo rate limit (5/min) | JSONB | SECURITY DEFINER |

**Restaurant Manager:**
| Function | Purpose | Returns | Auth |
|---|---|---|---|
| `get_invite_details(token)` | Public invite preview | JSON | SECURITY DEFINER |
| `accept_restaurant_invite(token)` | Accept invite atomically | JSON | SECURITY DEFINER |

**Notifications:**
| Function | Purpose | Returns | Auth |
|---|---|---|---|
| `get_unread_notification_count(user_id)` | Count unread notifications | INTEGER | SECURITY DEFINER |
| `mark_all_notifications_read(user_id)` | Mark all as read | VOID | SECURITY DEFINER |

**Value Score:**
| Function | Purpose | Returns | Auth |
|---|---|---|---|
| `compute_value_score()` | Trigger: calculates value_score on dish insert/update | TRIGGER | — |
| `recalculate_value_percentiles()` | Batch: refresh all percentiles (pg_cron every 2h) | VOID | SECURITY DEFINER |

### Triggers (6)

Evidence: `schema.sql:1534-1776`

| Trigger | Table | Event | Purpose |
|---|---|---|---|
| `trigger_update_follow_counts` | follows | AFTER INSERT/DELETE | Maintains follower/following counts on profiles |
| `trigger_notify_on_follow` | follows | AFTER INSERT | Creates notification for new follower |
| `vote_insert_trigger` | votes | BEFORE INSERT | Sets vote_position, category_snapshot, increments pending stats |
| `consensus_check_trigger` | votes | AFTER INSERT | At 5+ votes: calculates consensus, creates bias_events, updates user_rating_stats |
| `update_dish_rating_on_vote` | votes | AFTER INSERT/UPDATE/DELETE | Syncs avg_rating/total_votes on dishes table |
| `trigger_compute_value_score` | dishes | BEFORE INSERT/UPDATE OF avg_rating, total_votes, price, category | Calculates value_score from rating and price vs median |

| `jitter_sample_merge` | jitter_samples | AFTER INSERT | Merges sample into running jitter profile, prunes old samples (keep last 30) |

**VERIFIED** — all triggers read directly from schema.sql

### Edge Functions (9)

| Function | Purpose | Trigger |
|---|---|---|
| `places-autocomplete` | Google Places autocomplete proxy | On-demand (search) |
| `places-details` | Google Places details proxy | On-demand (restaurant add) |
| `places-nearby-search` | Google Places nearby search proxy | On-demand (discovery) |
| `discover-restaurants` | Find restaurants from Google Places for a town | Manual/cron |
| `restaurant-scraper` | Scrape restaurant website for menu/events | Manual/cron |
| `scraper-dispatcher` | Dispatch scraping jobs across restaurants | Cron |
| `menu-refresh` | Refresh menu data from scraped content | Cron |
| `backfill-restaurants` | Backfill restaurant data from Google Places | Manual |
| `seed-reviews` | Generate AI-estimated reviews from Google Places data | Manual |

---

## Implemented Features

### Feature 1: Home / Landing (Dual-Mode Toggle)

**User flow:** Open app → see full-screen ranked dish list (List mode). Toggle FAB switches to full-screen map (Map mode). Two committed modes, no half-states.
**Screens:** `Map.jsx` (serves as homepage at `/`)
**Components:** `DishSearch`, `CategoryChips`, `DishListItem`, `ModeFAB`, `RestaurantMap`, `EmptyState`
**Hooks:** `useDishes`, `useDishSearch`, `useLocationContext`
**API calls:** `dishesApi.getRankedDishes()` via `useDishes`, `dishesApi.search()` via `useDishSearch`
**Data reads:** `get_ranked_dishes` RPC, dishes table (search)
**Data writes:** none

**List mode (default):** Full-screen scrollable view. Sticky search bar at top with shadow. CategoryChips horizontal scroll below search. Section title ("Top Rated Nearby" / "Best [Category] Nearby" / "Results"). Ranked dish list using `DishListItem` — tap navigates to `/dish/:id`. Top 10 dishes shown.

**Map mode:** Full-screen Leaflet map with emoji dish pins. Floating search bar with zoom buttons (`[+] [search] [-]`). Radius control below search. Pin tap shows mini-card popup. Mini-card tap navigates to `/dish/:id`. No category chips in map mode.

**Toggle FAB:** Floating pill button, bottom-right, above BottomNav. Shows "Map" (with map icon) in list mode, "List" (with list icon) in map mode. Scroll position preserved across mode switches.

**Route state bridge:** Dish detail page "See on map" button navigates to `/` with `state: { focusDish: dishId }`, which activates map mode and flies to the dish's pin.

**Search:** `DishSearch` with `onSearchChange` prop. Debounced query filters both list (in list mode) and map pins (in map mode). Category chips filter in list mode only.

**VERIFIED** — `src/pages/Map.jsx`, `src/components/ModeFAB.jsx`

### Feature 2: Browse / Category View

**User flow:** Tap category → see ranked dishes filtered by category → search, sort, vote
**Screens:** `Browse.jsx`
**Components:** `RankedDishRow`, `SortDropdown`, `CategoryGrid`, `DishCardSkeleton`, `LoginModal`, `ImpactFeedback`
**Hooks:** `useDishes`, `useUserVotes`, `useDishSearch`, `useFavorites`
**API calls:** `dishesApi.getRankedDishes()`, `dishesApi.search()`, `votesApi.submitVote()`
**Data reads:** `get_ranked_dishes` RPC, dishes table (search)
**Data writes:** votes table (upsert), `check_vote_rate_limit` RPC

**Ranking display:** Matches homepage Top 10 style. Restaurant-first hierarchy (restaurant name bold, dish name small uppercase). Ranks 1-3 get podium treatment with medal colors. Ranks 4-10 in Apple-style grouped list (rounded container, surface bg, inset dividers, chevrons). "Show more" section uses same grouped container.

**VERIFIED** — `src/pages/Browse.jsx`, `src/components/browse/`

### Feature 3: Dish Detail

**User flow:** Tap dish → see full details, reviews, photos, friends' votes, variant picker
**Screens:** `Dish.jsx`
**Components:** `DishModal`, `ReviewFlow`, `VariantPicker`, `PhotoUploadButton`, `PhotoUploadConfirmation`
**Hooks:** `useDish`, `useDishPhotos`, `useVote`, `useFavorites`
**API calls:** `dishesApi.getDishById()`, `votesApi.getReviewsForDish()`, `votesApi.getSmartSnippetForDish()`
**Data reads:** dishes table, votes table, `get_dish_variants` RPC, `get_smart_snippet` RPC
**Data writes:** votes (upsert), dish_photos (insert)

**VERIFIED** — `src/pages/Dish.jsx`

### Feature 4: Vote Flow

**User flow:** Tap thumbs up/down → rate 1-10 → optional review text → submit
**Screens:** `ReviewFlow.jsx` (modal overlay)
**Hooks:** `useVote`
**API calls:** `votesApi.submitVote()`
**Data reads:** `check_vote_rate_limit` RPC
**Data writes:** votes table (upsert). Triggers fire: `on_vote_insert`, `check_consensus_after_vote`, `update_dish_avg_rating`
**Auth gate:** Requires login — shows `LoginModal` if not authenticated

**VERIFIED** — `src/components/ReviewFlow.jsx`, `src/hooks/useVote.js`, `src/api/votesApi.js`

### Feature 5: Search

**User flow:** Type in search bar (2+ chars) → see dish results across name, category, cuisine, tags
**Components:** `DishSearch.jsx`
**Hooks:** `useDishSearch`
**API calls:** `dishesApi.search()` — runs 3 parallel queries (name, cuisine, tags), dedupes, sorts by rating
**Data reads:** dishes table via PostgREST (not RPC)

**Dropdown display:** Search results match Top 10 compact row style — rank number, restaurant name bold, dish name secondary, rating. Restaurant-first hierarchy consistent with home and browse.

**VERIFIED** — `src/api/dishesApi.js:81-225`, `src/hooks/useDishSearch.js`

### Feature 6: Restaurants

**User flow:** Browse restaurants list (Open/Closed tabs) → tap restaurant → see its dishes ranked
**Screens:** `Restaurants.jsx`
**Hooks:** `useDishes` (with restaurantId param)
**API calls:** `dishesApi.getDishesForRestaurant()`, `restaurantsApi.getAll()`
**Data reads:** `get_restaurant_dishes` RPC, restaurants table
**Components:** `RestaurantDishes` (top-rated view), `RestaurantMenu` (split-pane menu view), `TopDishCard`

**Restaurant List:** Open/Closed tab switcher filters restaurants by `is_open`. Closed restaurants display at 0.6 opacity with a "Closed for Season" badge. Address links to Google Maps.

**Views:** Two tab-switched views below the restaurant details card:
- **Top Rated** (default) — dishes ranked by confidence (avg_rating, percent_worth_it, votes). Top 5 shown with expand toggle for the rest.
- **Menu** — split-pane layout: section navigation on the left (33% width, gold accent on active section), dish list on the right sorted by rating (highest first). Each dish row shows name, dotted leader, price, rating, and reorder %. Tapping a dish navigates to its detail page. Sections ordered by `restaurants.menu_section_order` TEXT[]. Dishes without a `menu_section` appear in an "Other" group.

**Menu sections** use restaurant-specific names that mirror each restaurant's actual menu layout (e.g., Rockfish uses Starters, Salads, Pizza, Chef's Specials, Burgers & Sandwiches, Tacos). Section names and order are set per-restaurant via `menu_section_order` TEXT[]. Dishes with `tags` array containing `lunch-only` or `dinner-only` display L/D badges in the menu view. Fallback defaults (from `supabase/migrations/populate-menu-sections.sql`) apply when actual menu sections aren't available:
- Soups & Apps (chowder, soup, apps, wings, tendys, fried chicken)
- Salads, Sandwiches (burger, lobster roll, taco, quesadilla), Pizza, Sushi
- Entrees (entree, pasta, seafood, fish, steak, chicken, asian, pokebowl)
- Sides (fries), Desserts (dessert, donuts), Breakfast (breakfast, breakfast sandwich)

Switching restaurants resets to "Top Rated" tab. Search filters work in both views.

**Map View:** Leaflet-based interactive map (`RestaurantMap`) with list/map toggle. Pins show restaurant locations colored by cuisine type. Tap pin → popup with name, distance, dish count.

**Add Restaurant:** Users can add restaurants via `AddRestaurantModal` — Google Places autocomplete pre-fills name, address, lat/lng. Duplicate detection via `find_nearby_restaurants` RPC (150m radius). Rate-limited to 5/hr.

**Restaurant Detail:** Standalone page (`/restaurants/:restaurantId`) with dish tabs (Top Rated/Menu), specials & events, AddDishModal, share button, contact info.

**Events:** `EventCard` component shows live music, trivia, comedy, etc. Managed by restaurant owners via `EventsManager` in the manager portal.

**VERIFIED** — `src/pages/Restaurants.jsx`, `src/pages/RestaurantDetail.jsx`, `src/api/restaurantsApi.js`, `src/components/restaurants/`

### Feature 7: User Profile (own)

**User flow:** Tap "You" tab → see stats, vote history, badges, favorites, reviews
**Screens:** `Profile.jsx` (protected)
**Hooks:** `useProfile`, `useUserVotes`, `useFavorites`
**API calls:** `profileApi`, `votesApi.getDetailedVotesForUser()`, `ratingIdentityApi`
**Data reads:** profiles, votes, user_rating_stats, user_badges, favorites
**Data writes:** profiles (update display_name, preferred_categories)
**Auth gate:** ProtectedRoute wrapper

**VERIFIED** — `src/pages/Profile.jsx`

### Feature 8: Public User Profile

**User flow:** Tap username anywhere → see their public profile, badges, vote history, taste compatibility
**Screens:** `UserProfile.jsx`
**API calls:** `profileApi`, `tasteApi.getCompatibility()`, `votesApi.getDetailedVotesForUser()`
**Data reads:** profiles, votes, `get_taste_compatibility` RPC, `get_public_badges` RPC

**VERIFIED** — `src/pages/UserProfile.jsx`

### Feature 9: Discover (Social)

**User flow:** Tap "Discover" tab → see similar taste users, friends' activity
**Screens:** `Discover.jsx`
**Components:** `SimilarTasteUsers`, `FollowListModal`, `UserSearch`
**API calls:** `tasteApi.getSimilarTasteUsers()`, `followsApi`
**Data reads:** `get_similar_taste_users` RPC

**VERIFIED** — `src/pages/Discover.jsx`

### Feature 9b: Local Hub (Specials & Events)

**User flow:** Specials and events surface on restaurant detail pages and via the Discover feed
**Components:** `SpecialCard`, `EventCard`
**Hooks:** `useSpecials`, `useEvents`
**API calls:** `specialsApi.getActiveSpecials()`, `eventsApi.getActiveEvents()`
**Data reads:** specials, events tables with restaurant joins
**Promoted items:** Gold left border + "Featured" badge, pinned to top of feed

**"Happening Here":** Restaurant detail pages show active specials and upcoming events below dish tabs. Uses `useRestaurantSpecials(restaurantId)` and `useRestaurantEvents(restaurantId)` hooks.

**VERIFIED** — `src/components/SpecialCard.jsx`, `src/components/EventCard.jsx`

### Feature 9c: Events Management

**User flow:** Manager portal → Events tab → CRUD events for restaurant
**Screens:** `ManageRestaurant.jsx` (Events tab)
**Components:** `EventsManager`
**API calls:** `restaurantManagerApi.createEvent()`, `.updateEvent()`, `.deactivateEvent()`
**Data reads/writes:** events table
**Auth gate:** Manager or admin only

**VERIFIED** — `src/components/restaurant-admin/EventsManager.jsx`

### Feature 9d: Automated Scraper

**Architecture:** pg_cron (daily 6 AM EST) → scraper-dispatcher edge function → restaurant-scraper edge function per restaurant
**Flow:** Fetch restaurant websites/Facebook pages → Claude Haiku extracts events/specials → upsert with source='auto_scrape'
**Edge functions:** `supabase/functions/restaurant-scraper/`, `supabase/functions/scraper-dispatcher/`
**Secrets:** ANTHROPIC_API_KEY in Supabase Edge Function secrets

### Feature 10: Favorites

**User flow:** Tap heart icon on dish → saves to "Heard it was Good Here" list in Profile
**Hooks:** `useFavorites` — optimistic toggle with rollback
**API calls:** `favoritesApi.addFavorite()`, `favoritesApi.removeFavorite()`
**Data reads/writes:** favorites table
**Auth gate:** Requires login

**VERIFIED** — `src/hooks/useFavorites.js`, `src/api/favoritesApi.js`

### Feature 11: Photo Upload

**User flow:** Tap camera icon on dish → select photo → client-side quality analysis → upload to Supabase Storage
**Components:** `PhotoUploadButton`, `PhotoUploadConfirmation`
**Hooks:** `useDishPhotos`
**API calls:** `dishPhotosApi.uploadPhoto()`, `check_photo_upload_rate_limit` RPC
**Data writes:** dish_photos table, Supabase Storage `dish-photos` bucket
**Auth gate:** Requires login

**VERIFIED** — `src/hooks/useDishPhotos.js`, `src/api/dishPhotosApi.js`

### Feature 12: Follow System

**User flow:** View user profile → tap Follow → see their votes in your feed
**API calls:** `followsApi.follow()`, `followsApi.unfollow()`
**Data writes:** follows table. Triggers fire: `update_follow_counts`, `notify_on_follow`
**Data reads:** `is_following` RPC, `get_follower_count`/`get_following_count` RPCs

**VERIFIED** — `src/api/followsApi.js`

### Feature 13: Notifications

**User flow:** Bell icon in TopBar → badge count → tap to see notification list
**Components:** `NotificationBell`
**API calls:** `notificationsApi.getNotifications()`, `notificationsApi.markAllRead()`
**Data reads:** `get_unread_notification_count` RPC, notifications table
**Data writes:** `mark_all_notifications_read` RPC

**VERIFIED** — `src/components/NotificationBell.jsx`, `src/api/notificationsApi.js`

### Feature 14: Rating Identity / Bias System

**User flow:** Vote on dishes → after 5+ votes on a dish, consensus forms → user sees how they compare → bias label assigned (Consensus Voter, Has Opinions, etc.)
**API calls:** `ratingIdentityApi`
**Data reads:** `get_user_rating_identity` RPC, `get_unseen_reveals` RPC
**Data writes:** Triggered by `check_consensus_after_vote` — populates `bias_events`, updates `user_rating_stats`

**VERIFIED** — `schema.sql:942-1034`, `src/api/ratingIdentityApi.js`

### Feature 15: Badge System

**User flow:** Meet criteria → badge auto-awarded → visible on profile
**Badge families:** category mastery (specialist/authority at 10/20 consensus votes), discovery (hidden gems, called-it), consistency (steady hand, tough critic, generous spirit), influence (follower milestones at 10/25)
**API calls:** `evaluate_user_badges` RPC (called after voting), `get_user_badges`/`get_public_badges` RPCs
**41 badge definitions** seeded in `schema.sql:1869-1924`

**VERIFIED** — `schema.sql:1038-1313`

### Feature 16: Value Score

**User flow:** Dishes with 8+ votes and a price → value_score computed (rating vs price-to-median ratio) → value_percentile assigned per category
**Trigger:** `compute_value_score` fires on dish insert/update
**Batch job:** `recalculate_value_percentiles()` runs via pg_cron every 2h
**Displayed in:** Browse feed, dish detail

**VERIFIED** — `schema.sql:1739-1823`, `supabase/migrations/value_score.sql`

### Feature 18: Restaurant Manager Portal

**User flow:** Admin creates invite → manager clicks link → accepts → can manage dishes and specials for their restaurant
**Screens:** `AcceptInvite.jsx`, `ManageRestaurant.jsx` (protected)
**API calls:** `restaurantManagerApi`, `get_invite_details` RPC, `accept_restaurant_invite` RPC
**Data reads/writes:** restaurant_invites, restaurant_managers, dishes, specials

**VERIFIED** — `src/pages/AcceptInvite.jsx`, `src/pages/ManageRestaurant.jsx`, `schema.sql:1482-1531`

### Feature 19: Admin Panel

**User flow:** Admin users → `/admin` → manage restaurants, dishes, users
**Screens:** `Admin.jsx` (protected)
**API calls:** `adminApi`
**Auth gate:** ProtectedRoute + `is_admin()` function

**VERIFIED** — `src/pages/Admin.jsx`, `src/api/adminApi.js`

### Feature 20: Auth

**User flow:** Magic link email login (Supabase Auth) → profile auto-created → pending vote replayed after redirect
**Screens:** `Login.jsx`, `ResetPassword.jsx`
**Components:** `LoginModal`, `WelcomeModal`
**Context:** `AuthContext` — provides `user`, `loading`, `signOut`
**Pending vote persistence:** Saves to localStorage before OAuth redirect, replays after
**Provider:** Supabase Auth with `persistSession: true` in localStorage

**VERIFIED** — `src/context/AuthContext.jsx`, `src/lib/supabase.js`, `src/lib/storage.js`

### Feature 21: Location

**User flow:** App defaults to MV center (41.43, -70.56) → user can grant geolocation → town filter (All Island or specific town)
**Context:** `LocationContext` — provides `location`, `radius`, `town`, `setTown`
**Persistence:** radius and town saved to localStorage

**VERIFIED** — `src/context/LocationContext.jsx`

---

## Frontend Architecture

### Routing

Evidence: `src/App.jsx:104-121`

| Route | Page | Auth Required | Layout |
|---|---|---|---|
| `/` | Home | No | Yes |
| `/browse` | Browse | No | Yes |
| `/dish/:dishId` | Dish | No | Yes |
| `/restaurants` | Restaurants | No | Yes |
| `/restaurants/:restaurantId` | Restaurants | No | Yes |
| `/discover` | Discover | No | Yes |
| `/profile` | Profile | **Yes** | Yes |
| `/user/:userId` | UserProfile | No | Yes |
| `/login` | Login | No | No |
| `/reset-password` | ResetPassword | No | No |
| `/admin` | Admin | **Yes** | No |
| `/invite/:token` | AcceptInvite | No | No |
| `/manage` | ManageRestaurant | **Yes** | No |
| `/privacy` | Privacy | No | No |
| `/terms` | Terms | No | No |
| `*` | NotFound | No | No |

**VERIFIED**

### State Management

| Layer | Tool | Evidence |
|---|---|---|
| Server state | React Query (`@tanstack/react-query`) | `src/main.jsx:3`, `src/hooks/useDishes.js` |
| Auth state | React Context (`AuthContext`) | `src/context/AuthContext.jsx` |
| Location state | React Context (`LocationContext`) | `src/context/LocationContext.jsx` |
| Component state | React `useState` / `useReducer` | All page components |
| Persistent state | localStorage via `src/lib/storage.js` | `src/lib/storage.js` |

**VERIFIED**

### API Layer Pattern

Evidence: `src/api/dishesApi.js`, `src/api/votesApi.js`

All API files follow:
1. Export a named object (`dishesApi`, `votesApi`, etc.)
2. Import `supabase` from `../lib/supabase`
3. Import `createClassifiedError` from `../utils/errorHandler`
4. Import `logger` from `../utils/logger`
5. RPC calls: `supabase.rpc(name, params)` → check error → throw `createClassifiedError(error)` → return `data || []`
6. Table queries: `selectFields` string → `supabase.from().select(selectFields)` → `.map()` transform
7. Errors: `try/catch`, `logger.error()`, re-throw with classification

**VERIFIED**

---

## Known Inconsistencies

1. ~~**CLAUDE.md design tokens are stale**~~ — **FIXED** (T03). CLAUDE.md now matches `src/index.css`.

2. ~~**`useFavorites` uses raw `useEffect` + state, not React Query**~~ — **FIXED** (T05). Migrated to `useQuery`/`useMutation`.

3. ~~**`profiles_delete_own` policy exists in schema but should not**~~ — **FIXED** (T01). Policy removed from schema.sql, migration created to drop in production.

4. ~~**`LocationContext` uses direct `localStorage` calls**~~ — **FIXED** (T06). Now uses `storage.js` helpers.

5. ~~**Pending vote storage key mismatch**~~ — **FIXED** (T04). CLAUDE.md now lists the correct key.

6. ~~**Production RLS may have duplicate policies**~~ — **FIXED** (T02). Migration created to drop 16 duplicate policies. See `supabase/migrations/cleanup_rls_policies.sql`.
