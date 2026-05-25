import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useDishes } from '../../hooks/useDishes'
import { useLocationContext } from '../../context/LocationContext'
import { useCheckIn } from '../../hooks/useCheckIn'
import { validateUserContent } from '../../lib/reviewBlocklist'

const MAX_NOTE_CHARS = 280

/**
 * CheckInSheet — bottom sheet for submitting a check-in.
 *
 * One sheet, two `mode`s:
 *   - 'live'   — server verifies GPS proximity. visited_at = NOW().
 *   - 'logged' — user picks a past date. No GPS required.
 *
 * Optional: note (≤280 chars) + dish tagging (multi-select from the
 * restaurant's menu). Submit calls useCheckIn which dedups + invalidates
 * cache. Errors surface as toast — the sheet stays open so the user can
 * adjust and retry without losing draft state.
 *
 * Mirrors DietSheet's structural shape (grabber → header → scrollable body
 * → sticky footer) so the two bottom sheets feel cousin-shaped.
 */
export function CheckInSheet({ open, restaurant, mode = 'live', onClose }) {
  const navigate = useNavigate()
  const { location } = useLocationContext()
  const containerRef = useFocusTrap(open, onClose)

  const [note, setNote] = useState('')
  const [visitedDate, setVisitedDate] = useState(todayIso())
  // Track explicit user edits to visitedDate so we can re-evaluate
  // "today" at submit time if the user opened the sheet before
  // midnight and submitted after.
  const [visitedDateTouched, setVisitedDateTouched] = useState(false)
  const [selectedDishIds, setSelectedDishIds] = useState([])

  // Pull this restaurant's dish list for the optional dish tagger. Skipped
  // when the sheet isn't open — useDishes runs as soon as it's enabled.
  const { dishes } = useDishes(null, null, null, open ? restaurant?.id : null, null)

  const { submitCheckIn, submitting } = useCheckIn()

  useEffect(function () {
    if (open) {
      setNote('')
      setVisitedDate(todayIso())
      setVisitedDateTouched(false)
      setSelectedDishIds([])
    }
  }, [open])

  if (!open) return null

  function toggleDish(dishId) {
    setSelectedDishIds(function (prev) {
      return prev.indexOf(dishId) === -1
        ? prev.concat([dishId])
        : prev.filter(function (id) { return id !== dishId })
    })
  }

  // Disable submit when the prerequisites for the selected mode aren't met,
  // so the failure mode is a greyed button instead of a post-tap toast.
  const noteValidationError = validateUserContent(note, 'Note')
  const canSubmit = !submitting && !noteValidationError && (mode !== 'live' || !!location)

  async function handleSubmit() {
    // Re-validate at submit (cheap defense against pasted-then-disabled UI).
    if (noteValidationError) {
      toast.error(noteValidationError)
      return
    }

    const params = {
      restaurantId: restaurant.id,
      kind: mode,
      note: note.trim() || null,
      dishIds: selectedDishIds.length > 0 ? selectedDishIds : null,
    }

    if (mode === 'live') {
      if (!location) {
        toast.error('Need your location for a live check-in.')
        return
      }
      params.lat = location.lat
      params.lng = location.lng
    } else {
      // If the user opened the sheet before midnight and submitted after,
      // and never touched the date field, re-snap to "today" at submit.
      const effectiveDate = visitedDateTouched ? visitedDate : todayIso()
      params.visitedAt = new Date(effectiveDate + 'T12:00:00').toISOString()
    }

    const result = await submitCheckIn(params)
    if (result.success) {
      const baseMessage = mode === 'live' ? 'Checked in!' : 'Visit logged.'

      // Rate-nudge (cheap v1): when the user tagged at least one dish,
      // surface a "Rate it →" action on the success toast so they can
      // close the loop while the memory's fresh. Routes to the first
      // tagged dish — the dish page has the existing rate UI plus links
      // back to others at this restaurant if they want more.
      //
      // Locked design decision #4 calls for a richer 24h-persistent
      // cold-open banner ("rate the burger from Atria yesterday") plus a
      // Journal "Pending" shelf — both ship in v2. This is the toast-only
      // shortcut: ephemeral, fires once, no "once per check-in" memory.
      //
      // We don't pre-check "have they already rated this" — if they have,
      // the dish page just shows their existing rating, no harm done.
      if (selectedDishIds.length > 0) {
        const firstDishId = selectedDishIds[0]
        toast.success(baseMessage, {
          action: {
            label: 'Rate it →',
            onClick: function () {
              toast.dismiss()
              navigate('/dish/' + firstDishId)
            },
          },
          duration: 8000,
        })
      } else {
        toast.success(baseMessage)
      }
      onClose()
    } else {
      toast.error(result.error || 'Could not submit check-in.')
    }
  }

  const heading = mode === 'live' ? 'Check in' : "I've been here"
  const subhead = mode === 'live'
    ? "We'll verify you're within range of " + restaurant.name + '.'
    : 'When were you at ' + restaurant.name + '?'

  return (
    <div
      className="fixed inset-0 z-[60]"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={function (e) { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="absolute left-0 right-0 bottom-0 flex flex-col"
        style={{
          background: 'var(--color-surface-elevated)',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          maxHeight: '85vh',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
        }}
      >
        {/* Grabber */}
        <div
          aria-hidden="true"
          style={{
            width: 40, height: 4, background: 'var(--color-divider)',
            borderRadius: 2, margin: '8px auto 16px', flex: '0 0 auto',
          }}
        />

        {/* Header */}
        <div style={{ padding: '0 24px 12px', flex: '0 0 auto' }}>
          <h2 style={{
            fontFamily: "'Amatic SC', cursive",
            fontWeight: 700,
            fontSize: '38px',
            lineHeight: 1,
            color: 'var(--color-text-primary)',
            margin: 0,
            letterSpacing: '0.01em',
          }}>{heading}</h2>
          <div aria-hidden="true" style={{
            width: 44, height: 2, background: 'var(--color-primary)',
            marginTop: 10, borderRadius: 1,
          }} />
          <p style={{
            marginTop: '14px', marginBottom: 0,
            fontFamily: 'Outfit, sans-serif', fontSize: '14px',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.4,
          }}>{subhead}</p>
        </div>

        {/* Body */}
        <div style={{
          flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
          WebkitOverflowScrolling: 'touch', padding: '12px 24px 20px',
        }}>
          {mode === 'logged' && (
            <label style={{ display: 'block', marginBottom: '16px' }}>
              <span style={labelStyle}>Date</span>
              <input
                type="date"
                value={visitedDate}
                max={todayIso()}
                onChange={function (e) {
                  setVisitedDate(e.target.value)
                  setVisitedDateTouched(true)
                }}
                style={inputStyle}
              />
            </label>
          )}

          {mode === 'live' && !location && (
            <p style={{
              marginBottom: '14px',
              fontFamily: 'Outfit, sans-serif',
              fontSize: '13px',
              color: 'var(--color-danger)',
              fontStyle: 'italic',
            }}>
              Enable location to confirm you're here.
            </p>
          )}

          <label style={{ display: 'block', marginBottom: '16px' }}>
            <span style={labelStyle}>Note (optional)</span>
            <textarea
              value={note}
              onChange={function (e) { setNote(e.target.value.slice(0, MAX_NOTE_CHARS)) }}
              placeholder="What did you have? How was it?"
              rows={3}
              style={Object.assign({}, inputStyle, { resize: 'vertical', minHeight: '64px' })}
            />
            <span style={{
              display: 'block', textAlign: 'right',
              fontSize: '12px', color: 'var(--color-text-tertiary)',
              marginTop: '4px',
              fontFamily: 'Outfit, sans-serif',
            }}>
              {note.length}/{MAX_NOTE_CHARS}
            </span>
          </label>

          {dishes && dishes.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <span style={labelStyle}>Tag dishes (optional)</span>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '8px',
                marginTop: '6px',
              }}>
                {dishes.slice(0, 20).map(function (dish) {
                  const isOn = selectedDishIds.indexOf(dish.dish_id || dish.id) !== -1
                  const dishId = dish.dish_id || dish.id
                  return (
                    <button
                      key={dishId}
                      type="button"
                      onClick={function () { toggleDish(dishId) }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '999px',
                        background: isOn ? 'var(--color-primary-muted)' : 'var(--color-surface-elevated)',
                        border: isOn
                          ? '1.5px solid var(--color-primary)'
                          : '1.5px solid var(--color-divider)',
                        color: isOn ? 'var(--color-primary)' : 'var(--color-text-primary)',
                        fontFamily: 'Outfit, sans-serif',
                        fontWeight: isOn ? 700 : 500,
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      {dish.dish_name || dish.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          flex: '0 0 auto', padding: '14px 24px 20px',
          borderTop: '1px solid var(--color-divider)',
          display: 'flex', gap: '12px',
          background: 'var(--color-surface-elevated)',
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              flex: '1 1 auto', minHeight: '48px',
              background: 'transparent',
              border: '1.5px solid var(--color-divider)',
              borderRadius: '12px',
              color: 'var(--color-text-secondary)',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700, fontSize: '15px',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              flex: '2 1 auto', minHeight: '48px',
              background: 'var(--color-primary)',
              border: '1.5px solid var(--color-primary)',
              borderRadius: '12px',
              color: 'var(--color-text-on-primary, #FFFFFF)',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700, fontSize: '15px',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.5,
            }}
          >
            {submitting ? 'Saving…' : mode === 'live' ? 'Check in' : 'Log visit'}
          </button>
        </div>
      </div>
    </div>
  )
}

function todayIso() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return yyyy + '-' + mm + '-' + dd
}

const labelStyle = {
  display: 'block',
  fontFamily: 'Outfit, sans-serif',
  fontWeight: 600,
  fontSize: '13px',
  color: 'var(--color-text-secondary)',
  letterSpacing: '0.02em',
  marginBottom: '6px',
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1.5px solid var(--color-divider)',
  background: 'var(--color-surface)',
  color: 'var(--color-text-primary)',
  fontFamily: 'Outfit, sans-serif',
  fontSize: '15px',
  outline: 'none',
}
