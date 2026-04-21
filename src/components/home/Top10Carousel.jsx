import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { BROWSE_CATEGORIES } from '../../constants/categories'
import { DishListItem } from '../DishListItem'
import { CategoryIcon } from './CategoryIcons'

var CAROUSEL_TABS = [{ id: 'nearby', label: 'Near You' }].concat(
  BROWSE_CATEGORIES.map(function (c) { return { id: c.id, label: c.label } })
)

var INITIAL_LIMIT = 10
var LOAD_MORE_COUNT = 5

/**
 * Top10Carousel — horizontally swipeable set of vertical top-10 lists.
 * "Near You" is the first page, then one page per BROWSE_CATEGORY.
 * All filtering is client-side from the full ranked dishes array.
 *
 * Props:
 *   dishes          - full ranked dishes array
 *   onCategoryChange - callback(categoryId | null) when active tab changes (for map sync)
 */
export var Top10Carousel = forwardRef(function Top10Carousel({ dishes, onCategoryChange }, ref) {
  var [activeIndex, setActiveIndex] = useState(0)
  var [limits, setLimits] = useState({}) // { tabId: visibleCount }
  var scrollRef = useRef(null)
  var tabsRef = useRef(null)

  // Expose scrollToCategory for external navigation (chips, chalkboard cards)
  useImperativeHandle(ref, function () {
    return {
      scrollToCategory: function (categoryId) {
        var idx = -1
        for (var i = 0; i < CAROUSEL_TABS.length; i++) {
          if (CAROUSEL_TABS[i].id === categoryId) { idx = i; break }
        }
        if (idx >= 0 && scrollRef.current) {
          var pageWidth = scrollRef.current.offsetWidth
          scrollRef.current.scrollTo({ left: idx * pageWidth, behavior: 'smooth' })
        }
      }
    }
  })

  // Update active tab on scroll
  var handleScroll = useCallback(function () {
    if (!scrollRef.current) return
    var pageWidth = scrollRef.current.offsetWidth
    if (pageWidth === 0) return
    var scrollLeft = scrollRef.current.scrollLeft
    var newIndex = Math.round(scrollLeft / pageWidth)
    if (newIndex >= 0 && newIndex < CAROUSEL_TABS.length) {
      setActiveIndex(newIndex)
    }
  }, [])

  // Notify parent when active category changes (for map sync)
  useEffect(function () {
    if (onCategoryChange) {
      var tab = CAROUSEL_TABS[activeIndex]
      onCategoryChange(tab && tab.id !== 'nearby' ? tab.id : null)
    }
  }, [activeIndex, onCategoryChange])

  // Auto-scroll tab bar to keep active tab visible.
  // Scroll tabsRef horizontally ourselves — scrollIntoView with block: 'nearest'
  // will vertically scroll the outer container when the tab bar is off-screen,
  // which fights any page-level scroll-to-carousel animation from callers.
  useEffect(function () {
    var tabs = tabsRef.current
    if (!tabs) return
    var activeTab = tabs.children[activeIndex]
    if (!activeTab) return
    var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    var targetLeft = activeTab.offsetLeft - (tabs.offsetWidth - activeTab.offsetWidth) / 2
    tabs.scrollTo({ left: targetLeft, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
  }, [activeIndex])

  // Get all dishes for a tab (unsliced)
  function getAllDishesForTab(tab) {
    if (tab.id === 'nearby') return dishes || []
    return (dishes || []).filter(function (d) {
      return d.category && d.category.toLowerCase() === tab.id.toLowerCase()
    })
  }

  // Get visible limit for a tab
  function getLimit(tabId) {
    return limits[tabId] || INITIAL_LIMIT
  }

  // Show more for a specific tab
  function handleShowMore(tabId) {
    setLimits(function (prev) {
      var newLimits = Object.assign({}, prev)
      newLimits[tabId] = (prev[tabId] || INITIAL_LIMIT) + LOAD_MORE_COUNT
      return newLimits
    })
  }

  // Tab click → scroll carousel to that page
  function handleTabClick(index) {
    if (!scrollRef.current) return
    var pageWidth = scrollRef.current.offsetWidth
    scrollRef.current.scrollTo({ left: index * pageWidth, behavior: 'smooth' })
  }

  var activeTab = CAROUSEL_TABS[activeIndex] || CAROUSEL_TABS[0]
  var allActiveTabDishes = getAllDishesForTab(activeTab)
  var activeLimit = getLimit(activeTab.id)
  var visibleCount = Math.min(allActiveTabDishes.length, activeLimit)

  return (
    <div className="pt-1">
      {/* Divider */}
      <div className="mx-4 mb-2" style={{
        height: '2px',
        background: 'linear-gradient(90deg, var(--color-text-primary), var(--color-text-primary) 30%, transparent)',
        opacity: 0.12,
      }} />

      {/* Category icons — food icons as carousel navigation */}
      <div
        ref={tabsRef}
        className="flex overflow-x-auto px-3 pb-1"
        style={{
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x pan-y',
        }}
      >
        {CAROUSEL_TABS.map(function (tab, i) {
          var isActive = i === activeIndex
          return (
            <button
              key={tab.id}
              onClick={function () { handleTabClick(i) }}
              className="flex-shrink-0 flex flex-col items-center justify-center active:scale-[0.94] transition-transform"
              style={{
                padding: '0',
                minWidth: '64px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                opacity: isActive ? 1 : 0.45,
                transition: 'opacity 0.15s',
              }}
            >
              {tab.id === 'nearby' ? (
                <div style={{
                  width: '56px',
                  height: '56px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                }}>
                  📍
                </div>
              ) : (
                <CategoryIcon categoryId={tab.id} size={56} />
              )}
              <span style={{
                marginTop: '1px',
                fontSize: '9px',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                lineHeight: 1.2,
              }}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Section header — updates with active tab */}
      <div className="px-5 flex items-baseline justify-between mb-1">
        <h2 style={{
          fontFamily: "'Amatic SC', cursive",
          fontSize: '30px',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          letterSpacing: '0.02em',
          lineHeight: 1,
        }}>
          {activeTab.id === 'nearby' ? 'Top Rated Nearby' : 'Top ' + activeTab.label}
        </h2>
        <span style={{
          fontSize: '11px',
          color: 'var(--color-text-tertiary)',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}>
          {visibleCount}{allActiveTabDishes.length > activeLimit ? '+' : ''} {visibleCount === 1 ? 'dish' : 'dishes'}
        </span>
      </div>

      {/* Snap-scroll carousel */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          width: '100%',
        }}
      >
        {CAROUSEL_TABS.map(function (tab, tabIndex) {
          // Only render content for active page ± 1 neighbor (lazy rendering)
          var isNearActive = Math.abs(tabIndex - activeIndex) <= 1
          var allTabDishes = isNearActive ? getAllDishesForTab(tab) : []
          var tabLimit = getLimit(tab.id)
          var visibleDishes = allTabDishes.slice(0, tabLimit)
          var hasMore = allTabDishes.length > tabLimit
          var remaining = allTabDishes.length - tabLimit

          return (
            <div
              key={tab.id}
              style={{
                width: '100vw',
                minWidth: '100vw',
                scrollSnapAlign: 'start',
                flexShrink: 0,
                padding: '0 16px',
                boxSizing: 'border-box',
              }}
            >
              {!isNearActive ? (
                <div style={{ minHeight: '200px' }} />
              ) : visibleDishes.length > 0 ? (
                <>
                  {visibleDishes.map(function (dish, i) {
                    return (
                      <DishListItem
                        key={dish.dish_id || dish.id}
                        dish={dish}
                        rank={i + 1}
                        variant="ranked"
                        isLast={!hasMore && i === visibleDishes.length - 1}
                      />
                    )
                  })}
                  {hasMore && (
                    <button
                      onClick={function () { handleShowMore(tab.id) }}
                      className="w-full py-3 rounded-xl font-semibold text-center transition-all active:scale-[0.98]"
                      style={{
                        fontSize: '14px',
                        color: 'var(--color-accent-gold)',
                        background: 'var(--color-card)',
                        border: '1.5px solid var(--color-divider)',
                        marginTop: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      Show {remaining > LOAD_MORE_COUNT ? LOAD_MORE_COUNT : remaining} more
                    </button>
                  )}
                </>
              ) : (
                <p className="py-8 text-center" style={{
                  fontSize: '14px',
                  color: 'var(--color-text-tertiary)',
                }}>
                  No {tab.label.toLowerCase()} rated yet
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})
