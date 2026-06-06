# Public Profile Parity (Part 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/user/:id` (`UserProfile.jsx`) read like the owner profile — remove the jitter "Review Fingerprint" card, the "{name}'s Ratings" heading, and the dead location-filter; rename tabs to Grid/Lists; fix a stale-TrustBadge bug; drop dead imports; delete the now-unused `ProfileJitterCard`.

**Architecture:** Removal-heavy chrome change to one page component plus deletion of one now-orphaned component. No new data, no schema, no grid/tile change. There is no `UserProfile.test.*`, so verification is build + lint + grep + the existing full unit suite (must stay green) + manual.

**Tech Stack:** React 19, React Router, Vitest, CSS variable tokens.

**Spec:** `docs/superpowers/specs/2026-06-06-public-profile-parity-design.md`

---

## File Structure
- `src/pages/UserProfile.jsx` — **modify** (all the alignment removals + tab rename + stale-badge fix + dead-import/dead-code removal).
- `src/components/jitter/ProfileJitterCard.jsx` — **delete** (orphaned after the card removal).
- `src/components/jitter/index.js` — **modify** (drop the `ProfileJitterCard` export).

---

## Task 1: Align `UserProfile.jsx` (removals + tab rename + stale-badge fix)

**Files:**
- Modify: `src/pages/UserProfile.jsx`

Make these edits (verify each `old` block matches before replacing; line numbers approximate). After all edits, verify with build + lint + grep (Steps at the end).

- [ ] **Step 1: Fix the stale-badge bug + drop `setJitterBadgeData`**

In the "// 4: Jitter badge" handler, replace:
```jsx
      if (results[4].status === 'fulfilled') {
        const badges = results[4].value
        if (badges && badges.length > 0) {
          setJitterBadgeType(jitterApi.getTrustBadgeType(badges[0]))
          setJitterBadgeData(badges[0])
        }
      } else {
        logger.error('Failed to fetch jitter badge:', results[4].reason)
      }
```
with:
```jsx
      if (results[4].status === 'fulfilled') {
        const badges = results[4].value
        if (badges && badges.length > 0) {
          setJitterBadgeType(jitterApi.getTrustBadgeType(badges[0]))
        } else {
          setJitterBadgeType(null)
        }
      } else {
        logger.error('Failed to fetch jitter badge:', results[4].reason)
      }
```

- [ ] **Step 2: Remove the `jitterBadgeData` state**

Delete this line (≈ line 75):
```jsx
  const [jitterBadgeData, setJitterBadgeData] = useState(null)
```

- [ ] **Step 3: Remove the `ProfileJitterCard` "Review Fingerprint" block**

Delete the entire block (≈ lines 667-681), including its comment:
```jsx
      {/* Review Fingerprint — surfaced near the top so visitors see the
          trust context before diving into specific picks. Only renders for
          users with jitter data (real humans, not the AI cold-start
          aggregator). */}
      {jitterBadgeData && (
        <div className="px-4 pt-3">
          <ProfileJitterCard
            profile={jitterBadgeData}
            displayName={profile.display_name}
            isPublic
          />
        </div>
      )}
```

- [ ] **Step 4: Remove the location-filter banner block**

Delete the entire block (≈ lines 686-707), including its comment:
```jsx
      {/* Location Filter Banner */}
      {locationFilter && (
        <div
          className="mx-4 mt-3 px-4 py-2.5 rounded-xl flex items-center justify-between"
          style={{
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-divider)',
          }}
        >
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Showing picks in <strong style={{ color: 'var(--color-text-primary)' }}>{formatLocationName(locationFilter)}</strong>
          </span>
          <button
            onClick={function () { setSearchParams({}) }}
            className="font-semibold"
            style={{ color: 'var(--color-primary)', fontSize: '13px' }}
          >
            Show all
          </button>
        </div>
      )}
```

- [ ] **Step 5: Remove the location-filter logic + the `restaurant_town` map field**

Delete the filter block (≈ lines 322-330):
```jsx
  // Apply location filter if present in URL
  if (locationFilter) {
    var locLower = locationFilter.toLowerCase().replace(/-/g, ' ')
    journalRatings = journalRatings.filter(function (d) {
      var town = (d.restaurant_town || '').toLowerCase()
      return town.indexOf(locLower) !== -1 || locLower.indexOf(town) !== -1
    })
  }
```
And in the `journalRatings` `.map(...)` object, delete this now-unused line (≈ line 312):
```jsx
        restaurant_town: vote.dish && vote.dish.restaurant_town,
```
(Because `journalRatings` is no longer reassigned by the filter, also change its declaration from `var journalRatings = ...` to `const journalRatings = ...` for cleanliness — verify nothing else reassigns it via grep `journalRatings =`.)

- [ ] **Step 6: Remove `locationFilter` + `useSearchParams`**

Delete (≈ line 56):
```jsx
  const locationFilter = searchParams.get('location')
```
Delete (≈ line 54):
```jsx
  const [searchParams, setSearchParams] = useSearchParams()
```
And in the react-router-dom import (line 2), drop `useSearchParams` (keep `useParams`, `useNavigate`, `useLocation`, `Link`):
```jsx
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
```

- [ ] **Step 7: Remove `LOCATION_NAMES` + `formatLocationName`**

Delete both module-scope helpers (≈ lines 27-37):
```jsx
// Known location display names for URL slugs
var LOCATION_NAMES = {
  'marthas-vineyard': "Martha's Vineyard",
  'nantucket': 'Nantucket',
  'cape-cod': 'Cape Cod',
}

function formatLocationName(slug) {
  if (LOCATION_NAMES[slug]) return LOCATION_NAMES[slug]
  // Title-case fallback: "oak-bluffs" → "Oak Bluffs"
  return slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase() })
}
```
(Verify zero remaining references to `LOCATION_NAMES` / `formatLocationName` via grep before deleting.)

- [ ] **Step 8: Rename the tabs to Grid / Lists**

Replace the tab strip's `.map` (≈ line 720). Change:
```jsx
        {['journal', 'playlists'].map(function (tab) {
          return (
            <button
              key={tab}
              onClick={function () { setActiveTab(tab) }}
              className="flex-1 py-3 text-xs font-semibold text-center"
              style={{
                color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
                background: 'transparent',
                border: 'none',
                borderBottomWidth: 2,
                borderBottomStyle: 'solid',
                borderBottomColor: activeTab === tab ? 'var(--color-primary)' : 'transparent',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          )
        })}
```
to:
```jsx
        {[
          { key: 'journal', label: 'Grid' },
          { key: 'playlists', label: 'Lists' },
        ].map(function (tab) {
          return (
            <button
              key={tab.key}
              onClick={function () { setActiveTab(tab.key) }}
              className="flex-1 py-3 text-xs font-semibold text-center"
              style={{
                color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                borderBottom: activeTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
                background: 'transparent',
                border: 'none',
                borderBottomWidth: 2,
                borderBottomStyle: 'solid',
                borderBottomColor: activeTab === tab.key ? 'var(--color-primary)' : 'transparent',
              }}
            >
              {tab.label}
            </button>
          )
        })}
```
Also update the comment above it (≈ line 709) from `{/* Tabs: Journal / Playlists (no Saved — that's personal) */}` to `{/* Tabs: Grid / Lists (no Saved — that's personal) */}`.

- [ ] **Step 9: Drop the "{name}'s Ratings" heading above the grid**

In the `activeTab === 'journal'` block (≈ lines 742-768), change:
```jsx
      {activeTab === 'journal' && (
        <>
          {/* My Ratings shelf title */}
          <div className="px-4 pt-5 pb-1">
            <h2
              style={{
                fontFamily: "'Amatic SC', cursive",
                color: 'var(--color-text-primary)',
                fontSize: '32px',
                fontWeight: 700,
                letterSpacing: '0.02em',
              }}
            >
              {profile.display_name}'s Ratings
            </h2>
          </div>

          {/* Food-story grid — viewed user's own photos (or typographic tile) */}
          <ProfileGrid
            ratings={gridRatings}
            photoMap={ownPhotoMap}
            loading={reviewsLoading}
            resetKey={userId}
            emptyTitle="No food story yet"
            emptySubtitle="This person hasn't rated anything yet"
          />
        </>
      )}
```
to:
```jsx
      {activeTab === 'journal' && (
        <ProfileGrid
          ratings={gridRatings}
          photoMap={ownPhotoMap}
          loading={reviewsLoading}
          resetKey={userId}
          emptyTitle="No food story yet"
          emptySubtitle="This person hasn't rated anything yet"
        />
      )}
```

- [ ] **Step 10: Remove the unused `PlaylistStripCard` import**

Delete (≈ line 16):
```jsx
import { PlaylistStripCard } from '../components/playlists/PlaylistStripCard'
```
(Grep `PlaylistStripCard` in `UserProfile.jsx` first — confirm the import is its only occurrence; `PlaylistGridCard` is the one actually used.)

- [ ] **Step 11: Remove the now-unused `ProfileJitterCard` import**

Change (≈ line 19):
```jsx
import { TrustBadge, ProfileJitterCard } from '../components/jitter'
```
to:
```jsx
import { TrustBadge } from '../components/jitter'
```

- [ ] **Step 12: Verify (build + lint + grep)**

Run: `npm run build` → must succeed.
Run: `npx eslint src/pages/UserProfile.jsx` → expect **no errors and no NEW unused-var warnings** introduced by these removals. (Pre-existing `myRatings`/`ratingBias` warnings may remain — those are the deferred follow-up; do NOT remove them here.)
Run these greps in `src/pages/UserProfile.jsx`, each expecting ZERO:
`grep -n "ProfileJitterCard\|jitterBadgeData\|locationFilter\|LOCATION_NAMES\|formatLocationName\|useSearchParams\|setSearchParams\|PlaylistStripCard\|restaurant_town\|'s Ratings" src/pages/UserProfile.jsx`
Run: `npx vitest run` → full suite stays green.

- [ ] **Step 13: Commit** (stage ONLY UserProfile.jsx; do NOT `git add -A`; unrelated untracked files exist)

```bash
git add src/pages/UserProfile.jsx
git commit -m "feat(profile): align public profile with owner page (drop jitter card, heading, location filter; Grid/Lists tabs; fix stale badge)"
```

---

## Task 2: Delete the orphaned `ProfileJitterCard`

**Files:**
- Delete: `src/components/jitter/ProfileJitterCard.jsx`
- Modify: `src/components/jitter/index.js`

- [ ] **Step 1: Confirm zero remaining consumers**

Run: `grep -rn "ProfileJitterCard" src/`
Expected: only (a) the barrel export in `src/components/jitter/index.js`, (b) the component file itself. (Task 1 removed the `UserProfile.jsx` import/use.) If ANY other file references it, STOP and report BLOCKED with the references.

- [ ] **Step 2: Remove the barrel export**

In `src/components/jitter/index.js`, delete the `ProfileJitterCard` export line (e.g. `export { ProfileJitterCard } from './ProfileJitterCard'`). Leave the other exports (`TrustBadge`, `TrustSummary`, `JitterExplainer`, etc.) intact.

- [ ] **Step 3: Delete the component file**

Run: `git rm src/components/jitter/ProfileJitterCard.jsx`
(Also check `ls src/components/jitter/ProfileJitterCard.test.* 2>/dev/null` — if a test exists, `git rm` it too and mention it.)

- [ ] **Step 4: Verify**

Run: `grep -rn "ProfileJitterCard" src/` → ZERO output.
Run: `npm run build` → succeeds.
Run: `npx vitest run src/components/` → no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/components/jitter/index.js
git commit -m "refactor(profile): delete orphaned ProfileJitterCard"
```

---

## Task 3: Full verification + Codex

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite** — `npm run test` → all green (no `UserProfile` tests exist; confirm nothing else regressed).
- [ ] **Step 2: Build + ES guard** — `npm run build` succeeds; `grep -rn "toSorted\|\.at(" src/pages/UserProfile.jsx` → none.
- [ ] **Step 3: Hard-rule greps** — `grep -rn "console\.\|text-gray-\|bg-blue-" src/pages/UserProfile.jsx` → none (a legitimate `supabase` reference is not expected here; confirm none introduced).
- [ ] **Step 4: Whole-diff Codex** — `git diff origin/main...HEAD` reviewed with Codex (default model): confirm no orphaned refs, the stale-badge fix is correct, the location/jitter removals left nothing dangling, blocked-user path untouched.
- [ ] **Step 5: Ready for PR** — `git log --oneline origin/main..HEAD` shows the task commits on `feat/public-profile-parity`.

---

## Self-Review (spec coverage)
- Remove Review Fingerprint card + jitterBadgeData + import → Task 1 Steps 2,3,11. ✓
- Stale-badge fix (clear on empty) → Task 1 Step 1. ✓
- Rename tabs Grid/Lists → Task 1 Step 8. ✓
- Drop "{name}'s Ratings" heading → Task 1 Step 9. ✓
- Remove location banner + filter + restaurant_town + locationFilter + useSearchParams + LOCATION_NAMES/formatLocationName → Task 1 Steps 4-7. ✓
- Remove unused PlaylistStripCard import → Task 1 Step 10. ✓
- Delete orphaned ProfileJitterCard → Task 2. ✓
- Keep useLocation (handleFollowToggle), Follow/taste-match/actions, TrustBadge, two-tier stats, LocalListCard, blocked-user path → untouched by all tasks. ✓
- myRatings/ratingBias deferred (not in any task) → per spec. ✓
- CLAUDE.md dead-code/tokens/no-console → Task 1 Step 12 + Task 3. ✓
