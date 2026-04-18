import { useNavigate } from 'react-router-dom'
import { WghSeal } from '../components/WghSeal'

export function Terms() {
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
            Terms of Service
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex justify-center mb-6">
          <WghSeal size={96} />
        </div>
        <div className="rounded-2xl p-6 space-y-6" style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-divider)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Last updated: January 2025</p>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Welcome to What's Good Here
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              These Terms of Service ("Terms") govern your use of the What's Good Here app and
              website ("Service"). By using the Service, you agree to these Terms. If you don't
              agree, please don't use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              What We Do
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              What's Good Here is a community-driven platform that helps people discover great
              dishes on Martha's Vineyard. Users rate dishes, and we aggregate those ratings to
              create rankings that help others find the best food.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Your Account
            </h2>
            <div className="space-y-3 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              <p>
                To vote on dishes, you need to create an account. You're responsible for keeping
                your account secure and for all activity under your account.
              </p>
              <p>
                You must provide accurate information when creating your account. One account per
                person, please - creating multiple accounts to manipulate ratings is not allowed.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Voting Guidelines
            </h2>
            <p className="leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              When rating dishes, please:
            </p>
            <ul className="list-disc list-inside space-y-2" style={{ color: 'var(--color-text-secondary)' }}>
              <li>Only rate dishes you've actually tried</li>
              <li>Be honest - your votes help others make decisions</li>
              <li>Don't create fake votes to promote or demote specific dishes</li>
              <li>Don't ask others to vote in a coordinated way to manipulate rankings</li>
            </ul>
            <p className="leading-relaxed mt-3" style={{ color: 'var(--color-text-secondary)' }}>
              We reserve the right to remove votes or accounts that appear to be gaming the system.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Restaurant Information
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              We try to keep restaurant information (hours, location, etc.) accurate, but we can't
              guarantee it's always up to date. Please verify details with the restaurant directly,
              especially for special hours or closures.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Acceptable Use
            </h2>
            <p className="leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Don't use the Service to:
            </p>
            <ul className="list-disc list-inside space-y-2" style={{ color: 'var(--color-text-secondary)' }}>
              <li>Harass, abuse, or harm others</li>
              <li>Post spam or misleading content</li>
              <li>Attempt to access accounts that aren't yours</li>
              <li>Scrape data or interfere with the Service's operation</li>
              <li>Violate any laws</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Intellectual Property
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              The What's Good Here name, logo, and app design are our property. The aggregated
              ratings and rankings are community-generated content. You retain rights to any
              personal content you submit, but you grant us a license to use it as part of
              the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Disclaimer
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              The Service is provided "as is" without warranties of any kind. We're not responsible
              for your dining experiences - ratings reflect community opinions and your experience
              may differ. We're not affiliated with the restaurants listed unless explicitly stated.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Limitation of Liability
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              To the maximum extent permitted by law, we won't be liable for any indirect,
              incidental, or consequential damages arising from your use of the Service.
              Our total liability is limited to the amount you paid us (which is zero, since
              the app is free).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Changes to These Terms
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              We may update these Terms from time to time. If we make significant changes,
              we'll notify you through the app. Continuing to use the Service after changes
              means you accept the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Termination
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              You can stop using the Service at any time. We may suspend or terminate accounts
              that violate these Terms. Upon termination, your right to use the Service ends,
              but these Terms will continue to apply to past use.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Contact Us
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Questions about these Terms? Contact us at:{' '}
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
