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
