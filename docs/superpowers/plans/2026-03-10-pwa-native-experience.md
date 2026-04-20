# PWA Native Experience — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing web app feel like a native iOS app when installed to the home screen — proper icon, splash screen, full-screen standalone mode, and a tasteful install prompt.

**Architecture:** The app already has `vite-plugin-pwa` with a service worker for caching, but the manifest is disabled (`manifest: false`). We enable the web app manifest, generate proper icon sizes from the existing `logo.webp` asset, add iOS-specific splash screens, and build a lightweight install prompt component for mobile Safari users. No new dependencies.

**Tech Stack:** vite-plugin-pwa (already installed), Workbox (already configured), native HTML meta tags, CSS variables (existing design tokens)

---

## Current State (what exists today)

| Asset | Status | Issue |
|---|---|---|
| `vite-plugin-pwa` | Installed, service worker active | `manifest: false` — no web app manifest at all |
| `apple-mobile-web-app-capable` | Present in `index.html:26` | Already set to `yes` |
| `apple-mobile-web-app-status-bar-style` | Present in `index.html:27` | Set to `black` — should be `black-translucent` for edge-to-edge |
| `apple-mobile-web-app-title` | Present in `index.html:28` | Set to `What's Good Here` |
| `theme-color` | Present in `index.html:23` | Set to `#000000` — should match app bg `#F0ECE8` |
| `wgh-icon.png` | 200x200, dark background | Too small for iOS (needs 180x180 minimum, 512x512 for manifest). Dark bg looks bad on light home screens |
| `logo.webp` | Coral checkmark on white, large source | Good source for generating app icons |
| `favicon.png` | 32x32 | Fine as-is |
| `wgh-splash.webp` | 1536x1024 landscape | Wrong orientation/size for iOS splash screens |
| Install prompt | Does not exist | No way to nudge users to install |

## File Structure

### Files to create:
| File | Responsibility |
|---|---|
| `public/icons/icon-192x192.png` | Android/manifest icon (required by manifest spec) |
| `public/icons/icon-512x512.png` | Android/manifest large icon + splash fallback |
| `public/icons/apple-touch-icon.png` | iOS home screen icon (180x180) |
| `src/components/InstallPrompt.jsx` | "Add to Home Screen" banner for mobile Safari |
| `src/hooks/useInstallPrompt.js` | Install prompt detection + dismissal logic |

### Files to modify:
| File | What changes |
|---|---|
| `index.html` | Fix `theme-color`, `status-bar-style`, add `apple-touch-icon` link, remove stale theme script |
| `vite.config.js` | Enable manifest with proper name, icons, colors, display: standalone |
| `src/App.jsx` | Mount `<InstallPrompt />` |
| `src/lib/storage.js` | Add `INSTALL_PROMPT_DISMISSED` key constant |

### Files NOT changing:
- No changes to any page component, hook, API module, or routing
- No changes to the service worker caching strategy (already solid)
- No changes to `src/index.css` or design tokens (existing `slideUp` keyframe reused)
- No new npm dependencies
- No Capacitor, no Expo, no React Native

---

## Chunk 1: Manifest + Meta Tags + Icons

### Task 1: Generate app icon PNGs from source logo

**Files:**
- Create: `public/icons/icon-192x192.png`
- Create: `public/icons/icon-512x512.png`
- Create: `public/icons/apple-touch-icon.png`

**Context:** `logo.webp` (coral fork-knife checkmark on white) is the brand icon. We need three sizes: 180x180 (iOS), 192x192 (Android/manifest), 512x512 (manifest + splash). All should have the warm stone background (`#F0ECE8`) matching the app, with the logo centered and padded ~15% from edges.

- [ ] **Step 1: Create the icons directory**

```bash
mkdir -p public/icons
```

- [ ] **Step 2: Generate icon sizes using sips (macOS built-in)**

Use `sips` to convert `logo.webp` to PNG and resize. The source logo is large enough to downscale cleanly.

```bash
# Convert source to PNG first
sips -s format png public/logo.webp --out /tmp/wgh-logo-source.png

# 512x512 — large manifest icon
sips -z 512 512 /tmp/wgh-logo-source.png --out public/icons/icon-512x512.png

# 192x192 — standard manifest icon
sips -z 192 192 /tmp/wgh-logo-source.png --out public/icons/icon-192x192.png

# 180x180 — iOS apple-touch-icon
sips -z 180 180 /tmp/wgh-logo-source.png --out public/icons/apple-touch-icon.png
```

**Note:** If the logo.webp has transparent/white background and the icons look wrong on iOS (which adds white background for non-maskable), we may need to composite onto `#F0ECE8` background. Check the output visually before proceeding.

- [ ] **Step 3: Verify icons look correct**

```bash
# Check sizes
sips -g pixelWidth -g pixelHeight public/icons/icon-512x512.png
sips -g pixelWidth -g pixelHeight public/icons/icon-192x192.png
sips -g pixelWidth -g pixelHeight public/icons/apple-touch-icon.png

# Open to visually verify
open public/icons/apple-touch-icon.png
```

Expected: Three PNGs with the coral checkmark logo, looking clean at each size.

- [ ] **Step 4: Commit icons**

```bash
git add public/icons/
git commit -m "feat: add PWA app icons in 180/192/512 sizes

Generated from logo.webp source for iOS home screen,
Android manifest, and splash screen usage.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Enable web app manifest in vite-plugin-pwa

**Files:**
- Modify: `vite.config.js:72-74`

**Context:** The manifest is currently disabled (`manifest: false`). We need to enable it with proper app metadata. The manifest tells the browser how to install the app — name, icons, colors, display mode.

Reference: Current config at `vite.config.js:11-74`.

- [ ] **Step 1: Write the failing test — verify manifest is served**

No unit test needed here — this is build config. The verification is:

```bash
npm run build
# Check that manifest.webmanifest is generated in dist/
ls dist/manifest.webmanifest 2>/dev/null && echo "PASS: manifest exists" || echo "FAIL: no manifest"
```

Expected before change: FAIL

- [ ] **Step 2: Replace `manifest: false` with full manifest config**

In `vite.config.js`, replace the line:

```js
      // Minimal manifest (no installable PWA, just service worker)
      manifest: false,
```

with:

```js
      manifest: {
        name: "What's Good Here",
        short_name: 'WGH',
        description: 'Find the best dishes at restaurants near you. Crowd-sourced dish rankings for Martha\'s Vineyard.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#F0ECE8',
        background_color: '#F0ECE8',
        categories: ['food', 'lifestyle', 'travel'],
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
```

- [ ] **Step 3: Build and verify manifest**

```bash
npm run build
cat dist/manifest.webmanifest
```

Expected: JSON manifest with name, icons, display: standalone, correct colors.

- [ ] **Step 4: Commit**

```bash
git add vite.config.js
git commit -m "feat: enable PWA web app manifest with standalone display mode

Enables install-to-home-screen on both iOS and Android.
App launches full-screen without browser chrome.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Fix meta tags in index.html

**Files:**
- Modify: `index.html:5-6,23,27`

**Context:** Several meta tags need updating. The `theme-color` is black (leftover from dark mode era), the status bar style should be `black-translucent` for edge-to-edge on iOS, and we need the `apple-touch-icon` link. Also remove the stale theme-switching script on line 50-52 (light mode is the only mode now).

- [ ] **Step 1: Update theme-color from black to warm stone**

In `index.html`, change:

```html
    <meta name="theme-color" content="#000000" />
```

to:

```html
    <meta name="theme-color" content="#F0ECE8" />
```

- [ ] **Step 2: Update status bar style to black-translucent**

Change:

```html
    <meta name="apple-mobile-web-app-status-bar-style" content="black" />
```

to:

```html
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

This makes the status bar transparent so the app content extends to the top edge, like native iOS apps.

- [ ] **Step 3: Add apple-touch-icon link**

After the favicon link (line 5), add:

```html
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
```

- [ ] **Step 4: Remove stale theme script**

Delete lines 49-52:

```html
    <!-- Prevent flash of wrong theme on load -->
    <script>
      try { if (localStorage.getItem('wgh_theme') === 'light') document.documentElement.setAttribute('data-theme', 'light'); } catch(e) {}
    </script>
```

This is dead code — light mode is the only mode (CLAUDE.md: "Light theme only"). There is no `[data-theme="dark"]` CSS, and `wgh_theme` is not in the localStorage keys table.

- [ ] **Step 5: Build and verify**

```bash
npm run build
# Check the output HTML has correct meta tags
grep "theme-color" dist/index.html
grep "apple-touch-icon" dist/index.html
grep "black-translucent" dist/index.html
# Verify dead theme script is gone
grep "wgh_theme" dist/index.html && echo "FAIL: stale script still present" || echo "PASS: cleaned up"
```

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "fix: update PWA meta tags for proper iOS standalone experience

- theme-color matches app background (#F0ECE8)
- status bar uses black-translucent for edge-to-edge
- apple-touch-icon link added
- removed stale dark mode theme script

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: Install Prompt

### Task 4: Add storage key for install prompt dismissal

**Files:**
- Modify: `src/lib/storage.js`

**Context:** The install prompt should only show once. We need a localStorage key to track whether the user has dismissed it. All localStorage access goes through `src/lib/storage.js` per CLAUDE.md rules.

- [ ] **Step 1: Read current storage.js to find where keys are defined**

```bash
# Find the key constants section
grep -n "const\|STORAGE\|KEY" src/lib/storage.js | head -20
```

- [ ] **Step 2: Add the new key to STORAGE_KEYS object**

In `src/lib/storage.js`, add to the `STORAGE_KEYS` object (after `EMAIL_CACHE` on line 89):

```js
  INSTALL_PROMPT_DISMISSED: 'wgh_install_prompt_dismissed',
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.js
git commit -m "feat: add INSTALL_PROMPT_DISMISSED storage key

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Create useInstallPrompt hook

**Files:**
- Create: `src/hooks/useInstallPrompt.js`
- Create: `src/hooks/useInstallPrompt.test.js`

**Context:** This hook detects whether to show the install prompt. Conditions:
1. User is on mobile Safari (iOS, not in standalone mode already)
2. User hasn't dismissed the prompt before (check localStorage)
3. User has been on the app for at least 30 seconds (don't interrupt first impression)

It also handles the Android `beforeinstallprompt` event for Chrome/Edge users.

- [ ] **Step 1: Write the test file**

```js
// src/hooks/useInstallPrompt.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInstallPrompt } from './useInstallPrompt'

// Mock storage module
vi.mock('../lib/storage', () => ({
  getStorageItem: vi.fn(),
  setStorageItem: vi.fn(),
  STORAGE_KEYS: { INSTALL_PROMPT_DISMISSED: 'wgh_install_prompt_dismissed' },
}))

import { getStorageItem, setStorageItem } from '../lib/storage'

describe('useInstallPrompt', () => {
  var originalNavigator
  var originalWindow

  beforeEach(() => {
    vi.useFakeTimers()
    getStorageItem.mockReturnValue(null)
    // Default: not standalone, not iOS
    Object.defineProperty(window.navigator, 'standalone', {
      value: false,
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should not show prompt if already dismissed', () => {
    getStorageItem.mockReturnValue('true')
    var { result } = renderHook(() => useInstallPrompt())
    act(() => { vi.advanceTimersByTime(31000) })
    expect(result.current.showPrompt).toBe(false)
  })

  it('should not show prompt if already in standalone mode', () => {
    // matchMedia for standalone
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(display-mode: standalone)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    var { result } = renderHook(() => useInstallPrompt())
    act(() => { vi.advanceTimersByTime(31000) })
    expect(result.current.showPrompt).toBe(false)
  })

  it('dismiss should set storage and hide prompt', () => {
    var { result } = renderHook(() => useInstallPrompt())
    act(() => { result.current.dismiss() })
    expect(setStorageItem).toHaveBeenCalledWith('wgh_install_prompt_dismissed', 'true')
    expect(result.current.showPrompt).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- src/hooks/useInstallPrompt.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```js
// src/hooks/useInstallPrompt.js
import { useState, useEffect, useCallback } from 'react'
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '../lib/storage'

/**
 * Detects whether to show "Add to Home Screen" install prompt.
 *
 * Shows for:
 * - Mobile Safari users not already in standalone mode
 * - Android Chrome users (via beforeinstallprompt event)
 *
 * Waits 30s before showing to avoid interrupting first impression.
 * Remembers dismissal in localStorage.
 */
export function useInstallPrompt() {
  var [showPrompt, setShowPrompt] = useState(false)
  var [deferredEvent, setDeferredEvent] = useState(null)

  useEffect(function () {
    // Already dismissed
    if (getStorageItem(STORAGE_KEYS.INSTALL_PROMPT_DISMISSED)) return

    // Already installed / in standalone mode
    var isStandalone = window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    if (isStandalone) return

    // Android Chrome: capture the beforeinstallprompt event
    function handleBeforeInstall(e) {
      e.preventDefault()
      setDeferredEvent(e)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    // Delay showing prompt by 30 seconds
    var timer = setTimeout(function () {
      setShowPrompt(true)
    }, 30000)

    return function () {
      clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  var dismiss = useCallback(function () {
    setStorageItem(STORAGE_KEYS.INSTALL_PROMPT_DISMISSED, 'true')
    setShowPrompt(false)
  }, [])

  var install = useCallback(function () {
    // Android: trigger native install prompt
    if (deferredEvent) {
      deferredEvent.prompt()
      deferredEvent.userChoice.then(function () {
        setDeferredEvent(null)
        dismiss()
      })
      return
    }
    // iOS: can't trigger programmatically, just dismiss our banner
    dismiss()
  }, [deferredEvent, dismiss])

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

  return {
    showPrompt: showPrompt,
    isIOS: isIOS,
    dismiss: dismiss,
    install: install,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- src/hooks/useInstallPrompt.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useInstallPrompt.js src/hooks/useInstallPrompt.test.js
git commit -m "feat: add useInstallPrompt hook for PWA install detection

Detects mobile Safari and Android Chrome install eligibility.
30s delay before showing, remembers dismissal via localStorage.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Create InstallPrompt component

**Files:**
- Create: `src/components/InstallPrompt.jsx`

**Context:** A small, tasteful banner that slides up from the bottom (above BottomNav). Shows the app icon, "Add What's Good Here" message, and iOS-specific instructions ("Tap Share then Add to Home Screen") or a direct Install button for Android. Dismissible with X. Uses existing design tokens.

- [ ] **Step 1: Create the component**

```jsx
// src/components/InstallPrompt.jsx
import { useInstallPrompt } from '../hooks/useInstallPrompt'

/**
 * "Add to Home Screen" install banner.
 * Shows for mobile browser users who haven't installed the PWA.
 * Positioned above BottomNav (bottom: 72px to clear the nav bar).
 */
export function InstallPrompt() {
  var { showPrompt, isIOS, dismiss, install } = useInstallPrompt()

  if (!showPrompt) return null

  return (
    <div
      className="fixed left-3 right-3 rounded-xl flex items-center gap-3 px-4 py-3"
      style={{
        bottom: '80px',
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-divider)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.12)',
        zIndex: 1000,
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      {/* App icon */}
      <img
        src="/icons/apple-touch-icon.png"
        alt="WGH"
        className="rounded-xl flex-shrink-0"
        style={{ width: '44px', height: '44px' }}
      />

      {/* Message */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>
          Add What&apos;s Good Here
        </p>
        {isIOS ? (
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>
            Tap{' '}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="inline-block" style={{ width: '14px', height: '14px', verticalAlign: '-2px', color: 'var(--color-primary)' }}>
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            {' '}then &ldquo;Add to Home Screen&rdquo;
          </p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Install for the full experience
          </p>
        )}
      </div>

      {/* Action */}
      {!isIOS && (
        <button
          onClick={install}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold"
          style={{
            background: 'var(--color-primary)',
            color: 'var(--color-text-on-primary)',
          }}
        >
          Install
        </button>
      )}

      {/* Dismiss */}
      <button
        onClick={dismiss}
        className="flex-shrink-0 p-1"
        style={{ color: 'var(--color-text-tertiary)' }}
        aria-label="Dismiss install prompt"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '18px', height: '18px' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Note on animation**

The `slideUp` keyframe already exists in `src/index.css:645`. The component references it via inline `animation` style. No CSS changes needed.

- [ ] **Step 3: Commit**

```bash
git add src/components/InstallPrompt.jsx
git commit -m "feat: add InstallPrompt component for PWA home screen install

Slide-up banner above BottomNav. iOS shows Share instructions,
Android shows Install button via beforeinstallprompt API.
Dismissible, remembers choice.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Mount InstallPrompt in App.jsx

**Files:**
- Modify: `src/App.jsx`

**Context:** The `InstallPrompt` needs to render inside the `BrowserRouter` (so it's visible on all pages) but outside of `Suspense` (so it's not blocked by lazy loading). Place it right after `<WelcomeModal />`.

- [ ] **Step 1: Add the import**

At the top of `src/App.jsx`, add:

```js
import { InstallPrompt } from './components/InstallPrompt'
```

- [ ] **Step 2: Mount the component**

After line 122 (`<WelcomeModal />`), add:

```jsx
          <InstallPrompt />
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
npm run test
```

Expected: Build passes, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: mount InstallPrompt in app shell

Shows install banner on all pages for eligible mobile browser users.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: Verification + Cleanup

### Task 8: End-to-end verification

**Files:** None (testing only)

- [ ] **Step 1: Full build check**

```bash
npm run build
npm run test
```

Expected: Build passes, all tests pass.

- [ ] **Step 2: Verify manifest output**

```bash
cat dist/manifest.webmanifest | python3 -m json.tool
```

Expected output includes:
- `"display": "standalone"`
- `"theme_color": "#F0ECE8"`
- `"background_color": "#F0ECE8"`
- Three icon entries (192, 512, 512 maskable)

- [ ] **Step 3: Verify index.html output**

```bash
grep -E "theme-color|apple-touch-icon|apple-mobile-web-app|manifest" dist/index.html
```

Expected:
- `theme-color` content is `#F0ECE8`
- `apple-touch-icon` href is `/icons/apple-touch-icon.png`
- `apple-mobile-web-app-status-bar-style` is `black-translucent`
- manifest link is present (auto-injected by vite-plugin-pwa)

- [ ] **Step 4: Dev server smoke test**

```bash
npm run dev
```

Open on iOS Simulator or physical iPhone:
1. Verify app loads normally
2. Wait 30s — install prompt should slide up
3. Dismiss — should not reappear on reload
4. Clear localStorage → reload → tap Share → "Add to Home Screen"
5. Launch from home screen — should be full-screen, no Safari chrome
6. Verify splash screen shows app colors (warm stone background)

- [ ] **Step 5: Verify no CLAUDE.md rule violations**

```bash
# No direct console.* calls in new files
grep -r "console\." src/hooks/useInstallPrompt.js src/components/InstallPrompt.jsx || echo "PASS: no console calls"

# No direct localStorage calls in new files
grep -r "localStorage\." src/hooks/useInstallPrompt.js src/components/InstallPrompt.jsx || echo "PASS: no direct localStorage"

# No Tailwind color classes in new files
grep -rE "text-(gray|blue|white|red|green)" src/components/InstallPrompt.jsx || echo "PASS: no Tailwind colors"

# No ES2023+ syntax
grep -rE "\.toSorted|\.at\(" src/hooks/useInstallPrompt.js src/components/InstallPrompt.jsx || echo "PASS: no ES2023+"
```

---

### Task 9: Update TASKS.md and SPEC.md

**Files:**
- Modify: `TASKS.md`
- Modify: `SPEC.md`

- [ ] **Step 1: Mark T29 as done in TASKS.md and add this sprint**

Add after T29:

```markdown
## ~~T29: Add apple-touch-icon for iOS home screen~~ DONE

**What was done:**
- Full PWA manifest enabled via vite-plugin-pwa (display: standalone)
- App icons generated at 180/192/512px from logo.webp source
- apple-touch-icon link added to index.html
- theme-color fixed to match app background (#F0ECE8)
- Status bar style set to black-translucent for edge-to-edge
- InstallPrompt component + useInstallPrompt hook for "Add to Home Screen" nudge
- Removed stale dark mode theme-switching script
- Stale localStorage keys cleaned up

**Files:** `index.html`, `vite.config.js`, `src/App.jsx`, `src/components/InstallPrompt.jsx`, `src/hooks/useInstallPrompt.js`, `src/lib/storage.js`, `public/icons/`
```

- [ ] **Step 2: Add PWA section to SPEC.md**

Add a new feature section:

```markdown
### Feature 22: Progressive Web App (PWA)

**User flow:** Visit app in mobile browser → after 30s, install banner slides up → tap Share + "Add to Home Screen" (iOS) or Install button (Android) → app installs to home screen → launches full-screen without browser chrome

**Components:** `InstallPrompt`
**Hooks:** `useInstallPrompt`
**Config:** `vite.config.js` (manifest), `index.html` (meta tags)
**Assets:** `public/icons/` (apple-touch-icon.png, icon-192x192.png, icon-512x512.png)

**Manifest:** `display: standalone`, warm stone background, portrait orientation. Service worker caches app shell, Supabase images (30 days), API responses (5 min NetworkFirst).

**Install prompt:** 30s delay, dismissible, remembers dismissal via localStorage. iOS shows Share icon instructions, Android triggers native install via `beforeinstallprompt` API.

**VERIFIED** — `vite.config.js`, `src/components/InstallPrompt.jsx`
```

- [ ] **Step 3: Commit**

```bash
git add TASKS.md SPEC.md
git commit -m "docs: update TASKS.md and SPEC.md for PWA install experience

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Summary

| Task | Files | Effort |
|---|---|---|
| 1. Generate app icons | `public/icons/` (3 new PNGs) | 10 min |
| 2. Enable manifest | `vite.config.js` | 10 min |
| 3. Fix meta tags | `index.html` | 10 min |
| 4. Storage key | `src/lib/storage.js` | 5 min |
| 5. useInstallPrompt hook | `src/hooks/useInstallPrompt.js` + test | 20 min |
| 6. InstallPrompt component | `src/components/InstallPrompt.jsx` | 15 min |
| 7. Mount in App | `src/App.jsx` | 5 min |
| 8. E2E verification | Testing only | 15 min |
| 9. Update docs | `TASKS.md`, `SPEC.md` | 10 min |

**Total: ~1.5 hours of implementation**

## What's NOT in this plan

- No Capacitor, Expo, or React Native — that's a separate future plan if App Store is needed post-launch
- No iOS splash screen images (Apple deprecated the old `apple-touch-startup-image` approach; the manifest `background_color` + icon is the modern replacement)
- No push notifications — separate feature, not needed for launch
- No changes to offline caching strategy — already solid
- No changes to any existing component, page, hook, or API module
