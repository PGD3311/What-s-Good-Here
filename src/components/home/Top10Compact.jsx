import { useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MIN_VOTES_FOR_RANKING } from '../../constants/app'
import { getRatingColor } from '../../utils/ranking'

/**
 * Top10Compact - Collapsible top 10 list for the homepage
 *
 * Shows top 3 by default, expands to show all 10.
 * Supports MV vs Personal toggle for logged-in users with preferences.
 */
export function Top10Compact({
  dishes,
  personalDishes,
  showToggle = false,
  initialCount = 3,
  town,
}) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('mv')
  const [expanded, setExpanded] = useState(false)
  const [prevExpanded, setPrevExpanded] = useState(false)

  const activeDishes = activeTab === 'personal' && showToggle
    ? personalDishes
    : dishes

  const displayedDishes = expanded
    ? activeDishes
    : activeDishes.slice(0, initialCount)

  const hasMore = activeDishes.length > initialCount
  const justExpanded = expanded && !prevExpanded

  if (!dishes?.length) return null

  return (
    <section>
      {/* Micro-headline */}
      <p
        className="font-bold mb-1"
        style={{ color: 'var(--color-accent-gold)', fontSize: '13px' }}
      >
        {town ? `The best dishes in ${town} right now` : 'The best dishes on the Vineyard right now'}
      </p>

      {/* Header */}
      {showToggle ? (
        <div role="tablist" aria-label="Top 10 list filter" className="flex gap-2 mb-4">
          <button
            role="tab"
            aria-selected={activeTab === 'mv'}
            onClick={() => { setActiveTab('mv'); setExpanded(false) }}
            className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: activeTab === 'mv' ? 'var(--color-primary)' : 'var(--color-surface-elevated)',
              color: activeTab === 'mv' ? 'white' : 'var(--color-text-secondary)',
            }}
          >
            {town || 'MV'} Top 10
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'personal'}
            onClick={() => { setActiveTab('personal'); setExpanded(false) }}
            className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: activeTab === 'personal' ? 'var(--color-accent-gold)' : 'var(--color-surface-elevated)',
              color: activeTab === 'personal' ? 'var(--color-text-on-primary)' : 'var(--color-text-secondary)',
            }}
          >
            My Top 10
          </button>
        </div>
      ) : (
        <h3
          className="font-bold mb-4"
          style={{
            color: 'var(--color-text-primary)',
            fontSize: '15px',
            letterSpacing: '-0.01em',
          }}
        >
          Top 10 {town ? `in ${town}` : 'on the Island'}
        </h3>
      )}

      {/* Dishes list */}
      <div className="space-y-0.5">
        {displayedDishes.length > 0 ? (
          displayedDishes.map((dish, index) => (
            <Top10Row
              key={dish.dish_id}
              dish={dish}
              rank={index + 1}
              isNewlyRevealed={justExpanded && index >= initialCount}
              revealIndex={index - initialCount}
              onClick={() => navigate(`/dish/${dish.dish_id}`)}
            />
          ))
        ) : (
          <div className="text-center py-6">
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              No dishes found in your categories yet
            </p>
            <button
              onClick={() => navigate('/profile')}
              className="mt-2 text-xs font-medium"
              style={{ color: 'var(--color-primary)' }}
            >
              Edit favorites
            </button>
          </div>
        )}
      </div>

      {/* Expand/collapse */}
      {hasMore && displayedDishes.length > 0 && (
        <button
          onClick={() => { setPrevExpanded(expanded); setExpanded(!expanded) }}
          className="w-full mt-3 pt-3 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {expanded ? 'Show less' : `Show all ${activeDishes.length}`}
        </button>
      )}
    </section>
  )
}

// Compact row for Top 10 list
const Top10Row = memo(function Top10Row({ dish, rank, isNewlyRevealed, revealIndex, onClick }) {
  const { dish_name, restaurant_name, avg_rating, total_votes } = dish
  const isRanked = (total_votes || 0) >= MIN_VOTES_FOR_RANKING

  const accessibleLabel = isRanked
    ? `Rank ${rank}: ${dish_name} at ${restaurant_name}, rated ${avg_rating} out of 10 with ${total_votes} votes`
    : `Rank ${rank}: ${dish_name} at ${restaurant_name}, ${total_votes ? `${total_votes} vote${total_votes === 1 ? '' : 's'}` : 'new dish'}`

  return (
    <div
      className={isNewlyRevealed ? 'animate-expand-in' : ''}
      style={isNewlyRevealed ? { animationDelay: `${(revealIndex || 0) * 50}ms`, opacity: 0, animationFillMode: 'forwards' } : undefined}
    >
      <button
        onClick={onClick}
        aria-label={accessibleLabel}
        className="w-full flex items-center gap-3 py-2.5 px-2 rounded-lg transition-colors text-left hover:bg-[var(--color-surface-elevated)]"
      >
        {/* Rank number — typography only */}
        <span
          className="w-6 text-center text-sm font-bold flex-shrink-0"
          style={{
            color: rank <= 3 ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
          }}
        >
          {rank}
        </span>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
            {dish_name}
          </p>
          <p className="text-xs truncate" style={{ color: 'var(--color-text-tertiary)' }}>
            {restaurant_name}
          </p>
        </div>

        {/* Rating */}
        <div className="flex-shrink-0 text-right">
          {isRanked ? (
            <span className="text-sm font-bold" style={{ color: getRatingColor(avg_rating) }}>
              {avg_rating}
            </span>
          ) : (
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {total_votes ? `${total_votes} vote${total_votes === 1 ? '' : 's'}` : 'New'}
            </span>
          )}
        </div>
      </button>
    </div>
  )
})
