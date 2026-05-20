// send-invite-email
//
// Sends a restaurant manager invite email via Resend.
//
// Inputs (JSON body):
//   invite_id: UUID of the row in restaurant_invites (admin already minted it)
//   invite_url: full /invite/:token URL the admin already resolved client-side
//   recipient_email: address to send to
//
// Contracts (per Dan):
//   - This function does NOT mint tokens. The admin flow inserts the
//     restaurant_invites row first; we only send.
//   - Sender: wghapp@wghapp.com (DKIM/SPF/DMARC verified on Resend).
//   - Reply-to: wghapp@wghapp.com.
//   - Body copy reused verbatim from the mailto: handler in
//     src/pages/Admin.jsx (the explainer is calibrated for restaurant
//     owners who haven't heard of us). Keep these two strings in sync.
//   - Rate limit: 20 sends/hour per admin (RPC).
//   - Every attempt — success and failure — is recorded in
//     invite_email_sends for audit.
//   - On Resend error we return a structured error so the UI can fall
//     back to "Copy link". No catch-and-swallow.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SENDER = 'What\'s Good Here <wghapp@wghapp.com>'
const REPLY_TO = 'wghapp@wghapp.com'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function json(body: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function buildBody(restaurantName: string, inviteUrl: string): string {
  // Keep in sync with src/pages/Admin.jsx mailto handler.
  return [
    `Hi,`,
    ``,
    `You've been invited to manage ${restaurantName} on What's Good Here — a mobile-first food discovery app for Martha's Vineyard.`,
    ``,
    `Once you accept, you'll be able to:`,
    `  • Add your menu (paste text or upload a PDF — we'll parse it automatically)`,
    `  • Update dish names, prices, and photos`,
    `  • Post specials (happy hour, daily deals)`,
    `  • Schedule events (live music, trivia nights)`,
    ``,
    `Click the link below to get started. The link expires in 7 days.`,
    ``,
    inviteUrl,
    ``,
    `Questions? Just reply to this email.`,
    ``,
    `— The What's Good Here team`,
  ].join('\n')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    if (!RESEND_API_KEY) {
      return json({ ok: false, error_code: 'config_missing', message: 'RESEND_API_KEY not configured' }, 500, req)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // --- Auth gate: require an authenticated admin ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ ok: false, error_code: 'unauthorized', message: 'Missing Authorization header' }, 401, req)

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return json({ ok: false, error_code: 'unauthorized', message: 'Invalid session' }, 401, req)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: admin } = await supabase
      .from('admins')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!admin) return json({ ok: false, error_code: 'forbidden', message: 'Admin only' }, 403, req)

    // --- Parse + validate input ---
    let payload: { invite_id?: string; invite_url?: string; recipient_email?: string }
    try {
      payload = await req.json()
    } catch {
      return json({ ok: false, error_code: 'bad_request', message: 'Invalid JSON body' }, 400, req)
    }
    const { invite_id, invite_url, recipient_email } = payload

    if (!invite_id || typeof invite_id !== 'string') {
      return json({ ok: false, error_code: 'bad_request', message: 'invite_id is required' }, 400, req)
    }
    if (!invite_url || typeof invite_url !== 'string' || !invite_url.startsWith('http')) {
      return json({ ok: false, error_code: 'bad_request', message: 'invite_url must be an http(s) URL' }, 400, req)
    }
    if (!recipient_email || !EMAIL_RE.test(recipient_email)) {
      return json({ ok: false, error_code: 'bad_request', message: 'recipient_email is not a valid email' }, 400, req)
    }

    // --- Look up the invite + restaurant ---
    // We trust the DB row, not the client, for restaurant_name and token. The
    // invite_url must contain the matching token so we never email a URL that
    // points to a different invite.
    const { data: invite, error: inviteErr } = await supabase
      .from('restaurant_invites')
      .select('id, token, restaurants:restaurant_id (name)')
      .eq('id', invite_id)
      .maybeSingle()

    if (inviteErr || !invite) {
      return json({ ok: false, error_code: 'invite_not_found', message: 'Invite not found' }, 404, req)
    }
    if (!invite_url.includes(invite.token)) {
      return json({ ok: false, error_code: 'invite_url_mismatch', message: 'invite_url does not match the token for this invite_id' }, 400, req)
    }

    // deno-lint-ignore no-explicit-any
    const restaurantName = (invite.restaurants as any)?.name || 'your restaurant'

    // --- Rate limit (20/hour/admin) ---
    const { data: limitData } = await supabaseAuth.rpc('check_invite_email_rate_limit')
    if (limitData && limitData.allowed === false) {
      return json({
        ok: false,
        error_code: 'rate_limited',
        message: limitData.message || 'Rate limit exceeded',
        retry_after_seconds: limitData.retry_after_seconds,
      }, 429, req)
    }

    // --- Send via Resend ---
    const body = buildBody(restaurantName, invite_url)
    const subject = `You're invited to manage ${restaurantName} on What's Good Here`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: SENDER,
        to: [recipient_email],
        reply_to: REPLY_TO,
        subject,
        text: body,
      }),
    })

    const resendBody = await resendRes.json().catch(() => ({}))

    if (!resendRes.ok) {
      const errorCode = resendBody?.name || `resend_${resendRes.status}`
      const errorMessage = resendBody?.message || `Resend returned ${resendRes.status}`
      // Audit the failure so admin attempts are visible even when delivery fails.
      await supabase.from('invite_email_sends').insert({
        invite_id,
        recipient_email,
        sent_by: user.id,
        status: 'failed',
        error_code: errorCode,
        error_message: errorMessage,
      })
      return json({ ok: false, error_code: errorCode, message: errorMessage }, 502, req)
    }

    const messageId = resendBody?.id || null

    // Audit fire-and-forget — the email already sent, so don't make the user
    // wait on a DB write that doesn't affect outcome. Failure is logged for
    // Sentry visibility but the response goes out immediately.
    supabase.from('invite_email_sends').insert({
      invite_id,
      recipient_email,
      sent_by: user.id,
      status: 'sent',
      resend_message_id: messageId,
    }).then(({ error: auditErr }) => {
      if (auditErr) console.error('Audit log insert failed after successful send:', auditErr)
    })

    return json({ ok: true, message_id: messageId }, 200, req)
  } catch (err) {
    console.error('send-invite-email unexpected error:', err)
    return json({ ok: false, error_code: 'internal_error', message: (err as Error).message || 'Internal error' }, 500, req)
  }
})
