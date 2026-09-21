import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ReviewFlow } from './ReviewFlow'
import { PhotoUploadButton } from './PhotoUploadButton'
import { PhotoUploadConfirmation } from './PhotoUploadConfirmation'
import { dishPhotosApi } from '../api/dishPhotosApi'
import { logger } from '../utils/logger'
import { shareOrCopy, buildDishShareData } from '../utils/share'
import { capture } from '../lib/analytics'
import { toast } from 'sonner'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { getResponsiveImageProps } from '../utils/images'

export function DishModal({ dish, onClose, onVote, onLoginRequired }) {
  const navigate = useNavigate()
  const [photoUploaded, setPhotoUploaded] = useState(null)
  // Tracks whether the user submitted a rating during THIS modal session.
  // Used to suppress the "Would you like to rate now?" prompt in
  // PhotoUploadConfirmation when the user has already rated mid-session
  // (e.g. rated → then uploaded a photo). Profile.jsx only opens this modal
  // for unrated dishes, so an initial-rated case doesn't apply here today.
  const [voteSubmitted, setVoteSubmitted] = useState(false)
  const [featuredPhoto, setFeaturedPhoto] = useState(null)
  const [communityPhotos, setCommunityPhotos] = useState([])
  const [allPhotos, setAllPhotos] = useState([])
  const [showAllPhotos, setShowAllPhotos] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  const [photoLoadError, setPhotoLoadError] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [featuredImageLoaded, setFeaturedImageLoaded] = useState(false)

  // Focus trap hook must be called BEFORE any early returns to satisfy React hooks rules
  const modalRef = useFocusTrap(!!dish && !isClosing, onClose)

  // Handle escape key for lightbox (separate from modal's escape handler)
  useEffect(() => {
    if (!lightboxPhoto) return

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation() // Prevent modal from also closing
        setLightboxPhoto(null)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [lightboxPhoto])

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (!dish) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [dish])

  // Track if closing via back button to avoid double history.back()
  const closingViaBackButton = useRef(false)

  // Animated close handler
  const handleClose = useCallback(() => {
    if (isClosing) return // Prevent double close
    setIsClosing(true)

    // If not closing via back button, go back in history to remove our pushed entry
    if (!closingViaBackButton.current) {
      window.history.back()
    }
    closingViaBackButton.current = false

    setTimeout(() => {
      setIsClosing(false)
      onClose?.()
    }, 200) // Match animation duration
  }, [isClosing, onClose])

  // Handle back button to close modal
  useEffect(() => {
    if (!dish) return

    // Push a history entry when modal opens
    window.history.pushState({ modal: 'dish', dishId: dish.dish_id }, '')

    const handlePopState = () => {
      // Back button was pressed - close the modal
      closingViaBackButton.current = true
      handleClose()
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [dish?.dish_id, handleClose])

  // Share functionality - must be before early return to satisfy hooks rules
  const handleShare = useCallback(async () => {
    if (!dish) return
    const shareData = buildDishShareData(dish)
    const result = await shareOrCopy(shareData)

    capture('dish_shared', {
      dish_id: dish.dish_id,
      dish_name: dish.dish_name,
      restaurant_name: dish.restaurant_name,
      context: 'dish_modal',
      method: result.method,
      success: result.success,
    })

    if (result.success && result.method !== 'native') {
      toast.success('Link copied!', { duration: 2000 })
    }
  }, [dish])

  // Fetch photos when modal opens
  useEffect(() => {
    if (!dish?.dish_id) return

    const fetchPhotos = async () => {
      try {
        setPhotoLoadError(false)
        const [featured, community, all] = await Promise.all([
          dishPhotosApi.getFeaturedPhoto(dish.dish_id),
          dishPhotosApi.getCommunityPhotos(dish.dish_id),
          dishPhotosApi.getAllVisiblePhotos(dish.dish_id),
        ])
        setFeaturedPhoto(featured)
        setCommunityPhotos(community)
        setAllPhotos(all)
      } catch (error) {
        logger.error('Failed to fetch photos:', error)
        setPhotoLoadError(true)
      }
    }

    fetchPhotos()
  }, [dish?.dish_id])

  if (!dish) return null

  const handlePhotoUploaded = async (photo) => {
    setPhotoUploaded(photo)
    // Refresh photos after upload
    try {
      const [featured, community, all] = await Promise.all([
        dishPhotosApi.getFeaturedPhoto(dish.dish_id),
        dishPhotosApi.getCommunityPhotos(dish.dish_id),
        dishPhotosApi.getAllVisiblePhotos(dish.dish_id),
      ])
      setFeaturedPhoto(featured)
      setCommunityPhotos(community)
      setAllPhotos(all)
    } catch (error) {
      logger.error('Failed to refresh photos after upload:', error)
    }
  }

  const handleRateNow = () => {
    setPhotoUploaded(null)
    onClose?.()
  }

  const handleLater = () => {
    setPhotoUploaded(null)
    onClose()
  }

  // Wraps the parent's onVote so we can mark the in-session rating state
  // before bubbling the event. ReviewFlow calls onVote() with no args.
  const handleVote = () => {
    setVoteSubmitted(true)
    onVote?.()
  }

  // Photos to display in the grid (first 4 of community, or all if showing all)
  const displayPhotos = showAllPhotos ? allPhotos : communityPhotos.slice(0, 4)
  const hasMorePhotos = allPhotos.length > 4 && !showAllPhotos

  return createPortal(
    <div
      key={`modal-${dish.dish_id}`}
      className={isClosing ? 'animate-backdrop-fade-out' : 'animate-backdrop-fade-in'}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: '16px',
      }}
      onClick={handleClose}
      role="presentation"
    >
      {/* Modal card */}
      <div
        ref={(el) => {
          if (el) el.scrollTop = 0
          // Merge with focus trap ref
          if (modalRef) modalRef.current = el
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dish-modal-title"
        onClick={(e) => e.stopPropagation()}
        className={isClosing ? 'animate-modal-slide-down' : 'animate-modal-slide-up'}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '360px',
          maxHeight: '85vh',
          overflowY: 'auto',
          backgroundColor: 'var(--color-surface-elevated)',
          borderRadius: '16px',
          padding: '20px',
          border: '1.5px solid var(--color-divider)',
          boxShadow: 'none',
        }}
      >
        {/* Action buttons - top right */}
        <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '8px' }}>
          {/* Share button */}
          <button
            onClick={handleShare}
            aria-label="Share dish"
            className="tap-target"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-divider)',
              color: 'var(--color-text-secondary)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>

          {/* Close button */}
          <button
            onClick={handleClose}
            aria-label="Close modal"
            className="tap-target"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-divider)',
              color: 'var(--color-text-secondary)',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Show photo confirmation if just uploaded */}
        {photoUploaded ? (
          <PhotoUploadConfirmation
            dishName={dish.dish_name}
            photoUrl={photoUploaded.photo_url}
            status={photoUploaded.analysisResults?.status}
            hasRated={voteSubmitted}
            onRateNow={handleRateNow}
            onLater={handleLater}
          />
        ) : (
          <>
            {/* Dish name + restaurant */}
            <h2 id="dish-modal-title" style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '4px', paddingRight: '30px', color: 'var(--color-text-primary)' }}>
              {dish.dish_name}
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
              {dish.restaurant_name}
              {dish.price && ` · $${Number(dish.price).toFixed(0)}`}
            </p>

            {/* See Reviews and Photos button */}
            <button
              onClick={() => {
                handleClose()
                // Small delay to let modal close animation complete
                setTimeout(() => navigate(`/dish/${dish.dish_id}`), 200)
              }}
              className="w-full py-2.5 mb-4 rounded-xl text-sm font-medium transition-all hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-divider)',
              }}
            >
              <span>See Reviews & Photos</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Photo load error feedback */}
            {photoLoadError && (
              <div style={{
                padding: '12px',
                marginBottom: '12px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-danger-muted)',
                color: 'var(--color-danger)',
                fontSize: '13px',
                textAlign: 'center',
              }}>
                Unable to load photos
              </div>
            )}

            {/* Featured photo (hero) */}
            {featuredPhoto && (
              <button
                className="dish-hero-photo tap-target image-placeholder"
                onClick={() => setLightboxPhoto(featuredPhoto.photo_url)}
                aria-label={`View featured photo of ${dish.dish_name}`}
              >
                <img
                  {...getResponsiveImageProps(featuredPhoto.photo_url, [400, 600, 800])}
                  alt={dish.dish_name}
                  loading="lazy"
                  sizes="(max-width: 640px) 100vw, 600px"
                  className={`transition-opacity duration-300 ${featuredImageLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => setFeaturedImageLoaded(true)}
                  onError={(e) => {
                    // Hide broken images
                    e.target.style.display = 'none'
                  }}
                />
                {featuredPhoto.source_type === 'restaurant' && (
                  <span className="photo-badge restaurant">Official</span>
                )}
              </button>
            )}

            {/* Community photos grid */}
            {displayPhotos.length > 0 && (
              <div className="community-photos">
                <h4>
                  {showAllPhotos ? 'All Photos' : 'Community Photos'} ({displayPhotos.length})
                </h4>
                <div className="photo-grid">
                  {displayPhotos.map((photo) => (
                    <button
                      key={photo.id}
                      className="photo-grid-item tap-target"
                      onClick={() => setLightboxPhoto(photo.photo_url)}
                      aria-label={`View photo of ${dish.dish_name}`}
                    >
                      <img
                        {...getResponsiveImageProps(photo.photo_url, [200, 300, 400])}
                        alt={dish.dish_name}
                        loading="lazy"
                        sizes="150px"
                        onError={(e) => {
                          // Hide broken images
                          e.target.parentElement.style.display = 'none'
                        }}
                      />
                    </button>
                  ))}
                </div>
                {hasMorePhotos && (
                  <button
                    className="see-all-photos-btn"
                    onClick={() => setShowAllPhotos(true)}
                  >
                    See all {allPhotos.length} photos
                  </button>
                )}
              </div>
            )}

            {/* Review Flow — single-screen rating, no thumbs */}
            <ReviewFlow
              dishId={dish.dish_id}
              dishName={dish.dish_name}
              restaurantId={dish.restaurant_id}
              restaurantName={dish.restaurant_name}
              category={dish.category}
              price={dish.price}
              totalVotes={dish.total_votes || 0}
              onVote={handleVote}
              onLoginRequired={onLoginRequired}
            />

            {/* Photo upload button */}
            <PhotoUploadButton
              dishId={dish.dish_id}
              dishName={dish.dish_name}
              category={dish.category}
              restaurantId={dish.restaurant_id}
              restaurantName={dish.restaurant_name}
              onPhotoUploaded={handlePhotoUploaded}
              onLoginRequired={onLoginRequired}
            />
          </>
        )}
      </div>

      {/* Photo lightbox */}
      {lightboxPhoto && (
        <div
          className="photo-lightbox animate-backdrop-fade-in"
          onClick={() => setLightboxPhoto(null)}
          role="dialog"
          aria-label="Photo lightbox"
        >
          <button className="lightbox-close tap-target" aria-label="Close lightbox">×</button>
          <img
            {...getResponsiveImageProps(lightboxPhoto, [800, 1200, 1600])}
            alt={dish.dish_name}
            sizes="100vw"
            onError={() => {
              // Close lightbox if image fails to load
              setLightboxPhoto(null)
            }}
          />
        </div>
      )}
    </div>,
    document.body
  )
}
