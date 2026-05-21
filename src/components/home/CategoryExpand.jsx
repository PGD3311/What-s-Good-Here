import { useState } from 'react'
import { useDishes } from '../../hooks/useDishes'
import { useLocationContext } from '../../context/LocationContext'
import { DishListItem } from '../DishListItem'
import { BROWSE_CATEGORIES } from '../../constants/categories'

/**
 * CategoryExpand — inline ranked list for a selected category.
 * Shows 10 initially, "Show more" expands all. No page navigation.
 */
export function CategoryExpand({ categoryId, onClose }) {
  var { location, radius } = useLocationContext()
  var [showAll, setShowAll] = useState(false)

  var categoryLabel = ''
  for (var i = 0; i < BROWSE_CATEGORIES.length; i++) {
    if (BROWSE_CATEGORIES[i].id === categoryId) {
      categoryLabel = BROWSE_CATEGORIES[i].label
      break
    }
  }

  var { dishes, loading } = useDishes(location, radius, categoryId, null, null)

  var allDishes = dishes || []
  // Split ranked (has votes) from unranked (0 votes). Ranked dishes take priority;
  // unranked surface in a separate "New on the menu" section so they're discoverable
  // for voting without competing with established top picks.
  var ranked = []
  var unranked = []
  for (var j = 0; j < allDishes.length; j++) {
    if (allDishes[j].total_votes && Number(allDishes[j].total_votes) > 0) {
      ranked.push(allDishes[j])
    } else {
      unranked.push(allDishes[j])
    }
  }
  var rankedDisplayed = showAll ? ranked : ranked.slice(0, 10)
  var hasMoreRanked = ranked.length > 10 && !showAll
  // Unranked dishes are NEVER hidden — discoverability beats neatness here. A user
  // can't vote on a dish they can't find, so the whole list is rendered.
  var unrankedDisplayed = unranked

  return (
    <div
      style={{
        overflow: 'hidden',
        transition: 'max-height 0.4s ease, opacity 0.3s ease',
        // No fixed cap — content drives height. 100000px is a safe upper bound for
        // categories with 150+ unranked dishes (cocktails has ~150 today).
        maxHeight: '100000px',
        opacity: 1,
      }}
    >
      <div className="px-3">
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '6px 0 6px' }}>
          <h3 style={{
            fontFamily: "'Amatic SC', cursive",
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--color-primary)',
            lineHeight: 1,
          }}>
            Top {categoryLabel}
          </h3>
          <button
            onClick={onClose}
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--color-text-tertiary)',
              padding: '4px 10px',
              borderRadius: '8px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-divider)',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="py-6 text-center">
            <div className="animate-spin w-5 h-5 border-2 rounded-full mx-auto" style={{ borderColor: 'var(--color-divider)', borderTopColor: 'var(--color-primary)' }} />
          </div>
        )}

        {/* Ranked dishes (have votes) */}
        {!loading && rankedDisplayed.length > 0 && (
          <div>
            {rankedDisplayed.map(function (dish, idx) {
              return (
                <DishListItem
                  key={dish.dish_id}
                  dish={dish}
                  rank={idx + 1}
                  showDistance
                  isLast={idx === rankedDisplayed.length - 1 && !hasMoreRanked}
                />
              )
            })}
          </div>
        )}

        {/* Show more ranked — only when there are ranked dishes hidden */}
        {!loading && hasMoreRanked && (
          <button
            onClick={function () { setShowAll(true) }}
            className="w-full py-3 mt-1 mb-2 text-center font-bold text-sm active:scale-[0.98] transition-transform"
            style={{
              color: 'var(--color-primary)',
              background: 'var(--color-primary-muted)',
              borderRadius: '12px',
            }}
          >
            Show all {ranked.length} {categoryLabel} &rsaquo;
          </button>
        )}

        {/* New on the menu — unranked dishes that need votes to climb the ranking */}
        {!loading && unrankedDisplayed.length > 0 && (
          <div className="mt-4">
            <p style={{
              fontFamily: "'Amatic SC', cursive",
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--color-text-secondary)',
              margin: '0 0 4px',
              lineHeight: 1,
            }}>
              New on the menu
            </p>
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
              Just added — help us rank these
            </p>
            <div>
              {unrankedDisplayed.map(function (dish, idx) {
                return (
                  <DishListItem
                    key={dish.dish_id}
                    dish={dish}
                    showDistance
                    isLast={idx === unrankedDisplayed.length - 1}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* Empty state — only when there are NO dishes at all */}
        {!loading && allDishes.length === 0 && (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            No {categoryLabel.toLowerCase()} rated yet
          </p>
        )}
      </div>
    </div>
  )
}
