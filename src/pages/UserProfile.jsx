import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { logger } from '../utils/logger'
import { getCompatColor } from '../utils/formatters'
import { shareOrCopy } from '../utils/share'
import { capture } from '../lib/analytics'
import { toast } from 'sonner'
import { followsApi } from '../api/followsApi'
import { votesApi } from '../api/votesApi'
import { FollowListModal } from '../components/FollowListModal'
import { ProfileSkeleton } from '../components/Skeleton'
import { FoodMap, JournalFeed, LocalListCard } from '../components/profile'
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

/**
 * Compute rating style from average rating and variance
 */
function computeRatingStyle(avgRating, ratingVariance) {
  if (avgRating === null) return null

  let level, label
  if (avgRating < 6.0) {
    level = 'tough'
    label = 'Tough Critic'
  } else if (avgRating < 7.5) {
    level = 'fair'
    label = 'Fair Judge'
  } else if (avgRating < 8.5) {
    level = 'generous'
    label = 'Generous Rater'
  } else {
    level = 'easy'
    label = 'Easy to Please'
  }

  return { level, label }
}

/**
 * Public User Profile Page
 * View another user's profile, stats, badges, and recent ratings
 */
export function UserProfile() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user: currentUser } = useAuth()
  const locationFilter = searchParams.get('location')

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
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
          const MIN_COMMUNITY = 3
          const picks = {}

          const comparisons = ratedVotes
            .filter(v => v.dish?.id && communityAvgs[v.dish.id]?.count >= MIN_COMMUNITY)
            .map(v => ({
              dish_name: v.dish.name,
              restaurant_name: v.dish.restaurant_name,
              userRating: v.rating,
              communityAvg: communityAvgs[v.dish.id].avg,
              diff: v.rating - communityAvgs[v.dish.id].avg,
            }))

          if (comparisons.length > 0) {
            // Best find: highest user rating, tie-break by positive diff
            const best = comparisons.slice().sort((a, b) => {
              if (b.userRating !== a.userRating) return b.userRating - a.userRating
              return b.diff - a.diff
            })
            picks.bestFind = best[0]

            // Hottest take: biggest negative diff (user rates much lower than community), min -1.0
            const harsh = comparisons.slice().sort((a, b) => a.diff - b.diff)
            if (harsh[0] && harsh[0].diff <= -1.0) {
              picks.harshestTake = harsh[0]
            }

            setStandoutPicks(picks)
          }
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
      navigate('/login')
      return
    }

    setFollowLoading(true)
    try {
      if (isFollowing) {
        await followsApi.unfollow(userId)
        setIsFollowing(false)
        setProfile(prev => ({
          ...prev,
          follower_count: Math.max(0, (prev.follower_count || 0) - 1)
        }))
      } else {
        await followsApi.follow(userId)
        setIsFollowing(true)
        setProfile(prev => ({
          ...prev,
          follower_count: (prev.follower_count || 0) + 1
        }))
      }
    } catch (error) {
      logger.error('Failed to toggle follow:', error)
      setIsFollowing(prev => !prev)
      setProfile(prev => prev ? {
        ...prev,
        follower_count: (prev.follower_count || 0) + (isFollowing ? 1 : -1)
      } : prev)
    } finally {
      setFollowLoading(false)
    }
  }

  // Handle share profile
  const handleShare = async () => {
    const result = await shareOrCopy({
      url: window.location.href,
      title: `${profile.display_name} on What's Good Here`,
    })

    capture('profile_shared', {
      user_id: userId,
      context: 'user_profile',
      method: result.method,
      success: result.success,
    })

    if (result.success && result.method !== 'native') {
      toast.success('Link copied!', { duration: 2000 })
    }
  }

  // Compute stats from recent votes — single "My Ratings" shelf, sorted by recency.
  const { uniqueRestaurants, foodMapStats, ratingStyle } = useMemo(() => {
    if (!profile?.recent_votes?.length) {
      return { uniqueRestaurants: 0, foodMapStats: { totalVotes: 0, uniqueRestaurants: 0, categoryCounts: {} }, ratingStyle: null }
    }
    const restaurantNames = new Set()
    const catCounts = {}
    const ratings = []
    profile.recent_votes.forEach(vote => {
      if (vote.dish?.restaurant_name) {
        restaurantNames.add(vote.dish.restaurant_name)
      }
      if (vote.dish?.category) {
        catCounts[vote.dish.category] = (catCounts[vote.dish.category] || 0) + 1
      }
      if (vote.rating != null) {
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

    return {
      uniqueRestaurants: restaurantNames.size,
      foodMapStats: {
        totalVotes: profile.recent_votes.length,
        uniqueRestaurants: restaurantNames.size,
        categoryCounts: catCounts,
      },
      ratingStyle: style,
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

  const totalVotes = foodMapStats.totalVotes

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

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-surface)' }}>
      <h1 className="sr-only">{profile.display_name}'s Profile</h1>
      {/* Header */}
      <div
        className="relative px-4 pt-8 pb-6 overflow-hidden"
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
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold"
              style={{
                background: 'var(--color-primary)',
                color: 'var(--color-text-on-primary)',
                boxShadow: '0 0 0 3px var(--color-primary-muted)',
              }}
            >
              {profile.display_name?.charAt(0).toUpperCase() || '?'}
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

        {/* Rating Style + Deviation Score */}
        {(ratingStyle || (ratingBias && ratingBias.votesWithConsensus > 0)) && (
          <div className="mt-4 flex gap-2.5">
            {ratingStyle && (
              <div
                className="flex-1 rounded-2xl border px-4 py-3.5"
                style={{
                  background: 'var(--color-card)',
                  borderColor: 'var(--color-divider)',
                  boxShadow: 'none',
                }}
              >
                <p
                  className="text-sm font-bold"
                  style={{
                    color: ratingStyle.level === 'generous' || ratingStyle.level === 'easy'
                      ? 'var(--color-emerald)'
                      : ratingStyle.level === 'tough'
                      ? 'var(--color-red)'
                      : 'var(--color-orange)',
                  }}
                >
                  {ratingStyle.label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                  avg {ratingStyle.avgRating.toFixed(1)}/10
                </p>
              </div>
            )}
            {ratingBias && ratingBias.votesWithConsensus > 0 && (
              <div
                className="flex-1 rounded-2xl border px-4 py-3.5"
                style={{
                  background: 'var(--color-card)',
                  borderColor: 'var(--color-divider)',
                  boxShadow: 'none',
                }}
              >
                <p className="text-sm font-bold" style={{
                  color: (() => {
                    const isAbove = ratingStyle?.level === 'generous' || ratingStyle?.level === 'easy'
                    if (isAbove) {
                      return ratingBias.ratingBias < 1.0 ? 'var(--color-emerald)' : 'var(--color-emerald-light)'
                    }
                    const isBelow = ratingStyle?.level === 'tough'
                    if (isBelow) {
                      return ratingBias.ratingBias < 1.0 ? 'var(--color-red-light)' : 'var(--color-red)'
                    }
                    return 'var(--color-orange)' // fair judge
                  })(),
                }}>
                  {ratingBias.biasLabel}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                  {ratingBias.ratingBias.toFixed(1)} pts from crowd
                </p>
              </div>
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
          <button
            onClick={handleShare}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)' }}
          >
            Share
          </button>
          {currentUser && !isOwnProfile && (
            <div className="relative" ref={actionsMenuRef}>
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

      {/* Food Map */}
      {totalVotes > 0 && (
        <div className="px-4 pt-4">
          <FoodMap stats={foodMapStats} title={`${profile.display_name}'s Food Map`} />
        </div>
      )}

      {/* Local List */}
      {localList.items.length > 0 && (
        <LocalListCard items={localList.items} />
      )}

      {/* Standout Picks */}
      {totalVotes >= 3 && Object.keys(standoutPicks).length > 0 && (
        <div className="px-4 pt-3 flex flex-col gap-2.5">
          {standoutPicks.bestFind && (
            <div
              className="rounded-xl border px-3.5 py-3 flex items-center gap-3"
              style={{
                background: 'var(--color-card)',
                borderColor: 'var(--color-divider)',
              }}
            >
              <span className="text-lg flex-shrink-0" style={{ color: 'var(--color-accent-gold)' }}>
                {'\u2B50'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
                  Top pick
                </p>
                <p className="text-sm font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {standoutPicks.bestFind.dish_name}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {standoutPicks.bestFind.restaurant_name} &middot; {standoutPicks.bestFind.userRating}/10
                </p>
              </div>
            </div>
          )}

          {standoutPicks.harshestTake && (
            <div
              className="rounded-xl border px-3.5 py-3 flex items-center gap-3"
              style={{
                background: 'var(--color-card)',
                borderColor: 'var(--color-red-muted, rgba(239, 68, 68, 0.2))',
              }}
            >
              <span className="text-lg flex-shrink-0" style={{ color: 'var(--color-red)' }}>
                {'\uD83C\uDF36\uFE0F'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: 'var(--color-red)' }}>
                  Hottest take
                </p>
                <p className="text-sm font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {standoutPicks.harshestTake.dish_name}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {standoutPicks.harshestTake.restaurant_name} &middot; {standoutPicks.harshestTake.userRating}/10 vs {standoutPicks.harshestTake.communityAvg.toFixed(1)} crowd
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review Fingerprint — public view */}
      {jitterBadgeData && (
        <div className="px-4 pt-3">
          <ProfileJitterCard
            profile={jitterBadgeData}
            displayName={profile.display_name}
            isPublic
          />
        </div>
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
