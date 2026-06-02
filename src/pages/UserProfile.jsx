import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAuth } from '../context/AuthContext'
import { logger } from '../utils/logger'
import { getCompatColor } from '../utils/formatters'
import { computeRatingStyle, computeStandoutPicks } from '../utils/foodStats'
import { followsApi } from '../api/followsApi'
import { useFollowUser } from '../hooks/useFollowUser'
import { votesApi } from '../api/votesApi'
import { FollowListModal } from '../components/FollowListModal'
import { ProfileSkeleton } from '../components/Skeleton'
import { DataLoadError } from '../components/DataLoadError'
import { JournalFeed, LocalListCard } from '../components/profile'
import { useUserPlaylists } from '../hooks/useUserPlaylists'
import { PlaylistStripCard } from '../components/playlists/PlaylistStripCard'
import { PlaylistGridCard } from '../components/playlists/PlaylistGridCard'
import { useLocalListDetail } from '../hooks/useLocalListDetail'
import { TrustBadge, ProfileJitterCard } from '../components/jitter'
import { jitterApi } from '../api/jitterApi'
import { profileApi } from '../api/profileApi'
import { ReportModal } from '../components/ReportModal'
import { BlockUserModal } from '../components/BlockUserModal'
import { useBlockedUsers } from '../hooks/useBlockedUsers'

// Known location display names for URL slugs
var LOCATION_NAMES = {
  'marthas-vineyard': "Martha's Vineyard",
  'nantucket': 'Nantucket',
  'cape-cod': 'Cape Cod',
}

function formatLocationName(slug) {
  if (LOCATION_NAMES[slug]) return LOCATION_NAMES[slug]
  // Title-case fallback: "oak-bluffs" → "Oak Bluffs"
  return slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase() })
}

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
  const [searchParams, setSearchParams] = useSearchParams()
  const { user: currentUser } = useAuth()
  const locationFilter = searchParams.get('location')

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
  const [standoutPicks, setStandoutPicks] = useState({})
  const [jitterBadgeType, setJitterBadgeType] = useState(null)
  const [jitterBadgeData, setJitterBadgeData] = useState(null)
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
          setJitterBadgeData(badges[0])
        }
      } else {
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

  // Dependent fetches: compute standout picks + fetch my ratings (need profile.recent_votes)
  useEffect(() => {
    if (!profile?.recent_votes?.length) return
    let cancelled = false

    async function fetchDependentData() {
      const ratedVotes = profile.recent_votes.filter(v => v.rating != null)
      const dishIds = ratedVotes.map(v => v.dish?.id).filter(Boolean)
      if (dishIds.length === 0) return

      // Build dependent fetches in parallel
      const fetches = [
        // 0: community averages for standout picks
        votesApi.getCommunityAvgsForDishes(dishIds),
        // 1: my ratings for comparison (only if logged in and not own profile)
        currentUser && !isOwnProfile
          ? votesApi.getMyRatingsForDishes(dishIds)
          : Promise.resolve(null),
      ]

      const results = await Promise.allSettled(fetches)
      if (cancelled) return

      // 0: Compute standout picks
      if (results[0].status === 'fulfilled') {
        try {
          const communityAvgs = results[0].value
          // Normalize this page's recent_votes shape into the shared item shape;
          // the Best Find / Hottest Take math lives in utils/foodStats.js so this
          // page and the owner Profile (useUserVotes) can't drift.
          const items = ratedVotes
            .filter(v => v.dish?.id)
            .map(v => ({
              dish_id: v.dish.id,
              dish_name: v.dish.name,
              restaurant_id: v.dish.restaurant_id,
              restaurant_name: v.dish.restaurant_name,
              userRating: v.rating,
            }))
          const picks = computeStandoutPicks(items, communityAvgs)
          if (picks.bestFind || picks.harshestTake) setStandoutPicks(picks)
        } catch (err) {
          logger.error('Failed to compute standout picks:', err)
        }
      } else {
        logger.error('Failed to fetch community averages:', results[0].reason)
      }

      // 1: My ratings
      if (results[1].status === 'fulfilled' && results[1].value !== null) {
        setMyRatings(results[1].value)
      } else if (results[1].status === 'rejected') {
        logger.error('Failed to fetch my ratings:', results[1].reason)
      }
    }

    fetchDependentData()
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
  // Compute stats from recent votes — single "My Ratings" shelf, sorted by recency.
  const { totalVotes, ratingStyle, favoriteRestaurant, favoriteRestaurantCount, favoriteRestaurantId } = useMemo(() => {
    if (!profile?.recent_votes?.length) {
      return { totalVotes: 0, ratingStyle: null, favoriteRestaurant: null, favoriteRestaurantCount: 0, favoriteRestaurantId: null }
    }
    const restaurantCounts = {}
    const restaurantIdByName = {}
    const ratings = []
    profile.recent_votes.forEach(vote => {
      const isRated = vote.rating != null
      const restName = vote.dish?.restaurant_name
      const restId = vote.dish?.restaurant_id
      // Most loyal counts only rated votes — photo-only / saved-only
      // entries shouldn't read as loyalty.
      if (restName && isRated) {
        restaurantCounts[restName] = (restaurantCounts[restName] || 0) + 1
        if (restId && !restaurantIdByName[restName]) restaurantIdByName[restName] = restId
      }
      if (isRated) {
        ratings.push(vote.rating)
      }
    })

    // Compute rating style from average
    let style = null
    if (ratings.length > 0) {
      const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length
      const variance = ratings.length > 1
        ? Math.sqrt(ratings.reduce((sum, r) => sum + Math.pow(r - avgRating, 2), 0) / ratings.length)
        : 0
      style = computeRatingStyle(avgRating, variance)
      if (style) style.avgRating = avgRating
    }

    // Most loyal: restaurant with the most rated dishes. Only surface when
    // there's actually a "favorite" — more than one visit signals loyalty.
    let favRest = null
    let favCount = 0
    Object.entries(restaurantCounts).forEach(([name, count]) => {
      if (count > favCount) {
        favRest = name
        favCount = count
      }
    })
    if (favCount < 2) {
      favRest = null
      favCount = 0
    }

    return {
      totalVotes: profile.recent_votes.length,
      ratingStyle: style,
      favoriteRestaurant: favRest,
      favoriteRestaurantCount: favCount,
      favoriteRestaurantId: favRest ? (restaurantIdByName[favRest] || null) : null,
    }
  }, [profile?.recent_votes])

  // Transform votes into JournalFeed shape — one shelf, sorted most-recent-first.
  var journalRatings = (profile?.recent_votes || [])
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
        restaurant_town: vote.dish && vote.dish.restaurant_town,
        category: vote.dish && vote.dish.category,
        photo_url: vote.dish && vote.dish.photo_url,
        rating_10: vote.rating,
        community_avg: vote.dish && vote.dish.avg_rating,
        voted_at: vote.voted_at,
        review_text: review && review.review_text,
      }
    })

  // Apply location filter if present in URL
  if (locationFilter) {
    var locLower = locationFilter.toLowerCase().replace(/-/g, ' ')
    journalRatings = journalRatings.filter(function (d) {
      var town = (d.restaurant_town || '').toLowerCase()
      return town.indexOf(locLower) !== -1 || locLower.indexOf(town) !== -1
    })
  }

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

            {/* Follow Stats */}
            <div className="flex items-center gap-2 mt-1.5" style={{ fontSize: '13px' }}>
              <button
                onClick={() => setFollowListModal('followers')}
                className="hover:underline transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  {profile.follower_count || 0}
                </span> followers
              </button>
              <span style={{ color: 'var(--color-text-tertiary)' }}>&middot;</span>
              <button
                onClick={() => setFollowListModal('following')}
                className="hover:underline transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>
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

        {/* Rating Style + Most loyal + Best find + Hot take live in the
            Food Story chalkboard further down — kept here as a single source
            of truth, matching the Profile page layout. */}

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

      {/* Review Fingerprint — surfaced near the top so visitors see the
          trust context before diving into specific picks. Only renders for
          users with jitter data (real humans, not the AI cold-start
          aggregator). */}
      {jitterBadgeData && (
        <div className="px-4 pt-3">
          <ProfileJitterCard
            profile={jitterBadgeData}
            displayName={profile.display_name}
            isPublic
          />
        </div>
      )}

      {/* Food Story chalkboard — matches the own-profile layout */}
      {totalVotes > 0 && (ratingStyle || favoriteRestaurant || standoutPicks.bestFind || standoutPicks.harshestTake) && (
        <div style={{ padding: '12px 16px 0' }}>
          <div
            style={{
              background: '#2C3033',
              borderRadius: '12px',
              padding: '18px',
              backgroundImage: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.04) 0%, transparent 60%)',
            }}
          >
            <h3 style={{
              fontFamily: "'Amatic SC', cursive",
              fontSize: '22px',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.88)',
              marginBottom: '10px',
            }}>
              {profile.display_name || 'Their'}&rsquo;s Food Story
            </h3>
            {ratingStyle && (
              <div className="flex justify-between items-baseline" style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Rating style</span>
                <span style={{ fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'var(--color-primary)' }}>
                  {ratingStyle.label}
                </span>
              </div>
            )}
            {favoriteRestaurant && (
              <div className="flex justify-between items-baseline gap-3" style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Most loyal</span>
                {favoriteRestaurantId ? (
                  <Link
                    to={`/restaurants/${favoriteRestaurantId}`}
                    style={{ fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'rgba(255,255,255,0.88)' }}
                  >
                    {favoriteRestaurant} &middot; {favoriteRestaurantCount} {favoriteRestaurantCount === 1 ? 'dish' : 'dishes'}
                  </Link>
                ) : (
                  <span style={{ fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'rgba(255,255,255,0.88)' }}>
                    {favoriteRestaurant} &middot; {favoriteRestaurantCount} {favoriteRestaurantCount === 1 ? 'dish' : 'dishes'}
                  </span>
                )}
              </div>
            )}
            {standoutPicks.bestFind && (
              <div className="flex justify-between items-baseline gap-3" style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Best find</span>
                {standoutPicks.bestFind.dish_id ? (
                  <Link
                    to={`/dish/${standoutPicks.bestFind.dish_id}`}
                    style={{ fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'var(--color-accent-gold)' }}
                  >
                    {standoutPicks.bestFind.dish_name} &middot; {standoutPicks.bestFind.userRating}
                  </Link>
                ) : (
                  <span style={{ fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'var(--color-accent-gold)' }}>
                    {standoutPicks.bestFind.dish_name} &middot; {standoutPicks.bestFind.userRating}
                  </span>
                )}
              </div>
            )}
            {standoutPicks.harshestTake && (
              <div className="flex justify-between items-baseline gap-3" style={{ padding: '5px 0' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Hot take</span>
                {standoutPicks.harshestTake.dish_id ? (
                  <Link
                    to={`/dish/${standoutPicks.harshestTake.dish_id}`}
                    style={{ fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'rgba(255,255,255,0.88)' }}
                  >
                    {standoutPicks.harshestTake.dish_name} &middot; Them: {standoutPicks.harshestTake.userRating} &middot; Crowd: {(standoutPicks.harshestTake.communityAvg ?? 0).toFixed(1)}
                  </Link>
                ) : (
                  <span style={{ fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'rgba(255,255,255,0.88)' }}>
                    {standoutPicks.harshestTake.dish_name} &middot; Them: {standoutPicks.harshestTake.userRating} &middot; Crowd: {(standoutPicks.harshestTake.communityAvg ?? 0).toFixed(1)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}


      {/* Local List */}
      {localList.items.length > 0 && (
        <LocalListCard items={localList.items} />
      )}


      {/* Location Filter Banner */}
      {locationFilter && (
        <div
          className="mx-4 mt-3 px-4 py-2.5 rounded-xl flex items-center justify-between"
          style={{
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-divider)',
          }}
        >
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Showing picks in <strong style={{ color: 'var(--color-text-primary)' }}>{formatLocationName(locationFilter)}</strong>
          </span>
          <button
            onClick={function () { setSearchParams({}) }}
            className="font-semibold"
            style={{ color: 'var(--color-primary)', fontSize: '13px' }}
          >
            Show all
          </button>
        </div>
      )}

      {/* Tabs: Journal / Playlists (no Saved — that's personal) */}
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
        {['journal', 'playlists'].map(function (tab) {
          return (
            <button
              key={tab}
              onClick={function () { setActiveTab(tab) }}
              className="flex-1 py-3 text-xs font-semibold text-center"
              style={{
                color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                background: 'transparent',
                border: 'none',
                borderBottomWidth: 2,
                borderBottomStyle: 'solid',
                borderBottomColor: activeTab === tab ? 'var(--color-primary)' : 'transparent',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          )
        })}
      </div>

      {/* --- Journal tab --- */}
      {activeTab === 'journal' && (
        <>
          {/* My Ratings shelf title */}
          <div className="px-4 pt-5 pb-1">
            <h2
              style={{
                fontFamily: "'Amatic SC', cursive",
                color: 'var(--color-text-primary)',
                fontSize: '32px',
                fontWeight: 700,
                letterSpacing: '0.02em',
              }}
            >
              {profile.display_name}'s Ratings
            </h2>
          </div>

          {/* Journal Feed — single chronological shelf */}
          <JournalFeed
            ratings={journalRatings}
            loading={reviewsLoading}
          />
        </>
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
