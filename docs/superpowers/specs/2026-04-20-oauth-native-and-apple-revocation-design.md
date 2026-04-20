# OAuth on Native iOS + Apple Token Revocation — Design

**Status:** Approved design, ready for implementation plan
**Date:** 2026-04-20
**Author:** Dan Walsh (with Claude Opus 4.7 + Codex gpt-5.4/high)
**Blocks:** TestFlight build, App Store submission
**Supersedes (partially):** `docs/superpowers/plans/2026-04-13-h2-sign-in-with-apple.md` (H2 plan — stale assumptions about Capacitor scaffold + implicit flow)

---

## Goal

Make native iOS auth work properly for App Store submission. Root-cause fix, not a band-aid.

Concretely: Google login currently breaks in the Capacitor shell (redirects to a scheme Google refuses). Sign in with Apple doesn't exist (Apple rule 4.8 auto-rejects). Email verification and password reset links on iOS open Safari instead of the app. Apple requires us to revoke the Apple-ID consent server-side when a user deletes their account (guideline 5.1.1(v)), and we have no infrastructure for that.

This spec closes all four gaps with one coherent architecture.

## Non-goals

- Android native auth. Same architecture will port (both plugins are cross-platform) but out of scope for v1.
- Account linking UI (merging a Google-only account with an Apple private-relay account). Supabase auto-links same-email identities; private-relay edge cases are a post-launch feature.
- Apple server-to-server notifications (consent-revoked, account-deleted). Post-launch hardening.
- First-party Swift bridge. The thin-adapter design means we can swap from the Capgo community plugin to a custom bridge later without changing callers.

---

## Architecture

Three layers, one mental model.

### Layer 1 — Web PWA (one security upgrade, no UX change)

- Keep `supabase.auth.signInWithOAuth` for Google and Apple on web.
- Migrate Supabase client from implicit flow to **PKCE flow** (`flowType: 'pkce'` in `src/lib/supabase.js`). Industry standard in 2026; removes tokens-in-URL-fragment risk.
- **PKCE is not a one-line change.** `src/pages/Login.jsx` currently reads `window.location.hash` for post-confirmation state (email confirm, password recovery). PKCE changes callback shape from `#access_token=...` to `?code=...`, requiring rework of the entry handler to call `supabase.auth.exchangeCodeForSession(code)`.
- Transitional handling for legacy `#access_token=` URLs (users with old email links in their inbox) for one release.

### Layer 2 — iOS native (the root fix)

- Both Google and Apple use platform-native SDKs via `@capgo/capacitor-social-login` (actively maintained, one plugin for both providers; replaces abandoned `@codetrix-studio/capacitor-google-auth`).
- Google: native iOS Google Sign-In SDK returns `{ idToken, accessToken }` → `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, access_token: accessToken })`.
- Apple: native `ASAuthorizationController` returns `{ identityToken, authorizationCode, givenName, familyName, user = apple_sub }` → `supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce: rawNonce })`. First-sign-in extras trigger server-side `authorizationCode` exchange for refresh-token storage.
- No browser redirect, no deep-link dance, no custom scheme for OAuth.

### Layer 3 — Thin auth bridge (isolation guarantee)

- One module, `src/lib/nativeAuth.js`, is the **only** place that imports `@capgo/capacitor-social-login`.
- Exposes `signInWithGoogleNative()` and `signInWithAppleNative()` with normalized return shapes and WGH-coded errors.
- `Capacitor.isNativePlatform()` branches live inside the API layer (`src/api/authApi.js`), not scattered across UI.
- **Boundary rule:** no plugin-native object shape ever escapes the bridge. All errors map to the canonical WGH set before throwing. If a plugin goes stale, it's a one-file swap.

### Apple revocation infrastructure

Apple's guideline 5.1.1(v) requires apps supporting SIWA to revoke Apple's consent on account deletion. This needs:

- **`user_apple_tokens`** table (per-user, refresh token ciphertext + key version + apple_sub). RLS: deny-all to authenticated role. Service-role only.
- **`pending_apple_revocations`** table (no FK to users — survives cascade delete). Columns include `next_attempt_at` to drive aggressive-then-decaying retry cadence.
- **`apple-token-exchange`** Edge Function: exchanges `authorizationCode` for refresh token on first Apple sign-in.
- **`delete-account`** Edge Function (extended): queues the revocation BEFORE cascading delete. Queue insert is mandatory — failure blocks deletion.
- **`apple-revocation-retry`** Edge Function: invoked by `pg_cron` every 15 minutes, retries pending revocations per backoff schedule.
- **Supabase Vault** for encryption key and `.p8` private key. Not raw `pgcrypto`.

### Universal links (canonical domain)

- `whatsgoodhere.app` is the canonical launch domain (owned, DNS not yet pointed at Vercel as of 2026-04-20).
- `public/.well-known/apple-app-site-association` declares universal-link paths.
- Xcode "Associated Domains" capability registers `applinks:whatsgoodhere.app`.
- Email verification, password reset, and magic-link URLs from Supabase resolve to the app shell, not Safari.
- Cross-device PKCE failure (signup on desktop, link tapped on phone) surfaces a friendly "Send new link to this device" affordance rather than an opaque error.

### Lifecycle hooks

- `@capacitor/app` `appStateChange` listener → on foreground, call `supabase.auth.getSession()` to reconcile. Don't trust WebView timer refresh.
- `@capacitor/app` `appUrlOpen` listener → hand off to `authUrl.parse(url)` → `supabase.auth.exchangeCodeForSession(code)`.
- Both listeners mount inside `AuthLifecycle` component under `AuthProvider`, not in `App.jsx`. Keeps auth state mutations near the auth client.

---

## Components

### New client modules

| File | Purpose | Est. size |
|---|---|---|
| `src/lib/nativeAuth.js` | Thin adapter for Capgo plugin. Nonce generation (raw + SHA-256 for Apple). Normalizes success payloads and errors to WGH codes. Runtime validator for bridge contract. | 120–150 |
| `src/utils/nonce.js` | `generateNonce()` (64-char hex from 32 crypto-random bytes) + `sha256(str)` (Web Crypto). | 15 |
| `src/lib/authUrl.js` | Parser for auth-return universal links. Returns `{ code, type: 'recovery' \| 'confirm' \| 'magiclink' }` or `null`. Ignores non-auth deep links. | 25 |
| `src/components/Auth/AuthLifecycle.jsx` | Mounted inside `AuthProvider`. Owns `appStateChange` + `appUrlOpen` listeners. | 40 |

### Edited client modules

| File | Change | Est. added lines |
|---|---|---|
| `src/api/authApi.js` | Add `Capacitor.isNativePlatform()` branches in `signInWithGoogle` and `signInWithApple`. Native branch calls bridge → `supabase.auth.signInWithIdToken`. On Apple native with `authorizationCode`, invoke `apple-token-exchange` (client body: `{ authorization_code }` only — no `apple_sub` or `user_id`). Apply nonce dance for Apple. Normalize errors. Add `signOut()` native branch that also calls Capgo's `logout()` to clear Google account picker. | 80–120 |
| `src/lib/supabase.js` | Add `flowType: 'pkce'`. | 1 |
| `src/pages/Login.jsx` | Handle both `?code=` (PKCE) and legacy `#access_token=` (one-release transition). Call `supabase.auth.exchangeCodeForSession()`. Fix existing `location.state?.from` intent-preservation bug. Activate Apple button. | 40 |
| `src/components/Auth/LoginModal.jsx` | Activate pre-wired Apple button with official SIWA asset. | 15 |
| `src/components/Auth/WelcomeModal.jsx` | Open condition: `(!profile.has_onboarded \|\| !profile.display_name)`. Fix existing silent-error-on-duplicate-display_name bug (from H2 plan). | 10 |
| `src/App.jsx` | Mount `AuthLifecycle` inside `AuthProvider`. No auth logic directly in App.jsx. | 5 |
| `src/pages/Privacy.jsx` + `src/pages/Terms.jsx` | Copy updates for Apple sign-in, private-relay email behavior, account linking, canonical domain `whatsgoodhere.app`. | 25 |

### iOS native config

| File / capability | Change |
|---|---|
| `ios/App/App/Info.plist` | Add `CFBundleURLTypes` for custom scheme (fallback only — universal links primary). |
| Xcode Signing & Capabilities | Add "Sign In with Apple". Add "Associated Domains" with `applinks:whatsgoodhere.app`. |
| `ios/App/App.entitlements` | Associated Domains entry. |
| `PrivacyInfo.xcprivacy` | Audit after plugin install. Capgo may ship its own; we add/override only what's missing. |

### Universal-link artifact

| File | Purpose |
|---|---|
| `public/.well-known/apple-app-site-association` | JSON declaring `applinks` with `TEAMID.com.whatsgoodhere.app` appID and path patterns for `/auth/*`. Vercel serves with `Content-Type: application/json`. **Deferred until DNS wired.** Shipped in same PR that wires the DNS. |

### New server modules

| File | Purpose | Est. size |
|---|---|---|
| `supabase/migrations/20260420_user_apple_tokens.sql` | Create `user_apple_tokens` table: `user_id UUID PK REFERENCES auth.users(id) ON DELETE CASCADE`, `apple_sub TEXT NOT NULL`, `encrypted_refresh_token TEXT NOT NULL`, `key_version TEXT NOT NULL`, `created_at`, `updated_at`, `last_exchange_at`, `revoked_at`. RLS: deny all to authenticated role. Index on `apple_sub`. Includes `-- ROLLBACK:` block. | 30 |
| `supabase/migrations/20260420_pending_apple_revocations.sql` | Create `pending_apple_revocations` table (no FK to users). `apple_sub`, `encrypted_refresh_token`, `key_version`, `attempts INT DEFAULT 0`, `last_attempt_at`, `next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `created_at`, `dead_letter BOOLEAN DEFAULT FALSE`. RLS: deny all. Index on `next_attempt_at WHERE attempts < MAX_ATTEMPTS AND NOT dead_letter`. | 25 |
| `supabase/functions/_shared/apple.ts` | Shared Apple helper: `signClientSecretJWT()` (signs with `.p8` from Vault, 5-min TTL), `exchangeAuthorizationCode()` (POST `/auth/token`), `revokeToken()` (POST `/auth/revoke`), `decodeIdToken()` (parses `sub` and claims without external deps), shared error mapping. | 150 |
| `supabase/functions/apple-token-exchange/index.ts` | Receives `{ authorization_code }` with `Authorization: Bearer <JWT>`. `getClaims()` → user_id. Looks up `auth.identities` for `apple_sub`. Calls `_shared/apple.exchangeAuthorizationCode()`. **Verifies decoded `id_token.sub` === stored `provider_id`** (security binding — without this, a stolen code could be bound to another user). Encrypts via Vault. UPSERTs `user_apple_tokens` (fresh code for existing user updates token; narrow idempotency window rejects same-event duplicates). Returns structured response with HTTP status. | 180–250 |
| `supabase/functions/delete-account/index.ts` (edit) | Before existing cascade: query `auth.identities WHERE user_id = ? AND provider = 'apple'`. If Apple identity exists: fetch `user_apple_tokens` row, INSERT INTO `pending_apple_revocations` (mandatory — queue failure returns 500, blocks delete). Try inline revoke via `_shared/apple.revokeToken()`. Success → DELETE pending row. Failure → leave row for cron. Proceed with cascade regardless of revoke outcome. | 40 |
| `supabase/functions/apple-revocation-retry/index.ts` | Invoked by `pg_cron` every 15min. SELECTs pending rows where `next_attempt_at <= NOW() AND attempts < MAX_ATTEMPTS AND NOT dead_letter`. For each: call `_shared/apple.revokeToken()`. Success → DELETE row. Apple 5xx/timeout → `attempts += 1`, `next_attempt_at = NOW() + backoff(attempts)` where backoff is `[15min, 1hr, 6hr, 24hr, 24hr, 24hr…]`. Apple 4xx → mark `dead_letter = true` (NOT retryable), Sentry event. Past MAX_ATTEMPTS → mark `dead_letter`, PostHog `apple_revoke_failed_final`. | 100 |

### Config

- Supabase Vault: store `.p8` contents, Apple Team ID, Key ID, Services ID, Apple encryption master key.
- Supabase Auth → Providers → Apple: enabled, Client IDs = Bundle ID + Services ID, Team ID, Key ID, .p8 contents. Redirect allow-list includes `whatsgoodhere.app`.
- Apple Developer portal: App ID `com.whatsgoodhere.app` + SIWA capability; Services ID `com.whatsgoodhere.service` + Associated Domains `whatsgoodhere.app` + Return URL `https://vpioftosgdkyiwvhxewy.supabase.co/auth/v1/callback`; .p8 key.
- Google Cloud Console: iOS client ID for bundle `com.whatsgoodhere.app`. Verify existing web client ID still matches Supabase config.
- Vercel project domain: add `whatsgoodhere.app`, provision Let's Encrypt cert, update DNS at registrar.
- `pg_cron` schedule: `*/15 * * * *` invokes `apple-revocation-retry`.

**Boundary rule (explicit):** `nativeAuth.js` is the only module importing `@capgo/capacitor-social-login`. No plugin-shaped objects escape. `authApi.js` pattern-matching on plugin error strings = boundary leak, fix it.

---

## Data flow

### Flow A — Native Google sign-in

```
Tap Google → authApi.signInWithGoogle()
  → isNativePlatform() === true → nativeAuth.signInWithGoogleNative()
  → Capgo plugin opens iOS Google Sign-In sheet
  → plugin returns { idToken, accessToken }
  → supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, access_token: accessToken })
  → onAuthStateChange → AuthContext updates
```
No nonce dance. No `authorizationCode`. No server round-trip.

### Flow B — Native Apple first sign-in

```
Tap Apple → authApi.signInWithApple()
  → isNativePlatform() === true → nativeAuth.signInWithAppleNative()
  → nonce.generateNonce() (raw, 64 hex chars) + sha256(raw) (hashed)
  → Capgo plugin invokes ASAuthorizationController with scopes 'email name', hashed nonce
  → Touch/Face ID → plugin returns { identityToken, authorizationCode, givenName, familyName, user = apple_sub }
  → supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce: rawNonce })
    → fails → abort, surface error, do NOT attempt server-side recovery
    → succeeds → session set → onAuthStateChange fires
  → persistFirstSignInName(givenName + familyName) runs INDEPENDENTLY of exchange
  → if authorizationCode present:
       POST apple-token-exchange (Bearer JWT, body: { authorization_code })
       → Edge Function:
            getClaims() → user_id
            SELECT provider_id FROM auth.identities WHERE user_id=? AND provider='apple' → storedAppleSub
            _shared/apple.signClientSecretJWT() (from Vault .p8)
            _shared/apple.exchangeAuthorizationCode(code, client_id: BUNDLE_ID)
              → Apple returns { refresh_token, id_token }
            decodeIdToken(id_token) → decodedSub
            ASSERT decodedSub === storedAppleSub → else 403 + Sentry
            encrypt refresh_token via Vault → UPSERT user_apple_tokens (apple_sub from storedAppleSub, key_version, timestamps)
            return 200
       → on failure: log, surface metric, continue (Flow H heals later)
```
**Apple sub binding** (assert decodedSub === storedAppleSub) prevents a stolen code from being bound to an unrelated user's account.

### Flow C — Native Apple returning sign-in

```
Same through signInWithIdToken.
authorizationCode may or may not be present (Apple docs do NOT restrict to first time).
Client posts to apple-token-exchange iff code present.
Edge Function UPSERTs on matching apple_sub — fresh code = token refresh; same-event duplicate (same authorization_code hash) within ~60s window = 409.
```
Idempotent by design. No double-exchange problem.

### Flow D — Email auth return (universal link)

```
Tap email-confirmation or password-reset link in iOS Mail
  → iOS resolves applinks:whatsgoodhere.app
  → /.well-known/apple-app-site-association authorizes the path
  → iOS opens WGH app (not Safari)
  → @capacitor/app appUrlOpen fires with URL containing ?code=... AND ?type=recovery|confirm|magiclink
  → AuthLifecycle → authUrl.parse(url)
  → supabase.auth.exchangeCodeForSession(code)
    → success: route by type (recovery → reset page, confirm → welcome, magiclink → home)
    → failure (code verifier not found = cross-device PKCE):
        show message "Open this link on the device where you signed up, or request a new link here."
        button: "Send new link to <email>" → triggers Supabase magic link
```

### Flow E — App foreground reconciliation

```
Return from background → @capacitor/app appStateChange fires isActive:true
  → AuthLifecycle calls supabase.auth.getSession()
  → Supabase re-reads storage + refreshes if expired
  → onAuthStateChange fires on state change
```

### Flow F — Account deletion (Apple user)

```
Tap Delete → authApi.deleteAccount() → POST delete-account (Bearer JWT)
  → Edge Function:
       getClaims() → user_id
       SELECT FROM auth.identities WHERE user_id=? AND provider='apple'
       IF Apple identity:
            SELECT FROM user_apple_tokens WHERE user_id=?
            INSERT INTO pending_apple_revocations (apple_sub, encrypted_refresh_token, key_version, attempts=0)
              → INSERT FAILS → return 500, BLOCK CASCADE (mandatory queue)
              → INSERT OK → try _shared/apple.revokeToken()
                   → success: DELETE pending row
                   → failure: leave row, log, continue
       Existing cascade: delete user data, auth.admin.deleteUser(user_id)
       user_apple_tokens row cascades via FK
       pending_apple_revocations row survives (no FK)
       return 200
```

### Flow G — Apple revocation retry cron

```
pg_cron every 15min → apple-revocation-retry Edge Function
  → SELECT FROM pending_apple_revocations
       WHERE next_attempt_at <= NOW() AND attempts < MAX_ATTEMPTS AND NOT dead_letter
  → For each row:
       _shared/apple.revokeToken(row.encrypted_refresh_token, row.key_version)
         → success: DELETE row, PostHog apple_revoke_succeeded
         → Apple 5xx / timeout: UPDATE attempts += 1, next_attempt_at = NOW() + backoff(attempts)
             backoff schedule (attempt → wait): [1→15min, 2→1hr, 3→6hr, 4→24hr, 5+→24hr]
             MAX_ATTEMPTS = 10 (row dead-lettered ~9 days after first failure)
         → Apple 4xx (invalid_grant, etc.): UPDATE dead_letter = true, Sentry event, PostHog apple_revoke_failed_final
  → attempts past MAX_ATTEMPTS → UPDATE dead_letter = true, Sentry event once
```

### Flow H — Later Apple sign-in healing

```
User has Apple identity but no stored refresh token (earlier exchange failed or pre-existing user).
Fresh Apple sign-in returns authorizationCode.
apple-token-exchange sees no existing row → INSERT. Self-heals.
```

### Flow I — Provider logout

```
User signs out
  → supabase.auth.signOut()
  → if isNativePlatform(): nativeAuth.logout() → Capgo plugin clears native Google account picker cache
```
Without this, next Google tap silently reuses the same account. Problematic on shared devices.

### Flow J — Cross-device PKCE failure (handled in Flow D)

Same-device-only constraint from Supabase PKCE. Signup on desktop + email on phone → exchange fails with "code verifier not found". Friendly recovery: "Send new link to this device" button.

**Invariants across all flows:**
- Web bundle never imports Capacitor plugin symbols (dynamic import inside `nativeAuth.js`, gated on `isNativePlatform()`)
- No auth state lives outside `supabase.auth.*` — `onAuthStateChange` is single source of truth
- Bridge is the only module knowing plugin identity
- Apple refresh tokens never reach the client after exchange
- Deletion is never blocked by Apple API availability; it's blocked only by failure to durably queue the retry
- Apple sub binding is asserted server-side before persisting tokens

---

## Error handling

### Canonical top-level client codes (UI-facing)

| Code | Meaning | UI behavior |
|---|---|---|
| `AUTH_USER_CANCELLED` | User dismissed native sheet | Silent, no toast. Modal stays open. |
| `AUTH_NETWORK` | Transient network failure | Retry button, "Check your connection" |
| `AUTH_RATE_LIMITED` | 429 from Apple/Google/Supabase | "Too many attempts. Please wait a moment and try again." |
| `AUTH_CONFIG` | Deterministic misconfig | "Sign in unavailable — try email for now." Disable the offending button. |
| `AUTH_SECURITY` | Nonce mismatch, invalid token, audience mismatch, apple sub mismatch | Generic "Sign in failed — please try again." Never leak specifics. |
| `AUTH_UNKNOWN` | Catch-all | Generic copy + Sentry event. |

### Internal subcodes (telemetry only)

- `apple_invalid_client`, `apple_invalid_grant`, `apple_rate_limited`, `apple_unavailable`, `apple_sub_mismatch`
- `google_plugin_init_failed`, `google_sdk_missing_clientid`
- `supabase_provider_disabled`, `supabase_rate_limited`, `supabase_auth_500`
- `nonce_mismatch`, `token_audience_mismatch`, `id_token_invalid`

Errors carry `{ code: <top-level>, subcode: <fine-grained>, cause?: string }`. UI reads `code`; Sentry/PostHog read `subcode`.

### Error shape

**Client bridge (`nativeAuth.js`):** throws `{ code, subcode?, cause? }` — no plugin-native objects escape.

**API layer (`authApi.js`):** catches bridge + Supabase errors, wraps with `createClassifiedError()` per CLAUDE.md §1.2. Returns `{ success: false, cancelled: true, code: 'AUTH_USER_CANCELLED' }` on cancel (does not throw). Throws classified error otherwise.

**UI layer:** reads `error.message` via `getUserMessage(error, 'signing in')`. Never renders raw error objects (CLAUDE.md §1.2).

**Edge Function response:** proper HTTP status code + flat JSON body `{ ok: true } | { ok: false, code, message, transient, subcode? }`.

| Status | Meaning |
|---|---|
| 200 | Success |
| 400 | Malformed request body |
| 401 | JWT missing or invalid (client should sign out) |
| 403 | Apple sub mismatch (security — never retry) |
| 409 | Narrow idempotency conflict (same-event duplicate submission) |
| 422 | Apple rejected the code (expired, already used) |
| 429 | Rate limited (Apple or Supabase) |
| 500 | Server bug, Vault unreachable (and ciphertext cannot be queued), misconfig |
| 502 | Apple endpoint 5xx / timeout — transient |

### Specific error mapping

**`apple-token-exchange`:**
- Apple `invalid_grant` → `422 { code: 'APPLE_CODE_INVALID', subcode: 'apple_invalid_grant', transient: false }`. Client logs, moves on. Flow H heals next sign-in.
- Apple `invalid_client` / `unauthorized_client` → `500 { code: 'APPLE_CONFIG', subcode: 'apple_invalid_client', transient: false }` + Sentry page.
- Apple 5xx / timeout → `502 { code: 'APPLE_UNAVAILABLE', subcode: 'apple_unavailable', transient: true }`. Client logs, doesn't block login.
- Apple sub mismatch → `403 { code: 'AUTH_SECURITY', subcode: 'apple_sub_mismatch' }` + Sentry (hashed user_id, never raw sub).
- JWT `getClaims()` fails → `401`. Client forces sign-out.
- Vault inaccessible AND row cannot be persisted as queue ciphertext → `500`.

**`delete-account`:**
- Queue insert fails → `500 { code: 'DELETE_QUEUE_FAILED', transient: true }`. **No cascade.** User sees retry copy.
- Revoke inline fails → still returns `200`. Cron owns it.
- Vault inaccessible: if queue insert succeeded with raw ciphertext, return `200` (cron decrypts later when Vault recovers). If queue insert itself can't persist retryable material, return `500`.

**`apple-revocation-retry`:**
- Apple `invalid_grant` on retry → `dead_letter = true` immediately (not transient). Sentry event once.
- Apple 5xx/timeout → `attempts += 1`, schedule next retry per backoff.

### Observability

- `AUTH_CONFIG` + `AUTH_SECURITY` errors → Sentry breadcrumb of provider + subcode.
- `apple-token-exchange` failures tagged with **hashed** user_id and subcode. **Never `apple_sub`, `authorizationCode`, `accessToken`, `refresh_token`, or `idToken` in breadcrumbs.**
- Per-session in-memory counter (not localStorage) for client-side network errors — fire one Sentry event after N ≥ 3 same-class failures.
- `pending_apple_revocations` rows transitioning to `dead_letter = true` emit single Sentry event + PostHog `apple_revoke_failed_final`.

**PostHog events:**
- `login_started` (existing), `login_succeeded` (existing), `login_failed` (existing)
- `apple_token_exchanged`, `apple_token_persisted`, `apple_token_exchange_failed`
- `apple_revoke_queued`, `apple_revoke_succeeded`, `apple_revoke_failed_final`
- `auth_cancelled`

### Explicit non-goals

- No automatic retry on security errors. Nonce mismatch or invalid token = refuse.
- No client-side retry on Apple endpoint failures. Flow G owns that.
- No generic "something went wrong" popups. Every surfaced error either has actionable copy or sends the user to a working alternative (email).
- No Sentry breadcrumbs containing provider tokens, auth codes, or raw Apple identifiers. Forbidden list enforced via negative tests.

---

## Testing

### Unit tests (Vitest)

**`src/utils/nonce.test.js`** — `generateNonce()` format + uniqueness; `sha256()` matches RFC 6234 test vector.

**`src/lib/nativeAuth.test.js`** (mock Capgo plugin) — Google/Apple success contracts; cancel → `AUTH_USER_CANCELLED`; network → `AUTH_NETWORK`; plugin init failure → `AUTH_CONFIG`; unknown → `AUTH_UNKNOWN`. Runtime validator asserts output/error shape conforms to strict allowed-keys schema. No plugin-native object escapes (boundary test).

**`src/lib/authUrl.test.js`** — recovery/confirm/magiclink types; non-auth URL → `null`; malformed → `null` (no throw); missing code → `null`.

**`src/api/authApi.test.js`** (mock supabase + nativeAuth) — web Google/Apple → `signInWithOAuth`; native Google → bridge then `signInWithIdToken` with `token` + `access_token`; native Apple first sign-in → `signInWithIdToken` then exchange invoked, `persistFirstSignInName` fires independently; native Apple returning → exchange OK (idempotent); `signInWithIdToken` failure → abort, no exchange; cancel returns structured result.

### Integration tests (Vitest + Supabase test harness, mocked Apple/Google endpoints)

**`apple-token-exchange`:** happy path; missing/invalid JWT → 401; token already exists + fresh code → UPDATE; duplicate submission within window → 409; Apple `invalid_grant` → 422; Apple `invalid_client` → 500 + Sentry; Apple 500 → 502 (transient); **Apple sub mismatch → 403 (security binding, critical)**; Vault unavailable → 500 when ciphertext cannot be persisted; JWT signing failure → 500; **client-supplied `apple_sub` in body is ignored** (derived server-side only).

**`delete-account`:** non-Apple user → cascade only; Apple user + Apple 200 → pending inserted → revoke ok → pending deleted → cascade; Apple user + Apple 500 → pending survives → cascade still completes; Apple user + queue insert fails → 500, NO cascade; Apple user + Vault unavailable with queue OK → cascade proceeds (cron handles decrypt later); linked Google + Apple identities → pending for Apple side, both cleared.

**`apple-revocation-retry`:** no pending → no-op; Apple 200 → row deleted, PostHog; Apple 5xx → `attempts += 1`, `next_attempt_at` per backoff; Apple `invalid_grant` → `dead_letter = true` immediately; past MAX_ATTEMPTS → `dead_letter`, Sentry once; `next_attempt_at > NOW()` skipped.

### E2E tests (Playwright, staging on `whatsgoodhere.app`)

**PR CI runs mocked provider callbacks**, not real Google/Apple (brittle, rate-limited). Real providers run on staging and real-device smoke only.

- Web Google happy path (stubbed callback, Supabase service-role-created session)
- Web Apple happy path (same pattern)
- Password reset: request → follow mock email → land on reset page with valid session → sign in succeeds
- **Cross-context PKCE failure:** start flow in one browser context, open callback URL in fresh clean context (no verifier) → friendly failure UI appears with "Send new link" affordance. Tests the real failure mode, not true cross-device.
- Account deletion: full flow, verify `auth.users` row deleted, `profiles` cascaded, `pending_apple_revocations` empty or present as expected.

### Real-device smoke (pre-TestFlight gate, 60–90 min total)

Manual on real iPhone. Two passes:

**Auth pass (~30 min):**
- Native Google fresh, signed out
- Native Google after sign-out (account picker works — doesn't auto-pick)
- Native Apple first-time: name captured, display_name populated
- Native Apple returning: server logs show single exchange OR 409 on second
- Apple with Hide My Email: sign-in succeeds, relay email in profile, auth emails arrive
- Sign out → next Google tap shows account picker, not auto-pick
- Background → foreground: session stays valid after 30 min

**Account + email + backend pass (~30–60 min):**
- Password reset: request in app → open email in iOS Mail → tap link → app opens (not Safari) → reset → sign in
- Email confirmation: new sign-up, same iOS Mail flow
- Account deletion on Apple user (online): via direct DB, verify `pending_apple_revocations` empty after
- Account deletion on Apple user (offline — airplane mode mid-delete): verify `pending_apple_revocations` row present with `attempts = 0`
- Airplane mode during sign-in → clear network error UI, retry button works

Backend visibility: direct Supabase SQL Editor. No dev-only public endpoints.

### Security tests

**Automated:**
- Nonce mismatch rejects session (mock Supabase returning nonce-mismatch, verify generic security copy in UI).
- `user_apple_tokens` RLS: authenticated role SELECT returns zero rows.
- `pending_apple_revocations` RLS: authenticated role SELECT returns zero rows.
- `apple-token-exchange` without Bearer JWT → 401.
- **Apple sub binding test:** mock Apple response with mismatched `sub` → 403, no row written.
- Negative observability: mock Sentry transport, trigger error paths, inspect fully serialized event payload, assert **none** of `apple_sub` / `authorizationCode` / `accessToken` / `refresh_token` / `idToken` / Bearer tokens / JWT-shaped regex appear. Run both client and server.

**Manual (one-time pre-launch):**
- Network capture during native Apple sign-in — verify `authorization_code` goes only to our `apple-token-exchange` endpoint over HTTPS.
- Vault key rotation: rotate, verify old `pending_apple_revocations` rows decrypt via `key_version` lookup, verify new writes use new key. CI covers via fake crypto adapter with seeded multi-version keys; staging does one real E2E rotation per quarter.

### AASA validation in CI

- Fetch `https://whatsgoodhere.app/.well-known/apple-app-site-association`
- Assert: 200 status, no redirects, `Content-Type: application/json`, valid JSON, schema includes `applinks` with appID `TEAMID.com.whatsgoodhere.app`, paths array non-empty
- Real universal-link behavior validated on-device during smoke

### Rollout gates

**Before TestFlight upload:**
- Unit + integration + E2E in CI passing
- Real-device smoke fully green
- `whatsgoodhere.app` resolves with valid Let's Encrypt cert
- AASA file CI check passes
- Apple Dev verification complete, SIWA capability enabled in App ID
- Privacy manifest audit passed (Capgo plugin declares data collection)

**Before App Store submission:**
- All the above, plus:
- One round of TestFlight internal testing (min 3 days)
- Security test suite green on latest main
- Key rotation dry-run successful in staging

### Explicit non-goals

- Real Apple/Google endpoints in CI (mock only — rate-limited, flaky).
- Capgo plugin internals (test the contract, not the implementation).
- Simulator Apple Sign-In (documented flaky — real-device only).

---

## Rollout

### Phase 1 — Prerequisites (Dan-external, parallelizable)

- Apple Developer account verification completes (external, waiting on Apple)
- Apple Dev portal: App ID with SIWA capability, Services ID with `whatsgoodhere.app` associated domain, .p8 key generated
- Google Cloud Console: iOS client ID for bundle `com.whatsgoodhere.app`
- Vercel: point `whatsgoodhere.app` DNS at Vercel, provision cert

### Phase 2 — Web PKCE migration (ship alone, low-risk)

- `flowType: 'pkce'` in supabase.js
- Rework `Login.jsx` hash → code handling + intent-preservation bug fix
- Transitional fallback for legacy `#access_token` URLs
- Fix `WelcomeModal` silent-error bug + open condition
- Deploy, verify email confirmation and password reset still work on web

### Phase 3 — Native auth + exchange + revocation (main ship)

- Install `@capgo/capacitor-social-login`, `@capacitor/app`
- Build `nativeAuth.js`, `nonce.js`, `authUrl.js`, `AuthLifecycle.jsx`
- Supabase migrations: `user_apple_tokens`, `pending_apple_revocations`
- `_shared/apple.ts` + `apple-token-exchange` + `apple-revocation-retry` Edge Functions
- Extend `delete-account` with mandatory queue + revocation
- Supabase Vault config (`.p8`, keys)
- Supabase Auth → Providers → Apple enabled
- Xcode: SIWA + Associated Domains capabilities
- `pg_cron` schedule for `apple-revocation-retry`
- AASA file shipped in same PR as DNS wiring
- Unit + integration + E2E green in CI
- Real-device smoke green
- Merge, deploy to staging, TestFlight upload

### Phase 4 — TestFlight + App Store submission

- Internal testers for 3 days minimum
- Address any feedback
- Final security suite + key rotation drill
- Submit to App Store review

### Rollback

- **Web PKCE issues post-deploy:** revert `flowType: 'pkce'`. Email links break for one day while migration queues; hash-mode resumes.
- **Native Google issues in TestFlight:** feature-flag hide Google button on native (keeps Apple + email working). Ship patch.
- **Apple SIWA issues in TestFlight:** must NOT hide Apple button if Google is shown (Apple 4.8). If Apple is unshippable, hide both Google and Apple → email-only until fix.
- **`pending_apple_revocations` backlog grows:** temporarily run cron more aggressively (every 5 min). Dead-letter triage via direct SQL.

---

## Risks

| Risk | Mitigation |
|---|---|
| Apple Dev verification delayed | Web PKCE migration is independent — ships alone. Native work stays in a branch. |
| Capgo plugin abandoned | Thin-bridge design means one-file swap. Reassess quarterly. |
| Apple key/cert rotation mishandled | `key_version` column + tested rotation path. Staging drill quarterly. |
| Private-relay users create duplicate accounts | Documented limitation. Manual account-link UI is post-launch. |
| PKCE cross-device email flow confuses users | Friendly error + "Send new link here" affordance. Telemetry on failure rate post-launch. |
| Apple sub binding check too strict (edge case where stored sub differs) | Fail loudly with Sentry, investigate per-case. Don't silently accept mismatch. |
| `apple-token-exchange` fails after session set | Flow H self-heals on next sign-in. Non-blocking. |
| Vault outage during delete | Queue stores opaque ciphertext, cron decrypts when Vault recovers. Delete proceeds. |
| Universal link collision with existing paths | AASA `paths` array is explicit — only `/auth/*` subtree claims. |
| Apple CDN caches old AASA | Apple documentation (TN3155) has debugging guidance; test on-device after changes. |
| Google SDK privacy manifest requirements change | Audit after plugin install; override `PrivacyInfo.xcprivacy` if needed. |
| Codex knowledge cutoff misses a 2026 change | Multiple review rounds + sources cited for every claim. |

---

## Dependencies

**Blocks:**
- TestFlight build
- App Store submission
- Resuming H2 plan (superseded in part by this spec)

**Blocked by:**
- Apple Developer account verification (external, waiting)
- `whatsgoodhere.app` DNS → Vercel (Dan, ~15 min)
- Google Cloud Console iOS client ID (Dan, one-time)

**Related:**
- L1 Privacy + Terms copy updates (coordinate with this spec)
- Virtual business address decision (`project_business_address` memory) — independent, not blocked by this
- Google Places TOS deferrals (`project_google_places_compliance`) — independent, not blocked by this

---

## Estimates

| Area | Hours |
|---|---|
| Apple Developer + Google Cloud + Vercel config (Dan) | 2–3 |
| Web PKCE migration (Phase 2) | 3–5 |
| Bridge + native auth wiring | 6–10 |
| `user_apple_tokens` + `_shared/apple.ts` + `apple-token-exchange` | 8–12 |
| `delete-account` extension + `pending_apple_revocations` + cron | 6–10 |
| Supabase Vault setup | 1–2 |
| Xcode capabilities + AASA + Info.plist | 2–3 |
| WelcomeModal + Privacy/Terms copy | 1–2 |
| Unit + integration tests | 6–10 |
| E2E + security tests | 4–6 |
| Real-device smoke execution | 1–2 |

**Total: 40–65 hours.**

Against 2026-04-30 TestFlight checkpoint (10 days): tight but achievable if Phase 2 ships in parallel with Phase 1 external work. Against 2026-05-12 submission target: comfortable with room for TestFlight iteration.

---

## Revision log

**2026-04-20 v1:** Drafted. Four pressure-test rounds with Codex gpt-5.4/high integrated. Corrections incorporated:
- Architecture: replaced archived `@codetrix-studio/capacitor-google-auth` with `@capgo/capacitor-social-login` (covers both providers); moved auth lifecycle listeners out of `App.jsx` into `AuthLifecycle`; added `authUrl.js` parser; added `_shared/apple.ts` server helper; dropped `APPLE_SERVICES_ID` from client constants; deferred AASA until DNS wired.
- Flows: made Apple code-exchange idempotent (not first-time-only); removed client-supplied `apple_sub`; made PKCE same-device limitation explicit with recovery UX; made delete-account queue insert mandatory; added Flow H (later sign-in healing) and Flow I (provider logout); tightened retry cadence from daily to aggressive-then-decaying.
- Errors: added `AUTH_RATE_LIMITED`; separated top-level UI codes from internal subcodes; Apple 4xx is NOT transient; Vault outage doesn't block delete if ciphertext queue-able; explicit forbidden-in-Sentry list.
- Tests: moved real provider OAuth out of PR CI to staging/manual; added Apple sub binding security test; changed 409 TOKEN_EXISTS to UPDATE semantics; expanded device smoke to 60–90min; added negative observability tests; AASA validated in CI.
- Missed earlier and added: server-side Apple sub binding before persistence (prevents stolen-code attack).
