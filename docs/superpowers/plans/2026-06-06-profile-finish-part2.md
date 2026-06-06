# Profile Finish (Part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the profile: a calmer left-aligned `HeroIdentityCard` (Jitter box gone; conditional shared-`TrustBadge` chip + curator pill in), tabs trimmed to Grid · Lists · Saved (Visits dropped, dead `RecentVisitsList` deleted), and the "Your Food Story" heading removed.

**Architecture:** Make `HeroIdentityCard` presentational — it loses all internal Jitter logic and takes two new props (`isCurator`, `trustBadgeType`). The trust chip reuses the shared `TrustBadge` component (same copy as the public profile), gated to `human_verified`/`trusted_reviewer`. `Profile.jsx` computes `trustBadgeType` via `jitterApi.getTrustBadgeType(jitterProfile)` (the `jitterProfile` it already fetches), removes the standalone curator card, relabels tabs, drops Visits + the heading, and deletes `RecentVisitsList`.

**Tech Stack:** React 19, React Router (`Link`), Vitest + React Testing Library, CSS variable tokens.

**Spec:** `docs/superpowers/specs/2026-06-06-profile-finish-part2-design.md`

---

## File Structure
- `src/components/profile/HeroIdentityCard.jsx` — **rewrite** (strip Jitter, add chip + pill + props).
- `src/components/profile/HeroIdentityCard.test.jsx` — **create**.
- `src/pages/Profile.jsx` — **modify** (props wiring, remove curator card, tabs, heading, drop RecentVisitsList usage).
- `src/components/profile/RecentVisitsList.jsx` — **delete**.
- `src/components/profile/index.js` — **modify** (drop RecentVisitsList export).

---

## Task 1: Rewrite `HeroIdentityCard` (strip Jitter, add trust chip + curator pill)

**Files:**
- Modify (full rewrite): `src/components/profile/HeroIdentityCard.jsx`
- Test: `src/components/profile/HeroIdentityCard.test.jsx` (create)

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/profile/HeroIdentityCard.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HeroIdentityCard } from './HeroIdentityCard'

vi.mock('../../api/profileApi', () => ({ profileApi: { uploadAvatar: vi.fn() } }))

const BASE = {
  user: { email: 'a@b.com' },
  profile: { display_name: 'PGD', avatar_url: null, is_local_curator: false },
  stats: { totalVotes: 30, uniqueRestaurants: 16, reviewCount: 17 },
  followCounts: { followers: 7, following: 30 },
  editingName: false,
  newName: '',
  nameStatus: null,
  setEditingName: () => {},
  setNewName: () => {},
  setNameStatus: () => {},
  handleSaveName: () => {},
  setFollowListModal: () => {},
  isCurator: false,
  trustBadgeType: null,
  onAvatarUpdated: () => {},
}

function renderCard(overrides) {
  return render(
    <MemoryRouter>
      <HeroIdentityCard {...BASE} {...overrides} />
    </MemoryRouter>
  )
}

describe('HeroIdentityCard (Part 2)', () => {
  it('renders the name and two-tier stats', () => {
    renderCard()
    expect(screen.getByText('PGD')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()   // dishes
    expect(screen.getByText('16')).toBeInTheDocument()   // spots
    expect(screen.getByText('7')).toBeInTheDocument()    // followers
  })

  it('shows the Verified Human trust badge when trustBadgeType is human_verified', () => {
    renderCard({ trustBadgeType: 'human_verified' })
    expect(screen.getByText('Verified Human')).toBeInTheDocument()
  })

  it('shows the Trusted Reviewer badge when trustBadgeType is trusted_reviewer', () => {
    renderCard({ trustBadgeType: 'trusted_reviewer' })
    expect(screen.getByText('Trusted Reviewer')).toBeInTheDocument()
  })

  it('shows NO trust badge for building or null', () => {
    const { rerender } = renderCard({ trustBadgeType: 'building' })
    expect(screen.queryByText('Verified Human')).toBeNull()
    expect(screen.queryByText('Trusted Reviewer')).toBeNull()
    expect(screen.queryByText('Building trust')).toBeNull()
    rerender(<MemoryRouter><HeroIdentityCard {...BASE} trustBadgeType={null} /></MemoryRouter>)
    expect(screen.queryByText(/Verified Human|Trusted Reviewer|Building/)).toBeNull()
  })

  it('does not render the old Jitter reviews/rhythm box', () => {
    renderCard({ trustBadgeType: 'trusted_reviewer' })
    expect(screen.queryByText('reviews')).toBeNull()
    expect(screen.queryByText('rhythm')).toBeNull()
  })

  it('shows the curator Edit Top 10 pill linking to /my-list only when isCurator', () => {
    const { rerender } = renderCard({ isCurator: false })
    expect(screen.queryByText(/Edit Top 10/)).toBeNull()
    rerender(<MemoryRouter><HeroIdentityCard {...BASE} isCurator={true} /></MemoryRouter>)
    const link = screen.getByRole('link', { name: /Edit Top 10/ })
    expect(link.getAttribute('href')).toBe('/my-list')
  })

  it('does not render the trust badge while editing the name', () => {
    renderCard({ trustBadgeType: 'trusted_reviewer', editingName: true })
    expect(screen.queryByText('Trusted Reviewer')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/profile/HeroIdentityCard.test.jsx`
Expected: FAIL — current component renders the Jitter box / has no `trustBadgeType` handling, and `isCurator` pill doesn't exist.

- [ ] **Step 3: Rewrite the component**

Replace the ENTIRE contents of `src/components/profile/HeroIdentityCard.jsx` with:

```jsx
import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { profileApi } from '../../api/profileApi'
import { logger } from '../../utils/logger'
import { TrustBadge } from '../TrustBadge'

/**
 * Hero Identity Card for the Profile page (owner).
 * Left-aligned: avatar + (name row with optional trust badge) + two-tier stats
 * + optional curator pill. Trust badge reuses the shared TrustBadge (same copy
 * as the public profile) and only shows for earned tiers.
 */
export function HeroIdentityCard({
  user,
  profile,
  stats,
  followCounts,
  editingName,
  newName,
  nameStatus,
  setEditingName,
  setNewName,
  setNameStatus,
  handleSaveName,
  setFollowListModal,
  isCurator,
  trustBadgeType,
  onAvatarUpdated,
}) {
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileInputRef = useRef(null)

  const handleAvatarPick = () => {
    if (avatarUploading) return
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    setAvatarUploading(true)
    try {
      await profileApi.uploadAvatar(file)
      onAvatarUpdated?.()
    } catch (error) {
      logger.error('Avatar upload failed:', error)
      toast.error(error?.message || "Couldn't upload your photo.")
    } finally {
      setAvatarUploading(false)
    }
  }

  // Only earned tiers surface a badge; 'building'/null/ai_estimated do not.
  const showTrust = trustBadgeType === 'human_verified' || trustBadgeType === 'trusted_reviewer'

  return (
    <div
      className="relative px-4 pt-8 pb-5 overflow-hidden"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Bottom divider */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px"
        style={{
          width: '90%',
          background: 'linear-gradient(90deg, transparent, var(--color-divider), transparent)',
        }}
      />

      {/* Avatar + identity column */}
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={handleAvatarPick}
          disabled={avatarUploading}
          aria-label={profile?.avatar_url ? 'Change profile picture' : 'Add profile picture'}
          aria-busy={avatarUploading}
          className="relative w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0 overflow-hidden p-0 active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          style={{
            background: 'var(--color-primary)',
            color: 'var(--color-text-on-primary)',
            boxShadow: '0 0 0 3px var(--color-primary-muted)',
            border: 'none',
          }}
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <span>
              {profile?.display_name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
            </span>
          )}
          {avatarUploading && (
            <span
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: 'rgba(0, 0, 0, 0.35)' }}
              aria-live="polite"
            >
              <span
                className="w-6 h-6 border-2 rounded-full animate-spin"
                style={{ borderColor: 'rgba(255,255,255,0.35)', borderTopColor: '#fff' }}
                aria-hidden="true"
              />
              <span className="sr-only">Uploading…</span>
            </span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        />

        <div className="flex-1 min-w-0">
          {/* Name row (+ trust badge at far right when not editing) */}
          {editingName ? (
            <div className="flex flex-col gap-1">
              <div className="relative">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value.replace(/\s/g, ''))}
                  className="w-full px-3 py-1.5 border rounded-lg text-lg font-bold focus:outline-none pr-8"
                  style={{
                    background: 'var(--color-surface-elevated)',
                    borderColor: nameStatus === 'taken' ? 'var(--color-red)' : nameStatus === 'available' ? 'var(--color-emerald)' : 'var(--color-divider)',
                    color: 'var(--color-text-primary)'
                  }}
                  autoFocus
                  maxLength={30}
                />
                {nameStatus && nameStatus !== 'same' && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm">
                    {nameStatus === 'checking' && '⏳'}
                    {nameStatus === 'available' && '✓'}
                    {nameStatus === 'taken' && '✗'}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveName}
                  disabled={nameStatus === 'taken' || nameStatus === 'checking'}
                  className="px-3 py-1 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingName(false)
                    setNewName(profile?.display_name || '')
                    setNameStatus(null)
                  }}
                  className="px-3 py-1 rounded-lg text-sm font-medium"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Cancel
                </button>
              </div>
              {nameStatus === 'taken' && (
                <p className="text-xs" style={{ color: 'var(--color-red)' }}>Username taken</p>
              )}
              {nameStatus === 'available' && (
                <p className="text-xs" style={{ color: 'var(--color-emerald)' }}>Available!</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setEditingName(true)}
                className="font-bold transition-colors inline-flex items-center gap-1.5 min-w-0"
                style={{
                  color: 'var(--color-text-primary)',
                  fontSize: '22px',
                  letterSpacing: '-0.02em',
                  lineHeight: '1.2',
                }}
              >
                <span className="truncate">{profile?.display_name || 'Set your name'}</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                </svg>
              </button>
              {showTrust && (
                <div className="flex-shrink-0">
                  <TrustBadge type={trustBadgeType} />
                </div>
              )}
            </div>
          )}

          {/* Stats — two tiers: content identity (dishes · spots) primary,
              social (followers · following) quieter beneath. */}
          {stats.totalVotes > 0 && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap" style={{ fontSize: '13px' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>
                <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>{stats.totalVotes}</span> dishes
              </span>
              {stats.uniqueRestaurants > 0 && (
                <>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>&middot;</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>{stats.uniqueRestaurants}</span> spots
                  </span>
                </>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap" style={{ fontSize: '12px' }}>
            <button
              onClick={() => setFollowListModal('followers')}
              className="hover:underline transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                {followCounts.followers}
              </span> followers
            </button>
            <span style={{ color: 'var(--color-text-tertiary)' }}>&middot;</span>
            <button
              onClick={() => setFollowListModal('following')}
              className="hover:underline transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                {followCounts.following}
              </span> following
            </button>
          </div>

          {/* Curator pill — folded in from the old standalone card. */}
          {isCurator && (
            <div className="mt-2.5">
              <Link
                to="/my-list"
                className="inline-flex items-center gap-1.5 rounded-full font-semibold active:scale-[0.98] transition-transform"
                style={{
                  border: '1.5px solid var(--color-accent-gold)',
                  color: 'var(--color-accent-gold)',
                  background: 'var(--color-surface-elevated)',
                  fontSize: '12px',
                  padding: '6px 12px',
                  textDecoration: 'none',
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z" />
                </svg>
                Edit Top 10
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default HeroIdentityCard
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/profile/HeroIdentityCard.test.jsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/HeroIdentityCard.jsx src/components/profile/HeroIdentityCard.test.jsx
git commit -m "feat(profile): calm HeroIdentityCard — TrustBadge chip + curator pill, drop Jitter box"
```

---

## Task 2: Wire `Profile.jsx` to the new header (props + remove standalone curator card)

**Files:**
- Modify: `src/pages/Profile.jsx`

- [ ] **Step 1: Update the `HeroIdentityCard` invocation**

Find the `<HeroIdentityCard ... />` block (~line 219-234). Replace the `jitterProfile={jitterProfile}` prop line with the two new props:

```jsx
            setFollowListModal={setFollowListModal}
            isCurator={profile?.is_local_curator}
            trustBadgeType={jitterApi.getTrustBadgeType(jitterProfile)}
            onAvatarUpdated={refetchProfile}
```

(`jitterApi` is already imported in Profile.jsx; `jitterProfile` state is already populated via the existing `getMyProfile` effect. `getTrustBadgeType` safely returns `null` when `jitterProfile` is null.)

- [ ] **Step 2: Remove the standalone curator card**

Delete the entire `{profile?.is_local_curator && ( ... )}` block (the `<Link to="/my-list">` "Edit my Top 10" card, ~lines 374-414, including its leading comment block). The pill now lives in `HeroIdentityCard`.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds. (If `Link` is now unused in Profile.jsx after removing the card, ESLint will warn — check Step 4 of Task 4; do not remove the `Link` import yet, the tabs/other code may still use it. Grep `<Link` before removing.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/Profile.jsx
git commit -m "feat(profile): wire calm header props, remove standalone curator card"
```

---

## Task 3: `Profile.jsx` — relabel tabs, drop Visits, drop the heading

**Files:**
- Modify: `src/pages/Profile.jsx`

- [ ] **Step 1: Replace the tab strip with a labeled, Visits-free set**

Find the tab strip (~line 415-445). Replace the `{['journal', 'visits', 'playlists', 'saved'].map(...)}` block so it (a) drops `'visits'`, and (b) shows display labels Grid/Lists/Saved while keeping internal keys. Change the array + label rendering:

```jsx
            {[
              { key: 'journal', label: 'Grid' },
              { key: 'playlists', label: 'Lists' },
              { key: 'saved', label: 'Saved' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
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
            ))}
```

- [ ] **Step 2: Remove the Visits tab content block**

Delete the entire `{activeTab === 'visits' && ( ... )}` section (the block rendering `<RecentVisitsList userId={user?.id} />` and its heading). Leave the `journal`, `playlists`, `saved` content blocks intact.

- [ ] **Step 3: Drop the "Your Food Story" heading above the grid**

In the `activeTab === 'journal'` block, remove the heading wrapper so the grid stands alone. Change:

```jsx
          {activeTab === 'journal' && (
            <>
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
                  Your Food Story
                </h2>
              </div>
              <ProfileGrid
                ratings={ratedDishes}
                photoMap={ownPhotoMap}
                loading={votesLoading}
                resetKey={user?.id}
                emptyTitle="Your food story starts here"
                emptySubtitle="Rate your first dish to fill the grid"
              />
            </>
          )}
```

to:

```jsx
          {activeTab === 'journal' && (
            <ProfileGrid
              ratings={ratedDishes}
              photoMap={ownPhotoMap}
              loading={votesLoading}
              resetKey={user?.id}
              emptyTitle="Your food story starts here"
              emptySubtitle="Rate your first dish to fill the grid"
            />
          )}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Profile.jsx
git commit -m "feat(profile): tabs -> Grid/Lists/Saved (drop Visits), drop Food Story heading"
```

---

## Task 4: Delete the now-dead `RecentVisitsList`

**Files:**
- Delete: `src/components/profile/RecentVisitsList.jsx`
- Modify: `src/components/profile/index.js`, `src/pages/Profile.jsx`

- [ ] **Step 1: Confirm zero remaining consumers**

Run: `grep -rn "RecentVisitsList" src/`
Expected: only the import in `src/pages/Profile.jsx`, the barrel export in `src/components/profile/index.js`, and the file itself. (The Visits tab usage was removed in Task 3.) If anything else references it, STOP and report.

- [ ] **Step 2: Remove the import in `Profile.jsx`**

Delete the `RecentVisitsList` import line in `src/pages/Profile.jsx` (it's imported from `'../components/profile'` — remove just that name from the import, keep the others like `HeroIdentityCard`, `ProfileGrid`).

- [ ] **Step 3: Remove the barrel export**

In `src/components/profile/index.js`, delete the line `export { RecentVisitsList } from './RecentVisitsList'`.

- [ ] **Step 4: Delete the component file**

Run: `git rm src/components/profile/RecentVisitsList.jsx`

- [ ] **Step 5: Verify zero references + build**

Run: `grep -rn "RecentVisitsList" src/` → expect no output.
Run: `npm run build` → succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Profile.jsx src/components/profile/index.js
git commit -m "refactor(profile): delete dead RecentVisitsList after dropping Visits tab"
```

---

## Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `npm run test`
Expected: PASS, including the new `HeroIdentityCard.test.jsx` (7 tests). No regressions.

- [ ] **Step 2: Lint (touched files only — repo has a pre-existing baseline)**

Run: `npx eslint src/components/profile/HeroIdentityCard.jsx src/components/profile/HeroIdentityCard.test.jsx src/pages/Profile.jsx src/components/profile/index.js`
Expected: 0 errors and 0 NEW warnings from these files (pre-existing warnings unrelated to this change are acceptable; an unused `Link`/`jitterApi` import in Profile.jsx introduced by this change is NOT acceptable — remove it if it appears).

- [ ] **Step 3: Build + ES2023 guard**

Run: `npm run build` → succeeds.
Run: `grep -rn "toSorted\|\.at(" src/components/profile/HeroIdentityCard.jsx` → no matches.

- [ ] **Step 4: Hard-rule greps**

Run: `grep -rn "console\.\|supabase\.\|text-gray-\|bg-blue-\|text-white" src/components/profile/HeroIdentityCard.jsx` → no matches.

- [ ] **Step 5: Codex review of the whole diff**

Run: `git diff origin/main...HEAD` and review with Codex (default model, no `-m` flag):
focus on the `HeroIdentityCard` rewrite (no orphaned Jitter refs, chip gating, edit-mode rule) and the Profile.jsx wiring (trustBadgeType source, removed card, tabs, deleted component).

- [ ] **Step 6: Confirm ready for PR**

Run: `git log --oneline origin/main..HEAD` → the task commits are present on `feat/profile-finish-part2`.

---

## Self-Review (spec coverage)
- Calm left-aligned header, Jitter box removed → Task 1. ✓
- Trust chip = shared `TrustBadge`, gated to human_verified/trusted_reviewer, hidden in edit mode → Task 1 (+ tests). ✓
- Curator "Edit Top 10" folds into header pill → `/my-list` → Task 1 (pill) + Task 2 (remove old card). ✓
- `trustBadgeType` sourced via `getTrustBadgeType(jitterProfile)` → Task 2. ✓
- Tabs Grid·Lists·Saved, keys unchanged, Visits dropped → Task 3. ✓
- "Your Food Story" heading dropped → Task 3. ✓
- Dead `RecentVisitsList` deleted → Task 4. ✓
- People-search bar + unrated banner untouched (not referenced in any task) → ✓
- CLAUDE.md (var tokens, no console/supabase/toSorted, dead-code removed) → Tasks 1 & 5. ✓
