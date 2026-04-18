import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TrustBadge, TrustSummary, JitterExplainer } from '../jitter'
import { VariantSelector } from '../VariantPicker'
import { getRatingColor, formatScore10 } from '../../utils/ranking'
import { formatRelativeTime } from '../../utils/formatters'
import { ReportModal } from '../ReportModal'

/**
 * Dish evidence section: friends votes, smart snippet, photos, reviews, variants.
 * Lazy-loaded when user scrolls near.
 */
export function DishEvidence({
  dish,
  dishId,
  user,
  shouldLoadEvidence,
  evidenceSentinelRef,
  friendsVotes,
  smartSnippet,
  allPhotos,
  communityPhotos,
  reviews,
  reviewsLoading,
  variants,
  isVariant,
}) {
  const navigate = useNavigate()
  const [showAllPhotos, setShowAllPhotos] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  const [explainerOpen, setExplainerOpen] = useState(false)
  const [explainerData, setExplainerData] = useState(null)
  const [reportTarget, setReportTarget] = useState(null)

  const displayPhotos = showAllPhotos ? allPhotos : communityPhotos.slice(0, 4)
  const hasMorePhotos = allPhotos.length > 4 && !showAllPhotos

  return (
    <>
      <div ref={evidenceSentinelRef} aria-hidden="true" />
      <div className="px-3 pt-4 pb-4">

        {/* Evidence skeleton while secondary data loads */}
        {!shouldLoadEvidence && (
          <div className="space-y-3 animate-pulse" role="status" aria-label="Loading details">
            <div className="h-20 rounded-xl" style={{ background: 'var(--color-divider)' }} />
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map(function (i) { return <div key={i} className="aspect-square rounded-lg" style={{ background: 'var(--color-divider)' }} /> })}
            </div>
            <div className="h-16 rounded-xl" style={{ background: 'var(--color-divider)' }} />
          </div>
        )}

        {/* Friends who rated this */}
        {friendsVotes.length > 0 && (function () {
          var count = friendsVotes.length
          var avatarSize = count <= 3 ? 64 : count <= 5 ? 48 : 40
          var avatarFont = count <= 3 ? 24 : count <= 5 ? 18 : 15
          var nameSize = count <= 3 ? 13 : 11
          var scoreSize = count <= 3 ? 20 : count <= 5 ? 16 : 14
          var minWidth = count <= 3 ? 80 : count <= 5 ? 64 : 56
          var gap = count <= 3 ? 20 : count <= 5 ? 16 : 12
          return (
          <div className="mb-4">
            <h3 style={{
              fontFamily: "'Amatic SC', cursive",
              fontSize: '24px',
              fontWeight: 700,
              letterSpacing: '0.02em',
              color: 'var(--color-text-primary)',
              marginBottom: '12px',
            }}>
              Friends Who Rated This
            </h3>
            <div
              className={'flex overflow-x-auto pb-2' + (count <= 3 ? ' justify-center' : '')}
              style={{ gap: gap + 'px', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
            >
              {friendsVotes.map(function (vote) {
                var avatarColors = ['#E4440A', '#3B82F6', '#9333EA', '#16A34A', '#F59E0B', '#EC4899', '#06B6D4']
                var colorIndex = (vote.display_name || '').charCodeAt(0) % avatarColors.length
                return (
                  <Link
                    key={vote.user_id}
                    to={'/user/' + vote.user_id}
                    className="flex flex-col items-center flex-shrink-0"
                    style={{ minWidth: minWidth + 'px' }}
                  >
                    <div
                      className="rounded-full flex items-center justify-center font-bold"
                      style={{
                        width: avatarSize + 'px',
                        height: avatarSize + 'px',
                        background: avatarColors[colorIndex],
                        color: 'white',
                        fontSize: avatarFont + 'px',
                      }}
                    >
                      {vote.display_name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <span style={{
                      fontSize: nameSize + 'px',
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)',
                      marginTop: '4px',
                      maxWidth: minWidth + 'px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'center',
                    }}>
                      {vote.display_name || 'Anon'}
                    </span>
                    <span style={{
                      fontSize: scoreSize + 'px',
                      fontWeight: 800,
                      letterSpacing: '-0.02em',
                      color: getRatingColor(vote.rating_10),
                      marginTop: '2px',
                    }}>
                      {formatScore10(vote.rating_10)}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
          )
        })()}

        {/* Smart Snippet */}
        {smartSnippet && smartSnippet.review_text && (
          <div
            className="mb-4 p-4 rounded-xl"
            style={{
              background: 'var(--color-surface)',
              borderLeft: '3px solid var(--color-accent-gold)',
            }}
          >
            <div className="flex items-start gap-2">
              <p className="text-sm italic flex-1" style={{ color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
                &ldquo;{smartSnippet.review_text}&rdquo;
              </p>
              {user && smartSnippet.id && smartSnippet.user_id && smartSnippet.user_id !== user.id && (
                <button
                  type="button"
                  onClick={() => setReportTarget({ type: 'review', id: smartSnippet.id })}
                  className="flex-shrink-0 p-1 rounded-full"
                  aria-label="Report review"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                — @{smartSnippet.profiles?.display_name || 'Anonymous'}
              </span>
              {smartSnippet.rating_10 && (
                <span className="text-xs font-bold" style={{ color: getRatingColor(smartSnippet.rating_10) }}>
                  {formatScore10(smartSnippet.rating_10)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Photos grid */}
        {displayPhotos.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-bold mb-3" style={{ color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Photos ({displayPhotos.length})
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {displayPhotos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => setLightboxPhoto(photo)}
                  aria-label={'View photo of ' + dish.dish_name}
                  className="aspect-square rounded-lg overflow-hidden active:scale-95 transition-transform"
                  style={{ border: '1.5px solid var(--color-divider)' }}
                >
                  <img
                    src={photo.photo_url}
                    alt={dish.dish_name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={function (e) { e.target.parentElement.style.display = 'none' }}
                  />
                </button>
              ))}
            </div>
            {hasMorePhotos && (
              <button
                onClick={function () { setShowAllPhotos(true) }}
                className="mt-3 text-sm font-bold"
                style={{ color: 'var(--color-primary)' }}
              >
                See all {allPhotos.length} photos
              </button>
            )}
          </div>
        )}

        {/* Reviews feed */}
        {(function () {
          var friendIds = new Set(friendsVotes.map(function (v) { return v.user_id }))
          var snippetId = smartSnippet && smartSnippet.id ? smartSnippet.id : null
          var filteredReviews = reviews.filter(function (r) {
            if (user && r.user_id === user.id) return false
            if (friendIds.has(r.user_id)) return false
            if (snippetId && r.id === snippetId) return false
            return true
          })
          return filteredReviews.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold" style={{ color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Reviews ({filteredReviews.length})
              </h3>
              <TrustSummary
                verifiedCount={reviews.filter(function (r) { return r.trust_badge === 'human_verified' || r.trust_badge === 'trusted_reviewer' }).length}
                aiCount={reviews.filter(function (r) { return r.trust_badge === 'ai_estimated' }).length}
              />
            </div>
            <div
              className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-hide"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {filteredReviews.map(function (review) {
                var borderColor = review.rating_10 >= 8 ? 'var(--color-success, #22c55e)' : review.rating_10 >= 6 ? 'var(--color-accent-gold)' : 'var(--color-primary)';
                return (
                  <div
                    key={review.id}
                    className="p-4 rounded-xl flex-shrink-0 snap-start"
                    style={{ width: '280px', background: 'var(--color-card)', border: '1.5px solid var(--color-divider)', borderLeft: '3px solid ' + borderColor }}
                  >
                    <div className="flex items-start gap-2 mb-2.5">
                      <Link to={'/user/' + review.user_id} className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                          style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
                        >
                          {review.profiles?.display_name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="text-sm font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>
                              @{review.profiles?.display_name || 'Anonymous'}
                            </span>
                            <TrustBadge type={review.trust_badge} profileData={review.jitter_profile} />
                            {review.trust_badge && review.trust_badge !== 'building' && (
                              <button
                                onClick={function (e) {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setExplainerData({ warScore: review.war_score, stats: review.jitter_profile })
                                  setExplainerOpen(true)
                                }}
                                className="flex-shrink-0"
                                style={{ color: 'var(--color-text-tertiary)', fontSize: '11px', lineHeight: 1 }}
                                aria-label="What is this badge?"
                              >
                                ?
                              </button>
                            )}
                          </span>
                          <span className="text-[11px] block" style={{ color: 'var(--color-text-secondary)' }}>
                            {formatRelativeTime(review.review_created_at)}{dish.restaurant_town ? ' · ' + dish.restaurant_town : ''}
                          </span>
                        </div>
                      </Link>
                      {user && user.id !== review.user_id && (
                        <button
                          type="button"
                          onClick={() => setReportTarget({ type: 'review', id: review.id })}
                          className="flex-shrink-0 p-1 rounded-full"
                          aria-label={'Report review by ' + (review.profiles?.display_name || 'user')}
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="5" cy="12" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="19" cy="12" r="2" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {review.rating_10 ? (
                      <div className="flex items-center gap-2 mb-2.5">
                        <span
                          className="rounded-full px-2.5 py-0.5 font-bold text-sm"
                          style={{ background: getRatingColor(review.rating_10) + '26', color: getRatingColor(review.rating_10) }}
                        >
                          {formatScore10(review.rating_10)}
                        </span>
                      </div>
                    ) : null}

                    {review.review_text && (
                      <p style={{ color: 'var(--color-text-primary)', fontSize: '15px', lineHeight: 1.7 }}>
                        {review.review_text}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          )
        })()}

        {/* No reviews message */}
        {!reviewsLoading && reviews.length === 0 && dish.total_votes > 0 && (
          <div
            className="mb-4 p-4 rounded-xl text-center"
            style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-divider)' }}
          >
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              No written reviews yet — be the first to share your thoughts!
            </p>
          </div>
        )}

        {/* Variant Selector */}
        {variants.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {isVariant ? 'Other flavors' : 'Available flavors'}
            </p>
            <VariantSelector
              variants={variants}
              currentDishId={dish.dish_id}
              onSelect={function (variant) { navigate('/dish/' + variant.dish_id) }}
            />
          </div>
        )}

      </div>

      {/* Photo Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.9)' }}
          onClick={() => setLightboxPhoto(null)}
          role="dialog"
          aria-label="Photo lightbox"
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-2xl"
            style={{ background: 'rgba(255, 255, 255, 0.2)', color: '#FFFFFF' }}
            onClick={() => setLightboxPhoto(null)}
            aria-label="Close lightbox"
          >
            &times;
          </button>
          {user && lightboxPhoto.id && lightboxPhoto.user_id && lightboxPhoto.user_id !== user.id && (
            <button
              className="absolute top-4 left-4 px-3 py-2 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(255, 255, 255, 0.2)', color: '#FFFFFF' }}
              onClick={(e) => {
                e.stopPropagation()
                setReportTarget({ type: 'photo', id: lightboxPhoto.id })
                setLightboxPhoto(null)
              }}
              aria-label="Report photo"
            >
              Report
            </button>
          )}
          <img
            src={lightboxPhoto.photo_url}
            alt={dish.dish_name}
            className="max-w-full max-h-full object-contain"
            onError={() => setLightboxPhoto(null)}
          />
        </div>
      )}

      <ReportModal
        isOpen={!!reportTarget}
        onClose={() => setReportTarget(null)}
        target={reportTarget}
      />

      {/* Jitter Explainer */}
      <JitterExplainer
        open={explainerOpen}
        onClose={function () { setExplainerOpen(false) }}
        warScore={explainerData && explainerData.warScore}
        stats={explainerData && explainerData.stats}
      />
    </>
  )
}
