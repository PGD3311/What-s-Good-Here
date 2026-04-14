import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { logger } from '../utils/logger'
import { authApi } from '../api/authApi'
import { followsApi } from '../api/followsApi'
import { useProfile } from '../hooks/useProfile'
import { useUserVotes } from '../hooks/useUserVotes'
import { useUnratedDishes } from '../hooks/useUnratedDishes'
import { DishModal } from '../components/DishModal'
import { LoginModal } from '../components/Auth/LoginModal'
import { FollowListModal } from '../components/FollowListModal'
import { ProfileSkeleton } from '../components/Skeleton'
import { CameraIcon } from '../components/CameraIcon'
import {
  HeroIdentityCard,
  JournalFeed,
  DeleteAccountSection,
} from '../components/profile'
import { jitterApi } from '../api/jitterApi'

// SECURITY: Email is NOT persisted to storage to prevent XSS exposure of PII

export function Profile() {
  const { user, loading } = useAuth()
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState('')
  const [nameStatus, setNameStatus] = useState(null) // null | 'checking' | 'available' | 'taken' | 'same'

  const { profile, updateProfile } = useProfile(user?.id)
  const { ratedDishes, stats, loading: votesLoading, refetch: refetchVotes } = useUserVotes(user?.id)
  const { dishes: unratedDishes, count: unratedCount, refetch: refetchUnrated } = useUnratedDishes(user?.id)

  const [jitterProfile, setJitterProfile] = useState(null)

  // Fetch jitter typing identity profile
  useEffect(() => {
    if (!user) {
      setJitterProfile(null)
      return
    }
    jitterApi.getMyProfile()
      .then(setJitterProfile)
      .catch((error) => {
        logger.error('Failed to fetch jitter profile:', error)
      })
  }, [user])

  const [selectedDish, setSelectedDish] = useState(null)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const { data: followCounts = { followers: 0, following: 0 } } = useQuery({
    queryKey: ['followCounts', user?.id],
    queryFn: () => followsApi.getFollowCounts(user.id),
    enabled: !!user,
  })
  const [followListModal, setFollowListModal] = useState(null) // 'followers' | 'following' | null


  // Set initial name for editing
  useEffect(() => {
    if (profile?.display_name) {
      setNewName(profile.display_name)
    }
  }, [profile])

  // Check username availability when editing name
  useEffect(() => {
    if (!editingName || !newName || newName.length < 2) {
      setNameStatus(null)
      return
    }

    // If name is same as current, no need to check
    if (newName.trim().toLowerCase() === profile?.display_name?.toLowerCase()) {
      setNameStatus('same')
      return
    }

    setNameStatus('checking')
    var cancelled = false
    const timer = setTimeout(async () => {
      try {
        const available = await authApi.isUsernameAvailable(newName.trim())
        if (!cancelled) setNameStatus(available ? 'available' : 'taken')
      } catch (error) {
        if (!cancelled) {
          logger.error('Profile: username check failed', error)
          setNameStatus(null)
        }
      }
    }, 500)

    return () => { clearTimeout(timer); cancelled = true }
  }, [newName, editingName, profile?.display_name])

  const handleSaveName = async () => {
    // Don't save if name is taken
    if (nameStatus === 'taken') {
      return
    }

    try {
      if (newName.trim()) {
        await updateProfile({ display_name: newName.trim() })
      }
      setEditingName(false)
      setNameStatus(null)
    } catch (error) {
      logger.error('Profile: failed to save display name', error)
    }
  }

  // Handle vote from unrated dish
  const handleVote = async () => {
    setSelectedDish(null)
    try {
      await Promise.all([refetchUnrated(), refetchVotes()])
    } catch (error) {
      logger.error('Failed to refresh after vote:', error)
    }
  }

  // Handle clicking an unrated dish to rate it
  const handleUnratedDishClick = (dish) => {
    // Transform to the format expected by DishModal
    setSelectedDish({
      dish_id: dish.dish_id,
      dish_name: dish.dish_name,
      restaurant_name: dish.restaurant_name,
      restaurant_id: dish.restaurant_id,
      category: dish.category,
      price: dish.price,
      photo_url: dish.photo_url,
      total_votes: 0,
    })
  }

  if (loading) {
    return <ProfileSkeleton />
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: 'var(--color-surface)' }}>
      <h1 className="sr-only">Your Profile</h1>

      {user && (
        <>
          {/* Hero Identity Card */}
          <HeroIdentityCard
            user={user}
            profile={profile}
            stats={stats}
            followCounts={followCounts}
            editingName={editingName}
            newName={newName}
            nameStatus={nameStatus}
            setEditingName={setEditingName}
            setNewName={setNewName}
            setNameStatus={setNameStatus}
            handleSaveName={handleSaveName}
            setFollowListModal={setFollowListModal}
            jitterProfile={jitterProfile}
          />

          {/* Food Story chalkboard — your food identity at a glance */}
          {stats.totalVotes > 0 && (
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
                  Your Food Story
                </h3>
                {/* Rating style */}
                {stats.ratingStyle && (
                  <div className="flex justify-between items-baseline" style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Rating style</span>
                    <span style={{ fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {stats.ratingStyle.label}
                    </span>
                  </div>
                )}
                {/* Most loyal */}
                {stats.favoriteRestaurant && (
                  <div className="flex justify-between items-baseline" style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Most loyal</span>
                    <span style={{ fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'rgba(255,255,255,0.88)' }}>
                      {stats.favoriteRestaurant} &middot; {stats.favoriteRestaurantCount} {stats.favoriteRestaurantCount === 1 ? 'dish' : 'dishes'}
                    </span>
                  </div>
                )}
                {/* Best find */}
                {stats.standoutPicks && stats.standoutPicks.bestFind && (
                  <div className="flex justify-between items-baseline" style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Best find</span>
                    <span style={{ fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'var(--color-accent-gold)' }}>
                      {stats.standoutPicks.bestFind.dish_name} &middot; {stats.standoutPicks.bestFind.userRating}
                    </span>
                  </div>
                )}
                {/* Hot take */}
                {stats.standoutPicks && stats.standoutPicks.harshestTake && (
                  <div className="flex justify-between items-baseline" style={{ padding: '5px 0' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Hot take</span>
                    <span style={{ fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'rgba(255,255,255,0.88)' }}>
                      {stats.standoutPicks.harshestTake.dish_name} &middot; You: {stats.standoutPicks.harshestTake.userRating} &middot; Crowd: {(stats.standoutPicks.harshestTake.communityAvg ?? 0).toFixed(1)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Unrated Photos Banner - shown when user has photos to rate */}
          {unratedCount > 0 && (
            <div className="px-4 py-4" style={{ background: 'var(--color-surface)' }}>
              <button
                onClick={() => {
                  // Open the first unrated dish
                  if (unratedDishes.length > 0) {
                    handleUnratedDishClick(unratedDishes[0])
                  }
                }}
                className="w-full rounded-2xl p-4 flex items-center gap-4 transition-all hover:scale-[0.99] active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent-orange) 100%)',
                  boxShadow: 'none',
                }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
                  <CameraIcon size={28} />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-bold" style={{ fontSize: '17px', letterSpacing: '-0.01em', color: 'var(--color-text-on-primary)' }}>
                    {unratedCount} photo{unratedCount === 1 ? '' : 's'} to rate
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-on-primary-muted, rgba(255, 255, 255, 0.7))' }}>
                    Tap to rate your dishes
                  </p>
                </div>
                <svg className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--color-text-on-primary-muted, rgba(255, 255, 255, 0.6))' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* Your Journal title */}
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
              Your Journal
            </h2>
          </div>

          {/* Journal Feed — single chronological shelf */}
          <JournalFeed
            ratings={ratedDishes}
            loading={votesLoading}
          />

          {/* Account deletion — Apple Guideline 5.1.1(v) requires this to be in-app */}
          <DeleteAccountSection />

          {/* Dish Modal for rating unrated dishes */}
          {selectedDish && (
            <DishModal
              dish={selectedDish}
              onClose={() => setSelectedDish(null)}
              onVote={handleVote}
              onLoginRequired={() => setShowLoginModal(true)}
            />
          )}

          {/* Login Modal */}
          <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />

          {/* Follow List Modal */}
          {followListModal && (
            <FollowListModal
              userId={user.id}
              type={followListModal}
              onClose={() => setFollowListModal(null)}
            />
          )}

        </>
      )}
    </div>
  )
}
