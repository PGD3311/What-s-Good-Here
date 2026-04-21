import { memo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BROWSE_CATEGORIES } from '../../constants/categories'
import { DishSearch } from '../DishSearch'
import { DishListItem } from '../DishListItem'
import { EmptyState } from '../EmptyState'
import { LocationBanner } from '../LocationBanner'
import { LocalListsSection, Top10Carousel } from './'
import { useLocalsAggregate } from '../../hooks/useLocalsAggregate'

export const HomeListMode = memo(function HomeListMode({
  listScrollRef,
  searchQuery,
  searchLoading,
  rankedLoading,
  activeDishes,
  allRankedDishes,
  expandedCategory,
  topRestaurant,
  mostVotedDish,
  bestValueMeal,
  bestIceCream,
  radius,
  permissionState,
  requestLocation,
  onSearchChange,
  onRadiusSheetOpen,
  onExpandedCategoryChange,
  onCategoryChange,
  onLocalListExpanded,
}) {
  var navigate = useNavigate()
  var carouselRef = useRef(null)
  var localsAggregateData = useLocalsAggregate()
  var localsAggregate = localsAggregateData.aggregate

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
        {/* Brand header */}
        <div className="text-center pt-4 pb-1">
          <h2 style={{
            fontFamily: "'Amatic SC', cursive",
            fontSize: '42px',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            letterSpacing: '0.04em',
            lineHeight: 1,
            margin: 0,
          }}>
            What's <span style={{ color: 'var(--color-primary)' }}>Good</span> Here
          </h2>
          <p style={{
            fontSize: '10px',
            fontWeight: 600,
            color: '#999',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            margin: '5px 0 0',
          }}>
            Top-rated dishes near you
          </p>
        </div>
        {/* Search bar */}
        <div className="px-5 pt-2 pb-2">
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
              fontFamily: "'Amatic SC', cursive",
              fontSize: '28px',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              letterSpacing: '0.02em',
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
              localsAggregate={localsAggregate}
              onExpandCategory={handleCategorySelect}
            />

            {/* Local Lists — horizontal scroll above the food icon tabs */}
            <LocalListsSection onListExpanded={onLocalListExpanded} />

            {/* Top 10 carousel — swipe between Near You, Pizza, Burgers, etc. */}
            <div id="top10-carousel">
              <Top10Carousel ref={carouselRef} dishes={allRankedDishes} onCategoryChange={onCategoryChange} />
            </div>
          </>
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
var BOARD_OUTER = { flexShrink: 0, width: '175px' }
var BOARD_OUTER_WIDE = { flexShrink: 0, width: '185px' }
var COUNT_BADGE = { fontFamily: "'Outfit', sans-serif", display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(196, 138, 18, 0.2)', color: 'var(--color-accent-gold)', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', marginTop: '4px' }
var BOARD_SURFACE = { position: 'relative', background: '#363B3F', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }
var BOARD_FRAME = { position: 'absolute', inset: '3px', border: '2.5px solid #1A1D1F', borderRadius: '2px', pointerEvents: 'none', zIndex: 2 }
var BOARD_DUST = { position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(ellipse at 30% 40%, rgba(255,255,255,0.03) 0%, transparent 60%)', pointerEvents: 'none' }
var BOARD_CONTENT = { position: 'relative', zIndex: 1, padding: '8px 10px 9px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }
var CHALK_BRIGHT = { fontFamily: "'Amatic SC', cursive", color: 'rgba(255,255,255,0.88)', fontWeight: 700 }
var CHALK_MED = { fontFamily: "'Amatic SC', cursive", color: 'rgba(255,255,255,0.55)', fontWeight: 700 }
var CHALK_FAINT = { fontFamily: "'Amatic SC', cursive", color: 'rgba(255,255,255,0.45)', fontWeight: 700 }
var CHALK_BIG = { fontFamily: "'Amatic SC', cursive", color: 'rgba(255,255,255,0.88)' }
var CHALK_CTA = { fontFamily: "'Amatic SC', cursive", color: 'var(--color-primary)' }
var CHALK_LINE = { height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0', width: '36px' }
var LEG_STYLE = { width: '2.5px', height: '10px', background: '#6B7280', borderRadius: '0 0 1.5px 1.5px' }
var LEG_LEFT = Object.assign({}, LEG_STYLE, { transform: 'rotate(6deg)', transformOrigin: 'top center' })
var LEG_RIGHT = Object.assign({}, LEG_STYLE, { transform: 'rotate(-6deg)', transformOrigin: 'top center' })

var BOARD_ICON_STYLE = { display: 'inline-block', verticalAlign: 'middle', width: '20px', height: '20px', objectFit: 'contain', marginRight: '3px' }

function ChalkboardCard({ tag, title, titleSize, sub, stat, cta, onClick, icon, bottomIcon }) {
  return (
    <button
      onClick={onClick}
      className="active:scale-[0.97] transition-transform"
      style={BOARD_OUTER}
    >
      <div style={BOARD_SURFACE}>
        <div style={BOARD_FRAME} />
        <div style={BOARD_DUST} />
        <div style={BOARD_CONTENT}>
          <p style={Object.assign({}, CHALK_FAINT, { fontSize: '14px', margin: 0 })}>
            {icon && <img src={icon} alt="" style={BOARD_ICON_STYLE} />}
            <span>{tag}</span>
          </p>
          <p style={Object.assign({}, CHALK_BIG, { fontSize: titleSize || '30px', fontWeight: 700, lineHeight: 0.95, margin: '2px 0 0' })}>{title}</p>
          {sub && <p style={Object.assign({}, CHALK_MED, { fontSize: '15px', margin: 0 })}>{sub}</p>}
          <div style={CHALK_LINE} />
          {stat && <p style={Object.assign({}, CHALK_BRIGHT, { fontSize: '16px', margin: 0 })}>{stat}</p>}
          {stat && <div style={CHALK_LINE} />}
          <p style={Object.assign({}, CHALK_CTA, { fontSize: '18px', fontWeight: 700, margin: 0 })}>{cta}</p>
          {bottomIcon && <img src={bottomIcon} alt="" style={ICE_CREAM_MELTING_STYLE} />}
        </div>
      </div>
    </button>
  )
}

var ICE_CREAM_MELTING_STYLE = { display: 'block', margin: '4px auto -2px', width: '40px', height: '40px', objectFit: 'contain' }

function LocalsChalkboardCard({ tag, title, titleSize, sub, countText, cta, onClick }) {
  return (
    <button
      onClick={onClick}
      className="active:scale-[0.97] transition-transform"
      style={BOARD_OUTER_WIDE}
    >
      <div style={BOARD_SURFACE}>
        <div style={BOARD_FRAME} />
        <div style={BOARD_DUST} />
        <div style={BOARD_CONTENT}>
          <p style={Object.assign({}, CHALK_FAINT, { fontSize: '13px', margin: 0 })}>{tag}</p>
          <p style={Object.assign({}, CHALK_BIG, { fontSize: titleSize || '30px', fontWeight: 700, lineHeight: 0.95, margin: '2px 0 0' })}>{title}</p>
          {sub && <p style={Object.assign({}, CHALK_MED, { fontSize: '15px', margin: 0 })}>{sub}</p>}
          <div style={CHALK_LINE} />
          {countText && <span style={COUNT_BADGE}>{countText}</span>}
          {countText && <div style={{ marginTop: '4px' }} />}
          <p style={Object.assign({}, CHALK_CTA, { fontSize: '18px', fontWeight: 700, margin: 0 })}>{cta}</p>
        </div>
      </div>
    </button>
  )
}

function ChalkboardSection({ topRestaurant, mostVotedDish, bestValueMeal, bestIceCream, localsAggregate, onExpandCategory }) {
  var navigate = useNavigate()

  var hour = new Date().getHours()
  var timeCallout = hour < 11
    ? { category: 'breakfast', icon: '/categories/icons/breakfast.png', tag: 'good morning', title: 'Breakfast', sub: 'on the island', stat: '#1 searched morning food', cta: 'best breakfasts \u2192' }
    : hour < 18
      ? { category: 'lobster roll', icon: '/categories/icons/lobster-roll.png', tag: '#1 searched on MV', title: 'Lobster Roll', sub: '', stat: '', cta: 'find the best one \u2192' }
      : { category: 'pizza', icon: '/categories/icons/pizza.png', tag: 'tonight', title: 'Pizza', sub: '', stat: '', cta: 'find the best pizza \u2192' }

  return (
    <div
      className="flex gap-3 overflow-x-auto mt-2"
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

      {/* Board 4: Most Talked About */}
      {mostVotedDish && (
        <ChalkboardCard
          icon="/categories/icons/speech-bubble.png"
          tag={'most talked about'}
          title={mostVotedDish.dish_name || mostVotedDish.name}
          titleSize="28px"
          sub={mostVotedDish.restaurant_name}
          stat={(mostVotedDish.total_votes || 0) + ' votes'}
          cta={'see why \u2192'}
          onClick={function () { navigate('/dish/' + mostVotedDish.dish_id) }}
        />
      )}

      {/* Board 5: Best Meal Under $15 */}
      {bestValueMeal && (
        <ChalkboardCard
          icon="/categories/icons/money-bag.png"
          tag={'best value'}
          title={bestValueMeal.dish_name || bestValueMeal.name}
          titleSize="28px"
          sub={bestValueMeal.restaurant_name}
          stat={'$' + Number(bestValueMeal.price).toFixed(0) + ' \u00B7 rated ' + Number(bestValueMeal.avg_rating || 0).toFixed(1)}
          cta={'best meal under $15 \u2192'}
          onClick={function () { navigate('/dish/' + bestValueMeal.dish_id) }}
        />
      )}

      {/* Board 6: Best Ice Cream — clean cone top, melting cone bottom */}
      {bestIceCream && (
        <ChalkboardCard
          icon="/categories/icons/ice-cream-clean.png"
          tag={'island scoops'}
          title={bestIceCream.dish_name || bestIceCream.name}
          titleSize="28px"
          sub={bestIceCream.restaurant_name}
          stat={(bestIceCream.total_votes || 0) + ' votes \u00B7 rated ' + Number(bestIceCream.avg_rating || 0).toFixed(1)}
          cta={'best ice cream \u2192'}
          onClick={function () { navigate('/dish/' + bestIceCream.dish_id) }}
          bottomIcon="/categories/icons/ice-cream-melting.png"
        />
      )}

      {/* Board 7: Locals Agree — most-appearing dish */}
      {localsAggregate && localsAggregate.top_dish_id && localsAggregate.total_lists >= 2 && (
        <LocalsChalkboardCard
          tag={'\uD83C\uDFC6 locals agree'}
          title={localsAggregate.top_dish_name}
          sub={localsAggregate.top_dish_restaurant_name}
          countText={'On ' + localsAggregate.top_dish_list_count + ' of ' + localsAggregate.total_lists + ' local lists'}
          cta={'see why \u2192'}
          onClick={function () { navigate('/dish/' + localsAggregate.top_dish_id) }}
        />
      )}

      {/* Board 8: Island Favorite — most-appearing restaurant */}
      {localsAggregate && localsAggregate.top_restaurant_id && localsAggregate.total_lists >= 2 && (
        <LocalsChalkboardCard
          tag={'\uD83D\uDCCD island favorite'}
          title={localsAggregate.top_restaurant_name}
          sub={localsAggregate.top_restaurant_town || ''}
          countText={localsAggregate.top_restaurant_list_count >= localsAggregate.total_lists ? 'On every local list' : 'On ' + localsAggregate.top_restaurant_list_count + ' of ' + localsAggregate.total_lists + ' local lists'}
          cta={'see the menu \u2192'}
          onClick={function () { navigate('/restaurants/' + localsAggregate.top_restaurant_id) }}
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
