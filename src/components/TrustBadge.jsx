import { useState } from 'react'
import { Link } from 'react-router-dom'
import { JitterBadge } from './jitter/JitterBadge'

/**
 * Displays trust indicators on reviews and profiles.
 * Tap/hover opens a plain-English popover with a Learn how → link to /jitter.
 *
 * Types:
 * - 'human_verified': Green check — reviewer has consistent jitter profile (5+ reviews)
 * - 'trusted_reviewer': Solid green — high-confidence jitter (15+ reviews)
 * - 'ai_estimated': Blue info — AI-estimated from Google reviews
 * - 'building': Gray — new reviewer, building verification
 * - null: No badge shown
 */
export function TrustBadge({ type, size = 'sm', profileData, warScore }) {
  const [showPopover, setShowPopover] = useState(false)

  // WAR score mode — delegate to JitterBadge
  if (warScore != null) {
    return (
      <JitterBadge
        warScore={warScore}
        size={size}
        stats={profileData ? {
          reviews: profileData.review_count,
          consistency: profileData.consistency_score,
        } : undefined}
      />
    )
  }

  if (!type) return null

  const configs = {
    human_verified: {
      label: 'Verified Human',
      blurb: "This person's reviews were typed by a real human, not a bot.",
      color: 'var(--color-rating)',
      bg: 'rgba(34, 197, 94, 0.15)',
    },
    trusted_reviewer: {
      label: 'Trusted Reviewer',
      blurb: 'This person has written enough verified reviews that their votes count more in our rankings.',
      color: 'var(--color-rating)',
      bg: 'rgba(34, 197, 94, 0.22)',
    },
    ai_estimated: {
      label: 'AI Estimated',
      blurb: 'Pulled from Google reviews to help rank new dishes — not written by our community.',
      color: 'var(--color-blue, #3b82f6)',
      bg: 'rgba(59, 130, 246, 0.12)',
    },
    building: {
      label: 'Building trust',
      blurb: 'Write a few more reviews to earn a Verified Human badge.',
      color: 'var(--color-text-tertiary)',
      bg: 'rgba(156, 163, 175, 0.12)',
    },
  }

  const config = configs[type]
  if (!config) return null

  const dim = size === 'sm' ? 16 : 20
  const iconSize = size === 'sm' ? 10 : 12
  const isTrusted = type === 'trusted_reviewer'
  const reviewCount = profileData?.review_count

  return (
    <span
      className="inline-flex items-center justify-center rounded-full flex-shrink-0 relative"
      style={{
        width: dim,
        height: dim,
        background: isTrusted ? config.color : config.bg,
        cursor: 'pointer',
      }}
      title={config.label}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setShowPopover(!showPopover)
      }}
      onMouseEnter={() => setShowPopover(true)}
      onMouseLeave={() => setShowPopover(false)}
    >
      {(type === 'human_verified' || type === 'trusted_reviewer') && (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <path
            d="M5 13l4 4L19 7"
            stroke={isTrusted ? 'white' : config.color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {type === 'ai_estimated' && (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="7" r="1.5" fill={config.color} />
          <rect x="10.5" y="11" width="3" height="7" rx="1" fill={config.color} />
        </svg>
      )}
      {type === 'building' && (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" stroke={config.color} strokeWidth="2" strokeDasharray="4 3" />
        </svg>
      )}

      {showPopover && (
        <span
          className="absolute left-0 top-full mt-1 p-3 rounded-lg shadow-lg z-50"
          style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-divider)',
            width: '220px',
            fontSize: '12px',
            display: 'block',
            lineHeight: 1.5,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {reviewCount != null && reviewCount > 0 && (
            <span
              className="block font-semibold mb-1.5"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {reviewCount} verified review{reviewCount === 1 ? '' : 's'}
            </span>
          )}
          <span
            className="block font-semibold mb-1"
            style={{ color: config.color }}
          >
            {config.label}
          </span>
          <span
            className="block mb-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {config.blurb}
          </span>
          <Link
            to="/jitter"
            className="block font-semibold"
            style={{ color: 'var(--color-primary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            Learn how &rarr;
          </Link>
        </span>
      )}
    </span>
  )
}

/**
 * Review trust summary for restaurant pages.
 * Shows "12 verified reviews, 8 AI-estimated"
 */
export function TrustSummary({ verifiedCount, aiCount }) {
  if (!verifiedCount && !aiCount) return null

  return (
    <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: '12px' }}>
      {verifiedCount > 0 && (
        <span className="flex items-center gap-1" style={{ color: 'var(--color-rating)' }}>
          <span>{'\u2713'}</span>
          <span>{verifiedCount} verified review{verifiedCount !== 1 ? 's' : ''}</span>
        </span>
      )}
      {aiCount > 0 && (
        <span className="flex items-center gap-1" style={{ color: 'var(--color-blue)' }}>
          <span>{'\u2139'}</span>
          <span>{aiCount} AI-estimated</span>
        </span>
      )}
    </div>
  )
}
