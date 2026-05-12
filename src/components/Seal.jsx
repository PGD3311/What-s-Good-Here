import { useId } from 'react'

/**
 * Seal — The WGH plate mark. Stamp of approval.
 *
 * Three variants (pick what matches the surface you're on):
 *   - `monogram` (default) — coral plate, cream "wgh", no rim/star. Works on
 *     light page backgrounds. Used by TopBar and most in-app brand anchors.
 *   - `seal` — `monogram` plus circular "WHAT'S GOOD HERE" ring text. For
 *     marketing/legal pages where you want the formal seal-of-approval look.
 *     Drop below ~64px and the ring becomes illegible.
 *   - `icon` — Full app-icon mark: coral square background, cream plate, thin
 *     cream rim, cream star at 10 o'clock (a 10/10 nod), coral italic "wgh".
 *     Use for hero brand stamps, splash overlays, anything that should echo
 *     the launcher icon.
 *
 * `plateColor` / `monoColor` overrides still work for one-off recolors.
 * `showRing` and `showStar` let you compose ad-hoc looks without committing
 * to a full variant.
 *
 * Defaults are decorative (`aria-hidden`). Pass `ariaLabel` when the Seal is
 * the only brand identifier on screen and a screen reader should announce it.
 */
export function Seal({
  size = 200,
  variant = 'monogram',
  plateColor,
  monoColor,
  ringColor,
  starColor,
  rimColor,
  bgColor,
  showRing,
  showStar,
  showRim,
  showBackground,
  borderColor = null,
  ariaLabel,
  className = '',
  style = {},
}) {
  const isIcon = variant === 'icon'
  const isSeal = variant === 'seal'

  const ring = showRing ?? isSeal
  const star = showStar ?? isIcon
  const rim = showRim ?? isIcon
  const bg = showBackground ?? isIcon

  const plate = plateColor ?? (isIcon ? 'var(--color-surface)' : 'var(--color-primary)')
  const mono = monoColor ?? (isIcon ? 'var(--color-primary)' : 'var(--color-surface)')
  const ringInk = ringColor ?? 'var(--color-text-primary)'
  const rimInk = rimColor ?? (isIcon ? 'var(--color-surface)' : 'var(--color-primary)')
  const starInk = starColor ?? (isIcon ? 'var(--color-surface)' : 'var(--color-primary)')
  const bgInk = bgColor ?? 'var(--color-primary)'

  const id = 'seal_' + useId().replace(/:/g, '_')
  const a11y = ariaLabel
    ? { role: 'img', 'aria-label': ariaLabel }
    : { 'aria-hidden': true }

  // The icon mark uses a bigger plate (r=62) so the proportions read like the
  // launcher icon. Other variants keep the tighter r=50 so the ring text has
  // room to breathe.
  const plateR = isIcon ? 62 : 50
  const rimR = isIcon ? 78 : 65
  // Crop the viewBox to whatever's actually rendered so the mark fills the
  // icon area: full canvas when bg/ring are on, wider crop when the star is
  // showing (so it doesn't get clipped), tightest crop for the bare monogram.
  const viewBox = ring || bg ? '0 0 200 200' : star ? '22 22 156 156' : '40 40 120 120'

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
      {bg && <rect width="200" height="200" fill={bgInk} />}
      {borderColor && (
        <circle cx="100" cy="100" r="72" fill="none" stroke={borderColor} strokeWidth="1.5" />
      )}
      <circle cx="100" cy="100" r={plateR} fill={plate} />
      {rim && (
        <circle cx="100" cy="100" r={rimR} fill="none" stroke={rimInk} strokeWidth="1.6" opacity="0.75" />
      )}
      {ring && (
        <text
          fontFamily="'JetBrains Mono', monospace"
          fontSize="11"
          fill={ringInk}
          letterSpacing="3"
          fontWeight="600"
        >
          <textPath href={`#${id}`} startOffset="0">
            WHAT&rsquo;S GOOD HERE · WHAT&rsquo;S GOOD HERE ·{' '}
          </textPath>
        </text>
      )}
      {star && (
        <g transform="translate(35 60)">
          <path
            d="M 0 -7 L 1.6 -2.2 L 6.7 -2.2 L 2.6 0.9 L 4.1 5.7 L 0 2.7 L -4.1 5.7 L -2.6 0.9 L -6.7 -2.2 L -1.6 -2.2 Z"
            fill={starInk}
          />
        </g>
      )}
      <text
        x="100"
        y={isIcon ? 116 : 111}
        textAnchor="middle"
        fontFamily="'Fraunces', serif"
        fontStyle="italic"
        fontWeight="900"
        fontSize={isIcon ? 52 : 44}
        fill={mono}
        letterSpacing={isIcon ? -2 : -1}
      >
        wgh
      </text>
    </svg>
  )
}
