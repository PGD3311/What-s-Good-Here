import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { logger } from '../../utils/logger'
import { getCategoryEmoji, getDishNameIcon } from '../../constants/categories'
import { getPosterIconSrc } from '../home/CategoryIcons'
import { calculateDistance } from '../../utils/distance'

const MILES_TO_METERS = 1609.34
const PROXIMITY_THRESHOLD_MI = 0.062 // ~100m

// ─── Expose map instance to parent via ref ───────────────────────────────────
function MapRefExposer({ mapRef }) {
  const map = useMap()
  useEffect(function () {
    if (mapRef) mapRef.current = map
  }, [map, mapRef])
  return null
}

// ─── Shared: Auto-fit bounds on first render ─────────────────────────────────
function FitBounds({ points }) {
  const map = useMap()
  const fittedRef = useRef(false)

  useEffect(() => {
    if (fittedRef.current || points.length === 0) return
    const bounds = L.latLngBounds(points)
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
    fittedRef.current = true
  }, [points, map])

  return null
}

// ─── Shared: Fly to a location when prop changes ─────────────────────────────
function FlyToLocation({ lat, lng }) {
  var map = useMap()
  var prevRef = useRef(null)

  useEffect(function () {
    if (!lat || !lng) return
    var key = lat + ',' + lng
    if (key === prevRef.current) return
    prevRef.current = key
    map.flyTo([lat, lng], 16, { duration: 0.8 })
  }, [lat, lng, map])

  return null
}

// ─── Shared: Click handler to dismiss dish mini-card ─────────────────────────
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click: () => {
      if (onMapClick) onMapClick()
    },
  })
  return null
}

// ─── Restaurant Mode: Search bar ─────────────────────────────────────────────
function MapSearchBar({ onSearch }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const map = useMap()

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const encoded = encodeURIComponent(query.trim())
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=us`
      )
      const data = await res.json()
      if (data.length > 0) {
        const { lat, lon } = data[0]
        map.flyTo([parseFloat(lat), parseFloat(lon)], 14, { duration: 1.5 })
        if (onSearch) onSearch(query.trim())
      }
    } catch (err) {
      logger.error('Map geocode error:', err)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        right: '50px',
        zIndex: 1000,
        display: 'flex',
        gap: '6px',
      }}
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        placeholder="Search a location..."
        style={{
          flex: 1,
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid rgba(0,0,0,0.2)',
          background: 'white',
          fontSize: '13px',
          color: '#333',
          outline: 'none',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        }}
      />
      <button
        onClick={handleSearch}
        disabled={searching}
        style={{
          padding: '8px 12px',
          borderRadius: '8px',
          border: 'none',
          background: '#6BB384',
          color: 'white',
          fontSize: '13px',
          fontWeight: 600,
          cursor: searching ? 'wait' : 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          opacity: searching ? 0.7 : 1,
        }}
      >
        {searching ? '...' : 'Go'}
      </button>
    </div>
  )
}

// ─── Dish Mode: Build category icon divIcon ─────────────────────────────────
function buildCategoryIcon(category, dishCount, hasHighRating, dishName, isSelected, ranks) {
  var posterImage = getDishNameIcon(dishName) || getPosterIconSrc(category)
  var emoji = getCategoryEmoji(category)
  var bestRank = (ranks && ranks.length > 0) ? ranks[0] : null

  var badge = ''

  var medalBg = bestRank === 1 ? 'var(--color-medal-gold)'
    : bestRank === 2 ? 'var(--color-medal-silver)'
    : bestRank === 3 ? 'var(--color-medal-bronze)'
    : null
  var size = isSelected ? 56 : (medalBg ? 46 : 44)
  var imgSize = isSelected ? 52 : (medalBg ? 46 : 42)

  var glow = isSelected
    ? 'box-shadow:0 0 14px 6px rgba(228,90,53,0.6);border:3px solid var(--color-primary);z-index:9999 !important;'
    : medalBg
      ? 'box-shadow:0 0 10px 4px rgba(0,0,0,0.15);border:2.5px solid ' + medalBg + ';'
      : hasHighRating
        ? 'box-shadow:0 0 8px 3px rgba(217,167,101,0.5);'
        : ''

  var bg = medalBg || 'var(--color-surface-elevated)'
  var borderStyle = medalBg && !isSelected
    ? 'border:2.5px solid ' + medalBg + ';'
    : 'border:2px solid var(--color-divider);'

  var innerContent = posterImage
    ? '<img src="' + posterImage + '" alt="" style="width:' + imgSize + 'px;height:' + imgSize + 'px;object-fit:contain;" />'
    : '<span style="font-size:' + (isSelected ? 40 : (medalBg ? 36 : 32)) + 'px;">' + emoji + '</span>'

  // Small rank badge top-right for top 10
  var rankBadge = ''
  if (bestRank && bestRank <= 10 && !isSelected) {
    var badgeBg = medalBg || 'var(--color-text-primary)'
    rankBadge = '<div style="position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:9px;padding:0 3px;background:' + badgeBg + ';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;border:1.5px solid #fff;">' + bestRank + '</div>'
  }

  return L.divIcon({
    className: '',
    html: '<div style="' +
      'position:relative;width:' + size + 'px;height:' + size + 'px;' +
      'display:flex;align-items:center;justify-content:center;' +
      'cursor:pointer;' +
      'border-radius:50%;' +
      'background:' + bg + ';' +
      borderStyle +
      'transition:all 0.2s ease;' +
      glow +
    '">' + innerContent + badge + rankBadge + '</div>',
    iconSize: [size, size],
    iconAnchor: [23, 23],
  })
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function RestaurantMap({
  mode = 'dish',
  restaurants = [],
  dishes = [],
  userLocation,
  town,
  onSelectRestaurant,
  onSelectDish,
  onMapClick,
  isAuthenticated,
  radiusMi,
  permissionGranted,
  compact = false,
  fullScreen = false,
  focusDishId = null,
  mapRef = null,
  dishRanks = {},
  rankingContext = 'nearby',
}) {
  const nav = useNavigate()
  const defaultCenter = [41.43, -70.56]
  const center = userLocation?.lat && userLocation?.lng
    ? [userLocation.lat, userLocation.lng]
    : defaultCenter

  // ─── Dish mode state ───
  const [selectedRestaurantId, _setSelectedRestaurantId] = useState(function () {
    try {
      return sessionStorage.getItem('wgh_map_selected_restaurant') || null
    } catch (e) { return null }
  })
  var setSelectedRestaurantId = function (id) {
    _setSelectedRestaurantId(id)
    try {
      if (id) { sessionStorage.setItem('wgh_map_selected_restaurant', id) }
      else { sessionStorage.removeItem('wgh_map_selected_restaurant') }
    } catch (e) { /* noop */ }
  }
  const [dismissedProximity, setDismissedProximity] = useState({})

  // ─── Dish mode: group dishes by restaurant ───
  const restaurantGroups = useMemo(() => {
    if (mode !== 'dish' || !dishes || dishes.length === 0) return []

    const groupMap = {}
    for (let i = 0; i < dishes.length; i++) {
      const d = dishes[i]
      const rid = d.restaurant_id
      if (!rid) continue
      if (!groupMap[rid]) {
        groupMap[rid] = {
          restaurant_id: rid,
          restaurant_name: d.restaurant_name,
          restaurant_lat: d.restaurant_lat,
          restaurant_lng: d.restaurant_lng,
          restaurant_address: d.restaurant_address,
          dishes: [],
        }
      }
      groupMap[rid].dishes.push(d)
    }

    // Sort dishes within each group by avg_rating desc
    const groups = Object.values(groupMap)
    for (let i = 0; i < groups.length; i++) {
      groups[i].dishes = groups[i].dishes.slice().sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0))
    }

    return groups
  }, [mode, dishes])

  // ─── Dish mode: selected group for mini card ───
  const selectedGroup = useMemo(() => {
    if (!selectedRestaurantId) return null
    for (let i = 0; i < restaurantGroups.length; i++) {
      if (restaurantGroups[i].restaurant_id === selectedRestaurantId) {
        return restaurantGroups[i]
      }
    }
    return null
  }, [selectedRestaurantId, restaurantGroups])

  // ─── Dish mode: focus on a dish from the list ───
  var [flyTarget, setFlyTarget] = useState(null)
  var [focusedSingleDish, setFocusedSingleDish] = useState(null)
  var handledFocusRef = useRef(null)

  useEffect(function () {
    if (!focusDishId || restaurantGroups.length === 0) return
    // Don't re-process the same focusDishId
    if (handledFocusRef.current === focusDishId) return
    for (var i = 0; i < restaurantGroups.length; i++) {
      var g = restaurantGroups[i]
      for (var j = 0; j < g.dishes.length; j++) {
        if (g.dishes[j].dish_id === focusDishId) {
          handledFocusRef.current = focusDishId
          setSelectedRestaurantId(g.restaurant_id)
          setFocusedSingleDish(g.dishes[j])
          setFlyTarget({ lat: g.restaurant_lat, lng: g.restaurant_lng })
          if (onSelectDish) onSelectDish(g.dishes[j].dish_id)
          return
        }
      }
    }
  }, [focusDishId, restaurantGroups, onSelectDish])

  // Clear focused single dish when user taps background
  // (tapping a different pin goes through the marker click handler which also clears it)

  // ─── Dish mode: proximity detection ───
  const nearbyRestaurant = useMemo(() => {
    if (mode !== 'dish' || !permissionGranted || !userLocation?.lat || !userLocation?.lng) return null

    for (let i = 0; i < restaurantGroups.length; i++) {
      const g = restaurantGroups[i]
      if (dismissedProximity[g.restaurant_id]) continue
      const dist = calculateDistance(
        userLocation.lat, userLocation.lng,
        g.restaurant_lat, g.restaurant_lng
      )
      if (dist <= PROXIMITY_THRESHOLD_MI) return g
    }
    return null
  }, [mode, permissionGranted, userLocation, restaurantGroups, dismissedProximity])

  // ─── Dish mode: compute distance for selected group ───
  const selectedGroupDistance = useMemo(() => {
    if (!selectedGroup || !userLocation?.lat || !userLocation?.lng) return null
    const dist = calculateDistance(
      userLocation.lat, userLocation.lng,
      selectedGroup.restaurant_lat, selectedGroup.restaurant_lng
    )
    return dist.toFixed(1)
  }, [selectedGroup, userLocation])

  // ─── Fit bounds points ───
  const fitBoundsPoints = useMemo(() => {
    const pts = []
    if (userLocation?.lat && userLocation?.lng) {
      pts.push([userLocation.lat, userLocation.lng])
    }

    if (mode === 'dish') {
      for (let i = 0; i < restaurantGroups.length; i++) {
        const g = restaurantGroups[i]
        if (g.restaurant_lat && g.restaurant_lng) {
          pts.push([g.restaurant_lat, g.restaurant_lng])
        }
      }
    } else {
      for (let i = 0; i < restaurants.length; i++) {
        const r = restaurants[i]
        if (r.lat && r.lng) pts.push([r.lat, r.lng])
      }
    }

    return pts
  }, [mode, restaurantGroups, restaurants, userLocation])

  // ─── Dish mode: total votes for selected group ───
  const selectedGroupVotes = useMemo(() => {
    if (!selectedGroup) return 0
    let total = 0
    for (let i = 0; i < selectedGroup.dishes.length; i++) {
      total += selectedGroup.dishes[i].total_votes || 0
    }
    return total
  }, [selectedGroup])

  // ────────────────────── RENDER ──────────────────────

  const isDishMode = mode === 'dish'

  var mapHeight = fullScreen ? '100vh' : compact ? '260px' : 'calc(100dvh - 160px)'

  return (
    <div
      role="application"
      aria-label="Dish map"
      style={{
        height: mapHeight,
        width: '100%',
        borderRadius: fullScreen ? '0' : '12px',
        overflow: 'hidden',
        border: fullScreen ? 'none' : '1px solid var(--color-divider)',
        position: 'relative',
      }}
    >
      <MapContainer
        center={center}
        zoom={fullScreen ? 13 : 13}
        style={{ height: '100%', width: '100%' }}
        attributionControl={true}
        zoomControl={!fullScreen}
      >
        {/* Expose map instance to parent */}
        {mapRef && <MapRefExposer mapRef={mapRef} />}

        {/* Tiles — CartoDB Voyager (free, no API key, includes labels) */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          maxZoom={19}
          subdomains="abcd"
          className="wgh-map-tiles"
        />

        {/* Fit bounds — skip on fullscreen map so it stays zoomed to user location */}
        {!fullScreen && <FitBounds points={fitBoundsPoints} />}

        {/* Click handler — dismisses dish mini-card */}
        {isDishMode && (
          <MapClickHandler onMapClick={() => {
            setSelectedRestaurantId(null)
            setFocusedSingleDish(null)
            if (onMapClick) onMapClick()
          }} />
        )}
        {isDishMode && flyTarget && <FlyToLocation lat={flyTarget.lat} lng={flyTarget.lng} />}

        {/* ─── Restaurant mode internals (disabled in fullScreen) ─── */}
        {!isDishMode && !fullScreen && <MapSearchBar />}

        {/* User location — blue pulsing dot (both modes) */}
        {userLocation?.lat && userLocation?.lng && (
          <>
            <CircleMarker
              center={[userLocation.lat, userLocation.lng]}
              radius={16}
              pathOptions={{
                color: '#4A90D9',
                fillColor: '#4A90D9',
                fillOpacity: 0.15,
                weight: 1,
                opacity: 0.3,
              }}
            />
            <CircleMarker
              center={[userLocation.lat, userLocation.lng]}
              radius={7}
              pathOptions={{
                color: '#fff',
                fillColor: '#4A90D9',
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Popup>
                <span style={{ fontWeight: 600, fontSize: '13px' }}>You are here</span>
              </Popup>
            </CircleMarker>
          </>
        )}

        {/* ─── Dish mode: emoji pins ─── */}
        {isDishMode && restaurantGroups.map(group => {
          const topDish = group.dishes[0]
          if (!topDish) return null
          const hasHighRating = group.dishes.some(d => (d.avg_rating || 0) >= 9)
          const isSelected = selectedRestaurantId === group.restaurant_id
          // Collect all ranks at this restaurant, sorted ascending
          var ranks = []
          for (var ri = 0; ri < group.dishes.length; ri++) {
            var dr = dishRanks[group.dishes[ri].dish_id]
            if (dr) ranks.push(dr)
          }
          ranks.sort(function (a, b) { return a - b })
          const icon = buildCategoryIcon(topDish.category, group.dishes.length, hasHighRating, topDish.dish_name, isSelected, ranks)

          return (
            <Marker
              key={group.restaurant_id}
              position={[group.restaurant_lat, group.restaurant_lng]}
              icon={icon}
              zIndexOffset={isSelected ? 1000 : 0}
              eventHandlers={{
                click: () => {
                  // Clear single-dish focus when user taps any pin manually
                  setFocusedSingleDish(null)
                  // Always show mini-card overlay on pin tap
                  setSelectedRestaurantId(group.restaurant_id)
                  // In fullScreen (Home page): also signal to parent for sheet scroll
                  if (fullScreen && onSelectDish) {
                    onSelectDish(topDish.dish_id)
                  }
                },
              }}
            />
          )
        })}

        {/* ─── Restaurant mode: gold pins ─── */}
        {!isDishMode && restaurants
          .filter(r => r.lat && r.lng)
          .map(restaurant => {
            const isOpen = restaurant.is_open !== false
            const dishCount = restaurant.dish_count ?? restaurant.dishCount ?? 0
            const distanceMiles = restaurant.distance_miles

            return (
              <CircleMarker
                key={restaurant.id}
                center={[restaurant.lat, restaurant.lng]}
                radius={8}
                pathOptions={{
                  color: isOpen ? '#D9A765' : '#7D7168',
                  fillColor: isOpen ? '#D9A765' : '#7D7168',
                  fillOpacity: isOpen ? 0.9 : 0.5,
                  weight: 2,
                  opacity: 1,
                }}
              >
                <Popup>
                  <div style={{ minWidth: '140px' }}>
                    <button
                      onClick={() => onSelectRestaurant(restaurant)}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        display: 'block',
                        width: '100%',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>
                        {restaurant.name}
                      </div>
                      {restaurant.cuisine && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '2px' }}>
                          {restaurant.cuisine}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {dishCount} {dishCount === 1 ? 'dish' : 'dishes'}
                        {distanceMiles != null && ` \u00b7 ${distanceMiles} mi`}
                      </div>
                      {!isOpen && (
                        <div style={{ fontSize: '11px', color: 'var(--color-primary)', marginTop: '2px', fontWeight: 600 }}>
                          Closed for Season
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: 'var(--color-accent-gold)', marginTop: '4px', fontWeight: 500 }}>
                        View dishes &rarr;
                      </div>
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}

      </MapContainer>

      {/* ─── Dish mode: Proximity banner ─── */}
      {isDishMode && nearbyRestaurant && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            right: '10px',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-accent-gold)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              You're at {nearbyRestaurant.restaurant_name}
            </div>
            <button
              onClick={() => {
                if (onSelectRestaurant) {
                  onSelectRestaurant({ id: nearbyRestaurant.restaurant_id, name: nearbyRestaurant.restaurant_name })
                }
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--color-accent-gold)',
                cursor: 'pointer',
                marginTop: '2px',
              }}
            >
              See their menu &rarr;
            </button>
          </div>
          <button
            onClick={() => setDismissedProximity(prev => ({ ...prev, [nearbyRestaurant.restaurant_id]: true }))}
            aria-label="Dismiss"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              lineHeight: 1,
              color: 'var(--color-text-tertiary)',
              padding: '2px',
              flexShrink: 0,
            }}
          >
            &#10005;
          </button>
        </div>
      )}

      {/* ─── Dish mode: Mini card overlay ─── */}
      {isDishMode && selectedGroup && (() => {
        // If we're focusing on a single dish (from "See on map"), show only that dish
        var rankedDishes = []
        if (focusedSingleDish) {
          var fr = dishRanks[focusedSingleDish.dish_id] || null
          rankedDishes.push({ dish: focusedSingleDish, rank: fr })
        } else {
          // Get all ranked dishes at this restaurant, sorted by rank
          for (var mi = 0; mi < selectedGroup.dishes.length; mi++) {
            var md = selectedGroup.dishes[mi]
            var mr = dishRanks[md.dish_id]
            if (mr) rankedDishes.push({ dish: md, rank: mr })
          }
          rankedDishes.sort(function (a, b) { return a.rank - b.rank })
          // If no ranked dishes, show top dish as fallback
          if (rankedDishes.length === 0) {
            rankedDishes.push({ dish: selectedGroup.dishes[0], rank: null })
          }
        }

        return (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              width: 'calc(100% - 20px)',
              maxWidth: '320px',
              borderRadius: '12px',
              background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-divider)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              padding: '12px 14px',
              maxHeight: '280px',
              overflowY: 'auto',
            }}
          >
            {/* Restaurant name — clickable */}
            <button
              onClick={function () { nav('/restaurants/' + selectedGroup.restaurant_id) }}
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--color-accent-gold)',
                cursor: 'pointer',
                marginBottom: '2px',
                background: 'none',
                border: 'none',
                padding: 0,
                font: 'inherit',
                textAlign: 'left',
              }}
            >
              {selectedGroup.restaurant_name} →
            </button>

            {/* Meta line */}
            <div style={{
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
              marginBottom: '8px',
            }}>
              {selectedGroupDistance != null ? selectedGroupDistance + ' mi' : ''}
              {selectedGroupDistance != null && selectedGroupVotes > 0 ? ' \u00b7 ' : ''}
              {selectedGroupVotes > 0 ? selectedGroupVotes + ' vote' + (selectedGroupVotes !== 1 ? 's' : '') : ''}
            </div>

            {/* Dish list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
              {rankedDishes.map(function (item) {
                var dish = item.dish
                var rank = item.rank
                var medalColor = rank === 1 ? 'var(--color-medal-gold)'
                  : rank === 2 ? 'var(--color-medal-silver)'
                  : rank === 3 ? 'var(--color-medal-bronze)'
                  : 'var(--color-text-tertiary)'

                var voteCount = dish.total_votes || 0

                return (
                  <button
                    key={dish.dish_id}
                    onClick={function () { nav('/dish/' + dish.dish_id) }}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '10px 4px',
                      background: 'none',
                      border: 'none',
                      borderTop: '1px solid var(--color-divider)',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                    }}
                  >
                    {/* Rank number */}
                    {rank && (
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 800,
                        color: medalColor,
                        width: '22px',
                        textAlign: 'center',
                        flexShrink: 0,
                        paddingTop: '1px',
                      }}>
                        #{rank}
                      </span>
                    )}

                    {/* Name + progress bar */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {dish.dish_name}
                        </span>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: 'var(--color-rating)',
                          flexShrink: 0,
                        }}>
                          {dish.avg_rating != null ? Number(dish.avg_rating).toFixed(1) : '--'}
                        </span>
                      </div>

                      {/* Vote count */}
                      <div style={{ marginTop: '4px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          color: 'var(--color-text-secondary)',
                        }}>
                          {voteCount} rating{voteCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

          </div>
        )
      })()}

      {/* ─── Legend ─── */}
      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          zIndex: 1000,
          background: isDishMode ? 'rgba(13,27,34,0.9)' : 'rgba(255,255,255,0.95)',
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '11px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        {isDishMode ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px' }}>🍕</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>Dish category</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px',
                height: '16px',
                borderRadius: '8px',
                background: 'var(--color-accent-gold)',
                color: 'var(--color-bg)',
                fontSize: '9px',
                fontWeight: 700,
              }}>3</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>Dish count</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                boxShadow: '0 0 6px 2px rgba(217,167,101,0.5)',
                border: '2px solid var(--color-divider)',
              }} />
              <span style={{ color: 'var(--color-text-secondary)' }}>Rated 9+</span>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#D9A765', display: 'inline-block' }} />
            <span style={{ color: '#555' }}>On WGH</span>
          </div>
        )}
      </div>
    </div>
  )
}
