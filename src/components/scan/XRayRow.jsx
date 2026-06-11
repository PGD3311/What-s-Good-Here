import { useNavigate } from 'react-router-dom'
import { VerdictChip } from './VerdictChip'

export function XRayRow({ item, restaurantId, isBest, index }) {
  const navigate = useNavigate()
  const handleTap = () => {
    if (item.match) navigate(`/dish/${item.match.dishId}`)
    else navigate(`/restaurants/${restaurantId}/rate`)
  }
  return (
    <button
      onClick={handleTap}
      className="w-full flex items-center justify-between gap-3 py-2.5 text-left"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-[15px]" style={{ color: 'var(--color-text-primary)' }}>
          {isBest && <span style={{ color: 'var(--color-medal-gold)' }}>★ </span>}
          {item.name}
        </span>
        {item.price != null && (
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>${Number(item.price).toFixed(0)}</span>
        )}
      </span>
      <VerdictChip
        avgRating={item.match?.avgRating ?? null}
        totalVotes={item.match?.totalVotes ?? 0}
      />
    </button>
  )
}
