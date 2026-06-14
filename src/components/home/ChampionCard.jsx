import { useNavigate } from 'react-router-dom'
import { getRatingColor } from '../../utils/ranking'
import { CategoryIcon } from './CategoryIcons'

/**
 * ChampionCard — the #1 ranked dish on the island.
 * Gold border, big icon, Shantell Sans headline, prominent score.
 */
export function ChampionCard({ dish }) {
  var navigate = useNavigate()
  if (!dish) return null

  var rating = dish.avg_rating
  var votes = dish.total_votes || 0

  return (
    <button
      onClick={function () { navigate('/dish/' + dish.dish_id) }}
      className="w-full text-left active:scale-[0.98] transition-transform"
      style={{
        background: 'linear-gradient(135deg, #FFFDF8 0%, #FFF9EE 100%)',
        borderRadius: '20px',
        padding: '20px',
        position: 'relative',
        overflow: 'hidden',
        border: '3px solid var(--color-medal-gold)',
        boxShadow: '0 8px 32px rgba(196, 138, 18, 0.25), 0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      {/* Subtle gold shimmer top-right */}
      <div style={{
        position: 'absolute',
        top: '-30px',
        right: '-30px',
        width: '120px',
        height: '120px',
        background: 'radial-gradient(circle, rgba(232,184,32,0.10) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* "#1 ON THE ISLAND" banner */}
      <div className="flex items-center gap-2" style={{ marginBottom: '14px' }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '15px',
          fontWeight: 700,
          color: 'var(--color-primary)',
          letterSpacing: '0.04em',
          lineHeight: 1,
        }}>
          #1 Nearby
        </span>
        <div style={{ flex: 1, height: '1.5px', background: 'linear-gradient(to right, var(--color-primary), transparent)', opacity: 0.3 }} />
      </div>

      {/* Icon + Info row */}
      <div className="flex items-center gap-4">
        {/* Big icon — no background */}
        <div className="flex-shrink-0">
          <CategoryIcon categoryId={dish.category} dishName={dish.dish_name || dish.name} size={80} />
        </div>

        {/* Text block */}
        <div className="flex-1 min-w-0">
          {/* Dish name — Shantell Sans, big */}
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            letterSpacing: '0',
            lineHeight: 1.1,
            margin: 0,
          }}>
            {dish.dish_name || dish.name}
          </h2>

          {/* Restaurant */}
          <p style={{
            fontSize: '13px',
            color: 'var(--color-accent-gold)',
            fontWeight: 600,
            marginTop: '3px',
          }}>
            {dish.restaurant_name}
          </p>
        </div>
      </div>

      {/* Score row — big rating + vote count */}
      <div className="flex items-end justify-between" style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1.5px solid var(--color-divider)' }}>
        <div className="flex items-baseline gap-1">
          <span style={{
            fontSize: '36px',
            fontWeight: 800,
            color: getRatingColor(rating),
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}>
            {rating ? Number(rating).toFixed(1) : '—'}
          </span>
          <span style={{ fontSize: '14px', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>/10</span>
        </div>

        <div className="text-right">
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
            {votes} rating{votes === 1 ? '' : 's'}
          </p>
        </div>
      </div>
    </button>
  )
}
