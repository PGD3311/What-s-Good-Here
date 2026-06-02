// supabase/functions/_shared/apple.test.ts
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  base64UrlToBytes,
  decodeIdToken,
  decryptRefreshToken,
  encryptRefreshToken,
  loadAppleConfig,
  signClientSecretJWT,
} from './apple.ts';

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

// B3-activate gate: this test requires the following Vault secrets to be
// populated (deferred until Apple Developer verification is complete):
//   apple_team_id, apple_key_id_v1, apple_bundle_id, apple_signing_key_v1
// Once B3-activate ships, remove the .ignore and run with --allow-net --allow-env.
Deno.test.ignore(
  'signClientSecretJWT produces a well-formed ES256 JWT',
  async () => {
    const cfg = await loadAppleConfig('native');
    const jwt = await signClientSecretJWT(cfg);
    const parts = jwt.split('.');
    assertEquals(parts.length, 3);
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])));
    assertEquals(header.alg, 'ES256');
    assert(header.kid);
  },
);

// exchangeAuthorizationCode + revokeToken tests require a mock Apple endpoint.
// These move to the apple-token-exchange integration tests, which mock via
// fetch interceptor or test-only Apple fixture server.
