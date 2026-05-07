import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Seal } from '../components/Seal'
import { waitlistApi } from '../api/waitlistApi'
import { getUserMessage } from '../utils/errorHandler'
import { logger } from '../utils/logger'

/**
 * Waitlist — pre-launch landing page.
 *
 * Captures email signups during the App Store review wait. Linked from
 * social posts and any external marketing during the run-up to launch.
 *
 * Optional `?source=X` query param tracks which campaign drove the signup.
 *
 * Route: /waitlist
 */
export default function Waitlist() {
  const [searchParams] = useSearchParams()
  const source = searchParams.get('source') || 'web'

  const [email, setEmail] = useState('')
  // Honeypot — bots fill all visible inputs; real users won't see this one.
  // If it's non-empty on submit we silently "succeed" without writing.
  const [honeypot, setHoneypot] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'submitting' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState(null)
  const [normalizedEmail, setNormalizedEmail] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (status === 'submitting') return

    setStatus('submitting')
    setErrorMessage(null)

    if (honeypot.trim() !== '') {
      // Naive bot — pretend we accepted but don't actually write.
      setNormalizedEmail(email.trim().toLowerCase())
      setStatus('success')
      return
    }

    try {
      const result = await waitlistApi.join({ email, source })
      setNormalizedEmail(result.email)
      setStatus('success')
    } catch (error) {
      logger.error('Waitlist submit failed:', error)
      // Validation errors carry their own user-readable messages — surface
      // verbatim. Other errors go through the generic classifier.
      const message =
        error?.kind === 'validation'
          ? error.message
          : getUserMessage(error, 'joining the waitlist')
      setErrorMessage(message)
      setStatus('error')
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--color-bg)' }}
    >
      <main
        className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center"
        style={{ maxWidth: '560px', margin: '0 auto', width: '100%' }}
      >
        <div className="mb-8">
          <Seal size={88} ariaLabel="What's Good Here" />
        </div>

        <h1
          className="mb-4"
          style={{
            fontFamily: "'Amatic SC', cursive",
            fontWeight: 700,
            fontSize: '52px',
            lineHeight: 1.05,
            letterSpacing: '0.01em',
            color: 'var(--color-text-primary)',
          }}
        >
          What's <span style={{ color: 'var(--color-accent-gold)' }}>Good</span> Here
        </h1>

        <p
          className="mb-3"
          style={{
            color: 'var(--color-text-primary)',
            fontSize: '20px',
            fontWeight: 600,
            lineHeight: 1.3,
          }}
        >
          The lobster roll question, finally answered.
        </p>

        <p
          className="mb-10"
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: '16px',
            lineHeight: 1.6,
            maxWidth: '440px',
          }}
        >
          Coming soon to Martha's Vineyard. The local guide to what to actually
          order — a ranked dish list, built from real community ratings.
        </p>

        {status === 'success' ? (
          <SuccessState email={normalizedEmail} />
        ) : (
          <form
            onSubmit={handleSubmit}
            className="w-full"
            style={{ maxWidth: '420px' }}
            noValidate
          >
            {/* Honeypot — visually hidden, accessibility hidden, but in the
                DOM so naive bots fill it. Do NOT use display:none (some bots
                skip those); use absolute off-screen positioning. */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '-9999px',
                width: '1px',
                height: '1px',
                overflow: 'hidden',
              }}
            >
              <label htmlFor="waitlist-website">
                Leave this field empty
                <input
                  id="waitlist-website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(event) => setHoneypot(event.target.value)}
                />
              </label>
            </div>

            <label htmlFor="waitlist-email" className="sr-only">
              Email address
            </label>
            <input
              id="waitlist-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              maxLength={320}
              disabled={status === 'submitting'}
              className="w-full px-4 py-3 rounded-xl mb-3"
              style={{
                background: 'var(--color-surface-elevated)',
                border: '2px solid var(--color-divider)',
                color: 'var(--color-text-primary)',
                fontSize: '16px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={status === 'submitting' || !email.trim()}
              className="w-full px-6 py-3 rounded-xl font-semibold active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'var(--color-primary)',
                color: 'var(--color-text-on-primary, #FFFFFF)',
                fontSize: '16px',
                minHeight: 48,
              }}
            >
              {status === 'submitting' ? 'Adding you…' : 'Get on the list'}
            </button>

            {status === 'error' && errorMessage && (
              <p
                role="alert"
                className="mt-3 text-sm"
                style={{ color: 'var(--color-danger)' }}
              >
                {errorMessage}
              </p>
            )}

            <p
              className="mt-3 text-xs"
              style={{ color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}
            >
              By joining, you agree to our{' '}
              <a
                href="/privacy"
                style={{ color: 'var(--color-text-tertiary)' }}
                className="underline"
              >
                Privacy Policy
              </a>{' '}
              and{' '}
              <a
                href="/terms"
                style={{ color: 'var(--color-text-tertiary)' }}
                className="underline"
              >
                Terms
              </a>
              . We'll email you once when the app lands. No spam, unsubscribe anytime.
            </p>
          </form>
        )}
      </main>

      <footer
        className="px-6 py-6 text-center text-sm"
        style={{
          color: 'var(--color-text-tertiary)',
          borderTop: '1px solid var(--color-divider)',
        }}
      >
        <a
          href="/privacy"
          style={{ color: 'var(--color-text-tertiary)' }}
          className="underline mr-4"
        >
          Privacy
        </a>
        <a
          href="/terms"
          style={{ color: 'var(--color-text-tertiary)' }}
          className="underline"
        >
          Terms
        </a>
      </footer>
    </div>
  )
}

function SuccessState({ email }) {
  return (
    <div
      className="w-full rounded-2xl p-6 text-center"
      style={{
        maxWidth: '420px',
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-divider)',
      }}
    >
      <div
        style={{
          fontFamily: "'Amatic SC', cursive",
          fontWeight: 700,
          fontSize: '32px',
          color: 'var(--color-accent-gold)',
          lineHeight: 1.1,
          marginBottom: '8px',
        }}
      >
        You're in.
      </div>
      <p
        className="text-sm"
        style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}
      >
        We'll email <strong style={{ color: 'var(--color-text-primary)' }}>{email}</strong> the
        moment the app lands.
      </p>
    </div>
  )
}
