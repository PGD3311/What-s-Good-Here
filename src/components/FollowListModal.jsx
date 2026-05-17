import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useFollowList } from '../hooks/useFollowList'
import { useFollowUser } from '../hooks/useFollowUser'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useAuth } from '../context/AuthContext'
import { getUserMessage } from '../utils/errorHandler'

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
    users, followingSet, loading, loadingMore, searching,
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

  const handleFollowToggle = useCallback((user) => {
    if (!viewer) return
    if (inFlightRef.current.has(user.id)) return // ignore rapid double-clicks
    const currentlyFollowing = isFollowing(user.id)
    const nextState = !currentlyFollowing
    inFlightRef.current.add(user.id)
    setPendingTargets(prev => {
      const next = new Map(prev)
      next.set(user.id, nextState)
      return next
    })
    const mutation = nextState ? follow : unfollow
    mutation.mutate(user.id, {
      onSuccess: () => clearPendingTarget(user.id),
      onError: (err) => {
        clearPendingTarget(user.id)
        toast.error(getUserMessage(err, nextState ? 'following' : 'unfollowing'))
      },
    })
  }, [viewer, isFollowing, clearPendingTarget, follow, unfollow])

  const handleUserClick = (user) => { onClose(); navigate(`/user/${user.id}`) }

  const scrollContainerRef = useRef(null)
  const sentinelRef = useRef(null)
  const searchInputRef = useRef(null)
  const modalRef = useFocusTrap(true, onClose, { initialFocusRef: searchInputRef })

  // Infinite scroll observer rooted on the scroll container
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
          height: '75vh',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{ width: 40, height: 4, background: 'var(--color-divider)', borderRadius: 2, margin: '8px auto 4px', flex: '0 0 auto' }}
          aria-hidden="true"
        />

        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--color-divider)', flex: '0 0 auto' }}
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
              {searching ? (
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
                aria-label={`Search ${title.toLowerCase()}`}
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
            <EmptyState type={type} isSearching={isSearching} query={debouncedQuery} />
          ) : (
            <>
              <ul className="divide-y" style={{ borderColor: 'var(--color-divider)' }} aria-live="polite">
                {users.map((user) => (
                  <FollowRow
                    key={user.id}
                    user={user}
                    isFollowing={isFollowing(user.id)}
                    showFollowButton={!!viewer && viewer.id !== user.id}
                    onRowClick={() => handleUserClick(user)}
                    onFollowToggle={() => handleFollowToggle(user)}
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

function FollowRow({ user, isFollowing, showFollowButton, onRowClick, onFollowToggle }) {
  const followerLabel = user.follower_count === 0
    ? 'No followers yet'
    : user.follower_count === 1
      ? '1 follower'
      : `${user.follower_count.toLocaleString()} followers`

  return (
    <li>
      <div
        role="link"
        tabIndex={0}
        aria-label={`${user.display_name} profile`}
        onClick={onRowClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick() } }}
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
            <span>{user.display_name?.charAt(0).toUpperCase() || '?'}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="truncate" style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 16 }}>
            {user.display_name || 'Anonymous'}
          </p>
          <p className="truncate" style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            {followerLabel}
          </p>
        </div>

        {showFollowButton && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFollowToggle() }}
            onKeyDown={(e) => {
              // Prevent Enter/Space from bubbling to row container and triggering navigation
              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
            }}
            aria-label={isFollowing ? `Unfollow ${user.display_name}` : `Follow ${user.display_name}`}
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
}

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

function EmptyState({ type, isSearching, query }) {
  if (isSearching) {
    return (
      <div className="py-12 px-6 text-center">
        <p className="font-medium" style={{ color: 'var(--color-text-primary)', fontSize: 16 }}>
          No one matches &quot;{query}&quot;
        </p>
        <p className="mt-1" style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>
          Try a different name.
        </p>
      </div>
    )
  }
  const isFollowers = type === 'followers'
  return (
    <div className="py-12 px-6 text-center">
      <p className="font-medium" style={{ color: 'var(--color-text-primary)', fontSize: 16 }}>
        {isFollowers ? 'No followers yet' : 'Not following anyone yet'}
      </p>
      <p className="mt-1" style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>
        {isFollowers ? 'Share your profile to get discovered.' : 'Find people whose taste you trust on dish pages.'}
      </p>
    </div>
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
    <div className="flex items-center justify-center py-4" aria-hidden="true">
      <div
        className="w-5 h-5 border-2 rounded-full animate-spin"
        style={{ borderColor: 'var(--color-divider)', borderTopColor: 'var(--color-primary)' }}
      />
    </div>
  )
}

function LoadMoreErrorBanner({ onRetry }) {
  return (
    <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--color-divider)' }}>
      <button
        type="button"
        onClick={() => onRetry()}
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
