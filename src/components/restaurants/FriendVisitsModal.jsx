import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { getRatingColor, getMatchColor } from '../../utils/ranking'
import { getCategoryNeonImage, getDishNameIcon } from '../../constants/categories'
import { EmptyState } from '../EmptyState'

function FriendAvatar({ friend, size = 48 }) {
  if (friend.avatar_url) {
    return (
      <img
        src={friend.avatar_url}
        alt=""
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
        draggable={false}
      />
    )
  }
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 font-bold"
      style={{
        width: size,
        height: size,
        background: 'var(--color-primary)',
        color: 'var(--color-text-on-primary, white)',
        fontSize: size * 0.4,
      }}
    >
      {(friend.display_name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function expertiseLabel(level) {
  if (level === 'authority') return 'Authority'
  if (level === 'specialist') return 'Specialist'
  return null
}

export function FriendVisitsModal({ friend, votes, restaurantName, onClose }) {
  const modalRef = useFocusTrap(true, onClose)

  // votes = array of vote rows for this friend at this restaurant
  // Sort newest-first so most recent visit is on top
  const sortedVotes = useMemo(() => {
    return (votes || []).slice().sort((a, b) => {
      const aDate = a.voted_at ? new Date(a.voted_at).getTime() : 0
      const bDate = b.voted_at ? new Date(b.voted_at).getTime() : 0
      return bDate - aDate
    })
  }, [votes])

  const dishCount = sortedVotes.length
  const expertise = sortedVotes.find(v => v.category_expertise)?.category_expertise
  const matchPct = Number.isFinite(friend?.compatibility_pct) ? friend.compatibility_pct : null

  return (
    <div className="fixed inset-0 z-50" onClick={onClose} role="presentation">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} aria-hidden="true" />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="friend-visits-title"
        className="absolute left-0 right-0 bottom-0 rounded-t-2xl flex flex-col"
        style={{
          background: 'var(--color-surface-elevated)',
          height: '75vh',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grabber */}
        <div style={{ padding: '8px 0 4px' }}>
          <div
            style={{ width: 40, height: 4, background: 'var(--color-divider)', borderRadius: 2, margin: '0 auto' }}
            aria-hidden="true"
          />
        </div>

        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: 'var(--color-divider)', flex: '0 0 auto' }}
        >
          <FriendAvatar friend={friend} size={44} />
          <div className="flex-1 min-w-0">
            <h2
              id="friend-visits-title"
              className="font-bold truncate"
              style={{ color: 'var(--color-text-primary)', fontSize: '16px' }}
            >
              {friend.display_name || 'Friend'}
            </h2>
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: '12px', marginTop: '2px' }}>
              {dishCount} {dishCount === 1 ? 'dish' : 'dishes'} at {restaurantName}
              {matchPct != null && (
                <>
                  {' · '}
                  <span style={{ color: getMatchColor(matchPct), fontWeight: 700 }}>
                    {matchPct}% taste match
                  </span>
                </>
              )}
              {expertise && (
                <>
                  {' · '}
                  <span style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>
                    {expertiseLabel(expertise)}
                  </span>
                </>
              )}
            </p>
          </div>
          <Link
            to={`/user/${friend.user_id}`}
            onClick={onClose}
            className="font-bold flex-shrink-0"
            style={{ color: 'var(--color-primary)', fontSize: '13px' }}
          >
            Profile
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 rounded-full flex-shrink-0"
            style={{ color: 'var(--color-text-secondary)' }}
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Visits list */}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          {sortedVotes.length === 0 ? (
            <div className="px-4 py-8">
              <EmptyState emoji="🍽️" title="No dishes rated here yet" />
            </div>
          ) : (
            <ul className="px-4 py-3" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sortedVotes.map(vote => (
                <FriendVisitRow key={vote.dish_id} vote={vote} onNavigate={onClose} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function FriendVisitRow({ vote, onNavigate }) {
  const rating = Number(vote.rating_10)
  const ratingDisplay = Number.isFinite(rating)
    ? (rating % 1 === 0 ? rating.toFixed(0) : rating.toFixed(1))
    : null
  const iconSrc = getDishNameIcon(vote.dish_name) || getCategoryNeonImage(vote.category)

  return (
    <li
      className="rounded-xl"
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-divider)',
        overflow: 'hidden',
      }}
    >
      <Link
        to={`/dish/${vote.dish_id}`}
        onClick={onNavigate}
        className="flex gap-3 p-3 active:scale-[0.99]"
        style={{ transition: 'transform 0.1s ease' }}
      >
        {/* Photo or icon */}
        <div
          className="rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
          style={{
            width: 64,
            height: 64,
            background: 'var(--color-surface)',
          }}
        >
          {vote.photo_url ? (
            <img
              src={vote.photo_url}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              draggable={false}
            />
          ) : iconSrc ? (
            <img
              src={iconSrc}
              alt=""
              style={{ width: 44, height: 44, objectFit: 'contain' }}
              loading="lazy"
            />
          ) : (
            <span style={{ fontSize: '24px' }} aria-hidden="true">🍽️</span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p
              className="font-bold flex-1 min-w-0"
              style={{
                color: 'var(--color-text-primary)',
                fontSize: '14px',
                lineHeight: 1.3,
              }}
            >
              {vote.dish_name}
            </p>
            {ratingDisplay && (
              <span
                className="font-bold flex-shrink-0"
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: getRatingColor(rating),
                  lineHeight: 1,
                }}
              >
                {ratingDisplay}
              </span>
            )}
          </div>
          <p
            style={{
              color: 'var(--color-text-tertiary)',
              fontSize: '11px',
              marginTop: '2px',
            }}
          >
            {formatDate(vote.voted_at)}
          </p>
          {vote.review_text && (
            <p
              className="italic"
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: '13px',
                lineHeight: 1.5,
                marginTop: '6px',
              }}
            >
              &ldquo;{vote.review_text}&rdquo;
            </p>
          )}
        </div>
      </Link>
    </li>
  )
}
