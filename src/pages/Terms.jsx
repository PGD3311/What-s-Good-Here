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
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Last updated: April 18, 2026</p>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Welcome to What's Good Here
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              These Terms of Service ("Terms") govern your use of the What's Good Here app and
              website ("Service"), operated by Daniel Walsh. By using the Service, you agree to
              these Terms. If you don't agree, please don't use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              What We Do
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              What's Good Here is a community-driven platform that helps people discover great
              dishes on Martha's Vineyard. Users rate dishes, write reviews, upload photos, and
              we aggregate those signals to create rankings that help others find the best food.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Your Account
            </h2>
            <div className="space-y-3 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              <p>
                To vote, review, or upload photos, you need an account. You're responsible for
                keeping your account secure and for all activity under your account.
              </p>
              <p>
                You must provide accurate information when creating your account. One account per
                person, please — creating multiple accounts to manipulate ratings is not allowed.
              </p>
              <p>
                You can delete your account anytime from the in-app settings menu (tap the
                gear icon, then <strong>Delete Account</strong>).
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
              <li>Be honest — your votes help others make decisions</li>
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
              We try to keep restaurant information (hours, location, menus) accurate, but we
              can't guarantee it's always up to date. Please verify details with the restaurant
              directly, especially for special hours or closures.
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
              <li>Post spam, hate speech, or misleading content</li>
              <li>Post sexually explicit or violent content</li>
              <li>Attempt to access accounts that aren't yours</li>
              <li>Scrape data or interfere with the Service's operation</li>
              <li>Violate any laws</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Moderation, Reporting, and Blocking
            </h2>
            <div className="space-y-3 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              <p>
                If you see a review, photo, dish, or user that violates these Terms, the app
                provides a way to report it. Reports go to our moderation queue and we aim to
                review them within 48 hours. We may remove content, warn users, or terminate
                accounts depending on severity.
              </p>
              <p>
                The app also lets you block another user. When you block someone, you will no
                longer see their reviews, ratings, or photos, and they won't see yours. You can
                review and manage your block list from within the app.
              </p>
              <p>
                We do not tolerate objectionable content. Accounts that post harassing, abusive,
                or illegal content may be terminated without notice.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Your Content
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              You retain ownership of the reviews, ratings, and photos you submit. By posting
              content to the Service, you grant us a worldwide, non-exclusive, royalty-free
              license to display, store, and distribute that content as part of operating the
              Service. This license ends when you delete the content or your account, except
              to the extent others have already relied on the content (for example, aggregated
              ratings already factored into rankings).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Intellectual Property
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              The What's Good Here name, logo, seal, and app design are our property. The
              aggregated ratings and rankings are community-generated content. You may not use
              our name or branding in a way that suggests endorsement without written permission.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Disclaimer
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              The Service is provided "as is" without warranties of any kind. We're not
              responsible for your dining experiences — ratings reflect community opinions and
              your experience may differ. We're not affiliated with the restaurants listed
              unless explicitly stated.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Limitation of Liability
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              To the maximum extent permitted by law, we won't be liable for any indirect,
              incidental, or consequential damages arising from your use of the Service. Our
              total liability is limited to the amount you paid us (which is zero, since the
              app is free).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              App Store Terms (iOS)
            </h2>
            <div className="space-y-3 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              <p>
                If you downloaded the iOS app from the Apple App Store, you acknowledge:
              </p>
              <ul className="list-disc list-inside space-y-2">
                <li>These Terms are between you and Daniel Walsh, not Apple. Apple is not responsible for the app or its content.</li>
                <li>You are granted a limited, non-transferable, non-exclusive license to install and use the app only on Apple-branded devices that you own or control, and as permitted by the App Store Terms of Service.</li>
                <li>Apple has no obligation to provide maintenance or support for the app.</li>
                <li>If the app fails to conform to any applicable warranty, you may notify Apple for a refund of the purchase price (if any). Apple has no other warranty obligations.</li>
                <li>Any claims relating to the app (product liability, consumer protection, non-conformity) are our responsibility, not Apple's.</li>
                <li>Any third-party intellectual property claims are our responsibility, not Apple's.</li>
                <li>You must comply with any applicable third-party terms when using the app (for example, your wireless carrier's terms).</li>
                <li>Apple and Apple's subsidiaries are third-party beneficiaries of these Terms and may enforce them against you.</li>
                <li>You represent that you are not located in a country subject to U.S. government embargo or designated as a "terrorist supporting" country, and you are not on any U.S. government list of prohibited or restricted parties.</li>
                <li>Any questions or complaints about the app should be directed to{' '}
                  <a
                    href="mailto:hello@whatsgoodhere.app"
                    className="font-medium"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    hello@whatsgoodhere.app
                  </a>
                  .
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Governing Law
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              These Terms are governed by the laws of the Commonwealth of Massachusetts, without
              regard to its conflict-of-laws rules. Any disputes will be resolved in the state
              or federal courts located in Massachusetts.
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
              You can stop using the Service at any time and delete your account from the
              in-app settings menu. We may suspend or terminate accounts that violate these
              Terms. Upon termination, your right to use the Service ends, but these Terms
              will continue to apply to past use.
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
