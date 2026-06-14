import { useNavigate } from 'react-router-dom'
import { MIN_VOTES_FOR_RANKING } from '../../constants/app'
import { VerdictChip } from './VerdictChip'

// One printed-menu line: dish name … dotted leader … price · rating.
// Rated dishes get a slightly heavier name; everything stays in menu order.
export function XRayRow({ item, restaurantId }) {
  const navigate = useNavigate()
  const rated = item.match != null && (item.match.totalVotes ?? 0) >= MIN_VOTES_FOR_RANKING
  const handleTap = () => {
    if (item.match) navigate(`/dish/${item.match.dishId}`)
    else navigate(`/restaurants/${restaurantId}/rate`)
  }
  return (
    <button onClick={handleTap} className="w-full flex items-baseline gap-1.5 py-2 text-left">
      <span
        className="truncate"
        style={{ fontSize: '15px', fontWeight: rated ? 700 : 600, color: 'var(--color-text-primary)', flexShrink: 1, minWidth: 0 }}
      >
        {item.name}
      </span>
      {/* dotted leader — one-off decorative menu element */}
      <span className="flex-1" style={{ borderBottom: '1.5px dotted #c9bca3', margin: '0 3px 4px', minWidth: '14px' }} />
      {item.price != null && (
        <span className="text-[13px] flex-shrink-0" style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          ${Number(item.price).toFixed(0)}
        </span>
      )}
      <span className="ml-2 flex-shrink-0">
        <VerdictChip avgRating={item.match?.avgRating ?? null} totalVotes={item.match?.totalVotes ?? 0} />
      </span>
    </button>
  )
}
