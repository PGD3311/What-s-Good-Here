import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CategoryIcon } from '../home/CategoryIcons'
import { TrustBadge } from '../jitter'
import { MIN_VOTES_FOR_RANKING } from '../../constants/app'
import { getRatingColor, formatScore10 } from '../../utils/ranking'

/**
 * Dish hero section: photo, name, restaurant, price, score, jitter trust.
 * The "2-second verdict" a tourist needs.
 */
export function DishHero({ dish, allPhotos, isVariant, parentDish }) {
  const navigate = useNavigate()
  const isRanked = dish.total_votes >= MIN_VOTES_FOR_RANKING
  const [showIngredients, setShowIngredients] = useState(false)
  const hasDescription = typeof dish.description === 'string' && dish.description.trim().length > 0

  var heroPhoto = allPhotos.length > 0 ? allPhotos[0].photo_url : (dish.photo_url || null)

  return (
    <>
      {/* Hero photo */}
      {heroPhoto && (
        <div className="relative" style={{ height: '220px', overflow: 'hidden' }}>
          <img
            src={heroPhoto}
            alt={dish.dish_name}
            className="w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.5))' }}
          />
        </div>
      )}

      {/* Verdict Card */}
      <div
        className="mx-3 rounded-xl px-4 py-4"
        style={{
          background: 'var(--color-card)',
          border: '1.5px solid var(--color-divider)',
          marginTop: heroPhoto ? '-24px' : '8px',
          position: 'relative',
          zIndex: 5,
        }}
      >
        {/* Variant breadcrumb */}
        {isVariant && parentDish && (
          <button
            onClick={() => navigate('/dish/' + parentDish.id)}
            className="flex items-center gap-1 text-xs font-bold mb-3"
            style={{ color: 'var(--color-primary)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {parentDish.name}
          </button>
        )}

        {/* Name + Icon + Price */}
        <div className="flex items-center gap-2">
          {!allPhotos.length && !dish.photo_url && (
            <div className="flex-shrink-0">
              <CategoryIcon categoryId={dish.category} dishName={dish.dish_name} size={88} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1
              style={{
                fontFamily: "'Amatic SC', cursive",
                fontWeight: 700,
                fontSize: '28px',
                letterSpacing: '0.02em',
                color: 'var(--color-text-primary)',
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              {dish.dish_name}
            </h1>
            <div className="flex items-center justify-between" style={{ marginTop: '2px' }}>
              <button
                onClick={() => navigate('/restaurants/' + dish.restaurant_id)}
                className="flex items-center gap-1"
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--color-accent-gold)',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                {dish.restaurant_name}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                {dish.restaurant_town && (
                  <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500, marginLeft: '4px' }}>
                    {dish.restaurant_town}
                  </span>
                )}
              </button>
              {dish.price ? (
                <span className="flex-shrink-0" style={{ color: 'var(--color-text-primary)', fontSize: '28px', fontWeight: 800, letterSpacing: '-0.02em' }}>
                  ${Number(dish.price).toFixed(0)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Ingredients drop-down — small "ingredients ▾" link between the
            title/restaurant block and the rating block. Tap reveals the
            terse Sonnet-extracted ingredient line; closed by default so
            the "2-second verdict" stays clean. Hidden entirely when the
            dish has no description. */}
        {hasDescription ? (
          <div style={{ marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setShowIngredients(v => !v)}
              aria-expanded={showIngredients}
              aria-controls={'hero-dish-desc-' + dish.dish_id}
              data-testid="hero-ingredients-toggle"
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontFamily: 'Outfit, sans-serif',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--color-primary)',
                letterSpacing: '0.04em',
                textTransform: 'lowercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              ingredients
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  transform: showIngredients ? 'rotate(180deg)' : 'none',
                  transition: 'transform 150ms ease',
                  fontSize: '9px',
                  lineHeight: 1,
                }}
              >
                ▾
              </span>
            </button>
            {showIngredients ? (
              <p
                id={'hero-dish-desc-' + dish.dish_id}
                data-testid="hero-dish-description"
                style={{
                  margin: '6px 0 0',
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: '14px',
                  fontWeight: 500,
                  lineHeight: 1.45,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '0.005em',
                }}
              >
                {dish.description.trim()}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Score Block */}
        {isRanked && dish.avg_rating ? (
          <div className="flex items-end justify-between mt-4 pt-3" style={{ borderTop: '1px solid var(--color-divider)' }}>
            <div className="flex items-baseline gap-2">
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '44px',
                  lineHeight: 1,
                  color: getRatingColor(dish.avg_rating),
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatScore10(dish.avg_rating)}
              </span>
            </div>
            <div className="text-right" style={{ minWidth: '120px' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                {dish.total_votes} rating{dish.total_votes === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        ) : dish.total_votes > 0 ? (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-divider)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
              {dish.total_votes} vote{dish.total_votes === 1 ? '' : 's'} — needs {MIN_VOTES_FOR_RANKING - dish.total_votes} more to rank
            </p>
          </div>
        ) : null}

        {/* Jitter trust line */}
        {dish.total_votes > 0 && (
          <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--color-divider)' }}>
            <div className="flex items-center gap-2">
              <TrustBadge type="human_verified" size="sm" />
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                Ratings verified by Jitter
              </span>
            </div>
            <Link
              to="/jitter"
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--color-primary)',
              }}
            >
              What's this?
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
