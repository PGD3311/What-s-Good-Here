import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { profileApi } from '../../api/profileApi'
import { logger } from '../../utils/logger'

/**
 * Hero Identity Card for the Profile page
 * Centered layout: avatar, name, stats row
 */
function getRhythmLabel(score) {
  if (score >= 0.8) return 'Steady'
  if (score >= 0.5) return 'Forming'
  return 'New'
}

function getTierInfo(confidence, consistency) {
  if (confidence === 'high' && consistency >= 0.6) return { label: 'Trusted', bg: 'rgba(34, 197, 94, 0.18)', color: 'var(--color-rating)' }
  if (confidence === 'medium' && consistency >= 0.4) return { label: 'Verified', bg: 'rgba(34, 197, 94, 0.12)', color: 'var(--color-rating)' }
  return { label: 'Building', bg: 'rgba(156, 163, 175, 0.1)', color: 'var(--color-text-tertiary)' }
}

export function HeroIdentityCard({
  user,
  profile,
  stats,
  followCounts,
  editingName,
  newName,
  nameStatus,
  setEditingName,
  setNewName,
  setNameStatus,
  handleSaveName,
  setFollowListModal,
  jitterProfile,
  onAvatarUpdated,
}) {
  const [jitterExpanded, setJitterExpanded] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileInputRef = useRef(null)

  const handleAvatarPick = () => {
    if (avatarUploading) return
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    setAvatarUploading(true)
    try {
      await profileApi.uploadAvatar(file)
      onAvatarUpdated?.()
    } catch (error) {
      logger.error('Avatar upload failed:', error)
      toast.error(error?.message || "Couldn't upload your photo.")
    } finally {
      setAvatarUploading(false)
    }
  }
  const jitterData = jitterProfile?.profile_data || {}
  const hasJitterDetail = !!(jitterProfile && Object.keys(jitterData).length > 0)

  return (
    <div
      className="relative px-4 pt-8 pb-5 overflow-hidden"
      style={{
        background: 'var(--color-bg)',
      }}
    >
      {/* Bottom divider */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px"
        style={{
          width: '90%',
          background: 'linear-gradient(90deg, transparent, var(--color-divider), transparent)',
        }}
      />

      {/* Avatar + Name row */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleAvatarPick}
          disabled={avatarUploading}
          aria-label={profile?.avatar_url ? 'Change profile picture' : 'Add profile picture'}
          aria-busy={avatarUploading}
          className="relative w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0 overflow-hidden p-0 active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          style={{
            background: 'var(--color-primary)',
            color: 'var(--color-text-on-primary)',
            boxShadow: '0 0 0 3px var(--color-primary-muted)',
            border: 'none',
          }}
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <span>
              {profile?.display_name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
            </span>
          )}
          {avatarUploading && (
            <span
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: 'rgba(0, 0, 0, 0.35)' }}
              aria-live="polite"
            >
              <span
                className="w-6 h-6 border-2 rounded-full animate-spin"
                style={{ borderColor: 'rgba(255,255,255,0.35)', borderTopColor: '#fff' }}
                aria-hidden="true"
              />
              <span className="sr-only">Uploading…</span>
            </span>
          )}
        </button>
        {/* iOS Safari sometimes fails to open the picker when the trigger
            input is display:none. Visually-hidden (off-screen, but still in
            the layout / focusable) reliably opens the native picker. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        />

        <div className="flex-1 min-w-0">
          {/* Display Name */}
          {editingName ? (
            <div className="flex flex-col gap-1">
              <div className="relative">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value.replace(/\s/g, ''))}
                  className="w-full px-3 py-1.5 border rounded-lg text-lg font-bold focus:outline-none pr-8"
                  style={{
                    background: 'var(--color-surface-elevated)',
                    borderColor: nameStatus === 'taken' ? 'var(--color-red)' : nameStatus === 'available' ? 'var(--color-emerald)' : 'var(--color-divider)',
                    color: 'var(--color-text-primary)'
                  }}
                  autoFocus
                  maxLength={30}
                />
                {nameStatus && nameStatus !== 'same' && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm">
                    {nameStatus === 'checking' && '\u23F3'}
                    {nameStatus === 'available' && '\u2713'}
                    {nameStatus === 'taken' && '\u2717'}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveName}
                  disabled={nameStatus === 'taken' || nameStatus === 'checking'}
                  className="px-3 py-1 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingName(false)
                    setNewName(profile?.display_name || '')
                    setNameStatus(null)
                  }}
                  className="px-3 py-1 rounded-lg text-sm font-medium"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Cancel
                </button>
              </div>
              {nameStatus === 'taken' && (
                <p className="text-xs" style={{ color: 'var(--color-red)' }}>Username taken</p>
              )}
              {nameStatus === 'available' && (
                <p className="text-xs" style={{ color: 'var(--color-emerald)' }}>Available!</p>
              )}
            </div>
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="font-bold transition-colors inline-flex items-center gap-1.5"
              style={{
                color: 'var(--color-text-primary)',
                fontSize: '22px',
                letterSpacing: '-0.02em',
                lineHeight: '1.2',
              }}
            >
              {profile?.display_name || 'Set your name'}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
              </svg>
            </button>
          )}

          {/* Stats row — dishes · restaurants · followers */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap" style={{ fontSize: '13px' }}>
            {stats.totalVotes > 0 && (
              <>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>{stats.totalVotes}</span> dishes
                </span>
                {stats.uniqueRestaurants > 0 && (
                  <>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>&middot;</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>{stats.uniqueRestaurants}</span> spots
                    </span>
                  </>
                )}
              </>
            )}
            <button
              onClick={() => setFollowListModal('followers')}
              className="hover:underline transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {followCounts.followers}
              </span> followers
            </button>
            <button
              onClick={() => setFollowListModal('following')}
              className="hover:underline transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {followCounts.following}
              </span> following
            </button>
          </div>
        </div>

        {/* Compact Jitter Fingerprint — tap to expand */}
        {jitterProfile && (() => {
          const tier = getTierInfo(jitterProfile.confidence_level, jitterProfile.consistency_score)
          return (
            <button
              onClick={hasJitterDetail ? () => setJitterExpanded(!jitterExpanded) : undefined}
              className={'flex-shrink-0 rounded-xl px-3 py-2.5 text-center transition-all active:scale-95' + (hasJitterDetail ? '' : '')}
              style={{
                background: jitterExpanded ? tier.bg : 'var(--color-card)',
                border: '1px solid ' + (jitterExpanded ? tier.color : 'var(--color-divider)'),
                minWidth: '90px',
                cursor: hasJitterDetail ? 'pointer' : 'default',
              }}
            >
              <span
                className="px-2 py-0.5 rounded-full font-medium inline-block"
                style={{ background: tier.bg, color: tier.color, fontSize: '11px' }}
              >
                {tier.label}
              </span>
              <div className="mt-1.5">
                <div className="font-bold" style={{ color: 'var(--color-text-primary)', fontSize: '18px', lineHeight: 1 }}>
                  {stats?.reviewCount ?? 0}
                </div>
                <div style={{ color: 'var(--color-text-tertiary)', fontSize: '10px', marginTop: '2px' }}>reviews</div>
              </div>
              <div className="mt-1">
                <div className="font-semibold" style={{ color: 'var(--color-accent-gold)', fontSize: '12px', lineHeight: 1 }}>
                  {jitterProfile.consistency_score != null
                    ? getRhythmLabel(Number(jitterProfile.consistency_score))
                    : '\u2014'}
                </div>
                <div style={{ color: 'var(--color-text-tertiary)', fontSize: '10px', marginTop: '2px' }}>rhythm</div>
              </div>
              {hasJitterDetail && (
                <div className="mt-1.5" style={{ color: 'var(--color-accent-gold)', fontSize: '10px' }}>
                  {jitterExpanded ? '\u25B2 less' : '\u25BC detail'}
                </div>
              )}
            </button>
          )
        })()}
      </div>

      {/* Expanded Jitter Detail Panel */}
      {jitterExpanded && hasJitterDetail && (
        <div
          className="mx-4 mt-3 rounded-xl overflow-hidden"
          style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-divider)',
          }}
        >
          <div className="px-4 py-4 space-y-3">
            <p className="text-sm" style={{ color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
              {getOwnerBlurb(jitterProfile)}
            </p>
            {jitterProfile.created_at && (
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Reviewing since {new Date(jitterProfile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
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
        </div>
      )}
    </div>
  )
}

// Plain-English status copy for the profile owner. Branches on rhythm-sample
// count + consistency_score, not raw review count \u2014 short reviews don't
// collect enough keystrokes to build a rhythm signal, so a user can write
// many reviews and still be "Building" until their typing pattern emerges.
function getOwnerBlurb(jitterProfile) {
  var rhythmSamples = jitterProfile?.review_count || 0
  var consistency = Number(jitterProfile?.consistency_score) || 0
  if (rhythmSamples >= 15 && consistency >= 0.6) {
    return 'You\u2019re a Trusted Reviewer. Your votes carry extra weight in our rankings because your typing rhythm is steady and consistent.'
  }
  if (rhythmSamples >= 5 && consistency >= 0.4) {
    return 'You\u2019re a Verified Human. Your reviews are confirmed to be typed by a real person. Keep writing to reach Trusted Reviewer status.'
  }
  return 'You\u2019re just getting started. Write longer reviews so your typing rhythm can be captured \u2014 once we have enough rhythm samples, you\u2019ll earn a Verified Human badge.'
}

export default HeroIdentityCard
