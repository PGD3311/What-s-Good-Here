import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useVote } from '../hooks/useVote'
import { usePurityTracker } from '../hooks/usePurityTracker'
import JitterBox from '../utils/jitter-box'
import { jitterApi } from '../api/jitterApi'
import { authApi } from '../api/authApi'
import { dishPhotosApi } from '../api/dishPhotosApi'
import { FoodRatingSlider } from './FoodRatingSlider'
import { MAX_REVIEW_LENGTH } from '../constants/app'
import {
  getPendingVoteFromStorage,
  clearPendingVoteStorage,
  getStorageItem,
  STORAGE_KEYS,
} from '../lib/storage'
import { logger } from '../utils/logger'
import { hapticLight, hapticSuccess } from '../utils/haptics'
import { PhotoUploadButton } from './PhotoUploadButton'
import { AddPhotoNudge } from './AddPhotoNudge'
import { useProfile } from '../hooks/useProfile'
import { setBackButtonInterceptor, clearBackButtonInterceptor } from '../utils/backButtonInterceptor'
import { validateUserContent } from '../lib/reviewBlocklist'

// Single-screen rating flow.
// - Slider defaults to null; submit stays disabled until the user touches it.
// - Review + photo are optional and collapsed by default.
// - No "would you order again?" step. Rating alone is the signal.
export function ReviewFlow({
  dishId,
  dishName,
  restaurantId,
  restaurantName,
  category,
  price,
  totalVotes = 0,
  isRanked = false,
  existingPhoto = null,
  onVote,
  onLoginRequired,
  onPhotoUploaded,
}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { submitVote, submitting } = useVote()
  const { profile, refetch: refetchProfile } = useProfile(user?.id)
  const { getPurity, getJitterProfile, attachToTextarea, reset: resetPurity } = usePurityTracker()
  const jitterBoxRef = useRef(null)
  const [photoNudgeOpen, setPhotoNudgeOpen] = useState(false)
  const photoNudgeTimerRef = useRef(null)

  // Prior-vote state: used to prefill and to decide "Update" vs "Submit" label.
  const [priorRating, setPriorRating] = useState(null)
  const [priorReviewText, setPriorReviewText] = useState(null)

  // Form state.
  // sliderValue = null means "unrated" — submit button stays disabled.
  const [sliderValue, setSliderValue] = useState(null)
  const [reviewExpanded, setReviewExpanded] = useState(false)
  const [reviewText, setReviewText] = useState('')
  const [reviewError, setReviewError] = useState(null)

  const [photoExpanded, setPhotoExpanded] = useState(false)
  const [photoAdded, setPhotoAdded] = useState(false)
  const [existingPhotoAction, setExistingPhotoAction] = useState('keep') // keep | replace | remove

  const [announcement, setAnnouncement] = useState('')
  const reviewTextareaRef = useRef(null)

  const combinedTextareaRef = (el) => {
    reviewTextareaRef.current = el
    attachToTextarea(el)
  }

  const isUpdate = priorRating !== null
  const hasDraft =
    (sliderValue !== null && sliderValue !== priorRating) ||
    (reviewText.trim() && reviewText.trim() !== (priorReviewText || '')) ||
    photoAdded ||
    existingPhotoAction !== 'keep'

  // Load prior vote (if any) to prefill.
  useEffect(() => {
    let cancelled = false
    async function fetchUserVote() {
      if (!user) {
        setPriorRating(null)
        setPriorReviewText(null)
        return
      }
      try {
        const vote = await authApi.getUserVoteForDish(dishId, user.id)
        if (cancelled) return
        if (vote) {
          setPriorRating(vote.rating_10 ?? null)
          setPriorReviewText(vote.review_text || null)
          if (vote.rating_10 != null) setSliderValue(vote.rating_10)
          if (vote.review_text) {
            setReviewText(vote.review_text)
            setReviewExpanded(true)
          }
        }
      } catch (error) {
        logger.error('Error fetching user vote:', error)
      }
    }
    fetchUserVote()
    return () => { cancelled = true }
  }, [dishId, user])

  // Clear any stale pending-vote localStorage from the old thumbs-first flow.
  useEffect(() => {
    const stored = getPendingVoteFromStorage()
    if (stored && stored.dishId === dishId) {
      clearPendingVoteStorage()
    }
  }, [dishId])

  // Attach JitterBox to textarea when expanded.
  useEffect(() => {
    if (reviewExpanded && reviewTextareaRef.current && !jitterBoxRef.current) {
      jitterBoxRef.current = JitterBox.attach(reviewTextareaRef.current)
    }
    return () => {
      if (jitterBoxRef.current) {
        jitterBoxRef.current.detach()
        jitterBoxRef.current = null
      }
    }
  }, [reviewExpanded])

  // Cancel pending photo-nudge timer on unmount so it doesn't fire into
  // a torn-down component.
  useEffect(() => {
    return () => {
      if (photoNudgeTimerRef.current) clearTimeout(photoNudgeTimerRef.current)
    }
  }, [])

  // Intercept browser back during unsaved drafts: prompt before leaving.
  useEffect(() => {
    if (!hasDraft) {
      clearBackButtonInterceptor()
      return
    }
    const currentUrl = window.location.href
    const currentState = window.history.state
    setBackButtonInterceptor(() => {
      // Restore the URL first so the draft page stays visible during the confirm.
      window.history.pushState(currentState, '', currentUrl)
      if (window.confirm('Discard draft?')) {
        clearBackButtonInterceptor()
        window.history.back()
      }
    })
    return () => clearBackButtonInterceptor()
  }, [hasDraft])

  const handleSubmit = async () => {
    if (sliderValue === null) return // safety guard — button should already be disabled
    if (!user) {
      onLoginRequired?.()
      return
    }

    // Review validation
    if (reviewText.length > MAX_REVIEW_LENGTH) {
      setReviewError(`${reviewText.length - MAX_REVIEW_LENGTH} characters over limit`)
      return
    }
    if (reviewText.trim()) {
      const contentError = validateUserContent(reviewText, 'Review')
      if (contentError) {
        setReviewError(contentError)
        return
      }
    }
    setReviewError(null)

    if (sliderValue < 0 || sliderValue > 10) {
      logger.error('Invalid rating value:', sliderValue)
      return
    }

    const reviewTextToSubmit = reviewText.trim() || null

    const badge = reviewTextToSubmit && jitterBoxRef.current ? jitterBoxRef.current.score() : null
    const purityData = badge ? { purity: badge.purity } : (reviewTextToSubmit ? getPurity() : null)
    const jitterData = badge ? badge.profile : (reviewTextToSubmit ? getJitterProfile() : null)
    const jitterScore = badge
      ? { score: badge.war, flags: badge.flags, classification: badge.classification }
      : null

    const attestResult = jitterScore && user
      ? await jitterApi.attestReview({
          userId: user.id,
          warScore: jitterScore.score,
          classification: jitterScore.classification,
          flags: jitterScore.flags,
          meta: {
            keys: badge?.session?.keystrokes || 0,
            paste_chars: badge?.session?.pasteChars || 0,
            focus_ms: badge?.session?.duration ? badge.session.duration * 1000 : 0,
          },
        })
      : null
    const badgeHash = attestResult?.badge_hash || null

    const result = await submitVote(dishId, sliderValue, reviewTextToSubmit, purityData, jitterData, jitterScore, badgeHash)

    if (!result.success) {
      logger.error('Vote submission failed:', result.error)
      setReviewError(result.error || 'Unable to submit your rating. Please try again.')
      return
    }

    // Photo lifecycle: if the user had a prior photo and chose Remove, or
    // chose Replace and successfully uploaded a new one, delete the old row.
    // Vote already saved; photo failure is logged but doesn't roll back the rating.
    if (existingPhoto?.id && (
      existingPhotoAction === 'remove' ||
      (existingPhotoAction === 'replace' && photoAdded)
    )) {
      try {
        await dishPhotosApi.deletePhoto(existingPhoto.id)
      } catch (err) {
        logger.error('Failed to delete old photo after vote update:', err)
      }
    }

    // Analytics: votesApi.submitVote emits rating_submitted for every vote.
    // Dashboards that need dish/restaurant context can join against dish_id
    // in PostHog.

    setPriorRating(sliderValue)
    if (reviewTextToSubmit) setPriorReviewText(reviewTextToSubmit)
    setPhotoAdded(false)
    setExistingPhotoAction('keep')
    setReviewError(null)
    resetPurity()
    if (jitterBoxRef.current) jitterBoxRef.current.reset()

    hapticSuccess()
    setAnnouncement('Rating saved')
    setTimeout(() => setAnnouncement(''), 1000)

    // Identity scaffolding nudge: logged-in users without an avatar get one
    // soft prompt to add a face after a successful rating. Delayed so the
    // haptic + "Rating saved" announcement land first. The timer ref lets
    // the unmount effect cancel a pending nudge if the user navigates away
    // before it fires.
    if (user && profile && !profile.avatar_url && !getStorageItem(STORAGE_KEYS.HAS_SEEN_PHOTO_NUDGE)) {
      photoNudgeTimerRef.current = setTimeout(() => setPhotoNudgeOpen(true), 700)
    }

    onVote?.()
  }

  const canSubmit = sliderValue !== null && !submitting && reviewText.length <= MAX_REVIEW_LENGTH
  const submitLabel = submitting ? 'Saving…' : isUpdate ? 'Update rating' : 'Submit rating'

  return (
    <div className="space-y-4">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {/* Rating slider — the single required input. */}
      <FoodRatingSlider
        value={sliderValue ?? 0}
        unrated={sliderValue === null}
        onChange={(v) => {
          setSliderValue(v)
          hapticLight()
        }}
        min={0}
        max={10}
        step={0.1}
        category={category}
      />

      {!isRanked && sliderValue === null && (
        <p className="text-xs text-center" style={{ color: 'var(--color-text-tertiary)' }}>
          {totalVotes === 0
            ? 'Be the first to rate this dish.'
            : `${totalVotes} rating${totalVotes === 1 ? '' : 's'} so far \u00B7 ${Math.max(0, 5 - totalVotes)} more to rank`}
        </p>
      )}

      {/* Review — collapsed by default */}
      {!reviewExpanded ? (
        <button
          type="button"
          onClick={() => setReviewExpanded(true)}
          className="w-full py-3 text-sm rounded-xl transition-colors"
          style={{ color: 'var(--color-text-secondary)', border: '1px dashed var(--color-divider)' }}
        >
          + Add a review (optional)
        </button>
      ) : (
        <div className="relative">
          <label htmlFor="review-text" className="sr-only">Your review</label>
          <textarea
            ref={combinedTextareaRef}
            id="review-text"
            value={reviewText}
            onChange={(e) => {
              setReviewText(e.target.value)
              if (reviewError) setReviewError(null)
            }}
            placeholder="What stood out?"
            aria-label="Write your review"
            aria-describedby={reviewError ? 'review-error' : 'review-char-count'}
            aria-invalid={!!reviewError}
            maxLength={MAX_REVIEW_LENGTH + 50}
            rows={3}
            className="w-full p-4 rounded-xl text-sm resize-none focus:outline-none focus-ring"
            style={{
              background: 'var(--color-surface-elevated)',
              border: reviewError ? '2px solid var(--color-primary)' : '1px solid var(--color-divider)',
              color: 'var(--color-text-primary)',
            }}
          />
          {reviewText.length > 0 && (
            <div
              id="review-char-count"
              className="absolute bottom-2 right-3 text-xs"
              style={{ color: reviewText.length > MAX_REVIEW_LENGTH ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}
            >
              {reviewText.length}/{MAX_REVIEW_LENGTH}
            </div>
          )}
          {reviewError && (
            <p id="review-error" role="alert" className="text-sm text-center mt-1" style={{ color: 'var(--color-primary)' }}>
              {reviewError}
            </p>
          )}
        </div>
      )}

      {/* Photo — collapsed by default; if user had a prior photo, show thumbnail + keep/replace/remove. */}
      {existingPhoto && !photoAdded ? (
        <div
          className="p-3 rounded-xl space-y-2"
          style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-divider)' }}
        >
          <div className="flex items-center gap-3">
            <img src={existingPhoto.photo_url} alt="Your existing photo" className="w-16 h-16 rounded-lg object-cover" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Your photo</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setExistingPhotoAction('keep')}
                  className="text-xs px-2 py-1 rounded-md"
                  style={{
                    background: existingPhotoAction === 'keep' ? 'var(--color-primary)' : 'transparent',
                    color: existingPhotoAction === 'keep' ? 'var(--color-text-on-primary)' : 'var(--color-text-secondary)',
                    border: '1px solid var(--color-divider)',
                  }}
                >
                  Keep
                </button>
                <button
                  type="button"
                  onClick={() => { setExistingPhotoAction('replace'); setPhotoExpanded(true) }}
                  className="text-xs px-2 py-1 rounded-md"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-divider)' }}
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setExistingPhotoAction('remove')}
                  className="text-xs px-2 py-1 rounded-md"
                  style={{
                    background: existingPhotoAction === 'remove' ? 'var(--color-danger)' : 'transparent',
                    color: existingPhotoAction === 'remove' ? 'var(--color-text-on-primary)' : 'var(--color-danger)',
                    border: '1px solid var(--color-divider)',
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
          {existingPhotoAction === 'replace' && photoExpanded && (
            <PhotoUploadButton
              dishId={dishId}
              onPhotoUploaded={(photo) => {
                setPhotoAdded(true)
                onPhotoUploaded?.(photo)
              }}
              onLoginRequired={onLoginRequired}
            />
          )}
        </div>
      ) : !photoExpanded && !photoAdded ? (
        <button
          type="button"
          onClick={() => setPhotoExpanded(true)}
          className="w-full py-3 text-sm rounded-xl transition-colors"
          style={{ color: 'var(--color-text-secondary)', border: '1px dashed var(--color-divider)' }}
        >
          + Add a photo (optional)
        </button>
      ) : photoAdded ? (
        <div
          className="flex items-center gap-2 p-3 rounded-xl"
          style={{ background: 'var(--color-success-muted)', border: '1px solid var(--color-success-border)' }}
        >
          <svg
            className="w-5 h-5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            style={{ color: 'var(--color-success)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>Photo added</span>
        </div>
      ) : (
        <PhotoUploadButton
          dishId={dishId}
          onPhotoUploaded={(photo) => {
            setPhotoAdded(true)
            onPhotoUploaded?.(photo)
          }}
          onLoginRequired={onLoginRequired}
        />
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full py-4 px-6 rounded-xl font-semibold shadow-lg transition-all duration-200 ease-out focus-ring ${canSubmit ? 'active:scale-98 hover:shadow-xl' : 'opacity-50 cursor-not-allowed'}`}
        style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
      >
        {submitLabel}
      </button>

      {restaurantId && !hasDraft && isUpdate && (
        <button
          onClick={() => navigate('/restaurants/' + restaurantId + '/rate')}
          className="w-full py-3 px-4 rounded-xl flex items-center justify-between transition-all active:scale-[0.98]"
          style={{ background: 'var(--color-primary-muted)', border: '1px solid var(--color-primary)' }}
        >
          <div className="text-left">
            <p className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>
              Had more at {restaurantName || 'this restaurant'}?
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              Rate your whole meal in one go
            </p>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-5 h-5 flex-shrink-0"
            style={{ color: 'var(--color-primary)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}

      <AddPhotoNudge
        isOpen={photoNudgeOpen}
        onClose={() => setPhotoNudgeOpen(false)}
        onUploaded={refetchProfile}
      />
    </div>
  )
}
