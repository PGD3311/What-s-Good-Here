/**
 * Renders Google Places third-party attributions that come back from
 * the Place Details response. Google's policy requires these to be
 * displayed when present — they credit the source that contributed
 * data about the place (typically local business directories, etc.).
 *
 * Shape: array of `{ provider: string, url: string | null }`.
 * Silently renders nothing when the array is empty.
 *
 * Reference: https://developers.google.com/maps/documentation/places/web-service/policies
 */
import { openExternalLink } from '../utils/openExternalLink'

export function PlaceAttributions({ attributions, className = '' }) {
  if (!Array.isArray(attributions) || attributions.length === 0) return null

  return (
    <div
      className={className}
      style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}
    >
      {attributions.map((a, i) => (
        <span key={`${a.provider}-${i}`}>
          {i > 0 && ', '}
          {a.url ? (
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => openExternalLink(e, e.currentTarget.href)}
              style={{ color: 'var(--color-accent-gold)' }}
            >
              {a.provider}
            </a>
          ) : (
            <span>{a.provider}</span>
          )}
        </span>
      ))}
    </div>
  )
}
