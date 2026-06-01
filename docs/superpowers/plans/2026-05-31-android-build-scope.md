# Android (Play Store) Build — Scope

**Date:** 2026-05-31
**Status:** Scoped, not started. Pull the trigger right before the growth push (see strategy note below).
**App ID:** `com.whatsgoodhere.app` (same as iOS — locked, never change)

## Why / when
Android ≈ 70% of phones globally; the app's vision is global, so iOS-only is a hard ceiling.
BUT the current constraint is **votes/liquidity**, not platforms — shipping Android now just opens a
second empty store. **Sequence:** prove the vote loops on iOS in a concentrated market first → ship
Android (cheap, mostly done via Capacitor) **right before** flipping the growth switch, so a global
push actually reaches the global market. Don't let it become a focus-sink before then.

Codebase is **Capacitor** with a clean config → this is config + platform wiring, NOT a rebuild.
Honest total: **~2–3 focused engineering days + console/listing work.** Hardest bits: auth (Google
SHA fingerprints + Apple web flow) and deep-link assetlinks. Everything else is mechanical.

## Sequencing (dependencies matter)
bootstrap → **signing (produces the SHA fingerprints everything else needs)** → auth + deep links →
polish → listing → submit.

## Tasks

### 1. Platform bootstrap — ~30 min — (Claude can do)
- `npm i @capacitor/android`
- `npx cap add android` (no `android/` folder exists yet)
- `npx cap sync android`
- Existing plugins all support Android: `@capacitor/app`, `browser`, `geolocation`, `share`,
  `@capgo/capacitor-social-login`.

### 2. Signing + versioning — ~1 hr — (Dan: Play console; Claude: gradle) — DO FIRST
- Set up **Play App Signing** (Google holds the app key; you hold an *upload* key). Store the
  upload key as carefully as the iOS cert + Apple JWT — losing it = cannot ship updates.
- `android/app/build.gradle`: `versionName "1.9"`, `versionCode 5` (mirror iOS train).
- ⚠️ Blocks #3 and #4 — they need the signing key's **SHA-1 / SHA-256** fingerprints.

### 3. Auth wiring — ~0.5–1 day — (Dan: Google Cloud + Supabase + Apple; Claude: code) — HARDEST
- **Google Sign-In:** Android OAuth client in Google Cloud (package name + SHA-1/256) → register
  in Supabase Google provider → configure `@capgo/capacitor-social-login` for Android.
  - ⚠️ **The classic trap:** use the **Play App Signing key's** SHA, not just the upload key's —
    Google re-signs the app, so the runtime fingerprint is Google's, not yours.
- **Sign in with Apple:** NO native SIWA on Android → must use the **web OAuth flow**
  (`supabase.auth.signInWithOAuth({provider:'apple'})` → in-app browser → callback). Branch
  `SignInWithAppleButton`: native on iOS, web flow on Android. Reuse the website's Apple Services
  ID + return URL ([[project_apple_jwt_renewal]] is the same Apple app).

### 4. Deep links — App Links (the #288 feature on Android) — ~0.5 day — (Claude, + Dan hosts file)
- `AndroidManifest` intent filters for `https://wghapp.com` (App Links) + custom scheme.
- Host **`assetlinks.json`** at `https://wghapp.com/.well-known/assetlinks.json` — Android's
  equivalent of `apple-app-site-association`. Needs package name + signing-key **SHA-256**
  (Play App Signing key).
- JS routing (`AuthLifecycle.appUrlOpen`) is already cross-platform — it handles the link once it
  arrives; this task is native config + the assetlinks file.

### 5. Permissions + WebView polish — ~0.5 day — (Claude, + device testing)
- Geolocation permissions in the manifest; verify runtime-permission flow.
- Android WebView is **Chromium**, not WebKit → the iOS-only hacks likely don't apply / differ:
  - baked-PNG glyphs for `opsz` ([[feedback_ios_webkit_opsz_baked_png]]) — Chromium honors `opsz`,
    so this may be unnecessary on Android; verify it doesn't double-render.
  - `contentInset:'never'` is iOS-only; check `env(safe-area-inset-*)` + status bar on Android.
- Test on a real device / emulator.

### 6. Play Store listing + submission — ~0.5 day — (mostly Dan)
- $25 one-time Play Developer account.
- Upload **AAB** (not APK); internal-testing track → production.
- Listing: title, description, Android screenshot sizes + feature graphic, privacy policy URL
  (have: [[project_support_email]] / wghapp.com), content rating questionnaire.
- ⚠️ **Data Safety form** — Google is strict. Declare location + email + any analytics accurately
  or it bounces (parallels Apple's privacy nutrition labels).

## Key risks / gotchas (the stuff that wastes a day if missed)
1. **SHA fingerprints must be the Play App Signing key's**, used in BOTH Google sign-in and
   assetlinks. #1 source of "why doesn't login/deep-link work" on Android.
2. **SIWA = web flow on Android** — a real code branch, not a plugin toggle.
3. **Upload key safety** — back it up; irrecoverable if lost.
4. **Data Safety form accuracy** — rejection risk.
5. Two-platform tax from here on: every release = two builds, two review cycles, two WebView quirk
   surfaces. Budget the ongoing cost, not just the build.

## Split of work
- **Claude can do solo:** #1 bootstrap, #4 manifest + assetlinks.json + SIWA platform branch,
  #5 manifest/permissions + polish, gradle versioning, listing copy.
- **Needs Dan (consoles):** Play App Signing, Google Cloud OAuth client, Supabase provider config,
  Apple web-flow return URL, Play listing/data-safety/submission, $25 account.
