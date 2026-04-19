import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useLocationContext } from '../context/LocationContext'
import { useDishes } from '../hooks/useDishes'
import { useDishSearch } from '../hooks/useDishSearch'
import { BROWSE_CATEGORIES } from '../constants/categories'
import { DishSearch } from '../components/DishSearch'
import { RadiusSheet } from '../components/LocationPicker'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { ModeFAB } from '../components/ModeFAB'
import { HomeListMode, MapCategoryBar } from '../components/home'
import { getSessionItem, setSessionItem } from '../lib/storage'
import { logger } from '../utils/logger'

var RestaurantMap = lazy(function () {
  return import('../components/restaurants/RestaurantMap').then(function (m) {
    return { default: m.RestaurantMap }
  })
})

export function Map() {
  var navigate = useNavigate()
  var routeLocation = useLocation()
  var { location, radius, setRadius, permissionState, requestLocation } = useLocationContext()

  var [mode, setMode] = useState(function () {
    return getSessionItem('wgh_home_mode') || 'list'
  })
  var [selectedCategory, setSelectedCategory] = useState(null)
  var [radiusSheetOpen, setRadiusSheetOpen] = useState(false)
  var [searchQuery, setSearchQuery] = useState('')
  var [searchLimit, setSearchLimit] = useState(10)
  var [focusDishId, setFocusDishId] = useState(null)
  var [highlightedDishId, setHighlightedDishId] = useState(null)
  var [pinSelected, setPinSelected] = useState(false)
  var [listLimit, setListLimit] = useState(10)
  var [expandedCategory, setExpandedCategory] = useState(null)
  var [mapCategory, setMapCategory] = useState(null)
  var [activeLocalList, setActiveLocalList] = useState(null)
  var [activeLocalListName, setActiveLocalListName] = useState(null)

  var mapRef = useRef(null)
  var listScrollRef = useRef(null)
  var scrollPositionRef = useRef(0)
  var highlightTimerRef = useRef(null)

  // Route state: "See on map" from dish detail
  var focusDishFromRoute = routeLocation.state?.focusDish || null

  useEffect(function () {
    if (focusDishFromRoute) {
      setMode('map')
      setSessionItem('wgh_home_mode', 'map')
      setFocusDishId(null)
      // Delay to let map component mount and restaurantGroups populate
      setTimeout(function () { setFocusDishId(focusDishFromRoute) }, 300)
      navigate('/', { replace: true, state: {} })
    }
  }, [focusDishFromRoute, navigate])

  // Mode toggle with scroll position save/restore
  var handleToggle = useCallback(function () {
    if (mode === 'list') {
      if (listScrollRef.current) {
        scrollPositionRef.current = listScrollRef.current.scrollTop
      }
      // Inherit active category from list mode
      setMapCategory(selectedCategory || expandedCategory || null)
      setMode('map')
      setSessionItem('wgh_home_mode', 'map')
    } else {
      setMode('list')
      setSessionItem('wgh_home_mode', 'list')
    }
  }, [mode, selectedCategory, expandedCategory])

  // Restore scroll position when switching back to list
  useEffect(function () {
    if (mode === 'list' && listScrollRef.current && scrollPositionRef.current > 0) {
      listScrollRef.current.scrollTop = scrollPositionRef.current
    }
  }, [mode])

  var handleRadiusSheetOpen = useCallback(function () {
    setRadiusSheetOpen(true)
  }, [])

  var handleSearchChange = useCallback(function (q) {
    setSearchQuery(q)
    setSearchLimit(10)
    if (q) setSelectedCategory(null)
  }, [])

  var handleLocalListExpanded = useCallback(function (items, name) {
    if (items) {
      setActiveLocalList(items.map(function (item) {
        return {
          dish_id: item.dish_id,
          dish_name: item.dish_name,
          restaurant_name: item.restaurant_name,
          restaurant_id: item.restaurant_id,
          avg_rating: item.avg_rating,
          total_votes: item.total_votes,
          category: item.category,
          restaurant_lat: item.restaurant_lat,
          restaurant_lng: item.restaurant_lng,
        }
      }))
      setActiveLocalListName(name)
    } else {
      setActiveLocalList(null)
      setActiveLocalListName(null)
    }
  }, [])

  // Search results (no town filter — shows whole island)
  var searchData = useDishSearch(searchQuery, searchLimit, {
    lat: location ? location.lat : null,
    lng: location ? location.lng : null,
    radiusMiles: radius,
    isUsingDefault: permissionState !== 'granted',
  })
  var searchResults = searchData.results
  var searchLoading = searchData.loading

  // Ranked dishes — single source of truth for both modes
  // Always fetch ALL dishes — carousel does client-side category filtering
  var rankedData = useDishes(location, radius, null, null, null)
  var rankedDishes = rankedData.dishes
  var rankedLoading = rankedData.loading || rankedData.isFetching

  var selectedCategoryLabel = selectedCategory
    ? BROWSE_CATEGORIES.find(function (c) { return c.id === selectedCategory })
    : null

  var allRanked = rankedDishes || []
  var listDishes = selectedCategory ? allRanked.slice(0, listLimit) : allRanked.slice(0, 10)
  // Map pins: filter by mapCategory (inherited from list or set via floating bar)
  var mapDishes = useMemo(function () {
    if (mapCategory) {
      return allRanked.filter(function (d) {
        return d.category && d.category.toLowerCase() === mapCategory.toLowerCase()
      }).slice(0, 10)
    }
    return allRanked.slice(0, 10)
  }, [allRanked, mapCategory])

  var dishesWithCoords = mapDishes.filter(function (d) {
    return d.restaurant_lat != null && d.restaurant_lng != null
  })

  var localListWithCoords = activeLocalList
    ? activeLocalList.filter(function (d) { return d.restaurant_lat != null && d.restaurant_lng != null })
    : []

  var displayedOnMap = focusDishId
    ? dishesWithCoords.filter(function (d) { return d.dish_id === focusDishId })
    : (searchQuery && searchResults && searchResults.length > 0)
      ? searchResults.filter(function (d) { return d.restaurant_lat != null && d.restaurant_lng != null })
      : activeLocalList && localListWithCoords.length > 0
        ? localListWithCoords
        : dishesWithCoords

  var activeDishes = searchQuery ? searchResults : listDishes

  // Build dish rank map for mini-card display — based on what's actually shown
  var dishRanks = useMemo(function () {
    var ranks = {}
    var list = searchQuery ? (searchResults || []) : (mapDishes || [])
    for (var i = 0; i < list.length; i++) {
      ranks[list[i].dish_id] = i + 1
    }
    return ranks
  }, [searchQuery, searchResults, mapDishes])

  // Editorial: top rated restaurant (highest avg across ranked dishes, min 2 dishes)
  var topRestaurant = useMemo(function () {
    if (!allRanked || allRanked.length === 0) return null
    var restaurants = {}
    allRanked.forEach(function (d) {
      if (!d.restaurant_name || !d.avg_rating) return
      var rid = d.restaurant_id
      if (!restaurants[rid]) {
        restaurants[rid] = { name: d.restaurant_name, id: rid, ratings: [], count: 0 }
      }
      restaurants[rid].ratings.push(Number(d.avg_rating))
      restaurants[rid].count++
    })
    var best = null
    Object.keys(restaurants).forEach(function (rid) {
      var r = restaurants[rid]
      if (r.count < 2) return
      var avg = r.ratings.reduce(function (a, b) { return a + b }, 0) / r.ratings.length
      if (!best || avg > best.avg) {
        best = { name: r.name, id: r.id, avg: Math.round(avg * 10) / 10, count: r.count }
      }
    })
    return best
  }, [allRanked])

  // Editorial: most talked about dish (highest vote count)
  var mostVotedDish = useMemo(function () {
    if (!allRanked || allRanked.length === 0) return null
    var top = null
    allRanked.forEach(function (d) {
      if (!top || (d.total_votes || 0) > (top.total_votes || 0)) {
        top = d
      }
    })
    return top
  }, [allRanked])

  // Editorial: best meal under $15 (excludes desserts, coffee, sides, apps, fries)
  var bestValueMeal = useMemo(function () {
    if (!allRanked || allRanked.length === 0) return null
    var excludeCategories = new Set([
      'dessert', 'donuts', 'ice cream', 'coffee', 'sides', 'fries',
      'apps', 'onion rings', 'veggies', 'bakery',
    ])
    var candidates = allRanked.filter(function (d) {
      return d.price && Number(d.price) > 0 && Number(d.price) <= 15
        && (d.total_votes || 0) >= 3
        && d.avg_rating
        && !excludeCategories.has(d.category)
    })
    if (candidates.length === 0) return null
    var best = null
    candidates.forEach(function (d) {
      if (!best || Number(d.avg_rating || 0) > Number(best.avg_rating || 0)) {
        best = d
      }
    })
    return best
  }, [allRanked])

  // Editorial: best ice cream dish
  var bestIceCream = useMemo(function () {
    if (!allRanked || allRanked.length === 0) return null
    var iceCreamCategories = new Set(['ice cream', 'dessert'])
    var candidates = allRanked.filter(function (d) {
      var name = (d.dish_name || d.name || '').toLowerCase()
      var cat = (d.category || '').toLowerCase()
      return (iceCreamCategories.has(cat) || name.indexOf('ice cream') !== -1
        || name.indexOf('gelato') !== -1 || name.indexOf('sundae') !== -1
        || name.indexOf('soft serve') !== -1 || name.indexOf('frappe') !== -1)
        && (d.total_votes || 0) >= 1
    })
    if (candidates.length === 0) return null
    var best = null
    candidates.forEach(function (d) {
      if (!best || Number(d.avg_rating || 0) > Number(best.avg_rating || 0)) {
        best = d
      }
    })
    return best
  }, [allRanked])

  var rankingContext = useMemo(function () {
    if (searchQuery) return 'for \u201c' + searchQuery + '\u201d'
    if (activeLocalListName) return activeLocalListName + '\u2019s picks'
    // Use mapCategory when in map mode, selectedCategory when in list mode
    var activeCat = mode === 'map' ? mapCategory : (selectedCategoryLabel ? selectedCategoryLabel.id : null)
    if (activeCat) {
      var catInfo = BROWSE_CATEGORIES.find(function (c) { return c.id === activeCat })
      return (catInfo ? catInfo.label : activeCat) + ' nearby'
    }
    return 'nearby'
  }, [searchQuery, selectedCategoryLabel, activeLocalListName, mode, mapCategory])

  var [selectedDishLocation, setSelectedDishLocation] = useState(null)

  // Map pin tap: show mini-card, hide floating controls
  var handlePinTap = useCallback(function (dishId) {
    logger.debug('Pin tapped, dishId:', dishId)
    setPinSelected(true)
    setHighlightedDishId(dishId)
    // Find the dish's location for the "how far" button
    var allDishes = displayedOnMap || []
    var dish = allDishes.find(function (d) { return d.dish_id === dishId })
    if (dish && dish.restaurant_lat && dish.restaurant_lng) {
      setSelectedDishLocation({ lat: Number(dish.restaurant_lat), lng: Number(dish.restaurant_lng) })
    } else {
      setSelectedDishLocation(null)
    }
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current)
    }
    highlightTimerRef.current = setTimeout(function () {
      setHighlightedDishId(null)
    }, 1500)
  }, [displayedOnMap])

  // Map background tap: dismiss mini-card, restore all pins, show controls
  var handleMapClick = useCallback(function () {
    setPinSelected(false)
    setFocusDishId(null)
    setSelectedDishLocation(null)
  }, [])

  useEffect(function () {
    return function () {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current)
      }
    }
  }, [])

  return (
    <main id="main-content" className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <h1 className="sr-only">What's Good Here</h1>

      {/* LIST MODE */}
      {mode === 'list' && (
        <HomeListMode
          listScrollRef={listScrollRef}
          searchQuery={searchQuery}
          searchLoading={searchLoading}
          rankedLoading={rankedLoading}
          activeDishes={activeDishes}
          allRankedDishes={allRanked}
          expandedCategory={expandedCategory}
          topRestaurant={topRestaurant}
          mostVotedDish={mostVotedDish}
          bestValueMeal={bestValueMeal}
          bestIceCream={bestIceCream}
          radius={radius}
          permissionState={permissionState}
          requestLocation={requestLocation}
          onSearchChange={handleSearchChange}
          onRadiusSheetOpen={handleRadiusSheetOpen}
          onExpandedCategoryChange={setExpandedCategory}
          onCategoryChange={setSelectedCategory}
          onLocalListExpanded={handleLocalListExpanded}
        />
      )}

      {/* MAP MODE */}
      {mode === 'map' && (
        <>
          {/* Full-screen map */}
          <div className="fixed inset-0" style={{ zIndex: 1 }}>
            <ErrorBoundary>
              <Suspense fallback={
                <div
                  role="status"
                  aria-label="Loading map"
                  className="w-full h-full flex items-center justify-center"
                  style={{ background: 'var(--color-bg)' }}
                >
                  <div
                    className="w-8 h-8 rounded-full animate-spin"
                    style={{
                      border: '3px solid var(--color-divider)',
                      borderTopColor: 'var(--color-accent-gold)',
                    }}
                  />
                  <span className="sr-only">Loading map</span>
                </div>
              }>
                <RestaurantMap
                  mode="dish"
                  dishes={displayedOnMap}
                  userLocation={location}
                  onSelectDish={handlePinTap}
                  radiusMi={radius}
                  permissionGranted={permissionState === 'granted'}
                  fullScreen
                  focusDishId={focusDishId}
                  mapRef={mapRef}
                  onMapClick={handleMapClick}
                  dishRanks={dishRanks}
                  rankingContext={rankingContext}
                />
              </Suspense>
            </ErrorBoundary>
          </div>

          {/* Floating controls: search + zoom.
              Hide when a pin is selected AND we have location (the "How far?" button takes over).
              If no location, keep controls visible so the user isn't stuck with only the FAB. */}
          <div
            className="fixed left-0 right-0"
            style={{
              top: 'env(safe-area-inset-top, 0px)',
              zIndex: 15,
              padding: '12px 12px 0',
              pointerEvents: 'none',
              opacity: (pinSelected && location) ? 0 : 1,
              transition: 'opacity 200ms ease',
            }}
          >
            <div className="flex items-center gap-2" style={{ pointerEvents: (pinSelected && location) ? 'none' : 'auto' }}>
              <div className="flex-1" style={{
                borderRadius: '14px',
                boxShadow: '0 2px 16px rgba(0,0,0,0.10)',
              }}>
                <DishSearch
                  loading={false}
                  placeholder="What are you craving?"
                  onSearchChange={handleSearchChange}
                  initialQuery={searchQuery}
                  rightSlot={
                    <button
                      onClick={function (e) { e.stopPropagation(); setRadiusSheetOpen(true) }}
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

            {/* Floating category bar */}
            <div className="mt-2" style={{ pointerEvents: (pinSelected && location) ? 'none' : 'auto' }}>
              <MapCategoryBar activeCategory={mapCategory} onCategoryChange={setMapCategory} />
            </div>
          </div>
        </>
      )}

      {/* "How far?" button — appears above FAB when a pin is selected */}
      {mode === 'map' && pinSelected && selectedDishLocation && location && (function () {
        return (
          <button
            onClick={function () {
              var map = mapRef.current
              if (!map) return
              var bounds = [
                [location.lat, location.lng],
                [selectedDishLocation.lat, selectedDishLocation.lng],
              ]
              map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 })
            }}
            className="fixed z-40 active:scale-90 transition-transform flex items-center justify-center"
            style={{
              bottom: '148px',
              right: '20px',
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'var(--color-card)',
              border: '1.5px solid var(--color-divider)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            }}
            aria-label="Show distance to dish"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
          </button>
        )
      })()}

      {/* Toggle FAB (both modes) */}
      <ModeFAB mode={mode} onToggle={handleToggle} />

      <RadiusSheet
        isOpen={radiusSheetOpen}
        onClose={function () { setRadiusSheetOpen(false) }}
        radius={radius}
        onRadiusChange={setRadius}
      />

    </main>
  )
}
