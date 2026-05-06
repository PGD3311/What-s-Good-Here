# Google Sign-In Kill Switch — Contingency

**Date:** 2026-05-06
**Status:** Pre-staged. Apply ONLY if Apple Dev verification fails to clear in time AND we still need to submit before Memorial Day.

**Why this exists:** Apple Guideline 4.8 requires Sign in with Apple if the app offers any third-party social sign-in. Google is currently in the build. SIWA is gated on Apple Dev clearance (B3-activate + B5). If Apple Dev doesn't clear, we can't ship SIWA. The only way to submit without 4.8 violation is to remove Google for the review build.

This doc is the 5-minute apply path. Restore in v1.1 once SIWA is configured.

---

## Trigger conditions (apply this when ALL are true)

1. Apple Dev verification has NOT cleared
2. Memorial Day deadline is < 7 days away
3. Dan has decided to ship email-only for v1.0

If any of those is false, do NOT apply.

---

## Step 1 — Add feature flag (1 file, 1 line)

`src/constants/features.js` — add a new flag mirroring the Apple pattern:

```diff
 export const FEATURES = {
   // Sign in with Apple — code is wired up; button only renders when this flag
   // is true AND the iOS Capacitor build has the SIWA capability.
   APPLE_SIGNIN_ENABLED: import.meta.env.VITE_FEATURES_APPLE_SIGNIN === 'true',
+
+  // Google Sign-In — defaults to ON; flip to false via env var to hide the
+  // Google button (used for Apple-Guideline-4.8 compliance when SIWA isn't
+  // yet shipped). Default-on means existing deploys keep working unchanged.
+  GOOGLE_SIGNIN_ENABLED: import.meta.env.VITE_FEATURES_GOOGLE_SIGNIN !== 'false',
 }
```

---

## Step 2 — Gate the LoginModal Google button

`src/components/Auth/LoginModal.jsx` — wrap the existing Google button block (~lines 305–319):

```diff
-              {/* Google Sign In */}
-              <button
-                onClick={handleGoogleSignIn}
+              {/* Google Sign In — gated on FEATURES.GOOGLE_SIGNIN_ENABLED for
+                  Apple-4.8 compliance when SIWA isn't shipped */}
+              {FEATURES.GOOGLE_SIGNIN_ENABLED && (
+              <button
+                onClick={handleGoogleSignIn}
                 disabled={loading}
                 ... existing className + style + svg + label ...
               </button>
+              )}
```

(Keep the divider + email button as-is — they're outside the Google block.)

---

## Step 3 — Gate the Login.jsx Google button

`src/pages/Login.jsx` — wrap the existing Google button block (~lines 416–430):

```diff
-                {/* Google Sign In */}
-                <button
-                  onClick={handleGoogleSignIn}
+                {/* Google Sign In — gated on FEATURES.GOOGLE_SIGNIN_ENABLED for
+                    Apple-4.8 compliance when SIWA isn't shipped */}
+                {FEATURES.GOOGLE_SIGNIN_ENABLED && (
+                <button
+                  onClick={handleGoogleSignIn}
                   disabled={loading}
                   ... existing className + style + svg + label ...
                 </button>
+                )}
```

Verify `FEATURES` is already imported at top of `Login.jsx`. If not, add:

```js
import { FEATURES } from '../constants/features'
```

---

## Step 4 — Flip the env var

In Vercel project settings → Environment Variables → set for Production (and Preview if you want previews to mirror):

```
VITE_FEATURES_GOOGLE_SIGNIN=false
```

Trigger a rebuild — Vercel auto-rebuilds on env var change.

For the iOS native build (Capacitor), the same env var needs to be in the local `.env` (or `.env.production`) at the time you run `npm run build && npx cap sync ios`. The Vite build embeds env vars at build time.

---

## Step 5 — Verify before TestFlight upload

Local smoke check:

```bash
VITE_FEATURES_GOOGLE_SIGNIN=false npm run build
# Open a built page and confirm the Google button is GONE from the login modal
```

Then:

```bash
VITE_FEATURES_GOOGLE_SIGNIN=false npm run build && npx cap sync ios
# Open Xcode, archive, upload to TestFlight
# Smoke test: install via TestFlight, open login modal — verify only "Sign in with Email" is present
```

---

## Step 6 — Update reviewer notes

Edit `docs/superpowers/specs/2026-05-03-app-store-reviewer-notes.md` — change the auth-method line:

```diff
- 5. To test authenticated features (voting, favorites, photo upload,
-    profile), sign in with the demo account below using EMAIL +
-    PASSWORD. Other features (browse, search, map) are guest-accessible.
+ 5. To test authenticated features (voting, favorites, photo upload,
+    profile), sign in with the demo account below using EMAIL +
+    PASSWORD. (Email is the only sign-in method offered in this version;
+    additional sign-in methods will be added in a follow-up release.)
+    Other features (browse, search, map) are guest-accessible.
```

This pre-empts the obvious reviewer question "why no Google?".

---

## Step 7 — Restore in v1.1

After Apple Dev clears + B3-activate + B5 ship:

1. Remove `VITE_FEATURES_GOOGLE_SIGNIN=false` from Vercel env (or set to `true`)
2. Add `VITE_FEATURES_APPLE_SIGNIN=true`
3. Add SIWA capability in Xcode (`com.apple.developer.applesignin` in `App.entitlements`)
4. Submit v1.1 — both Google + Apple visible, equal prominence

---

## Why a feature flag instead of deleting the button

- **Reversible in 1 env-var flip** — no code re-PR for v1.1
- **Default-on means non-iOS builds keep working** — web users still see Google
- **Won't lose the JSX** — comments, styles, click handler all intact
- **Mirrors the existing `APPLE_SIGNIN_ENABLED` pattern** — consistent codebase

---

## Estimated apply time: 5 minutes

1. Add 4 lines to `features.js` — 30s
2. Wrap LoginModal Google block — 30s
3. Wrap Login.jsx Google block — 30s
4. Flip Vercel env var — 30s
5. Local build verify — 60s
6. Update reviewer notes — 60s
7. iOS Capacitor build + TestFlight upload — 5–10 min separately

If we're at this point, the gate is Apple Dev clearance + a clean TestFlight build. The code is the trivial part.
