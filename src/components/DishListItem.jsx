import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MIN_VOTES_FOR_RANKING } from '../constants/app'
import { getRatingColor } from '../utils/ranking'
import { getCategoryNeonImage, getCategoryEmoji, getDishNameIcon, getMenuSectionImage } from '../constants/categories'
import { RestaurantAvatar } from './RestaurantAvatar'
import { sanitizeUrl } from '../utils/sanitize'
import { openExternalLink } from '../utils/openExternalLink'
import { buildDirectionsUrl, buildToastOrderUrl } from '../utils/restaurantLinks'
/**
 * DishListItem — the ONE component for showing a dish in any list.
 *
 * Props:
 *   dish        - dish data object
 *   rank        - optional rank number (1, 2, 3...)
 *   variant     - 'ranked' | 'voted' | 'compact' (default: 'ranked')
 *   showDistance - show distance badge (default: false)
 *   sortBy      - sort mode for value badge display
 *   tab         - for voted variant: 'worth-it' | 'avoid'
 *   reviewText  - optional inline review text (voted variant)
 *   myRating    - current user's rating for comparison (voted other-profile)
 *   theirRating - the profile owner's rating (voted other-profile)
 *   voteVariant - 'own-profile' | 'other-profile' (voted variant)
 *   highlighted - gold background flash for map pin interactions
 *   onClick     - click handler (default: navigate to /dish/:id)
 *   isLast      - suppress bottom border on last item
 */
export const DishListItem = memo(function DishListItem({
  dish,
  rank,
  variant = 'ranked',
  showDistance = false,
  sortBy,
  tab,
  reviewText,
  myRating,
  theirRating,
  voteVariant = 'own-profile',
  highlighted = false,
  onClick,
  isLast = false,
  hideVotes = false,
  hideRestaurantName = false,
}) {
  const navigate = useNavigate()

  // Normalize data shapes between different sources
  const dishName = dish.dish_name || dish.name
  const restaurantName = dish.restaurant_name || (dish.restaurants && dish.restaurants.name)
  const restaurantId = dish.restaurant_id || (dish.restaurants && dish.restaurants.id)
  const restaurantTown = dish.restaurant_town || (dish.restaurants && dish.restaurants.town)
  const dishId = dish.dish_id || dish.id
  const avgRating = dish.avg_rating
  const totalVotes = dish.total_votes || 0
  const isRanked = totalVotes >= MIN_VOTES_FOR_RANKING
  const distanceMiles = dish.distance_miles
  const price = dish.price
  const photoUrl = dish.photo_url
  const valuePercentile = dish.value_percentile
  const category = dish.category
  const toastSlug = dish.toast_slug
  const orderUrl = dish.order_url
  const restaurantLat = dish.restaurant_lat || dish.lat
  const restaurantLng = dish.restaurant_lng || dish.lng

  // Resolve icon once, reuse across both icon render paths (category-icon
  // mode and photo-thumbnail-fallback mode below). Precedence:
  // dish-name keyword > menu_section override > category default.
  const resolvedIcon =
    getDishNameIcon(dishName) ||
    getMenuSectionImage(dish.menu_section) ||
    getCategoryNeonImage(category)

  var handleClick = onClick || function () { navigate('/dish/' + dishId) }

  // --- VOTED VARIANT (profile pages) ---
  if (variant === 'voted') {
    return renderVotedCard()
  }

  // --- GRID VARIANT (profile food-story grid) ---
  if (variant === 'grid') {
    return renderGridTile()
  }

  // --- RANKED VARIANT (home, browse, restaurant detail) ---
  // Scoreboard layout: rank · dish name / restaurant · rating / votes
  var isPodium = rank != null && rank <= 3
  // One row anatomy for every ranked dish: rank · text stack (name, restaurant,
  // rating, actions) · picture slot on the right. The slot shows the dish's
  // best real user photo when one exists, otherwise the category icon. Adding
  // a photo never reshuffles the row. Photo source is featured_photo_url (best
  // dish_photos row) ONLY — dishes.photo_url held stock seed images; never used.
  var framePhoto = dish.featured_photo_url || null

  return (
    // Passive container — NOT an ARIA control. Keeps `onClick` for the
    // mouse-anywhere convenience but no `role="button"`/`tabIndex`/`onKeyDown`,
    // so its interactive children (dish-name button, restaurant link, Order
    // Now, Directions) are siblings of controls, not nested inside one.
    // Keyboard activation goes through the dish-name button below.
    <div
      data-dish-id={dishId}
      onClick={handleClick}
      className="w-full text-left active:scale-[0.98]"
      style={{
        background: highlighted ? 'var(--color-accent-gold-muted)' : 'transparent',
        borderBottom: isLast ? 'none' : '1px solid var(--color-divider)',
        cursor: 'pointer',
        transition: 'background 1s ease-out',
      }}
    >
      {/* Balanced list: rank in the display face (medal colors on the podium),
          hairline rules, and a contained 4:3 photo — same size on every row —
          with its own corners and a margin, never flush to the edge. */}
      <div className="flex items-center" style={{ padding: '14px 0' }}>
      {/* Rank number */}
      {rank != null && (
        <span
          className="flex-shrink-0"
          style={{
            width: '26px',
            textAlign: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: isPodium ? '32px' : '22px',
            fontWeight: 600,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            color: rank === 1
              ? 'var(--color-medal-gold)'
              : rank === 2
                ? 'var(--color-medal-silver)'
                : rank === 3
                  ? 'var(--color-medal-bronze)'
                  : 'var(--color-text-tertiary)',
          }}
        >
          {rank}
        </span>
      )}

      {/* Name + restaurant + distance */}
      <div className="flex-1 min-w-0" style={{ padding: '0 10px 0 2px' }}>
        {/* Dish name is the keyboard-accessible primary navigation control.
            It's a real <button> so screen readers announce it as an
            activatable element. Mouse-anywhere navigation still works via
            the outer container's onClick; this button's onClick stops the
            click from double-firing the parent. */}
        <button
          type="button"
          onClick={function (e) { e.stopPropagation(); handleClick(e) }}
          onKeyDown={function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation()
            }
          }}
          className="font-bold line-clamp-2 text-left w-full block"
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: isPodium ? '17px' : '16px',
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            fontFamily: 'inherit',
          }}
        >
          {dishName}
        </button>
        {/* Meta line: restaurant + price + distance. Skipped entirely when
            on a single-restaurant page (hideRestaurantName) and no price/
            distance to show \u2014 avoids an empty muted line under the name. */}
        {(!hideRestaurantName
          || (sortBy === 'best_value' && price != null)
          || (showDistance && distanceMiles != null)) && (
          <div className="flex items-center gap-1.5" style={{ marginTop: '3px' }}>
            <p
              className="truncate"
              style={{
                fontSize: '13px',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {!hideRestaurantName && (restaurantId ? (
                <span
                  role="link"
                  tabIndex={0}
                  onClick={function (e) { e.stopPropagation(); navigate('/restaurants/' + restaurantId) }}
                  onKeyDown={function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault(); e.stopPropagation();
                      navigate('/restaurants/' + restaurantId)
                    }
                  }}
                  style={{ color: 'var(--color-accent-gold)', fontWeight: 600, cursor: 'pointer' }}
                >
                  {restaurantName}
                </span>
              ) : restaurantName)}
              {sortBy === 'best_value' && price != null && (
                (!hideRestaurantName ? ' \u00b7 ' : '') + '$' + Number(price).toFixed(0)
              )}
              {showDistance && distanceMiles != null && (
                ((!hideRestaurantName || (sortBy === 'best_value' && price != null)) ? ' \u00b7 ' : '')
                + Number(distanceMiles).toFixed(1) + ' mi'
              )}
            </p>
          </div>
        )}
        {/* Description preview \u2014 terse Sonnet ingredient line. Omitted entirely
            when null/empty so cards render exactly as before backfill. */}
        {/* Dish description lives on the detail page only (rendered by
            DishDescription in src/pages/Dish.jsx). Keep the list-item card
            tight — name, restaurant, rating, and the Order/Directions
            action buttons below. Users tap into the dish to see ingredients. */}
        {/* Rating + votes, inline under the restaurant on every row. */}
        <div className="flex items-baseline gap-1.5" style={{ marginTop: '8px' }}>
          {renderRating()}
        </div>
        {/* Action buttons — Order / Directions */}
        {(toastSlug || sanitizeUrl(orderUrl) || restaurantLat) && (
          <div className="flex items-center gap-2" style={{ marginTop: '10px' }}>
            {(toastSlug || sanitizeUrl(orderUrl)) && (
              <a
                href={buildToastOrderUrl(toastSlug, orderUrl)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.stopPropagation(); openExternalLink(e, e.currentTarget.href) }}
                className="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
                style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)', fontSize: '11px' }}
              >
                Order Now
              </a>
            )}
            {restaurantLat && restaurantLng && (
              <a
                href={buildDirectionsUrl({ lat: restaurantLat, lng: restaurantLng })}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.stopPropagation(); openExternalLink(e, e.currentTarget.href) }}
                className="inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap"
                style={{ padding: '3px 8px', border: '1px solid var(--color-divider)', color: 'var(--color-text-secondary)', fontSize: '10px', background: 'transparent' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 3 3 10.5l8.5 2 2 8.5z" /></svg>
                Directions
              </a>
            )}
          </div>
        )}
      </div>

      {/* Picture slot: best real photo if we have one, category icon until then. */}
      <div
        data-testid={framePhoto ? 'dish-frame-photo' : 'dish-icon-slot'}
        className="flex-shrink-0 relative flex items-center justify-center overflow-hidden"
        style={{
          width: '38%',
          maxWidth: '150px',
          aspectRatio: '4 / 3',
          borderRadius: '12px',
          background: framePhoto ? 'var(--color-surface)' : 'transparent',
        }}
      >
        {framePhoto ? (
          <img src={framePhoto} alt={dishName} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        ) : resolvedIcon ? (
          <img
            src={resolvedIcon}
            alt=""
            aria-hidden="true"
            loading="lazy"
            style={{ width: '80px', height: '80px', objectFit: 'contain' }}
          />
        ) : (
          <span style={{ fontSize: '32px' }}>{getCategoryEmoji(category)}</span>
        )}
      </div>
      </div>

    </div>
  )

  // --- RATING BLOCK (inline under the restaurant on every ranked row) ---
  function renderRating() {
    if (!isRanked) {
      return (
        <span
          style={{
            fontSize: '12px',
            color: 'var(--color-text-tertiary)',
            fontWeight: 500,
          }}
        >
          {totalVotes ? totalVotes + ' vote' + (totalVotes === 1 ? '' : 's') : 'New'}
        </span>
      )
    }
    return (
      <>
        <span
          className="font-bold"
          style={{
            fontSize: '22px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            color: getRatingColor(avgRating),
          }}
        >
          {avgRating}
        </span>
        {!hideVotes && (
          <span style={{
            fontSize: '13px',
            color: 'var(--color-text-tertiary)',
            fontWeight: 500,
          }}>
            {'\u00b7 '}{totalVotes} vote{totalVotes === 1 ? '' : 's'}
          </span>
        )}
      </>
    )
  }

  // --- VOTED CARD RENDERER ---
  function renderVotedCard() {
    var isOtherProfile = voteVariant === 'other-profile'
    var hasOwnComparison = !isOtherProfile && dish.rating_10 && dish.community_avg && totalVotes >= 2
    var ownRatingDiff = hasOwnComparison ? dish.rating_10 - dish.community_avg : null
    var theirRatingNum = Number(theirRating) || 0
    var myRatingNum = Number(myRating) || 0
    var hasMyRating = myRating !== undefined && myRating !== null && myRatingNum >= 1 && myRatingNum <= 10
    var communityAvg = avgRating ? Number(avgRating) : null

    // Voted card outer is always a passive <div>. When viewing another
    // user's profile, the card is mouse-clickable via onClick + cursor,
    // but it's no longer marked as an ARIA control — keyboard activation
    // routes through the dish-name button inside, so the restaurant link
    // (role="link") and any future controls aren't nested inside a button.
    var cardProps = isOtherProfile ? { onClick: handleClick } : {}

    return (
      <div
        {...cardProps}
        className={'rounded-xl border overflow-hidden' + (isOtherProfile ? ' w-full text-left hover:shadow-md transition-all active:scale-[0.99]' : ' transition-all')}
        style={{
          background: 'var(--color-card)',
          borderColor: 'var(--color-divider)',
          cursor: isOtherProfile ? 'pointer' : 'default',
        }}
      >
        <div className="flex">
          {/* Image */}
          <div
            className="relative w-24 h-24 rounded-l-xl flex-shrink-0 overflow-hidden flex items-center justify-center"
            style={{ background: 'var(--color-surface-elevated)' }}
          >
            {photoUrl ? (
              <img src={photoUrl} alt={dishName} loading="lazy" className="w-full h-full object-cover" />
            ) : resolvedIcon ? (
              <img
                src={resolvedIcon}
                alt=""
                aria-hidden="true"
                className="object-contain"
                style={{ width: '56px', height: '56px' }}
                loading="lazy"
              />
            ) : (
              <RestaurantAvatar name={restaurantName} town={restaurantTown} dishCategory={category} fill className="absolute inset-0" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
            <div>
              <h3 className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                {restaurantId ? (
                  <span
                    role="link"
                    tabIndex={0}
                    onClick={function (e) { e.stopPropagation(); navigate('/restaurants/' + restaurantId) }}
                    onKeyDown={function (e) {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault(); e.stopPropagation()
                        navigate('/restaurants/' + restaurantId)
                      }
                    }}
                    style={{ color: 'var(--color-accent-gold)', cursor: 'pointer' }}
                  >
                    {restaurantName}
                  </span>
                ) : restaurantName}
              </h3>
              {isOtherProfile ? (
                <button
                  type="button"
                  onClick={function (e) { e.stopPropagation(); handleClick(e) }}
                  onKeyDown={function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation()
                    }
                  }}
                  className="text-sm truncate text-left w-full block"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: 'var(--color-text-secondary)',
                    fontFamily: 'inherit',
                  }}
                >
                  {dishName}
                </button>
              ) : (
                <p className="text-sm truncate" style={{ color: 'var(--color-text-secondary)' }}>
                  {dishName}
                </p>
              )}
            </div>

            {/* Own Profile Rating */}
            {!isOtherProfile && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {dish.rating_10 && (
                    <span className="text-sm font-semibold" style={{ color: getRatingColor(dish.rating_10) }}>
                      {dish.rating_10 % 1 === 0 ? dish.rating_10 : dish.rating_10.toFixed(1)}
                    </span>
                  )}
                  {hasOwnComparison && (
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      · avg {dish.community_avg.toFixed(1)}
                      {ownRatingDiff !== 0 && (
                        <span style={{ color: ownRatingDiff > 0 ? 'var(--color-emerald)' : 'var(--color-red)' }}>
                          {' '}({ownRatingDiff > 0 ? '+' : ''}{ownRatingDiff.toFixed(1)})
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Other Profile Rating */}
            {isOtherProfile && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {theirRatingNum >= 1 && (
                    <span className="text-sm font-semibold" style={{ color: getRatingColor(theirRatingNum) }}>
                      {theirRatingNum % 1 === 0 ? theirRatingNum : theirRatingNum.toFixed(1)}
                    </span>
                  )}
                  {hasMyRating && (
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      · you: <span style={{ color: getRatingColor(myRatingNum) }}>
                        {myRatingNum % 1 === 0 ? myRatingNum : myRatingNum.toFixed(1)}
                      </span>
                    </span>
                  )}
                </div>
                {communityAvg ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-sm font-bold" style={{ color: getRatingColor(communityAvg) }}>
                      {communityAvg.toFixed(1)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>avg</span>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Inline Review (own-profile only) */}
        {!isOtherProfile && reviewText && (
          <div className="px-3 pb-3 pt-0">
            <p
              className="line-clamp-2 italic"
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: '13px',
                lineHeight: '1.5',
              }}
            >
              &ldquo;{reviewText}&rdquo;
            </p>
          </div>
        )}
      </div>
    )
  }

  // --- GRID TILE RENDERER (no emoji; photo / rating / quote-card) ---
  function renderGridTile() {
    var rating = dish.rating_10
    var review = dish.review_text
    var ratingColor = getRatingColor(rating)
    var ratingLabel = rating == null ? '' : (rating % 1 === 0 ? rating : Number(rating).toFixed(1))
    var votedAt = dish.voted_at
    var dateLabel = votedAt
      ? new Date(votedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : ''
    var ariaLabel = dishName +
      (restaurantName ? ', ' + restaurantName : '') +
      (rating == null ? '' : ', rated ' + ratingLabel) +
      (review ? ', review: ' + review : '')

    return (
      <button
        type="button"
        data-testid="grid-tile"
        data-dish-id={dishId}
        aria-label={ariaLabel}
        onClick={function (e) { e.stopPropagation(); handleClick(e) }}
        className="relative block w-full text-left overflow-hidden active:scale-[0.98]"
        style={{
          aspectRatio: '1 / 1',
          borderRadius: '4px',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          background: photoUrl
            ? 'var(--color-surface)'
            : (review
              ? 'linear-gradient(150deg, var(--color-category-strip), var(--color-surface))'
              : 'var(--color-card)'),
        }}
      >
        {photoUrl ? (
          <>
            <img src={photoUrl} alt={dishName} loading="lazy" className="w-full h-full object-cover" />
            {rating != null && (
              <span
                data-testid="grid-rating-badge"
                style={{
                  position: 'absolute', top: '6px', left: '6px',
                  minWidth: '22px', height: '22px', padding: '0 5px',
                  borderRadius: '7px', background: 'rgba(255,255,255,0.92)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                  color: ratingColor, fontWeight: 800, fontSize: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {ratingLabel}
              </span>
            )}
            {dateLabel && (
              <span
                style={{
                  position: 'absolute', top: '7px', right: '8px',
                  fontSize: '10px', fontWeight: 700, color: '#fff',
                  textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                }}
              >
                {dateLabel}
              </span>
            )}
            <div
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                padding: '14px 7px 6px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0))',
                color: '#fff',
              }}
            >
              <div className="truncate" style={{ fontSize: '11px', fontWeight: 700, lineHeight: 1.15 }}>{dishName}</div>
              <div className="truncate" style={{ fontSize: '9.5px', opacity: 0.85 }}>{restaurantName}</div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col" style={{ padding: '10px 9px' }}>
            {dateLabel && (
              <span
                style={{
                  position: 'absolute', top: '8px', right: '9px',
                  fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)',
                }}
              >
                {dateLabel}
              </span>
            )}
            <span style={{ fontSize: '32px', fontWeight: 800, lineHeight: 0.9, color: ratingColor }}>{ratingLabel}</span>
            {review && (
              <p
                className="italic"
                style={{
                  fontSize: '10px', color: 'var(--color-text-secondary)', lineHeight: 1.3,
                  marginTop: '5px', display: '-webkit-box', WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}
              >
                &ldquo;{review}&rdquo;
              </p>
            )}
            <div style={{ marginTop: 'auto' }}>
              <div className="truncate" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.15 }}>{dishName}</div>
              <div className="truncate" style={{ fontSize: '9.5px', color: 'var(--color-text-tertiary)' }}>{restaurantName}</div>
            </div>
          </div>
        )}
      </button>
    )
  }
})

export default DishListItem
