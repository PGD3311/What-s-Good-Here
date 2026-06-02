# Curator Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give new local curators a one-time full-screen welcome splash plus a persistent setup checklist on the My-List editor, and require a bio before publishing — so they understand add / rate-first / bio instead of being confused.

**Architecture:** Two new presentational components in `src/components/profile/` (a full-screen splash and a 3-step checklist), wired into `src/pages/MyList.jsx`. The splash is invite-gated (route flag + one-time localStorage key); the checklist is completeness-gated and self-hides when done. A soft gate in `handleSave` blocks publishing with an empty bio. No schema change.

**Tech Stack:** React 19, Vitest + @testing-library/react, CSS variables for brand color, localStorage via `src/lib/storage.js`.

**Reference spec:** `docs/superpowers/specs/2026-06-02-curator-onboarding-design.md`

**Conventions (from CLAUDE.md):**
- Brand colors via `var(--color-*)`. Hex only for one-offs (e.g. `#fff` on a colored fill — already used in MyList). No Tailwind color classes.
- Amatic SC for display headings; Outfit (inherited) for body.
- No decorative emoji anywhere. Use an inline SVG check mark for "done", numbers for steps.
- All localStorage via `src/lib/storage.js`.
- `MyList.jsx` uses `var` + `function` style — match it in edits to that file. New components use the `const`/arrow style consistent with other `components/profile/` files.

---

## File Structure

- **Create** `src/components/profile/CuratorOnboardingSplash.jsx` — full-screen welcome modal. Props: `{ onDismiss }`.
- **Create** `src/components/profile/CuratorOnboardingSplash.test.jsx`
- **Create** `src/components/profile/CuratorChecklist.jsx` — 3-step progress card. Props: `{ hasDish, hasBio, isPublished }`. Renders `null` when all three are done.
- **Create** `src/components/profile/CuratorChecklist.test.jsx`
- **Modify** `src/components/profile/index.js` — export both new components.
- **Modify** `src/lib/storage.js` — add `HAS_SEEN_CURATOR_ONBOARDING` key.
- **Modify** `src/pages/MyList.jsx` — mount splash, replace the welcome banner with the checklist, relabel the tagline input as "bio", and add the publish soft-gate.

---

## Task 1: Add the one-time localStorage key

**Files:**
- Modify: `src/lib/storage.js` (the `STORAGE_KEYS` object)

- [ ] **Step 1: Add the key**

In `src/lib/storage.js`, add a line to the `STORAGE_KEYS` object (after `HAS_SEEN_PHOTO_NUDGE`):

```js
export const STORAGE_KEYS = {
  SOUND_MUTED: 'soundMuted',
  RADIUS: 'wgh_radius',
  LOCATION_PERMISSION: 'whats-good-here-location-permission',
  EMAIL_CACHE: 'whats-good-here-email',
  MAP_SELECTED_RESTAURANT: 'wgh_map_selected_restaurant', // sessionStorage — survives in-tab nav, cleared on tab close
  HAS_SEEN_PHOTO_NUDGE: 'wgh_has_seen_photo_nudge',
  HAS_SEEN_CURATOR_ONBOARDING: 'wgh_has_seen_curator_onboarding',
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/storage.js
git commit -m "feat(storage): add HAS_SEEN_CURATOR_ONBOARDING key"
```

---

## Task 2: CuratorChecklist component

A pure presentational card. Three steps; each shows a number when pending and an SVG check when done. Returns `null` when all three are done (self-hides).

**Files:**
- Create: `src/components/profile/CuratorChecklist.jsx`
- Test: `src/components/profile/CuratorChecklist.test.jsx`

- [ ] **Step 1: Write the failing test**

`src/components/profile/CuratorChecklist.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CuratorChecklist } from './CuratorChecklist'

describe('CuratorChecklist', () => {
  it('renders all three step labels when nothing is done', () => {
    render(<CuratorChecklist hasDish={false} hasBio={false} isPublished={false} />)
    expect(screen.getByText('Add a dish')).toBeTruthy()
    expect(screen.getByText('Write your bio')).toBeTruthy()
    expect(screen.getByText('Publish your list')).toBeTruthy()
  })

  it('shows step numbers for pending steps', () => {
    const { container } = render(<CuratorChecklist hasDish={false} hasBio={false} isPublished={false} />)
    expect(container.textContent).toContain('1')
    expect(container.textContent).toContain('2')
    expect(container.textContent).toContain('3')
  })

  it('renders a check (svg) for a done step instead of its number', () => {
    const { container } = render(<CuratorChecklist hasDish={true} hasBio={false} isPublished={false} />)
    // one step done -> at least one svg check rendered
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('returns null when all three steps are done', () => {
    const { container } = render(<CuratorChecklist hasDish={true} hasBio={true} isPublished={true} />)
    expect(container.firstChild).toBeNull()
  })

  it('contains no emoji characters', () => {
    const { container } = render(<CuratorChecklist hasDish={false} hasBio={true} isPublished={false} />)
    // Surrogate-pair range covers emoji; the checklist must stay text-only.
    expect(/[\uD800-\uDBFF]/.test(container.textContent)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/profile/CuratorChecklist.test.jsx`
Expected: FAIL — cannot resolve `./CuratorChecklist`.

- [ ] **Step 3: Write the component**

`src/components/profile/CuratorChecklist.jsx`:

```jsx
const CHECKLIST_STEPS = [
  { key: 'hasDish', label: 'Add a dish', hint: 'Search and add a dish you love.' },
  { key: 'hasBio', label: 'Write your bio', hint: 'Tell visitors whose taste this is.' },
  { key: 'isPublished', label: 'Publish your list', hint: 'Go live on the homepage.' },
]

function CheckMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

export function CuratorChecklist({ hasDish, hasBio, isPublished }) {
  const done = { hasDish, hasBio, isPublished }
  if (hasDish && hasBio && isPublished) return null

  return (
    <div
      className="mx-4 mb-3 rounded-xl"
      style={{
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-divider)',
        padding: '14px 16px',
      }}
    >
      <p
        style={{
          fontFamily: "'Amatic SC', cursive",
          fontSize: '26px',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          marginBottom: '8px',
          lineHeight: 1,
        }}
      >
        Set up your list
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {CHECKLIST_STEPS.map((step, i) => {
          const isDone = done[step.key]
          return (
            <li key={step.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span
                style={{
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: isDone ? 'var(--color-success)' : 'transparent',
                  color: isDone ? '#fff' : 'var(--color-text-tertiary)',
                  border: isDone ? 'none' : '1.5px solid var(--color-divider)',
                }}
              >
                {isDone ? <CheckMark /> : i + 1}
              </span>
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: isDone ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                    textDecoration: isDone ? 'line-through' : 'none',
                  }}
                >
                  {step.label}
                </p>
                {!isDone && (
                  <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    {step.hint}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/profile/CuratorChecklist.test.jsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/CuratorChecklist.jsx src/components/profile/CuratorChecklist.test.jsx
git commit -m "feat(profile): CuratorChecklist progress card"
```

---

## Task 3: CuratorOnboardingSplash component

A full-screen modal with a warm heading, three numbered points, and one CTA.

**Files:**
- Create: `src/components/profile/CuratorOnboardingSplash.jsx`
- Test: `src/components/profile/CuratorOnboardingSplash.test.jsx`

- [ ] **Step 1: Write the failing test**

`src/components/profile/CuratorOnboardingSplash.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CuratorOnboardingSplash } from './CuratorOnboardingSplash'

describe('CuratorOnboardingSplash', () => {
  it('renders the three onboarding point titles', () => {
    render(<CuratorOnboardingSplash onDismiss={() => {}} />)
    expect(screen.getByText('Pick your Top 10')).toBeTruthy()
    expect(screen.getByText('Rate before you add')).toBeTruthy()
    expect(screen.getByText('Tell them who you are')).toBeTruthy()
  })

  it('renders a dismiss CTA and calls onDismiss when tapped', () => {
    const onDismiss = vi.fn()
    render(<CuratorOnboardingSplash onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText('Start building'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('is a labelled modal dialog', () => {
    render(<CuratorOnboardingSplash onDismiss={() => {}} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('contains no emoji characters', () => {
    const { container } = render(<CuratorOnboardingSplash onDismiss={() => {}} />)
    expect(/[\uD800-\uDBFF]/.test(container.textContent)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/profile/CuratorOnboardingSplash.test.jsx`
Expected: FAIL — cannot resolve `./CuratorOnboardingSplash`.

- [ ] **Step 3: Write the component**

`src/components/profile/CuratorOnboardingSplash.jsx`:

```jsx
const ONBOARDING_POINTS = [
  {
    title: 'Pick your Top 10',
    body: 'Add the dishes visitors should order — your personal best-of.',
  },
  {
    title: 'Rate before you add',
    body: "You can only add dishes you've rated. That's what makes your list worth trusting.",
  },
  {
    title: 'Tell them who you are',
    body: 'Add a short bio so people know whose taste they’re following.',
  },
]

export function CuratorOnboardingSplash({ onDismiss }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome, local curator"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', padding: '24px' }}
    >
      <div
        className="w-full rounded-2xl"
        style={{
          maxWidth: '420px',
          background: 'var(--color-surface-elevated)',
          padding: '28px 24px',
          maxHeight: '88vh',
          overflowY: 'auto',
        }}
      >
        <p
          style={{
            fontFamily: "'Amatic SC', cursive",
            fontSize: '40px',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            lineHeight: 1,
            marginBottom: '6px',
          }}
        >
          You're a local curator
        </p>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
          Three steps to a list people trust.
        </p>

        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {ONBOARDING_POINTS.map((point, i) => (
            <li key={point.title} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span
                style={{
                  flexShrink: 0,
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 700,
                  background: 'var(--color-primary)',
                  color: '#fff',
                }}
              >
                {i + 1}
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '2px' }}>
                  {point.title}
                </p>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
                  {point.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={onDismiss}
          className="w-full rounded-xl"
          style={{
            marginTop: '24px',
            padding: '14px',
            fontSize: '15px',
            fontWeight: 700,
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Start building
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/profile/CuratorOnboardingSplash.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/CuratorOnboardingSplash.jsx src/components/profile/CuratorOnboardingSplash.test.jsx
git commit -m "feat(profile): CuratorOnboardingSplash welcome modal"
```

---

## Task 4: Export both components from the profile barrel

**Files:**
- Modify: `src/components/profile/index.js`

- [ ] **Step 1: Add exports**

Append to `src/components/profile/index.js`:

```js
export { CuratorOnboardingSplash } from './CuratorOnboardingSplash'
export { CuratorChecklist } from './CuratorChecklist'
```

- [ ] **Step 2: Commit**

```bash
git add src/components/profile/index.js
git commit -m "chore(profile): export curator onboarding components from barrel"
```

---

## Task 5: Mount the splash in MyList (invite-gated, one-time)

**Files:**
- Modify: `src/pages/MyList.jsx`

Note: MyList uses `var` + `function` style — match it. The splash shows when the route flag `justAcceptedCuratorInvite` is set AND the one-time key is unset. Dismissing sets the key, fires analytics, and clears route state.

- [ ] **Step 1: Add imports**

At the top of `src/pages/MyList.jsx`, add:

```js
import { capture } from '../lib/analytics'
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '../lib/storage'
import { CuratorOnboardingSplash, CuratorChecklist } from '../components/profile'
```

(Keep existing imports. `CuratorChecklist` is imported now; it's used in Task 6.)

- [ ] **Step 2: Add splash state + effect + dismiss handler**

Near the other `useState` declarations add:

```js
  var [showSplash, setShowSplash] = useState(false)
```

After the existing hydrate `useEffect`, add a new effect (must be before the early returns):

```js
  // One-time curator welcome splash: only right after accepting an invite.
  useEffect(function () {
    if (location.state
        && location.state.justAcceptedCuratorInvite
        && !getStorageItem(STORAGE_KEYS.HAS_SEEN_CURATOR_ONBOARDING)) {
      setShowSplash(true)
    }
  }, [location.state])
```

Add the dismiss handler near the other handlers (after the early returns is fine, alongside `dismissWelcome` — or replace `dismissWelcome` in Task 6):

```js
  function dismissSplash() {
    setStorageItem(STORAGE_KEYS.HAS_SEEN_CURATOR_ONBOARDING, true)
    setShowSplash(false)
    capture('curator_onboarding_completed')
    navigate(location.pathname, { replace: true, state: null })
  }
```

- [ ] **Step 3: Render the splash**

In the returned JSX, alongside the other modal at the end of the component (next to the rate-first `pendingRateDish` sheet), add:

```jsx
      {showSplash && <CuratorOnboardingSplash onDismiss={dismissSplash} />}
```

- [ ] **Step 4: Verify build + existing tests**

Run: `npm run build`
Expected: build succeeds.
Run: `npx vitest run src/components/profile`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/MyList.jsx
git commit -m "feat(my-list): show one-time curator welcome splash after invite accept"
```

---

## Task 6: Replace the welcome banner with the checklist

**Files:**
- Modify: `src/pages/MyList.jsx`

The existing dismissable welcome banner (`showWelcome` / `welcomeDismissed` / `dismissWelcome`) is replaced by the completeness-gated `CuratorChecklist`. Remove the banner machinery (no dead code).

- [ ] **Step 1: Remove the old welcome banner machinery**

Delete these from `src/pages/MyList.jsx`:
- the `var [welcomeDismissed, setWelcomeDismissed] = useState(false)` line
- the `var showWelcome = ...` derivation
- the `function dismissWelcome() { ... }` function
- the entire `{showWelcome && ( ... )}` banner JSX block

- [ ] **Step 2: Render the checklist where the banner was**

In its place (same spot in the JSX, above the tagline/bio input), render:

```jsx
      <CuratorChecklist
        hasDish={items.length > 0}
        hasBio={!!tagline.trim()}
        isPublished={!!(listMeta && listMeta.isActive) && dishes.length > 0}
      />
```

Rationale for the props: `hasDish`/`hasBio` read the live editing state for instant feedback; `isPublished` reads the saved server state (`listMeta.isActive` is set true by `save_my_local_list` when the list has dishes, and `dishes` is the server-side list), so the Publish step only ticks once the list is genuinely live.

- [ ] **Step 3: Verify build + tests**

Run: `npm run build`
Expected: build succeeds, no unused-variable lint error for removed `welcomeDismissed`.
Run: `npx vitest run src/components/profile`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/MyList.jsx
git commit -m "feat(my-list): replace welcome banner with completeness checklist"
```

---

## Task 7: Relabel tagline as "bio" + publish soft-gate

**Files:**
- Modify: `src/pages/MyList.jsx`

Bio is required to publish (the `items.length > 0` / "Save & Publish" case). `Save (Unpublished)` stays ungated. Relabel the field and focus it on a blocked publish.

- [ ] **Step 1: Ensure useRef is imported and add a tagline ref**

If `src/pages/MyList.jsx` does not already import `useRef`, add it to the React import:

```js
import { useState, useEffect, useMemo, useRef } from 'react'
```

Near the other state, add:

```js
  var taglineRef = useRef(null)
```

- [ ] **Step 2: Add the publish soft-gate to handleSave**

At the very top of `handleSave` (right after `setSaveMessage(null)`), add:

```js
    // Publishing (items > 0) requires a bio so curator profiles aren't bare.
    if (items.length > 0 && !tagline.trim()) {
      setSaveMessage('Add a bio first so people know whose list this is.')
      if (taglineRef.current) taglineRef.current.focus()
      return
    }
```

- [ ] **Step 3: Relabel the input and attach the ref**

Find the tagline `<input>` and its `<label>`. Change the label text from `Your tagline` to `Your bio`, update the placeholder, and attach the ref:

```jsx
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
            Your bio
          </label>
          <input
            ref={taglineRef}
            type="text"
            value={tagline}
            onChange={function (e) { setTagline(e.target.value) }}
            placeholder="Who are you? e.g. Manager at Nancy's, lifelong islander"
            maxLength={80}
            className="w-full rounded-lg"
            style={{
              padding: '10px 12px',
              fontSize: '14px',
              background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-divider)',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
```

(Keep the surrounding `<div className="px-4 mb-4">` wrapper as-is.)

- [ ] **Step 4: Verify build + full test + lint**

Run: `npm run build`
Expected: build succeeds.
Run: `npx vitest run`
Expected: PASS (all existing + new tests).
Run: `npx eslint src/pages/MyList.jsx src/components/profile/CuratorOnboardingSplash.jsx src/components/profile/CuratorChecklist.jsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/MyList.jsx
git commit -m "feat(my-list): require bio to publish; reframe tagline as bio"
```

---

## Task 8: Manual verification

**Files:** none (manual)

- [ ] **Step 1: Run the app and walk the golden path**

Run: `npm run dev`

Verify against the spec test plan:
- New curator (fresh invite accept → lands on `/my-list` with route state): splash shows once → "Start building" dismisses it → checklist visible with all 3 pending. Add a rated dish → step 1 checks. Type a bio → step 2 checks. Save & Publish → step 3 checks → checklist disappears. Reload `/my-list`: splash does NOT reappear (localStorage key set).
- Publish with an empty bio: blocked with "Add a bio first…" and the bio field gets focus. `Save (Unpublished)` still works with an empty bio.
- Regular (non-curator) account visiting `/my-list`: sees the "Local Curators Only" wall — no splash, no checklist.
- Confirm there are no decorative emoji in the splash or checklist.

- [ ] **Step 2: Final commit if any manual fixes were needed**

```bash
git add -A
git commit -m "fix(my-list): curator onboarding manual-test adjustments"
```

(Skip if no changes.)

---

## Self-Review notes

- **Spec coverage:** splash (Task 3/5), checklist (Task 2/6), soft publish gate (Task 7), bio reframe (Task 7), one-time localStorage (Task 1/5), curator-only scoping (route-flag + existing `!listMeta` wall), no-emoji (enforced in component code + asserted in tests). All covered.
- **Type/name consistency:** `CuratorChecklist` props `{hasDish, hasBio, isPublished}` match the MyList call site (Task 6). `CuratorOnboardingSplash` prop `onDismiss` matches `dismissSplash` (Task 5). `STORAGE_KEYS.HAS_SEEN_CURATOR_ONBOARDING` defined in Task 1, used in Task 5.
- **No placeholders:** every code step shows complete code.
