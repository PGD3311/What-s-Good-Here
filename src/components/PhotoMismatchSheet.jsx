import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { dishesApi } from '../api/dishesApi'
import { useFocusTrap } from '../hooks/useFocusTrap'

/**
 * Shown when the upload-time dish check says the photo clearly shows a
 * different kind of food than the dish it's being attached to.
 *
 * It ASKS. It never rejects. The person holding the plate knows better than
 * the model — a fancy plating of the named dish is still that dish.
 *
 * Three exits: keep it on this dish / move it to another dish at the same
 * restaurant / don't add it. Closing the sheet (backdrop, Esc) = don't add.
 */
export function PhotoMismatchSheet({
  pending,
  dishName,
  restaurantId,
  restaurantName,
  busy = false,
  onConfirm,
  onReassign,
  onDiscard,
}) {
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  const modalRef = useFocusTrap(true, onDiscard)

  const { data: menu = [], isLoading: menuLoading } = useQuery({
    queryKey: ['restaurantDishes', restaurantId],
    queryFn: () => dishesApi.getDishesForRestaurant({ restaurantId }),
    enabled: picking && !!restaurantId,
  })

  const choices = useMemo(() => {
    const q = query.trim().toLowerCase()
    return menu
      .filter(d => d.dish_id !== pending.dishId)
      .filter(d => !q || (d.dish_name || '').toLowerCase().includes(q))
      .slice(0, 40)
  }, [menu, query, pending.dishId])

  const seen = pending.mismatch?.seen
  const where = restaurantName ? `${restaurantName}'s` : 'their'

  // Portal to <body>: the button lives inside modals/cards with transforms and
  // overflow clipping, which would trap a position:fixed sheet.
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={busy ? undefined : onDiscard}
      role="presentation"
    >
      <div className="absolute inset-0" style={{ background: 'rgba(0, 0, 0, 0.55)' }} aria-hidden="true" />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-mismatch-title"
        className="relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--color-surface-elevated)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex gap-4 p-6 pb-4">
          <img
            src={pending.publicUrl}
            alt=""
            className="flex-shrink-0 object-cover"
            style={{ width: '84px', height: '84px', borderRadius: '14px', background: 'var(--color-surface)' }}
          />
          <div className="min-w-0">
            <h2
              id="photo-mismatch-title"
              className="font-bold"
              style={{ fontSize: '20px', lineHeight: 1.15, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}
            >
              Is this {dishName}?
            </h2>
            <p className="mt-1.5 text-sm leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
              {seen ? `This looks like ${seen}. ` : ''}It might just be {where} version, so you decide.
            </p>
          </div>
        </div>

        {!picking ? (
          <div className="px-6 pb-6 flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="w-full py-3.5 rounded-xl font-semibold"
              style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)', opacity: busy ? 0.6 : 1 }}
            >
              Yes, add it to {dishName}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPicking(true)}
              className="w-full py-3.5 rounded-xl font-semibold"
              style={{ border: '1.5px solid var(--color-divider)', color: 'var(--color-text-primary)', background: 'transparent' }}
            >
              It's a different dish
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDiscard}
              className="w-full py-2 text-sm font-medium"
              style={{ color: 'var(--color-text-tertiary)', background: 'transparent', border: 'none' }}
            >
              Don't add this photo
            </button>
          </div>
        ) : (
          <div className="px-6 pb-6">
            <label className="block mb-2">
              <span className="sr-only">Search the menu</span>
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${restaurantName || 'the'} menu`}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none focus-ring"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-divider)', color: 'var(--color-text-primary)' }}
              />
            </label>
            <div className="overflow-y-auto" style={{ maxHeight: '40vh' }}>
              {menuLoading ? (
                <p className="py-4 text-sm text-center" style={{ color: 'var(--color-text-tertiary)' }}>Loading the menu…</p>
              ) : choices.length === 0 ? (
                <p className="py-4 text-sm text-center" style={{ color: 'var(--color-text-tertiary)' }}>No dishes match.</p>
              ) : (
                choices.map((d) => (
                  <button
                    key={d.dish_id}
                    type="button"
                    disabled={busy}
                    onClick={() => onReassign(d)}
                    className="w-full text-left py-3 flex items-center justify-between gap-3"
                    style={{ borderBottom: '1px solid var(--color-divider)', background: 'transparent', border: 'none', borderBottomStyle: 'solid', borderBottomWidth: '1px', borderBottomColor: 'var(--color-divider)' }}
                  >
                    <span className="font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{d.dish_name}</span>
                    {d.category && (
                      <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>{d.category}</span>
                    )}
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPicking(false)}
              className="w-full py-2 mt-2 text-sm font-medium"
              style={{ color: 'var(--color-text-tertiary)', background: 'transparent', border: 'none' }}
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
