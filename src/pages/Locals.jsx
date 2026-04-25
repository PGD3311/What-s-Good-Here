import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocalPicksConsensus } from '../hooks/useLocalPicksConsensus'
import { useLocalPicksCurators } from '../hooks/useLocalPicksCurators'
import { useLocalPicksSearch } from '../hooks/useLocalPicksSearch'
import { useLocalPicksIndex } from '../hooks/useLocalPicksIndex'
import { LocalsPicksStamp } from '../components/home/LocalsPicksStamp'

var PAGE_OUTER = {
  background: 'linear-gradient(180deg, var(--color-paper-cream-light) 0%, var(--color-paper-cream-dark) 100%)',
  minHeight: '100vh',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  display: 'flex',
  flexDirection: 'column',
}
var PAGE_GRAIN = {
  position: 'fixed',
  inset: 0,
  backgroundImage:
    'radial-gradient(circle at 20% 20%, rgba(196,138,18,.05), transparent 50%),' +
    'radial-gradient(circle at 80% 80%, rgba(228,68,10,.04), transparent 50%)',
  pointerEvents: 'none',
  zIndex: 0,
}
var SCROLL = { flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1 }
var INNER = { padding: '20px 20px 96px', position: 'relative', maxWidth: '720px', margin: '0 auto' }

var NAV_ROW = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }
var CLOSE_BTN = { fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.02em', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }
var PAGENO = { fontFamily: "'Amatic SC', cursive", fontSize: '16px', fontWeight: 700, color: 'var(--color-text-tertiary)' }

var STAMP_TINY = { position: 'absolute', top: '54px', right: '20px', width: '44px', height: '44px', transform: 'rotate(10deg)', opacity: 0.8, zIndex: 2 }

var HEADER = { textAlign: 'center', marginBottom: '16px' }
var EYEBROW = { fontFamily: "'Amatic SC', cursive", fontSize: '18px', fontWeight: 700, color: 'var(--color-accent-gold)', lineHeight: 1 }
var TITLE = { fontFamily: "'Amatic SC', cursive", fontWeight: 700, fontSize: '42px', lineHeight: 1, color: 'var(--color-text-primary)', margin: '2px 0 4px' }
var TITLE_ACCENT = { color: 'var(--color-primary)' }
var SUB = { fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 500 }

var SECTION_LABEL = { fontFamily: "'Amatic SC', cursive", fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', margin: '14px 0 4px', lineHeight: 1 }
var SECTION_SUB = { fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '8px' }

var ROW_CARD = {
  background: 'var(--color-card)',
  borderRadius: '10px',
  padding: '10px 12px',
  marginBottom: '6px',
  boxShadow: '0 1px 2px rgba(0,0,0,.04)',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  border: '1px solid rgba(196, 138, 18, 0.18)',
  width: '100%',
  textAlign: 'left',
}

var COUNT_BUBBLE = { width: '30px', height: '30px', borderRadius: '50%', background: 'var(--color-stamp-red)', color: 'var(--color-text-on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Amatic SC', cursive", fontSize: '20px', fontWeight: 700, lineHeight: 1, flexShrink: 0 }
var ROW_BODY = { flex: 1, minWidth: 0 }
var DISH_NAME = { fontSize: '13px', fontWeight: 700, lineHeight: 1.1, color: 'var(--color-text-primary)' }
var ROW_REST = { fontSize: '10.5px', color: 'var(--color-accent-gold)', marginTop: '1px' }
var RATING = { fontSize: '15px', fontWeight: 700, color: 'var(--color-rating)', flexShrink: 0 }

var CURATOR_NAME_LINE = { display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '2px' }
var CURATOR_NAME = { fontFamily: "'Amatic SC', cursive", fontSize: '20px', fontWeight: 700, lineHeight: 1, color: 'var(--color-text-primary)' }
var CURATOR_ROLE = { fontSize: '10.5px', color: 'var(--color-text-tertiary)' }
var CURATOR_PICK = { fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.2 }
var CHEVRON = { color: 'var(--color-text-tertiary)', fontSize: '18px', fontWeight: 300, flexShrink: 0 }

var TAB_BAR = {
  display: 'flex',
  gap: '4px',
  padding: '8px 12px calc(8px + env(safe-area-inset-bottom, 0px))',
  background: 'var(--color-card)',
  borderTop: '1px solid var(--color-divider)',
  position: 'sticky',
  bottom: 0,
  zIndex: 5,
}
var TAB = { flex: 1, padding: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-tertiary)', borderRadius: '8px', background: 'none', border: 'none', cursor: 'pointer' }
var TAB_ACTIVE = Object.assign({}, TAB, { background: 'var(--color-text-primary)', color: 'var(--color-text-on-primary)', fontWeight: 700 })

var SEARCH_INPUT = {
  width: '100%',
  border: '1px solid rgba(196, 138, 18, 0.25)',
  background: 'var(--color-card)',
  borderRadius: '12px',
  padding: '10px 14px',
  fontSize: '13px',
  outline: 'none',
  marginBottom: '10px',
  fontFamily: 'inherit',
}

var INDEX_HEAD = { fontFamily: "'Amatic SC', cursive", fontSize: '28px', fontWeight: 700, color: 'var(--color-primary)', margin: '14px 0 4px', lineHeight: 1 }

var EMPTY = { textAlign: 'center', padding: '20px 0', fontSize: '12px', color: 'var(--color-text-tertiary)', fontWeight: 500 }

export function Locals() {
  var navigate = useNavigate()
  var [activeTab, setActiveTab] = useState('read')

  return (
    <div style={PAGE_OUTER}>
      <div style={PAGE_GRAIN} />
      <div style={SCROLL}>
        <div style={INNER}>
          <div style={NAV_ROW}>
            <button type="button" style={CLOSE_BTN} onClick={function () { navigate('/') }}>&larr; Close</button>
            <span style={PAGENO}>the menu</span>
          </div>

          <div style={STAMP_TINY}>
            <LocalsPicksStamp seed={7} includeRibbon={false} size={44} />
          </div>

          {activeTab === 'read' && <ReadTab />}
          {activeTab === 'search' && <SearchTab />}
          {activeTab === 'index' && <IndexTab />}
        </div>
      </div>
      <div style={TAB_BAR} role="tablist">
        <button type="button" role="tab" aria-selected={activeTab === 'read'} style={activeTab === 'read' ? TAB_ACTIVE : TAB} onClick={function () { setActiveTab('read') }}>Read</button>
        <button type="button" role="tab" aria-selected={activeTab === 'search'} style={activeTab === 'search' ? TAB_ACTIVE : TAB} onClick={function () { setActiveTab('search') }}>Search</button>
        <button type="button" role="tab" aria-selected={activeTab === 'index'} style={activeTab === 'index' ? TAB_ACTIVE : TAB} onClick={function () { setActiveTab('index') }}>Index</button>
      </div>
    </div>
  )
}

function Header({ curatorCount, dishCount, year }) {
  return (
    <div style={HEADER}>
      <div style={EYEBROW}>ask a local</div>
      <div style={TITLE}>The Locals' <span style={TITLE_ACCENT}>Picks</span></div>
      <div style={SUB}>{curatorCount} islander{curatorCount === 1 ? '' : 's'} &middot; {dishCount} dish{dishCount === 1 ? '' : 'es'} &middot; {year}</div>
    </div>
  )
}

function ReadTab() {
  var navigate = useNavigate()
  var consensusData = useLocalPicksConsensus()
  var curatorsData = useLocalPicksCurators()

  var consensus = consensusData.consensus
  var curators = curatorsData.curators
  var loading = consensusData.loading || curatorsData.loading
  var error = consensusData.error || curatorsData.error

  var curatorCount = curators.length
  var dishCount = curators.reduce(function (s, c) { return s + (c.item_count || 0) }, 0)
  var year = new Date().getFullYear()

  if (error) {
    return (
      <>
        <Header curatorCount={0} dishCount={0} year={year} />
        <p style={EMPTY}>{error?.message || 'Could not load picks.'}</p>
      </>
    )
  }
  if (loading && curators.length === 0) {
    return (
      <>
        <Header curatorCount={0} dishCount={0} year={year} />
        <p style={EMPTY}>Loading&hellip;</p>
      </>
    )
  }

  return (
    <>
      <Header curatorCount={curatorCount} dishCount={dishCount} year={year} />

      {consensus.length > 0 && (
        <>
          <div style={SECTION_LABEL}>everyone agrees</div>
          <div style={SECTION_SUB}>dishes more than one local picked</div>
          {consensus.map(function (row) {
            return (
              <button
                key={row.dish_id}
                type="button"
                style={ROW_CARD}
                onClick={function () { navigate('/dish/' + row.dish_id) }}
                className="active:scale-[0.99] transition-transform"
              >
                <div style={COUNT_BUBBLE}>{row.pick_count}</div>
                <div style={ROW_BODY}>
                  <div style={DISH_NAME}>{row.dish_name}</div>
                  <div style={ROW_REST}>{row.restaurant_name}</div>
                </div>
                <div style={RATING}>{row.avg_rating != null ? Number(row.avg_rating).toFixed(1) : '—'}</div>
              </button>
            )
          })}
        </>
      )}

      <div style={SECTION_LABEL}>or pick a local</div>
      <div style={SECTION_SUB}>scan their #1 &mdash; find one that catches your eye</div>

      {curators.map(function (c) {
        return (
          <button
            key={c.user_id}
            type="button"
            style={ROW_CARD}
            onClick={function () { navigate('/locals/' + c.user_id) }}
            className="active:scale-[0.99] transition-transform"
            aria-label={'Open ' + (c.display_name || 'curator') + '’s list'}
          >
            <div style={ROW_BODY}>
              <div style={CURATOR_NAME_LINE}>
                <span style={CURATOR_NAME}>{c.display_name || 'Anonymous'}</span>
                {c.curator_tagline && <span style={CURATOR_ROLE}>{c.curator_tagline}</span>}
              </div>
              {c.top_dish_name && (
                <div style={CURATOR_PICK}>
                  #1 <b style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{c.top_dish_name}</b>
                  {c.top_restaurant_name && <span> at <span style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>{c.top_restaurant_name}</span></span>}
                </div>
              )}
            </div>
            <span style={CHEVRON}>&rsaquo;</span>
          </button>
        )
      })}
    </>
  )
}

function SearchTab() {
  var navigate = useNavigate()
  var [query, setQuery] = useState('')
  var { results, loading, error } = useLocalPicksSearch(query, true)

  return (
    <>
      <div style={HEADER}>
        <div style={EYEBROW}>ask a local</div>
        <div style={TITLE}>Search the <span style={TITLE_ACCENT}>Picks</span></div>
        <div style={SUB}>vegan &middot; raw bar &middot; cheap eats &middot; chowder</div>
      </div>
      <input
        type="search"
        value={query}
        onChange={function (e) { setQuery(e.target.value) }}
        placeholder="What are you looking for?"
        style={SEARCH_INPUT}
        aria-label="Search locals' picks"
      />

      {error && <p style={EMPTY}>{error?.message || 'Search failed.'}</p>}
      {!error && loading && query.trim() && <p style={EMPTY}>Searching&hellip;</p>}
      {!error && !loading && query.trim() && results.length === 0 && (
        <p style={EMPTY}>Nothing matches &ldquo;{query}&rdquo;.</p>
      )}
      {results.map(function (r) {
        return (
          <button
            key={r.dish_id + ':' + r.curator_user_id}
            type="button"
            style={ROW_CARD}
            onClick={function () { navigate('/dish/' + r.dish_id) }}
            className="active:scale-[0.99] transition-transform"
          >
            <div style={ROW_BODY}>
              <div style={DISH_NAME}>{r.dish_name}</div>
              <div style={ROW_REST}>{r.restaurant_name} &middot; picked by {r.curator_display_name}</div>
              {r.note && <div style={{ fontSize: '11px', fontStyle: 'italic', color: 'var(--color-text-secondary)', marginTop: '3px', lineHeight: 1.3 }}>&ldquo;{r.note}&rdquo;</div>}
            </div>
            <div style={RATING}>{r.avg_rating != null ? Number(r.avg_rating).toFixed(1) : '—'}</div>
          </button>
        )
      })}
    </>
  )
}

function IndexTab() {
  var navigate = useNavigate()
  var { index, loading, error } = useLocalPicksIndex(true)

  var grouped = useMemo(function () {
    var map = new Map()
    for (var i = 0; i < index.length; i++) {
      var row = index[i]
      var letter = (row.dish_name || '?').charAt(0).toUpperCase()
      if (!/[A-Z]/.test(letter)) letter = '#'
      if (!map.has(letter)) map.set(letter, [])
      map.get(letter).push(row)
    }
    var letters = []
    map.forEach(function (rows, letter) { letters.push({ letter: letter, rows: rows }) })
    letters.sort(function (a, b) { return a.letter < b.letter ? -1 : 1 })
    return letters
  }, [index])

  return (
    <>
      <div style={HEADER}>
        <div style={EYEBROW}>ask a local</div>
        <div style={TITLE}>The <span style={TITLE_ACCENT}>Index</span></div>
        <div style={SUB}>every dish picked by anyone &mdash; A to Z</div>
      </div>

      {error && <p style={EMPTY}>{error?.message || 'Could not load index.'}</p>}
      {!error && loading && index.length === 0 && <p style={EMPTY}>Loading&hellip;</p>}

      {grouped.map(function (group) {
        return (
          <div key={group.letter}>
            <div style={INDEX_HEAD}>{group.letter}</div>
            {group.rows.map(function (row) {
              return (
                <button
                  key={row.dish_id}
                  type="button"
                  style={ROW_CARD}
                  onClick={function () { navigate('/dish/' + row.dish_id) }}
                  className="active:scale-[0.99] transition-transform"
                >
                  <div style={ROW_BODY}>
                    <div style={DISH_NAME}>{row.dish_name}</div>
                    <div style={ROW_REST}>{row.restaurant_name} &middot; {row.pick_count} pick{row.pick_count === 1 ? '' : 's'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>{(row.curator_names || []).join(' · ')}</div>
                  </div>
                  <div style={RATING}>{row.avg_rating != null ? Number(row.avg_rating).toFixed(1) : '—'}</div>
                </button>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
