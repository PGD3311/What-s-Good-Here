/**
 * DietButton — dietary-filter trigger.
 *
 * Two variants:
 *   - Default (large pill): used in Map mode. Shows "DP's · Off / Vegan /
 *     N selected" so the selection is legible at a glance.
 *   - `compact`: used inline inside the homepage search bar next to the
 *     radius pill. Always reads "DP's" — active state is communicated by
 *     the coral border so the pill stays narrow enough not to squeeze the
 *     search input. The exact selection is revealed in the sheet on tap.
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

function compactLeafIcon(active) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? 'var(--color-primary)' : 'var(--color-text-secondary)'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 21c.5-6 4.5-13 16-15-1 11-7.5 14-13 14" />
      <path d="M5 21c5-3 8-6 11-9" />
    </svg>
  )
}

export function DietButton({ selected, labels, onOpen, compact = false }) {
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

  if (compact) {
    // Inline variant — matches the sibling radius pill inside the search bar's
    // rightSlot. Label stays "DP's" in every state so the pill width is
    // bounded (was overflowing the search row on small phones when the
    // trailing text grew to "2 selected" / "Gluten-free"). Coral border +
    // muted wash communicate the filtered state; details live in the sheet.
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={active ? 'Edit dietary filter, ' + count + ' selected' : 'Open dietary filter'}
        className="flex items-center gap-1 px-2 py-1 rounded-lg font-bold flex-shrink-0"
        style={{
          fontSize: '12px',
          background: active ? 'var(--color-primary-muted)' : 'var(--color-bg)',
          color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
          border: active
            ? '1px solid var(--color-primary)'
            : '1px solid var(--color-divider)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {compactLeafIcon(active)}
        <span>DP's</span>
      </button>
    )
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
