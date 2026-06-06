import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { profileApi } from '../../api/profileApi'
import { logger } from '../../utils/logger'
import { TrustBadge } from '../TrustBadge'

/**
 * Hero Identity Card for the Profile page (owner).
 * Left-aligned: avatar + (name row with optional trust badge) + two-tier stats
 * + optional curator pill. Trust badge reuses the shared TrustBadge (same copy
 * as the public profile) and only shows for earned tiers.
 */
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
  isCurator,
  trustBadgeType,
  onAvatarUpdated,
}) {
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

  // Only earned tiers surface a badge; 'building'/null/ai_estimated do not.
  const showTrust = trustBadgeType === 'human_verified' || trustBadgeType === 'trusted_reviewer'
  const trustLabel = trustBadgeType === 'trusted_reviewer' ? 'Trusted Reviewer' : 'Verified Human'

  return (
    <div
      className="relative px-4 pt-8 pb-5 overflow-hidden"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Bottom divider */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px"
        style={{
          width: '90%',
          background: 'linear-gradient(90deg, transparent, var(--color-divider), transparent)',
        }}
      />

      {/* Avatar + identity column */}
      <div className="flex items-start gap-4">
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
          {/* Name row (+ trust badge at far right when not editing) */}
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
                    {nameStatus === 'checking' && '⏳'}
                    {nameStatus === 'available' && '✓'}
                    {nameStatus === 'taken' && '✗'}
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
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setEditingName(true)}
                className="font-bold transition-colors inline-flex items-center gap-1.5 min-w-0"
                style={{
                  color: 'var(--color-text-primary)',
                  fontSize: '22px',
                  letterSpacing: '-0.02em',
                  lineHeight: '1.2',
                }}
              >
                <span className="truncate">{profile?.display_name || 'Set your name'}</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                </svg>
              </button>
              {showTrust && (
                <div className="flex-shrink-0 inline-flex items-center gap-1.5">
                  <span aria-hidden="true">
                    <TrustBadge type={trustBadgeType} />
                  </span>
                  <span className="font-semibold whitespace-nowrap" style={{ color: 'var(--color-rating)', fontSize: '12px' }}>
                    {trustLabel}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Stats — two tiers: content (dishes · spots) primary, social quieter. */}
          {stats.totalVotes > 0 && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap" style={{ fontSize: '13px' }}>
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
            </div>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap" style={{ fontSize: '12px' }}>
            <button
              onClick={() => setFollowListModal('followers')}
              className="hover:underline transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                {followCounts.followers}
              </span> followers
            </button>
            <span style={{ color: 'var(--color-text-tertiary)' }}>&middot;</span>
            <button
              onClick={() => setFollowListModal('following')}
              className="hover:underline transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                {followCounts.following}
              </span> following
            </button>
          </div>

          {/* Curator pill — folded in from the old standalone card. */}
          {isCurator && (
            <div className="mt-2.5">
              <Link
                to="/my-list"
                className="inline-flex items-center gap-1.5 rounded-full font-semibold active:scale-[0.98] transition-transform"
                style={{
                  border: '1.5px solid var(--color-accent-gold)',
                  color: 'var(--color-accent-gold)',
                  background: 'var(--color-surface-elevated)',
                  fontSize: '12px',
                  padding: '6px 12px',
                  textDecoration: 'none',
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z" />
                </svg>
                Edit Top 10
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default HeroIdentityCard
