import { useState } from 'react'
import { useDishPlaylistMembership } from '../../hooks/useDishPlaylistMembership'
import { usePlaylistMutations } from '../../hooks/usePlaylistMutations'
import { CreatePlaylistModal } from './CreatePlaylistModal'
import { PlaylistCover } from './PlaylistCover'
import { capture } from '../../lib/analytics'

export function AddToPlaylistSheet({ isOpen, onClose, dishId, dishName, restaurantName }) {
  var { entries, loading } = useDishPlaylistMembership(dishId, isOpen)
  var { addDish, removeDish } = usePlaylistMutations()
  var [createOpen, setCreateOpen] = useState(false)
  // Set of playlist IDs currently mid-mutation — prevents double-tap races.
  var [busyIds, setBusyIds] = useState({})

  // Optimistic local override per CLAUDE.md §1.5: snap the check state
  // immediately; revert on error.
  var [optimistic, setOptimistic] = useState({})
  var isChecked = function (entry) {
    return optimistic[entry.playlist_id] != null ? optimistic[entry.playlist_id] : entry.contains_dish
  }

  var toggle = function (entry) {
    if (busyIds[entry.playlist_id]) return // already in-flight
    var wasChecked = isChecked(entry)
    setBusyIds(function (prev) { return { ...prev, [entry.playlist_id]: true } })
    setOptimistic(function (prev) { return { ...prev, [entry.playlist_id]: !wasChecked } })
    var promise = wasChecked
      ? removeDish.mutateAsync({ playlistId: entry.playlist_id, dishId: dishId })
      : addDish.mutateAsync({ playlistId: entry.playlist_id, dishId: dishId, note: null })

    promise
      .then(function () {
        if (!wasChecked) {
          capture('playlist_dish_added', {
            playlist_id: entry.playlist_id,
            dish_id: dishId,
            from_sheet: 'dish_detail',
          })
        }
        setOptimistic(function (prev) { var n = { ...prev }; delete n[entry.playlist_id]; return n })
      })
      .catch(function () {
        setOptimistic(function (prev) { return { ...prev, [entry.playlist_id]: wasChecked } })
      })
      .finally(function () { setBusyIds(function (prev) { var n = { ...prev }; delete n[entry.playlist_id]; return n }) })
  }

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={function (e) { if (e.target === e.currentTarget) onClose() }}
        onKeyDown={function (e) { if (e.key === 'Escape') onClose() }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add to a playlist"
          className="absolute left-0 right-0 bottom-0 rounded-t-2xl flex flex-col"
          style={{
            background: 'var(--color-surface)',
            maxHeight: '80vh',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {/* Fixed header \u2014 grabber, title, "Create new" \u2014 stays put while the playlist list scrolls. */}
          <div style={{ flex: '0 0 auto' }}>
            {/* Grabber */}
            <div style={{ width: 40, height: 4, background: 'var(--color-divider)', borderRadius: 2, margin: '8px auto 12px' }} />

            {/* Header */}
            <div style={{ padding: '0 20px 12px', borderBottom: '1px solid var(--color-divider)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Add to a playlist
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                {dishName} &middot; {restaurantName}
              </div>
            </div>

            {/* Create new */}
            <button
              onClick={function () { setCreateOpen(true) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 20px',
                color: 'var(--color-primary)',
                fontWeight: 700,
                fontSize: 13,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--color-divider)',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <span style={{
                width: 36, height: 36,
                border: '1.5px dashed var(--color-primary)',
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
              }}>+</span>
              Create new playlist
            </button>
          </div>

          {/* Scrollable body \u2014 only the playlist list scrolls. The previous all-in-one
              overflowY on the dialog container locked up touches in the iOS Capacitor
              WebView; splitting fixed header + dedicated scroll child fixes that. */}
          <div style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
          }}>
            {loading ? (
              <div style={{ padding: 20, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                Loading&hellip;
              </div>
            ) : entries.length === 0 ? (
              <div style={{ padding: 20, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                No playlists yet &mdash; create one above
              </div>
            ) : (
              entries.map(function (e) {
                var checked = isChecked(e)
                return (
                  <button
                    key={e.playlist_id}
                    onClick={function () { toggle(e) }}
                    disabled={!!busyIds[e.playlist_id]}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 20px',
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--color-divider)',
                      textAlign: 'left',
                    }}
                  >
                    <PlaylistCover coverCategories={e.cover_categories || []} size={36} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {e.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                        {e.item_count} {e.item_count === 1 ? 'dish' : 'dishes'}
                      </div>
                    </div>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      border: '2px solid ' + (checked ? 'var(--color-primary)' : 'var(--color-divider)'),
                      background: checked ? 'var(--color-primary)' : 'transparent',
                      color: 'var(--color-text-on-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700,
                    }}>
                      {checked ? '\u2713' : ''}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
      <CreatePlaylistModal
        isOpen={createOpen}
        onClose={function () { setCreateOpen(false) }}
        seedDishId={dishId}
        onCreated={function () { setCreateOpen(false) }}
      />
    </>
  )
}
