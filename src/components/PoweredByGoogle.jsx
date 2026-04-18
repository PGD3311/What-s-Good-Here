/**
 * Attribution label required by the Google Places Web Service policy
 * wherever we show Places data (autocomplete results, nearby discovery
 * cards, or place details like Google ratings).
 *
 * Text treatment: the exact string "Google Maps" per Google's current
 * text-attribution guidance (the legacy "Powered by Google" string has
 * been retired for new Places API work). Minimum font size is 12px to
 * match Google's documented sizing requirement.
 *
 * Reference: https://developers.google.com/maps/documentation/places/web-service/policies#google_maps_logo_and_text_attribution
 */
export function PoweredByGoogle({ className = '', align = 'left' }) {
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
  return (
    <div
      className={`flex items-center ${justify} ${className}`}
      aria-label="Data from Google Maps"
    >
      <span
        style={{
          color: 'var(--color-text-tertiary)',
          letterSpacing: '0.01em',
          fontSize: '12px',
          fontWeight: 500,
        }}
      >
        Google Maps
      </span>
    </div>
  )
}
