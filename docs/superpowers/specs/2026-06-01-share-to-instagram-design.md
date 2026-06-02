# Share to Instagram — playlists & locals lists

- **Date:** 2026-06-01
- **Status:** Design — awaiting Denis review
- **Branch:** `feat/share-to-instagram` (off `upstream/main` / Dan's main)
- **Surfaces:** Playlist detail (`/playlist/:id`), locals list (via owner's `/profile`)

---

## 1. Goal

Add a **"Share to Instagram"** affordance that lets a user post an on-brand image of a
playlist (or their locals list) to their Instagram Story/feed in one tap from the native
share sheet.

## 2. The Instagram reality (why this is image-first)

Instagram has **no API to post on a user's behalf**, and it strips links from posts. Every
real "share to Instagram" reduces to: **generate a share-worthy image → hand it to the OS
share sheet**, where the user taps Instagram and posts it themselves. So this feature is
fundamentally an *image generator + a file-share*, not a link button. (Locked with Denis.)

## 3. Decisions locked

| Decision | Choice | Notes |
|---|---|---|
| Mechanic | Branded image → native share sheet | Not Stories deep-link, not link-only |
| Image format | **Square 1080×1080** | Safe in feed, DMs, and centered in a Story |
| Renderer | **Zero-dep `<canvas>`** (v1) | Most robust in the iOS WKWebView; A1 DOM-snapshot is a documented drop-in alternative behind the same interface |
| Kill switch | `FEATURES.IG_SHARE_ENABLED` | Default-on, env-killable — instant rollback |
| Create-CTA | Separate commit, same branch | "Create your own playlist" on `/playlist/:id` (see §10) |

### Why canvas, not a DOM-snapshot library (recommendation changed on new evidence)
Initial lean was a DOM-snapshot lib (`modern-screenshot`) for design ergonomics. Re-grounding
on Dan's main revealed WGH now ships as a **native iOS app (Capacitor)** — the primary surface
is a WKWebView, where `foreignObject`-based snapshot libs are the flakier path and canvas 2D is
rock-solid. The card design is locked and simple, so canvas's iteration cost is low. Zero deps
also best serves "make change cheap" + easy rollback. **A1 remains documented as a swap-in** if
we later want richer, photo-bearing cards.

## 4. Re-grounding deltas (read before building)

Local `main` was **240 commits behind** `upstream/main`. Verified on Dan's main:
- **Capacitor iOS app** — `@capacitor/share` present; `shareOrCopy()` already does native Share →
  web Share → clipboard → execCommand, with `canonicalShareUrl()` returning `https://wghapp.com`
  on native.
- **`@capacitor/filesystem` is NOT installed.** Capacitor's native `Share.share({ files })` needs
  a **file URI**, so native image-share requires adding Filesystem + `cap sync ios` + a native
  rebuild (see §8, Phase 2).
- Domain is **wghapp.com** (use `canonicalShareUrl()`, never a hardcoded origin).
- No prior Instagram/image-share work exists — safe to build.

## 5. Architecture — one shared unit, two surfaces

```
src/components/share/
  ShareCard.jsx            # (optional, A1 only) presentational card — props in, DOM out
  renderShareCardToFile.js # ISOLATED renderer — the reversibility boundary
  ShareToInstagramButton.jsx # button + pre-generate + share orchestration + fallbacks
src/utils/share.js         # + shareImage()  (extends existing 4-tier shareOrCopy)
src/constants/features.js  # + IG_SHARE_ENABLED
```

### 5.1 `renderShareCardToFile({ title, byline, emojis, topItems, footerUrl }) → Promise<{ file: File, blob: Blob }>`
The single swappable unit. **v1 = canvas:** draw a 1080×1080 card, `canvas.toBlob('image/png')`,
wrap in a `File`. Reads brand colors via
`getComputedStyle(document.documentElement).getPropertyValue('--color-*')` so the card stays
theme-driven (rebrand = one file, honored even in canvas). Loads Amatic SC via
`document.fonts.load(...)` before drawing. No remote images → no canvas tainting.
**A1 alternative:** same signature, renders `<ShareCard>` off-screen and snapshots it.

### 5.2 `shareImage({ file, url, text, dialogTitle }) → Promise<{ method, success }>`
Mirrors the existing `shareOrCopy` ladder, but for an image file:
1. **Capacitor native:** write the PNG to `Directory.Cache` via `@capacitor/filesystem`, then
   `Share.share({ files: [uri], url, dialogTitle })`. *(Phase 2 — needs the new plugin.)*
2. **Web Share w/ files:** `navigator.canShare({ files }) && navigator.share({ files: [file], text })`.
3. **Fallback:** trigger a PNG download + `shareOrCopy({ url })`, toast
   *"Image saved — open Instagram to post."*
Never throws; returns `{ method, success }` for analytics + toasts.

### 5.3 `ShareToInstagramButton`
Props: `{ surface: 'playlist' | 'locals_list', id, cardData }`.
- **Pre-generates the File on mount** (idle/effect), holds it in a ref. *This is the
  make-or-break iOS detail:* Safari/WKWebView invalidate `share()` if you `await` after the tap,
  so the File must be ready **before** the gesture. Button shows a brief spinner until ready.
- On tap → `shareImage(...)` synchronously with the ready File.
- `capture('share_to_instagram', { surface, id, method, success })`.
- Hidden entirely when `!FEATURES.IG_SHARE_ENABLED`.

## 6. Card content (1080×1080)

| Element | Playlist | Locals list |
|---|---|---|
| Wordmark | "WHAT'S **GOOD** HERE" (Amatic SC, GOOD in `--color-accent-gold`) | same |
| Emoji tiles (2×2) | `playlist.cover_categories` | `categoryEmojiFor()` of top item categories |
| Title | `playlist.title` | `items[0].title` |
| Byline | `by {owner} · {item_count} dishes` | `by {owner} · {n} dishes` |
| Top 3 (▸) | first 3 item `dish_name`s | first 3 `dish_name`s |
| Footer | `wghapp.com` | `wghapp.com` |

Truncate long titles. Background = `--color-bg` warm stone (per approved mockup).

## 7. Data — nothing new

Reuse data already loaded in the React tree: `usePlaylistDetail(id)` on `Playlist.jsx`,
`useLocalListDetail(userId)` behind the profile. **No new RPC, no migration, no serverless fn.**
Owner display name comes from the page's existing profile data.

## 8. Platform scope — two phases (Phase 2 separable)

- **Phase 1 — Web image-share.** Card renderer + `shareImage` web/fallback paths +
  `ShareToInstagramButton` on both surfaces, flag-gated. **Testable in a browser today.** In the
  native app (until Phase 2) the button degrades to link-share via the existing ladder — not
  broken, just no image.
- **Phase 2 — Native iOS image-share.** Add `@capacitor/filesystem`, the native branch of
  `shareImage`, `npx cap sync ios`, native rebuild, **real-device verification** (share sheet →
  Instagram → image posts). Rides with the already-pending iOS real-device testing; may need Dan
  coordination on the iOS build.

> **Cost flag:** Phase 2 touches the native build (new Capacitor plugin + `cap sync` + Xcode
> rebuild + real-device test). Phase 1 is pure JS and ships/tests immediately. The flag lets
> Phase 1 ship without waiting on Phase 2.

## 9. Reversibility — three escape hatches

1. **Flag off** — `VITE_FEATURES_IG_SHARE=false` hides it instantly, no deploy.
2. **Swap renderer** — canvas → A1 (or vice-versa) is a one-file change to
   `renderShareCardToFile.js`; zero call-site edits.
3. **Remove button** — purely additive UI; delete one import per surface.

## 10. Companion change (separate commit) — "Create your own playlist" CTA

On `/playlist/:id`, add a "Create your own" CTA opening the existing `CreatePlaylistModal`. This
closes the funnel the IG share opens (stranger lands from Instagram → becomes a creator).
Profile already has create; UserProfile is intentionally skipped (low intent). **Ships as its own
commit** so it reverts independently of the share work.

## 11. Constraints honored

- No `toSorted`/`Array.at`/ES2023+ — `slice().sort()`, `arr[arr.length-1]`.
- `className` = layout/spacing only; `style={{}}` = color/bg/border via `var(--color-*)`.
- `logger`, never `console.*`.
- Off-screen card (A1) must be laid out (not `display:none`) for snapshot.

## 12. Testing

- **Unit (vitest, `--run`):** `renderShareCardToFile` returns a non-empty PNG `File` for sample
  playlist + locals data; `shareImage` fallback chain doesn't throw when `navigator.share`/
  `canShare` are absent (mocked).
- **Critical path:** button renders only when flag on; pre-generated File is ready before tap.
- **Manual / real-device (the real gate):** iOS app → Share to Instagram → image lands in the IG
  composer and posts cleanly. Desktop → download + copy-link fallback fires with toast.

## 13. Out of scope (YAGNI v1)

Instagram Stories deep-link; 9:16 variant; dish-photo collages; visitor-shares-someone-else's-list
(trivial follow-on — same component on `UserProfile`); any server-side render.

## 14. Open redlines for Denis

1. **Native scope** — build Phase 2 now, or ship Phase 1 (web) and fast-follow native? (Recommend:
   build both; flag covers the verification lag.)
2. **Renderer** — confirm zero-dep canvas as v1 (recommendation changed from A1 after the
   native-iOS finding). A1 stays documented + swappable.
