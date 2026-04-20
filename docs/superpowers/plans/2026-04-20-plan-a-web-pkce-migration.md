# Plan A — Web PKCE Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Supabase web auth flow from implicit to PKCE so OAuth callbacks and email links use `?code=...` exchanges instead of `#access_token=...` URL fragments.

**Architecture:** Set `flowType: 'pkce'` on the Supabase client. Keep `detectSessionInUrl: true` so Supabase auto-exchanges the code on both `/login` and `/reset-password` entry points. Adjust the one place in `Login.jsx` that sniffs `window.location.hash` for `type=signup` — under PKCE, `type` arrives as a query param, not a hash fragment. Ship behind no feature flag; it is a near-drop-in change with transparent fallback (Supabase handles legacy `#access_token=` URLs during the transition window).

**Tech Stack:** React 19, Vite 7, Supabase JS v2, Vitest, Playwright (existing).

**Spec reference:** `docs/superpowers/specs/2026-04-20-oauth-native-and-apple-revocation-design.md` — Phase 2 (Web PKCE migration). Part 1 of 3; Plans B (server Apple infra) and C (native + universal links) follow.

**Branch:** `feat/plan-a-pkce-migration`

---

### Task 1: Create feature branch

**Files:**
- No code changes. Git only.

- [ ] **Step 1: Verify current branch is main and up to date**

Run:
```bash
git branch --show-current && git status --short
```
Expected:
```
main
```
(no uncommitted changes besides already-tracked `.gitignore` if present). If not on main, STOP and ask Dan.

- [ ] **Step 2: Create and switch to feature branch**

Run:
```bash
git checkout -b feat/plan-a-pkce-migration
```
Expected: `Switched to a new branch 'feat/plan-a-pkce-migration'`

- [ ] **Step 3: Verify clean branch state**

Run:
```bash
git branch --show-current
```
Expected: `feat/plan-a-pkce-migration`

---

### Task 2: Add `flowType: 'pkce'` to Supabase client

**Files:**
- Modify: `src/lib/supabase.js:30-38`

- [ ] **Step 1: Read current Supabase client config**

The file currently looks like this (lines 27-39):
```js
export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      persistSession: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      storageKey: 'whats-good-here-auth',
      autoRefreshToken: true,
      detectSessionInUrl: true,
    }
  }
)
```

- [ ] **Step 2: Add `flowType: 'pkce'` to the auth config**

Use Edit to change:
```js
      autoRefreshToken: true,
      detectSessionInUrl: true,
    }
```
to:
```js
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    }
```

- [ ] **Step 3: Verify the file compiles**

Run:
```bash
npx eslint src/lib/supabase.js
```
Expected: no errors.

- [ ] **Step 4: Commit**

Run:
```bash
git add src/lib/supabase.js
git commit -m "feat(auth): migrate Supabase web flow to PKCE

flowType: 'pkce' on the client. detectSessionInUrl: true stays on so
Supabase auto-exchanges ?code= on /login and /reset-password. No
manual exchangeCodeForSession in page components.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
Expected: commit succeeds.

---

### Task 3: Extract post-confirmation URL check to a testable helper

**Files:**
- Create: `src/utils/authUrlType.js`
- Create: `src/utils/authUrlType.test.js`

`Login.jsx:21` currently does `window.location.hash.includes('type=signup')`. Under PKCE, `type` arrives as a query param. We want a single helper that reads both hash and query so the detection works during the transition period and going forward.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/authUrlType.test.js` with:
```js
import { describe, it, expect } from 'vitest'
import { getAuthUrlType } from './authUrlType'

describe('getAuthUrlType', () => {
  it('returns null for a plain URL', () => {
    expect(getAuthUrlType('https://app.example/login')).toBe(null)
  })

  it('returns the type from a query param (PKCE)', () => {
    expect(getAuthUrlType('https://app.example/login?code=abc&type=signup')).toBe('signup')
    expect(getAuthUrlType('https://app.example/login?type=email&code=abc')).toBe('email')
    expect(getAuthUrlType('https://app.example/reset-password?code=abc&type=recovery')).toBe('recovery')
  })

  it('returns the type from a hash fragment (legacy implicit)', () => {
    expect(getAuthUrlType('https://app.example/login#access_token=xxx&type=signup')).toBe('signup')
    expect(getAuthUrlType('https://app.example/login#type=email&access_token=xxx')).toBe('email')
  })

  it('prefers query over hash if both present', () => {
    expect(getAuthUrlType('https://app.example/login?type=signup#type=email')).toBe('signup')
  })

  it('returns null for malformed URLs (no throw)', () => {
    expect(getAuthUrlType('not a url')).toBe(null)
    expect(getAuthUrlType('')).toBe(null)
    expect(getAuthUrlType(null)).toBe(null)
  })

  it('returns null for unrecognized type values', () => {
    // We only care about signup/email/recovery/magiclink
    expect(getAuthUrlType('https://app.example/login?type=unknown')).toBe(null)
  })

  it('recognizes magiclink type', () => {
    expect(getAuthUrlType('https://app.example/login?code=xxx&type=magiclink')).toBe('magiclink')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
npx vitest run src/utils/authUrlType.test.js
```
Expected: FAIL with "Cannot find module './authUrlType'" or similar.

- [ ] **Step 3: Write the minimal implementation**

Create `src/utils/authUrlType.js`:
```js
const KNOWN_TYPES = new Set(['signup', 'email', 'recovery', 'magiclink'])

/**
 * Extracts Supabase auth URL type ('signup' | 'email' | 'recovery' | 'magiclink')
 * from either the query string (PKCE) or the hash fragment (legacy implicit).
 * Returns null if no recognized type is present or the URL is malformed.
 */
export function getAuthUrlType(urlString) {
  if (!urlString || typeof urlString !== 'string') return null
  let url
  try {
    url = new URL(urlString)
  } catch {
    return null
  }

  const queryType = url.searchParams.get('type')
  if (queryType && KNOWN_TYPES.has(queryType)) return queryType

  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  const hashParams = new URLSearchParams(hash)
  const hashType = hashParams.get('type')
  if (hashType && KNOWN_TYPES.has(hashType)) return hashType

  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
npx vitest run src/utils/authUrlType.test.js
```
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/utils/authUrlType.js src/utils/authUrlType.test.js
git commit -m "feat(auth): add getAuthUrlType helper for PKCE + legacy detection

Reads Supabase auth type param from both ?type= (PKCE) and
#type= (legacy implicit). Known types: signup, email, recovery,
magiclink. Returns null for anything else, including malformed URLs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
Expected: commit succeeds.

---

### Task 4: Use `getAuthUrlType` in Login.jsx

**Files:**
- Modify: `src/pages/Login.jsx:1-26`

- [ ] **Step 1: Read current state**

The current lines 1-26 of `src/pages/Login.jsx` look like:
```jsx
import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { authApi } from '../api/authApi'
import { useAuth } from '../context/AuthContext'
import { logger } from '../utils/logger'
import { CameraIcon } from '../components/CameraIcon'
import { SmileyPin } from '../components/SmileyPin'
import { FEATURES } from '../constants/features'

// SECURITY: Email is NOT persisted to storage to prevent XSS exposure of PII

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  // If user arrives with confirmation hash params, go straight to sign-in
  const isPostConfirmation = window.location.hash.includes('type=signup') || window.location.hash.includes('type=email')
  const [message, setMessage] = useState(
    isPostConfirmation ? { type: 'success', text: 'Email verified! Sign in to get started.' } : null
  )
  const [showLogin, setShowLogin] = useState(isPostConfirmation) // Controls welcome vs login view
  const [mode, setMode] = useState(isPostConfirmation ? 'signin' : 'options') // 'options' | 'signin' | 'signup' | 'forgot'
```

- [ ] **Step 2: Add the import**

Use Edit to change:
```jsx
import { FEATURES } from '../constants/features'
```
to:
```jsx
import { FEATURES } from '../constants/features'
import { getAuthUrlType } from '../utils/authUrlType'
```

- [ ] **Step 3: Replace the hash-only check with the helper**

Use Edit to change:
```jsx
  // If user arrives with confirmation hash params, go straight to sign-in
  const isPostConfirmation = window.location.hash.includes('type=signup') || window.location.hash.includes('type=email')
```
to:
```jsx
  // If user arrives with confirmation params (PKCE query or legacy hash), go straight to sign-in
  const authUrlType = getAuthUrlType(window.location.href)
  const isPostConfirmation = authUrlType === 'signup' || authUrlType === 'email'
```

- [ ] **Step 4: Verify eslint passes**

Run:
```bash
npx eslint src/pages/Login.jsx
```
Expected: no errors.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/pages/Login.jsx
git commit -m "fix(auth): detect post-confirmation type from query OR hash

Under PKCE, Supabase email-confirmation links put type= in the query
string (?type=signup) instead of the hash fragment. Swap the hash-only
check in Login.jsx for getAuthUrlType, which handles both shapes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
Expected: commit succeeds.

---

### Task 5: Full test + build verification

**Files:**
- No changes.

- [ ] **Step 1: Run the full unit test suite**

Run:
```bash
npm run test -- --run
```
Expected: all tests PASS. If any fail, investigate — a regression from the PKCE change is possible if another test mocks `window.location.hash` directly.

- [ ] **Step 2: Run lint on the full src tree**

Run:
```bash
npm run lint
```
Expected: no errors (warnings OK if pre-existing).

- [ ] **Step 3: Run production build**

Run:
```bash
npm run build
```
Expected: build succeeds with no errors. No ES2023+ methods in output (project rule per CLAUDE.md §1.1).

- [ ] **Step 4: If all three green, nothing to commit — proceed to Task 6**

No commit needed — this task only verifies.

---

### Task 6: Manual smoke on dev server

**Files:**
- No changes.

This is a manual verification step. Must pass before opening the PR.

- [ ] **Step 1: Start the dev server**

Run (in a separate terminal, keep it running for the rest of this task):
```bash
npm run dev
```
Expected: Vite dev server on `http://localhost:5173`.

- [ ] **Step 2: Smoke — existing email/password sign-in still works**

1. Open `http://localhost:5173/login`
2. Sign in with an existing email/password test account from `SMOKE-TEST.md`
3. Expected: lands on home, `useAuth()` user is populated.
4. Sign out.

- [ ] **Step 3: Smoke — Google OAuth still works on web (no PKCE regression)**

1. Open `http://localhost:5173/login`
2. Click "Continue with Google"
3. Complete Google auth
4. Expected: returns to the app, signed in. URL no longer contains `?code=...` after Supabase has exchanged it.

- [ ] **Step 4: Smoke — password reset end-to-end**

1. In the app, trigger "Forgot password?" for a test account
2. Open the email (inbox or Supabase dashboard → Logs → Auth)
3. Click the reset link
4. Expected: lands on `/reset-password` with a valid recovery session; "Set new password" form is visible (not the "invalid or expired" error)
5. Set a new password, sign in with it. Expected: works.

- [ ] **Step 5: Smoke — email confirmation success message still shows**

This verifies the `getAuthUrlType` helper is working in production shape.

1. Sign up a new test account with a real inbox you can access.
2. Click the email confirmation link.
3. Expected: lands on `/login` with a green success banner "Email verified! Sign in to get started." and the form pre-switched to sign-in mode.
4. If the URL is `...?code=xxx&type=signup` or `...#type=signup&access_token=xxx`, the helper must detect either shape.

- [ ] **Step 6: No commit — if all four smoke steps pass, move to Task 7**

If any step fails, investigate and fix before proceeding. Likely culprits: Supabase redirect URL allow-list missing `localhost:5173`, or Supabase email template stale.

---

### Task 7: Open pull request

**Files:**
- No code changes. Git/GitHub only.

- [ ] **Step 1: Push the branch**

Run:
```bash
git push -u origin feat/plan-a-pkce-migration
```
Expected: new branch on origin, PR link printed.

- [ ] **Step 2: Create the PR**

Run:
```bash
gh pr create --title "feat(auth): migrate web flow to PKCE (Plan A)" --body "$(cat <<'EOF'
## Summary
- Sets \`flowType: 'pkce'\` on the Supabase web client.
- \`detectSessionInUrl: true\` stays on so Supabase auto-exchanges \`?code=\` on \`/login\` and \`/reset-password\` entry points. No manual \`exchangeCodeForSession\` in page components.
- New \`src/utils/authUrlType.js\` reads Supabase auth type param from both \`?type=\` (PKCE) and \`#type=\` (legacy implicit). \`Login.jsx\` uses it in place of the hash-only check for post-confirmation detection.

## Why
First of three plans implementing the OAuth-on-native-iOS + Apple-token-revocation design (spec: \`docs/superpowers/specs/2026-04-20-oauth-native-and-apple-revocation-design.md\`). Plan A is the web-side security upgrade that unblocks Plans B + C. PKCE is the 2026 industry default and removes tokens-in-URL-fragment risk.

## Test plan
- [x] Unit: \`src/utils/authUrlType.test.js\` — 7 tests, covers PKCE query, legacy hash, both, malformed, unknown types, magiclink
- [x] \`npm run test\` passes
- [x] \`npm run lint\` passes
- [x] \`npm run build\` passes (no ES2023+ regressions)
- [x] Manual smoke on localhost:5173:
  - [x] Existing email/password sign-in still works
  - [x] Google OAuth still works (no PKCE regression)
  - [x] Password reset end-to-end lands on valid recovery session
  - [x] Email confirmation success banner still shows on \`/login\` with both PKCE query and legacy hash shapes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR created, URL printed.

- [ ] **Step 3: Report the PR URL back to Dan**

Share the PR URL so Dan can review and merge.

---

## Out of scope for Plan A

Intentionally deferred to later plans in the series:
- **Plan B** — Apple server infrastructure (Edge Functions, migrations, retry cron)
- **Plan C** — Native Capacitor wiring, universal links, AASA, iOS capabilities, AuthLifecycle, apple-token-persist client wiring

Already shipped and NOT in Plan A:
- `WelcomeModal.jsx` open condition + silent-error fix (already merged, verified at `src/components/Auth/WelcomeModal.jsx:60` and `src/components/Auth/WelcomeModal.jsx:80-85`)
- `Login.jsx` OAuth redirect `location.state?.from` serialization (already correct at `src/pages/Login.jsx:72-80`)

## Rollback

If PKCE migration breaks email confirmation or password reset post-merge:
1. Revert the merge commit: `git revert -m 1 <merge_sha>`
2. Investigate via Supabase Auth logs which URL shape the email is actually delivering.
3. If the issue is limited to one URL shape, extend `getAuthUrlType` test coverage and re-land.
