/**
 * DietButton — homepage dietary-filter trigger.
 *
 * Sibling of the homepage search bar. Renders one of three states based on
 * the `selected` array length so a user can see at a glance whether the
 * feed is filtered:
 *
 *   []                   → "Diet · Off"        (tertiary text, neutral pill)
 *   ['vegan']            → "Diet · Vegan"      (primary text, coral wash)
 *   ['vegan', 'gluten_free'] → "Diet · 2 selected" (primary text, coral wash)
 *
 * Tap → calls `onOpen()` so the parent can mount DietSheet.
 */

function leafIcon(active) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? 'var(--color-primary)' : 'var(--color-text-tertiary)'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 21c.5-6 4.5-13 16-15-1 11-7.5 14-13 14" />
      <path d="M5 21c5-3 8-6 11-9" />
    </svg>
  )
}

export function DietButton({ selected, labels, onOpen }) {
  var count = Array.isArray(selected) ? selected.length : 0
  var active = count > 0

  var trailing
  if (count === 0) {
    trailing = 'Off'
  } else if (count === 1) {
    trailing = (labels && labels[selected[0]]) || selected[0]
  } else {
    trailing = count + ' selected'
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={active ? 'Edit dietary filter, ' + count + ' selected' : 'Open dietary filter'}
      className="inline-flex items-center gap-2 px-4 transition-colors duration-150"
      style={{
        height: '48px',
        borderRadius: '14px',
        background: active ? 'var(--color-primary-muted)' : 'var(--color-surface-elevated)',
        border: active
          ? '1.5px solid var(--color-primary)'
          : '1.5px solid var(--color-divider)',
        color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        fontFamily: 'Outfit, sans-serif',
        fontWeight: 600,
        fontSize: '14px',
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {leafIcon(active)}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}>
          DP's
        </span>
        <span
          aria-hidden="true"
          style={{
            color: 'var(--color-text-tertiary)',
            fontWeight: 400,
            fontSize: '13px',
          }}
        >
          ·
        </span>
        <span
          style={{
            color: active ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
            fontWeight: active ? 700 : 600,
          }}
        >
          {trailing}
        </span>
      </span>
    </button>
  )
}
