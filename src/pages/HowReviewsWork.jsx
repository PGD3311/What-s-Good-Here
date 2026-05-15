import { useNavigate } from 'react-router-dom'
import { TrustBadge } from '../components/TrustBadge'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function HowReviewsWork() {
  useDocumentTitle('How reviews work')
  const navigate = useNavigate()

  return (
    <div className="min-h-screen pb-20" style={{ background: 'var(--color-bg)' }}>
      <header className="px-5 pt-6 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-sm font-medium mb-4"
          style={{ color: 'var(--color-primary)' }}
        >
          &#8592; Back
        </button>
        <h1
          className="font-bold"
          style={{ color: 'var(--color-text-primary)', fontSize: '26px', letterSpacing: '-0.02em' }}
        >
          How Our Reviews Work
        </h1>
      </header>

      <div className="px-5 space-y-8">
        {/* Section 1: AI-Estimated Ratings */}
        <section>
          <h2
            className="font-bold mb-3"
            style={{ color: 'var(--color-text-primary)', fontSize: '18px' }}
          >
            Getting Started with Real Data
          </h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            We analyzed real reviews from Google to give every restaurant initial ratings.
            AI reads what people said about specific dishes and translates their feedback into
            our 1-10 rating scale. These ratings are labeled clearly:
          </p>
          <div className="mb-3">
            <TrustBadge type="ai_estimated" size="md" />
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            As more locals and visitors rate dishes themselves, AI estimates are gradually
            replaced by real community ratings.
          </p>
        </section>

        {/* Section 2: Human Verification */}
        <section>
          <h2
            className="font-bold mb-3"
            style={{ color: 'var(--color-text-primary)', fontSize: '18px' }}
          >
            Verified Human Reviews
          </h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            Every review typed on What&apos;s Good Here is verified through behavioral analysis.
            We measure <strong style={{ color: 'var(--color-text-primary)' }}>how</strong> you type, not <strong style={{ color: 'var(--color-text-primary)' }}>what</strong> you type &mdash; your unique
            typing rhythm builds a profile over time, like a batting average that stabilizes
            with more at-bats.
          </p>
          <div className="space-y-2 mb-3">
            <div className="flex items-center gap-3">
              <TrustBadge type="building" size="md" />
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                New reviewers (1-4 reviews)
              </span>
            </div>
            <div className="flex items-center gap-3">
              <TrustBadge type="human_verified" size="md" />
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Consistent typing pattern (5+ reviews)
              </span>
            </div>
            <div className="flex items-center gap-3">
              <TrustBadge type="trusted_reviewer" size="md" />
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Highly consistent (15+ reviews)
              </span>
            </div>
          </div>
        </section>

        {/* Section 3: Why This Matters */}
        <section>
          <h2
            className="font-bold mb-3"
            style={{ color: 'var(--color-text-primary)', fontSize: '18px' }}
          >
            Why This Matters
          </h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            Fake reviews are everywhere. Bots can post a single fake review easily, but maintaining
            a consistent human typing profile across dozens of reviews is statistically impossible.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Restaurants can trust that their ratings come from real people.
            Consumers can trust they&apos;re getting honest recommendations.
          </p>
        </section>

        {/* Section 4: Privacy */}
        <section
          className="rounded-2xl p-4"
          style={{ border: '1px solid var(--color-divider)' }}
        >
          <h2
            className="font-bold mb-2"
            style={{ color: 'var(--color-text-primary)', fontSize: '16px' }}
          >
            Your Privacy
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            We never store what you type &mdash; only the timing between keystrokes.
            No raw keystrokes, no review content in our verification system.
            Just rhythm metadata. Your review content is only used for the review itself.
          </p>
        </section>
      </div>
    </div>
  )
}
