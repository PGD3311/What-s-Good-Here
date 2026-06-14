import { memo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BROWSE_CATEGORIES } from '../../constants/categories'
import { DishSearch } from '../DishSearch'
import { DishListItem } from '../DishListItem'
import { DietButton } from '../DietButton'
import { EmptyState } from '../EmptyState'
import { DataLoadError } from '../DataLoadError'
import { LocationBanner } from '../LocationBanner'
import { SettingsDropdown } from '../SettingsDropdown'
import { NotificationBell } from '../NotificationBell'
import { LocalsPicksBanner, Top10Carousel } from './'
export const HomeListMode = memo(function HomeListMode({
  listScrollRef,
  searchQuery,
  searchLoading,
  rankedLoading,
  rankedError,
  rankedRefetch,
  activeDishes,
  allRankedDishes,
  expandedCategory,
  topRestaurant,
  mostVotedDish,
  bestValueMeal,
  bestIceCream,
  location,
  radius,
  permissionState,
  requestLocation,
  onSearchChange,
  onRadiusSheetOpen,
  onExpandedCategoryChange,
  onCategoryChange,
  onLocalListExpanded,
  dietaryTags,
  dietaryLabels,
  onDietOpen,
}) {
  var navigate = useNavigate()
  var carouselRef = useRef(null)

  var handleCategorySelect = useCallback(function (cat) {
    onExpandedCategoryChange(cat)
    if (carouselRef.current) {
      carouselRef.current.scrollToCategory(cat)
    }
    setTimeout(function () {
      var container = listScrollRef && listScrollRef.current
      var el = document.getElementById('top10-carousel')
      if (container && el) {
        var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        var target = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 8
        container.scrollTo({ top: target, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
      }
    }, 100)
  }, [onExpandedCategoryChange, listScrollRef])

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        background: 'var(--color-bg)',
        zIndex: 1,
      }}
    >
      {/* Fixed header: brand + search + chips */}
      <div style={{ flexShrink: 0, background: 'var(--color-bg)', zIndex: 10, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        {/* Brand header — slim left-aligned Shantell Sans wordmark. Replaced the
            large centered app-icon + tagline (which pushed all rankings below
            the fold and wasted the space on either side) so the list sits
            higher and the header reads as an app, not a splash screen. Map page
            already has an <h1 className="sr-only">What's Good Here</h1> for the
            screen-reader label, so this is aria-hidden decorative text. */}
        <div className="px-5 pt-3 pb-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span aria-hidden="true" style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: '27px',
            lineHeight: 1,
            letterSpacing: '0',
            color: 'var(--color-text-primary)',
          }}>
            What's <span style={{ color: 'var(--color-primary)', fontStyle: 'italic' }}>Good</span> Here
          </span>
          {/* Settings + notifications — reuse the shared TopBar controls, tinted
              dark for the stone header (they default to near-white for the
              orange bar). NotificationBell self-hides when logged out. */}
          <div className="flex items-center" style={{ marginRight: '-8px' }}>
            {/* Menu X-Ray entry — coral so the new hero feature is findable.
                Routes to /scan; restaurant gets confirmed there (GPS + chip). */}
            <button
              onClick={() => navigate('/scan')}
              aria-label="Scan a menu"
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95"
              style={{ color: 'var(--color-primary)' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
              </svg>
            </button>
            <SettingsDropdown color="var(--color-text-secondary)" />
            <NotificationBell color="var(--color-text-secondary)" />
          </div>
        </div>
        {/* Search bar */}
        <div className="px-5 pt-2 pb-1">
          <div style={{
            borderRadius: '14px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}>
            <DishSearch
              loading={false}
              placeholder="What are you craving?"
              onSearchChange={onSearchChange}
              initialQuery={searchQuery}
              rightSlot={
                <div className="flex items-center gap-1 flex-shrink-0">
                  {onDietOpen ? (
                    <DietButton
                      compact
                      selected={dietaryTags}
                      labels={dietaryLabels}
                      onOpen={onDietOpen}
                    />
                  ) : null}
                  <button
                    onClick={function (e) { e.stopPropagation(); onRadiusSheetOpen() }}
                    aria-label={radius === 0 ? 'Showing dishes everywhere' : 'Search radius: ' + radius + ' miles'}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg font-bold flex-shrink-0"
                    style={{
                      fontSize: '12px',
                      background: 'var(--color-bg)',
                      color: 'var(--color-text-secondary)',
                      border: '1px solid var(--color-divider)',
                      cursor: 'pointer',
                    }}
                  >
                    {radius === 0 ? 'All' : radius + ' mi'}
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              }
            />
          </div>
        </div>

        {/* Location banner */}
        <div className="px-4">
          <LocationBanner
            permissionState={permissionState}
            requestLocation={requestLocation}
            message="Enable location to find the best food near you"
          />
        </div>

      </div>

      {/* Scrollable content */}
      <div
        ref={listScrollRef}
        className="flex-1 overflow-y-auto"
        style={{
          paddingBottom: '80px',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
        }}
      >
        {(searchQuery && searchLoading) || (!searchQuery && rankedLoading) ? (
          <div className="px-4 pt-4"><ListSkeleton /></div>
        ) : searchQuery ? (
          /* Search results — flat list */
          <div className="px-4 pt-2 pb-4">
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '21px',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              letterSpacing: '0',
              marginBottom: '8px',
            }}>
              Results
            </h2>
            {activeDishes && activeDishes.length > 0 ? (
              <div className="flex flex-col" style={{ gap: '2px' }}>
                {activeDishes.map(function (dish, i) {
                  return (
                    <DishListItem
                      key={dish.dish_id}
                      dish={dish}
                      rank={i + 1}
                      showDistance
                      onClick={function () { navigate('/dish/' + dish.dish_id) }}
                    />
                  )
                })}
              </div>
            ) : (
              <EmptyState emoji="🔍" title={'No dishes found for \u201c' + searchQuery + '\u201d'} />
            )}
          </div>
        ) : activeDishes && activeDishes.length > 0 ? (
          /* Homepage v4 layout — category chips up top, vertical list */
          <>
            {/* Editorial stories — A-frame chalkboard horizontal scroll */}
            <ChalkboardSection
              topRestaurant={topRestaurant}
              mostVotedDish={mostVotedDish}
              bestValueMeal={bestValueMeal}
              bestIceCream={bestIceCream}
              onExpandCategory={handleCategorySelect}
            />

            {/* Locals' Picks Banner — cream-paper entry point → /locals */}
            <LocalsPicksBanner />

            {/* Top 10 carousel — swipe between Near You, Pizza, Burgers, etc. */}
            <div id="top10-carousel">
              <Top10Carousel ref={carouselRef} location={location} radius={radius} dietaryTags={dietaryTags} onCategoryChange={onCategoryChange} />
            </div>
          </>
        ) : rankedError ? (
          <DataLoadError
            message={rankedError.message}
            onRetry={rankedRefetch}
          />
        ) : (
          <div className="px-4 pt-4">
            <EmptyState emoji="🍽️" title="No dishes found nearby" />
          </div>
        )}
      </div>
    </div>
  )
})

// Chalkboard styles — module-level constants (no re-creation per render)
var BOARD_OUTER = { flexShrink: 0, width: '176px' }
// Warm slate board with chalk dust + a wood bottom edge (the 0 4px 0 shadow) so
// it reads as a real A-frame sign, not a flat card.
var BOARD_SURFACE = {
  position: 'relative',
  borderRadius: '7px',
  overflow: 'hidden',
  height: '172px',
  background: '#3E362C',
  backgroundImage:
    'radial-gradient(ellipse at 28% 22%, rgba(255,255,255,0.05), transparent 55%),' +
    'radial-gradient(ellipse at 75% 80%, rgba(0,0,0,0.18), transparent 60%)',
  boxShadow: '0 4px 0 #2A241C, 0 8px 14px rgba(0,0,0,0.3)',
}
var BOARD_FRAME = { position: 'absolute', inset: '5px', border: '1.5px solid rgba(255,255,255,0.16)', borderRadius: '4px', pointerEvents: 'none', zIndex: 2 }
var BOARD_CONTENT = { position: 'relative', zIndex: 1, height: '100%', padding: '15px 13px 14px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }
var BOARD_TOP = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px' }
// One illustrated food icon per board — the brand's visual identity, not emoji.
var BOARD_ICON_STYLE = { width: '38px', height: '38px', objectFit: 'contain', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))' }
var ICE_CREAM_MELTING_STYLE = { display: 'block', margin: '0 auto', width: '34px', height: '34px', objectFit: 'contain' }
// Title keeps the Fraunces display voice; eyebrow/proof/CTA are Outfit so the
// board has real hierarchy (label → headline → action) instead of one flat wall.
var CHALK_TITLE = { fontFamily: 'var(--font-display)', color: '#fff' }
var CHALK_EYEBROW = { fontFamily: 'Outfit, sans-serif', fontSize: '9.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.13em', color: 'rgba(255,255,255,0.5)', margin: 0 }
var CHALK_PROOF = { fontFamily: 'Outfit, sans-serif', fontSize: '12.5px', fontWeight: 600, color: 'rgba(255,255,255,0.82)', margin: 0 }
var CHALK_CTA = { fontFamily: 'Outfit, sans-serif', fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-accent-orange)', margin: 0 }

function ChalkboardCard({ tag, title, titleSize, sub, stat, cta, onClick, icon, bottomIcon }) {
  var proof = stat || sub
  return (
    <button
      onClick={onClick}
      className="active:scale-[0.97] transition-transform"
      style={BOARD_OUTER}
    >
      <div style={BOARD_SURFACE}>
        <div style={BOARD_FRAME} />
        <div style={BOARD_CONTENT}>
          <div style={BOARD_TOP}>
            {icon && <img src={icon} alt="" style={BOARD_ICON_STYLE} />}
            <p style={CHALK_EYEBROW}>{tag}</p>
            <p style={Object.assign({}, CHALK_TITLE, { fontSize: titleSize || '20px', fontWeight: 600, lineHeight: 1.12, margin: 0 })}>{title}</p>
            {proof && <p style={CHALK_PROOF}>{proof}</p>}
          </div>
          <p style={CHALK_CTA}>{cta}</p>
          {bottomIcon && <img src={bottomIcon} alt="" style={ICE_CREAM_MELTING_STYLE} />}
        </div>
      </div>
    </button>
  )
}

function ChalkboardSection({ topRestaurant, mostVotedDish, bestValueMeal, bestIceCream, onExpandCategory }) {
  var navigate = useNavigate()

  var hour = new Date().getHours()
  var timeCallout = hour < 11
    ? { category: 'breakfast', icon: '/categories/icons/breakfast.png', tag: 'good morning', title: 'Breakfast', sub: 'on the island', stat: '#1 searched morning food', cta: 'best breakfasts \u2192' }
    : hour < 18
      ? { category: 'lobster roll', icon: '/categories/icons/lobster-roll.png', tag: '#1 searched on MV', title: 'Lobster Roll', sub: '', stat: '', cta: 'find the best one \u2192' }
      : { category: 'pizza', icon: '/categories/icons/pizza.png', tag: 'tonight', title: 'Pizza', sub: '', stat: '', cta: 'find the best pizza \u2192' }

  return (
    <div
      className="flex gap-3 overflow-x-auto mt-1"
      style={{
        padding: '0 16px 0',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        touchAction: 'pan-x pan-y',
      }}
    >
      {/* Board 1: Time of day */}
      <ChalkboardCard
        icon={timeCallout.icon}
        tag={timeCallout.tag}
        title={timeCallout.title}
        sub={timeCallout.sub}
        stat={timeCallout.stat}
        cta={timeCallout.cta}
        onClick={function () { onExpandCategory(timeCallout.category) }}
      />

      {/* Board 2: Top Restaurant */}
      {topRestaurant && (
        <ChalkboardCard
          icon="/categories/icons/star.png"
          tag={'highest rated restaurant'}
          title={topRestaurant.name}
          sub={'avg dish rating ' + topRestaurant.avg}
          cta={'see the menu \u2192'}
          onClick={function () { navigate('/restaurants/' + topRestaurant.id) }}
        />
      )}

      {/* Board 3: Chowder */}
      <ChalkboardCard
        icon="/categories/icons/chowder.png"
        tag={'the great debate'}
        title="Chowder"
        sub="ranked by the people"
        cta={'see the rankings \u2192'}
        onClick={function () { onExpandCategory('chowder') }}
      />

      {/* Board 4: Best Coffee NOW */}
      <ChalkboardCard
        icon="/categories/icons/coffee.png"
        tag={'best coffee now'}
        title="Coffee"
        sub="freshly ranked by locals"
        cta={'best on the island \u2192'}
        onClick={function () { onExpandCategory('coffee') }}
      />

      {/* Board 5: Most Talked About */}
      {mostVotedDish && (
        <ChalkboardCard
          icon="/categories/icons/speech-bubble.png"
          tag={'most talked about'}
          title={mostVotedDish.dish_name || mostVotedDish.name}
          titleSize="20px"
          sub={mostVotedDish.restaurant_name}
          stat={(mostVotedDish.total_votes || 0) + ' votes'}
          cta={'see why \u2192'}
          onClick={function () { navigate('/dish/' + mostVotedDish.dish_id) }}
        />
      )}

      {/* Board 6: Best Meal Under $15 */}
      {bestValueMeal && (
        <ChalkboardCard
          icon="/categories/icons/money-bag.png"
          tag={'best value'}
          title={bestValueMeal.dish_name || bestValueMeal.name}
          titleSize="20px"
          sub={bestValueMeal.restaurant_name}
          stat={'$' + Number(bestValueMeal.price).toFixed(0) + ' \u00B7 rated ' + Number(bestValueMeal.avg_rating || 0).toFixed(1)}
          cta={'best meal under $15 \u2192'}
          onClick={function () { navigate('/dish/' + bestValueMeal.dish_id) }}
        />
      )}

      {/* Board 7: Best Ice Cream — clean cone top, melting cone bottom */}
      {bestIceCream && (
        <ChalkboardCard
          icon="/categories/icons/ice-cream-clean.png"
          tag={'island scoops'}
          title={bestIceCream.dish_name || bestIceCream.name}
          titleSize="20px"
          sub={bestIceCream.restaurant_name}
          stat={(bestIceCream.total_votes || 0) + ' votes \u00B7 rated ' + Number(bestIceCream.avg_rating || 0).toFixed(1)}
          cta={'best ice cream \u2192'}
          onClick={function () { onExpandCategory('ice cream') }}
          bottomIcon="/categories/icons/ice-cream-melting.png"
        />
      )}

    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="animate-pulse">
      {[0, 1, 2, 3].map(function (i) {
        return (
          <div key={i} className="flex items-center gap-3 py-3 px-3">
            <div className="w-7 h-5 rounded" style={{ background: 'var(--color-divider)' }} />
            <div className="w-6 h-6 rounded" style={{ background: 'var(--color-divider)' }} />
            <div className="flex-1">
              <div className="h-4 w-28 rounded mb-1" style={{ background: 'var(--color-divider)' }} />
              <div className="h-3 w-20 rounded" style={{ background: 'var(--color-divider)' }} />
            </div>
            <div className="h-5 w-8 rounded" style={{ background: 'var(--color-divider)' }} />
          </div>
        )
      })}
    </div>
  )
}
