/**
 * Attribution label required by the Google Places Web Service policy
 * wherever we show Places data (autocomplete results, nearby discovery
 * cards, or place details like Google ratings).
 *
 * Text-only "Powered by Google" treatment, acceptable per Google's policy
 * as an alternative to the official logo asset when space is tight. Using
 * text here avoids the risk of inlining a hand-authored wordmark SVG with
 * incorrect proportions/colors vs. Google's brand spec.
 *
 * Reference: https://developers.google.com/maps/documentation/places/web-service/policies
 */
export function PoweredByGoogle({ className = '', align = 'left' }) {
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
  return (
    <div
      className={`flex items-center ${justify} ${className}`}
      aria-label="Powered by Google"
    >
      <span
        className="text-xs font-medium"
        style={{ color: 'var(--color-text-tertiary)', letterSpacing: '0.01em' }}
      >
        Powered by Google
      </span>
    </div>
  )
}
