import { useNavigate } from 'react-router-dom'
import { useLocalPicksCurators } from '../../hooks/useLocalPicksCurators'
import { Seal } from '../Seal'

// Avatar stack — overlapping circles showing up to MAX_VISIBLE curators
// so users can see WHO the locals are at a glance. Falls back to a coral
// initial chip when a curator hasn't uploaded a profile photo.
var MAX_VISIBLE_AVATARS = 4
var AVATAR_SIZE = 36
var AVATAR_OVERLAP = 12

function CuratorAvatar({ curator, size }) {
  var borderWidth = 2
  var ringStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    border: borderWidth + 'px solid var(--color-paper-cream-light)',
    flexShrink: 0,
    overflow: 'hidden',
    background: 'var(--color-primary)',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Outfit, sans-serif',
    fontWeight: 700,
    fontSize: size * 0.42,
    letterSpacing: '0.01em',
    lineHeight: 1,
    boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
  }
  if (curator && curator.avatar_url) {
    return (
      <div style={ringStyle} aria-hidden="true">
        <img
          src={curator.avatar_url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          draggable={false}
        />
      </div>
    )
  }
  var initial = (curator && curator.display_name ? curator.display_name.charAt(0) : '?').toUpperCase()
  return (
    <div style={ringStyle} aria-hidden="true">
      {initial}
    </div>
  )
}

function CuratorAvatarStack({ curators }) {
  var visible = curators.slice(0, MAX_VISIBLE_AVATARS)
  var extra = Math.max(0, curators.length - MAX_VISIBLE_AVATARS)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        zIndex: 2,
        flexShrink: 0,
        paddingRight: extra > 0 ? '6px' : 0,
      }}
      aria-label={curators.length + ' islanders'}
    >
      {visible.map(function (c, i) {
        return (
          <div
            key={c.user_id || i}
            style={{
              marginLeft: i === 0 ? 0 : -AVATAR_OVERLAP,
              zIndex: visible.length - i,
            }}
          >
            <CuratorAvatar curator={c} size={AVATAR_SIZE} />
          </div>
        )
      })}
      {extra > 0 ? (
        <div
          style={{
            marginLeft: -AVATAR_OVERLAP,
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: '50%',
            border: '2px solid var(--color-paper-cream-light)',
            background: 'var(--color-surface-elevated)',
            color: 'var(--color-text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 700,
            fontSize: '11px',
            lineHeight: 1,
            zIndex: 0,
          }}
          aria-hidden="true"
        >
          +{extra}
        </div>
      ) : null}
    </div>
  )
}

var BANNER_OUTER = {
  position: 'relative',
  background: 'linear-gradient(180deg, var(--color-paper-cream-light) 0%, var(--color-paper-cream-dark) 100%)',
  borderRadius: '14px',
  padding: '14px 14px 12px 16px',
  margin: '6px 16px 4px',
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
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '6px',
        }}
      >
        <CuratorAvatarStack curators={curators} />
        {/* Tiny Seal kept as a small endorsement mark below the stack so
            the editorial "Locals' Picks" identity doesn't get lost. */}
        <div style={{ width: '36px', height: '36px', opacity: 0.85 }}>
          <Seal variant="icon" size={36} />
        </div>
      </div>
    </button>
  )
}
