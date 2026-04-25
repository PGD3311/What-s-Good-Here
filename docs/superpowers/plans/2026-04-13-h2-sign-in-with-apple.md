# H2 — Sign in with Apple

**Status:** Ready to implement (revised 2026-04-13 after Codex pressure-test)
**Effort:** 15-22h (revised up from 13-20.5 after incorporating Apple-specific gaps)
**Apple rule:** Guideline 4.8 — hard gate
**Source audit:** Direct code review + Codex gpt-5.4 high pressure-test

> **Why this is required:** WGH offers Google Sign-In (`LoginModal.jsx:231-244`, `Login.jsx:350-364`). Apple rule 4.8: any app with third-party social login must offer Sign in with Apple as an equivalent option. Missing = auto-reject.
>
> **Revision notes:** First draft had several wrong assumptions about the Apple identity token (doesn't include name, unlike Google), account linking (Supabase auto-links now), flow type (implicit, not PKCE), and several small plan items. See the revision log at the bottom.

---

## Goal

Add Sign in with Apple as a third auth option alongside Google and email. Works on PWA (web OAuth flow) and iOS Capacitor build (native plugin flow). Handle Apple-specific quirks: Apple doesn't send name in the identity token, relay-email users, first-sign-in name persistence, and 6-month secret rotation.

## Non-goals

- Apple token revocation on sign-out (defer — call on account deletion only, as H1.1 follow-up).
- Full email-relay configuration at our domain (Apple email source registration is a config task, not code — document, do in Supabase dashboard).
- Account merge tooling for pre-existing accounts with different verified emails (Supabase auto-links SAME verified email; Apple private-relay may create separate accounts).
- Single-tap SIWA via Apple JS SDK on web (post-launch).

## Approach

Two flows, same Supabase user:

1. **Web (PWA):** User taps "Sign in with Apple" → Supabase `signInWithOAuth({ provider: 'apple' })` → browser full-page redirect to Apple → user authorizes → Apple redirects back → Supabase validates the ID token and sets session in the browser (the Supabase client uses **implicit flow** by default, per `src/lib/supabase.js:31` — tokens come back in the URL, not via code exchange).

2. **Native (Capacitor iOS):** User taps "Sign in with Apple" → `@capacitor-community/apple-sign-in` community plugin invokes native `ASAuthorizationController` → user authorizes via Touch/Face ID → plugin returns an Apple ID token + first-sign-in name (if shared) → client calls `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })` → session is set.

Runtime detection: `Capacitor.isNativePlatform()` returns true only inside the iOS app.

---

## Apple Developer setup (prerequisite)

**Blocked by:** Dan's Apple Developer enrollment (T1 from launch plan).

Once Apple Dev account is active:

- [ ] **Create App ID** (e.g. `com.whatsgoodhere.app`)
  - Enable capability: **Sign In with Apple**

- [ ] **Create a Services ID** (web-flow client ID)
  - Example: `com.whatsgoodhere.service`
  - **Associated Domains** (domains where the SIWA button appears): `wghapp.com` (and any future custom domain)
  - **Return URL** (OAuth callback — must be Supabase): `https://vpioftosgdkyiwvhxewy.supabase.co/auth/v1/callback`
  - These are two separate fields in the Apple Services ID config.

- [ ] **Generate Sign in with Apple private key (.p8)**
  - Download the .p8 file ONCE (not re-downloadable) — store securely (password manager / 1Password vault)
  - Note the Key ID

- [ ] **Note the Team ID**

- [ ] **Plan secret rotation (mandatory every 6 months)**
  - Supabase docs: the client secret JWT generated from the .p8 must be rotated every 6 months or auth will fail. Calendar reminder required.
  - Source: [Supabase Apple auth docs](https://supabase.com/docs/guides/auth/social-login/auth-apple)

**Artifacts Dan needs for Supabase config:**
- Services ID (e.g. `com.whatsgoodhere.service`)
- Team ID (10-char string)
- Key ID (10-char string)
- .p8 file contents

---

## Supabase config (prerequisite)

In Denis's Supabase dashboard (project `vpioftosgdkyiwvhxewy`):

- [ ] Auth → Providers → Apple → Enable
- [ ] Client IDs (plural): both the web **Services ID** (for OAuth flow) and the iOS **Bundle ID** (for signInWithIdToken) go here.
  - The Supabase dashboard field may show "Client IDs" (plural) — add both values; format (comma-separated vs separate fields) is a **verification step in the dashboard**, not a confirmed fact from docs
- [ ] Team ID
- [ ] Key ID
- [ ] Secret Key: paste .p8 contents
- [ ] Redirect URL for Apple → confirm matches what was set in Services ID config

**Email source registration (optional but recommended):**

Apple's relay delivers forwarded emails through Apple's servers to the user's real inbox. If we send auth emails (magic links at `authApi.js:83`, password resets at `authApi.js:219`) to a relay address, register the WGH sending domain with Apple so emails come from our domain rather than being rejected/spam-filtered. This is a one-time Apple Developer portal config step.

---

## Backend changes

**Profile auto-creation trigger (existing) does NOT auto-fill display_name for Apple users.**

The trigger at `supabase/schema.sql:2923` reads `raw_user_meta_data.full_name` / `name`. Apple's identity token does NOT include name (unlike Google). Supabase docs confirm: for Apple users, the name is delivered ONLY in the first-sign-in plugin/JS response and must be saved manually via `updateUser()`.

**Implication:** Apple users will have `display_name = null` on first sign-in via web OAuth. We handle this via:
- **Native path:** capture name from plugin response, persist via `persistFirstSignInName()` (see frontend below)
- **Web path:** display_name stays null; WelcomeModal (updated below) prompts user

**No new tables or Edge Functions required for H2 itself.** (Revocation in H1.1 is a separate Edge Function — see "Account deletion revocation tie-in".)

---

## Frontend — web flow (PWA)

### API method

**File:** `src/api/authApi.js`

Mirror `signInWithGoogle` (line 51). Use `supabase.functions.invoke`-style error handling per repo pattern:

```js
async signInWithApple(redirectUrl = null) {
  try {
    const rateLimit = checkRateLimit('auth', RATE_LIMITS.auth)
    if (!rateLimit.allowed) throw new Error(rateLimit.message)

    capture('login_started', { method: 'apple' })

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: getSafeRedirectUrl(redirectUrl) },
    })
    if (error) {
      capture('login_failed', { method: 'apple', error: error.message })
      throw createClassifiedError(error)
    }
    return { success: true }
  } catch (error) {
    logger.error('authApi.signInWithApple failed:', error)
    throw error.type ? error : createClassifiedError(error)
  }
}
```

**Rate limit caveat:** `checkRateLimit('auth', ...)` uses in-memory storage (`src/lib/rateLimiter.js:6`). Because OAuth is a full-page redirect, the counter resets on return — the limiter only throttles rapid pre-redirect clicks within a single page lifetime. Document as a known limitation; consider server-side rate limiting post-launch (via Supabase RPC, like we do for votes).

### UI — LoginModal.jsx

Add Apple button. Apple HIG says SIWA must be **at least as prominent** as other third-party sign-in options — equal size + comparable placement. Above Google is a safe choice; side-by-side also works. **"Above Google"** is the plan's default.

**Location:** `src/components/Auth/LoginModal.jsx`, before the Google button block.

**Handler:**
```js
const handleAppleSignIn = async () => {
  try {
    setLoading(true)
    const redirectUrl = new URL(window.location.href)
    const pending = getPendingVoteFromStorage()
    if (pending?.dishId) redirectUrl.searchParams.set('votingDish', pending.dishId)
    await authApi.signInWithApple(redirectUrl.toString())
  } catch (error) {
    setMessage({ type: 'error', text: error.message })
    setLoading(false)
  }
}
```

**Button — use Apple's official assets:**

Apple's HIG specifies button design requirements:
- Exact label text: "Sign in with Apple" (case-sensitive)
- Apple logo at left
- Official black / white / white-outlined variants only
- Button height, padding, corner radius follow Apple's specs
- Source: [Apple HIG / Sign in with Apple buttons](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple/overview/buttons/)

**Recommended implementation:** use Apple's provided button assets directly, or import an official SIWA button component. Do NOT hand-author the logo SVG (compliance risk — Apple requires specific proportions/padding).

Option A — download official PNG assets from Apple Developer:
- `public/apple-signin-black.png` (for light themes)
- `public/apple-signin-white.png` (for dark themes)
- Render as a button background image with correct padding

Option B — use a verified npm package like `react-apple-signin-auth` (community-maintained) for just the button styling. But wire up the handler ourselves — don't use the package's auth flow, use Supabase's.

**Dimensions to match Google button exactly:**
- Width: 100% (w-full)
- Padding: `px-6 py-4`
- Border-radius: `rounded-xl` (14px)
- Font: Outfit (body)
- Min 44pt tap target (iOS HIG)

**Placement decision:** Put Apple button ABOVE Google — conservative safe default for HIG compliance.

### UI — Login.jsx

Mirror the change in `src/pages/Login.jsx`. Add Apple button above Google button. Same handler pattern.

**Parallel bug to fix (pre-existing, flagged by Codex):** The current Google OAuth flow in `Login.jsx` does not serialize `location.state?.from` into the redirect URL. Post-OAuth return will not preserve where the user came from. Fix for BOTH Apple and Google in this update.

---

## Frontend — native flow (Capacitor)

### Prerequisites (noted — not current state)

The repo currently has NO Capacitor scaffold. No `@capacitor/*` deps in `package.json:21`, no `ios/` directory, no `capacitor.config.*`. The native flow becomes buildable only after the Capacitor scaffold exists (tracked separately).

Once Capacitor is scaffolded:

```bash
npm install @capacitor-community/apple-sign-in
npx cap sync ios
```

Add capability in Xcode: **Signing & Capabilities → + Capability → Sign In with Apple**.

**About the plugin:** `@capacitor-community/apple-sign-in` is a **community-maintained plugin**, NOT an official Capacitor-core plugin. It's actively used but not a first-party solution. Track its maintenance status; reassess if it becomes stale.

### Runtime detection in API method

**File:** `src/api/authApi.js`

```js
import { Capacitor } from '@capacitor/core'

async signInWithApple(redirectUrl = null) {
  if (Capacitor.isNativePlatform()) {
    return this._signInWithAppleNative()
  }
  return this._signInWithAppleWeb(redirectUrl)
}
```

The existing web code moves into `_signInWithAppleWeb`. Do NOT import the native plugin in the web bundle (webpack tree-shaking may handle this, but be explicit — dynamic import in the native branch).

### Native handler

```js
async _signInWithAppleNative() {
  try {
    const rateLimit = checkRateLimit('auth', RATE_LIMITS.auth)
    if (!rateLimit.allowed) throw new Error(rateLimit.message)

    capture('login_started', { method: 'apple_native' })

    const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')

    // Generate nonce: raw for Supabase, SHA-256 hashed for Apple
    const rawNonce = generateNonce()
    const hashedNonce = await sha256(rawNonce)

    const result = await SignInWithApple.authorize({
      clientId: IOS_BUNDLE_ID,  // e.g. 'com.whatsgoodhere.app'
      redirectURI: '<TBD — verify with plugin docs>',  // see open question below
      scopes: 'email name',
      state: crypto.randomUUID(),
      nonce: hashedNonce,
    })

    const identityToken = result?.response?.identityToken
    if (!identityToken) throw new Error('Apple sign-in did not return a token')

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      nonce: rawNonce,  // RAW nonce — Supabase verifies against hashed version in the signed token
    })

    if (error) {
      capture('login_failed', { method: 'apple_native', error: error.message })
      throw createClassifiedError(error)
    }

    // Name is delivered ONLY on first sign-in per user
    const fullName = result?.response?.givenName
      ? `${result.response.givenName} ${result.response.familyName || ''}`.trim()
      : null
    if (fullName) {
      await persistFirstSignInName(fullName)
    }

    capture('login_succeeded', { method: 'apple_native' })
    return { success: true }
  } catch (error) {
    logger.error('authApi.signInWithAppleNative failed:', error)
    throw error.type ? error : createClassifiedError(error)
  }
}
```

**Open question for plugin `redirectURI`:** The plugin's published type definitions require a `redirectURI` string, but the plan's earlier `redirectURI: ''` was speculative. Verify against the plugin's actual examples before implementation — typical values are the Apple Services ID (web flow) or an intent scheme like `com.whatsgoodhere.app://`. This is not something we should ship without testing on a real device.

### Helper: persistFirstSignInName (with content validation)

**File:** `src/utils/appleAuth.js` (new)

```js
import { supabase } from '../lib/supabase'
import { logger } from './logger'
import { validateUserContent } from '../lib/reviewBlocklist'

export async function persistFirstSignInName(fullName) {
  try {
    // Must pass same moderation as any user-set display_name
    const validationError = validateUserContent(fullName, 'Display name')
    if (validationError) {
      logger.warn('Apple-provided name failed validation:', validationError)
      return  // Fall through — WelcomeModal will prompt user manually
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle()

    // Only set if not already set
    if (!profile?.display_name) {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: fullName })
        .eq('id', user.id)
      if (error) logger.warn('Failed to persist Apple first-sign-in name:', error)
    }
  } catch (error) {
    logger.warn('persistFirstSignInName failed (non-fatal):', error)
  }
}
```

Non-fatal on any failure — user still gets logged in, WelcomeModal catches the missing display_name downstream.

**Uniqueness risk:** `profiles.display_name` has a unique lowercase constraint (`schema.sql:387`). If the Apple-provided name collides with an existing user, this silently fails. The WelcomeModal prompt handles recovery.

### Helper: nonce generation + SHA256

**File:** `src/utils/nonce.js` (new)

```js
export function generateNonce() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256(str) {
  const buf = new TextEncoder().encode(str)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')
}
```

Uses Web Crypto — available in Capacitor WKWebView and all modern browsers.

### `IOS_BUNDLE_ID` constant (new)

**File:** `src/constants/app.js`

```js
export const IOS_BUNDLE_ID = 'com.whatsgoodhere.app'
```

Must match what gets registered in Apple Developer portal AND what gets configured when Capacitor is scaffolded. Decide value BEFORE Apple Dev portal work.

---

## WelcomeModal fix (covers the no-name edge case)

**File:** `src/components/Auth/WelcomeModal.jsx`

**Current open condition** (`WelcomeModal.jsx:50`):
```js
if (user && profile && !profile.has_onboarded) openModal()
```

**Problem:** a returning user who onboarded in the past but has `display_name = null` (edge case: Apple decline after first onboarding flow was never completed, or manual data edit) gets no prompt, and can't vote (display name is required).

**Fix:** update condition to ALSO open when display_name is missing:
```js
if (user && profile && (!profile.has_onboarded || !profile.display_name)) openModal()
```

This catches:
- First sign-in users (pre-existing flow)
- Apple users who skipped the name step on first sign-in
- Any user in a weird data state

**Pre-existing bug to fix in the same pass:** `completeOnboarding()` at `WelcomeModal.jsx:61` awaits `updateProfile()` but ignores the `{ error }` return. Duplicate display_name unique-constraint errors fail silently. The user sees success but their display_name wasn't saved.

**Fix:**
```js
const { error } = await updateProfile(...)
if (error) {
  setError(getUserMessage(error, 'setting display name'))
  return  // Don't close modal on error
}
// ...existing close logic
```

---

## Account linking + duplicate accounts

### Supabase's current behavior (updated from plan v1)

- **Same verified email across providers:** Supabase **auto-links** identities with the same verified email (default behavior, can be configured). So a user with Google `dan@example.com` who signs in with Apple also delivering `dan@example.com` will get ONE auth user with two linked identities.
- **Private-relay email:** Apple users who pick "Hide My Email" get `random@privaterelay.appleid.com`. This is a DIFFERENT email than their real one → Supabase creates a separate auth user. Can't auto-link.
- **Manual linking available:** `supabase.auth.linkIdentity()` exists in the installed SDK. Post-launch, could build a "link my Apple account" UI from settings.

**Update Privacy.jsx copy** to reflect this (not two-accounts-always).

### What users see today
- Google sign-up with real email, then Apple with same real email → single account ✓
- Google sign-up, then Apple with private-relay → two accounts (document limitation, offer manual link post-launch)
- Apple sign-up with private-relay, then trying to sign up again with "different" method using same Apple ID → one account under the relay email, which is the canonical record

---

## Copy changes

### Privacy.jsx (line number corrected: 61, not 51)

**Current line 61:**
```
If you sign in with Google, we receive your name and email from Google.
```

**Replace with:**
```
If you sign in with Google or Apple, we receive your name (if shared) and
email (which may be a private-relay address from Apple) from the provider.
If you use the same verified email across providers, we automatically link
your accounts.
```

### Other privacy updates (coordinate with L1 Privacy comprehensive update plan):
- Disclose Apple's private-relay email behavior
- Note that auth emails (magic links, resets) may be delivered via Apple's relay
- Clarify automatic account linking behavior

---

## Testing plan

### Web flow (PWA)
1. From logged-out, open LoginModal
2. Tap Apple button → full-page redirect to Apple
3. Sign in with real Apple ID → return to app → session is set
4. Profile row exists, `display_name = null`
5. WelcomeModal opens with name prompt → user sets display name
6. Sign out + sign in again → same user, no re-prompt (`has_onboarded = true` now)

### Private-relay email
1. Sign in with Apple, pick "Hide My Email"
2. Confirm `auth.users.email` ends in `@privaterelay.appleid.com`
3. Attempt to trigger a password reset (edge case) — Apple forwards via relay
4. Verify RLS + downstream queries handle the relay email format

### Declined name (first sign-in)
1. Sign in with Apple, decline name
2. Confirm display_name is null
3. WelcomeModal opens → user types a name
4. Save succeeds, user continues to app

### WelcomeModal handles onboarded-but-null-name case
1. Create a test user with `has_onboarded = true, display_name = null` (DB manipulation)
2. Log in → WelcomeModal should still open
3. Confirm user can set display_name

### Validation on Apple-provided name
1. Simulate Apple returning name containing banned word
2. Confirm `persistFirstSignInName` skips the write
3. Confirm WelcomeModal opens for manual input

### Duplicate display_name collision
1. Existing user has display_name "Dan"
2. New Apple user returns "Dan" — persistFirstSignInName silently fails
3. WelcomeModal opens → user enters a different name → success

### Account linking (Supabase auto-link)
1. Sign up with Google using real email
2. Sign out
3. Sign in with Apple using same real email
4. Verify ONE auth.users row with two linked identities (inspect `auth.identities` table)

### Private-relay separate account (limitation)
1. Sign up with Google using real email
2. Sign out
3. Sign in with Apple using private-relay
4. Verify TWO auth.users rows — expected behavior, document

### Native flow (requires Capacitor + iPhone)
1. Capacitor build installed on physical iPhone
2. Tap Apple button → native sheet with Touch/Face ID
3. Authorize → session is set via signInWithIdToken
4. Name captured on first sign-in, persisted via persistFirstSignInName
5. Sign out + sign in → no name re-prompt, same user

### Runtime detection
1. Same code path on web → web flow invoked
2. Same code path on iOS Capacitor build → native plugin invoked

### Rate limit behavior
1. Tap Apple sign-in 10 times rapidly before redirect
2. In-memory limiter throttles attempts beyond threshold (5/5min)
3. After redirect return, counter is reset (expected limitation)

### UI compliance
1. Apple button uses official assets or meets exact HIG button spec
2. Placement: above Google, same width, same padding
3. Label: exactly "Sign in with Apple"
4. 44pt minimum tap target

---

## Rollout steps

### Phase 1 — Web only (PWA)
1. Dan enrolls Apple Developer + creates App ID, Services ID, .p8 key (external)
2. Configure Supabase Auth → Providers → Apple with both client IDs (web + iOS)
3. Implement web path:
   - `authApi.signInWithApple` (web branch only, no native import yet)
   - Apple button on LoginModal + Login
   - Fix Google OAuth intent-preservation bug in Login.jsx at the same time
4. Update WelcomeModal open condition + fix silent error bug
5. Update Privacy.jsx copy
6. Deploy to staging → test on real Apple ID (+ private relay)
7. Deploy to prod

### Phase 2 — Native (after Capacitor scaffold exists)
1. Install community Apple sign-in plugin
2. Add SIWA capability in Xcode
3. Implement native branch in `authApi.signInWithApple`
4. Verify plugin `redirectURI` param on a real build
5. Install helpers: `nonce.js`, `appleAuth.js`
6. Test on physical iPhone via TestFlight
7. Ship in iOS release

Phase 1 ships independently of Phase 2. The web flow is the Apple HIG baseline.

---

## Rollback

If web flow breaks post-deploy:
- Feature-flag hide the Apple button. (NOTE: must NOT hide in iOS App Store build — Apple requires SIWA there.)

If native flow breaks in iOS build:
- Emergency TestFlight patch before App Store submission.

---

## Risks

| Risk | Mitigation |
|---|---|
| Apple Developer account not enrolled in time | Email/password + Google still work; Apple adds without blocking existing auth |
| Apple client secret JWT expires (6-month rule) | Calendar reminder; Supabase dashboard makes rotation easy |
| Services ID / key config mistake | Test on staging before prod; Supabase surfaces clear errors on misconfig |
| Plugin redirectURI param wrong | Verify on device before marking native flow done |
| Community plugin goes stale | Monitor; if abandoned, re-evaluate or fork |
| Apple-provided name fails validation → user sees silent null display_name | WelcomeModal catches this; user sets name manually |
| Duplicate display_name from Apple collision | WelcomeModal catches + updateProfile returns error (after bug fix) |
| Private-relay users create duplicate accounts | Document; offer manual link post-launch |
| Supabase auto-link behavior changes | Monitor Supabase release notes |
| .p8 private key leakage | Stored only in Supabase (encrypted); never commit to git |
| iCloud Keychain flakiness on simulator | Test on physical device, not simulator |
| Apple revocation endpoint complexity | Defer to H1.1 (see below); document as known post-launch gap |

---

## Account deletion revocation tie-in (H1.1 — defer)

Apple requires that apps supporting Sign in with Apple **revoke** the user's Apple access when they delete their account. Non-trivial to implement — here's the shape for future work:

### What's needed
1. **Capture Apple refresh token on sign-in.** Supabase sessions can carry `provider_refresh_token` / `provider_token` (`@supabase/auth-js/src/lib/types.ts:248`), but the current app doesn't persist them.
2. **Store refresh token in a new table.** Linked to `auth.users.id`, only for Apple-provider users.
3. **On account deletion**, call Apple's revoke endpoint:
   - Endpoint: `https://appleid.apple.com/auth/revoke`
   - Auth: client_secret JWT signed with .p8, valid for < 24h
   - Payload: `client_id`, `token` (refresh), `token_type_hint: 'refresh_token'`
4. **Location:** Add to the existing `delete-account` Edge Function (H1), triggered when `user.app_metadata.provider === 'apple'`.

### Why defer
- Requires persistent token storage design (new table, RLS, encryption-at-rest for tokens)
- Requires client_secret JWT generation in Edge Function (crypto signing with .p8)
- Substantial engineering (~6-10h) beyond H2's scope
- Not blocking App Store submission if we can show Apple we have account deletion (they may accept "user's Apple ID account remains authorized but WGH account is deleted")

### Follow-up spec
Open a separate H1.1 spec after H1 and H2 ship. Target: before July 4, definitely before Labor Day.

---

## Effort breakdown (revised)

- Apple Developer setup (Dan external): **1-2h**
- Supabase config: **0.5h**
- Web: API method + UI + WelcomeModal fix + Privacy copy + Login.jsx intent-preservation bug fix: **4-5h**
- Native: plugin install + Xcode capability + branch + helpers + plugin redirectURI verification: **5-7h**
- Edge case handling (validation, relay, uniqueness, onboarded-null-name): **2-3h**
- Testing (web + native + edge + linking cases): **3-5h**

**Total: 15.5-22.5h.**

---

## Dependencies

**Blocks:** H1.1 (Apple token revocation). Cannot complete iOS submission without SIWA.
**Blocked by:**
- Apple Developer account active (Dan external)
- App ID + Services ID + .p8 created
- For Phase 2: Capacitor scaffold exists

**Related:**
- L1 Privacy + ToS update (shared file edit — coordinate)
- H1 account deletion (revocation hook in delete-account Edge Function is a follow-up)
- LoginModal + Login.jsx touches (may conflict with feature work)

---

## Open questions for Dan

1. **Bundle ID:** confirm `com.whatsgoodhere.app` for both Apple App ID and Capacitor Xcode project.
2. **Services ID name:** `com.whatsgoodhere.service` — good?
3. **Button variant:** black (default), white, or white-outlined? White-outlined might fit the warm light theme best — worth mocking.
4. **Flow order:** Phase 1 (web) first, Phase 2 (native) once Capacitor scaffolded. OK?
5. **Secret rotation calendar:** who owns the 6-month Apple secret rotation reminder?
6. **Email relay source registration:** any hesitation about configuring our domain as an Apple email source?

---

## Revision log

**2026-04-13 v2 (after Codex pressure-test):**

CRITICAL corrections:
- Apple identity token does NOT contain name (unlike Google) — removed "same path as Google" claim; added explicit first-sign-in name capture via plugin + WelcomeModal fallback for web
- WelcomeModal open condition was missing `!display_name` case — added fix for edge case of onboarded users with null display_name (e.g., Apple decline)
- Services ID config clarified: Associated Domains = app domain, Return URL = Supabase callback (both needed)

IMPORTANT corrections:
- Supabase auto-links same-email identities — rewrote account-linking section
- Flow is implicit, not PKCE — corrected description
- In-memory rate limiter resets on redirect — documented limitation
- Plugin `redirectURI: ''` was speculative — flagged as open question to verify
- Labeled plugin as "community-maintained"
- Noted Capacitor scaffold does NOT exist yet
- Added `validateUserContent` check in `persistFirstSignInName`
- Flagged pre-existing WelcomeModal bug (silent error) + fix
- Added 6-month Apple secret rotation requirement
- Corrected private-relay disclosure (we DO send auth emails)
- Use official Apple button assets, not hand-drawn SVG
- Referenced Apple's button spec (not just 44pt)
- Noted AuthContext has no first-sign-in callback
- Multi-client-ID Supabase config flagged as dashboard verification
- Updated Privacy.jsx line reference: 51 → 61

SUGGESTIONS incorporated:
- Phase 1 (web) strictly web-only (no native imports)
- Intent-preservation bug fix in Login.jsx Google flow (same file edit)
- H1 revocation lives in delete-account Edge Function
- Display-name-required gate broader than onboarding

DEFERRED to H1.1:
- Apple token revocation design — requires persistent refresh-token storage + JWT client_secret generation + Apple revoke API call. Non-trivial. Shape documented here.
