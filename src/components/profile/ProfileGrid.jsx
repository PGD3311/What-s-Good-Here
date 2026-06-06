import { useState, useEffect } from 'react'
import { DishListItem } from '../DishListItem'

var PAGE_SIZE = 30

/**
 * ProfileGrid — Instagram-style grid of a user's rated dishes (their food story).
 *
 * Props:
 *   ratings       - snake_case dish array ({ dish_id, dish_name, restaurant_name,
 *                   rating_10, review_text, voted_at })
 *   photoMap      - { [dishId]: ownPhotoUrl } — overrides each tile's photo with
 *                   the PROFILE USER's own photo (null -> typographic tile)
 *   loading       - show skeletons
 *   resetKey      - changing this value resets pagination to the first page (pass the profile userId)
 *   emptyTitle    - empty-state heading
 *   emptySubtitle - empty-state subtext
 */
export function ProfileGrid({ ratings = [], photoMap = {}, loading, resetKey, emptyTitle = 'No dishes yet', emptySubtitle = 'Start rating to build your food story' }) {
  var [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(function () { setVisibleCount(PAGE_SIZE) }, [resetKey, ratings.length])

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-[3px] p-[3px]">
        {[0, 1, 2, 3, 4, 5].map(function (i) {
          return (
            <div
              key={i}
              data-testid="grid-skeleton"
              className="animate-pulse"
              style={{ aspectRatio: '1 / 1', borderRadius: '4px', background: 'var(--color-surface-elevated)' }}
            />
          )
        })}
      </div>
    )
  }

  // Rated-only, newest-first. slice().sort — NOT toSorted (CLAUDE.md 1.1).
  var entries = (ratings || [])
    .filter(function (d) { return d && d.rating_10 != null })
    .slice()
    .sort(function (a, b) { return new Date(b.voted_at || 0) - new Date(a.voted_at || 0) })

  if (entries.length === 0) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border p-8 text-center" style={{ background: 'var(--color-card)', borderColor: 'var(--color-divider)' }}>
          <p className="font-semibold" style={{ color: 'var(--color-text-secondary)', fontSize: '15px' }}>{emptyTitle}</p>
          <p className="mt-1" style={{ color: 'var(--color-text-tertiary)', fontSize: '13px' }}>{emptySubtitle}</p>
        </div>
      </div>
    )
  }

  var visible = entries.slice(0, visibleCount)
  var hasMore = entries.length > visibleCount

  return (
    <div className="p-[3px]">
      <div className="grid grid-cols-3 gap-[3px]">
        {visible.map(function (dish) {
          var ownPhoto = photoMap[dish.dish_id] || null
          var tileDish = { ...dish, photo_url: ownPhoto }
          return (
            <DishListItem key={dish.dish_id} dish={tileDish} variant="grid" />
          )
        })}
      </div>
      {hasMore && (
        <button
          onClick={function () { setVisibleCount(visibleCount + PAGE_SIZE) }}
          className="w-full py-3 rounded-xl font-semibold text-center active:scale-[0.98] mt-3"
          style={{ fontSize: '14px', color: 'var(--color-accent-gold)', background: 'var(--color-card)', border: '1.5px solid var(--color-divider)' }}
        >
          Show more
        </button>
      )}
    </div>
  )
}
