import { useNavigate } from 'react-router-dom'
import { WghSeal } from '../components/WghSeal'

export function Support() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-surface)' }}>
      {/* Header */}
      <header className="px-4 py-4" style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-divider)' }}>
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm font-medium"
            style={{ color: 'var(--color-primary)' }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Support
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex justify-center mb-6">
          <WghSeal size={96} />
        </div>
        <div className="rounded-2xl p-6 space-y-6" style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-divider)' }}>
          <section>
            <h2
              className="mb-3"
              style={{
                fontFamily: "'Amatic SC', cursive",
                color: 'var(--color-text-primary)',
                fontSize: '32px',
                fontWeight: 700,
                letterSpacing: '0.02em',
                lineHeight: 1.1,
              }}
            >
              How can we help?
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              What's Good Here is a small operation on Martha's Vineyard. If you run into
              something broken, want to report content, need to change your account, or
              just want to talk about dishes — get in touch below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Email us
            </h2>
            <p className="leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              The fastest way to reach us:
            </p>
            <a
              href="mailto:hello@wghapp.com"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold"
              style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)', fontSize: '14px' }}
            >
              hello@wghapp.com
            </a>
            <p className="leading-relaxed mt-3" style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              We read every email. Typical response time: 1-2 business days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Common questions
            </h2>
            <div className="space-y-4 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              <div>
                <h3 className="font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>I want to delete my account.</h3>
                <p>
                  Open the app, tap the gear icon (Settings), and choose <strong>Delete Account</strong>.
                  Deletion is immediate and permanent — it removes your votes, reviews, photos,
                  favorites, playlists, and profile.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>I want to report a review, photo, or user.</h3>
                <p>
                  Every review, photo, dish, and user profile has a <strong>Report</strong>
                  control — a small ellipsis button on review cards, a Report button in the
                  photo lightbox, the three-dot menu on user profiles. Reports go to our
                  moderation queue and we aim to review them within 48 hours.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>I own a restaurant on the app. Can I manage it?</h3>
                <p>
                  Yes. See{' '}
                  <a
                    href="/for-restaurants"
                    className="font-medium"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    wghapp.com/for-restaurants
                  </a>
                  {' '}or email us to claim your restaurant and get access to the manager portal.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>Something's wrong with a dish or restaurant listing.</h3>
                <p>
                  Use the <strong>Report</strong> control on the dish page (the small
                  ellipsis button next to the action bar), or email us at the address above
                  with the link and what's off. We fix data issues quickly.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>I forgot my password.</h3>
                <p>
                  On the login screen, choose <strong>Forgot password?</strong>. We'll email
                  you a reset link.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>How do ratings work?</h3>
                <p>
                  See{' '}
                  <a
                    href="/how-reviews-work"
                    className="font-medium"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    wghapp.com/how-reviews-work
                  </a>
                  {' '}for the full breakdown.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Privacy and Terms
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Read our{' '}
              <a href="/privacy" className="font-medium" style={{ color: 'var(--color-primary)' }}>
                Privacy Policy
              </a>
              {' '}and{' '}
              <a href="/terms" className="font-medium" style={{ color: 'var(--color-primary)' }}>
                Terms of Service
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Who runs this
            </h2>
            <p className="leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              What's Good Here is operated by Daniel Walsh from Martha's Vineyard,
              Massachusetts. An actual person reads every email — your messages don't
              go into a ticketing black hole.
            </p>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Mailing address available on written request via the email above.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
