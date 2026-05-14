import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useDishSearch } from '../../hooks/useDishSearch'
import { useRestaurantSearch } from '../../hooks/useRestaurantSearch'
import { usePlaylistMutations } from '../../hooks/usePlaylistMutations'
import { useLocationContext } from '../../context/LocationContext'
import { calculateDistance } from '../../utils/distance'
import { getCategoryNeonImage, categoryEmojiFor } from '../../constants/categories'
import { dishesApi } from '../../api/dishesApi'
import { capture } from '../../lib/analytics'
import { logger } from '../../utils/logger'
import { toast } from 'sonner'

/**
 * Two-mode search sheet for adding dishes to a playlist.
 *
 * "By Dish" — type a dish name, see results sorted by distance, tap to add.
 * "By Restaurant" — type a restaurant name, tap one, see its dishes, tap to add.
 *
 * Stays open for multi-add without closing between each.
 */
export function AddDishSearchSheet({ isOpen, onClose, playlistId, existingDishIds }) {
  var [mode, setMode] = useState('dish') // 'dish' | 'restaurant'
  var [query, setQuery] = useState('')
  var inputRef = useRef(null)
  var { location, isUsingDefault } = useLocationContext()
  var { addDish } = usePlaylistMutations()

  // --- Dish search ---
  var { results: dishResults, loading: dishLoading, error: dishError } = useDishSearch(query, 20)
  var sortedDishResults = useMemo(function () {
    if (!dishResults || !dishResults.length) return dishResults
    if (!location || !location.lat || !location.lng || isUsingDefault) return dishResults
    return dishResults.slice().sort(function (a, b) {
      var distA = (a.restaurant_lat != null && a.restaurant_lng != null)
        ? calculateDistance(location.lat, location.lng, a.restaurant_lat, a.restaurant_lng)
        : 9999
      var distB = (b.restaurant_lat != null && b.restaurant_lng != null)
        ? calculateDistance(location.lat, location.lng, b.restaurant_lat, b.restaurant_lng)
        : 9999
      return distA - distB
    })
  }, [dishResults, location, isUsingDefault])

  // --- Restaurant search ---
  var placesLat = isUsingDefault ? null : (location ? location.lat : null)
  var placesLng = isUsingDefault ? null : (location ? location.lng : null)
  var { localResults: restResults, loading: restLoading } = useRestaurantSearch(
    query, placesLat, placesLng, mode === 'restaurant' && isOpen
  )

  // --- Restaurant drill-down ---
  var [selectedRestaurant, setSelectedRestaurant] = useState(null)
  var [restaurantDishes, setRestaurantDishes] = useState([])
  var [restaurantDishesLoading, setRestaurantDishesLoading] = useState(false)
  var [dishFilter, setDishFilter] = useState('')

  var filteredRestaurantDishes = useMemo(function () {
    if (!dishFilter.trim()) return restaurantDishes
    var q = dishFilter.trim().toLowerCase()
    return restaurantDishes.filter(function (d) {
      return (d.dish_name || d.name || '').toLowerCase().includes(q) ||
             (d.category || '').toLowerCase().includes(q)
    })
  }, [restaurantDishes, dishFilter])

  // Track which restaurant ID the current async fetch is for — discard stale
  // responses if the user backs out and selects a different restaurant before
  // the first one resolves.
  var activeRestaurantRef = useRef(null)

  var selectRestaurant = useCallback(function (restaurant) {
    setSelectedRestaurant(restaurant)
    setDishFilter('')
    setRestaurantDishesLoading(true)
    setRestaurantDishes([])
    activeRestaurantRef.current = restaurant.id
    dishesApi.getDishesForRestaurant({ restaurantId: restaurant.id })
      .then(function (dishes) {
        if (activeRestaurantRef.current !== restaurant.id) return // stale
        setRestaurantDishes(dishes || [])
      })
      .catch(function (err) {
        if (activeRestaurantRef.current !== restaurant.id) return
        logger.error('Failed to load restaurant dishes:', err)
        setRestaurantDishes([])
        toast('Failed to load dishes')
      })
      .finally(function () {
        if (activeRestaurantRef.current === restaurant.id) {
          setRestaurantDishesLoading(false)
        }
      })
  }, [])

  // --- Shared add state ---
  var [addedIds, setAddedIds] = useState({})
  var [pendingIds, setPendingIds] = useState({})
  var prevOpen = useRef(false)

  useEffect(function () {
    if (isOpen && !prevOpen.current) {
      setMode('dish')
      setQuery('')
      setSelectedRestaurant(null)
      setRestaurantDishes([])
      setDishFilter('')
      var existing = {}
      if (existingDishIds) {
        for (var i = 0; i < existingDishIds.length; i++) {
          existing[existingDishIds[i]] = true
        }
      }
      setAddedIds(existing)
      setPendingIds({})
      var focusTimer = setTimeout(function () { if (inputRef.current) inputRef.current.focus() }, 100)
      return function () { clearTimeout(focusTimer) }
    }
    prevOpen.current = isOpen
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps -- only seed on open transition, not on existingDishIds rerender

  var handleAdd = useCallback(function (dishId, dishName) {
    if (addedIds[dishId] || pendingIds[dishId]) return
    setPendingIds(function (prev) {
      return { ...prev, [dishId]: true }
    })
    setAddedIds(function (prev) {
      return { ...prev, [dishId]: true }
    })
    addDish.mutateAsync({ playlistId: playlistId, dishId: dishId, note: null })
      .then(function () {
        capture('playlist_dish_added', {
          playlist_id: playlistId,
          dish_id: dishId,
          from_sheet: mode === 'restaurant' ? 'playlist_restaurant_search' : 'playlist_search',
        })
      })
      .catch(function (err) {
        logger.error('Add dish failed:', err)
        toast(err?.message || 'Failed to add ' + (dishName || 'dish'))
        setAddedIds(function (prev) {
          var next = { ...prev }; delete next[dishId]; return next
        })
      })
      .finally(function () {
        setPendingIds(function (prev) {
          var next = { ...prev }; delete next[dishId]; return next
        })
      })
  }, [addedIds, pendingIds, addDish, playlistId, mode])

  var containerRef = useFocusTrap(isOpen, onClose)

  if (!isOpen) return null

  // --- Shared dish row renderer ---
  var renderDishRow = function (dish) {
    var id = dish.dish_id || dish.id
    var name = dish.dish_name || dish.name
    var isAdded = !!addedIds[id]
    return (
      <button
        key={id}
        onClick={function () { handleAdd(id, name) }}
        disabled={isAdded || !!pendingIds[id]}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 20px', width: '100%',
          background: 'transparent', border: 'none',
          borderBottom: '1px solid var(--color-divider)',
          textAlign: 'left', opacity: isAdded ? 0.5 : 1,
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 6,
          background: 'var(--color-category-strip)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0, overflow: 'hidden',
        }}>
          {getCategoryNeonImage(dish.category) ? (
            <img src={getCategoryNeonImage(dish.category)} alt="" style={{ width: '70%', height: '70%', objectFit: 'contain' }} />
          ) : (
            categoryEmojiFor(dish.category)
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{name}</div>
          {dish.restaurant_name && (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {dish.restaurant_name}
              {dish.restaurant_town && <span> &middot; {dish.restaurant_town}</span>}
            </div>
          )}
        </div>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          border: '2px solid ' + (isAdded ? 'var(--color-rating)' : 'var(--color-primary)'),
          background: isAdded ? 'var(--color-rating)' : 'transparent',
          color: isAdded ? '#fff' : 'var(--color-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, flexShrink: 0,
        }}>
          {isAdded ? '\u2713' : '+'}
        </div>
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={function (e) { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={function (e) { if (e.key === 'Escape') onClose() }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add dishes to playlist"
        className="w-full rounded-t-2xl flex flex-col"
        style={{ background: 'var(--color-surface)', height: '85vh' }}
      >
        {/* Grabber */}
        <div style={{ width: 40, height: 4, background: 'var(--color-divider)', borderRadius: 2, margin: '8px auto 0' }} />

        {/* Mode toggle — only when NOT drilled into a restaurant */}
        {!selectedRestaurant && (
          <div className="flex gap-2 px-5 pt-3 pb-2">
            {['dish', 'restaurant'].map(function (m) {
              var active = mode === m
              return (
                <button
                  key={m}
                  onClick={function () { setMode(m); setQuery('') }}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold"
                  style={{
                    background: active ? 'var(--color-primary)' : 'var(--color-surface-elevated)',
                    color: active ? '#fff' : 'var(--color-text-secondary)',
                    border: active ? 'none' : '1px solid var(--color-divider)',
                  }}
                >
                  {m === 'dish' ? 'By Dish' : 'By Restaurant'}
                </button>
              )
            })}
          </div>
        )}

        {/* Restaurant drill-down header */}
        {selectedRestaurant && (
          <div className="flex items-center gap-3 px-5 pt-3 pb-2" style={{ borderBottom: '1px solid var(--color-divider)' }}>
            <button
              onClick={function () { setSelectedRestaurant(null); setRestaurantDishes([]) }}
              style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--color-text-secondary)', padding: 0 }}
              aria-label="Back to restaurant search"
            >
              &larr;
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {selectedRestaurant.name}
              </div>
              {selectedRestaurant.town && (
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  {selectedRestaurant.town}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search input */}
        <div style={{ padding: '8px 20px 8px', borderBottom: selectedRestaurant ? 'none' : '1px solid var(--color-divider)' }}>
          <input
            ref={inputRef}
            type="text"
            value={selectedRestaurant ? dishFilter : query}
            onChange={function (e) {
              if (selectedRestaurant) { setDishFilter(e.target.value) }
              else { setQuery(e.target.value) }
            }}
            placeholder={
              selectedRestaurant ? 'Filter dishes...'
                : mode === 'dish' ? 'Search dishes...'
                : 'Search restaurants...'
            }
            autoComplete="off"
            className="w-full px-4 py-2.5 rounded-xl text-sm"
            style={{
              background: 'var(--color-bg)',
              border: '1.5px solid var(--color-divider)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>

        {/* Results area */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y' }}>

          {/* --- Restaurant drill-down: show dishes --- */}
          {selectedRestaurant ? (
            restaurantDishesLoading ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div className="animate-spin w-5 h-5 border-2 rounded-full mx-auto" style={{ borderColor: 'var(--color-divider)', borderTopColor: 'var(--color-primary)' }} />
              </div>
            ) : filteredRestaurantDishes.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 14 }}>
                {dishFilter ? 'No matching dishes' : 'No dishes found'}
              </div>
            ) : (
              filteredRestaurantDishes.map(renderDishRow)
            )

          /* --- Dish mode --- */
          ) : mode === 'dish' ? (
            dishError ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-danger)', fontSize: 14 }}>
                {dishError.message || 'Could not load dishes.'}
              </div>
            ) : query.trim().length < 2 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 14 }}>
                Type a dish name to search
              </div>
            ) : dishLoading ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div className="animate-spin w-5 h-5 border-2 rounded-full mx-auto" style={{ borderColor: 'var(--color-divider)', borderTopColor: 'var(--color-primary)' }} />
              </div>
            ) : sortedDishResults.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 14 }}>
                No dishes found for &ldquo;{query.trim()}&rdquo;
              </div>
            ) : (
              sortedDishResults.map(renderDishRow)
            )

          /* --- Restaurant mode --- */
          ) : (
            query.trim().length < 2 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 14 }}>
                Type a restaurant name to search
              </div>
            ) : restLoading ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div className="animate-spin w-5 h-5 border-2 rounded-full mx-auto" style={{ borderColor: 'var(--color-divider)', borderTopColor: 'var(--color-primary)' }} />
              </div>
            ) : restResults.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 14 }}>
                No restaurants found for &ldquo;{query.trim()}&rdquo;
              </div>
            ) : (
              restResults.map(function (r) {
                return (
                  <button
                    key={r.id}
                    onClick={function () { selectRestaurant(r) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 20px', width: '100%',
                      background: 'transparent', border: 'none',
                      borderBottom: '1px solid var(--color-divider)',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: 'var(--color-primary)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 700, flexShrink: 0,
                    }}>
                      {(r.name || '?').charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {r.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                        {r.town || r.address || ''}
                      </div>
                    </div>
                    <svg style={{ width: 16, height: 16, color: 'var(--color-text-tertiary)', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )
              })
            )
          )}
        </div>

        {/* Done button */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-divider)' }}>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl font-semibold text-sm"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
