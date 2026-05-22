import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MIN_VOTES_FOR_RANKING } from '../constants/app'
import { getRatingColor } from '../utils/ranking'
import { getCategoryNeonImage, getCategoryEmoji, getDishNameIcon, getMenuSectionImage } from '../constants/categories'
import { RestaurantAvatar } from './RestaurantAvatar'
import { sanitizeUrl } from '../utils/sanitize'
import { openExternalLink } from '../utils/openExternalLink'
/**
 * DishListItem — the ONE component for showing a dish in any list.
 *
 * Props:
 *   dish        - dish data object
 *   rank        - optional rank number (1, 2, 3...)
 *   variant     - 'ranked' | 'voted' | 'compact' (default: 'ranked')
 *   showPhoto   - show photo thumbnail (default: false)
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
  showPhoto = false,
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

  // --- RANKED VARIANT (home, browse, restaurant detail) ---
  // Scoreboard layout: rank · dish name / restaurant · rating / votes
  var isPodium = rank != null && rank <= 3

  return (
    // Passive container — NOT an ARIA control. Keeps `onClick` for the
    // mouse-anywhere convenience but no `role="button"`/`tabIndex`/`onKeyDown`,
    // so its interactive children (dish-name button, restaurant link, Order
    // Now, Directions) are siblings of controls, not nested inside one.
    // Keyboard activation goes through the dish-name button below.
    <div
      data-dish-id={dishId}
      onClick={handleClick}
      className={'w-full text-left active:scale-[0.98]' + (isPodium ? ' rounded-xl' : '')}
      style={{
        background: highlighted
          ? 'var(--color-accent-gold-muted)'
          : isPodium
            ? 'var(--color-surface)'
            : 'transparent',
        padding: isPodium ? '10px 10px' : '8px 10px',
        cursor: 'pointer',
        transition: 'background 1s ease-out',
        borderBottom: !isPodium && !isLast ? '1px solid var(--color-divider)' : 'none',
      }}
    >
      <div className="flex items-center">
      {/* Rank number */}
      {rank != null && (
        <span
          className="flex-shrink-0 font-bold"
          style={{
            width: isPodium ? '32px' : '28px',
            textAlign: 'center',
            fontSize: isPodium ? '22px' : '15px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
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

      {/* Category icon (when no photo thumbnail) */}
      {!showPhoto && (
        <div
          className="flex-shrink-0 flex items-center justify-center"
          style={{ width: isPodium ? '72px' : '64px', height: isPodium ? '72px' : '64px', marginLeft: '4px' }}
        >
          {resolvedIcon ? (
            <img
              src={resolvedIcon}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-contain"
              loading="lazy"
            />
          ) : (
            <span style={{ fontSize: isPodium ? '18px' : '14px' }}>{getCategoryEmoji(category)}</span>
          )}
        </div>
      )}

      {/* Photo thumbnail (restaurant detail only) */}
      {showPhoto && photoUrl && (
        <div
          className="flex-shrink-0 rounded-lg overflow-hidden"
          style={{ width: '56px', height: '56px', marginLeft: '6px', background: 'var(--color-surface)' }}
        >
          <img src={photoUrl} alt={dishName} loading="lazy" className="w-full h-full object-cover" />
        </div>
      )}
      {showPhoto && !photoUrl && (
        <div
          className="flex-shrink-0 rounded-lg overflow-hidden relative"
          style={{ width: '56px', height: '56px', marginLeft: '6px' }}
        >
          <RestaurantAvatar name={restaurantName} town={restaurantTown} dishCategory={category} size={56} fill />
        </div>
      )}

      {/* Name + restaurant + distance */}
      <div className="flex-1 min-w-0" style={{ marginLeft: showPhoto ? '6px' : (isPodium ? '8px' : '6px') }}>
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
            fontSize: isPodium ? '15px' : '14px',
            fontWeight: isPodium ? 800 : 700,
            color: 'var(--color-text-primary)',
            lineHeight: 1.3,
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
          <div className="flex items-center gap-1.5" style={{ marginTop: '2px' }}>
            <p
              className="truncate"
              style={{
                fontSize: isPodium ? '12px' : '11px',
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
        {/* Action buttons — Order / Directions */}
        {(toastSlug || sanitizeUrl(orderUrl) || restaurantLat) && (
          <div className="flex items-center gap-2" style={{ marginTop: '4px' }}>
            {(toastSlug || sanitizeUrl(orderUrl)) && (
              <a
                href={toastSlug ? 'https://order.toasttab.com/online/' + toastSlug : sanitizeUrl(orderUrl)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.stopPropagation(); openExternalLink(e, e.currentTarget.href) }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{
                  background: 'var(--color-primary)',
                  color: 'white',
                  fontSize: '10px',
                }}
              >
                Order Now
              </a>
            )}
            {restaurantLat && restaurantLng && (
              <a
                href={'https://www.google.com/maps/dir/?api=1&destination=' + restaurantLat + ',' + restaurantLng}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.stopPropagation(); openExternalLink(e, e.currentTarget.href) }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  border: '1px solid var(--color-divider)',
                  color: 'var(--color-text-secondary)',
                  fontSize: '10px',
                }}
              >
                Directions
              </a>
            )}
          </div>
        )}
      </div>

      {/* Rating + votes */}
      <div className="flex-shrink-0 text-right" style={{ marginLeft: '8px' }}>
        {isRanked ? (
          <>
            <span
              className="font-bold"
              style={{
                fontSize: isPodium ? '20px' : '16px',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: getRatingColor(avgRating),
              }}
            >
              {avgRating}
            </span>
            {!hideVotes && (
              <div style={{
                fontSize: '11px',
                color: 'var(--color-text-tertiary)',
                fontWeight: 500,
                marginTop: '1px',
              }}>
                {totalVotes} vote{totalVotes === 1 ? '' : 's'}
              </div>
            )}
          </>
        ) : (
          <span
            style={{
              fontSize: '12px',
              color: 'var(--color-text-tertiary)',
              fontWeight: 500,
            }}
          >
            {totalVotes ? totalVotes + ' vote' + (totalVotes === 1 ? '' : 's') : 'New'}
          </span>
        )}
      </div>
      </div>

    </div>
  )

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
})

export default DishListItem
