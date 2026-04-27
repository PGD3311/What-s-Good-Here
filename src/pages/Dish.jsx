import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { capture } from '../lib/analytics'
import { logger } from '../utils/logger'
import { useAuth } from '../context/AuthContext'
import { shareOrCopy, buildDishShareData } from '../utils/share'
import { toast } from 'sonner'
import { useFavorites } from '../hooks/useFavorites'
import { useDishDetail } from '../hooks/useDishDetail'
import { useProfile } from '../hooks/useProfile'
import { useMyLocalList } from '../hooks/useMyLocalList'
import { ReviewFlow } from '../components/ReviewFlow'
import { PhotoUploadConfirmation } from '../components/PhotoUploadConfirmation'
import { LoginModal } from '../components/Auth/LoginModal'
import { HeartIcon } from '../components/HeartIcon'
import { DishHero, DishEvidence } from '../components/dish'
import { AddToPlaylistSheet } from '../components/playlists/AddToPlaylistSheet'
import { ReportModal } from '../components/ReportModal'
import { MIN_VOTES_FOR_RANKING } from '../constants/app'
import { sanitizeUrl } from '../utils/sanitize'
import { openExternalLink } from '../utils/openExternalLink'
import { authApi } from '../api/authApi'
import { dishPhotosApi } from '../api/dishPhotosApi'

export function Dish() {
  const { dishId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const {
    dish, loading, error,
    variants, parentDish, isVariant,
    photoUploaded, allPhotos, communityPhotos,
    friendsVotes, smartSnippet,
    reviews, reviewsLoading,
    shouldLoadEvidence, evidenceSentinelRef,
    handlePhotoUploaded, handleVote, clearPhotoUploaded,
  } = useDishDetail(dishId, user)

  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [playlistSheetOpen, setPlaylistSheetOpen] = useState(false)
  const [showReportDish, setShowReportDish] = useState(false)
  const [showRateFlow, setShowRateFlow] = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // 'rate' | null
  const [priorVote, setPriorVote] = useState(null)
  const [existingPhoto, setExistingPhoto] = useState(null)
  const { isFavorite, toggleFavorite } = useFavorites(user?.id)
  const { profile } = useProfile(user?.id)
  const { dishes: myListDishes, addDish, adding: addingToMyList, loading: myListLoading } = useMyLocalList()
  const isCurator = !!profile?.is_local_curator
  const isOnMyList = isCurator && myListDishes.some((d) => d.dish_id === dishId)
  const myListIsFull = isCurator && myListDishes.length >= 10
  const myListReady = isCurator && !myListLoading

  const handleAddToTop10 = async () => {
    if (!isCurator || isOnMyList || myListIsFull || addingToMyList) return
    try {
      const result = await addDish(dishId)
      if (result?.success) {
        if (result.already_present) {
          toast.success("Already on your Top 10", { duration: 2000 })
        } else {
          toast.success(`Added to your Top 10 (${result.item_count}/10)`, { duration: 2500 })
        }
      } else {
        toast.error(result?.error || "Couldn't add to your Top 10")
      }
    } catch (err) {
      logger.error('Add to Top 10 failed:', err)
      toast.error(err?.message || "Couldn't add to your Top 10")
    }
  }

  // Fetch prior vote + prior photo in parallel so the CTA label and the
  // ReviewFlow photo thumbnail both reflect current state.
  useEffect(() => {
    if (!user || !dishId) {
      setPriorVote(null)
      setExistingPhoto(null)
      return
    }
    let cancelled = false
    // allSettled so a photo-fetch failure doesn't also discard the vote fetch —
    // otherwise the CTA label silently regresses to "Rate this dish" for re-raters.
    Promise.allSettled([
      authApi.getUserVoteForDish(dishId, user.id),
      dishPhotosApi.getUserPhotoForDish(dishId),
    ]).then(([voteResult, photoResult]) => {
      if (cancelled) return
      if (voteResult.status === 'fulfilled') {
        setPriorVote(voteResult.value)
      } else {
        logger.error('Failed to fetch prior vote:', voteResult.reason)
      }
      if (photoResult.status === 'fulfilled') {
        setExistingPhoto(photoResult.value ? { id: photoResult.value.id, photo_url: photoResult.value.photo_url } : null)
      } else {
        logger.error('Failed to fetch prior photo:', photoResult.reason)
      }
    })
    return () => { cancelled = true }
  }, [dishId, user])

  // Auth-gate intent preservation: once the user finishes logging in,
  // resume straight into the rate flow.
  useEffect(() => {
    if (user && pendingAction === 'rate') {
      setPendingAction(null)
      setShowRateFlow(true)
    }
  }, [user, pendingAction])

  const handleLoginRequired = () => setLoginModalOpen(true)

  const handleRateClick = () => {
    if (showRateFlow) {
      setShowRateFlow(false)
      return
    }
    if (!user) {
      setPendingAction('rate')
      setLoginModalOpen(true)
      return
    }
    setShowRateFlow(true)
  }

  const handleVoteSubmitted = () => {
    setShowRateFlow(false)
    // Refresh prior-vote and prior-photo so CTA label and thumbnail stay current.
    // allSettled so a photo-fetch failure doesn't discard the vote result.
    if (user && dishId) {
      Promise.allSettled([
        authApi.getUserVoteForDish(dishId, user.id),
        dishPhotosApi.getUserPhotoForDish(dishId),
      ]).then(([voteResult, photoResult]) => {
        if (voteResult.status === 'fulfilled') {
          setPriorVote(voteResult.value)
        } else {
          logger.error('Failed to refresh prior vote:', voteResult.reason)
        }
        if (photoResult.status === 'fulfilled') {
          setExistingPhoto(photoResult.value ? { id: photoResult.value.id, photo_url: photoResult.value.photo_url } : null)
        } else {
          logger.error('Failed to refresh prior photo:', photoResult.reason)
        }
      })
    }
    handleVote?.()
  }

  const handleToggleSave = async () => {
    if (!user) {
      setLoginModalOpen(true)
      return
    }
    try {
      await toggleFavorite(dishId)
    } catch (error) {
      logger.error('Failed to toggle favorite:', error)
    }
  }

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else if (dish?.restaurant_id) {
      navigate(`/restaurants/${dish.restaurant_id}`)
    } else {
      navigate('/')
    }
  }

  const handleShare = async () => {
    const shareData = buildDishShareData(dish)
    const result = await shareOrCopy(shareData)

    capture('dish_shared', {
      dish_id: dish.dish_id,
      dish_name: dish.dish_name,
      restaurant_name: dish.restaurant_name,
      context: 'dish_page',
      method: result.method,
      success: result.success,
    })

    if (result.success && result.method !== 'native') {
      toast.success('Link copied!', { duration: 2000 })
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--color-surface-elevated)' }}>
        <div className="animate-pulse">
          <div className="aspect-[4/3] w-full" style={{ background: 'var(--color-divider)' }} />
          <div
            className="mx-4 -mt-5 rounded-xl p-5 space-y-3"
            style={{ background: 'var(--color-surface-elevated)', boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)' }}
          >
            <div className="h-6 w-48 rounded" style={{ background: 'var(--color-divider)' }} />
            <div className="h-4 w-32 rounded" style={{ background: 'var(--color-divider)' }} />
            <div className="flex items-end justify-between pt-2">
              <div className="h-10 w-14 rounded" style={{ background: 'var(--color-divider)' }} />
              <div className="h-4 w-24 rounded" style={{ background: 'var(--color-divider)' }} />
            </div>
          </div>
          <div className="p-4 mt-4 space-y-3">
            <div className="h-4 w-48 rounded" style={{ background: 'var(--color-divider)' }} />
            <div className="h-4 w-32 rounded" style={{ background: 'var(--color-divider)' }} />
          </div>
        </div>
      </div>
    )
  }

  if (error || !dish) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-surface-elevated)' }}>
        <div className="text-center p-4">
          <img
            src="/empty-plate.webp"
            alt=""
            className="w-16 h-16 mx-auto mb-4 rounded-full object-cover"
          />
          <p className="font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            Dish not found
          </p>
          <button
            onClick={handleBack}
            className="mt-4 px-5 py-2.5 text-sm font-bold rounded-lg card-press"
            style={{
              background: 'var(--color-primary)',
              color: '#FFFFFF',
            }}
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  const isRanked = dish.total_votes >= MIN_VOTES_FOR_RANKING

  return (
    <div className="min-h-screen pb-20" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-30 px-3 py-2 flex items-center gap-2 top-bar"
        style={{
          background: 'var(--color-bg)',
          borderBottom: '1.5px solid var(--color-divider)',
        }}
      >
        <button
          onClick={handleBack}
          aria-label="Go back"
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ color: 'var(--color-text-primary)' }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1" />

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={handleShare}
            aria-label="Share dish"
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{ color: 'var(--color-text-primary)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
          <button
            onClick={handleToggleSave}
            aria-label={isFavorite?.(dishId) ? 'Remove from favorites' : 'Add to favorites'}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{ color: 'var(--color-text-primary)' }}
          >
            <HeartIcon size={22} active={isFavorite?.(dishId)} />
          </button>
          {/* Add to playlist */}
          <button
            onClick={() => {
              if (!user) { setLoginModalOpen(true); return }
              setPlaylistSheetOpen(true)
            }}
            aria-label="Add to playlist"
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all active:scale-95"
            style={{ background: 'var(--color-surface-elevated)', border: '1.5px solid var(--color-divider)', fontSize: 18, color: 'var(--color-primary)', fontWeight: 700 }}
          >
            +
          </button>
          {user && dish && dish.created_by !== user.id && (
            <button
              type="button"
              onClick={() => setShowReportDish(true)}
              aria-label="Report this dish"
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Photo confirmation after upload */}
      {photoUploaded ? (
        <div className="p-4">
          <PhotoUploadConfirmation
            dishName={dish.dish_name}
            photoUrl={photoUploaded.photo_url}
            status={photoUploaded.analysisResults?.status}
            onRateNow={clearPhotoUploaded}
            onLater={clearPhotoUploaded}
          />
        </div>
      ) : (
        <>
          {/* LAYER 1: THE VERDICT */}
          <DishHero
            dish={dish}
            allPhotos={allPhotos}
            isVariant={isVariant}
            parentDish={parentDish}
          />

          {/* LAYER 2: THE ACTION — Rate CTA + inline rate flow */}
          <div className="p-4 space-y-3">
            <button
              type="button"
              onClick={handleRateClick}
              aria-expanded={showRateFlow}
              aria-controls="rate-flow-panel"
              className="w-full py-4 px-6 rounded-xl font-semibold shadow-lg transition-all duration-200 ease-out focus-ring active:scale-98 hover:shadow-xl"
              style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
            >
              {showRateFlow
                ? 'Close'
                : priorVote ? 'Update your rating' : 'Rate this dish'}
            </button>
            {showRateFlow && (
              <div
                id="rate-flow-panel"
                className="p-4 rounded-xl"
                style={{
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-divider)',
                }}
              >
                <ReviewFlow
                  dishId={dish.dish_id}
                  dishName={dish.dish_name}
                  restaurantId={dish.restaurant_id}
                  restaurantName={dish.restaurant_name}
                  category={dish.category}
                  price={dish.price}
                  totalVotes={dish.total_votes}
                  isRanked={isRanked}
                  existingPhoto={existingPhoto}
                  onVote={handleVoteSubmitted}
                  onLoginRequired={handleLoginRequired}
                  onPhotoUploaded={handlePhotoUploaded}
                />
              </div>
            )}
            {myListReady && (
              isOnMyList ? (
                <button
                  type="button"
                  onClick={() => navigate('/my-list')}
                  className="w-full py-3 px-4 rounded-xl font-semibold transition-all active:scale-98"
                  style={{
                    background: 'var(--color-surface-elevated)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-divider)',
                  }}
                >
                  ✓ On your Top 10 — manage in My List
                </button>
              ) : myListIsFull ? (
                <button
                  type="button"
                  onClick={() => navigate('/my-list')}
                  className="w-full py-3 px-4 rounded-xl font-semibold transition-all active:scale-98"
                  style={{
                    background: 'var(--color-surface-elevated)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-divider)',
                  }}
                >
                  Top 10 is full — remove a dish in My List first
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAddToTop10}
                  disabled={addingToMyList}
                  className="w-full py-3 px-4 rounded-xl font-semibold transition-all active:scale-98 disabled:opacity-60"
                  style={{
                    background: 'var(--color-surface-elevated)',
                    color: 'var(--color-primary)',
                    border: '1.5px dashed var(--color-primary)',
                    cursor: addingToMyList ? 'default' : 'pointer',
                  }}
                >
                  {addingToMyList ? 'Adding…' : `+ Add to your Top 10 (${myListDishes.length}/10)`}
                </button>
              )
            )}
          </div>

          {/* LAYER 3: THE EVIDENCE (reviews) */}
          <DishEvidence
            dish={dish}
            dishId={dishId}
            user={user}
            shouldLoadEvidence={shouldLoadEvidence}
            evidenceSentinelRef={evidenceSentinelRef}
            friendsVotes={friendsVotes}
            smartSnippet={smartSnippet}
            allPhotos={allPhotos}
            communityPhotos={communityPhotos}
            reviews={reviews}
            reviewsLoading={reviewsLoading}
            variants={variants}
            isVariant={isVariant}
          />

          {/* LAYER 4: SECONDARY ACTION */}
          {sanitizeUrl(dish.website_url) && (
            <div className="px-3 pt-3">
              <a
                href={sanitizeUrl(dish.website_url)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  capture('order_link_clicked', {
                    dish_id: dish.dish_id,
                    dish_name: dish.dish_name,
                    restaurant_id: dish.restaurant_id,
                    restaurant_name: dish.restaurant_name,
                  })
                  openExternalLink(e, e.currentTarget.href)
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all active:scale-95"
                style={{
                  background: 'var(--color-primary)',
                  color: 'var(--color-text-on-primary)',
                }}
              >
                Order Online
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </a>
            </div>
          )}
        </>
      )}

      {/* Floating action bar */}
      <div
        className="fixed left-0 right-0 px-3"
        style={{
          bottom: 'calc(64px + env(safe-area-inset-bottom))',
          zIndex: 40,
        }}
      >
        <div
          className="flex gap-2 p-2 rounded-2xl"
          style={{
            background: 'var(--color-card)',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.15), 0 0 0 1px var(--color-divider)',
            backdropFilter: 'blur(16px)',
          }}
        >
          {(dish.toast_slug || sanitizeUrl(dish.order_url)) ? (
            <a
              href={dish.toast_slug ? 'https://order.toasttab.com/online/' + dish.toast_slug : sanitizeUrl(dish.order_url)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                capture('order_clicked', {
                  dish_id: dish.dish_id,
                  dish_name: dish.dish_name,
                  restaurant_id: dish.restaurant_id,
                  restaurant_name: dish.restaurant_name,
                  source: dish.toast_slug ? 'toast' : 'order_url',
                })
                openExternalLink(e, e.currentTarget.href)
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97]"
              style={{
                background: 'var(--color-accent-orange)',
                color: 'white',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
              </svg>
              Order Now
            </a>
          ) : sanitizeUrl(dish.website_url) ? (
            <a
              href={sanitizeUrl(dish.website_url)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => openExternalLink(e, e.currentTarget.href)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97]"
              style={{
                background: 'var(--color-primary)',
                color: 'white',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
              See Menu
            </a>
          ) : null}

          <a
            href={dish.restaurant_lat && dish.restaurant_lng
              ? 'https://www.google.com/maps/dir/?api=1&destination=' + dish.restaurant_lat + ',' + dish.restaurant_lng
              : 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent((dish.restaurant_address || (dish.restaurant_name + ', ' + (dish.restaurant_town || "Martha's Vineyard") + ', MA')))
            }
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => openExternalLink(e, e.currentTarget.href)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97]"
            style={{
              background: 'var(--color-accent-gold)',
              color: 'var(--color-bg)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
            Directions
          </a>
        </div>
      </div>

      {/* Login Modal */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
      />
      <AddToPlaylistSheet
        isOpen={playlistSheetOpen}
        onClose={() => setPlaylistSheetOpen(false)}
        dishId={dishId}
        dishName={dish?.dish_name}
        restaurantName={dish?.restaurant_name}
      />
      <ReportModal
        isOpen={showReportDish}
        onClose={() => setShowReportDish(false)}
        target={{ type: 'dish', id: dishId, label: dish?.dish_name }}
      />
    </div>
  )
}
