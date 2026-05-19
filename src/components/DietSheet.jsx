import { useEffect, useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'

/**
 * DietSheet — bottom-sheet multi-select for dietary preferences.
 *
 * Editorial-leaning preferences screen, not a filter dropdown:
 *   - Amatic SC header "Dietary preferences" with thin coral hairline
 *   - 2-column tile grid; selected = coral border + faint coral wash
 *   - Inline "All selected restrictions must apply" helper (italic, AND-semantics cue)
 *   - Disclaimer block at the bottom: info-icon prefix + tertiary text
 *   - Sticky footer with Reset (ghost) + Apply (coral)
 *
 * Selection state is local to the sheet — `Apply` commits the current set
 * via `onApply` then closes. `Reset` clears local state but does not
 * commit until Apply. Backdrop tap, Escape key, and Close button all
 * dismiss without committing (parent state unchanged).
 */
export function DietSheet({
  open,
  initial = [],
  allowed = [],
  labels = {},
  disclaimer = '',
  onApply,
  onClose,
}) {
  var [selected, setSelected] = useState(initial)

  // Resync local selection whenever the sheet opens or initial prop changes
  // — without this, a re-open after URL-change keeps stale local state.
  useEffect(function () {
    if (open) setSelected(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(initial)])

  var containerRef = useFocusTrap(open, onClose)

  if (!open) return null

  function toggle(tag) {
    setSelected(function (prev) {
      return prev.indexOf(tag) === -1 ? prev.concat([tag]) : prev.filter(function (t) { return t !== tag })
    })
  }

  function handleReset() {
    setSelected([])
  }

  function handleApply() {
    if (typeof onApply === 'function') onApply(selected)
    if (typeof onClose === 'function') onClose()
  }

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
        aria-label="Dietary preferences"
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
            width: 40,
            height: 4,
            background: 'var(--color-divider)',
            borderRadius: 2,
            margin: '8px auto 16px',
            flex: '0 0 auto',
          }}
        />

        {/* Header */}
        <div
          style={{
            padding: '0 24px 16px',
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "'Amatic SC', cursive",
                fontWeight: 700,
                fontSize: '38px',
                lineHeight: 1,
                color: 'var(--color-text-primary)',
                margin: 0,
                letterSpacing: '0.01em',
              }}
            >
              Dietary preferences
            </h2>
            <div
              aria-hidden="true"
              style={{
                width: 44,
                height: 2,
                background: 'var(--color-primary)',
                marginTop: 10,
                borderRadius: 1,
              }}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dietary preferences"
            style={{
              flex: '0 0 auto',
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-divider)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              marginTop: '2px',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>

        {/* Body — scrolls if tile grid grows */}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: '4px 24px 20px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '10px',
            }}
          >
            {allowed.map(function (tag) {
              var isOn = selected.indexOf(tag) !== -1
              var label = labels[tag] || tag
              return (
                <button
                  key={tag}
                  type="button"
                  role="checkbox"
                  aria-checked={isOn}
                  aria-label={label}
                  onClick={function () { toggle(tag) }}
                  style={{
                    appearance: 'none',
                    position: 'relative',
                    padding: '16px 18px',
                    minHeight: '56px',
                    textAlign: 'left',
                    background: isOn ? 'var(--color-primary-muted)' : 'var(--color-surface-elevated)',
                    border: isOn
                      ? '1.5px solid var(--color-primary)'
                      : '1.5px solid var(--color-divider)',
                    borderRadius: '12px',
                    color: isOn ? 'var(--color-primary)' : 'var(--color-text-primary)',
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: isOn ? 700 : 600,
                    fontSize: '15px',
                    letterSpacing: '0.01em',
                    cursor: 'pointer',
                    transition: 'background 150ms, border-color 150ms, color 150ms',
                  }}
                >
                  {label}
                  {isOn && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '12px',
                        width: 18,
                        height: 18,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        background: 'var(--color-primary)',
                        color: '#FFFFFF',
                        fontSize: '11px',
                        fontWeight: 700,
                        lineHeight: 1,
                      }}
                    >
                      ✓
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* AND-semantics helper */}
          <p
            style={{
              marginTop: '14px',
              marginBottom: 0,
              fontFamily: 'Outfit, sans-serif',
              fontStyle: 'italic',
              fontSize: '13px',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.4,
            }}
          >
            All selected restrictions must apply.
          </p>

          {/* Disclaimer */}
          {disclaimer ? (
            <div
              style={{
                marginTop: '18px',
                padding: '12px 14px',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-divider)',
                borderRadius: '10px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  width: 18,
                  height: 18,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  border: '1.5px solid var(--color-text-tertiary)',
                  color: 'var(--color-text-tertiary)',
                  fontSize: '11px',
                  fontWeight: 700,
                  fontFamily: 'Outfit, sans-serif',
                  lineHeight: 1,
                  marginTop: '1px',
                }}
              >
                i
              </span>
              <p
                style={{
                  margin: 0,
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: '12px',
                  lineHeight: 1.45,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {disclaimer}
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer — Reset (ghost) + Apply (primary) */}
        <div
          style={{
            flex: '0 0 auto',
            padding: '14px 24px 20px',
            borderTop: '1px solid var(--color-divider)',
            display: 'flex',
            gap: '12px',
            background: 'var(--color-surface-elevated)',
          }}
        >
          <button
            type="button"
            onClick={handleReset}
            style={{
              flex: '1 1 auto',
              minHeight: '48px',
              background: 'transparent',
              border: '1.5px solid var(--color-divider)',
              borderRadius: '12px',
              color: 'var(--color-text-secondary)',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700,
              fontSize: '15px',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleApply}
            style={{
              flex: '2 1 auto',
              minHeight: '48px',
              background: 'var(--color-primary)',
              border: '1.5px solid var(--color-primary)',
              borderRadius: '12px',
              color: '#FFFFFF',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700,
              fontSize: '15px',
              cursor: 'pointer',
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
