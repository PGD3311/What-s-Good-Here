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
