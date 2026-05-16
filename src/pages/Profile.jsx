import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAuth } from '../context/AuthContext'
import { logger } from '../utils/logger'
import { authApi } from '../api/authApi'
import { followsApi } from '../api/followsApi'
import { useProfile } from '../hooks/useProfile'
import { useUserVotes } from '../hooks/useUserVotes'
import { useUnratedDishes } from '../hooks/useUnratedDishes'
import { useUserPlaylists } from '../hooks/useUserPlaylists'
import { useFollowedPlaylists } from '../hooks/useFollowedPlaylists'
import { DishModal } from '../components/DishModal'
import { LoginModal } from '../components/Auth/LoginModal'
import { FollowListModal } from '../components/FollowListModal'
import { ProfileSkeleton } from '../components/Skeleton'
import { DataLoadError } from '../components/DataLoadError'
import { CameraIcon } from '../components/CameraIcon'
import { PlaylistStripCard } from '../components/playlists/PlaylistStripCard'
import { PlaylistGridCard } from '../components/playlists/PlaylistGridCard'
import { CreatePlaylistModal } from '../components/playlists/CreatePlaylistModal'
import {
  HeroIdentityCard,
  JournalFeed,
} from '../components/profile'
import { jitterApi } from '../api/jitterApi'

// SECURITY: Email is NOT persisted to storage to prevent XSS exposure of PII

export function Profile() {
  useDocumentTitle('Your food journal')

  const { user, loading } = useAuth()
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState('')
  const [nameStatus, setNameStatus] = useState(null) // null | 'checking' | 'available' | 'taken' | 'same'

  const { profile, error: profileError, loading: profileLoading, refetch: refetchProfile } = useProfile(user?.id)
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
  const [activeTab, setActiveTab] = useState('journal')
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false)

  // People search state — always-on inline search bar above Your Food Story.
  const [peopleQuery, setPeopleQuery] = useState('')
  const [peopleResults, setPeopleResults] = useState([])
  const [peopleLoading, setPeopleLoading] = useState(false)

  // Debounced people search — fires followsApi.searchUsers 350ms after typing stops.
  // Skips queries shorter than 2 chars (matches the API's own guard).
  useEffect(() => {
    const q = peopleQuery.trim()
    if (q.length < 2) {
      setPeopleResults([])
      setPeopleLoading(false)
      return
    }
    setPeopleLoading(true)
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const results = await followsApi.searchUsers(q, 20)
        if (!cancelled) setPeopleResults(results)
      } catch (error) {
        if (!cancelled) {
          logger.error('People search failed:', error)
          setPeopleResults([])
        }
      } finally {
        if (!cancelled) setPeopleLoading(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [peopleQuery])
  const { playlists: myPlaylists } = useUserPlaylists(user?.id)
  const { playlists: savedPlaylists } = useFollowedPlaylists(!!user)
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

  // Distinguish "your account looks fine but the server is unreachable"
  // from "you genuinely have no data yet". If the profile fetch errored
  // and we have no profile to render, show the error instead of the
  // empty-state UI that would otherwise look like the account was wiped.
  if (user && !profileLoading && profileError && !profile) {
    return (
      <DataLoadError
        fullPage
        message={profileError.message}
        onRetry={() => {
          refetchProfile?.()
          refetchVotes?.()
        }}
      />
    )
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
            onAvatarUpdated={refetchProfile}
          />

          {/* Inline people search — always visible above Your Food Story */}
          <div style={{ padding: '12px 16px 0' }}>
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--color-text-tertiary)' }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
              </svg>
              <label htmlFor="people-search-top" className="sr-only">Search people</label>
              <input
                id="people-search-top"
                type="text"
                value={peopleQuery}
                onChange={(e) => setPeopleQuery(e.target.value)}
                placeholder="Find people on the app"
                aria-label="Search people"
                className="w-full pl-10 pr-9 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-colors"
                style={{
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-divider)',
                  color: 'var(--color-text-primary)',
                }}
              />
              {peopleQuery && (
                <button
                  type="button"
                  onClick={() => setPeopleQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)' }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {peopleQuery.trim().length >= 2 && (
              <div
                className="mt-2 rounded-xl overflow-hidden"
                style={{
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-divider)',
                }}
              >
                {peopleLoading ? (
                  <div className="flex items-center justify-center py-6" role="status" aria-label="Searching">
                    <div
                      className="w-5 h-5 border-2 rounded-full animate-spin"
                      style={{ borderColor: 'var(--color-divider)', borderTopColor: 'var(--color-primary)' }}
                      aria-hidden="true"
                    />
                  </div>
                ) : peopleResults.length === 0 ? (
                  <div className="py-6 text-center" style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>
                    No one matches &ldquo;{peopleQuery.trim()}&rdquo;
                  </div>
                ) : (
                  <ul className="divide-y list-none p-0 m-0" style={{ borderColor: 'var(--color-divider)' }}>
                    {peopleResults.map((u) => (
                      <li key={u.id}>
                        <Link
                          to={`/user/${u.id}`}
                          className="w-full flex items-center gap-3 px-3 py-3 transition-all hover:bg-black/5 active:scale-[0.99]"
                        >
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 overflow-hidden"
                            style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
                          >
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span>{u.display_name?.charAt(0).toUpperCase() || '?'}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                              {u.display_name || 'Anonymous'}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                              {u.follower_count} follower{u.follower_count === 1 ? '' : 's'}
                            </p>
                          </div>
                          <svg
                            className="w-4 h-4 flex-shrink-0"
                            style={{ color: 'var(--color-text-tertiary)' }}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

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

          {/* Tabs: Journal / Playlists / Saved */}
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
            {['journal', 'playlists', 'saved'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 py-3 text-xs font-semibold text-center"
                style={{
                  color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                  borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
                  background: 'transparent',
                  border: 'none',
                  borderBottomWidth: 2,
                  borderBottomStyle: 'solid',
                  borderBottomColor: activeTab === tab ? 'var(--color-primary)' : 'transparent',
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* --- Journal tab --- */}
          {activeTab === 'journal' && (
            <>
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
            </>
          )}

          {/* --- Playlists tab --- */}
          {activeTab === 'playlists' && (
            <div className="px-4 pt-4 pb-6">
              <div
                className="text-xs font-bold uppercase tracking-wider pb-3"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {myPlaylists.length} {myPlaylists.length === 1 ? 'playlist' : 'playlists'}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setCreatePlaylistOpen(true)}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    border: '1.5px dashed var(--color-accent-gold)',
                    borderRadius: 8,
                    background: 'var(--color-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 32,
                    color: 'var(--color-accent-gold)',
                  }}
                >
                  +
                </button>
                {myPlaylists.map((p) => (
                  <PlaylistGridCard key={p.id} playlist={p} />
                ))}
              </div>
            </div>
          )}

          {/* --- Saved tab --- */}
          {activeTab === 'saved' && (
            <div className="px-4 pt-4 pb-6">
              {savedPlaylists.length === 0 ? (
                <div className="py-10 text-center" style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🎵</div>
                  Playlists you follow will appear here
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {savedPlaylists.map((p) => (
                    <PlaylistGridCard
                      key={p.playlist_id}
                      playlist={p}
                      tombstone={p.visibility === 'unavailable'}
                    />
                  ))}
                </div>
              )}
            </div>
          )}



          <CreatePlaylistModal
            isOpen={createPlaylistOpen}
            onClose={() => setCreatePlaylistOpen(false)}
          />

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
