# Smoke Test Recipes

*How to verify a UI change actually works. Any Claude session that ships frontend or RPC work should walk the relevant golden path in a browser before claiming done — if it can't, it must say so explicitly.*

> **Dan:** the account list and a few paths below are placeholders. Fill in with real test creds and tweak the recipes when something changes. Commit to the repo so every Claude session shares the same recipe.

---

## Test accounts

Keep these in `.env.local.test` (gitignored). Ask Dan if you don't have access.

| Role | Email | Password | What it tests |
|---|---|---|---|
| **anon** | — | — | Browse, Map, Dish detail without login |
| **user** | _(Dan: fill)_ | _(Dan: fill)_ | Voting, favorites, reviews, profile |
| **manager** | _(Dan: fill)_ | _(Dan: fill)_ | `/manage` portal for _(restaurant name)_ |
| **admin** | _(Dan: fill)_ | _(Dan: fill)_ | `/admin` moderation queue |
| **curator** | _(Dan: fill)_ | _(Dan: fill)_ | Local lists / playlists authoring |

If a feature needs a specific data shape (e.g., a dish with zero votes, a user with 10+ votes for taste-match), note it in the recipe's **Data preconditions** line so the next Claude session knows exactly what state to seed or select.

---

## Golden paths by feature

### Voting
**Data preconditions:** any dish with `total_votes >= 3` (so the review appears alongside existing ones); **user** account has no prior vote on it.
1. Sign in as **user**
2. Navigate to `/dish/:id`
3. Rate 8/10, add a short review, submit
4. Refresh page — vote persists, review appears in snippets
5. Check `/profile` — the vote shows up in the journal feed

### Favorites
**Data preconditions:** **user** account has zero favorites (so the "add" is unambiguous).
1. Sign in as **user**
2. Tap heart on any dish card on `/browse`
3. Navigate to `/profile` → Favorites tab
4. Dish appears in favorites list
5. Tap heart again to remove — disappears on refresh

### Homepage dual-mode
**Data preconditions:** none — anon flow.
1. Visit `/` as **anon**
2. List mode renders by default
3. Tap `ModeFAB` (bottom-right) → map mode activates
4. Category emoji pins render on map
5. Tap a pin → bottom sheet with dish info
6. Tap "See on map" from dish detail → routes back to map mode
7. Refresh while in map mode — mode persists

### Manager delete (vote-gated)
**Data preconditions:** **manager** owns a restaurant with *both* a dish where `total_votes = 0` AND a dish where `total_votes > 0`. If not, seed by adding a new dish (which starts at 0 votes) and using an existing voted dish.
1. Sign in as **manager**
2. Navigate to `/manage`
3. On a dish with `total_votes = 0` → delete button is visible and works (dish disappears)
4. On a dish with `total_votes > 0` → delete control is **disabled in the UI** with a tooltip/message explaining why (dish belongs to the crowd once voted on). This is important: silently missing buttons is bad UX; we want an explicit explanation.
5. Also verify the DB enforces it: open DevTools → attempt `supabase.from('dishes').delete().eq('id', voted_dish_id)` → should return 0 rows affected (RLS blocks). The UI gate + RLS gate are two independent layers.
6. Edit a dish's name/price → saves successfully
7. Open DevTools → try `supabase.from('dishes').update({ avg_rating: 10 })` → should fail (column-lock trigger rejects the update; error should be surfaced, not silent)

### Admin moderation
**Data preconditions:** at least 1 open report, ideally 3+ with varying `reported_user_id` so the priority sort is observable.
1. Sign in as **admin**
2. Navigate to `/admin`
3. Queue shows open reports sorted by `target_user_open_report_count DESC, created_at DESC`
4. _(With a real report)_ Open → reject → status becomes `reviewed`
5. Verify keyset pagination: scroll to bottom, next page loads using `(open_count, created_at, id)` cursor — not `offset`. Check Network tab for the RPC call.

### Ask WGH _(once shipped)_
**Data preconditions:** a location within the MV serving area (else the geo filter returns empty).
1. Visit `/` as **anon**, tap Ask WGH entry point
2. Ask "what's a good burger near me?" — gets a streaming response with real dish names
3. Ask 2 more questions — third one hits the rate limit (2/hour for anon)
4. Sign in as **user**, rate limit resets to 6/hour
5. Confirm prompt caching hits in logs (should see `cache_read_input_tokens` > 0 on later turns)

---

## How to run locally

```bash
npm run dev        # localhost:5173
npm run test:e2e   # runs Playwright across all 3 personas
```

For a targeted check:
```bash
npm run test:e2e:browser   # tourist persona (anon)
npm run test:e2e:pioneer   # foodie (logged-in user)
npm run test:e2e:business  # manager portal
```

---

## If you can't smoke-test

Sometimes a session is SQL-only, or the dev environment isn't available, or you're mid-refactor and the app doesn't render. In those cases:

- **Say so explicitly in the final message.** Don't claim the feature works if you haven't seen it work.
- **Run `npm run build` and `npm run test`** as the minimum sanity check.
- **Flag the verification gap** so Dan (or the next Claude session) knows to test manually before shipping.

"I didn't run the UI" is honest. "It works" when you haven't checked is not.
