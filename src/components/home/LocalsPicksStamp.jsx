// "Tried & true" red ink stamp used on the banner and TOC.
// `seed` varies the ink-jitter so two stamps on one page don't look identical.
// SVG fills use literal hex per CLAUDE.md §1.3 (SVG illustration exception).
export function LocalsPicksStamp({ seed = 4, includeRibbon = true, size = 72 }) {
  var filterId = 'lp-stamp-ink-' + seed
  var pathId = 'lp-stamp-path-' + seed

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence baseFrequency="0.9" numOctaves="2" seed={seed} />
          <feDisplacementMap in="SourceGraphic" scale="1" />
        </filter>
        <path id={pathId} d="M 50 50 m -36 0 a 36 36 0 1 1 72 0 a 36 36 0 1 1 -72 0" />
      </defs>
      <g filter={'url(#' + filterId + ')'} fill="none" stroke="#B82617" strokeOpacity="0.9">
        <circle cx="50" cy="50" r="42" strokeWidth="1.2" />
        <circle cx="50" cy="50" r="39" strokeWidth="2" />
        <circle cx="50" cy="50" r="26" strokeWidth="1" />
        {includeRibbon && (
          <>
            <text fontFamily="Outfit, sans-serif" fontSize="6.6" fontWeight="800" letterSpacing="1.4" fill="#B82617" stroke="none">
              <textPath href={'#' + pathId} startOffset="6%">WHAT'S GOOD HERE</textPath>
            </text>
            <text fontFamily="Outfit, sans-serif" fontSize="5.6" fontWeight="700" letterSpacing="2" fill="#B82617" stroke="none">
              <textPath href={'#' + pathId} startOffset="62%">★ LOCALS ONLY ★</textPath>
            </text>
          </>
        )}
        <text x="50" y="50" textAnchor="middle" fontFamily="'Amatic SC', cursive" fontSize="17" fontWeight="700" fill="#B82617" stroke="none">tried &amp;</text>
        <text x="50" y="63" textAnchor="middle" fontFamily="'Amatic SC', cursive" fontSize="17" fontWeight="700" fill="#B82617" stroke="none">true</text>
      </g>
    </svg>
  )
}
