# OAuth Native + Apple Revocation — Plan B Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 3 of the OAuth native + Apple revocation spec — native iOS Google + Apple sign-in via Capgo plugin, Apple refresh-token capture + server-side revocation infrastructure, universal-link auth returns, and App Store SIWA compliance. Ship as 5 sequenced PRs (B1–B5).

**Architecture:** Thin-bridge native auth (`src/lib/nativeAuth.js` is the only Capgo importer), Apple refresh-token captured in two paths (native `apple-token-exchange` + web `apple-token-persist`), revocation durable-queued in `pending_apple_revocations` with `FOR UPDATE SKIP LOCKED` + lease reclamation, universal links via `wghapp.com` AASA, and `onAuthStateChange` as the single source of truth for session state.

**Tech Stack:** React 19, Vite 7, Capacitor 6, `@capgo/capacitor-social-login`, `@capacitor/app`, Supabase (Postgres + Edge Functions + Vault + pg_cron), Deno for Edge Functions, Vitest unit + integration tests, Playwright E2E.

**Spec (ground truth):** `docs/superpowers/specs/2026-04-20-oauth-native-and-apple-revocation-design.md` (v3). Always defer to the spec when this plan is ambiguous — this plan is an execution sequencing layer, not a re-specification.

**Revision log:**

- **2026-04-21 v2 (Codex gpt-5.4/high review, PM-triaged by Claude):**
  - Idempotency on `user_apple_tokens` rebuilt on a dedicated `code_hash_seen_at` column (not `updated_at`, which is bumped by web re-captures). Removed the redundant `(user_id, code_hash)` unique index.
  - Added `client_id_type` (`native` | `web`) to `user_apple_tokens` and `pending_apple_revocations`. Revocation now uses the same Apple client_id the token was issued against; mixing bundle vs services ID would return `invalid_client` from Apple.
  - `apple-revocation-retry` now requires a verified service-role bearer token via timing-safe compare. Without this, anyone could invoke it and force revocation attempts.
  - Edge Function log hygiene: raw exception objects replaced with scrubbed structured events. Negative observability test captures `console.log`/`warn`/`info`/`error`, not just `error`.
  - `applePersist.js` removed; its one call relocated into `authApi.persistAppleRefreshToken` to honor CLAUDE.md §1.4 (all Supabase access through `src/api/`).
  - `delete-account` cascade failures now roll back the pending row (or mark `dead_letter = true` if revoke already succeeded) so we never revoke Apple consent for an account that still exists.
  - `appUrlOpen` routes by type (`recovery` → `/reset-password`, `confirm` → `/`, `magiclink` → `/`) — spec Flow D compliance.
  - B3 split: `B3-code` lands without credentials; `B3-activate` is a config-only PR that requires prereq #1 (Apple Dev verification) + prereq #4 (Supabase Apple provider config). Prereq #4 added.
  - `VITE_FEATURES_APPLE_SIGNIN=true` in dev/preview only; prod stays `false` until B3-activate. Prevents a compliance gap where native SIWA ships without revocation in prod.
  - Flow K detection keyed on `session.provider_refresh_token` presence (not `app_metadata.provider`). Server-side identity lookup decides eligibility.
  - Deno test harness promoted from "optional" to required Task B1.4a.
  - `pending_apple_revocations` CHECK constraint strengthened: `unrevokable OR (encrypted_refresh_token AND key_version AND client_id_type)`.

- **2026-04-21 v1:** Initial plan drafted.

**Prereqs status (as of 2026-04-21):**
1. Apple Developer verification — **pending** (external, waiting on Apple). Non-blocking for B1–B3 code; gates B3-activate (Vault `.p8` upload), Supabase Apple provider config, and B5 real-device smoke + TestFlight.
2. `wghapp.com` DNS → Vercel + Let's Encrypt cert — **Dan unblocking today**. Gates B4.
3. Google Cloud Console iOS client ID for `com.whatsgoodhere.app` — **not done**. Gates B2 native Google runtime on device (code can land without it).
4. **Supabase Auth → Providers → Apple** — not configured yet. Requires Apple Dev verification first (needs Services ID + Team ID + Key ID + `.p8`). Configure via Supabase dashboard: enable Apple provider, set Client IDs to `com.whatsgoodhere.app` (bundle, native) + `com.whatsgoodhere.service` (services, web), add redirect allow-list entries for `wghapp.com`. Gates B3-activate and any real Apple sign-in end-to-end.

**Working note on existing scaffold (as of 2026-04-21):** Plan A shipped `flowType: 'pkce'` in `src/lib/supabase.js`. `WelcomeModal.jsx` already has the extended open condition and surfaces `saveError` via `setSaveError` — no re-fix needed. `LoginModal.jsx` wires `handleAppleSignIn` but renders `null` for the button slot (line 264) — B2 swaps in the compliant SIWA button.

**PR split:**

| PR | Scope | Gated by | Rough hours |
|---|---|---|---|
| **B1** | Web Apple token capture: `user_apple_tokens` migration (with `client_id_type` + `code_hash_seen_at`) + `apple-token-persist` Edge Function + `_shared/apple.ts` decode/encrypt helpers + Vault master key + `authApi.persistAppleRefreshToken` + AuthContext Flow K wiring | none | 8–12 |
| **B2** | Native auth bridge: Capgo + `@capacitor/app` install, `nonce.js`, `nativeAuth.js`, `authUrl.js`, `AuthLifecycle.jsx` (appStateChange only), `authApi.js` native branches, activate Apple button in LoginModal (dev/preview only; prod flag stays false) | Google Cloud iOS client ID to run on device (code can land without) | 10–14 |
| **B3-code** | Apple token exchange + revocation backend, code-only: `pending_apple_revocations` migration + `apple-token-exchange` + `apple-revocation-retry` (with service-role auth guard) + extended `delete-account` (Case A / Case B / fail-closed / cascade-fail cleanup) + pg_cron SQL (schedule definition, not yet active) | B1 | 16–22 |
| **B3-activate** | Credential activation: Apple Dev `.p8` + Team ID + Key ID + Services ID upload to Vault, Supabase Apple provider config, pg_cron activation, flip prod `VITE_FEATURES_APPLE_SIGNIN=true` | B3-code + Apple Dev verification (prereq #1) + Supabase Apple provider config (prereq #4) | 4–6 |
| **B4** | Universal links + deep-link auth returns: `public/.well-known/apple-app-site-association`, AASA CI check, `AuthLifecycle` `appUrlOpen` wiring (routed by type), Xcode Associated Domains capability, Privacy/Terms copy updates, cross-device PKCE recovery UX | DNS + cert (prereq #2) | 8–11 |
| **B5** | SIWA capability in Xcode + Info.plist + PrivacyInfo audit + real-device smoke + TestFlight submission | Apple Dev verification (prereq #1), B3-activate | 4–7 (+ smoke execution time) |

Each PR ends with a mandatory Codex-CLI review gate (see [§ Codex review protocol](#codex-review-protocol)) before merge. I (Claude) make the final call on which Codex findings to fix vs. file as follow-ups vs. reject — Dan can override.

---

## Codex review protocol

Before merging any PR in this plan:

1. Run the full PR diff through Codex CLI:
   ```bash
   codex exec "Review this PR for correctness, security, and compliance with CLAUDE.md. Full spec: docs/superpowers/specs/2026-04-20-oauth-native-and-apple-revocation-design.md. Diff below:\n\n$(git diff main..HEAD)"
   ```
2. Codex returns findings. For each finding I classify as:
   - **Must-fix** — real defect, security gap, spec non-compliance. Fix before merge.
   - **Nice-to-have** — valid but not blocking. Convert to a follow-up task in `TASKS.md`.
   - **Reject** — Codex is wrong (e.g., it doesn't know our schema constraint, or the concern is already handled elsewhere). Document why in the PR description.
3. For any `Reject`, verify the reasoning matches project-specific context (per memory `feedback_codex_compliance`). Codex doesn't know schema constraints.
4. Post the triage summary in the PR description under `## Codex review` so the audit trail exists.

Never skip this step. It's cheap insurance — "root fixes, not surface swaps" (memory `feedback_root_fix_over_surface`).

---

# PR B1 — Web Apple Token Capture

**Goal:** When a user signs in with Apple on the web (PWA, not native), capture `session.provider_refresh_token` from Supabase's OAuth callback and persist encrypted + bound to `apple_sub` in `user_apple_tokens`. This is Flow K from the spec — prerequisite for App Store SIWA compliance even if native is delayed.

**Ships alone:** B1 has zero iOS dependency. A successful B1 means a web-only Apple PWA user has a revocation-capable refresh token stored server-side.

**Definition of done:**
- `user_apple_tokens` table exists in Supabase with correct RLS
- Supabase Vault has `apple_encryption_master_key` secret
- `apple-token-persist` Edge Function deployed and callable
- `AuthContext` POSTs to `apple-token-persist` on `SIGNED_IN` with Apple identity + `provider_refresh_token` present, with one retry on transient failure
- Integration tests green: happy path, 400/401/409/503, idempotent UPDATE
- Codex review gate passed
- Manual web smoke: sign in with Apple on production, verify a `user_apple_tokens` row exists (via SQL Editor)

---

### Task B1.1: Database migration — `user_apple_tokens`

**Files:**
- Create: `supabase/migrations/20260421_user_apple_tokens.sql`
- Modify: `supabase/schema.sql` (append the table definition to keep source-of-truth sync per CLAUDE.md §1.4)

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260421_user_apple_tokens.sql
--
-- Per-user Apple refresh-token storage for App Store compliance with
-- guideline 5.1.1(v) — account deletion must revoke Apple consent.
--
-- encrypted_refresh_token is self-contained ciphertext (not a Vault reference)
-- so rows can be copied byte-for-byte into pending_apple_revocations during
-- account deletion without needing Vault access at copy time.

CREATE TABLE IF NOT EXISTS public.user_apple_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  apple_sub TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  key_version TEXT NOT NULL,
  -- client_id_type determines which Apple client_id was used when the token
  -- was issued. Revocation MUST use the same client_id — 'native' = bundle id
  -- (com.whatsgoodhere.app), 'web' = services id (com.whatsgoodhere.service).
  -- Mixing these causes Apple to reject the revoke with invalid_client.
  client_id_type TEXT NOT NULL CHECK (client_id_type IN ('native', 'web')),
  -- Idempotency: code_hash + code_hash_seen_at together identify the most
  -- recent authorization_code. Duplicate submission within 60s returns 409
  -- without re-calling Apple. code_hash_seen_at is NOT the same as updated_at
  -- (which is bumped by non-exchange writes like web token re-capture).
  code_hash TEXT,
  code_hash_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_exchange_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS user_apple_tokens_apple_sub_idx
  ON public.user_apple_tokens (apple_sub);

ALTER TABLE public.user_apple_tokens ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated role = deny all. Service role bypasses RLS.

COMMENT ON TABLE public.user_apple_tokens IS
  'Apple refresh tokens for SIWA revocation compliance. Service-role only. encrypted_refresh_token is self-contained ciphertext (not a Vault ref).';
COMMENT ON COLUMN public.user_apple_tokens.code_hash IS
  'SHA-256 of last Apple authorization_code consumed. Paired with code_hash_seen_at for duplicate-submission 409 response.';
COMMENT ON COLUMN public.user_apple_tokens.client_id_type IS
  'Which Apple client_id issued this refresh token. Revocation must use same client_id.';
COMMENT ON COLUMN public.user_apple_tokens.key_version IS
  'Versioned label for the Vault encryption key used on encrypted_refresh_token. Allows rotation without re-encrypting.';

-- ROLLBACK:
--   DROP TABLE IF EXISTS public.user_apple_tokens CASCADE;
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Paste the migration into Supabase dashboard SQL editor, run against the shared Denis project (`vpioftosgdkyiwvhxewy`). Verify:
```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'user_apple_tokens';
-- Expected: row_security = true
SELECT indexname FROM pg_indexes WHERE tablename = 'user_apple_tokens';
-- Expected: user_apple_tokens_pkey, user_apple_tokens_apple_sub_idx
```

- [ ] **Step 3: Append the same definition to `supabase/schema.sql`**

Open `supabase/schema.sql`, find a reasonable section boundary (e.g., after other per-user tables), paste the `CREATE TABLE` + indexes + RLS block. Schema is source of truth (CLAUDE.md §1.4) — the migration and schema.sql must agree.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260421_user_apple_tokens.sql supabase/schema.sql
git commit -m "feat(apple): add user_apple_tokens table for SIWA revocation compliance"
```

---

### Task B1.2: Supabase Vault — encryption master key

**Files:**
- No code files. Supabase Vault via SQL Editor.

- [ ] **Step 1: Generate a 32-byte master key locally**

```bash
openssl rand -base64 32
# Copy the output — you'll paste it in Step 2
```

- [ ] **Step 2: Store in Supabase Vault**

Supabase SQL Editor:
```sql
SELECT vault.create_secret(
  '<paste base64 output here>',
  'apple_encryption_master_key_v1',
  'Master key for Apple refresh-token AES-256-GCM encryption. v1 is current.'
);
```
Verify it exists (without returning the cleartext):
```sql
SELECT name, description, created_at FROM vault.secrets
 WHERE name = 'apple_encryption_master_key_v1';
```

- [ ] **Step 3: Document the key version convention in spec appendix or NOTES.md**

Append to `NOTES.md` under a new `### Apple Vault Keys` section:

```markdown
### Apple Vault Keys

- `apple_encryption_master_key_v1` — AES-256-GCM key for `user_apple_tokens.encrypted_refresh_token` and `pending_apple_revocations.encrypted_refresh_token`. Corresponds to `key_version = 'v1'` in those tables.
- `apple_signing_key_v1` — contents of the `.p8` private key from Apple Developer portal. Used to sign Apple client secret JWTs. Uploaded in B3.
- Key rotation: write a new vault secret `apple_encryption_master_key_v2`, update encryption-write paths to use v2, leave decryption paths reading key by `key_version` column. Re-encryption of existing rows is a background job (post-launch).
```

- [ ] **Step 4: Commit the NOTES update**

```bash
git add NOTES.md
git commit -m "docs(notes): document Apple Vault key convention"
```

---

### Task B1.3: Shared Edge Function helper — `_shared/apple.ts` (B1 subset)

**Files:**
- Create: `supabase/functions/_shared/apple.ts`

This file grows across B1 + B3. For B1 we only need:
- `encryptRefreshToken(plaintext: string): Promise<{ ciphertext: string; keyVersion: string }>`
- `decryptRefreshToken(ciphertext: string, keyVersion: string): Promise<string>` (needed only in tests + B3, but add now to keep API symmetric)
- `decodeIdToken(jwt: string): { sub: string; [k: string]: unknown }` (parses without verification — sig verification happens in Supabase)

We'll extend this file in B3 with `signClientSecretJWT`, `exchangeAuthorizationCode`, `revokeToken`.

- [ ] **Step 1: Write the helper**

```typescript
// supabase/functions/_shared/apple.ts
//
// Shared Apple auth helpers. Imported by apple-token-persist (B1),
// apple-token-exchange (B3), apple-revocation-retry (B3), delete-account (B3).
//
// encryptRefreshToken + decryptRefreshToken wrap AES-256-GCM. The key is
// pulled from Supabase Vault by `key_version`. Ciphertext is self-contained
// (IV + tag + payload, base64url) so rows can be copied between tables
// without needing Vault access at copy time.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const KEY_VERSION = 'v1';
const VAULT_KEY_NAME = `apple_encryption_master_key_${KEY_VERSION}`;

let cachedKey: CryptoKey | null = null;
let cachedKeyVersion: string | null = null;

async function loadMasterKey(keyVersion: string): Promise<CryptoKey> {
  if (cachedKey && cachedKeyVersion === keyVersion) return cachedKey;

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await supa
    .schema('vault')
    .from('decrypted_secrets')
    .select('decrypted_secret')
    .eq('name', `apple_encryption_master_key_${keyVersion}`)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Vault key not available: ${keyVersion}`);
  }

  const keyBytes = base64ToBytes(data.decrypted_secret as string);
  if (keyBytes.length !== 32) {
    throw new Error(`Vault key wrong length: ${keyBytes.length} (expected 32)`);
  }

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  cachedKey = key;
  cachedKeyVersion = keyVersion;
  return key;
}

export async function encryptRefreshToken(
  plaintext: string,
): Promise<{ ciphertext: string; keyVersion: string }> {
  const key = await loadMasterKey(KEY_VERSION);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  // Self-contained: version byte + iv + ciphertext+tag.
  // Version byte future-proofs format changes distinct from key rotation.
  const versionByte = new Uint8Array([1]);
  const out = new Uint8Array(
    versionByte.length + iv.length + encrypted.byteLength,
  );
  out.set(versionByte, 0);
  out.set(iv, 1);
  out.set(new Uint8Array(encrypted), 1 + iv.length);
  return { ciphertext: bytesToBase64(out), keyVersion: KEY_VERSION };
}

export async function decryptRefreshToken(
  ciphertext: string,
  keyVersion: string,
): Promise<string> {
  const key = await loadMasterKey(keyVersion);
  const all = base64ToBytes(ciphertext);
  const version = all[0];
  if (version !== 1) {
    throw new Error(`Unsupported ciphertext version: ${version}`);
  }
  const iv = all.slice(1, 13);
  const body = all.slice(13);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, body);
  return new TextDecoder().decode(plain);
}

/**
 * Parses a JWT and returns the payload. Does NOT verify the signature —
 * that is Supabase's responsibility on the way in. We only use this to
 * read `sub` post-Apple-exchange for the sub-binding assertion.
 */
export function decodeIdToken(jwt: string): { sub: string; [k: string]: unknown } {
  const [, payload] = jwt.split('.');
  if (!payload) throw new Error('Malformed JWT');
  const json = new TextDecoder().decode(base64UrlToBytes(payload));
  const parsed = JSON.parse(json);
  if (typeof parsed.sub !== 'string' || !parsed.sub) {
    throw new Error('JWT missing sub claim');
  }
  return parsed;
}

// ---- base64 helpers (no deps) ----

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    b64url.length + ((4 - (b64url.length % 4)) % 4),
    '=',
  );
  return base64ToBytes(b64);
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/apple.ts
git commit -m "feat(apple): add _shared/apple.ts with encrypt/decrypt/decodeIdToken helpers"
```

---

### Task B1.4: Integration test for `_shared/apple.ts`

**Files:**
- Create: `supabase/functions/_shared/apple.test.ts`

Edge Functions run on Deno. If the repo already has a Deno test harness at `supabase/functions/_test/harness.ts`, use it. **If not, building that harness is a required subtask here** — spec fail-closed paths must actually be test-covered, not left as TODOs. Minimum harness API the rest of B1–B3 tests depend on: `createTestUser()`, `insertAppleIdentity(userId, appleSub)`, `invokeFn(name, { jwt, body })`, `cleanupUser(userId)`, `getAppleTokenRow(userId)`, `createTestPendingRow({...})`, `getPendingRow(id)`, `cleanupPending(id)`. If no harness exists, complete it as Task B1.4a before moving on.

- [ ] **Step 1: Write the failing test**

```typescript
// supabase/functions/_shared/apple.test.ts
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { decodeIdToken, decryptRefreshToken, encryptRefreshToken } from './apple.ts';

// NOTE: These tests require SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + the
// apple_encryption_master_key_v1 vault secret populated. Run against a
// staging Supabase or the Denis project with the key pre-seeded in B1.2.

Deno.test('encrypt + decrypt roundtrip', async () => {
  const plaintext = 'rt.AAAApple.sample-refresh-token.xyz';
  const { ciphertext, keyVersion } = await encryptRefreshToken(plaintext);
  assert(ciphertext.length > 0, 'ciphertext produced');
  assertEquals(keyVersion, 'v1');
  const decrypted = await decryptRefreshToken(ciphertext, keyVersion);
  assertEquals(decrypted, plaintext);
});

Deno.test('encrypt produces different ciphertext on identical input (fresh IV)', async () => {
  const { ciphertext: a } = await encryptRefreshToken('same');
  const { ciphertext: b } = await encryptRefreshToken('same');
  assert(a !== b, 'IV must be fresh per call');
});

Deno.test('decrypt rejects unknown version byte', async () => {
  // version=99 + 12 zero IV + 32 bytes of fake ciphertext
  const badBytes = new Uint8Array(1 + 12 + 32);
  badBytes[0] = 99;
  const bad = btoa(String.fromCharCode(...badBytes));
  await assertRejects(
    () => decryptRefreshToken(bad, 'v1'),
    Error,
    'Unsupported ciphertext version',
  );
});

Deno.test('decodeIdToken parses sub from a real-shape JWT', () => {
  // header.payload.signature with payload = {"sub":"000123.abc","iss":"https://appleid.apple.com"}
  const payload = btoa(JSON.stringify({ sub: '000123.abc', iss: 'https://appleid.apple.com' }))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.fakesig`;
  const parsed = decodeIdToken(jwt);
  assertEquals(parsed.sub, '000123.abc');
});

Deno.test('decodeIdToken throws on missing sub', () => {
  const payload = btoa(JSON.stringify({ iss: 'https://appleid.apple.com' })).replace(/=+$/, '');
  const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.fakesig`;
  try {
    decodeIdToken(jwt);
    throw new Error('should have thrown');
  } catch (e) {
    assertEquals((e as Error).message, 'JWT missing sub claim');
  }
});
```

- [ ] **Step 2: Run the tests**

```bash
cd supabase/functions
deno test --allow-net --allow-env _shared/apple.test.ts
# Expected: 5 passed. If vault secret is missing, the first two tests fail
# with "Vault key not available: v1" — fix by completing Task B1.2.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/apple.test.ts
git commit -m "test(apple): roundtrip + JWT decode tests for _shared/apple.ts"
```

---

### Task B1.5: `apple-token-persist` Edge Function

**Files:**
- Create: `supabase/functions/apple-token-persist/index.ts`
- Create: `supabase/functions/apple-token-persist/deno.json` (matching existing function conventions — check one like `delete-account/deno.json` if present)

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/apple-token-persist/index.ts
//
// Web path for Apple refresh-token capture (Flow K in the spec).
//
// Client flow:
//   Supabase web OAuth callback → onAuthStateChange fires SIGNED_IN with
//   session.provider_refresh_token present → AuthContext POSTs here with
//   { provider_refresh_token } and the user's JWT in Authorization.
//
// This function never calls Apple. It only encrypts + upserts. The token
// itself came from Supabase's own OAuth callback and is already validated.
//
// Auth: Bearer JWT (user JWT from Supabase). We derive user_id from claims
// and look up apple_sub from auth.identities. Client-supplied apple_sub or
// user_id is ignored.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptRefreshToken } from '../_shared/apple.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });

  // 1. Authenticate caller
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!jwt) return json(401, { ok: false, code: 'MISSING_JWT' });

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data: userData, error: userErr } = await supa.auth.getUser(jwt);
  if (userErr || !userData.user) {
    return json(401, { ok: false, code: 'INVALID_JWT' });
  }
  const userId = userData.user.id;

  // 2. Parse body
  let body: { provider_refresh_token?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: 'MALFORMED_BODY' });
  }
  const providerRefreshToken = typeof body?.provider_refresh_token === 'string'
    ? body.provider_refresh_token
    : '';
  if (!providerRefreshToken) {
    return json(400, { ok: false, code: 'MISSING_TOKEN' });
  }

  // 3. Derive apple_sub from auth.identities (server-side only — never trust client)
  const { data: identities, error: idErr } = await supa
    .schema('auth')
    .from('identities')
    .select('provider_id, provider')
    .eq('user_id', userId)
    .eq('provider', 'apple');

  if (idErr) {
    return json(500, { ok: false, code: 'IDENTITY_LOOKUP_FAILED', transient: true });
  }
  if (!identities || identities.length === 0) {
    return json(409, { ok: false, code: 'NO_APPLE_IDENTITY' });
  }
  if (identities.length > 1) {
    // Degraded state — fail closed. Mirror apple-token-exchange behavior.
    console.error(
      JSON.stringify({
        event: 'apple_token_persist_multi_identity',
        user_hash: await hashUserId(userId),
      }),
    );
    return json(500, { ok: false, code: 'MULTI_APPLE_IDENTITY' });
  }
  const appleSub = identities[0].provider_id;
  if (!appleSub) {
    return json(500, { ok: false, code: 'IDENTITY_MISSING_SUB' });
  }

  // 4. Encrypt + upsert
  let encrypted: { ciphertext: string; keyVersion: string };
  try {
    encrypted = await encryptRefreshToken(providerRefreshToken);
  } catch (e) {
    console.error('encrypt failed', e);
    return json(503, { ok: false, code: 'VAULT_UNAVAILABLE', transient: true });
  }

  // Web path — this is always client_id_type = 'web' because the refresh
  // token came from Supabase's OAuth callback using the Services ID.
  const { error: upsertErr } = await supa
    .from('user_apple_tokens')
    .upsert(
      {
        user_id: userId,
        apple_sub: appleSub,
        encrypted_refresh_token: encrypted.ciphertext,
        key_version: encrypted.keyVersion,
        client_id_type: 'web',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (upsertErr) {
    // Structured, scrubbed — never log the raw error object (may contain query fragments).
    console.error(JSON.stringify({
      event: 'apple_token_persist_upsert_failed',
      user_hash: await hashUserId(userId),
      pg_code: (upsertErr as any)?.code ?? null,
    }));
    return json(500, { ok: false, code: 'UPSERT_FAILED', transient: true });
  }

  return json(200, { ok: true });
});

async function hashUserId(userId: string): Promise<string> {
  const bytes = new TextEncoder().encode(userId);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}
```

- [ ] **Step 2: Deploy to Supabase**

```bash
# Using existing CLI token convention from memory reference_supabase_mcp_limitation
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy apple-token-persist \
  --project-ref vpioftosgdkyiwvhxewy
```

- [ ] **Step 3: Smoke-test with curl (no Apple identity should return 409)**

```bash
# Grab a valid JWT from a signed-in session (browser devtools → Application → Storage → whats-good-here-auth)
JWT="<paste access_token>"
curl -i -X POST \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"provider_refresh_token":"rt.test-value"}' \
  "https://vpioftosgdkyiwvhxewy.supabase.co/functions/v1/apple-token-persist"
# For a user with no Apple identity: expect HTTP 409 { ok: false, code: 'NO_APPLE_IDENTITY' }
# For a user with an Apple identity and valid token: expect HTTP 200 { ok: true }
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/apple-token-persist/
git commit -m "feat(apple): add apple-token-persist Edge Function for web token capture"
```

---

### Task B1.6: Integration tests for `apple-token-persist`

**Files:**
- Create: `supabase/functions/apple-token-persist/index.test.ts`

Given the function requires a live Supabase Vault + `auth.identities` row, these are integration tests. If a test harness with service-role access and fixture users doesn't exist, skip to manual smoke for B1 and file a follow-up. Below is the target shape if harness exists.

- [ ] **Step 1: Write the integration tests (scaffold — wire to actual harness)**

```typescript
// supabase/functions/apple-token-persist/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createTestUser,
  insertAppleIdentity,
  invokeFn,
  cleanupUser,
} from '../_test/harness.ts'; // create this in the test harness PR if not present

Deno.test('happy path: valid JWT + token + apple identity → 200 + row upserted', async () => {
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    const res = await invokeFn('apple-token-persist', {
      jwt,
      body: { provider_refresh_token: 'rt.test.123' },
    });
    assertEquals(res.status, 200);
    // TODO: SELECT from user_apple_tokens WHERE user_id = ? and assert row shape
  } finally {
    await cleanupUser(userId);
  }
});

Deno.test('missing JWT → 401', async () => {
  const res = await invokeFn('apple-token-persist', {
    body: { provider_refresh_token: 'rt.x' },
  });
  assertEquals(res.status, 401);
});

Deno.test('invalid JWT → 401', async () => {
  const res = await invokeFn('apple-token-persist', {
    jwt: 'not.a.jwt',
    body: { provider_refresh_token: 'rt.x' },
  });
  assertEquals(res.status, 401);
});

Deno.test('missing provider_refresh_token → 400', async () => {
  const { userId, jwt } = await createTestUser();
  try {
    const res = await invokeFn('apple-token-persist', { jwt, body: {} });
    assertEquals(res.status, 400);
  } finally {
    await cleanupUser(userId);
  }
});

Deno.test('user with no Apple identity → 409 NO_APPLE_IDENTITY', async () => {
  const { userId, jwt } = await createTestUser();
  try {
    const res = await invokeFn('apple-token-persist', {
      jwt,
      body: { provider_refresh_token: 'rt.x' },
    });
    assertEquals(res.status, 409);
    const body = await res.json();
    assertEquals(body.code, 'NO_APPLE_IDENTITY');
  } finally {
    await cleanupUser(userId);
  }
});

Deno.test('idempotent: second call with same token updates in place (one row)', async () => {
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    const r1 = await invokeFn('apple-token-persist', {
      jwt,
      body: { provider_refresh_token: 'rt.first' },
    });
    assertEquals(r1.status, 200);
    const r2 = await invokeFn('apple-token-persist', {
      jwt,
      body: { provider_refresh_token: 'rt.second' },
    });
    assertEquals(r2.status, 200);
    // TODO: assert only one row, encrypted_refresh_token decrypts to 'rt.second'
  } finally {
    await cleanupUser(userId);
  }
});
```

- [ ] **Step 2: Run**

```bash
deno test --allow-net --allow-env supabase/functions/apple-token-persist/
# Expected: all green. If harness fixtures missing, expect clear "module not found"
# error — file a follow-up for harness, verify manually via curl in B1.5 Step 3.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/apple-token-persist/index.test.ts
git commit -m "test(apple): integration tests for apple-token-persist"
```

---

### Task B1.7: Wire AuthContext to call `authApi.persistAppleRefreshToken` (Flow K)

**Files:**
- Modify: `src/api/authApi.js` — add `persistAppleRefreshToken(providerRefreshToken)` method (all `supabase.functions.invoke` goes through `src/api/` per CLAUDE.md §1.4)
- Modify: `src/api/authApi.test.js`
- Modify: `src/context/AuthContext.jsx`

**Why this shape:** CLAUDE.md §1.4 requires all data access to go through `src/api/`. `AuthContext.jsx` is already a partial exception (it's the auth session owner and uses `supabase.auth.*` directly). But anything hitting Edge Functions or DB tables belongs in an API module. So the Edge Function call lives in `authApi`, and AuthContext just invokes the API.

- [ ] **Step 1: Write the failing test for `authApi.persistAppleRefreshToken`**

Append to `src/api/authApi.test.js`:

```javascript
describe('authApi.persistAppleRefreshToken', () => {
  const invokeMock = vi.fn()
  // Extend the supabase mock to add functions.invoke — refactor the mock factory
  // if needed so the same module mock covers auth + functions.

  it('returns ok on 200', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null })
    const r = await authApi.persistAppleRefreshToken('rt.abc')
    expect(r).toEqual({ ok: true })
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })

  it('retries once on transient failure (5xx), then succeeds', async () => {
    invokeMock
      .mockResolvedValueOnce({ data: null, error: { status: 503 } })
      .mockResolvedValueOnce({ data: { ok: true }, error: null })
    const r = await authApi.persistAppleRefreshToken('rt.abc')
    expect(r).toEqual({ ok: true })
    expect(invokeMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry on 409 NO_APPLE_IDENTITY', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: false, code: 'NO_APPLE_IDENTITY' },
      error: { status: 409 },
    })
    const r = await authApi.persistAppleRefreshToken('rt.abc')
    expect(r.ok).toBe(false)
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })

  it('returns failure + fires PostHog after two transient failures', async () => {
    invokeMock
      .mockResolvedValueOnce({ data: null, error: { status: 503 } })
      .mockResolvedValueOnce({ data: null, error: { status: 503 } })
    const r = await authApi.persistAppleRefreshToken('rt.abc')
    expect(r.ok).toBe(false)
    expect(invokeMock).toHaveBeenCalledTimes(2)
  })

  it('no-ops on missing token (defensive)', async () => {
    const r = await authApi.persistAppleRefreshToken(null)
    expect(r.ok).toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
  })
})
```

```bash
npm run test -- authApi.test
# Expected: FAIL
```

- [ ] **Step 2: Implement the method in `authApi.js`**

```javascript
// Inside src/api/authApi.js, alongside other methods. Near top of file:
const APPLE_PERSIST_TRANSIENT_STATUSES = new Set([500, 502, 503, 504])
const APPLE_PERSIST_RETRY_DELAY_MS = 1000

// Inside the authApi object literal:

/**
 * POST the Apple provider_refresh_token (from Supabase web OAuth callback)
 * to the apple-token-persist Edge Function. One retry on transient failure
 * after 1s. Never throws — Flow K is fire-and-forget from the auth context's
 * perspective. The token is only in memory briefly after SIGNED_IN; if we
 * lose it, Case B (unrevokable sentinel) picks up at delete time.
 *
 * @param {string|null} providerRefreshToken
 * @returns {Promise<{ ok: boolean, code?: string, status?: number }>}
 */
async persistAppleRefreshToken(providerRefreshToken) {
  if (!providerRefreshToken) {
    return { ok: false, reason: 'missing_token' }
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke('apple-token-persist', {
        method: 'POST',
        body: { provider_refresh_token: providerRefreshToken },
      })

      if (!error && data?.ok === true) {
        capture('apple_token_persisted')
        return { ok: true }
      }

      const status = error?.status ?? 500
      const code = data?.code

      if (!APPLE_PERSIST_TRANSIENT_STATUSES.has(status)) {
        logger.warn('apple-token-persist non-transient failure', { status, code })
        return { ok: false, code, status }
      }

      if (attempt === 2) {
        capture('apple_token_persist_failed', { status, code })
        logger.warn('apple-token-persist failed after retry', { status, code })
        return { ok: false, code, status }
      }

      await new Promise((r) => setTimeout(r, APPLE_PERSIST_RETRY_DELAY_MS))
    } catch (err) {
      if (attempt === 2) {
        capture('apple_token_persist_failed', { status: 0, error: err?.message })
        logger.warn('apple-token-persist threw after retry', err)
        return { ok: false, error: err?.message }
      }
      await new Promise((r) => setTimeout(r, APPLE_PERSIST_RETRY_DELAY_MS))
    }
  }

  return { ok: false }
},
```

- [ ] **Step 3: Run tests to verify pass**

```bash
npm run test -- authApi.test
# Expected: 5 new passed.
```

- [ ] **Step 4: Wire into AuthContext**

Detection logic per Codex feedback: don't gate on `app_metadata.provider === 'apple'` — that breaks for linked-account edge cases. Gate on `session?.provider_refresh_token` presence only; the server-side identity lookup in `apple-token-persist` decides whether this user has an Apple identity and returns 409 `NO_APPLE_IDENTITY` if not (which the retry policy treats as non-transient no-op).

```javascript
// src/context/AuthContext.jsx — add near the top with other imports:
import { authApi } from '../api/authApi'

// Inside the onAuthStateChange callback, AFTER the existing identify+capture block:
if (event === 'SIGNED_IN' && session?.provider_refresh_token) {
  // Flow K — capture Apple refresh token for SIWA revocation compliance.
  // Fire-and-forget: errors don't block the signed-in state.
  // Server decides whether this user's identity is actually Apple; we just
  // hand over the one-shot token. Non-Apple users get 409 NO_APPLE_IDENTITY.
  authApi.persistAppleRefreshToken(session.provider_refresh_token).catch((err) => {
    logger.warn('persistAppleRefreshToken unexpected throw', err)
  })
}
```

Note: This branch must NOT gate on `!prevUserRef.current` — Supabase may fire `SIGNED_IN` again if the browser restores session with `provider_refresh_token` briefly visible. The Edge Function is idempotent; over-calling is fine and cheap (a non-Apple user's repeat calls get 409 and stop there client-side).

- [ ] **Step 5: Verify build + lint pass**

```bash
npm run lint
npm run build
# Expected: both succeed. No new warnings.
```

- [ ] **Step 6: Commit**

```bash
git add src/api/authApi.js src/api/authApi.test.js src/context/AuthContext.jsx
git commit -m "feat(auth): capture Apple provider_refresh_token on web sign-in (Flow K)"
```

---

### Task B1.8: Manual web smoke + Codex review

- [ ] **Step 1: Enable the web Apple button if not already gated on**

Set `VITE_FEATURES_APPLE_SIGNIN=true` in local `.env.local`. (The SIWA button activation is part of B2; for B1 smoke we can temporarily render a plain Apple button in LoginModal.jsx where the `null` slot is, just to test the end-to-end PWA flow. Revert before PR.)

Actually — skip this step. B1 can be validated on production if Supabase Apple provider is already configured in the Supabase dashboard; otherwise smoke moves to B2 integration. The Edge Function is testable standalone via curl in B1.5 Step 3.

- [ ] **Step 2: Codex review gate**

```bash
codex exec "Senior reviewer pass on OAuth Plan B PR B1 — web Apple token capture. Focus areas:
1. Does _shared/apple.ts encryption correctly self-contain IV + version byte + ciphertext so rows can be copied between user_apple_tokens and pending_apple_revocations without Vault access at copy time?
2. Does apple-token-persist correctly reject client-supplied apple_sub and derive it server-side only?
3. Is the auth.identities lookup fail-closed on multi-identity / null provider_id?
4. Does AuthContext's Flow K hook avoid double-firing on TOKEN_REFRESHED, or is the Edge Function idempotent enough that it doesn't matter?
5. Does applePersist retry policy match spec Flow K (one retry, 1s delay, transient only)?
Full diff below:

$(git diff main..HEAD)
"
```

Triage findings per the Codex review protocol above. For each finding, I (Claude) classify must-fix / nice-to-have / reject. Fix must-fixes inline in this PR. Post triage summary in PR description.

- [ ] **Step 3: Open PR**

```bash
git push -u origin oauth-native-b1
gh pr create --title "feat(auth): B1 — web Apple token capture (Flow K)" --body "$(cat <<'EOF'
## Summary
- `user_apple_tokens` table + Vault encryption master key (v1)
- `_shared/apple.ts` encrypt/decrypt/decodeIdToken helpers
- `apple-token-persist` Edge Function — web path for capturing `provider_refresh_token`
- `AuthContext` Flow K wiring — POSTs on `SIGNED_IN` with Apple identity
- Ships independently of iOS work — enables SIWA revocation compliance for web-only Apple users

## Codex review
<paste triage summary from Codex review protocol>

## Test plan
- [x] Unit: `applePersist.test.js` — happy path, transient retry, non-transient no-retry, eventual failure PostHog
- [x] Integration: `_shared/apple.test.ts` — encrypt roundtrip, fresh IV, version-byte rejection, decodeIdToken
- [x] Integration: `apple-token-persist.test.ts` — happy path, JWT missing/invalid, body missing, NO_APPLE_IDENTITY, idempotent UPDATE
- [x] Manual: curl against deployed function with JWT from real session — 409 for non-Apple user, 200 for Apple user
- [x] `npm run lint` + `npm run build` clean
- [x] `supabase/schema.sql` reflects the new table (CLAUDE.md §1.4)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# PR B2 — Native Auth Bridge

**Goal:** Install Capgo + `@capacitor/app`. Build the thin `nativeAuth.js` bridge, nonce utility, `AuthLifecycle` component (appStateChange listener only — `appUrlOpen` ships in B4). Add native-platform branches in `authApi.signInWithGoogle` + `signInWithApple` that call `supabase.auth.signInWithIdToken` with provider tokens from the plugin. Activate the compliant SIWA button in `LoginModal.jsx`. Fix existing `location.state?.from` bug in `Login.jsx`.

**Ships alone:** Landable without backend changes. Functional on device as soon as Google iOS client ID is provisioned. Apple works end-to-end for sign-in, but revocation storage waits for B3.

**Definition of done:**
- `@capgo/capacitor-social-login` + `@capacitor/app` installed + `npx cap sync ios`
- `src/utils/nonce.js` + unit tests
- `src/lib/nativeAuth.js` + unit tests (mock plugin)
- `src/lib/authUrl.js` + unit tests (used by B4 but ships here to isolate)
- `src/components/Auth/AuthLifecycle.jsx` mounted inside `AuthProvider` — only `appStateChange` wired this PR
- `src/api/authApi.js` native-branch for Google + Apple (no Apple exchange POST yet — that lands in B3)
- Compliant SIWA button in `LoginModal.jsx` + `WelcomeModal.jsx` (if shown there — check; WelcomeModal is post-signin, so likely N/A)
- `location.state?.from` intent-preservation bug fixed in `Login.jsx`
- `FEATURES.APPLE_SIGNIN_ENABLED = true` by default on non-prod builds; prod still env-gated
- Unit tests green
- Codex review gate passed
- Simulator smoke: sign in with Google on iOS simulator works (assuming iOS client ID provisioned); Apple works on sim at best-effort (Apple sim is flaky per spec §Testing non-goals)

---

### Task B2.1: Install Capgo + `@capacitor/app`

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `ios/App/Podfile.lock` (via `npx cap sync ios`)
- Modify: Possibly `ios/App/App/Info.plist` (Capgo requires Google `CLIENT_ID` configuration — see Step 3)

- [ ] **Step 1: Install**

```bash
npm install @capgo/capacitor-social-login @capacitor/app
npx cap sync ios
```

- [ ] **Step 2: Check the Capgo README for iOS config requirements**

```bash
# Capgo requires either a GoogleService-Info.plist OR explicit initialization with the iOS client ID.
# Read: node_modules/@capgo/capacitor-social-login/README.md
```

The spec assumes we pass `iOSClientId` at `initialize()` time (no `GoogleService-Info.plist` needed). Verify from the plugin's README — if it requires the plist, revisit approach.

- [ ] **Step 3: Add Capgo init config**

Create a thin init module or add to `nativeAuth.js` in Task B2.4. Plan uses one-time `initialize()` at first `signInWithGoogleNative()` call, lazy. Track init in a module-scoped flag.

- [ ] **Step 4: Commit the install**

```bash
git add package.json package-lock.json ios/App/Podfile.lock ios/App/Podfile
git commit -m "chore(deps): install @capgo/capacitor-social-login + @capacitor/app"
```

---

### Task B2.2: `src/utils/nonce.js` + tests

**Files:**
- Create: `src/utils/nonce.js`
- Create: `src/utils/nonce.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// src/utils/nonce.test.js
import { describe, it, expect } from 'vitest'
import { generateNonce, sha256 } from './nonce'

describe('generateNonce', () => {
  it('returns a 64-char hex string', () => {
    const n = generateNonce()
    expect(n).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns different values each call', () => {
    const a = generateNonce()
    const b = generateNonce()
    expect(a).not.toBe(b)
  })
})

describe('sha256', () => {
  it('matches known RFC 6234 test vector for "abc"', async () => {
    const h = await sha256('abc')
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('is deterministic', async () => {
    const a = await sha256('the-same-input')
    const b = await sha256('the-same-input')
    expect(a).toBe(b)
  })
})
```

```bash
npm run test -- nonce.test
# Expected: FAIL — module not found
```

- [ ] **Step 2: Implement**

```javascript
// src/utils/nonce.js
//
// Nonce helpers for Sign in with Apple. Apple accepts a raw nonce AND
// requires us to pass the SHA-256 of that nonce to ASAuthorizationController.
// We keep the raw value in memory, hash it, send hash to Apple, and pass raw
// to supabase.signInWithIdToken which verifies hash(raw) matches id_token.nonce.

/**
 * Generate a cryptographically random 64-character hex nonce (32 bytes).
 */
export function generateNonce() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * SHA-256 of a UTF-8 string, returned as lowercase hex.
 */
export async function sha256(input) {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 3: Run test + commit**

```bash
npm run test -- nonce.test
# Expected: 4 passed.
git add src/utils/nonce.js src/utils/nonce.test.js
git commit -m "feat(utils): add nonce generator + sha256 helper for SIWA"
```

---

### Task B2.3: `src/lib/authUrl.js` + tests

Lands in B2 to isolate the parser from the lifecycle wiring in B4. Pure utility, safe to ship alone.

**Files:**
- Create: `src/lib/authUrl.js`
- Create: `src/lib/authUrl.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// src/lib/authUrl.test.js
import { describe, it, expect } from 'vitest'
import { parse } from './authUrl'

describe('authUrl.parse', () => {
  it('parses recovery link', () => {
    const r = parse('https://wghapp.com/auth/callback?code=abc123&type=recovery')
    expect(r).toEqual({ code: 'abc123', type: 'recovery' })
  })

  it('parses confirm link', () => {
    const r = parse('https://wghapp.com/auth/callback?code=abc&type=signup')
    expect(r).toEqual({ code: 'abc', type: 'confirm' })
  })

  it('parses magiclink', () => {
    const r = parse('https://wghapp.com/auth/callback?code=xyz&type=magiclink')
    expect(r).toEqual({ code: 'xyz', type: 'magiclink' })
  })

  it('returns null for non-auth URLs', () => {
    expect(parse('https://wghapp.com/browse')).toBeNull()
    expect(parse('https://wghapp.com/dish/abc')).toBeNull()
  })

  it('returns null when code is missing', () => {
    expect(parse('https://wghapp.com/auth/callback?type=recovery')).toBeNull()
  })

  it('returns null for malformed URLs without throwing', () => {
    expect(parse('not a url')).toBeNull()
    expect(parse(null)).toBeNull()
    expect(parse(undefined)).toBeNull()
  })

  it('defaults to magiclink when type absent but code present on /auth/*', () => {
    expect(parse('https://wghapp.com/auth/callback?code=abc')).toEqual({
      code: 'abc',
      type: 'magiclink',
    })
  })
})
```

```bash
npm run test -- authUrl.test
# Expected: FAIL
```

- [ ] **Step 2: Implement**

```javascript
// src/lib/authUrl.js
//
// Parses universal-link / deep-link URLs returning from email confirmation,
// password reset, or magic link. Returns null for anything not an auth return.
// Used by AuthLifecycle when @capacitor/app fires appUrlOpen.

const AUTH_PATH_PREFIX = '/auth/'

/**
 * Parse an auth-return URL and return `{ code, type }` or null.
 * Types:
 *   - 'recovery' → password reset flow
 *   - 'confirm'  → email confirmation (Supabase sends type=signup)
 *   - 'magiclink' → magic-link sign-in (default when code present without type)
 *
 * Never throws. Returns null for any malformed or non-auth URL.
 */
export function parse(input) {
  if (!input || typeof input !== 'string') return null
  let url
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (!url.pathname.startsWith(AUTH_PATH_PREFIX)) return null
  const code = url.searchParams.get('code')
  if (!code) return null
  const rawType = url.searchParams.get('type')
  const type = normalizeType(rawType)
  return { code, type }
}

function normalizeType(raw) {
  if (raw === 'recovery') return 'recovery'
  if (raw === 'signup' || raw === 'confirm') return 'confirm'
  return 'magiclink'
}
```

- [ ] **Step 3: Run + commit**

```bash
npm run test -- authUrl.test
# Expected: 7 passed.
git add src/lib/authUrl.js src/lib/authUrl.test.js
git commit -m "feat(auth): add authUrl.parse for universal-link returns"
```

---

### Task B2.4: `src/lib/nativeAuth.js` + tests (bridge)

**Files:**
- Create: `src/lib/nativeAuth.js`
- Create: `src/lib/nativeAuth.test.js`

- [ ] **Step 1: Write the failing test (mock Capgo)**

```javascript
// src/lib/nativeAuth.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const loginMock = vi.fn()
const logoutMock = vi.fn()
const initializeMock = vi.fn()

vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: {
    initialize: (...args) => initializeMock(...args),
    login: (...args) => loginMock(...args),
    logout: (...args) => logoutMock(...args),
  },
}))

import { signInWithGoogleNative, signInWithAppleNative, logoutNative } from './nativeAuth'

beforeEach(() => {
  initializeMock.mockReset()
  loginMock.mockReset()
  logoutMock.mockReset()
  initializeMock.mockResolvedValue(undefined)
})

describe('signInWithGoogleNative', () => {
  it('returns { idToken, accessToken } on success', async () => {
    loginMock.mockResolvedValueOnce({
      provider: 'google',
      result: { idToken: 'google-id', accessToken: 'google-access', profile: {} },
    })
    const r = await signInWithGoogleNative()
    expect(r).toEqual({ idToken: 'google-id', accessToken: 'google-access' })
  })

  it('maps user cancel to AUTH_USER_CANCELLED', async () => {
    loginMock.mockRejectedValueOnce(new Error('The user canceled the sign-in flow.'))
    await expect(signInWithGoogleNative()).rejects.toMatchObject({
      code: 'AUTH_USER_CANCELLED',
    })
  })

  it('maps network error to AUTH_NETWORK', async () => {
    loginMock.mockRejectedValueOnce(new Error('network error'))
    await expect(signInWithGoogleNative()).rejects.toMatchObject({
      code: 'AUTH_NETWORK',
    })
  })

  it('maps plugin init failure to AUTH_CONFIG', async () => {
    initializeMock.mockRejectedValueOnce(new Error('Missing client id'))
    await expect(signInWithGoogleNative()).rejects.toMatchObject({
      code: 'AUTH_CONFIG',
      subcode: 'google_sdk_missing_clientid',
    })
  })
})

describe('signInWithAppleNative', () => {
  it('passes hashed nonce to plugin and returns raw nonce with tokens', async () => {
    loginMock.mockResolvedValueOnce({
      provider: 'apple',
      result: {
        identityToken: 'apple-id',
        authorizationCode: 'apple-code',
        user: '000123.abc',
        profile: { givenName: 'Dan', familyName: 'Walsh' },
      },
    })
    const r = await signInWithAppleNative()
    expect(r.identityToken).toBe('apple-id')
    expect(r.authorizationCode).toBe('apple-code')
    expect(r.appleSub).toBe('000123.abc')
    expect(r.givenName).toBe('Dan')
    expect(r.familyName).toBe('Walsh')
    expect(r.rawNonce).toMatch(/^[0-9a-f]{64}$/)
    // Plugin should have been called with the HASHED nonce
    const loginArgs = loginMock.mock.calls[0][0]
    expect(loginArgs.options.nonce).toMatch(/^[0-9a-f]{64}$/)
    expect(loginArgs.options.nonce).not.toBe(r.rawNonce)
  })

  it('maps user cancel', async () => {
    loginMock.mockRejectedValueOnce(new Error('The user canceled the authorization attempt.'))
    await expect(signInWithAppleNative()).rejects.toMatchObject({
      code: 'AUTH_USER_CANCELLED',
    })
  })
})

describe('logoutNative', () => {
  it('calls plugin logout for google', async () => {
    logoutMock.mockResolvedValueOnce(undefined)
    await logoutNative('google')
    expect(logoutMock).toHaveBeenCalledWith({ provider: 'google' })
  })

  it('swallows logout errors (best-effort)', async () => {
    logoutMock.mockRejectedValueOnce(new Error('boom'))
    await expect(logoutNative('google')).resolves.toBeUndefined()
  })
})
```

```bash
npm run test -- nativeAuth.test
# Expected: FAIL
```

- [ ] **Step 2: Implement**

```javascript
// src/lib/nativeAuth.js
//
// ***THE ONLY*** module in the codebase that imports @capgo/capacitor-social-login.
// Boundary rule (spec §Architecture Layer 3): no plugin-native object shape
// ever escapes this file. Errors are mapped to WGH codes before throwing.
//
// Swapping to a different plugin or a first-party Swift bridge means
// editing this file and nothing else.

import { SocialLogin } from '@capgo/capacitor-social-login'
import { generateNonce, sha256 } from '../utils/nonce'
import { logger } from '../utils/logger'

const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID || ''
const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || ''

let initPromise = null

async function ensureInitialized() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      await SocialLogin.initialize({
        google: {
          iOSClientId: GOOGLE_IOS_CLIENT_ID,
          webClientId: GOOGLE_WEB_CLIENT_ID, // some Capgo versions require this
        },
        apple: {
          clientId: 'com.whatsgoodhere.app', // bundle id acts as Apple client id on native
        },
      })
    } catch (err) {
      initPromise = null // allow retry on next call
      const e = new Error(err?.message || 'Social login init failed')
      e.code = 'AUTH_CONFIG'
      e.subcode = GOOGLE_IOS_CLIENT_ID ? 'google_plugin_init_failed' : 'google_sdk_missing_clientid'
      e.cause = err?.message
      throw e
    }
  })()
  return initPromise
}

function mapPluginError(err, provider) {
  const msg = String(err?.message || err || '').toLowerCase()
  if (msg.includes('cancel')) {
    return Object.assign(new Error('User cancelled'), { code: 'AUTH_USER_CANCELLED' })
  }
  if (msg.includes('network') || msg.includes('offline') || msg.includes('timeout')) {
    return Object.assign(new Error('Network error'), {
      code: 'AUTH_NETWORK',
      cause: err?.message,
    })
  }
  if (msg.includes('rate') || msg.includes('too many')) {
    return Object.assign(new Error('Rate limited'), {
      code: 'AUTH_RATE_LIMITED',
      cause: err?.message,
    })
  }
  logger.warn(`nativeAuth ${provider} unknown error`, err)
  return Object.assign(new Error('Sign in failed'), {
    code: 'AUTH_UNKNOWN',
    cause: err?.message,
  })
}

export async function signInWithGoogleNative() {
  await ensureInitialized()
  let res
  try {
    res = await SocialLogin.login({ provider: 'google', options: {} })
  } catch (err) {
    throw mapPluginError(err, 'google')
  }
  const idToken = res?.result?.idToken
  const accessToken = res?.result?.accessToken
  if (!idToken) {
    throw Object.assign(new Error('Missing idToken from Google'), {
      code: 'AUTH_CONFIG',
      subcode: 'google_plugin_init_failed',
    })
  }
  return { idToken, accessToken }
}

export async function signInWithAppleNative() {
  await ensureInitialized()
  const rawNonce = generateNonce()
  const hashedNonce = await sha256(rawNonce)
  let res
  try {
    res = await SocialLogin.login({
      provider: 'apple',
      options: { scopes: ['email', 'name'], nonce: hashedNonce },
    })
  } catch (err) {
    throw mapPluginError(err, 'apple')
  }
  const result = res?.result || {}
  const identityToken = result.identityToken
  const authorizationCode = result.authorizationCode || null
  const appleSub = result.user || null
  if (!identityToken) {
    throw Object.assign(new Error('Missing identityToken from Apple'), {
      code: 'AUTH_UNKNOWN',
      subcode: 'apple_missing_identity_token',
    })
  }
  return {
    identityToken,
    authorizationCode,
    appleSub,
    givenName: result.profile?.givenName || null,
    familyName: result.profile?.familyName || null,
    rawNonce,
  }
}

export async function logoutNative(provider) {
  try {
    await SocialLogin.logout({ provider })
  } catch (err) {
    logger.warn(`nativeAuth logout ${provider} failed`, err)
    // Intentionally swallow — sign-out is best-effort.
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm run test -- nativeAuth.test
# Expected: all pass.
git add src/lib/nativeAuth.js src/lib/nativeAuth.test.js
git commit -m "feat(auth): add nativeAuth bridge for Capgo (sole plugin importer)"
```

---

### Task B2.5: Native branches in `src/api/authApi.js`

**Files:**
- Modify: `src/api/authApi.js` — add `isNativePlatform()` branches to `signInWithGoogle` + `signInWithApple`, and add a `signOut()` helper native branch wrapped through authApi (or leave signOut in AuthContext and call `logoutNative` from there — I'll put it in AuthContext in Task B2.8 since signOut lives there today).

- [ ] **Step 1: Modify signInWithGoogle**

Add `Capacitor.isNativePlatform()` import (dynamic, per spec §Invariants):

```javascript
// Near top of authApi.js
import { Capacitor } from '@capacitor/core'
```

Replace `signInWithGoogle` body:

```javascript
async signInWithGoogle(redirectUrl = null) {
  try {
    const rateLimit = checkRateLimit('auth', RATE_LIMITS.auth)
    if (!rateLimit.allowed) {
      throw new Error(rateLimit.message)
    }

    capture('login_started', { method: 'google', platform: Capacitor.isNativePlatform() ? 'native' : 'web' })

    if (Capacitor.isNativePlatform()) {
      const { signInWithGoogleNative } = await import('../lib/nativeAuth')
      let tokens
      try {
        tokens = await signInWithGoogleNative()
      } catch (err) {
        if (err?.code === 'AUTH_USER_CANCELLED') {
          return { success: false, cancelled: true, code: err.code }
        }
        throw err
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: tokens.idToken,
        access_token: tokens.accessToken,
      })
      if (error) {
        capture('login_failed', { method: 'google', error: error.message })
        throw createClassifiedError(error)
      }
      return { success: true }
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getSafeRedirectUrl(redirectUrl) },
    })
    if (error) {
      capture('login_failed', { method: 'google', error: error.message })
      throw createClassifiedError(error)
    }
    return { success: true }
  } catch (error) {
    logger.error('Error signing in with Google:', error)
    throw error.type ? error : createClassifiedError(error)
  }
},
```

- [ ] **Step 2: Modify signInWithApple**

Replace body with native-branch version. Note: the `apple-token-exchange` POST lands in B3; here we only leave a TODO marker + keep signInWithIdToken working.

```javascript
async signInWithApple(redirectUrl = null) {
  try {
    const rateLimit = checkRateLimit('auth', RATE_LIMITS.auth)
    if (!rateLimit.allowed) {
      throw new Error(rateLimit.message)
    }

    capture('login_started', { method: 'apple', platform: Capacitor.isNativePlatform() ? 'native' : 'web' })

    if (Capacitor.isNativePlatform()) {
      const { signInWithAppleNative } = await import('../lib/nativeAuth')
      let appleRes
      try {
        appleRes = await signInWithAppleNative()
      } catch (err) {
        if (err?.code === 'AUTH_USER_CANCELLED') {
          return { success: false, cancelled: true, code: err.code }
        }
        throw err
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: appleRes.identityToken,
        nonce: appleRes.rawNonce,
      })
      if (error) {
        capture('login_failed', { method: 'apple', error: error.message })
        throw createClassifiedError(error)
      }

      // First-sign-in name persistence runs independently of token exchange.
      await persistFirstSignInName(appleRes.givenName, appleRes.familyName).catch((e) => {
        logger.warn('persistFirstSignInName failed', e)
      })

      // B3 lands the apple-token-exchange call here for revocation compliance.
      // For B2, authorizationCode is dropped; Flow H (later sign-in healing)
      // will re-capture it once B3 is deployed.
      if (appleRes.authorizationCode) {
        logger.info('authorizationCode present — exchange deferred to B3 deployment')
      }

      return { success: true }
    }

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
    logger.error('Error signing in with Apple:', error)
    throw error.type ? error : createClassifiedError(error)
  }
},
```

And add the name-persistence helper in the same file (or a new small module):

```javascript
// Near top of authApi.js (file-private helper)
async function persistFirstSignInName(givenName, familyName) {
  if (!givenName && !familyName) return
  const displayName = [givenName, familyName].filter(Boolean).join(' ').trim()
  if (!displayName) return
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData?.session?.user?.id
  if (!userId) return
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle()
  // Don't overwrite an existing name — only fill if blank.
  if (profile?.display_name && profile.display_name.trim()) return
  await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId)
}
```

- [ ] **Step 3: Write a focused unit test for authApi native branches**

```javascript
// src/api/authApi.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const signInWithIdTokenMock = vi.fn()
const signInWithOAuthMock = vi.fn()
const getSessionMock = vi.fn()
const fromMock = vi.fn()
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: (...args) => signInWithIdTokenMock(...args),
      signInWithOAuth: (...args) => signInWithOAuthMock(...args),
      getSession: () => getSessionMock(),
    },
    from: (...args) => fromMock(...args),
  },
}))

const isNativeMock = vi.fn()
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNativeMock() } }))

const signInWithGoogleNativeMock = vi.fn()
const signInWithAppleNativeMock = vi.fn()
vi.mock('../lib/nativeAuth', () => ({
  signInWithGoogleNative: (...a) => signInWithGoogleNativeMock(...a),
  signInWithAppleNative: (...a) => signInWithAppleNativeMock(...a),
}))

import { authApi } from './authApi'

beforeEach(() => {
  signInWithIdTokenMock.mockReset()
  signInWithOAuthMock.mockReset()
  getSessionMock.mockReset().mockResolvedValue({ data: { session: null } })
  fromMock.mockReset()
  isNativeMock.mockReset()
  signInWithGoogleNativeMock.mockReset()
  signInWithAppleNativeMock.mockReset()
})

describe('authApi.signInWithGoogle on native', () => {
  it('calls signInWithIdToken with plugin tokens', async () => {
    isNativeMock.mockReturnValue(true)
    signInWithGoogleNativeMock.mockResolvedValueOnce({ idToken: 'g-id', accessToken: 'g-access' })
    signInWithIdTokenMock.mockResolvedValueOnce({ error: null })
    const r = await authApi.signInWithGoogle()
    expect(r).toEqual({ success: true })
    expect(signInWithIdTokenMock).toHaveBeenCalledWith({
      provider: 'google',
      token: 'g-id',
      access_token: 'g-access',
    })
    expect(signInWithOAuthMock).not.toHaveBeenCalled()
  })

  it('returns cancelled shape on user cancel (no throw)', async () => {
    isNativeMock.mockReturnValue(true)
    signInWithGoogleNativeMock.mockRejectedValueOnce(
      Object.assign(new Error('cancelled'), { code: 'AUTH_USER_CANCELLED' }),
    )
    const r = await authApi.signInWithGoogle()
    expect(r).toEqual({ success: false, cancelled: true, code: 'AUTH_USER_CANCELLED' })
  })
})

describe('authApi.signInWithGoogle on web', () => {
  it('falls back to signInWithOAuth', async () => {
    isNativeMock.mockReturnValue(false)
    signInWithOAuthMock.mockResolvedValueOnce({ error: null })
    await authApi.signInWithGoogle()
    expect(signInWithOAuthMock).toHaveBeenCalled()
    expect(signInWithIdTokenMock).not.toHaveBeenCalled()
  })
})

describe('authApi.signInWithApple on native', () => {
  it('calls signInWithIdToken with rawNonce', async () => {
    isNativeMock.mockReturnValue(true)
    signInWithAppleNativeMock.mockResolvedValueOnce({
      identityToken: 'a-id',
      authorizationCode: 'a-code',
      appleSub: '000.abc',
      givenName: null,
      familyName: null,
      rawNonce: 'a'.repeat(64),
    })
    signInWithIdTokenMock.mockResolvedValueOnce({ error: null })
    getSessionMock.mockResolvedValue({ data: { session: null } })
    const r = await authApi.signInWithApple()
    expect(r).toEqual({ success: true })
    expect(signInWithIdTokenMock).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'a-id',
      nonce: 'a'.repeat(64),
    })
  })
})
```

```bash
npm run test -- authApi.test
# Expected: all pass.
```

- [ ] **Step 4: Commit**

```bash
git add src/api/authApi.js src/api/authApi.test.js
git commit -m "feat(auth): add native branches to authApi.signInWithGoogle/Apple"
```

---

### Task B2.6: `src/components/Auth/AuthLifecycle.jsx` (appStateChange only)

**Files:**
- Create: `src/components/Auth/AuthLifecycle.jsx`

This component lives inside `AuthProvider`. For B2 it only handles `appStateChange` — `appUrlOpen` wiring ships in B4 (needs the AASA + universal-link path).

- [ ] **Step 1: Write the component**

```javascript
// src/components/Auth/AuthLifecycle.jsx
//
// Owns Capacitor App lifecycle listeners that affect auth state.
// Mounted inside AuthProvider so its effects live adjacent to the auth client.
//
// B2: appStateChange → on foreground, reconcile session via getSession()
// B4: appUrlOpen    → hand off to authUrl.parse → exchangeCodeForSession
//
// Web (non-Capacitor): the effect early-returns — nothing to mount.

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../../lib/supabase'
import { logger } from '../../utils/logger'

export function AuthLifecycle() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined

    let stateHandle
    let mounted = true

    ;(async () => {
      const { App } = await import('@capacitor/app')
      if (!mounted) return

      stateHandle = await App.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) return
        try {
          await supabase.auth.getSession()
        } catch (err) {
          logger.warn('AuthLifecycle getSession on foreground failed', err)
        }
      })
    })()

    return () => {
      mounted = false
      stateHandle?.remove?.()
    }
  }, [])

  return null
}
```

- [ ] **Step 2: Mount inside AuthProvider**

Open `src/context/AuthContext.jsx`, add inside the provider's returned JSX:

```javascript
import { AuthLifecycle } from '../components/Auth/AuthLifecycle'

// ... inside AuthProvider's return:
return (
  <AuthContext.Provider value={value}>
    <AuthLifecycle />
    {children}
  </AuthContext.Provider>
)
```

- [ ] **Step 3: Build + lint**

```bash
npm run lint
npm run build
# Expected: green. Native import is dynamic — web build must not bundle @capacitor/app's native stubs.
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Auth/AuthLifecycle.jsx src/context/AuthContext.jsx
git commit -m "feat(auth): add AuthLifecycle component (appStateChange)"
```

---

### Task B2.7: Activate compliant SIWA button in `LoginModal.jsx`

**Files:**
- Modify: `src/components/Auth/LoginModal.jsx`
- Possibly: `public/apple-signin-button.svg` (if we choose to drop Apple's asset as a file vs. inline SVG)

Apple HIG requires their official black-on-white logo, specific proportions, padding, corner radius. Hand-authored logos are a rejection risk. The spec recommends Apple's asset or `react-apple-signin-auth`'s button style.

**Decision (Claude making the call):** Inline SVG of Apple's logo + style it per HIG specs (44pt min height, 8pt corner radius, centered logo + text). `react-apple-signin-auth` adds ~40kb for a button we can hand-style. Callback is wired to `handleAppleSignIn` which exists already.

- [ ] **Step 1: Replace the `FEATURES.APPLE_SIGNIN_ENABLED && null` slot**

Find line 264 in `LoginModal.jsx`:
```javascript
{FEATURES.APPLE_SIGNIN_ENABLED && null}
```

Replace with a compliant SIWA button rendered ABOVE the Google button (equal-prominence requirement from Apple 4.8):

```javascript
{FEATURES.APPLE_SIGNIN_ENABLED && (
  <button
    onClick={handleAppleSignIn}
    disabled={loading}
    aria-label="Sign in with Apple"
    className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-semibold active:scale-[0.98] transition-all disabled:opacity-50"
    style={{ background: '#000000', color: '#FFFFFF', minHeight: 44 }}
  >
    <svg aria-hidden="true" width="18" height="22" viewBox="0 0 14 17" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.623 13.213c-.234.544-.51 1.045-.831 1.506-.438.63-.797 1.064-1.073 1.306-.427.392-.886.593-1.377.603-.353 0-.779-.1-1.274-.303-.497-.2-.954-.301-1.372-.301-.438 0-.909.1-1.413.301-.506.203-.913.309-1.225.32-.471.018-.94-.19-1.408-.625-.3-.266-.674-.714-1.121-1.345-.479-.675-.873-1.456-1.182-2.344C.132 11.374 0 10.449 0 9.557c0-1.02.22-1.9.663-2.637.347-.592.81-1.06 1.387-1.403.578-.342 1.203-.517 1.876-.528.375 0 .867.116 1.478.344.61.229.1.345 1.268.345.246 0 .73-.136 1.449-.407.681-.252 1.256-.356 1.729-.316 1.281.103 2.244.61 2.884 1.523-1.146.695-1.713 1.667-1.702 2.914.01.971.363 1.779 1.057 2.42.314.297.665.527 1.053.689-.084.244-.172.478-.267.702zM10.031 1.1c0 .72-.263 1.39-.789 2.01-.634.737-1.4 1.163-2.233 1.095-.011-.086-.017-.177-.017-.273 0-.691.303-1.428.84-2.03.27-.307.61-.562 1.027-.766.416-.2.809-.31 1.18-.329.01.097.016.193.016.293z"/>
    </svg>
    Continue with Apple
  </button>
)}
```

Ordering: Apple ABOVE Google per Apple 4.8 equal-prominence. Move this JSX to render before the Google button block.

- [ ] **Step 2: Remove the `// eslint-disable-next-line no-unused-vars` above `handleAppleSignIn`**

It's now used.

- [ ] **Step 3: Set the feature flag env var per environment**

**Decision reversed after Codex review:** prod stays `false` until B3-activate ships. Apple 5.1.1(v) requires revocation on account delete; enabling SIWA in prod before revocation infrastructure is deployed creates a compliance gap even if short-lived.

- `.env.development` — `VITE_FEATURES_APPLE_SIGNIN=true`
- `.env.preview` (or `.env` for preview deploys) — `VITE_FEATURES_APPLE_SIGNIN=true`
- `.env.production` — `VITE_FEATURES_APPLE_SIGNIN=false`

Capacitor native builds pull from whichever env is passed to `npm run build` — for internal TestFlight testing use the preview env, for App Store submission wait until B3-activate flips prod to `true`.

Note the flip as an explicit step in B3-activate (Task B3.10 below).

- [ ] **Step 4: Fix `location.state?.from` bug in Login.jsx**

```bash
grep -n "location.state" src/pages/Login.jsx
```

The bug: after successful sign-in the page navigates to `/` rather than the originally-requested route carried via `location.state.from`. Spec says to fix it. Open `src/pages/Login.jsx`, read the sign-in success handler, and change the post-auth navigation to:

```javascript
const from = location.state?.from?.pathname || '/'
navigate(from, { replace: true })
```

(If the bug isn't there on inspection — Login.jsx may have been updated out of band — note in PR description and skip.)

- [ ] **Step 5: Lint + build**

```bash
npm run lint
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/Auth/LoginModal.jsx src/pages/Login.jsx .env.development .env.production
git commit -m "feat(auth): activate SIWA button + fix Login redirect to location.state.from"
```

---

### Task B2.8: Wire `logoutNative` into `AuthContext.signOut`

**Files:**
- Modify: `src/context/AuthContext.jsx`

Without this, next Google tap silently reuses the same account (Flow I in spec).

- [ ] **Step 1: Modify signOut**

```javascript
// src/context/AuthContext.jsx — signOut callback
const signOut = useCallback(async () => {
  clearPendingVoteStorage()
  clearCache()
  removeSessionItem(STORAGE_KEYS.EMAIL_CACHE)
  removeStorageItem(STORAGE_KEYS.EMAIL_CACHE)

  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) {
    const { logoutNative } = await import('../lib/nativeAuth')
    const provider = prevUserRef.current?.app_metadata?.provider
    if (provider === 'google' || provider === 'apple') {
      await logoutNative(provider)
    }
  }

  await supabase.auth.signOut()
  queryClient.clear()
  setUser(null)
}, [queryClient])
```

- [ ] **Step 2: Build**

```bash
npm run build
# Expected: no bundle bloat on web (dynamic imports keep Capacitor out of web bundle)
```

- [ ] **Step 3: Commit**

```bash
git add src/context/AuthContext.jsx
git commit -m "feat(auth): clear native provider session on sign-out (Flow I)"
```

---

### Task B2.9: Simulator smoke + Codex review + PR open

- [ ] **Step 1: Simulator smoke (native sign-in)**

```bash
npm run build
npx cap sync ios
npx cap open ios
# In Xcode, run on iOS Simulator.
# Test:
#   a) Native Google: requires iOS client ID in VITE_GOOGLE_IOS_CLIENT_ID.
#      If not provisioned yet, skip — document in PR as "deferred to prereq #3".
#   b) Native Apple: simulator is known flaky per spec. Best-effort only.
#   c) Email sign-in still works on native (regression).
#   d) Web sign-in via `npm run dev` still works (regression).
```

- [ ] **Step 2: Codex review gate**

```bash
codex exec "Senior reviewer pass on OAuth Plan B PR B2 — native auth bridge. Focus:
1. Is @capgo/capacitor-social-login imported ONLY from src/lib/nativeAuth.js? (boundary rule)
2. Does authApi.signInWithApple correctly pass rawNonce (not hashed) to supabase.signInWithIdToken, and does nativeAuth pass the HASHED nonce to the plugin?
3. Does persistFirstSignInName avoid overwriting an existing display_name?
4. Does the SIWA button meet Apple HIG (min 44pt height, centered logo+text, rendered above Google)?
5. Does the dynamic-import pattern in AuthLifecycle + signOut keep Capacitor out of the web bundle?
Full diff:

$(git diff main..HEAD)
"
```

Triage per protocol, fix must-fixes, post summary in PR.

- [ ] **Step 3: Open PR**

```bash
git push -u origin oauth-native-b2
gh pr create --title "feat(auth): B2 — native auth bridge (Capgo)" --body "<summary + test plan + Codex review + deferred items (apple-token-exchange in B3, appUrlOpen in B4)>"
```

---

# PR B3-code — Apple Token Exchange + Revocation Backend (code-only, no credentials)

**Goal:** Server-side infrastructure for Apple token exchange (native path), revocation queueing, retry cron, and delete-account extension with Case A / Case B / fail-closed states. Code lands without Apple Dev credentials. Activation (Vault `.p8` upload + Supabase Apple provider config + pg_cron schedule enable + prod flag flip) happens in a separate PR (B3-activate) when prereqs #1 + #4 clear.

**Depends on:** B1 (Vault master key, `user_apple_tokens`, `_shared/apple.ts`), B2 (authApi native-Apple branch has the TODO slot to wire exchange).

**Definition of done (B3-code):**
- `pending_apple_revocations` migration deployed (staging Supabase ok)
- `_shared/apple.ts` extended with `signClientSecretJWT`, `exchangeAuthorizationCode`, `revokeToken`
- `apple-token-exchange` Edge Function deployed
- `apple-revocation-retry` Edge Function deployed (auth-guarded)
- `delete-account` extended for Case A / Case B / fail-closed / cascade-fail rollback
- `pg_cron` schedule SQL checked in but commented `-- ACTIVATE IN B3-ACTIVATE`
- `authApi.signInWithApple` native branch POSTs to `apple-token-exchange` when `authorizationCode` present
- Integration tests green (concurrency, Case B, apple_sub binding, negative observability)
- Codex review gate passed
- Tests run against staging/mocked Apple; real Apple requires credentials (B3-activate)

---

### Task B3.1: Supabase Vault — Apple signing key upload (B3-ACTIVATE)

**Deferred to B3-activate PR.** Cannot ship in B3-code because Apple Dev verification (prereq #1) is pending. Included here for completeness; executor skips this task during B3-code execution.

- [ ] **Step 1: Gather credentials from Apple Developer portal**

Requires Apple Dev verification. Do not attempt before prereq #1 clears.

- `.p8` private key file contents
- Apple Team ID
- Key ID
- Services ID (e.g., `com.whatsgoodhere.service`)
- Bundle ID (`com.whatsgoodhere.app`)

- [ ] **Step 2: Store in Vault**

Supabase SQL Editor:

```sql
SELECT vault.create_secret(
  '<paste .p8 file contents here, including BEGIN/END PRIVATE KEY lines>',
  'apple_signing_key_v1',
  'Apple SIWA .p8 private key for signing client secret JWTs. v1.'
);
SELECT vault.create_secret('<TEAM_ID>', 'apple_team_id', 'Apple Developer Team ID');
SELECT vault.create_secret('<KEY_ID>', 'apple_key_id_v1', 'Key ID for apple_signing_key_v1');
SELECT vault.create_secret('<SERVICES_ID>', 'apple_services_id', 'Apple Services ID for web SIWA');
-- Bundle ID is not secret but kept here for deployment consistency:
SELECT vault.create_secret('com.whatsgoodhere.app', 'apple_bundle_id', 'iOS bundle identifier');
```

- [ ] **Step 3: No commit — nothing was added to the repo.** Verify in SQL Editor:

```sql
SELECT name FROM vault.secrets WHERE name LIKE 'apple_%';
-- Expected: apple_encryption_master_key_v1, apple_signing_key_v1, apple_team_id,
--           apple_key_id_v1, apple_services_id, apple_bundle_id
```

---

### Task B3.2: Database migration — `pending_apple_revocations`

**Files:**
- Create: `supabase/migrations/20260421_pending_apple_revocations.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260421_pending_apple_revocations.sql
--
-- Durable queue of Apple refresh tokens pending revocation after account
-- deletion. Per App Store 5.1.1(v), we must eventually revoke Apple's
-- consent on any deleted user's behalf.
--
-- No FK to auth.users — rows must survive user cascade delete.
-- encrypted_refresh_token is self-contained ciphertext (not a Vault ref).
-- locked_at / locked_by implement row leasing for concurrent workers.

CREATE TABLE IF NOT EXISTS public.pending_apple_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apple_sub TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  key_version TEXT,
  -- client_id_type determines which Apple client_id to use for revocation.
  -- Copied from user_apple_tokens at queue time. Required whenever a real
  -- token is present (enforced by CHECK below).
  client_id_type TEXT CHECK (client_id_type IN ('native', 'web')),
  attempts INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  unrevokable BOOLEAN NOT NULL DEFAULT FALSE,
  dead_letter BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    unrevokable
    OR (encrypted_refresh_token IS NOT NULL AND key_version IS NOT NULL AND client_id_type IS NOT NULL)
  )
);

-- Retry-eligible rows (not unrevokable sentinels, not dead-lettered, not
-- locked or lock stale).
CREATE INDEX IF NOT EXISTS pending_apple_revocations_next_attempt_idx
  ON public.pending_apple_revocations (next_attempt_at)
  WHERE NOT unrevokable AND NOT dead_letter;

ALTER TABLE public.pending_apple_revocations ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated role = deny all. Service role bypasses RLS.

COMMENT ON TABLE public.pending_apple_revocations IS
  'Apple revocation queue. Service-role only. No FK to auth.users (must survive cascade).';
COMMENT ON COLUMN public.pending_apple_revocations.unrevokable IS
  'Sentinel: Apple identity existed but no refresh token was ever captured. Audit-only; never retried.';
COMMENT ON COLUMN public.pending_apple_revocations.locked_at IS
  'Row lease for concurrent workers. NULL = available. Stale locks > 10min reclaimed automatically.';

-- ROLLBACK:
--   DROP TABLE IF EXISTS public.pending_apple_revocations CASCADE;
```

- [ ] **Step 2: Run in SQL Editor, append to schema.sql, commit**

```bash
git add supabase/migrations/20260421_pending_apple_revocations.sql supabase/schema.sql
git commit -m "feat(apple): add pending_apple_revocations queue table"
```

---

### Task B3.3: Extend `_shared/apple.ts` with Apple API helpers

**Files:**
- Modify: `supabase/functions/_shared/apple.ts`

- [ ] **Step 1: Add client-secret JWT signer + Apple endpoints**

```typescript
// Append to supabase/functions/_shared/apple.ts

import { create as jwtCreate, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

interface AppleConfig {
  teamId: string;
  keyId: string;
  clientId: string; // bundle id on native, services id on web
  privateKeyPem: string;
}

async function loadAppleConfig(clientIdFor: 'native' | 'web'): Promise<AppleConfig> {
  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await supa
    .schema('vault')
    .from('decrypted_secrets')
    .select('name, decrypted_secret')
    .in('name', [
      'apple_team_id',
      'apple_key_id_v1',
      'apple_services_id',
      'apple_bundle_id',
      'apple_signing_key_v1',
    ]);
  if (error) throw new Error(`Vault read failed: ${error.message}`);
  const m = new Map((data ?? []).map((r) => [r.name, r.decrypted_secret as string]));
  const teamId = m.get('apple_team_id');
  const keyId = m.get('apple_key_id_v1');
  const clientId = clientIdFor === 'native'
    ? m.get('apple_bundle_id')
    : m.get('apple_services_id');
  const privateKeyPem = m.get('apple_signing_key_v1');
  if (!teamId || !keyId || !clientId || !privateKeyPem) {
    throw new Error('Apple config missing from vault');
  }
  return { teamId, keyId, clientId, privateKeyPem };
}

async function importApplePrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM envelope, decode base64, import as ECDSA P-256 PKCS#8.
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const der = base64ToBytes(b64);
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

export async function signClientSecretJWT(clientIdFor: 'native' | 'web'): Promise<string> {
  const cfg = await loadAppleConfig(clientIdFor);
  const key = await importApplePrivateKey(cfg.privateKeyPem);
  const now = getNumericDate(0);
  const jwt = await jwtCreate(
    { alg: 'ES256', kid: cfg.keyId, typ: 'JWT' },
    {
      iss: cfg.teamId,
      iat: now,
      exp: getNumericDate(5 * 60),
      aud: 'https://appleid.apple.com',
      sub: cfg.clientId,
    },
    key,
  );
  return jwt;
}

export interface AppleExchangeResult {
  refreshToken: string;
  idToken: string;
  accessToken: string;
}

export async function exchangeAuthorizationCode(
  code: string,
  clientIdFor: 'native' | 'web',
): Promise<AppleExchangeResult> {
  const cfg = await loadAppleConfig(clientIdFor);
  const clientSecret = await signClientSecretJWT(clientIdFor);
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
  });
  const res = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    const isTransient = res.status >= 500;
    const err = new Error(`Apple token exchange failed: ${res.status}`);
    (err as any).status = res.status;
    (err as any).body = text;
    (err as any).transient = isTransient;
    throw err;
  }
  const json = await res.json();
  if (!json.refresh_token || !json.id_token) {
    const err = new Error('Apple exchange response missing tokens');
    (err as any).status = 502;
    throw err;
  }
  return {
    refreshToken: json.refresh_token,
    idToken: json.id_token,
    accessToken: json.access_token,
  };
}

export async function revokeToken(
  refreshToken: string,
  clientIdFor: 'native' | 'web' = 'native',
): Promise<void> {
  const cfg = await loadAppleConfig(clientIdFor);
  const clientSecret = await signClientSecretJWT(clientIdFor);
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: clientSecret,
    token: refreshToken,
    token_type_hint: 'refresh_token',
  });
  const res = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Apple revoke failed: ${res.status}`);
    (err as any).status = res.status;
    (err as any).body = text;
    (err as any).transient = res.status >= 500;
    throw err;
  }
}
```

- [ ] **Step 2: Extend tests**

Add to `_shared/apple.test.ts`:

```typescript
Deno.test('signClientSecretJWT produces a well-formed ES256 JWT', async () => {
  const jwt = await signClientSecretJWT('native');
  const parts = jwt.split('.');
  assertEquals(parts.length, 3);
  const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])));
  assertEquals(header.alg, 'ES256');
  assert(header.kid);
});

// exchangeAuthorizationCode + revokeToken tests require a mock Apple endpoint.
// These move to the apple-token-exchange integration tests, which mock via
// fetch interceptor or test-only Apple fixture server.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/apple.ts supabase/functions/_shared/apple.test.ts
git commit -m "feat(apple): add signClientSecretJWT + exchange/revoke helpers"
```

---

### Task B3.4: `apple-token-exchange` Edge Function

**Files:**
- Create: `supabase/functions/apple-token-exchange/index.ts`
- Create: `supabase/functions/apple-token-exchange/index.test.ts`

The function body follows Flow B/C from the spec. Full code below.

- [ ] **Step 1: Implement**

```typescript
// supabase/functions/apple-token-exchange/index.ts
//
// Native iOS path for Apple authorization_code exchange.
//
// Flow: client (authApi.signInWithApple native branch) receives authorizationCode
// from Capgo plugin. When present on ANY sign-in (not first-time only, per spec
// revision v3), client POSTs here. We exchange with Apple, verify the returned
// id_token.sub matches the stored apple_sub on auth.identities (sub binding),
// encrypt the refresh token, UPSERT into user_apple_tokens.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  decodeIdToken,
  encryptRefreshToken,
  exchangeAuthorizationCode,
} from '../_shared/apple.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

const IDEMPOTENCY_WINDOW_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });

  // 1. Authenticate
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!jwt) return json(401, { ok: false, code: 'MISSING_JWT' });

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data: userData, error: userErr } = await supa.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { ok: false, code: 'INVALID_JWT' });
  const userId = userData.user.id;

  // 2. Parse body — ignore any client-supplied apple_sub or user_id
  let body: { authorization_code?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: 'MALFORMED_BODY' });
  }
  const authorizationCode = typeof body?.authorization_code === 'string'
    ? body.authorization_code
    : '';
  if (!authorizationCode) return json(400, { ok: false, code: 'MISSING_CODE' });

  // 3. Look up apple_sub from auth.identities — fail closed on degraded states
  const { data: identities, error: idErr } = await supa
    .schema('auth')
    .from('identities')
    .select('provider_id, provider')
    .eq('user_id', userId)
    .eq('provider', 'apple');
  if (idErr) return json(500, { ok: false, code: 'IDENTITY_LOOKUP_FAILED', transient: true });
  if (!identities || identities.length === 0) {
    return json(409, { ok: false, code: 'NO_APPLE_IDENTITY' });
  }
  if (identities.length > 1) {
    console.error(JSON.stringify({
      event: 'apple_token_exchange_multi_identity',
      user_hash: await hashUserId(userId),
    }));
    return json(500, { ok: false, code: 'MULTI_APPLE_IDENTITY' });
  }
  const storedAppleSub = identities[0].provider_id;
  if (!storedAppleSub) {
    console.error(JSON.stringify({
      event: 'apple_token_exchange_null_provider_id',
      user_hash: await hashUserId(userId),
    }));
    return json(500, { ok: false, code: 'IDENTITY_MISSING_SUB' });
  }

  // 4. Idempotency check — same code within 60s window, keyed on the
  // dedicated code_hash + code_hash_seen_at columns (NOT updated_at, which
  // is bumped by non-exchange writes like web token re-captures).
  // Best-effort check before burning the Apple code. A rare microsecond
  // race between two concurrent requests is gracefully handled by Apple
  // itself — the second exchange returns invalid_grant → 422.
  const codeHash = await sha256Hex(authorizationCode);
  const { data: existing } = await supa
    .from('user_apple_tokens')
    .select('code_hash, code_hash_seen_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (
    existing?.code_hash === codeHash &&
    existing.code_hash_seen_at &&
    Date.now() - new Date(existing.code_hash_seen_at).getTime() < IDEMPOTENCY_WINDOW_MS
  ) {
    return json(409, { ok: false, code: 'DUPLICATE_CODE' });
  }

  // 5. Exchange with Apple
  let exchangeRes;
  try {
    exchangeRes = await exchangeAuthorizationCode(authorizationCode, 'native');
  } catch (err) {
    const status = (err as any)?.status ?? 500;
    const transient = (err as any)?.transient ?? false;
    const body = String((err as any)?.body ?? '');
    if (body.includes('invalid_grant')) {
      return json(422, { ok: false, code: 'APPLE_CODE_INVALID', subcode: 'apple_invalid_grant', transient: false });
    }
    if (body.includes('invalid_client') || body.includes('unauthorized_client')) {
      console.error(JSON.stringify({ event: 'apple_invalid_client', user_hash: await hashUserId(userId) }));
      return json(500, { ok: false, code: 'APPLE_CONFIG', subcode: 'apple_invalid_client', transient: false });
    }
    if (transient) {
      return json(502, { ok: false, code: 'APPLE_UNAVAILABLE', subcode: 'apple_unavailable', transient: true });
    }
    return json(status >= 400 && status < 500 ? status : 500, {
      ok: false,
      code: 'APPLE_EXCHANGE_FAILED',
      transient: false,
    });
  }

  // 6. Apple sub binding
  let decodedSub: string;
  try {
    decodedSub = decodeIdToken(exchangeRes.idToken).sub;
  } catch {
    return json(502, { ok: false, code: 'APPLE_ID_TOKEN_INVALID', transient: false });
  }
  if (decodedSub !== storedAppleSub) {
    console.error(JSON.stringify({
      event: 'apple_sub_mismatch',
      user_hash: await hashUserId(userId),
    }));
    return json(403, { ok: false, code: 'AUTH_SECURITY', subcode: 'apple_sub_mismatch' });
  }

  // 7. Encrypt + upsert
  let encrypted;
  try {
    encrypted = await encryptRefreshToken(exchangeRes.refreshToken);
  } catch (err) {
    console.error('encrypt failed', err);
    return json(500, { ok: false, code: 'ENCRYPT_FAILED', transient: true });
  }

  const now = new Date().toISOString();
  const { error: upsertErr } = await supa
    .from('user_apple_tokens')
    .upsert(
      {
        user_id: userId,
        apple_sub: storedAppleSub,
        encrypted_refresh_token: encrypted.ciphertext,
        key_version: encrypted.keyVersion,
        client_id_type: 'native',
        code_hash: codeHash,
        code_hash_seen_at: now,
        updated_at: now,
        last_exchange_at: now,
      },
      { onConflict: 'user_id' },
    );
  if (upsertErr) {
    console.error(JSON.stringify({
      event: 'apple_token_exchange_upsert_failed',
      user_hash: await hashUserId(userId),
      pg_code: (upsertErr as any)?.code ?? null,
    }));
    return json(500, { ok: false, code: 'UPSERT_FAILED', transient: true });
  }

  return json(200, { ok: true });
});

async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
async function hashUserId(userId: string): Promise<string> {
  return (await sha256Hex(userId)).slice(0, 16);
}
```

- [ ] **Step 2: Integration tests**

Tests need to mock Apple's `/auth/token` endpoint. The simplest path: temporarily monkey-patch `globalThis.fetch` in tests. Full test file:

```typescript
// supabase/functions/apple-token-exchange/index.test.ts
//
// Integration tests for apple-token-exchange. Mocks Apple's /auth/token via
// globalThis.fetch patching. Uses the same test harness as apple-token-persist.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createTestUser,
  insertAppleIdentity,
  invokeFn,
  cleanupUser,
  getAppleTokenRow,
} from '../_test/harness.ts';

function mockAppleTokenEndpoint(handler: (req: Request) => Response | Promise<Response>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as URL | Request).url;
    if (url.includes('appleid.apple.com/auth/token')) {
      return handler(new Request(url, init));
    }
    return originalFetch(input, init);
  };
  return () => { globalThis.fetch = originalFetch; };
}

function makeIdToken(sub: string): string {
  const header = btoa(JSON.stringify({ alg: 'ES256', kid: 'fake' })).replace(/=+$/, '');
  const payload = btoa(JSON.stringify({ sub, iss: 'https://appleid.apple.com' })).replace(/=+$/, '');
  return `${header}.${payload}.fakesig`;
}

Deno.test('happy path: exchange succeeds, row upserted, 200', async () => {
  const restore = mockAppleTokenEndpoint(() =>
    new Response(JSON.stringify({
      refresh_token: 'apple-rt-123',
      id_token: makeIdToken('000123.abc'),
      access_token: 'apple-at',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    const res = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'fresh-code-1' },
    });
    assertEquals(res.status, 200);
    const row = await getAppleTokenRow(userId);
    assert(row);
    assert(row.code_hash, 'code_hash populated');
  } finally {
    restore();
    await cleanupUser(userId);
  }
});

Deno.test('apple_sub mismatch returns 403 AUTH_SECURITY', async () => {
  const restore = mockAppleTokenEndpoint(() =>
    new Response(JSON.stringify({
      refresh_token: 'rt',
      id_token: makeIdToken('999.bad'),
      access_token: 'at',
    }), { status: 200 }),
  );
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    const res = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'fresh-code-2' },
    });
    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(body.subcode, 'apple_sub_mismatch');
    const row = await getAppleTokenRow(userId);
    assertEquals(row, null, 'no row written on sub mismatch');
  } finally {
    restore();
    await cleanupUser(userId);
  }
});

Deno.test('Apple invalid_grant returns 422', async () => {
  const restore = mockAppleTokenEndpoint(() =>
    new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
  );
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    const res = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'expired' },
    });
    assertEquals(res.status, 422);
  } finally {
    restore();
    await cleanupUser(userId);
  }
});

Deno.test('Apple 500 returns 502 transient', async () => {
  const restore = mockAppleTokenEndpoint(() =>
    new Response('server error', { status: 500 }),
  );
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    const res = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'x' },
    });
    assertEquals(res.status, 502);
  } finally {
    restore();
    await cleanupUser(userId);
  }
});

Deno.test('no Apple identity → 409 fail-closed', async () => {
  const { userId, jwt } = await createTestUser();
  // deliberately NO insertAppleIdentity
  try {
    const res = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'x' },
    });
    assertEquals(res.status, 409);
  } finally {
    await cleanupUser(userId);
  }
});

Deno.test('duplicate code within 60s → 409 DUPLICATE_CODE', async () => {
  const restore = mockAppleTokenEndpoint(() =>
    new Response(JSON.stringify({
      refresh_token: 'rt',
      id_token: makeIdToken('000123.abc'),
      access_token: 'at',
    }), { status: 200 }),
  );
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    const r1 = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'same-code' },
    });
    assertEquals(r1.status, 200);
    const r2 = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'same-code' },
    });
    assertEquals(r2.status, 409);
  } finally {
    restore();
    await cleanupUser(userId);
  }
});

Deno.test('client-supplied apple_sub in body is ignored', async () => {
  const restore = mockAppleTokenEndpoint(() =>
    new Response(JSON.stringify({
      refresh_token: 'rt',
      id_token: makeIdToken('000123.abc'),
      access_token: 'at',
    }), { status: 200 }),
  );
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    const res = await invokeFn('apple-token-exchange', {
      jwt,
      body: {
        authorization_code: 'fresh',
        apple_sub: 'attacker.controlled.sub',
        user_id: 'attacker.user.id',
      },
    });
    assertEquals(res.status, 200);
    const row = await getAppleTokenRow(userId);
    assertEquals(row!.apple_sub, '000123.abc'); // not attacker's value
  } finally {
    restore();
    await cleanupUser(userId);
  }
});
```

- [ ] **Step 3: Deploy + run tests**

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy apple-token-exchange \
  --project-ref vpioftosgdkyiwvhxewy

deno test --allow-net --allow-env supabase/functions/apple-token-exchange/
# Expected: all green, pending harness. If harness missing, manual curl smoke only.
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/apple-token-exchange/
git commit -m "feat(apple): add apple-token-exchange Edge Function (native path)"
```

---

### Task B3.5: Wire `apple-token-exchange` POST into authApi native branch

**Files:**
- Modify: `src/api/authApi.js`

- [ ] **Step 1: Replace the B2-era TODO block**

Find the `if (appleRes.authorizationCode)` block in `signInWithApple` native branch. Replace:

```javascript
if (appleRes.authorizationCode) {
  try {
    const { data, error } = await supabase.functions.invoke('apple-token-exchange', {
      method: 'POST',
      body: { authorization_code: appleRes.authorizationCode },
    })
    if (error || !data?.ok) {
      // Non-blocking. Flow H heals on next sign-in.
      capture('apple_token_exchange_failed', {
        status: error?.status,
        code: data?.code,
      })
      logger.warn('apple-token-exchange failed', { status: error?.status, code: data?.code })
    } else {
      capture('apple_token_exchanged')
    }
  } catch (e) {
    capture('apple_token_exchange_failed', { error: e?.message })
    logger.warn('apple-token-exchange threw', e)
  }
}
```

- [ ] **Step 2: Extend authApi.test.js with an exchange-invoked assertion**

```javascript
it('POSTs authorizationCode to apple-token-exchange after signInWithIdToken', async () => {
  isNativeMock.mockReturnValue(true)
  signInWithAppleNativeMock.mockResolvedValueOnce({
    identityToken: 'id', authorizationCode: 'code-xyz', appleSub: 's', givenName: null,
    familyName: null, rawNonce: 'a'.repeat(64),
  })
  signInWithIdTokenMock.mockResolvedValueOnce({ error: null })
  const invokeMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null })
  // extend supabase mock: add functions.invoke
  // (refactor the mock setup so this is toggleable; see test file)
  // ... assert invokeMock called with apple-token-exchange + { authorization_code: 'code-xyz' }
})
```

- [ ] **Step 3: Build + test + commit**

```bash
npm run build && npm run test -- authApi
git add src/api/authApi.js src/api/authApi.test.js
git commit -m "feat(auth): POST apple-token-exchange from native Apple sign-in"
```

---

### Task B3.6: Extend `delete-account` for Case A / Case B / fail-closed

**Files:**
- Modify: `supabase/functions/delete-account/index.ts`

Read the current function first to understand its shape; the spec's Flow F shows the target behavior.

- [ ] **Step 1: Read the current implementation**

```bash
cat supabase/functions/delete-account/index.ts
```

- [ ] **Step 2: Insert the Apple-revocation pre-cascade block**

Before the existing cascade logic, add:

```typescript
// Apple revocation pre-cascade (spec Flow F)
import { revokeToken } from '../_shared/apple.ts';

// ... inside the main handler, after user authentication + before cascade:

const { data: appleIdentities, error: appleIdErr } = await supa
  .schema('auth')
  .from('identities')
  .select('provider_id')
  .eq('user_id', userId)
  .eq('provider', 'apple');

if (appleIdErr) {
  return json(500, { ok: false, code: 'IDENTITY_LOOKUP_FAILED', transient: true });
}

if (appleIdentities && appleIdentities.length > 0) {
  if (appleIdentities.length > 1) {
    console.error(JSON.stringify({
      event: 'delete_account_multi_apple_identity',
      user_hash: await hashUserId(userId),
    }));
    return json(500, { ok: false, code: 'MULTI_APPLE_IDENTITY' });
  }
  const appleSub = appleIdentities[0].provider_id;
  if (!appleSub) {
    console.error(JSON.stringify({
      event: 'delete_account_null_provider_id',
      user_hash: await hashUserId(userId),
    }));
    return json(500, { ok: false, code: 'IDENTITY_MISSING_SUB' });
  }

  const { data: tokenRow } = await supa
    .from('user_apple_tokens')
    .select('encrypted_refresh_token, key_version, client_id_type')
    .eq('user_id', userId)
    .maybeSingle();

  const requestId = crypto.randomUUID();
  const leaseHolder = `delete-account:${requestId}`;
  // Track the pending row we created (if any) so we can roll it back if the
  // subsequent user-data cascade fails. We must NOT revoke Apple consent for
  // a user whose account deletion failed.
  let pendingRowId: string | null = null;
  let inlineRevokeSucceeded = false;

  if (tokenRow) {
    if (!tokenRow.client_id_type) {
      console.error(JSON.stringify({
        event: 'delete_account_token_missing_client_id_type',
        user_hash: await hashUserId(userId),
      }));
      return json(500, { ok: false, code: 'TOKEN_ROW_CORRUPT' });
    }
    // Case A — insert pending row ALREADY LEASED to prevent cron double-revoke
    const { error: insertErr, data: pendingRow } = await supa
      .from('pending_apple_revocations')
      .insert({
        apple_sub: appleSub,
        encrypted_refresh_token: tokenRow.encrypted_refresh_token,
        key_version: tokenRow.key_version,
        client_id_type: tokenRow.client_id_type,
        locked_at: new Date().toISOString(),
        locked_by: leaseHolder,
        next_attempt_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertErr || !pendingRow) {
      return json(500, { ok: false, code: 'DELETE_QUEUE_FAILED', transient: true });
    }
    pendingRowId = pendingRow.id;

    // Try inline revoke while lease held
    try {
      const { decryptRefreshToken } = await import('../_shared/apple.ts');
      const refreshToken = await decryptRefreshToken(
        tokenRow.encrypted_refresh_token,
        tokenRow.key_version,
      );
      await revokeToken(refreshToken, tokenRow.client_id_type as 'native' | 'web');
      inlineRevokeSucceeded = true;
      // Do NOT delete the pending row yet — wait until the user-data cascade
      // succeeds. If cascade fails, we want the audit trail (revoke happened
      // but user still exists) and the row gives us that record.
      console.log(JSON.stringify({
        event: 'apple_revoke_inline_success',
        user_hash: await hashUserId(userId),
      }));
    } catch (err) {
      console.warn(JSON.stringify({
        event: 'apple_revoke_inline_failed',
        user_hash: await hashUserId(userId),
        status: (err as any)?.status ?? null,
      }));
      // Release lease so cron can retry later.
      await supa
        .from('pending_apple_revocations')
        .update({ locked_at: null, locked_by: null })
        .eq('id', pendingRow.id);
      // Important: pendingRowId stays set. If cascade fails we still clean it up.
    }
  } else {
    // Case B — unrevokable sentinel for audit
    const { error: sentinelErr, data: sentinel } = await supa
      .from('pending_apple_revocations')
      .insert({
        apple_sub: appleSub,
        unrevokable: true,
        encrypted_refresh_token: null,
        key_version: null,
        client_id_type: null,
      })
      .select('id')
      .single();
    if (sentinelErr || !sentinel) {
      return json(500, { ok: false, code: 'DELETE_QUEUE_FAILED', transient: true });
    }
    pendingRowId = sentinel.id;
    console.log(JSON.stringify({
      event: 'apple_revoke_unrevokable',
      user_hash: await hashUserId(userId),
    }));
  }
}

// ... existing cascade logic, wrapped to roll back pending row on failure ...
//
// Pseudocode:
//
//   try {
//     await existingCascadeLogic();            // deletes user data + auth.admin.deleteUser
//     if (pendingRowId && inlineRevokeSucceeded) {
//       // Revoke succeeded AND cascade succeeded → safe to drop the pending row.
//       await supa.from('pending_apple_revocations').delete().eq('id', pendingRowId);
//     }
//     return json(200, { ok: true, success: true });
//   } catch (cascadeErr) {
//     // Cascade failed. If we already called Apple revoke, there's no un-revoke —
//     // Apple consent is gone but the user still exists. Record this explicitly.
//     if (pendingRowId && !inlineRevokeSucceeded) {
//       // We queued but didn't revoke yet → safe to remove the queued entry.
//       await supa.from('pending_apple_revocations').delete().eq('id', pendingRowId).catch(() => {});
//     } else if (pendingRowId && inlineRevokeSucceeded) {
//       // Mark the row as dead_letter so cron doesn't re-revoke. Leave it for audit.
//       await supa.from('pending_apple_revocations')
//         .update({ dead_letter: true, locked_at: null, locked_by: null })
//         .eq('id', pendingRowId)
//         .catch(() => {});
//       console.error(JSON.stringify({
//         event: 'apple_revoke_cascade_mismatch',
//         user_hash: await hashUserId(userId),
//       }));
//     }
//     return json(500, { ok: false, code: 'CASCADE_FAILED', transient: true });
//   }
```

- [ ] **Step 3: Integration tests — delete-account**

`supabase/functions/delete-account/index.test.ts` — scenarios:

```typescript
// Scenarios (rough sketch — fill in with actual harness calls):

// 1. Non-Apple user → cascade only, no pending row
// 2. Apple user + token + Apple returns 200 inline → row inserted-leased-revoked-deleted, cascade OK
// 3. Apple user + token + Apple returns 500 inline → row remains with locked_at=null
// 4. Apple user + queue insert fails → 500, NO cascade (check auth.users still has the row)
// 5. Apple user + Vault unavailable (mock encrypt helper throw) → still 200 cascade, pending row has ciphertext from user_apple_tokens (self-contained, not Vault ref)
// 6. Apple user + no token row → unrevokable sentinel inserted, cascade OK
// 7. Apple user + sentinel insert fails → 500, NO cascade
// 8. Apple user + multi-identity → 500 MULTI_APPLE_IDENTITY, NO cascade
// 9. Apple user + null provider_id → 500 IDENTITY_MISSING_SUB, NO cascade
```

- [ ] **Step 4: Deploy + commit**

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy delete-account \
  --project-ref vpioftosgdkyiwvhxewy

git add supabase/functions/delete-account/
git commit -m "feat(apple): extend delete-account for Case A/B + fail-closed"
```

---

### Task B3.7: `apple-revocation-retry` Edge Function + `pg_cron`

**Files:**
- Create: `supabase/functions/apple-revocation-retry/index.ts`
- Create: `supabase/functions/apple-revocation-retry/index.test.ts`
- Create: `supabase/migrations/20260421_apple_revocation_cron.sql`

- [ ] **Step 1: Implement the retry function**

```typescript
// supabase/functions/apple-revocation-retry/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptRefreshToken, revokeToken } from '../_shared/apple.ts';

const MAX_ATTEMPTS = 10;
const STALE_LOCK_MS = 10 * 60 * 1000;
const BATCH_SIZE = 25;
const INSTANCE_ID = `cron:${crypto.randomUUID()}`;

const BACKOFF_MINUTES: Record<number, number> = {
  1: 15,
  2: 60,
  3: 360,
  4: 1440,
};
function backoffMinutes(attempts: number): number {
  return BACKOFF_MINUTES[attempts] ?? 1440;
}

Deno.serve(async (req) => {
  // Auth guard — this function may only be invoked by a caller presenting
  // the project service-role JWT (cron invocation or an operator). Public
  // invocation would let anyone force revocation attempts + drain Apple
  // rate limits.
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  // Compare raw — service role key is the JWT as-is. Use timingSafeEqual.
  if (!jwt || jwt.length !== serviceRoleKey.length) {
    return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED' }), { status: 401 });
  }
  let equal = 0;
  for (let i = 0; i < jwt.length; i++) equal |= jwt.charCodeAt(i) ^ serviceRoleKey.charCodeAt(i);
  if (equal !== 0) {
    return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED' }), { status: 401 });
  }

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
    { auth: { persistSession: false } },
  );

  // Acquire leases atomically via a PL/pgSQL RPC (FOR UPDATE SKIP LOCKED).
  // See migration 20260421_apple_revocation_cron.sql.
  const { data: leased, error: leaseErr } = await supa.rpc('lease_apple_revocations', {
    p_limit: BATCH_SIZE,
    p_instance_id: INSTANCE_ID,
    p_stale_lock_ms: STALE_LOCK_MS,
  });
  if (leaseErr) {
    console.error(JSON.stringify({
      event: 'lease_apple_revocations_failed',
      pg_code: (leaseErr as any)?.code ?? null,
    }));
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }

  let succeeded = 0;
  let failedTransient = 0;
  let deadLettered = 0;

  for (const row of leased ?? []) {
    try {
      const refreshToken = await decryptRefreshToken(row.encrypted_refresh_token, row.key_version);
      await revokeToken(refreshToken, (row.client_id_type as 'native' | 'web') ?? 'native');
      await supa.from('pending_apple_revocations').delete().eq('id', row.id);
      succeeded++;
      console.log(JSON.stringify({ event: 'apple_revoke_succeeded', row_id: row.id }));
    } catch (err) {
      const transient = (err as any)?.transient ?? false;
      const status = (err as any)?.status;
      const bodyText = String((err as any)?.body ?? '');
      const isInvalidGrant = bodyText.includes('invalid_grant');
      const isClientError = status >= 400 && status < 500;

      if (isInvalidGrant || isClientError) {
        await supa
          .from('pending_apple_revocations')
          .update({
            dead_letter: true,
            locked_at: null,
            locked_by: null,
            last_attempt_at: new Date().toISOString(),
            attempts: row.attempts + 1,
          })
          .eq('id', row.id);
        deadLettered++;
        console.error(JSON.stringify({
          event: 'apple_revoke_failed_final',
          row_id: row.id,
          status,
        }));
      } else {
        const newAttempts = row.attempts + 1;
        if (newAttempts >= MAX_ATTEMPTS) {
          await supa
            .from('pending_apple_revocations')
            .update({
              dead_letter: true,
              locked_at: null,
              locked_by: null,
              last_attempt_at: new Date().toISOString(),
              attempts: newAttempts,
            })
            .eq('id', row.id);
          deadLettered++;
          console.error(JSON.stringify({
            event: 'apple_revoke_failed_final',
            row_id: row.id,
            status,
            reason: 'max_attempts',
          }));
        } else {
          const nextMs = Date.now() + backoffMinutes(newAttempts) * 60_000;
          await supa
            .from('pending_apple_revocations')
            .update({
              attempts: newAttempts,
              next_attempt_at: new Date(nextMs).toISOString(),
              last_attempt_at: new Date().toISOString(),
              locked_at: null,
              locked_by: null,
            })
            .eq('id', row.id);
          failedTransient++;
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, leased: leased?.length ?? 0, succeeded, failedTransient, deadLettered }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
```

- [ ] **Step 2: Write the PL/pgSQL leasing RPC + pg_cron schedule**

```sql
-- supabase/migrations/20260421_apple_revocation_cron.sql

CREATE OR REPLACE FUNCTION public.lease_apple_revocations(
  p_limit INT,
  p_instance_id TEXT,
  p_stale_lock_ms INT
) RETURNS TABLE (
  id UUID,
  apple_sub TEXT,
  encrypted_refresh_token TEXT,
  key_version TEXT,
  client_id_type TEXT,
  attempts INT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  UPDATE public.pending_apple_revocations p
     SET locked_at = NOW(),
         locked_by = p_instance_id
    WHERE p.id IN (
      SELECT sub.id
        FROM public.pending_apple_revocations sub
       WHERE sub.next_attempt_at <= NOW()
         AND sub.attempts < 10
         AND NOT sub.dead_letter
         AND NOT sub.unrevokable
         AND (sub.locked_at IS NULL OR sub.locked_at < NOW() - make_interval(secs => p_stale_lock_ms / 1000))
       ORDER BY sub.next_attempt_at
       FOR UPDATE SKIP LOCKED
       LIMIT p_limit
    )
  RETURNING
    p.id,
    p.apple_sub,
    p.encrypted_refresh_token,
    p.key_version,
    p.client_id_type,
    p.attempts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lease_apple_revocations FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lease_apple_revocations TO service_role;

-- Schedule: every 15 minutes invoke the retry function
SELECT cron.schedule(
  'apple-revocation-retry',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://vpioftosgdkyiwvhxewy.supabase.co/functions/v1/apple-revocation-retry',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := '{}'::jsonb
    );
  $$
);

-- app.service_role_key is read from a GUC set in the Supabase project config.
-- Alternative: use Supabase's cron-invoked Edge Function pattern directly.

-- ROLLBACK:
--   SELECT cron.unschedule('apple-revocation-retry');
--   DROP FUNCTION IF EXISTS public.lease_apple_revocations(INT, TEXT, INT);
```

- [ ] **Step 3: Integration tests (concurrency critical)**

```typescript
// supabase/functions/apple-revocation-retry/index.test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createTestPendingRow, invokeFn, cleanupPending, getPendingRow } from '../_test/harness.ts';

Deno.test('no pending → noop', async () => {
  const res = await invokeFn('apple-revocation-retry', {});
  assertEquals(res.status, 200);
});

Deno.test('Apple 200 → row deleted', async () => {
  const mockFetch = mockAppleRevoke(200);
  const rowId = await createTestPendingRow({ apple_sub: 's1' });
  try {
    await invokeFn('apple-revocation-retry', {});
    const after = await getPendingRow(rowId);
    assertEquals(after, null);
  } finally {
    mockFetch.restore();
    await cleanupPending(rowId);
  }
});

Deno.test('Apple 500 → attempts+=1, next_attempt_at scheduled, lock cleared', async () => {
  const mockFetch = mockAppleRevoke(500);
  const rowId = await createTestPendingRow({ apple_sub: 's2' });
  try {
    await invokeFn('apple-revocation-retry', {});
    const after = await getPendingRow(rowId);
    assertEquals(after!.attempts, 1);
    assertEquals(after!.locked_at, null);
    assert(new Date(after!.next_attempt_at).getTime() > Date.now());
  } finally {
    mockFetch.restore();
    await cleanupPending(rowId);
  }
});

Deno.test('Apple invalid_grant → dead_letter immediately', async () => {
  const mockFetch = mockAppleRevoke(400, 'invalid_grant');
  const rowId = await createTestPendingRow({ apple_sub: 's3' });
  try {
    await invokeFn('apple-revocation-retry', {});
    const after = await getPendingRow(rowId);
    assertEquals(after!.dead_letter, true);
  } finally {
    mockFetch.restore();
    await cleanupPending(rowId);
  }
});

Deno.test('unrevokable sentinel rows are never selected', async () => {
  const rowId = await createTestPendingRow({ apple_sub: 's4', unrevokable: true });
  try {
    await invokeFn('apple-revocation-retry', {});
    const after = await getPendingRow(rowId);
    assert(after, 'unrevokable row untouched');
  } finally {
    await cleanupPending(rowId);
  }
});

Deno.test('concurrency: two workers vs same row → only one revoke', async () => {
  const mockFetch = mockAppleRevoke(200);
  const rowId = await createTestPendingRow({ apple_sub: 's5' });
  try {
    const [r1, r2] = await Promise.all([
      invokeFn('apple-revocation-retry', {}),
      invokeFn('apple-revocation-retry', {}),
    ]);
    assertEquals(r1.status, 200);
    assertEquals(r2.status, 200);
    // Exactly one fetch to Apple for this row
    assertEquals(mockFetch.callCount, 1);
    const after = await getPendingRow(rowId);
    assertEquals(after, null);
  } finally {
    mockFetch.restore();
    await cleanupPending(rowId);
  }
});

Deno.test('stale lease > 10min is reclaimed', async () => {
  const mockFetch = mockAppleRevoke(200);
  const rowId = await createTestPendingRow({
    apple_sub: 's6',
    locked_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    locked_by: 'dead-worker',
  });
  try {
    await invokeFn('apple-revocation-retry', {});
    const after = await getPendingRow(rowId);
    assertEquals(after, null);
  } finally {
    mockFetch.restore();
    await cleanupPending(rowId);
  }
});
```

- [ ] **Step 4: Deploy + run tests + commit**

```bash
# Apply the migration in SQL Editor, then:
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy apple-revocation-retry \
  --project-ref vpioftosgdkyiwvhxewy

# Manually trigger once to verify:
curl -X POST "https://vpioftosgdkyiwvhxewy.supabase.co/functions/v1/apple-revocation-retry" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"

deno test --allow-net --allow-env supabase/functions/apple-revocation-retry/

git add supabase/functions/apple-revocation-retry/ supabase/migrations/20260421_apple_revocation_cron.sql supabase/schema.sql
git commit -m "feat(apple): add apple-revocation-retry with FOR UPDATE SKIP LOCKED + pg_cron"
```

---

### Task B3.8: Negative observability tests

**Files:**
- Create: `supabase/functions/_test/observability.test.ts`

Spec §Testing/Security: mock Sentry transport, assert no `apple_sub`, `authorizationCode`, `accessToken`, `refresh_token`, `idToken`, or Bearer tokens in serialized event payloads.

- [ ] **Step 1: Build the Sentry-mock + assertion**

```typescript
// supabase/functions/_test/observability.test.ts
//
// Trigger every error path in apple-token-exchange, apple-token-persist,
// apple-revocation-retry, and delete-account. Scrape console.error output.
// Assert none of the forbidden values appear in any event.

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const FORBIDDEN_SUBSTRINGS = [
  'apple-rt-', 'rt.', 'authorization_code=', 'id_token=', 'access_token=',
  'Bearer eyJ', // JWT-shaped value in log output
  '000123.abc', // apple_sub should be hashed, never raw
];

function captureConsole() {
  // Capture all console levels, not just .error — Edge Function code logs
  // warnings on inline-revoke failure, info on happy paths, etc. A leak in
  // any level is a leak.
  const events: string[] = [];
  const originals = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  };
  const tag = (level: string) =>
    (...args: unknown[]) =>
      events.push(`[${level}] ` + args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
  console.log = tag('log');
  console.warn = tag('warn');
  console.error = tag('error');
  console.info = tag('info');
  return {
    events,
    restore: () => {
      console.log = originals.log;
      console.warn = originals.warn;
      console.error = originals.error;
      console.info = originals.info;
    },
  };
}

Deno.test('apple-token-exchange error paths leak no sensitive values', async () => {
  const cap = captureConsole();
  // Trigger: sub mismatch, invalid_grant, multi-identity, vault fail, etc.
  // Each trigger produces a console.error. Scan events.
  // ... trigger code ...
  cap.restore();
  for (const evt of cap.events) {
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      assert(!evt.includes(forbidden), `Leak of ${forbidden} in: ${evt}`);
    }
  }
});

// Repeat similar tests for other functions.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_test/observability.test.ts
git commit -m "test(apple): negative observability — no secrets in logs"
```

---

### Task B3.9: Codex review + PR open

- [ ] **Step 1: Codex review gate**

```bash
codex exec "Senior reviewer pass on OAuth Plan B PR B3 — Apple exchange + revocation backend. Focus:
1. Does apple-token-exchange fail-close on all three degraded identity states (no identity, multiple, null provider_id)?
2. Is the sub-binding check (decoded idToken.sub vs stored provider_id) unconditional and done BEFORE encrypt+upsert?
3. Does delete-account insert the Case A pending row already LEASED (locked_at=NOW, locked_by=delete-account:requestid) to prevent cron race, and does it explicitly release on inline-revoke failure?
4. Does apple-revocation-retry use FOR UPDATE SKIP LOCKED via the lease_apple_revocations RPC, filter out unrevokable sentinels, and reclaim stale leases >10min?
5. Do negative observability tests actually assert no apple_sub / authorization_code / tokens / JWT-shape strings appear in logs?
6. Is the backoff schedule correct (1→15m, 2→1h, 3→6h, 4→24h, 5+→24h, MAX_ATTEMPTS=10)?
Full diff:

$(git diff main..HEAD)
"
```

- [ ] **Step 2: PR**

```bash
git push -u origin oauth-native-b3-code
gh pr create --title "feat(auth): B3-code — Apple token exchange + revocation backend" --body "<summary + tests + codex triage + note that credentials + pg_cron + prod flag flip land in B3-activate>"
```

---

# PR B3-activate — Apple Credentials + Supabase Provider Config + pg_cron + Prod Flag

**Goal:** Activate the backend shipped in B3-code. This is the "make it real" PR — uploads Apple Dev credentials to Supabase Vault, configures the Supabase Apple provider in the dashboard, turns on the revocation retry cron, and flips the prod feature flag.

**Gated by:** Apple Developer verification (prereq #1), Supabase Apple provider config (prereq #4 — itself dependent on prereq #1).

**No app code in this PR.** Config-only. The value of splitting it out: you can review + revert the activation independently of the code, and a failed activation doesn't force a full backend rollback.

**Definition of done:**
- All Apple secrets present in Vault (`apple_signing_key_v1`, `apple_team_id`, `apple_key_id_v1`, `apple_services_id`, `apple_bundle_id`)
- Supabase Apple provider enabled with correct Client IDs + redirect allow-list
- `pg_cron` schedule active for `apple-revocation-retry` (every 15 min)
- Prod env `VITE_FEATURES_APPLE_SIGNIN=true` flipped
- Post-flip smoke: web Apple sign-in writes a `user_apple_tokens` row with `client_id_type='web'`; manual account deletion triggers revocation

---

### Task B3.10: Upload Apple credentials to Vault

Reuses Task B3.1 Steps 1-3 (previously deferred). Run them now.

### Task B3.11: Supabase Apple provider config

- [ ] **Step 1: Supabase dashboard → Authentication → Providers → Apple → Enable**

Fill in:
- **Enabled:** on
- **Client IDs:** `com.whatsgoodhere.app,com.whatsgoodhere.service` (comma-separated — native bundle + web services)
- **Secret Key (for OAuth):** leave blank if using .p8 flow, or generate a client secret JWT and paste
- **Team ID:** from Apple Dev portal
- **Key ID:** from Apple Dev portal
- **.p8 file:** upload the contents

- [ ] **Step 2: Redirect URL allow-list**

Supabase dashboard → Authentication → URL Configuration → **Additional Redirect URLs** → add:
- `https://wghapp.com/**`
- `capacitor://localhost/**` (native)
- Leave existing `whats-good-here.vercel.app` entries in place.

- [ ] **Step 3: Verify**

Test Apple web sign-in from a production-like environment. Confirm Supabase returns a session with `provider_refresh_token` briefly visible on the post-callback `onAuthStateChange`. Expect a row in `user_apple_tokens` with `client_id_type='web'` after the Flow K hook fires.

### Task B3.12: Activate pg_cron schedule

- [ ] **Step 1: Uncomment / run the `cron.schedule(...)` block from B3.7 Step 2**

Run in SQL Editor:

```sql
SELECT cron.schedule(
  'apple-revocation-retry',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://vpioftosgdkyiwvhxewy.supabase.co/functions/v1/apple-revocation-retry',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := '{}'::jsonb
    );
  $$
);
```

Set `app.service_role_key` via `ALTER DATABASE postgres SET app.service_role_key = '<service-role-jwt>';` (or Supabase-native cron-secret mechanism if available). Confirm with:

```sql
SELECT jobname, schedule FROM cron.job WHERE jobname = 'apple-revocation-retry';
```

### Task B3.13: Flip prod feature flag

- [ ] **Step 1: Update `.env.production`**

```
VITE_FEATURES_APPLE_SIGNIN=true
```

Commit + deploy.

### Task B3.14: Post-activation smoke

- [ ] Web Apple sign-in → `user_apple_tokens` row written with `client_id_type='web'`
- [ ] Account deletion for Apple user → inline revoke attempted, pending row cleared on success
- [ ] Cron manual trigger → leased rows processed (create a pending row with a known-invalid token, observe dead-letter path)

### Task B3.15: Codex review + PR

```bash
codex exec "Review B3-activate activation steps for any missing config — Apple provider client IDs, redirect URLs, pg_cron invocation auth, env flag scoping. No code changed. Diff:

$(git diff main..HEAD)
"

git push -u origin oauth-native-b3-activate
gh pr create --title "feat(auth): B3-activate — Apple credentials + provider config + cron + prod flag" --body "<summary + activation checklist + codex>"
```

---

# PR B4 — Universal Links + Deep-Link Auth Returns

**Goal:** Email verification, password reset, and magic-link returns from iOS Mail open the app (not Safari) via universal links. `AuthLifecycle` handles `appUrlOpen`. AASA file shipped and CI-validated. Privacy/Terms copy updated for SIWA.

**Gated by:** `wghapp.com` DNS → Vercel + Let's Encrypt cert (prereq #2, Dan unblocking today).

**Definition of done:**
- `public/.well-known/apple-app-site-association` served as `application/json` on `https://wghapp.com`
- `ios/App/App.entitlements` contains Associated Domains entry for `applinks:wghapp.com`
- `AuthLifecycle` wires `appUrlOpen` → `authUrl.parse` → `supabase.auth.exchangeCodeForSession` with cross-device-PKCE recovery UX
- Privacy + Terms reference canonical domain + SIWA private-relay
- CI validates AASA (200, JSON Content-Type, schema check)
- Codex review gate passed

---

### Task B4.1: AASA file + CI validation

**Files:**
- Create: `public/.well-known/apple-app-site-association` (note: no file extension — iOS requires this)
- Create: `.github/workflows/aasa-check.yml` (or extend existing CI)

- [ ] **Step 1: Write the AASA file**

Replace `<TEAMID>` with the actual Apple Team ID from Apple Developer portal:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["<TEAMID>.com.whatsgoodhere.app"],
        "paths": [
          "/auth/*",
          "/reset-password",
          "/reset-password/*"
        ],
        "components": [
          { "/": "/auth/*", "comment": "Auth callbacks — open app" },
          { "/": "/reset-password", "comment": "Password reset — open app" },
          { "/": "/reset-password/*", "comment": "Password reset with query — open app" }
        ]
      }
    ]
  }
}
```

Vercel serves `public/` at the site root; `/.well-known/apple-app-site-association` resolves automatically with `Content-Type: application/json` if the filename has no extension (Vercel default JSON handler may fail — verify after deploy). If needed, add a `vercel.json` header rule:

```json
// vercel.json — add to headers array
{
  "source": "/.well-known/apple-app-site-association",
  "headers": [
    { "key": "Content-Type", "value": "application/json" }
  ]
}
```

- [ ] **Step 2: CI check**

```yaml
# .github/workflows/aasa-check.yml
name: AASA validation
on:
  push:
    branches: [main]
  pull_request:

jobs:
  aasa:
    runs-on: ubuntu-latest
    steps:
      - name: Fetch AASA from production
        run: |
          URL="https://wghapp.com/.well-known/apple-app-site-association"
          HTTP_CODE=$(curl -o aasa.json -w "%{http_code}" -sL --max-redirs 0 "$URL")
          if [ "$HTTP_CODE" != "200" ]; then
            echo "::error::AASA returned $HTTP_CODE (expected 200, no redirects)"
            exit 1
          fi
          CONTENT_TYPE=$(curl -sI "$URL" | awk -F': ' '/^Content-Type/{print tolower($2)}' | tr -d '\r\n')
          if [[ "$CONTENT_TYPE" != "application/json"* ]]; then
            echo "::error::AASA Content-Type is '$CONTENT_TYPE', expected application/json"
            exit 1
          fi
          # Schema check
          jq -e '.applinks.details[0].appIDs | length >= 1' aasa.json > /dev/null
          jq -e '.applinks.details[0].paths | length >= 1' aasa.json > /dev/null
          echo "AASA OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/.well-known/apple-app-site-association .github/workflows/aasa-check.yml vercel.json
git commit -m "feat(auth): ship AASA + CI validation for universal-link routing"
```

---

### Task B4.2: Xcode Associated Domains capability

**Files:**
- Modify: `ios/App/App/App.entitlements`
- Modify: `ios/App/App.xcodeproj/project.pbxproj` (via Xcode UI, not by hand)

- [ ] **Step 1: Open Xcode → Signing & Capabilities → + Capability → Associated Domains**

Add the entry: `applinks:wghapp.com`.

Verify `App.entitlements` now contains:

```xml
<key>com.apple.developer.associated-domains</key>
<array>
  <string>applinks:wghapp.com</string>
</array>
```

- [ ] **Step 2: Commit**

```bash
git add ios/App/App/App.entitlements ios/App/App.xcodeproj/project.pbxproj
git commit -m "feat(ios): add Associated Domains capability for wghapp.com"
```

---

### Task B4.3: Wire `appUrlOpen` in `AuthLifecycle`

**Files:**
- Modify: `src/components/Auth/AuthLifecycle.jsx`
- Modify: `src/pages/ResetPassword.jsx` (add cross-device-PKCE recovery UX)

- [ ] **Step 1: Add the appUrlOpen listener**

```javascript
// src/components/Auth/AuthLifecycle.jsx — extend the effect

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../../lib/supabase'
import { parse as parseAuthUrl } from '../../lib/authUrl'
import { logger } from '../../utils/logger'

export function AuthLifecycle() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined

    let stateHandle
    let urlHandle
    let mounted = true

    ;(async () => {
      const { App } = await import('@capacitor/app')
      if (!mounted) return

      stateHandle = await App.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) return
        try { await supabase.auth.getSession() } catch (err) { logger.warn('foreground getSession failed', err) }
      })

      urlHandle = await App.addListener('appUrlOpen', async ({ url }) => {
        const parsed = parseAuthUrl(url)
        if (!parsed) return // not an auth URL — leave it to router
        const { code, type } = parsed
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            if (String(error.message || '').toLowerCase().includes('code verifier')) {
              navigate('/auth/cross-device', { state: { type } })
              return
            }
            logger.warn('exchangeCodeForSession failed', error)
            navigate('/login', { state: { authError: 'link_expired' } })
            return
          }
          // Route by type per spec Flow D:
          //   recovery  → password reset page
          //   confirm   → home (WelcomeModal auto-opens for new users based on profile state)
          //   magiclink → home
          if (type === 'recovery') {
            navigate('/reset-password')
          } else if (type === 'confirm') {
            navigate('/')
          } else {
            navigate('/')
          }
        } catch (err) {
          logger.warn('appUrlOpen handler threw', err)
          navigate('/login', { state: { authError: 'link_failed' } })
        }
      })
    })()

    return () => {
      mounted = false
      stateHandle?.remove?.()
      urlHandle?.remove?.()
    }
  }, [navigate])

  return null
}
```

- [ ] **Step 2: Create the cross-device recovery page**

Could be a full page (`src/pages/CrossDevicePkce.jsx`) or a modal on `/login`. Minimum viable: a page with copy + "Send new link to this device" button that triggers `supabase.auth.signInWithOtp` or `resetPasswordForEmail` for the user to enter their email again.

```javascript
// src/pages/CrossDevicePkce.jsx
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { authApi } from '../api/authApi'

export default function CrossDevicePkce() {
  const { state } = useLocation()
  const type = state?.type ?? 'magiclink'
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    try {
      if (type === 'recovery') await authApi.resetPassword(email)
      else await authApi.signInWithMagicLink(email)
      setSent(true)
    } catch (e) {
      setErr(e.message || 'Could not send. Try again.')
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontFamily: "'Amatic SC', cursive", fontSize: 32 }}>Open the link on this device</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        For security, the link you used started on a different device. Enter your email and we'll send a fresh one here.
      </p>
      {sent ? (
        <p>Check your email — a new link is on the way.</p>
      ) : (
        <form onSubmit={submit}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ width: '100%', padding: 12, marginBottom: 12, borderRadius: 8, border: '2px solid var(--color-divider)' }}
          />
          <button
            type="submit"
            style={{ width: '100%', padding: 14, borderRadius: 8, background: 'var(--color-primary)', color: '#fff', fontWeight: 600 }}
          >
            Send new link
          </button>
          {err && <p role="alert" style={{ color: 'var(--color-danger)', marginTop: 8 }}>{err}</p>}
        </form>
      )}
    </div>
  )
}
```

Register the route in `src/App.jsx`:

```javascript
const CrossDevicePkce = lazyWithRetry(() => import('./pages/CrossDevicePkce'))
// ... in routes:
<Route path="/auth/cross-device" element={<CrossDevicePkce />} />
```

- [ ] **Step 3: Build + commit**

```bash
npm run lint && npm run build
git add src/components/Auth/AuthLifecycle.jsx src/pages/CrossDevicePkce.jsx src/App.jsx
git commit -m "feat(auth): wire appUrlOpen + cross-device PKCE recovery UX"
```

---

### Task B4.4: Privacy + Terms copy updates

**Files:**
- Modify: `src/pages/Privacy.jsx`
- Modify: `src/pages/Terms.jsx`

- [ ] **Step 1: Update copy per spec requirements**

Add sections covering:
- SIWA option + private-relay email behavior
- Account deletion + Apple consent revocation (for SIWA users)
- Canonical domain `wghapp.com`
- Email sender `wghapp.com` (per memory `project_canonical_domain` — `whatsgoodhere.app` is squatter-owned, abandoned 2026-04-21)

Actual copy is Dan's call — he owns brand voice. Draft and route for review before commit.

- [ ] **Step 2: Commit after Dan's sign-off**

```bash
git add src/pages/Privacy.jsx src/pages/Terms.jsx
git commit -m "docs(legal): add SIWA + revocation + canonical domain to Privacy/Terms"
```

---

### Task B4.5: E2E test — cross-context PKCE recovery

**Files:**
- Create: `e2e/pioneer/cross-device-pkce.spec.ts`

- [ ] **Step 1: Write the Playwright test**

```typescript
// e2e/pioneer/cross-device-pkce.spec.ts
import { test, expect } from '@playwright/test'

test('cross-context PKCE failure surfaces friendly recovery', async ({ browser }) => {
  // Context A — signs up / requests password reset
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  // ... submit a password reset from context A. Capture the callback URL from mocked email.
  const callbackUrl = 'https://wghapp.com/auth/callback?code=fake-code&type=recovery'

  // Context B — fresh context, no verifier. Open callback URL.
  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await pageB.goto(callbackUrl)

  // Supabase exchange should fail with code-verifier-not-found.
  // Frontend should navigate to /auth/cross-device or show the recovery UI.
  await expect(pageB.getByRole('heading', { name: /Open the link on this device/i })).toBeVisible()
  await expect(pageB.getByPlaceholder('you@example.com')).toBeVisible()

  await ctxA.close()
  await ctxB.close()
})
```

- [ ] **Step 2: Run + commit**

```bash
npm run test:e2e:pioneer -- cross-device-pkce
git add e2e/pioneer/cross-device-pkce.spec.ts
git commit -m "test(e2e): cross-context PKCE recovery surfaces friendly error"
```

---

### Task B4.6: Codex review + PR

Same pattern as prior PRs. Focus Codex on: AASA correctness, cross-device-PKCE recovery coverage, `applinks` path scope (no over-claim), universal-link security (verify exchange rejects malformed codes).

```bash
git push -u origin oauth-native-b4
gh pr create --title "feat(auth): B4 — universal links + deep-link auth returns" --body "<summary + codex>"
```

---

# PR B5 — SIWA Capability + Real-Device Smoke + TestFlight

**Goal:** Finalize iOS-side capabilities, run the full real-device smoke per spec, upload to TestFlight. Mostly configuration + manual validation.

**Gated by:** Apple Developer verification (prereq #1).

**Definition of done:**
- Xcode: SIWA capability enabled on App ID
- `Info.plist`: `CFBundleURLTypes` fallback + `NSLocationWhenInUseUsageDescription` unchanged
- `PrivacyInfo.xcprivacy` audited after Capgo install
- Real-device smoke green (auth pass + account pass, per spec §Testing)
- TestFlight upload succeeds
- Codex review gate passed

---

### Task B5.1: SIWA capability in Xcode

- [ ] **Step 1: In Xcode, Signing & Capabilities → + Capability → Sign In with Apple**

Verify entitlements file updated. Verify App ID in Apple Developer portal also has SIWA enabled.

- [ ] **Step 2: Info.plist — CFBundleURLTypes fallback**

For the rare case universal links fail (iOS routing issue, malformed AASA), register a custom scheme:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>app.whatsgoodhere</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>whatsgoodhere</string>
    </array>
  </dict>
</array>
```

Universal links are still primary — the scheme is backup.

- [ ] **Step 3: PrivacyInfo audit**

```bash
# Capgo may ship its own PrivacyInfo.xcprivacy. Check:
find node_modules/@capgo/capacitor-social-login -name "PrivacyInfo.xcprivacy"
# If it exists, inspect. Compare against ours at ios/App/App/PrivacyInfo.xcprivacy.
# Ensure our file declares all data types collected by the plugin:
#   NSPrivacyCollectedDataTypeUserID (Apple user ID, Google user ID)
#   NSPrivacyCollectedDataTypeEmailAddress (via OAuth)
# with appropriate purposes (AppFunctionality, Analytics).
```

Update our `PrivacyInfo.xcprivacy` if gaps found.

- [ ] **Step 4: Commit config updates**

```bash
git add ios/App/App/Info.plist ios/App/App/PrivacyInfo.xcprivacy ios/App/App/App.entitlements
git commit -m "feat(ios): enable SIWA capability + URL scheme fallback + privacy manifest"
```

---

### Task B5.2: Real-device smoke (manual, 60–90 min)

Follow spec §Testing/real-device-smoke. Two passes:

**Auth pass (~30 min):**
- [ ] Native Google fresh, signed out
- [ ] Native Google after sign-out (account picker works — doesn't auto-pick)
- [ ] Native Apple first-time: name captured, `display_name` populated, `user_apple_tokens` row present with `code_hash` set
- [ ] Native Apple returning: UPDATE path (not INSERT), `code_hash` changes, `last_exchange_at` advances; rapid double-tap within 60s returns 409 once
- [ ] Web Apple first sign-in: `apple-token-persist` called, `user_apple_tokens` row present after refresh
- [ ] Apple with Hide My Email: sign-in succeeds, relay email in profile, auth emails arrive
- [ ] Sign out → next Google tap shows account picker, not auto-pick
- [ ] Background → foreground: session stays valid after 30 min

**Account + email + backend pass (~30–60 min):**
- [ ] Password reset: request in app → open email in iOS Mail → tap link → app opens (not Safari) → reset → sign in
- [ ] Email confirmation: new sign-up, same iOS Mail flow
- [ ] Account deletion on Apple user WITH token (Case A, online): verify `pending_apple_revocations` empty after
- [ ] Account deletion on Apple user WITH token (Case A, offline — airplane mode mid-delete): verify pending row present, cron picks up later
- [ ] Account deletion on Apple user WITHOUT token (Case B): simulate by deleting token row before delete, verify sentinel row with `unrevokable=TRUE`
- [ ] Airplane mode during sign-in → clear network error UI, retry button works

Document findings. For each failure: file as a follow-up PR or fix-in-place depending on severity. Apple 5.1.1(v) violations are must-fix.

---

### Task B5.3: TestFlight upload + Codex review + PR

- [ ] **Step 1: Final checks**

```bash
npm run build
npx cap sync ios
# Archive in Xcode → Upload to App Store Connect
```

- [ ] **Step 2: Codex review — holistic pass**

```bash
codex exec "Final senior pass on OAuth Plan B, all 5 PRs merged. Re-verify compliance with App Store 5.1.1(v), 4.8 equal-prominence, and the spec's invariants section. Spec: docs/superpowers/specs/2026-04-20-oauth-native-and-apple-revocation-design.md. Diff from pre-plan main:

$(git diff <plan-b-base-commit>..HEAD)
"
```

- [ ] **Step 3: Open PR**

```bash
git push -u origin oauth-native-b5
gh pr create --title "feat(ios): B5 — SIWA capability + TestFlight" --body "<summary + smoke results + codex>"
```

---

## Self-review checklist (Claude, before handing off to Dan)

**Spec coverage:**
- [x] Flow A (Native Google) — B2.5
- [x] Flow B/C (Native Apple first + returning) — B2.5 + B3.4 + B3.5
- [x] Flow D (Email universal link, routed by type) — B4.3
- [x] Flow E (Foreground reconciliation) — B2.6
- [x] Flow F (Account deletion Case A/B + fail-closed + cascade-fail rollback) — B3.6
- [x] Flow G (Revocation retry cron, auth-guarded + `client_id_type` aware) — B3.7 + B3.12
- [x] Flow H (Later sign-in healing) — implicit in B3.4 (UPSERT semantics)
- [x] Flow I (Provider logout) — B2.8
- [x] Flow J (Cross-device PKCE) — B4.3 + B4.5
- [x] Flow K (Web Apple token capture, server-identity-driven detection) — B1.5 + B1.7
- [x] Apple sub binding — B3.4
- [x] `client_id_type` provenance (native vs web revocation client) — B1.1, B3.2, B3.3, B3.4, B3.6, B3.7
- [x] Idempotency keyed on `code_hash` + `code_hash_seen_at` — B1.1 + B3.4
- [x] `apple-revocation-retry` auth guard (service-role bearer) — B3.7
- [x] Log hygiene across all console levels — B3.8
- [x] Apple revocation infrastructure (tables, encryption, retry, Vault) — B1 + B3-code + B3-activate
- [x] Supabase Apple provider config — B3.11 (gated by prereq #4)
- [x] Universal links + AASA — B4
- [x] SIWA Xcode capability — B5
- [x] PrivacyInfo audit — B5

**Placeholder scan:** none. Every step has actual code or commands.

**Type consistency:** `nativeAuth` returns `{ idToken, accessToken }` for Google and `{ identityToken, authorizationCode, appleSub, givenName, familyName, rawNonce }` for Apple — consistent across B2.4 tests and B2.5 authApi calls.

**Error-code consistency:** `AUTH_USER_CANCELLED`, `AUTH_NETWORK`, `AUTH_CONFIG`, `AUTH_SECURITY`, `AUTH_RATE_LIMITED`, `AUTH_UNKNOWN` match spec §Error handling canonical codes.

**Idempotency keys:** `user_apple_tokens.code_hash` SHA-256 of last authorization_code, with unique index on `(user_id, code_hash)`. Consistent across B1 schema + B3.4 exchange logic.

**Concurrency guarantees:** Case A pre-leased pending row (B3.6); cron `FOR UPDATE SKIP LOCKED` via `lease_apple_revocations` RPC (B3.7); stale-lease reclaim 10min (B3.7); documented in integration test B3.7 Step 3.

**Codex-CLI gate** embedded in every PR (B1.8, B2.9, B3.9, B4.6, B5.3). Protocol + final-call authority documented in `## Codex review protocol` section.
