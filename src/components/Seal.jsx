import { useId } from 'react'

/**
 * Seal — the WGH plate mark. Mirrors the launcher icon (Wide Rim).
 *
 * Three variants:
 *   - `monogram` (default) — coral disc, cream italic "wgh", transparent
 *     background. Used by TopBar and most in-app brand anchors.
 *   - `seal` — monogram with circular "WHAT'S GOOD HERE" ring text around
 *     the disc. For marketing/legal pages where you want the formal
 *     stamp-of-approval look. Keep above ~64px so the ring stays legible.
 *   - `icon` — full launcher mark: coral square background, cream plate,
 *     coral inner-rim line, coral italic "wgh". Use for hero brand stamps
 *     and splash overlays that should echo the iOS icon.
 *
 * All variants share the launcher icon's -8° tilt on the wordmark and
 * `opsz=144` on Fraunces so the display-cut letterforms read the same way
 * everywhere.
 */
export function Seal({
  size = 200,
  variant = 'monogram',
  plateColor,
  monoColor,
  ringColor,
  rimColor,
  bgColor,
  showRing,
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
  const innerRim = showRim ?? isIcon
  const bg = showBackground ?? isIcon

  const plate = plateColor ?? (isIcon ? 'var(--color-surface)' : 'var(--color-primary)')
  const mono = monoColor ?? (isIcon ? 'var(--color-primary)' : 'var(--color-surface)')
  const rimInk = rimColor ?? 'var(--color-primary)'
  const ringInk = ringColor ?? 'var(--color-text-primary)'
  const bgInk = bgColor ?? 'var(--color-primary)'

  // Seal keeps the smaller r=50 plate so the ring text fits comfortably
  // outside the disc. Icon + monogram match the launcher icon's r=84.
  const plateR = isSeal ? 50 : 84
  const innerRimR = 70

  // Match the launcher wordmark proportions. Smaller plate (seal variant)
  // gets a proportionally smaller wgh so it doesn't overflow the disc.
  const wghFontSize = isSeal ? 42 : 68
  const wghY = isSeal ? 113 : 120
  const wghLetterSpacing = isSeal ? -1.5 : -2.5

  // Tighten the viewBox to whatever's actually visible so the mark fills
  // the requested `size` instead of floating in negative space.
  let viewBox
  if (bg || ring) viewBox = '0 0 200 200'
  else if (isSeal) viewBox = '40 40 120 120'
  else viewBox = '12 12 176 176'

  const id = 'seal_' + useId().replace(/:/g, '_')
  const a11y = ariaLabel
    ? { role: 'img', 'aria-label': ariaLabel }
    : { 'aria-hidden': true }

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
        <circle cx="100" cy="100" r={plateR + 8} fill="none" stroke={borderColor} strokeWidth="1.5" />
      )}

      <circle cx="100" cy="100" r={plateR} fill={plate} />

      {innerRim && (
        <circle cx="100" cy="100" r={innerRimR} fill="none" stroke={rimInk} strokeWidth="1.0" opacity="0.55" />
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

      <g transform="rotate(-8 100 100)">
        <text
          x="100"
          y={wghY}
          textAnchor="middle"
          fontFamily="'Fraunces', serif"
          fontStyle="italic"
          fontWeight="900"
          fontSize={wghFontSize}
          fill={mono}
          letterSpacing={wghLetterSpacing}
          style={{ fontOpticalSizing: 'none', fontVariationSettings: '"opsz" 144' }}
        >
          wgh
        </text>
      </g>
    </svg>
  )
}
