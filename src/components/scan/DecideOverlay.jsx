import { useNavigate } from 'react-router-dom'
import { formatScore10 } from '../../utils/ranking'
import { useFocusTrap } from '../../hooks/useFocusTrap'

export function DecideOverlay({ open, onClose, result }) {
  const navigate = useNavigate()
  const containerRef = useFocusTrap(open, onClose)
  if (!open || !result?.best) return null
  const { best, sections } = result
  const alternates = (sections || [])
    .flatMap(s => s.items || [])
    .filter(i => i.match && i.match.dishId !== best.dishId && i.match.avgRating != null)
    .sort((a, b) => b.match.avgRating - a.match.avgRating)
    .slice(0, 2)

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4"
      style={{ background: 'rgba(10, 18, 14, 0.88)', backdropFilter: 'blur(7px)' }}
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="What to order"
        className="flex flex-col items-center gap-2 px-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase" style={{ color: 'var(--color-rating)', letterSpacing: '0.28em' }}>
          The island has spoken
        </p>
        <h1 className="text-6xl leading-none my-2" style={{ fontFamily: "'Amatic SC', cursive", fontWeight: 700, color: '#fff' }}>
          Get the<br />{best.name}
        </h1>
        <span className="px-4 py-2 rounded-full font-extrabold text-lg"
          style={{ background: 'var(--color-rating)', color: '#fff' }}>
          {formatScore10(best.avgRating)}
        </span>
        <p className="text-sm mt-3 max-w-xs" style={{ color: '#e8e2d8' }}>
          <strong style={{ color: '#fff' }}>{best.totalVotes} locals & visitors</strong> rated it — the
          highest-loved dish on this menu.
        </p>
        {alternates.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {alternates.map(a => (
              <span key={a.match.dishId} className="text-xs px-3 py-1.5 rounded-full"
                style={{ color: '#cfe9d8', border: '1px solid rgba(255,255,255,0.25)' }}>
                Also great: {a.name} · {formatScore10(a.match.avgRating)}
              </span>
            ))}
          </div>
        )}
        <button
          onClick={() => { onClose(); navigate(`/dish/${best.dishId}`) }}
          className="mt-6 px-6 py-3 rounded-2xl font-bold"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          See the dish →
        </button>
        <button onClick={onClose} className="mt-3 text-sm underline" style={{ color: '#9fb3a8' }}>
          ← back to the menu
        </button>
      </div>
    </div>
  )
}
