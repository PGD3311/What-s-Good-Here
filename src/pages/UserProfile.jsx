import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAuth } from '../context/AuthContext'
import { logger } from '../utils/logger'
import { getCompatColor } from '../utils/formatters'
import { followsApi } from '../api/followsApi'
import { useFollowUser } from '../hooks/useFollowUser'
import { votesApi } from '../api/votesApi'
import { FollowListModal } from '../components/FollowListModal'
import { ProfileSkeleton } from '../components/Skeleton'
import { DataLoadError } from '../components/DataLoadError'
import { LocalListCard, ProfileGrid } from '../components/profile'
import { useUserDishPhotos } from '../hooks/useUserDishPhotos'
import { useUserPlaylists } from '../hooks/useUserPlaylists'
import { PlaylistGridCard } from '../components/playlists/PlaylistGridCard'
import { useLocalListDetail } from '../hooks/useLocalListDetail'
import { TrustBadge } from '../components/jitter'
import { jitterApi } from '../api/jitterApi'
import { profileApi } from '../api/profileApi'
import { ReportModal } from '../components/ReportModal'
import { BlockUserModal } from '../components/BlockUserModal'
import { useBlockedUsers } from '../hooks/useBlockedUsers'

// Shelves collapsed to a single "My Ratings" feed — Worth-It/Avoid split retired
// with the binary vote (Apr 2026). The shelf filter UI is no longer rendered;
// kept only for search-history compatibility.

// Rating-style + standout-picks math is shared via utils/foodStats.js so this
// page and the owner Profile (useUserVotes) can't drift.

/**
 * Public User Profile Page
 * View another user's profile, stats, badges, and recent ratings
 */
export function UserProfile() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user: currentUser } = useAuth()

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isFollowing, setIsFollowing] = useState(false)

  useDocumentTitle(profile?.display_name ? `@${profile.display_name}` : null)

  const [followLoading, setFollowLoading] = useState(false)
  const { follow: followMutation, unfollow: unfollowMutation } = useFollowUser()
  const [followListModal, setFollowListModal] = useState(null) // 'followers' | 'following' | null
  const [myRatings, setMyRatings] = useState({}) // { dishId: rating }
  const [userReviews, setUserReviews] = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  // selectedReview state removed — ReviewDetailModal doesn't exist yet
  const [tasteCompat, setTasteCompat] = useState(null)
  const [ratingBias, setRatingBias] = useState(null)
  const [jitterBadgeType, setJitterBadgeType] = useState(null)
  const [activeTab, setActiveTab] = useState('journal')
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showBlockModal, setShowBlockModal] = useState(false)
  const { playlists: userPlaylists } = useUserPlaylists(userId)
  const { isBlocked, unblockUser } = useBlockedUsers()

  var localList = useLocalListDetail(userId)
  const actionsMenuRef = useRef(null)

  // Check if viewing own profile
  const isOwnProfile = currentUser?.id === userId
  const viewerHasBlocked = !!currentUser && !isOwnProfile && isBlocked(userId)

  // Close actions menu on outside click or Escape
  useEffect(() => {
    if (!showActionsMenu) return
    const handleClickOutside = (e) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target)) {
        setShowActionsMenu(false)
      }
    }
    const handleEscape = (e) => {
      if (e.key === 'Escape') setShowActionsMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showActionsMenu])

  // Redirect to /profile if viewing own profile
  useEffect(() => {
    if (isOwnProfile) {
      navigate('/profile', { replace: true })
    }
  }, [isOwnProfile, navigate])

  // Fetch all independent data in parallel
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    async function fetchAll() {
      setLoading(true)
      setReviewsLoading(true)
      setError(null)

      // Build the list of parallel fetches
      const fetches = [
        // 0: profile (always)
        followsApi.getUserProfile(userId),
        // 1: follow status (only if logged in and not own profile)
        currentUser && !isOwnProfile
          ? followsApi.isFollowing(userId)
          : Promise.resolve(null),
        // 2: taste compatibility (only if logged in and not own profile)
        currentUser && !isOwnProfile
          ? followsApi.getTasteCompatibility(userId)
          : Promise.resolve(null),
        // 3: rating bias
        profileApi.getRatingBias(userId),
        // 4: jitter badge
        jitterApi.getJitterBadges([userId]),
        // 5: reviews
        votesApi.getReviewsForUser(userId),
      ]

      const results = await Promise.allSettled(fetches)
      if (cancelled) return

      // 0: Profile
      if (results[0].status === 'fulfilled') {
        const data = results[0].value
        if (!data) {
          setError('User not found')
        } else {
          setProfile(data)
        }
      } else {
        logger.error('Failed to fetch profile:', results[0].reason)
        setError('Failed to load profile')
      }

      // 1: Follow status
      if (results[1].status === 'fulfilled' && results[1].value !== null) {
        setIsFollowing(results[1].value)
      } else if (results[1].status === 'rejected') {
        logger.error('Failed to check follow status:', results[1].reason)
      }

      // 2: Taste compatibility
      if (results[2].status === 'fulfilled' && results[2].value !== null) {
        setTasteCompat(results[2].value)
      } else if (results[2].status === 'rejected') {
        logger.error('Failed to fetch taste compatibility:', results[2].reason)
      }

      // 3: Rating bias
      if (results[3].status === 'fulfilled') {
        setRatingBias(results[3].value)
      } else {
        logger.error('Failed to fetch rating bias:', results[3].reason)
      }

      // 4: Jitter badge
      if (results[4].status === 'fulfilled') {
        const badges = results[4].value
        if (badges && badges.length > 0) {
          setJitterBadgeType(jitterApi.getTrustBadgeType(badges[0]))
        } else {
          setJitterBadgeType(null)
        }
      } else {
        // Clear on failure too, so a prior profile's badge never lingers
        // after client-side navigation to a profile whose fetch errored.
        setJitterBadgeType(null)
        logger.error('Failed to fetch jitter badge:', results[4].reason)
      }

      // 5: Reviews
      if (results[5].status === 'fulfilled') {
        setUserReviews(results[5].value || [])
      } else {
        logger.error('Failed to fetch reviews:', results[5].reason)
      }

      setLoading(false)
      setReviewsLoading(false)
    }

    fetchAll()
    return () => { cancelled = true }
  }, [userId, currentUser, isOwnProfile])

  // Dependent fetch: my ratings for grid comparison (needs profile.recent_votes).
  // Only fetched when logged in and viewing someone else's profile.
  useEffect(() => {
    if (!profile?.recent_votes?.length) return
    if (!currentUser || isOwnProfile) return
    let cancelled = false

    async function fetchMyRatings() {
      const dishIds = profile.recent_votes
        .filter(v => v.rating != null)
        .map(v => v.dish?.id)
        .filter(Boolean)
      if (dishIds.length === 0) return

      try {
        const ratings = await votesApi.getMyRatingsForDishes(dishIds)
        if (cancelled) return
        if (ratings) setMyRatings(ratings)
      } catch (err) {
        logger.error('Failed to fetch my ratings:', err)
      }
    }

    fetchMyRatings()
    return () => { cancelled = true }
  }, [profile?.recent_votes, currentUser, isOwnProfile])

  // Handle follow/unfollow
  const handleFollowToggle = async () => {
    if (!currentUser) {
      const next = encodeURIComponent(location.pathname + location.search + location.hash)
      navigate(`/login?next=${next}`)
      return
    }

    // Snapshot pre-state for clean rollback. Reading from React state at
    // catch-time is stale (in the previous version, setIsFollowing happened
    // *after* the await, so a thrown request never mutated state — yet the
    // catch tried to invert it, leaving the UI inverted from the truth).
    const wasFollowing = isFollowing
    const prevFollowerCount = profile?.follower_count ?? 0

    // Optimistic update.
    setIsFollowing(!wasFollowing)
    setProfile(prev => prev ? {
      ...prev,
      follower_count: Math.max(0, prevFollowerCount + (wasFollowing ? -1 : 1)),
    } : prev)

    setFollowLoading(true)
    try {
      // mutateAsync routes through useFollowUser so React Query invalidates
      // ['followCounts'] on success — keeps your own /profile count fresh
      // after following from somebody else's UserProfile page.
      if (wasFollowing) {
        await unfollowMutation.mutateAsync(userId)
      } else {
        await followMutation.mutateAsync(userId)
      }
    } catch (error) {
      logger.error('Failed to toggle follow:', error)
      // Restore exactly to snapshot — no math, no inversion of stale state.
      setIsFollowing(wasFollowing)
      setProfile(prev => prev ? {
        ...prev,
        follower_count: prevFollowerCount,
      } : prev)
    } finally {
      setFollowLoading(false)
    }
  }

  // Handle share profile
  // Header rhythm stats: dishes rated + distinct spots. ("Spots" counts every
  // distinct restaurant the user has an entry at, rated or not.)
  const { totalVotes, uniqueRestaurants } = useMemo(() => {
    if (!profile?.recent_votes?.length) {
      return { totalVotes: 0, uniqueRestaurants: 0 }
    }
    const allRestaurants = new Set()
    profile.recent_votes.forEach(vote => {
      const restName = vote.dish?.restaurant_name
      if (restName) allRestaurants.add(restName)
    })

    return {
      totalVotes: profile.recent_votes.length,
      uniqueRestaurants: allRestaurants.size,
    }
  }, [profile?.recent_votes])

  // Transform votes into the grid (ProfileGrid) shape, sorted most-recent-first.
  const journalRatings = (profile?.recent_votes || [])
    .slice()
    .sort(function (a, b) {
      return new Date(b.voted_at || 0).getTime() - new Date(a.voted_at || 0).getTime()
    })
    .map(function (vote) {
      var review = userReviews.find(function (r) { return r.dish_id === (vote.dish && vote.dish.id) })
      return {
        dish_id: vote.dish && vote.dish.id,
        dish_name: vote.dish && vote.dish.name,
        restaurant_name: vote.dish && vote.dish.restaurant_name,
        category: vote.dish && vote.dish.category,
        photo_url: vote.dish && vote.dish.photo_url,
        rating_10: vote.rating,
        community_avg: vote.dish && vote.dish.avg_rating,
        voted_at: vote.voted_at,
        review_text: review && review.review_text,
      }
    })

  // Food-story grid: journalRatings already carries the target shape
  // ({ dish_id, dish_name, restaurant_name, rating_10, review_text, voted_at })
  // with review text merged from userReviews. Derive a stable list of dish ids
  // (keyed off the join of ids so the memo only recomputes when the set
  // changes) and fetch the viewed user's own photos for the grid tiles.
  const gridRatings = journalRatings
  const gridDishKey = journalRatings.map(function (d) { return d.dish_id }).join(',')
  const gridDishIds = useMemo(
    function () { return gridRatings.map(function (d) { return d.dish_id }) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gridDishKey]
  )
  const ownPhotoMap = useUserDishPhotos(userId, gridDishIds)

  if (loading) {
    return <ProfileSkeleton />
  }

  // Distinguish "user not found" (404 — actually missing) from
  // "failed to load profile" (network/server — Supabase blip).
  // Without this split, a transient outage looks like a deleted account.
  if (error === 'Failed to load profile') {
    return (
      <DataLoadError
        fullPage
        message="We couldn't reach the server. This profile is still there — try again in a moment."
        onRetry={() => window.location.reload()}
      />
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--color-surface)' }}>
        <img src="/search-not-found.webp" alt="" className="w-16 h-16 mx-auto mb-4 rounded-full object-cover" />
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          User not found
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          This profile doesn't exist or may have been removed.
        </p>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
        >
          Go Back
        </button>
      </div>
    )
  }

  if (viewerHasBlocked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: 'var(--color-surface)' }}>
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold mb-5"
          style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-tertiary)' }}
        >
          {profile.display_name?.charAt(0).toUpperCase() || '?'}
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          You blocked {profile.display_name}
        </h2>
        <p className="text-sm leading-relaxed mb-6 max-w-sm" style={{ color: 'var(--color-text-secondary)' }}>
          You won't see their reviews, photos, or activity. Unblock to restore their profile.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 rounded-xl font-semibold"
            style={{
              background: 'transparent',
              border: '1px solid var(--color-divider)',
              color: 'var(--color-text-primary)',
              fontSize: '14px',
            }}
          >
            Go back
          </button>
          <button
            type="button"
            onClick={() => unblockUser(userId)}
            className="px-5 py-2.5 rounded-xl font-semibold"
            style={{
              background: 'var(--color-primary)',
              color: 'var(--color-text-on-primary)',
              fontSize: '14px',
            }}
          >
            Unblock
          </button>
        </div>
      </div>
    )
  }

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-surface)' }}>
      <h1 className="sr-only">{profile.display_name}'s Profile</h1>
      {/* Header */}
      <div
        className="relative px-4 pt-4 pb-6"
        style={{
          background: 'var(--color-bg)',
        }}
      >
        {/* Back button — returns to wherever the user came from (dish detail,
            restaurant page, social feed, etc.). Falls back to home for direct
            URL hits with no history. */}
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1 text-sm font-medium mb-3"
          style={{ color: 'var(--color-primary)' }}
          aria-label="Go back"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

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
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold overflow-hidden"
              style={{
                background: 'var(--color-primary)',
                color: 'var(--color-text-on-primary)',
                boxShadow: '0 0 0 3px var(--color-primary-muted)',
              }}
            >
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <span>{profile.display_name?.charAt(0).toUpperCase() || '?'}</span>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {/* Display Name */}
            <div className="flex items-center gap-2">
              <h2
                className="font-bold"
                style={{
                  fontFamily: "'Amatic SC', cursive",
                  color: 'var(--color-text-primary)',
                  fontSize: '28px',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  lineHeight: '1.2',
                }}
              >
                {profile.display_name || 'Anonymous'}
              </h2>
              {jitterBadgeType && <TrustBadge type={jitterBadgeType} size="md" />}
            </div>

            {/* Stats — two tiers, matching the owner profile (HeroIdentityCard):
                content identity (dishes · spots) reads primary; social
                (followers · following) sits quieter beneath. */}
            {totalVotes > 0 && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap" style={{ fontSize: '13px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>{totalVotes}</span> dishes
                </span>
                {uniqueRestaurants > 0 && (
                  <>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>&middot;</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>{uniqueRestaurants}</span> spots
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
                  {profile.follower_count || 0}
                </span> followers
              </button>
              <span style={{ color: 'var(--color-text-tertiary)' }}>&middot;</span>
              <button
                onClick={() => setFollowListModal('following')}
                className="hover:underline transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  {profile.following_count || 0}
                </span> following
              </button>
            </div>
          </div>
        </div>

        {/* Taste Compatibility */}
        {!isOwnProfile && tasteCompat && (
          <div
            className="mt-4 px-3.5 py-3 rounded-xl"
            style={{
              background: tasteCompat.compatibility_pct != null
                ? `linear-gradient(135deg, ${getCompatColor(tasteCompat.compatibility_pct)}14 0%, ${getCompatColor(tasteCompat.compatibility_pct)}0A 100%)`
                : 'var(--color-surface-elevated)',
              border: tasteCompat.compatibility_pct != null
                ? `1px solid ${getCompatColor(tasteCompat.compatibility_pct)}26`
                : '1px solid var(--color-divider)',
            }}
          >
            {tasteCompat.compatibility_pct != null ? (
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold" style={{ color: getCompatColor(tasteCompat.compatibility_pct) }}>
                  {tasteCompat.compatibility_pct}%
                </span>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    taste match
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    Based on {tasteCompat.shared_dishes} shared {tasteCompat.shared_dishes === 1 ? 'dish' : 'dishes'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                {tasteCompat.shared_dishes > 0
                  ? `${tasteCompat.shared_dishes} shared ${tasteCompat.shared_dishes === 1 ? 'dish' : 'dishes'} — rate ${3 - tasteCompat.shared_dishes} more to see your taste match`
                  : 'Rate the same dishes to see your taste match'
                }
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4">
          {isOwnProfile ? (
            <Link
              to="/profile"
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center transition-colors"
              style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)' }}
            >
              Edit Profile
            </Link>
          ) : (
            <button
              onClick={handleFollowToggle}
              disabled={followLoading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              style={{
                background: isFollowing ? 'var(--color-surface-elevated)' : 'var(--color-primary)',
                color: isFollowing ? 'var(--color-text-primary)' : 'var(--color-text-on-primary)',
              }}
            >
              {followLoading ? '...' : isFollowing ? 'Following' : 'Follow'}
            </button>
          )}
          {currentUser && !isOwnProfile && (
            <div className="relative" style={{ zIndex: 50 }} ref={actionsMenuRef}>
              <button
                type="button"
                onClick={() => setShowActionsMenu((v) => !v)}
                aria-label="More actions"
                aria-expanded={showActionsMenu}
                aria-haspopup="menu"
                className="px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)' }}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </button>
              {showActionsMenu && (
                <div
                  role="menu"
                  aria-label={`Actions for ${profile.display_name}`}
                  className="absolute right-0 mt-2 w-48 rounded-xl shadow-xl border overflow-hidden z-40"
                  style={{ background: 'var(--color-surface-elevated)', borderColor: 'var(--color-divider)' }}
                >
                  <button
                    role="menuitem"
                    onClick={() => { setShowActionsMenu(false); setShowReportModal(true) }}
                    className="w-full px-4 py-3 text-left text-sm font-medium transition-colors border-b"
                    style={{ color: 'var(--color-text-primary)', borderColor: 'var(--color-divider)' }}
                  >
                    Report user
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setShowActionsMenu(false); setShowBlockModal(true) }}
                    className="w-full px-4 py-3 text-left text-sm font-medium transition-colors"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    Block user
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Local List */}
      {localList.items.length > 0 && (
        <LocalListCard items={localList.items} />
      )}


      {/* Tabs: Grid / Lists (no Saved — that's personal) */}
      <div
        className="flex"
        style={{
          borderBottom: '1px solid var(--color-divider)',
          background: 'var(--color-surface)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        {[
          { key: 'journal', label: 'Grid' },
          { key: 'playlists', label: 'Lists' },
        ].map(function (tab) {
          return (
            <button
              key={tab.key}
              onClick={function () { setActiveTab(tab.key) }}
              className="flex-1 py-3 text-xs font-semibold text-center"
              style={{
                color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                background: 'transparent',
                border: 'none',
                borderBottomWidth: 2,
                borderBottomStyle: 'solid',
                borderBottomColor: activeTab === tab.key ? 'var(--color-primary)' : 'transparent',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* --- Journal tab --- */}
      {activeTab === 'journal' && (
        <ProfileGrid
          ratings={gridRatings}
          photoMap={ownPhotoMap}
          loading={reviewsLoading}
          resetKey={userId}
          emptyTitle="No food story yet"
          emptySubtitle="This person hasn't rated anything yet"
        />
      )}

      {/* --- Playlists tab --- */}
      {activeTab === 'playlists' && (
        <div className="px-4 pt-4 pb-6">
          {userPlaylists.length === 0 ? (
            <div className="py-10 text-center" style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>
              No playlists yet
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {userPlaylists.map(function (p) { return <PlaylistGridCard key={p.id} playlist={p} /> })}
            </div>
          )}
        </div>
      )}

      {/* Signup CTA for visitors */}
      {!currentUser && (
        <div
          className="mx-4 mt-6 mb-4 rounded-2xl px-5 py-5 text-center"
          style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-divider)',
          }}
        >
          <p className="font-bold" style={{ color: 'var(--color-text-primary)', fontSize: '16px' }}>
            Find the best dishes on Martha's Vineyard
          </p>
          <p className="mt-1" style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Save your favorites, rate dishes, and see how your taste compares.
          </p>
          <div className="flex gap-3 mt-4 justify-center">
            <Link
              to="/"
              className="px-5 py-2.5 rounded-xl font-semibold"
              style={{
                background: 'var(--color-primary)',
                color: 'var(--color-text-on-primary)',
                fontSize: '14px',
              }}
            >
              Explore the Map
            </Link>
            <Link
              to="/login"
              className="px-5 py-2.5 rounded-xl font-semibold"
              style={{
                background: 'var(--color-surface-elevated)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-divider)',
                fontSize: '14px',
              }}
            >
              Sign Up Free
            </Link>
          </div>
        </div>
      )}

      {/* Follow List Modal */}
      {followListModal && (
        <FollowListModal
          userId={userId}
          type={followListModal}
          onClose={() => setFollowListModal(null)}
        />
      )}

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        target={{ type: 'user', id: userId, label: profile.display_name }}
      />
      <BlockUserModal
        isOpen={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        user={{ id: userId, displayName: profile.display_name }}
      />
    </div>
  )
}

export default UserProfile
