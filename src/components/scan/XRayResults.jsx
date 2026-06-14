import { MIN_VOTES_FOR_RANKING } from '../../constants/app'
import { XRayRow } from './XRayRow'

// The X-Ray view reads like the paper menu in your hand: printed-menu order
// (no reordering, nothing hidden), section headers, dish … price · rating.
// The crowd's verdict sits in the margin as a site-colored number; the
// "tell me what to get" button (in ScanMenu) owns the decisive answer.
export function XRayResults({ result, photoUrl }) {
  const { restaurant, sections, summary } = result
  const favorites = sections
    .flatMap(s => s.items)
    .filter(i => i.match && (i.match.totalVotes ?? 0) >= MIN_VOTES_FOR_RANKING && i.match.avgRating >= 8.0).length

  return (
    <div className="px-4 pb-28">
      <div className="flex items-start justify-between gap-3 pt-4 pb-2">
        <div className="min-w-0">
          <h1 className="text-2xl leading-none" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            {restaurant.name}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {favorites > 0 && <strong style={{ color: 'var(--color-primary)' }}>{favorites} crowd favorite{favorites === 1 ? '' : 's'} · </strong>}
            {summary.total} dish{summary.total === 1 ? '' : 'es'}
            {summary.ingested > 0 && ` · ${summary.ingested} new to the map`}
          </p>
        </div>
        {photoUrl && (
          <img src={photoUrl} alt="Scanned menu" className="w-12 h-16 object-cover rounded-md rotate-3"
            style={{ border: '1px solid var(--color-category-strip)' }} />
        )}
      </div>

      {/* The menu card — warm paper, dishes in their printed order. */}
      <div
        style={{
          marginTop: '6px',
          padding: '18px 18px 22px',
          borderRadius: '18px',
          background: 'linear-gradient(170deg, #fffdf8, var(--color-paper-cream-light))',
          boxShadow: '0 4px 18px rgba(40,30,20,0.08)',
        }}
      >
        {sections.map((section, si) => (
          <section key={section.name}>
            <h2
              className="text-center"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '18px',
                color: 'var(--color-accent-gold)',
                letterSpacing: '0',
                margin: si === 0 ? '0 0 4px' : '18px 0 4px',
              }}
            >
              {section.name}
            </h2>
            {section.items.map((item, i) => (
              <XRayRow
                key={item.match?.dishId || `${section.name}-${item.name}-${i}`}
                item={item}
                restaurantId={restaurant.id}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
