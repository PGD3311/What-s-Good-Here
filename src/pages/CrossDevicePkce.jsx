import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { authApi } from '../api/authApi'
import { logger } from '../utils/logger'

export default function CrossDevicePkce() {
  const { state } = useLocation()
  const type = state?.type ?? 'magiclink'
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (type === 'recovery') {
        await authApi.resetPassword(email)
      } else {
        await authApi.signInWithMagicLink(email)
      }
      setSent(true)
    } catch (err) {
      logger.warn('CrossDevicePkce submit failed', err)
      setError(err?.message || 'Could not send. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: '0 auto', minHeight: '100vh' }}>
      <h1
        style={{
          fontFamily: "'Amatic SC', cursive",
          fontSize: 36,
          color: 'var(--color-text-primary)',
          marginBottom: 12,
        }}
      >
        Open the link on this device
      </h1>
      <p
        style={{
          color: 'var(--color-text-secondary)',
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        For security, the link you used started on a different device. Enter your email and we'll send a fresh one here.
      </p>
      {sent ? (
        <p style={{ color: 'var(--color-text-primary)' }}>Check your email — a new link is on the way.</p>
      ) : (
        <form onSubmit={submit}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={submitting}
            style={{
              width: '100%',
              padding: 12,
              marginBottom: 12,
              borderRadius: 8,
              border: '2px solid var(--color-divider, #ddd)',
              fontFamily: 'inherit',
              fontSize: 16,
            }}
          />
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: 14,
              borderRadius: 8,
              background: 'var(--color-primary)',
              color: '#fff',
              fontWeight: 600,
              border: 'none',
              cursor: submitting ? 'wait' : 'pointer',
              fontSize: 16,
            }}
          >
            {submitting ? 'Sending…' : 'Send new link'}
          </button>
          {error && (
            <p
              role="alert"
              style={{ color: 'var(--color-danger)', marginTop: 8 }}
            >
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  )
}
