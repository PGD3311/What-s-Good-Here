import { useId } from 'react'

/**
 * Seal — The WGH plate mark. Stamp of approval.
 *
 * For sizes under ~64px (favicons, tiny chips) pass `showRing={false}` — the
 * ring text becomes illegible and adds noise.
 *
 * Defaults are decorative (`aria-hidden`). Pass `ariaLabel` when the Seal is
 * the only brand identifier on screen and a screen reader should announce it.
 */
export function Seal({
  size = 200,
  plateColor,
  monoColor,
  ringColor,
  showRing = true,
  borderColor = null,
  ariaLabel,
  className = '',
  style = {},
}) {
  const plate = plateColor ?? 'var(--color-primary)'
  const mono = monoColor ?? 'var(--color-surface)'
  const ring = ringColor ?? 'var(--color-text-primary)'
  const id = 'seal_' + useId().replace(/:/g, '_')

  const a11y = ariaLabel
    ? { role: 'img', 'aria-label': ariaLabel }
    : { 'aria-hidden': true }

  // When the ring is hidden, crop the viewBox to the inner plate so the
  // mark fills the icon area instead of leaving the ring padding empty.
  const viewBox = showRing ? '0 0 200 200' : '40 40 120 120'

  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', overflow: 'visible', ...style }}
      {...a11y}
    >
      <defs>
        <path id={id} d="M 100,100 m -70,0 a 70,70 0 1,1 140,0 a 70,70 0 1,1 -140,0" />
      </defs>
      {borderColor && (
        <circle cx="100" cy="100" r="72" fill="none" stroke={borderColor} strokeWidth="1.5" />
      )}
      <circle cx="100" cy="100" r="50" fill={plate} />
      {showRing && (
        <text
          fontFamily="'JetBrains Mono', monospace"
          fontSize="11"
          fill={ring}
          letterSpacing="3"
          fontWeight="600"
        >
          <textPath href={`#${id}`} startOffset="0">
            WHAT&rsquo;S GOOD HERE · WHAT&rsquo;S GOOD HERE ·{' '}
          </textPath>
        </text>
      )}
      <text
        x="100"
        y="111"
        textAnchor="middle"
        fontFamily="'Fraunces', serif"
        fontStyle="italic"
        fontWeight="900"
        fontSize="44"
        fill={mono}
        letterSpacing="-1"
      >
        wgh
      </text>
    </svg>
  )
}
