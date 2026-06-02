# Share to Instagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users post an on-brand 1080×1080 image of a playlist or their locals list to Instagram via the native share sheet, flag-gated and reversible.

**Architecture:** A zero-dependency `<canvas>` renderer (isolated behind one module so it can be swapped for a DOM-snapshot impl) produces a PNG `File`; a new `shareImage()` in the existing Capacitor-aware share util hands it to the OS (web Web-Share-with-files now; native Capacitor Filesystem+Share in Phase 2); a shared `ShareToInstagramButton` pre-generates the image on mount (iOS gesture requirement) and orchestrates fallbacks. No new RPC/migration/server — card data already lives in the React tree.

**Tech Stack:** React 19, Vite, Capacitor (`@capacitor/share`, + `@capacitor/filesystem` in Phase 2), `sonner` toasts, PostHog `capture`, vitest.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/constants/features.js` (modify) | Add `IG_SHARE_ENABLED` master kill flag |
| `src/components/share/renderShareCardToFile.js` (create) | **Reversibility boundary.** Canvas → PNG `File`. v1 impl; swappable |
| `src/components/share/ShareToInstagramButton.jsx` (create) | Button + pre-generate-on-mount + share orchestration + fallback toast |
| `src/components/share/index.js` (create) | Barrel export |
| `src/utils/share.js` (modify) | Add `shareImage({file,blob,url,text})` — mirrors existing `shareOrCopy` ladder |
| `src/utils/share.test.js` (create) | Critical-path test: `shareImage` fallback chain |
| `src/components/share/ShareToInstagramButton.test.jsx` (create) | Flag-gating + render |
| `src/pages/Playlist.jsx` (modify) | Mount IG button (commit 1) + "Create your own" CTA (commit 2) |
| `src/pages/Profile.jsx` (modify) | Mount IG button beside `SharePicksButton` |
| `package.json` (modify, Phase 2) | Add `@capacitor/filesystem` |

> **Note on canvas + jsdom:** `getContext('2d')`/`toBlob` are not implemented in jsdom, and mocking them tests the mock, not behavior (and "mocks lie"). So the **renderer is verified manually in a browser / on-device** (it's visual output anyway). Automated tests cover the genuinely testable logic: the `shareImage` fallback ladder and the button's flag-gating.

---

## Phase 1 — Web image-share (ships + tests today)

### Task 1: Feature flag

**Files:** Modify `src/constants/features.js`

- [ ] **Step 1: Add the flag** (default-on, env-killable — matches `APPLE_SIGNIN_ENABLED`)

```js
  // Share-to-Instagram (image → native share sheet). Default-on;
  // set VITE_FEATURES_IG_SHARE=false to kill instantly without a deploy.
  IG_SHARE_ENABLED: import.meta.env.VITE_FEATURES_IG_SHARE !== 'false',
```

- [ ] **Step 2: Commit**

```bash
git add src/constants/features.js
git commit -m "feat(share): add IG_SHARE_ENABLED feature flag"
```

---

### Task 2: Canvas renderer (the reversibility boundary)

**Files:** Create `src/components/share/renderShareCardToFile.js`

- [ ] **Step 1: Implement the renderer** — complete, working code:

```js
import { logger } from '../../utils/logger'

const SIZE = 1080

// Brand colors read from CSS vars so the card stays theme-driven (rebrand = one file).
function token(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
  } catch {
    return fallback
  }
}

async function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return
  try {
    await Promise.all([
      document.fonts.load("700 72px 'Amatic SC'"),
      document.fonts.load("800 72px 'Outfit'"),
    ])
    await document.fonts.ready
  } catch (err) {
    logger.warn('Share card font load failed; using fallback fonts:', err)
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fillTruncated(ctx, text, x, y, maxWidth) {
  let t = String(text == null ? '' : text)
  if (ctx.measureText(t).width <= maxWidth) { ctx.fillText(t, x, y); return }
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1)
  ctx.fillText(t + '…', x, y)
}

/**
 * Render a 1080x1080 share card to a PNG File. Pure visual output — verified
 * manually in-browser / on-device (canvas is not implemented in jsdom).
 * @param {{title:string, byline:string, emojis?:string[], topItems?:string[], footerUrl?:string}} data
 * @returns {Promise<{file:File, blob:Blob}>}
 */
export async function renderShareCardToFile({ title, byline, emojis = [], topItems = [], footerUrl = 'wghapp.com' }) {
  await ensureFonts()

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  const bg = token('--color-bg', '#F0ECE8')
  const gold = token('--color-accent-gold', '#C48A12')
  const textPrimary = token('--color-text-primary', '#1A1A1A')
  const textSecondary = token('--color-text-secondary', '#555555')
  const tileColors = ['#C48A12', '#E4440A', '#B07340', '#16A34A']

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Wordmark: WHAT'S GOOD HERE (GOOD in gold)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = "700 56px 'Amatic SC', cursive"
  ctx.fillStyle = textSecondary
  ctx.fillText("WHAT'S ", 80, 120)
  const w1 = ctx.measureText("WHAT'S ").width
  ctx.fillStyle = gold
  ctx.fillText('GOOD', 80 + w1, 120)
  const w2 = ctx.measureText('GOOD').width
  ctx.fillStyle = textSecondary
  ctx.fillText(' HERE', 80 + w1 + w2, 120)

  // 2x2 emoji tiles
  const tile = 150, gap = 16, ox = 80, oy = 180
  for (let i = 0; i < 4; i++) {
    const x = ox + (i % 2) * (tile + gap)
    const y = oy + Math.floor(i / 2) * (tile + gap)
    ctx.fillStyle = tileColors[i]
    roundRect(ctx, x, y, tile, tile, 18)
    ctx.fill()
    ctx.font = '88px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emojis[i] || '🍽️', x + tile / 2, y + tile / 2 + 4)
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // Title
  const titleY = oy + 2 * tile + gap + 96
  ctx.fillStyle = textPrimary
  ctx.font = "800 72px 'Outfit', sans-serif"
  fillTruncated(ctx, title, 80, titleY, SIZE - 160)

  // Byline
  ctx.fillStyle = textSecondary
  ctx.font = "500 34px 'Outfit', sans-serif"
  fillTruncated(ctx, byline, 80, titleY + 52, SIZE - 160)

  // Top 3 items
  ctx.fillStyle = textPrimary
  ctx.font = "600 38px 'Outfit', sans-serif"
  let ly = titleY + 132
  for (let i = 0; i < Math.min(3, topItems.length); i++) {
    fillTruncated(ctx, '▸ ' + topItems[i], 80, ly, SIZE - 160)
    ly += 58
  }

  // Footer
  ctx.fillStyle = gold
  ctx.font = "700 32px 'Outfit', sans-serif"
  ctx.fillText(footerUrl, 80, SIZE - 72)

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png', 0.95)
  })
  const file = new File([blob], 'wgh-share.png', { type: 'image/png' })
  return { file, blob }
}
```

- [ ] **Step 2: Commit** (with Task 3–4; this module alone isn't runnable)

---

### Task 3: `shareImage()` in the share util

**Files:** Modify `src/utils/share.js`

- [ ] **Step 1: Write the failing test** — `src/utils/share.test.js`

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shareImage } from './share'

describe('shareImage', () => {
  const file = new File(['x'], 'wgh-share.png', { type: 'image/png' })
  const blob = new Blob(['x'], { type: 'image/png' })

  beforeEach(() => {
    // jsdom has no canShare/share by default
    delete navigator.canShare
    delete navigator.share
    navigator.clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    // stub anchor download
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n)
    vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n)
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x')
    globalThis.URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => vi.restoreAllMocks())

  it('falls back to download + copy-link when file share is unsupported', async () => {
    const result = await shareImage({ file, blob, url: 'https://wghapp.com/playlist/1', text: 'hi' })
    expect(result.method).toBe('download_copy')
    expect(result.success).toBe(true)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://wghapp.com/playlist/1')
  })

  it('uses web file share when supported', async () => {
    navigator.canShare = vi.fn(() => true)
    navigator.share = vi.fn().mockResolvedValue(undefined)
    const result = await shareImage({ file, blob, url: 'u', text: 'hi' })
    expect(navigator.share).toHaveBeenCalled()
    expect(result).toEqual({ method: 'web_share_file', success: true })
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `npm run test -- src/utils/share.test.js --run` → "shareImage is not a function"

- [ ] **Step 3: Implement** — append to `src/utils/share.js` (note: `Capacitor`/`Share` already imported at top; Phase 2 adds the native branch):

```js
/**
 * Share an image File via the platform share sheet, with graceful fallback.
 * Ladder: (Phase 2: Capacitor native file-share) → Web Share w/ files → download + copy-link.
 * Never throws.
 * @param {{ file: File, blob: Blob, url: string, text?: string, dialogTitle?: string }} options
 * @returns {Promise<{ method: string, success: boolean }>}
 */
export async function shareImage({ file, blob, url, text, dialogTitle }) {
  // 1. Web Share API with files (mobile browsers)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      const data = { files: [file] }
      if (text) data.text = text
      await navigator.share(data)
      return { method: 'web_share_file', success: true }
    } catch (err) {
      if (err && err.name === 'AbortError') return { method: 'web_share_file', success: false }
      logger.warn('Web file share failed, falling back:', err)
    }
  }

  // 2. Fallback: download the image, then copy/share the link
  try {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob || file)
    a.download = file.name || 'wgh-share.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  } catch (err) {
    logger.warn('Image download fallback failed:', err)
  }
  const link = await shareOrCopy({ url, text })
  return { method: 'download_copy', success: link.success }
}
```

- [ ] **Step 4: Run, expect PASS** — `npm run test -- src/utils/share.test.js --run`

---

### Task 4: `ShareToInstagramButton` + barrel

**Files:** Create `src/components/share/ShareToInstagramButton.jsx`, `src/components/share/index.js`, `src/components/share/ShareToInstagramButton.test.jsx`

- [ ] **Step 1: Implement the button**

```jsx
import { useState, useEffect, useRef } from 'react'
import { renderShareCardToFile } from './renderShareCardToFile'
import { shareImage } from '../../utils/share'
import { FEATURES } from '../../constants/features'
import { capture } from '../../lib/analytics'
import { logger } from '../../utils/logger'
import { toast } from 'sonner'

/**
 * Share an on-brand card image of a playlist / locals list to Instagram.
 * Pre-generates the image on mount: iOS Safari/WKWebView invalidate share()
 * if you await after the tap, so the File must be ready before the gesture.
 *
 * Props: { surface: 'playlist'|'locals_list', id, url, cardData, shareText? }
 *   cardData = { title, byline, emojis[], topItems[], footerUrl }
 */
export function ShareToInstagramButton({ surface, id, url, cardData, shareText }) {
  const [busy, setBusy] = useState(false)
  const assetRef = useRef(null)

  useEffect(() => {
    if (!FEATURES.IG_SHARE_ENABLED) return undefined
    let cancelled = false
    renderShareCardToFile(cardData)
      .then((asset) => { if (!cancelled) assetRef.current = asset })
      .catch((err) => logger.warn('Share card pre-render failed:', err))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!FEATURES.IG_SHARE_ENABLED) return null

  async function handleShare() {
    setBusy(true)
    try {
      let asset = assetRef.current
      if (!asset) asset = await renderShareCardToFile(cardData) // safety net (rare)
      const result = await shareImage({ file: asset.file, blob: asset.blob, url, text: shareText })
      capture('share_to_instagram', { surface, id, method: result.method, success: result.success })
      if (result.success && result.method === 'download_copy') {
        toast.success('Image saved — open Instagram to post', { duration: 2500 })
      }
    } catch (err) {
      logger.warn('Share to Instagram failed:', err)
      toast.error('Could not prepare the image. Please try again.', { duration: 2500 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={handleShare}
      disabled={busy}
      className="px-5 py-2 rounded-full font-semibold transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
      style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)', fontSize: '13px' }}
    >
      {busy ? 'Preparing…' : 'Share to Instagram'}
    </button>
  )
}
```

- [ ] **Step 2: Barrel** — `src/components/share/index.js`

```js
export { ShareToInstagramButton } from './ShareToInstagramButton'
export { renderShareCardToFile } from './renderShareCardToFile'
```

- [ ] **Step 3: Test** — `src/components/share/ShareToInstagramButton.test.jsx` (flag-gating; renderer mocked so canvas never runs)

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('./renderShareCardToFile', () => ({
  renderShareCardToFile: vi.fn().mockResolvedValue({ file: {}, blob: {} }),
}))
vi.mock('../../constants/features', () => ({ FEATURES: { IG_SHARE_ENABLED: false } }))

import { ShareToInstagramButton } from './ShareToInstagramButton'

const data = { title: 'Best Bites', byline: 'by Denis · 12 dishes', emojis: [], topItems: [], footerUrl: 'wghapp.com' }

describe('ShareToInstagramButton', () => {
  it('renders nothing when the flag is off', () => {
    const { container } = render(<ShareToInstagramButton surface="playlist" id="1" url="u" cardData={data} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 4: Run** — `npm run test -- src/components/share src/utils/share.test.js --run` → PASS

- [ ] **Step 5: Commit (feature core)**

```bash
git add src/constants/features.js src/components/share src/utils/share.js src/utils/share.test.js
git commit -m "feat(share): Instagram share-card renderer, shareImage(), and button"
```

---

### Task 5: Wire into Playlist detail (`/playlist/:id`)

**Files:** Modify `src/pages/Playlist.jsx` (existing `handleShare` ~line 97; existing Share button ~line 169)

- [ ] **Step 1:** Import + build cardData from the loaded `playlist`/`items`, and render the button next to the existing "Share":

```jsx
import { ShareToInstagramButton } from '../components/share'
import { categoryEmojiFor } from '../constants/categories' // already imported in this file
// ...
const igCardData = useMemo(() => ({
  title: playlist?.title || 'Playlist',
  byline: `by ${playlist?.owner_display_name || 'a local'} · ${items.length} dish${items.length === 1 ? '' : 'es'}`,
  emojis: items.slice(0, 4).map((i) => categoryEmojiFor(i.category)),
  topItems: items.slice(0, 3).map((i) => i.dish_name),
  footerUrl: 'wghapp.com',
}), [playlist?.title, playlist?.owner_display_name, items])
```

Render beside the Share button:

```jsx
<ShareToInstagramButton
  surface="playlist"
  id={id}
  url={canonicalShareUrl('/playlist/' + id)}
  cardData={igCardData}
  shareText={`${igCardData.title} on What's Good Here`}
/>
```

> **Verify on implement:** confirm `playlist.owner_display_name` exists on `usePlaylistDetail`'s shape (it's returned by `get_playlist_detail`). If the field name differs, use the actual one. Keep the `useMemo` ABOVE any early `return` (Rules of Hooks — there's prior art: commit `31fe155` hoisted a playlist `useMemo` for exactly this).

- [ ] **Step 2:** `npm run build` → passes. Manual browser check: button appears, desktop tap downloads PNG + copies link + toast.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Playlist.jsx
git commit -m "feat(share): Share to Instagram on playlist detail"
```

---

### Task 6: Wire into locals list (owner's `/profile`)

**Files:** Modify `src/pages/Profile.jsx` (near `SharePicksButton` ~line 177; locals data via `useLocalListDetail`/existing profile state)

- [ ] **Step 1:** Build cardData from the owner's locals list items + profile name; render beside `SharePicksButton`. Only render when the list has items.

```jsx
import { ShareToInstagramButton } from '../components/share'
import { categoryEmojiFor } from '../constants/categories'
// localList items already available on Profile (or via useLocalListDetail(user.id))
const localItems = localList?.items || []
const igListData = useMemo(() => ({
  title: localItems[0]?.title || 'My Local Picks',
  byline: `by ${profile?.display_name || 'me'} · ${localItems.length} dish${localItems.length === 1 ? '' : 'es'}`,
  emojis: localItems.slice(0, 4).map((i) => categoryEmojiFor(i.category)),
  topItems: localItems.slice(0, 3).map((i) => i.dish_name),
  footerUrl: 'wghapp.com',
}), [localItems, profile?.display_name])
// ...
{localItems.length > 0 && (
  <ShareToInstagramButton
    surface="locals_list"
    id={user.id}
    url={canonicalShareUrl('/user/' + user.id)}
    cardData={igListData}
    shareText={`${igListData.title} on What's Good Here`}
  />
)}
```

> **Verify on implement:** confirm how Profile.jsx currently loads the locals list (hook name + item field names: `title`, `dish_name`, `category`) and the profile display-name field. `canonicalShareUrl` is already used in this file's neighbors — import from `../utils/share` if not present.

- [ ] **Step 2:** `npm run build` → passes. Manual check on `/profile`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Profile.jsx
git commit -m "feat(share): Share to Instagram for locals list on profile"
```

---

## Phase 2 — Native iOS image-share (separable; gated on real-device test)

### Task 7: Capacitor Filesystem native branch

**Files:** Modify `package.json`, `src/utils/share.js`; run `npx cap sync ios`

- [ ] **Step 1: Add the plugin (match Capacitor 8.x)**

```bash
npm install @capacitor/filesystem@^8
```

- [ ] **Step 2:** Add a native branch at the TOP of `shareImage` (before the Web Share block). Add imports near the existing `@capacitor/*` imports:

```js
import { Filesystem, Directory } from '@capacitor/filesystem'

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
```

Native branch (insert as step 1 of `shareImage`, before Web Share):

```js
  // 0. Capacitor native: write to cache, share the file URI
  if (Capacitor?.isNativePlatform?.()) {
    try {
      const base64 = await blobToBase64(blob || file)
      const written = await Filesystem.writeFile({
        path: 'wgh-share.png', data: base64, directory: Directory.Cache,
      })
      await Share.share({ files: [written.uri], url, dialogTitle: dialogTitle || 'Share to Instagram' })
      return { method: 'native_capacitor_file', success: true }
    } catch (err) {
      if (err && (err.message || '').toLowerCase().includes('cancel')) {
        return { method: 'native_capacitor_file', success: false }
      }
      logger.warn('Capacitor file share failed, falling back:', err)
    }
  }
```

- [ ] **Step 3:** `npx cap sync ios` (registers the plugin in the iOS project).

- [ ] **Step 4:** `npm run test -- src/utils/share.test.js --run` (web tests still pass — native branch is gated by `isNativePlatform`, false in jsdom) and `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/utils/share.js ios
git commit -m "feat(share): native iOS image-share via Capacitor Filesystem"
```

- [ ] **Step 6: REAL-DEVICE GATE (manual, not automatable):** Rebuild the iOS app in Xcode, deploy to a physical iPhone, open a playlist → Share to Instagram → confirm Instagram appears in the sheet and the image posts to a Story/feed cleanly. Coordinate with Dan on the iOS build if needed. Until verified, the flag can stay off in the iOS env (`VITE_FEATURES_IG_SHARE=false`).

---

## Commit 2 (separate logical change) — "Create your own playlist" CTA

### Task 8: Create-playlist CTA on playlist detail

**Files:** Modify `src/pages/Playlist.jsx`

- [ ] **Step 1:** Import `CreatePlaylistModal`, add `createOpen` state, render a subtle "Create your own" CTA (only for non-owners, or always — confirm with the page's `is_owner`), opening the existing modal. Reuse the exact pattern from `Profile.jsx:392`.

```jsx
import { CreatePlaylistModal } from '../components/playlists/CreatePlaylistModal'
const [createOpen, setCreateOpen] = useState(false)
// ... near the playlist header / footer:
{!playlist.is_owner && (
  <button onClick={() => setCreateOpen(true)} className="..." style={{ color: 'var(--color-accent-gold)', /* text-button */ }}>
    + Create your own playlist
  </button>
)}
<CreatePlaylistModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onCreated={(pl) => navigate('/playlist/' + pl.id)} />
```

- [ ] **Step 2:** `npm run build` → passes. Manual: CTA opens modal; created playlist navigates to its page.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Playlist.jsx
git commit -m "feat(playlist): 'Create your own' CTA on playlist detail"
```

---

## Final verification + handoff

### Task 9: Verify, push, PR, notify Dan

- [ ] `npm run lint` and `npm run build` clean; `npm run test -- src/utils/share.test.js src/components/share --run` green.
- [ ] Grep guards: no `console.*` in new files; no `toSorted`/`Array.at`/ES2023+; `className` layout-only / `style` for color.
- [ ] Rebase onto latest `upstream/main` (`git fetch upstream main && git rebase upstream/main`) — Denis wants currency with Dan's.
- [ ] Push `feat/share-to-instagram` to `origin`; open PR to `upstream` (Dan's main) with the spec + this plan linked, screenshots of the generated card, and a checklist noting Phase 2's real-device gate.
- [ ] Post a review request to the **wgh-phone** repo (`Denisgingras75/wgh-phone` issues) for Dan, linking the PR and calling out the two things needing his eyes: (1) card visual/brand, (2) the iOS native rebuild for Phase 2.

---

## Self-Review (against spec)

- **Spec §3 mechanic/format/renderer/flag** → Tasks 1, 2, 4. ✅
- **Spec §5.1 renderer isolated** → Task 2 (single module, swappable). ✅
- **Spec §5.2 shareImage ladder** → Task 3 (web + fallback) + Task 7 (native). ✅
- **Spec §5.3 pre-generate-on-mount + capture + flag-hide** → Task 4. ✅
- **Spec §6 card content (both surfaces)** → Tasks 5, 6. ✅
- **Spec §7 no new data layer** → reuses loaded data (Tasks 5, 6). ✅
- **Spec §8 phased native** → Phase 1 (Tasks 1–6) / Phase 2 (Task 7). ✅
- **Spec §9 reversibility** → flag (Task 1), isolated renderer (Task 2), additive buttons (Tasks 5, 6). ✅
- **Spec §10 create-CTA separate commit** → Task 8. ✅
- **Spec §12 testing (critical paths; renderer manual)** → Tasks 3, 4 + manual gates. ✅
- **Type consistency:** `renderShareCardToFile → {file, blob}` consumed identically in Task 4 & 3; `shareImage({file,blob,url,text})` signature matches call site; `cardData` shape `{title,byline,emojis,topItems,footerUrl}` consistent across Tasks 2/4/5/6. ✅
