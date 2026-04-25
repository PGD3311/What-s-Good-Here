import { useNavigate, useParams } from 'react-router-dom'
import { useLocalListDetail } from '../hooks/useLocalListDetail'
import { LocalsPicksStamp } from '../components/home/LocalsPicksStamp'

var PAGE = {
  background: 'linear-gradient(180deg, var(--color-paper-cream-light) 0%, var(--color-paper-cream-dark) 100%)',
  minHeight: '100vh',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  position: 'relative',
}
var GRAIN = {
  position: 'fixed',
  inset: 0,
  backgroundImage:
    'radial-gradient(circle at 20% 20%, rgba(196,138,18,.05), transparent 50%),' +
    'radial-gradient(circle at 80% 80%, rgba(228,68,10,.04), transparent 50%)',
  pointerEvents: 'none',
  zIndex: 0,
}
var INNER = { padding: '20px 24px 80px', position: 'relative', zIndex: 1, maxWidth: '720px', margin: '0 auto' }

var NAV_ROW = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }
var CLOSE = { fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }
var PAGENO = { fontFamily: "'Amatic SC', cursive", fontSize: '16px', fontWeight: 700, color: 'var(--color-text-tertiary)' }

var STAMP_TINY = { position: 'absolute', top: '54px', right: '24px', width: '44px', height: '44px', transform: 'rotate(10deg)', opacity: 0.8, zIndex: 2 }

var EYEBROW = { fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'var(--color-accent-gold)', marginBottom: '-2px' }
var TITLE = { fontFamily: "'Amatic SC', cursive", fontWeight: 700, fontSize: '52px', lineHeight: 0.95, color: 'var(--color-text-primary)' }
var BYLINE = { fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '16px' }

var ITEM = { marginBottom: '11px', padding: '0 2px' }
var ITEM_HEAD = { display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '1px' }
var ITEM_NAME = { fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }
var DOTS = { flex: 1, minWidth: '8px', borderBottom: '1.5px dotted rgba(0,0,0,.25)', alignSelf: 'flex-end', marginBottom: '5px' }
var RATING = { fontWeight: 700, fontSize: '16px', color: 'var(--color-rating)', fontVariantNumeric: 'tabular-nums' }
var META = { display: 'flex', gap: '6px', fontSize: '11px', paddingLeft: '2px' }
var REST = { color: 'var(--color-accent-gold)', fontWeight: 600 }
var NOTE = { fontSize: '12.5px', color: 'var(--color-text-secondary)', lineHeight: 1.4, marginTop: '4px', paddingLeft: '2px', fontStyle: 'italic' }

var EMPTY = { textAlign: 'center', padding: '40px 0', fontSize: '13px', color: 'var(--color-text-tertiary)' }

export function LocalsCurator() {
  var { userId } = useParams()
  var navigate = useNavigate()
  var { items, loading, error } = useLocalListDetail(userId)

  if (loading) {
    return <div style={PAGE}><div style={GRAIN} /><div style={INNER}><p style={EMPTY}>Loading&hellip;</p></div></div>
  }
  if (error) {
    return <div style={PAGE}><div style={GRAIN} /><div style={INNER}><p style={EMPTY}>{error?.message || 'Could not load this list.'}</p></div></div>
  }
  if (!items || items.length === 0) {
    return <div style={PAGE}><div style={GRAIN} /><div style={INNER}><p style={EMPTY}>This local hasn't shared a list yet.</p></div></div>
  }

  var first = items[0]

  return (
    <div style={PAGE}>
      <div style={GRAIN} />
      <div style={INNER}>
        <div style={NAV_ROW}>
          <button type="button" style={CLOSE} onClick={function () { navigate('/locals') }}>&larr; All locals</button>
          <span style={PAGENO}>the menu</span>
        </div>
        <div style={STAMP_TINY}>
          <LocalsPicksStamp seed={11} includeRibbon={false} size={44} />
        </div>

        <div style={EYEBROW}>a local's picks</div>
        <h1 style={TITLE}>{first.display_name || 'Anonymous'}</h1>
        <div style={BYLINE}>{first.description || (first.title || '')}</div>

        {items.map(function (item) {
          return (
            <div key={item.dish_id} style={ITEM}>
              <div style={ITEM_HEAD}>
                <span style={ITEM_NAME}>
                  <button
                    type="button"
                    onClick={function () { navigate('/dish/' + item.dish_id) }}
                    style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                  >
                    {item.dish_name}
                  </button>
                </span>
                <span style={DOTS} />
                <span style={RATING}>{item.avg_rating != null ? Number(item.avg_rating).toFixed(1) : '—'}</span>
              </div>
              <div style={META}>
                <button
                  type="button"
                  onClick={function () { navigate('/restaurants/' + item.restaurant_id) }}
                  style={Object.assign({ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }, REST)}
                >
                  {item.restaurant_name}
                </button>
              </div>
              {item.note && <div style={NOTE}>&ldquo;{item.note}&rdquo;</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
