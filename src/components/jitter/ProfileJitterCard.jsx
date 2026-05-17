import { useState } from 'react'

/**
 * Your Review Fingerprint — personal typing identity card.
 * Celebrates your unique typing rhythm. Every reviewer types differently
 * and that's what makes reviews trustworthy.
 */
export function ProfileJitterCard({ profile, user, userProfile, displayName, isPublic }) {
  const [expanded, setExpanded] = useState(false)

  if (!profile) return null

  const data = profile.profile_data || {}
  const hasPrivateData = !isPublic && Object.keys(data).length > 0
  const tierInfo = getTierInfo(profile.confidence_level, profile.consistency_score)
  const nextTier = isPublic ? null : getNextTier(profile.confidence_level, profile.review_count, profile.consistency_score)
  const name = displayName || userProfile?.display_name || ''
  const initial = name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || '?'

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-divider)',
      }}
    >
      {/* Header — avatar left, identity right */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center font-bold flex-shrink-0"
            style={{
              background: 'var(--color-primary)',
              color: 'var(--color-text-on-primary)',
              fontSize: '18px',
            }}
          >
            {initial}
          </div>

          {/* Right side — title, tier, description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent-gold)' }}>
                Review Fingerprint
              </span>
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
                style={{ background: tierInfo.bg, color: tierInfo.color }}
              >
                {tierInfo.label}
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>
              {isPublic
                ? 'Every reviewer has a unique typing rhythm that verifies they’re real.'
                : 'Your typing rhythm is unique — like a signature.'}
            </p>
          </div>
        </div>

        {/* Headline stats — friendly labels */}
        <div className={hasPrivateData ? 'grid grid-cols-3 gap-3 text-center mt-3' : 'grid grid-cols-2 gap-3 text-center mt-3'}>
          <StatCell label="Verified" value={profile.review_count || 0} />
          <StatCell
            label="Rhythm"
            value={profile.consistency_score != null
              ? getRhythmLabel(Number(profile.consistency_score))
              : '—'}
          />
          {hasPrivateData && (
            <StatCell label="Words typed" value={formatWordCount(data.total_keystrokes || 0)} />
          )}
        </div>
      </div>

      {/* Progress to next tier */}
      {nextTier && (
        <div className="px-4 py-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: 'var(--color-text-tertiary)' }}>{nextTier.label}</span>
            <span style={{ color: 'var(--color-text-tertiary)' }}>{nextTier.current} of {nextTier.target}</span>
          </div>
          <div className="w-full overflow-hidden" style={{ height: '4px', borderRadius: '2px', background: 'var(--color-surface)' }}>
            <div style={{ width: `${Math.min(100, (nextTier.current / nextTier.target) * 100)}%`, height: '100%', borderRadius: '2px', background: 'var(--color-accent-gold)' }} />
          </div>
        </div>
      )}

      {/* Expand toggle — own profile only */}
      {hasPrivateData && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-xs text-center py-2"
          style={{ color: 'var(--color-accent-gold)', borderTop: '1px solid var(--color-divider)' }}
        >
          {expanded ? 'Less detail ▲' : 'See your rhythm ▼'}
        </button>
      )}

      {/* Expanded details — own profile only. Plain-English summary plus
          a "Reviewing since" date plus a Learn-how link to /jitter. The
          technical metrics (typing pace, dwell time, per-key histogram)
          were removed in favor of one clear sentence — dev metrics
          aren't useful to non-technical users. */}
      {hasPrivateData && expanded && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid var(--color-divider)' }}>
          <p className="text-sm pt-3" style={{ color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
            {getOwnerBlurb(profile)}
          </p>
          {profile.created_at && (
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Reviewing since {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          )}
          <a
            href="/jitter"
            className="inline-block text-sm font-semibold"
            style={{ color: 'var(--color-primary)' }}
          >
            Learn how this works &rarr;
          </a>
        </div>
      )}
    </div>
  )
}

function StatCell({ label, value }) {
  return (
    <div>
      <div className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{value}</div>
      <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
    </div>
  )
}

// Plain-English status copy keyed to tier. Kept in sync with the matching
// helper in HeroIdentityCard (used in the own-profile inline panel). Tier
// thresholds count rhythm samples, not raw reviews — short reviews don't
// emit enough keystrokes to build the signal.
function getOwnerBlurb(profile) {
  const rhythmSamples = profile?.review_count || 0
  const consistency = Number(profile?.consistency_score) || 0
  if (rhythmSamples >= 15 && consistency >= 0.6) {
    return 'You’re a Trusted Reviewer. Your votes carry extra weight in our rankings because your typing rhythm is steady and consistent.'
  }
  if (rhythmSamples >= 5 && consistency >= 0.4) {
    return 'You’re a Verified Human. Your reviews are confirmed to be typed by a real person. Keep writing to reach Trusted Reviewer status.'
  }
  return 'You’re just getting started. Write longer reviews so your typing rhythm can be captured — once we have enough rhythm samples, you’ll earn a Verified Human badge.'
}

// Friendly rhythm label from consistency score
function getRhythmLabel(score) {
  if (score >= 0.8) return 'Steady'
  if (score >= 0.5) return 'Forming'
  return 'New'
}

// Approximate word count from keystrokes (avg 5 chars per word)
function formatWordCount(keystrokes) {
  var words = Math.round(keystrokes / 5)
  if (words >= 1000) return (words / 1000).toFixed(1) + 'k'
  return String(words)
}

function getTierInfo(confidence, consistency) {
  if (confidence === 'high' && consistency >= 0.6) return { label: 'Trusted', bg: 'rgba(34, 197, 94, 0.18)', color: 'var(--color-rating)' }
  if (confidence === 'medium' && consistency >= 0.4) return { label: 'Verified', bg: 'rgba(34, 197, 94, 0.12)', color: 'var(--color-rating)' }
  return { label: 'Building', bg: 'rgba(156, 163, 175, 0.1)', color: 'var(--color-text-tertiary)' }
}

function getNextTier(confidence, reviewCount, consistency) {
  if (confidence === 'high' && consistency >= 0.6) return null
  if (confidence === 'medium' || (confidence === 'low' && reviewCount >= 5)) {
    return { label: 'Trusted status', current: reviewCount, target: 15 }
  }
  return { label: 'Verified status', current: reviewCount, target: 5 }
}

export default ProfileJitterCard
