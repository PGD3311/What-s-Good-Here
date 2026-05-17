import { memo, useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useFollowList } from '../hooks/useFollowList'
import { useFollowUser } from '../hooks/useFollowUser'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useAuth } from '../context/AuthContext'
import { getUserMessage } from '../utils/errorHandler'
import { EmptyState } from './EmptyState'

const SHEET_HEIGHTS = { half: '75vh', full: '95vh' }
const SHEET_TRANSITION_MS = 280
const DRAG_THRESHOLD_PX = 50
const DRAG_THRESHOLD_VELOCITY = 0.3 // px/ms
// Drag must move at least this far before we suppress the synthetic click.
// Below this threshold we treat the gesture as a tap, letting onGrabberClick fire.
const DRAG_CLICK_SUPPRESS_PX = 6

export function FollowListModal({ userId, type, onClose }) {
  const navigate = useNavigate()
  const { user: viewer } = useAuth()
  const isFollowers = type === 'followers'
  const title = isFollowers ? 'Followers' : 'Following'

  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  // Map of userId -> intended follow state (true=following, false=not following).
  // Cleared per-user on mutation settle (success or error). Latest click wins;
  // out-of-order callbacks only clear their own user entry.
  const [pendingTargets, setPendingTargets] = useState(() => new Map())
  // Per-user in-flight guard prevents stacking duplicate mutations.
  const inFlightRef = useRef(new Set())

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchInput), 250)
    return () => clearTimeout(t)
  }, [searchInput])

  const {
    users, followingSet, loading, loadingMore, searchFetching,
    error, hasMore, fetchMore, refetch, isSearching,
  } = useFollowList({ userId, type, searchQuery: debouncedQuery })

  const isFollowing = useCallback((id) => {
    if (pendingTargets.has(id)) return pendingTargets.get(id)
    return followingSet.has(id)
  }, [followingSet, pendingTargets])

  const { follow, unfollow } = useFollowUser()

  const clearPendingTarget = useCallback((id) => {
    setPendingTargets(prev => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    inFlightRef.current.delete(id)
  }, [])

  const handleFollowToggle = useCallback((id) => {
    if (!viewer) return
    if (inFlightRef.current.has(id)) return // ignore rapid double-clicks
    const currentlyFollowing = isFollowing(id)
    const nextState = !currentlyFollowing
    inFlightRef.current.add(id)
    setPendingTargets(prev => {
      const next = new Map(prev)
      next.set(id, nextState)
      return next
    })
    const mutation = nextState ? follow : unfollow
    mutation.mutate(id, {
      onSuccess: () => clearPendingTarget(id),
      onError: (err) => {
        clearPendingTarget(id)
        toast.error(getUserMessage(err, nextState ? 'following' : 'unfollowing'))
      },
    })
  }, [viewer, isFollowing, clearPendingTarget, follow, unfollow])

  const handleRowNavigate = useCallback((id) => {
    onClose()
    navigate(`/user/${id}`)
  }, [onClose, navigate])

  // The Follow button reflects whether YOU follow each row. On YOUR OWN
  // Following list every row is followed by definition — the label adds no
  // information, so hide it; unfollowing requires navigating to the profile.
  const viewerOwnsFollowingList = type === 'following' && viewer?.id === userId
  const showFollowButton = useCallback(
    (rowUserId) => !!viewer && viewer.id !== rowUserId && !viewerOwnsFollowingList,
    [viewer, viewerOwnsFollowingList],
  )

  const scrollContainerRef = useRef(null)
  const sentinelRef = useRef(null)
  const searchInputRef = useRef(null)
  const modalRef = useFocusTrap(true, onClose, { initialFocusRef: searchInputRef })

  // Sheet detents
  const [sheetState, setSheetState] = useState('half') // 'half' | 'full' | 'closing'
  const [dragOffset, setDragOffset] = useState(0)
  const dragStartRef = useRef({ y: 0, t: 0, state: 'half', active: false, didDrag: false })
  const closeTimerRef = useRef(null)

  // Clear any pending close timer on unmount to prevent stale onClose firing
  // after the parent has already torn the modal down.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [])

  const resetDragState = useCallback(() => {
    dragStartRef.current = { ...dragStartRef.current, active: false }
    setDragOffset(0)
  }, [])

  const handleDragStart = useCallback((clientY) => {
    dragStartRef.current = {
      y: clientY,
      t: performance.now(),
      state: sheetState,
      active: true,
      didDrag: false,
    }
    setDragOffset(0)
  }, [sheetState])

  const handleDragMove = useCallback((clientY) => {
    if (!dragStartRef.current.active) return
    const delta = clientY - dragStartRef.current.y
    if (Math.abs(delta) > DRAG_CLICK_SUPPRESS_PX) {
      dragStartRef.current.didDrag = true
    }
    setDragOffset(delta)
  }, [])

  const handleDragEnd = useCallback((clientY) => {
    if (!dragStartRef.current.active) {
      setDragOffset(0)
      return
    }
    const delta = clientY - dragStartRef.current.y
    const elapsed = performance.now() - dragStartRef.current.t
    const velocity = elapsed > 0 ? Math.abs(delta) / elapsed : 0
    const startState = dragStartRef.current.state
    const crossed = Math.abs(delta) >= DRAG_THRESHOLD_PX || velocity >= DRAG_THRESHOLD_VELOCITY

    if (crossed) {
      if (delta < 0) {
        // Dragged up
        if (startState === 'half') setSheetState('full')
        // already full → stay full
      } else {
        // Dragged down
        if (startState === 'full') setSheetState('half')
        else if (startState === 'half') {
          setSheetState('closing')
          if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
          closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null
            onClose()
          }, SHEET_TRANSITION_MS)
        }
      }
    }
    dragStartRef.current.active = false
    setDragOffset(0)
  }, [onClose])

  const onTouchStart = (e) => handleDragStart(e.touches[0].clientY)
  const onTouchMove = (e) => handleDragMove(e.touches[0].clientY)
  const onTouchEnd = (e) => handleDragEnd(e.changedTouches[0].clientY)
  // Reset cleanly if the OS aborts the gesture (e.g., system swipe, call).
  const onTouchCancel = () => resetDragState()

  const onGrabberClick = () => {
    // Suppress synthetic click that follows a touch drag on the same element.
    if (dragStartRef.current.didDrag) {
      dragStartRef.current.didDrag = false
      return
    }
    setSheetState(prev => prev === 'half' ? 'full' : 'half')
  }

  const onGrabberKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setSheetState(prev => prev === 'half' ? 'full' : 'half')
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  // Infinite scroll observer, rooted on the scroll container. The effect
  // re-creates the observer on each settle so it can immediately re-evaluate
  // whether the sentinel is still in view; this auto-chains pagination when
  // the user is anchored at the bottom of a short list. The !loadingMore
  // guard inside the callback prevents stacking duplicate fetches mid-flight.
  useEffect(() => {
    if (!scrollContainerRef.current || !sentinelRef.current) return
    if (error || !hasMore) return

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry.isIntersecting && hasMore && !loadingMore && !error) {
        fetchMore()
      }
    }, {
      root: scrollContainerRef.current,
      rootMargin: '200px',
    })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, error, fetchMore, isSearching])

  return (
    <div className="fixed inset-0 z-50" onClick={onClose} role="presentation">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} aria-hidden="true" />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-list-title"
        className="absolute left-0 right-0 bottom-0 rounded-t-2xl flex flex-col"
        style={{
          background: 'var(--color-surface-elevated)',
          height: SHEET_HEIGHTS[sheetState === 'closing' ? 'half' : sheetState],
          transform: sheetState === 'closing'
            ? 'translateY(100%)'
            : `translateY(${Math.max(0, dragOffset)}px)`,
          transition: dragOffset === 0
            ? `transform ${SHEET_TRANSITION_MS}ms cubic-bezier(0.32, 0.72, 0, 1), height ${SHEET_TRANSITION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`
            : 'none',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onGrabberClick}
          onKeyDown={onGrabberKeyDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchCancel}
          style={{
            flex: '0 0 auto',
            padding: '8px 0 4px',
            cursor: 'grab',
            touchAction: 'none',
            background: 'transparent',
            border: 'none',
            width: '100%',
            display: 'block',
          }}
          aria-label={sheetState === 'full' ? 'Collapse sheet' : 'Expand sheet'}
          aria-expanded={sheetState === 'full'}
        >
          <div
            style={{ width: 40, height: 4, background: 'var(--color-divider)', borderRadius: 2, margin: '0 auto' }}
            aria-hidden="true"
          />
        </button>

        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--color-divider)', flex: '0 0 auto', touchAction: 'none' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchCancel}
        >
          <h2 id="follow-list-title" className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 rounded-full"
            style={{ color: 'var(--color-text-secondary)' }}
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          ref={scrollContainerRef}
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
          }}
        >
          <div
            className="sticky top-0 z-10 px-4 pt-3 pb-2"
            style={{ background: 'var(--color-surface-elevated)' }}
          >
            <div
              className="flex items-center gap-2 px-3 rounded-full"
              style={{
                background: 'var(--color-bg)',
                height: 40,
                boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.05)',
              }}
            >
              {searchFetching ? (
                <div
                  className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0"
                  style={{ borderColor: 'var(--color-divider)', borderTopColor: 'var(--color-text-tertiary)' }}
                  aria-hidden="true"
                />
              ) : (
                <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}
                     fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M10 17a7 7 0 100-14 7 7 0 000 14z" />
                </svg>
              )}
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={isFollowers ? 'Search followers' : 'Search following'}
                className="flex-1 bg-transparent outline-none"
                style={{ color: 'var(--color-text-primary)', fontSize: 16 }}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(''); searchInputRef.current?.focus() }}
                  className="p-1 -mr-1 rounded-full"
                  aria-label="Clear search"
                >
                  <svg className="w-4 h-4" style={{ color: 'var(--color-text-tertiary)' }}
                       fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <SkeletonRows />
          ) : error && users.length === 0 ? (
            <ErrorState onRetry={refetch} />
          ) : users.length === 0 ? (
            <FollowListEmpty type={type} isSearching={isSearching} query={debouncedQuery} />
          ) : (
            <>
              <ul className="divide-y" style={{ borderColor: 'var(--color-divider)' }}>
                {users.map((user) => (
                  <FollowRow
                    key={user.id}
                    user={user}
                    isFollowing={isFollowing(user.id)}
                    showFollowButton={showFollowButton(user.id)}
                    onRowClick={handleRowNavigate}
                    onFollowToggle={handleFollowToggle}
                  />
                ))}
              </ul>
              <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
              {loadingMore && <LoadingMoreIndicator />}
              {error && users.length > 0 && <LoadMoreErrorBanner onRetry={fetchMore} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const FollowRow = memo(function FollowRow({ user, isFollowing, showFollowButton, onRowClick, onFollowToggle }) {
  const displayName = user.display_name || 'Anonymous'
  const followerLabel = user.follower_count === 0
    ? 'No followers yet'
    : user.follower_count === 1
      ? '1 follower'
      : `${user.follower_count.toLocaleString()} followers`

  const handleClick = () => onRowClick(user.id)
  const handleFollow = (e) => { e.stopPropagation(); onFollowToggle(user.id) }

  return (
    <li>
      <div
        role="link"
        tabIndex={0}
        aria-label={`${displayName} profile`}
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(user.id) } }}
        className="w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-black/[0.04] focus:outline-none focus-visible:bg-black/[0.04]"
        style={{ minHeight: 64 }}
      >
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center font-bold flex-shrink-0 overflow-hidden"
          style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
        >
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <span>{displayName.charAt(0).toUpperCase()}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="truncate" style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 16 }}>
            {displayName}
          </p>
          <p className="truncate" style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            {followerLabel}
          </p>
        </div>

        {showFollowButton && (
          <button
            type="button"
            onClick={handleFollow}
            onKeyDown={(e) => {
              // Prevent Enter/Space from bubbling to row container and triggering navigation
              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
            }}
            aria-label={isFollowing ? `Unfollow ${displayName}` : `Follow ${displayName}`}
            className="px-4 rounded-full transition-colors flex-shrink-0"
            style={{
              height: 32,
              fontSize: 14,
              fontWeight: 600,
              background: isFollowing ? 'var(--color-surface-elevated)' : 'var(--color-primary)',
              color: isFollowing ? 'var(--color-text-primary)' : 'var(--color-text-on-primary)',
              border: isFollowing ? '1px solid var(--color-divider)' : 'none',
            }}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        )}
      </div>
    </li>
  )
})

function SkeletonRows() {
  return (
    <div role="status" aria-label="Loading">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5" style={{ minHeight: 64 }}>
          <div className="w-11 h-11 rounded-full skeleton-shimmer flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 rounded skeleton-shimmer" style={{ width: '60%' }} />
            <div className="h-3 rounded skeleton-shimmer" style={{ width: '30%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function FollowListEmpty({ type, isSearching, query }) {
  if (isSearching) {
    return (
      <EmptyState
        title={`No one matches "${query}"`}
        subtitle="Try a different name."
      />
    )
  }
  const isFollowers = type === 'followers'
  return (
    <EmptyState
      title={isFollowers ? 'No followers yet' : 'Not following anyone yet'}
      subtitle={isFollowers ? 'Share your profile to get discovered.' : 'Find people whose taste you trust on dish pages.'}
    />
  )
}

function ErrorState({ onRetry }) {
  return (
    <div className="py-12 px-6 text-center">
      <p className="font-medium" style={{ color: 'var(--color-text-primary)', fontSize: 16 }}>
        Couldn&apos;t load
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 px-4 py-2 rounded-full"
        style={{
          background: 'var(--color-primary)',
          color: 'var(--color-text-on-primary)',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Tap to retry
      </button>
    </div>
  )
}

function LoadingMoreIndicator() {
  return (
    <div
      className="flex items-center justify-center py-4"
      role="status"
      aria-live="polite"
      aria-label="Loading more"
    >
      <div
        className="w-5 h-5 border-2 rounded-full animate-spin"
        style={{ borderColor: 'var(--color-divider)', borderTopColor: 'var(--color-primary)' }}
        aria-hidden="true"
      />
    </div>
  )
}

function LoadMoreErrorBanner({ onRetry }) {
  return (
    <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--color-divider)' }}>
      <button
        type="button"
        onClick={onRetry}
        className="w-full py-2 rounded-lg text-sm font-medium"
        style={{
          background: 'var(--color-bg)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-divider)',
        }}
      >
        Couldn&apos;t load more. Tap to retry.
      </button>
    </div>
  )
}

export default FollowListModal
