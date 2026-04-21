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
  // Version-byte check comes BEFORE Vault load — fail-fast on malformed
  // ciphertext without burning a Vault round-trip, and keeps the
  // version-rejection test self-contained (no credentials required).
  const all = base64ToBytes(ciphertext);
  const version = all[0];
  if (version !== 1) {
    throw new Error(`Unsupported ciphertext version: ${version}`);
  }
  const key = await loadMasterKey(keyVersion);
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
  const parts = jwt.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('Malformed JWT');
  }
  const json = new TextDecoder().decode(base64UrlToBytes(parts[1]));
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
