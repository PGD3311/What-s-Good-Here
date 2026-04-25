# Memorial Day Launch Checklist

**Target:** May 22, 2026
**Goal:** 1,000 users, 10 restaurants engaging, one viral moment

---

## TIER 1: Verify What Works (This Week)

These are blocking. Nothing else matters until these are confirmed.

### 1. Smoke Test the Live URL
- [ ] Open https://wghapp.com on your phone
- [ ] Home page loads — map renders with CARTO tiles (CSP fix just shipped)
- [ ] Browse page shows ranked dishes with real data
- [ ] Tap a dish — Dish page loads with score, reviews, restaurant info
- [ ] Restaurants page shows list with distances
- [ ] Bottom nav works on all pages
- [ ] Both themes toggle correctly (Appetite + Island Depths)

### 2. Verify Google OAuth (Denis thinks he already did this)
- [ ] Open the live URL, tap "Vote" on any dish
- [ ] LoginModal appears with "Continue with Google" button
- [ ] Tap it — redirects to Google consent screen
- [ ] Approve — redirects back to app, you're logged in
- [ ] Check Supabase Dashboard > Authentication > Users — your account appears
- [ ] Check `profiles` table — a row was auto-created with your Google name

**If OAuth fails:** Follow `docs/google-oauth-setup.md` steps 1-4. Takes 20 min.

### 3. Verify Schema Migrations
- [ ] Go to Supabase Dashboard > SQL Editor
- [ ] Run verification queries from `docs/pending-migrations.md` (the 4 SELECT queries at the bottom)
- [ ] If any return empty: run the two migration files in order

**Verification queries:**
```sql
-- These should all return rows. If any is empty, migrations need to run.
SELECT column_name FROM information_schema.columns WHERE table_name = 'votes' AND column_name = 'source';
SELECT table_name FROM information_schema.tables WHERE table_name IN ('jitter_profiles', 'jitter_samples', 'events', 'specials');
SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'users' AND trigger_name = 'on_auth_user_created';
SELECT table_name FROM information_schema.tables WHERE table_name = 'rate_limits';
```

### 4. Run Broader Seeding (if not already done)
- [ ] Run `supabase/seed/seed-broader-mv.sql` in SQL Editor
- [ ] Verify: dishes exist at restaurants that previously had none
- [ ] Cost: $0

---

## TIER 2: Real-World Testing (March)

### 5. Device Testing
- [ ] iPhone Safari — walk every page
- [ ] Android Chrome — walk every page
- [ ] Slow 3G simulation (Chrome DevTools > Network > Slow 3G) — does it degrade gracefully?
- [ ] No WiFi, just cell service — test on the island if possible

### 6. First Real Vote
- [ ] Log in via Google OAuth
- [ ] Vote on a real dish you've actually eaten
- [ ] Write a review
- [ ] Upload a photo
- [ ] Check: does it appear in the rankings? Does the average update?

### 7. First Pioneer Test
- [ ] Find one friend (bartender, foodie) willing to try the app
- [ ] Have them sign up, vote on 5+ dishes
- [ ] Watch where they get confused — that's your UX backlog

---

## TIER 3: Go-to-Market (April-May)

### 8. Restaurant Pitch Materials
- [ ] Build the pitch page URL you can text to owners (`/for-restaurants`)
- [ ] Create a one-pager (PDF or screenshot) showing sample restaurant data
- [ ] Design table tent / QR code card pointing to the app
- [ ] Price check on printing 100 table tents (Vistaprint, local print shop)

### 9. Door-Knocking Sprint
- [ ] List the 10 restaurants most likely to say yes (friends, regulars, etc.)
- [ ] Pitch them in person — show the app, show their data
- [ ] Ask: "Can I put a table tent on your counter?"
- [ ] Goal: 10 restaurants with table tents by Memorial Day weekend

### 10. Seed the Pioneer Network
- [ ] Text 10 bartender/foodie friends: "I built this, try it, be honest"
- [ ] Goal: 10 Pioneers with 20+ votes each before Memorial Day
- [ ] Their profiles become the shareable food guides for tourists

### 11. Ferry Terminal / Tourist Touchpoints
- [ ] Identify high-traffic tourist spots (ferry terminal, main street)
- [ ] Flyers? QR code stickers? Word of mouth through bartender friends?
- [ ] One viral moment idea: "What's the #1 dish on Martha's Vineyard?" posted somewhere tourists will see it

---

## TIER 4: Polish (May, Final 2 Weeks)

### 12. Food Journal Profile (building now in worktree)
- [ ] Merge `feature/food-journal` branch
- [ ] Verify shareable profile links work

### 13. Dish Page Decision Engine (other session brainstorming)
- [ ] Verdict → Action → Evidence layout shipped

### 14. Manager Dashboard
- [ ] At minimum: vote counts per dish visible to managers
- [ ] Shareable restaurant link with QR code

### 15. PWA Polish
- [ ] App icon for "Add to Home Screen"
- [ ] Splash screen
- [ ] Offline fallback page

---

## What's Already Done
- [x] 69 MV restaurants seeded
- [x] ~96 ranked dishes with AI votes
- [x] 6 killer lists rank-ready
- [x] Google OAuth frontend code
- [x] handle_new_user trigger written
- [x] Schema migrations written
- [x] Map CSP fix shipped
- [x] UI redesign (component consolidation) merged to main
- [x] Food journal design doc + implementation plan committed
