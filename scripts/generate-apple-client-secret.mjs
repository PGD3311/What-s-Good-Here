#!/usr/bin/env node
/**
 * Generate the Apple Sign-In client-secret JWT for the Supabase Auth
 * dashboard's "Secret Key (for OAuth)" field.
 *
 * Apple won't accept the raw .p8 here — they want a JWT signed with it,
 * with specific claims. Apple's spec caps the JWT lifetime at 6 months;
 * regenerate before it expires (calendar reminder ~5 months out).
 *
 * No npm dependencies — uses Node's built-in crypto.
 *
 * Usage:
 *   node scripts/generate-apple-client-secret.mjs ~/Downloads/AuthKey_<KEYID>.p8
 *
 * Output: the JWT on stdout. Copy the entire single-line string into
 * Supabase Auth → Providers → Apple → Secret Key (for OAuth).
 */
import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'

const TEAM_ID = 'K447QTHBR9'
// Key ID rotated 2026-05-08 from JXT4ZZQW67 (revoked due to chat exposure)
// to 9LL6V25287. The old key is dead in Apple's system; old JWTs signed
// with it return invalid_client.
const KEY_ID = '9LL6V25287'
const SERVICES_ID = 'com.whatsgoodhere.service'
const TTL_SECONDS = 180 * 24 * 3600 // 180 days — Apple's max JWT lifetime

const p8Path = process.argv[2]
if (!p8Path) {
  console.error(
    'Usage: node scripts/generate-apple-client-secret.mjs <path-to-.p8>',
  )
  process.exit(1)
}

const privateKey = readFileSync(p8Path, 'utf8')

const header = { alg: 'ES256', kid: KEY_ID }
const now = Math.floor(Date.now() / 1000)
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: now + TTL_SECONDS,
  aud: 'https://appleid.apple.com',
  sub: SERVICES_ID,
}

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString('base64url')

const signingInput = `${b64url(header)}.${b64url(payload)}`

const signature = createSign('SHA256')
  .update(signingInput)
  .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
  .toString('base64url')

console.log(`${signingInput}.${signature}`)
