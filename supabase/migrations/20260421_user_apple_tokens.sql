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
  -- (which is bumped by non-exchange writes like web token re-captures).
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
