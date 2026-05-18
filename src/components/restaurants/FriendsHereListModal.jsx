import { useMemo } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { getRatingColor } from '../../utils/ranking'
import { EmptyState } from '../EmptyState'

function FriendAvatar({ friend, size = 44 }) {
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

export function FriendsHereListModal({ friends, restaurantName, onSelectFriend, onClose }) {
  const modalRef = useFocusTrap(true, onClose)

  const sortedFriends = useMemo(() => {
    return (friends || []).slice().sort((a, b) => {
      if (b.dish_count !== a.dish_count) return b.dish_count - a.dish_count
      return (a.display_name || '').localeCompare(b.display_name || '')
    })
  }, [friends])

  const total = sortedFriends.length

  return (
    <div className="fixed inset-0 z-50" onClick={onClose} role="presentation">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} aria-hidden="true" />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="friends-here-title"
        className="absolute left-0 right-0 bottom-0 rounded-t-2xl flex flex-col"
        style={{
          background: 'var(--color-surface-elevated)',
          height: '65vh',
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
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--color-divider)', flex: '0 0 auto' }}
        >
          <div className="min-w-0">
            <h2
              id="friends-here-title"
              className="font-bold truncate"
              style={{ color: 'var(--color-text-primary)', fontSize: '16px' }}
            >
              {total} {total === 1 ? 'friend has' : 'friends have'} been here
            </h2>
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: '12px', marginTop: '2px' }}>
              {restaurantName}
            </p>
          </div>
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

        {/* Friends list */}
        {sortedFriends.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState emoji="👥" title="No friends here yet" />
          </div>
        ) : (
        <ul
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          {sortedFriends.map(friend => {
            const avgRating = friend.avg_rating
            const ratingDisplay = Number.isFinite(avgRating)
              ? (avgRating % 1 === 0 ? avgRating.toFixed(0) : avgRating.toFixed(1))
              : null
            return (
              <li key={friend.user_id}>
                <button
                  type="button"
                  onClick={() => onSelectFriend(friend)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left active:scale-[0.99]"
                  style={{
                    borderBottom: '1px solid var(--color-divider)',
                    transition: 'transform 0.1s ease',
                  }}
                >
                  <FriendAvatar friend={friend} size={44} />
                  <div className="flex-1 min-w-0">
                    <p
                      className="font-bold truncate"
                      style={{ color: 'var(--color-text-primary)', fontSize: '14px' }}
                    >
                      {friend.display_name || 'Friend'}
                    </p>
                    <p style={{ color: 'var(--color-text-tertiary)', fontSize: '12px', marginTop: '2px' }}>
                      {friend.dish_count} {friend.dish_count === 1 ? 'dish' : 'dishes'}
                      {ratingDisplay && (
                        <>
                          {' · avg '}
                          <span style={{ color: getRatingColor(avgRating), fontWeight: 700 }}>
                            {ratingDisplay}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <svg
                    className="w-5 h-5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="var(--color-text-tertiary)"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </li>
            )
          })}
        </ul>
        )}
      </div>
    </div>
  )
}
