// Coral ink stamp used on the Locals' Picks banner and TOC. Same italic "wgh"
// as the app icon, with the ink-jitter filter giving it a hand-stamped feel.
// `seed` varies the jitter so two stamps on one page don't look identical.
export function LocalsPicksStamp({ seed = 4, includeRibbon = true, size = 72 }) {
  var filterId = 'lp-stamp-ink-' + seed
  var pathId = 'lp-stamp-path-' + seed
  var ink = '#E4440A'

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence baseFrequency="0.9" numOctaves="2" seed={seed} />
          <feDisplacementMap in="SourceGraphic" scale="1" />
        </filter>
        <path id={pathId} d="M 50 50 m -36 0 a 36 36 0 1 1 72 0 a 36 36 0 1 1 -72 0" />
      </defs>
      <g filter={'url(#' + filterId + ')'} fill="none" stroke={ink} strokeOpacity="0.9">
        <circle cx="50" cy="50" r="42" strokeWidth="1.2" />
        <circle cx="50" cy="50" r="39" strokeWidth="2" />
        <circle cx="50" cy="50" r="26" strokeWidth="1" />
        {includeRibbon && (
          <>
            <text fontFamily="Outfit, sans-serif" fontSize="6.6" fontWeight="800" letterSpacing="1.4" fill={ink} stroke="none">
              <textPath href={'#' + pathId} startOffset="6%">WHAT'S GOOD HERE</textPath>
            </text>
            <text fontFamily="Outfit, sans-serif" fontSize="5.6" fontWeight="700" letterSpacing="2" fill={ink} stroke="none">
              <textPath href={'#' + pathId} startOffset="62%">★ LOCALS ONLY ★</textPath>
            </text>
          </>
        )}
        <text x="50" y="62" textAnchor="middle" fontFamily="'Fraunces', serif" fontStyle="italic" fontSize="28" fontWeight="900" letterSpacing="-1.5" fill={ink} stroke="none" style={{ fontOpticalSizing: 'none', fontVariationSettings: '"opsz" 144' }}>wgh</text>
      </g>
    </svg>
  )
}
