import { useNavigate } from 'react-router-dom'
import { useLocalPicksCurators } from '../../hooks/useLocalPicksCurators'
import { LocalsPicksStamp } from './LocalsPicksStamp'

var BANNER_OUTER = {
  position: 'relative',
  background: 'linear-gradient(180deg, var(--color-paper-cream-light) 0%, var(--color-paper-cream-dark) 100%)',
  borderRadius: '14px',
  padding: '14px 14px 12px 16px',
  margin: '10px 16px 4px',
  border: '1px solid rgba(196, 138, 18, 0.18)',
  boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 20px rgba(180, 130, 60, 0.12)',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  overflow: 'hidden',
  textAlign: 'left',
  width: 'calc(100% - 32px)',
}
var BANNER_GRAIN = {
  content: '""',
  position: 'absolute',
  inset: 0,
  backgroundImage:
    'radial-gradient(circle at 20% 30%, rgba(196,138,18,.05), transparent 50%),' +
    'radial-gradient(circle at 80% 70%, rgba(228,68,10,.04), transparent 50%)',
  pointerEvents: 'none',
}
var BANNER_BODY = { flex: 1, position: 'relative', zIndex: 2, minWidth: 0 }
var EYEBROW = {
  fontFamily: "'Amatic SC', cursive",
  fontSize: '15px',
  fontWeight: 700,
  color: 'var(--color-accent-gold)',
  lineHeight: 1,
  letterSpacing: '0.02em',
}
var TITLE = {
  fontFamily: "'Amatic SC', cursive",
  fontWeight: 700,
  fontSize: '34px',
  lineHeight: 0.95,
  color: 'var(--color-text-primary)',
  margin: '-2px 0 2px',
}
var TITLE_ACCENT = { color: 'var(--color-primary)' }
var SUB = {
  fontSize: '12px',
  color: 'var(--color-text-secondary)',
  marginTop: '2px',
  lineHeight: 1.4,
  fontWeight: 500,
}
var SUB_BOLD = { color: 'var(--color-text-primary)', fontWeight: 700 }
var CTA = {
  fontSize: '12px',
  fontWeight: 700,
  color: 'var(--color-primary)',
  marginTop: '8px',
}
var STAMP_WRAP = {
  position: 'relative',
  zIndex: 2,
  width: '72px',
  height: '72px',
  flexShrink: 0,
  transform: 'rotate(-6deg)',
}

export function LocalsPicksBanner() {
  var navigate = useNavigate()
  var { curators, loading } = useLocalPicksCurators()

  if (loading) return null
  if (!curators || curators.length === 0) return null

  var curatorCount = curators.length
  var dishCount = curators.reduce(function (sum, c) { return sum + (c.item_count || 0) }, 0)

  return (
    <button
      type="button"
      onClick={function () { navigate('/locals') }}
      style={BANNER_OUTER}
      className="active:scale-[0.99] transition-transform"
      aria-label={'Open Locals’ Picks. ' + curatorCount + ' islanders, ' + dishCount + ' dishes.'}
    >
      <div style={BANNER_GRAIN} />
      <div style={BANNER_BODY}>
        <div style={EYEBROW}>ask a local</div>
        <div style={TITLE}>The Locals&rsquo; <span style={TITLE_ACCENT}>Picks</span></div>
        <div style={SUB}>
          What <span style={SUB_BOLD}>{curatorCount} islander{curatorCount === 1 ? '' : 's'}</span> actually order &mdash;<br />
          their {dishCount} favorite dish{dishCount === 1 ? '' : 'es'}.
        </div>
        <div style={CTA}>See what they order <span style={{ fontWeight: 800, marginLeft: '1px' }}>&rarr;</span></div>
      </div>
      <div style={STAMP_WRAP}>
        <LocalsPicksStamp seed={4} />
      </div>
    </button>
  )
}
