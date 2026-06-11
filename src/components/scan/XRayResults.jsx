import { MIN_VOTES_FOR_RANKING } from '../../constants/app'
import { XRayRow } from './XRayRow'

// Each section is its own mini-leaderboard: rated dishes first (best rating,
// then most votes), early-signal dishes next, never-rated last. The user is
// holding the paper menu — IT owns the canonical order; the X-Ray view's job
// is judgment. Array.prototype.sort is stable, so unrated dishes keep their
// menu order at the bottom of the section.
function rankTier(item) {
  const votes = item.match?.totalVotes || 0
  if (votes >= MIN_VOTES_FOR_RANKING) return 2
  if (votes > 0) return 1
  return 0
}

function rankSectionItems(items) {
  return items.slice().sort((a, b) => {
    const tierDiff = rankTier(b) - rankTier(a)
    if (tierDiff !== 0) return tierDiff
    const ratingDiff = (b.match?.avgRating ?? 0) - (a.match?.avgRating ?? 0)
    if (ratingDiff !== 0) return ratingDiff
    return (b.match?.totalVotes ?? 0) - (a.match?.totalVotes ?? 0)
  })
}

export function XRayResults({ result, photoUrl }) {
  const { restaurant, sections, best, summary } = result
  const favorites = sections
    .flatMap(s => s.items)
    .filter(i => i.match && i.match.totalVotes >= MIN_VOTES_FOR_RANKING && i.match.avgRating >= 8.0).length
  return (
    <div className="px-4 pb-28">
      <div className="flex items-start justify-between gap-3 pt-4 pb-2">
        <div className="min-w-0">
          <h1 className="text-3xl leading-none" style={{ fontFamily: "'Amatic SC', cursive", fontWeight: 700 }}>
            {restaurant.name}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {favorites > 0 && <strong style={{ color: 'var(--color-rating)' }}>{favorites} crowd favorite{favorites === 1 ? '' : 's'} · </strong>}
            {summary.total} dish{summary.total === 1 ? '' : 'es'}
            {summary.ingested > 0 && ` · ${summary.ingested} new to the map`}
          </p>
        </div>
        {photoUrl && (
          <img src={photoUrl} alt="Scanned menu" className="w-12 h-16 object-cover rounded-md rotate-3"
            style={{ border: '1px solid var(--color-category-strip)' }} />
        )}
      </div>
      {sections.map(section => (
        <section key={section.name} className="mt-3">
          <h2 className="text-xl border-b pb-0.5 mb-1" style={{ fontFamily: "'Amatic SC', cursive", fontWeight: 700, color: 'var(--color-accent-gold)', borderColor: 'var(--color-category-strip)' }}>
            {section.name}
          </h2>
          {rankSectionItems(section.items).map((item, i) => (
            <XRayRow
              key={`${section.name}-${item.name}-${i}`}
              item={item}
              restaurantId={restaurant.id}
              isBest={best != null && item.match?.dishId === best.dishId}
              index={i}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
