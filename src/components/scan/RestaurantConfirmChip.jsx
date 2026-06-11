import { useState } from 'react'
import { useNearbyRestaurant } from '../../hooks/useNearbyRestaurant'
import { useNearbyRestaurants } from '../../hooks/useNearbyRestaurants'
import { useRestaurantSearch } from '../../hooks/useRestaurantSearch'
import { useLocationContext } from '../../context/LocationContext'

export function RestaurantConfirmChip({ confirmed, onConfirm }) {
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  const { nearbyRestaurant, hasRealLocation, isLoading: locating } = useNearbyRestaurant(300)
  const { location } = useLocationContext()
  // Picker is shown when the user taps "change" OR when nothing is nearby to confirm
  const pickerActive = !confirmed && (picking || !nearbyRestaurant)
  const { nearby, loading: nearbyLoading } = useNearbyRestaurants(location?.lat, location?.lng, 1500, pickerActive && hasRealLocation)
  // Only local DB results can anchor a scan (they have a restaurant id);
  // Places-only suggestions are intentionally excluded.
  const { localResults, loading: searchLoading } = useRestaurantSearch(query, location?.lat, location?.lng, pickerActive)

  if (confirmed) {
    return (
      <button onClick={() => { onConfirm(null); setPicking(true) }}
        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
        style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        📍 {confirmed.name} <span style={{ color: 'var(--color-accent-gold)' }}>change</span>
      </button>
    )
  }
  if (!picking && locating) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
        📍 Finding where you are…
      </p>
    )
  }
  if (!picking && nearbyRestaurant) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => onConfirm(nearbyRestaurant)}
          className="px-4 py-2 rounded-full text-sm font-bold"
          style={{ background: 'var(--color-primary)', color: '#fff' }}>
          📍 At {nearbyRestaurant.name}? ✓
        </button>
        <button onClick={() => setPicking(true)} className="text-sm underline" style={{ color: 'var(--color-text-secondary)' }}>
          change
        </button>
      </div>
    )
  }
  const suggestions = (query.trim().length >= 2 ? localResults : nearby).filter(r => r.id)
  return (
    <div className="w-full max-w-sm">
      <input
        className="w-full px-4 py-2.5 rounded-xl text-sm"
        style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-category-strip)' }}
        placeholder="Which restaurant are you at?"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-2 rounded-xl overflow-hidden" style={{ background: 'var(--color-surface-elevated)' }}>
        {(query.trim().length >= 2 ? searchLoading : nearbyLoading) && suggestions.length === 0 && (
          <p className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Searching…</p>
        )}
        {suggestions.slice(0, 6).map(r => (
          <button key={r.id} onClick={() => { onConfirm(r); setPicking(false) }}
            className="w-full text-left px-4 py-3 text-sm font-semibold border-b last:border-0"
            style={{ borderColor: 'var(--color-bg)' }}>
            {r.name}
          </button>
        ))}
      </div>
    </div>
  )
}
