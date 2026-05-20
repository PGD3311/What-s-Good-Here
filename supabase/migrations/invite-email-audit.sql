-- Invite email audit log
--
-- Why a new table (and not columns on restaurant_invites)?
-- An invite can be emailed multiple times (wrong address, lost, re-send after
-- a forward). Columns on restaurant_invites would only capture the LAST send
-- and silently lose retries + failure history. A separate event-log table
-- keeps the full audit trail (every successful send AND every failed attempt)
-- and is what Dan asked for: {invite_id, recipient_email, sent_at,
-- resend_message_id}, with status/error fields added so failures are auditable
-- alongside successes.

CREATE TABLE IF NOT EXISTS invite_email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id UUID NOT NULL REFERENCES restaurant_invites(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  sent_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  resend_message_id TEXT,
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_invite_email_sends_invite ON invite_email_sends(invite_id);
CREATE INDEX IF NOT EXISTS idx_invite_email_sends_sent_by ON invite_email_sends(sent_by, sent_at DESC);

ALTER TABLE invite_email_sends ENABLE ROW LEVEL SECURITY;

-- Admins read all; only the service role (via the edge function) writes.
CREATE POLICY "Admins view invite email sends"
  ON invite_email_sends FOR SELECT
  USING (is_admin());

-- Rate limit RPC: 20 sends per hour per admin. Wraps the shared limiter.
CREATE OR REPLACE FUNCTION check_invite_email_rate_limit()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT check_and_record_rate_limit('invite_email', 20, 3600);
$$;

GRANT EXECUTE ON FUNCTION check_invite_email_rate_limit TO authenticated;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS check_invite_email_rate_limit();
-- DROP TABLE IF EXISTS invite_email_sends;
