import { useNavigate } from 'react-router-dom'
import { WghSeal } from '../components/WghSeal'

export function Privacy() {
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
            Privacy Policy
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex justify-center mb-6">
          <WghSeal size={96} />
        </div>
        <div className="rounded-2xl p-6 space-y-6" style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-divider)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Last updated: April 2026</p>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Overview
            </h2>
            <p className="leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              What's Good Here is operated by Daniel Walsh. Contact:{' '}
              <a
                href="mailto:hello@whatsgoodhere.app"
                className="font-medium"
                style={{ color: 'var(--color-primary)' }}
              >
                hello@whatsgoodhere.app
              </a>
              .
            </p>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              What's Good Here ("we", "our", or "the app") is a community-driven food discovery platform
              for Martha's Vineyard. This Privacy Policy explains how we collect, use, and protect your
              information when you use our service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Information We Collect
            </h2>
            <div className="space-y-4 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              <div>
                <h3 className="font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>Account Information</h3>
                <p>When you create an account, we collect your email address and display name.
                If you sign in with Google, we receive your name and email from Google.</p>
              </div>
              <div>
                <h3 className="font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>User Content</h3>
                <p>We store the votes and ratings you submit for dishes, as well as any dishes
                you save to your favorites.</p>
              </div>
              <div>
                <h3 className="font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>Location Data</h3>
                <p>With your permission, we access your device's location to show nearby restaurants
                and dishes. This data is used only to provide location-based features and is not
                stored on our servers.</p>
              </div>
              <div>
                <h3 className="font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>Usage Analytics</h3>
                <p>We use PostHog to understand how people use the app. This includes pages visited,
                features used, and session recordings (with sensitive data automatically masked).
                This helps us improve the app experience.</p>
              </div>
              <div>
                <h3 className="font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>Error Tracking</h3>
                <p>We use Sentry to track errors and crashes. This helps us fix bugs quickly.
                Error reports may include technical information about your device and browser.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              How We Use Your Information
            </h2>
            <ul className="list-disc list-inside space-y-2" style={{ color: 'var(--color-text-secondary)' }}>
              <li>To provide and improve the app's features</li>
              <li>To display community ratings and rankings</li>
              <li>To show you relevant dishes and restaurants near you</li>
              <li>To track your voting history and saved dishes</li>
              <li>To fix bugs and improve app performance</li>
              <li>To understand how the app is being used</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Data Sharing
            </h2>
            <p className="leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              We do not sell your personal information. We share data only with:
            </p>
            <ul className="list-disc list-inside space-y-2" style={{ color: 'var(--color-text-secondary)' }}>
              <li><strong>Supabase</strong> - Our database and authentication provider</li>
              <li><strong>PostHog</strong> - For product analytics</li>
              <li><strong>Sentry</strong> - For error tracking</li>
              <li><strong>Vercel</strong> - Our hosting provider</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Your Votes Are Public
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              When you rate a dish, your vote contributes to the public ranking. While we don't
              display your name next to individual votes, your overall statistics (like total
              dishes rated) are visible on your profile.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Data Retention
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              You can delete your account anytime from Settings. Deletion is
              permanent and removes your votes, reviews, photos, favorites, and profile.
              Dish rankings that included your votes will be recalculated without them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Your Rights
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              You can access, update, or delete your profile information at any time through
              the app — including a full account deletion from Settings. For
              questions about your data, contact us at the email below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Changes to This Policy
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              We may update this Privacy Policy from time to time. We'll notify you of any
              significant changes by posting a notice in the app.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Contact Us
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              If you have questions about this Privacy Policy, please contact us at:{' '}
              <a
                href="mailto:hello@whatsgoodhere.app"
                className="font-medium"
                style={{ color: 'var(--color-primary)' }}
              >
                hello@whatsgoodhere.app
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
