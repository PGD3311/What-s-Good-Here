import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useMyLocalList } from '../hooks/useMyLocalList'
import { useDishSearch } from '../hooks/useDishSearch'
import { getCategoryEmoji } from '../constants/categories'
import { logger } from '../utils/logger'

function snapshot(tagline, items) {
  return JSON.stringify({
    tagline: tagline || '',
    items: (items || []).map(function (item) {
      return {
        dish_id: item.dish_id,
        note: item.note || '',
      }
    }),
  })
}

export function MyList() {
  var navigate = useNavigate()
  var location = useLocation()
  var { listMeta, dishes, loading, error, saveList, saving } = useMyLocalList()

  var [tagline, setTagline] = useState('')
  var [items, setItems] = useState([])
  var [searchQuery, setSearchQuery] = useState('')
  var [showSearch, setShowSearch] = useState(false)
  var [saveMessage, setSaveMessage] = useState(null)
  var [hydrated, setHydrated] = useState(false)
  var [serverSnapshot, setServerSnapshot] = useState('')
  var [welcomeDismissed, setWelcomeDismissed] = useState(false)

  var { results: searchResults } = useDishSearch(searchQuery, 20)

  // Hydrate once we have a server response — even if dishes is empty,
  // so brand-new curators get listMeta.curatorTagline synced.
  useEffect(function () {
    if (hydrated || loading) return
    if (!listMeta) return
    var initialItems = dishes.map(function (d) {
      return {
        dish_id: d.dish_id,
        dish_name: d.dish_name,
        restaurant_name: d.restaurant_name,
        category: d.category,
        note: d.note || '',
      }
    })
    var initialTagline = listMeta.curatorTagline || ''
    setItems(initialItems)
    setTagline(initialTagline)
    setServerSnapshot(snapshot(initialTagline, initialItems))
    setHydrated(true)
  }, [hydrated, loading, listMeta, dishes])

  var currentSnapshot = useMemo(function () {
    return snapshot(tagline, items)
  }, [tagline, items])
  var isDirty = hydrated && currentSnapshot !== serverSnapshot

  // beforeunload — only while dirty. Removed on cleanup or when clean.
  useEffect(function () {
    if (!isDirty) return undefined
    function handler(e) {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handler)
    return function () { window.removeEventListener('beforeunload', handler) }
  }, [isDirty])

  // Loading and error states (must come before the !listMeta gate so a
  // failed fetch doesn't masquerade as "you're not a curator").
  if (loading && !hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--color-primary)' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--color-bg)' }}>
        <div style={{ fontSize: 64 }}>⚠️</div>
        <h1 style={{ fontFamily: "'Amatic SC', cursive", fontSize: 32, marginTop: 12, color: 'var(--color-text-primary)' }}>
          Couldn't load your list
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 8, textAlign: 'center' }}>
          {error?.message || 'Please try again.'}
        </p>
        <button
          onClick={function () { window.location.reload() }}
          style={{ color: 'var(--color-accent-gold)', marginTop: 16, background: 'none', border: 'none', fontWeight: 700 }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!listMeta) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center px-6">
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔒</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            Local Curators Only
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            You need an invite link to become a local curator.
          </p>
          <button
            onClick={function () { navigate('/') }}
            className="px-6 py-3 rounded-xl font-semibold"
            style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  function handleAddDish(dish) {
    if (items.length >= 10) return
    var dishId = dish.dish_id || dish.id
    if (items.some(function (item) { return item.dish_id === dishId })) return

    setItems(function (prev) {
      return prev.concat([{
        dish_id: dishId,
        dish_name: dish.dish_name || dish.name,
        restaurant_name: dish.restaurant_name,
        category: dish.category,
        note: '',
      }])
    })
    setSearchQuery('')
    setShowSearch(false)
  }

  function handleRemoveDish(dishId) {
    setItems(function (prev) {
      return prev.filter(function (item) { return item.dish_id !== dishId })
    })
  }

  function handleMoveUp(index) {
    if (index === 0) return
    setItems(function (prev) {
      var copy = prev.slice()
      var temp = copy[index - 1]
      copy[index - 1] = copy[index]
      copy[index] = temp
      return copy
    })
  }

  function handleMoveDown(index) {
    if (index >= items.length - 1) return
    setItems(function (prev) {
      var copy = prev.slice()
      var temp = copy[index + 1]
      copy[index + 1] = copy[index]
      copy[index] = temp
      return copy
    })
  }

  function handleNoteChange(index, note) {
    setItems(function (prev) {
      var copy = prev.slice()
      copy[index] = Object.assign({}, copy[index], { note: note })
      return copy
    })
  }

  async function handleSave() {
    setSaveMessage(null)
    try {
      var payload = {
        tagline: tagline || null,
        items: items.map(function (item, i) {
          return {
            dish_id: item.dish_id,
            position: i + 1,
            note: item.note || null,
          }
        }),
      }
      var result = await saveList(payload)
      if (result.success) {
        setSaveMessage('Saved! ' + (items.length > 0 ? 'Your list is live.' : 'List unpublished.'))
        setServerSnapshot(snapshot(tagline, items))
      } else {
        setSaveMessage('Error: ' + (result.error || 'Failed to save'))
      }
    } catch (err) {
      logger.error('Save list error:', err)
      setSaveMessage('Error: ' + (err.message || 'Failed to save'))
    }
  }

  // Filter search results to exclude already-added dishes
  var addedIds = {}
  items.forEach(function (item) { addedIds[item.dish_id] = true })
  var filteredResults = searchResults.filter(function (dish) {
    return !addedIds[dish.dish_id || dish.id]
  })

  var showWelcome = !welcomeDismissed
    && location.state
    && location.state.justAcceptedCuratorInvite
    && items.length === 0

  function dismissWelcome() {
    setWelcomeDismissed(true)
    navigate(location.pathname, { replace: true, state: null })
  }

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', paddingBottom: '100px' }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 style={{
          fontSize: '22px',
          fontWeight: 800,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.02em',
        }}>
          My Top 10
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
          Pick up to 10 dishes visitors should try
        </p>
      </div>

      {/* Welcome banner (just-accepted curator) */}
      {showWelcome && (
        <div
          className="mx-4 mb-3 rounded-xl"
          style={{
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-primary)',
            padding: '12px 14px',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              You&rsquo;re a Local Curator 🎉
            </p>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              Pick up to 10 dishes visitors should try, add a tagline, and hit
              {' '}<strong>Save &amp; Publish</strong>. Your list shows up on the homepage.
            </p>
          </div>
          <button
            onClick={dismissWelcome}
            aria-label="Dismiss welcome"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Tagline */}
      <div className="px-4 mb-4">
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
          Your tagline
        </label>
        <input
          type="text"
          value={tagline}
          onChange={function (e) { setTagline(e.target.value) }}
          placeholder="e.g. Manager at Nancy's, lifelong islander"
          maxLength={80}
          className="w-full rounded-lg"
          style={{
            padding: '10px 12px',
            fontSize: '14px',
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-divider)',
            color: 'var(--color-text-primary)',
            outline: 'none',
          }}
        />
      </div>

      {/* Current items */}
      <div className="px-4">
        {items.length === 0 ? (
          <div
            className="rounded-xl text-center"
            style={{
              padding: '24px 16px',
              background: 'var(--color-surface-elevated)',
              border: '1px dashed var(--color-divider)',
            }}
          >
            <p style={{ fontSize: '14px', color: 'var(--color-text-tertiary)' }}>
              No dishes yet — add your first pick below
            </p>
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: '8px' }}>
            {items.map(function (item, i) {
              var emoji = getCategoryEmoji(item.category) || '🍽️'
              return (
                <div
                  key={item.dish_id}
                  className="rounded-xl"
                  style={{
                    background: 'var(--color-surface-elevated)',
                    border: '1px solid var(--color-divider)',
                    padding: '12px',
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank number */}
                    <span style={{
                      fontSize: '16px',
                      fontWeight: 800,
                      color: 'var(--color-text-tertiary)',
                      width: '24px',
                      textAlign: 'center',
                    }}>
                      {i + 1}
                    </span>

                    {/* Emoji */}
                    <span style={{ fontSize: '20px' }}>{emoji}</span>

                    {/* Name + restaurant */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {item.dish_name}
                      </p>
                      <p className="truncate" style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {item.restaurant_name}
                      </p>
                    </div>

                    {/* Reorder buttons */}
                    <div className="flex flex-col" style={{ gap: '2px' }}>
                      <button
                        onClick={function () { handleMoveUp(i) }}
                        disabled={i === 0}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px 6px',
                          fontSize: '14px',
                          color: i === 0 ? 'var(--color-divider)' : 'var(--color-text-secondary)',
                          cursor: i === 0 ? 'default' : 'pointer',
                        }}
                      >
                        ▲
                      </button>
                      <button
                        onClick={function () { handleMoveDown(i) }}
                        disabled={i >= items.length - 1}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px 6px',
                          fontSize: '14px',
                          color: i >= items.length - 1 ? 'var(--color-divider)' : 'var(--color-text-secondary)',
                          cursor: i >= items.length - 1 ? 'default' : 'pointer',
                        }}
                      >
                        ▼
                      </button>
                    </div>

                    {/* Remove */}
                    <button
                      onClick={function () { handleRemoveDish(item.dish_id) }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '4px 8px',
                        fontSize: '16px',
                        color: 'var(--color-text-tertiary)',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Note */}
                  <div style={{ marginTop: '8px', marginLeft: '56px' }}>
                    <input
                      type="text"
                      value={item.note}
                      onChange={function (e) { handleNoteChange(i, e.target.value) }}
                      placeholder="Add a quick note (optional)"
                      maxLength={120}
                      className="w-full"
                      style={{
                        padding: '6px 8px',
                        fontSize: '12px',
                        fontStyle: item.note ? 'normal' : 'italic',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--color-divider)',
                        color: 'var(--color-text-secondary)',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add dish section */}
      {items.length < 10 && (
        <div className="px-4 mt-4">
          {!showSearch ? (
            <button
              onClick={function () { setShowSearch(true) }}
              className="w-full rounded-xl"
              style={{
                padding: '12px',
                background: 'none',
                border: '1.5px dashed var(--color-primary)',
                color: 'var(--color-primary)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add a dish ({10 - items.length} remaining)
            </button>
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-divider)',
              }}
            >
              <div className="flex items-center" style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-divider)' }}>
                <span style={{ fontSize: '16px', marginRight: '8px', color: 'var(--color-text-tertiary)' }}>🔍</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={function (e) { setSearchQuery(e.target.value) }}
                  placeholder="Search dishes..."
                  autoFocus
                  className="flex-1"
                  style={{
                    padding: '4px 0',
                    fontSize: '14px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={function () { setShowSearch(false); setSearchQuery('') }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '13px',
                    color: 'var(--color-text-tertiary)',
                    cursor: 'pointer',
                    padding: '4px 8px',
                  }}
                >
                  Cancel
                </button>
              </div>

              {/* Search results */}
              {searchQuery.length >= 2 && (
                <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                  {filteredResults.length === 0 ? (
                    <p style={{ padding: '12px', fontSize: '13px', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                      No dishes found
                    </p>
                  ) : (
                    filteredResults.slice(0, 8).map(function (dish) {
                      var emoji = getCategoryEmoji(dish.category) || '🍽️'
                      return (
                        <button
                          key={dish.dish_id || dish.id}
                          onClick={function () { handleAddDish(dish) }}
                          className="w-full text-left flex items-center gap-3"
                          style={{
                            padding: '10px 12px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px solid var(--color-divider)',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ fontSize: '18px' }}>{emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="truncate" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                              {dish.dish_name || dish.name}
                            </p>
                            <p className="truncate" style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                              {dish.restaurant_name}
                            </p>
                          </div>
                          <span style={{ fontSize: '18px', color: 'var(--color-primary)' }}>+</span>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save button (fixed bottom) */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 16px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          background: 'var(--color-bg)',
          borderTop: '1px solid var(--color-divider)',
          zIndex: 50,
        }}
      >
        {saveMessage && (
          <p style={{
            fontSize: '12px',
            color: saveMessage.startsWith('Error') ? 'var(--color-danger)' : 'var(--color-success)',
            marginBottom: '8px',
            textAlign: 'center',
          }}>
            {saveMessage}
          </p>
        )}
        {isDirty && !saveMessage && (
          <p style={{
            fontSize: '11px',
            color: 'var(--color-accent-gold)',
            marginBottom: '6px',
            textAlign: 'center',
            fontWeight: 600,
          }}>
            Unsaved changes
          </p>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="w-full rounded-xl font-semibold transition-all disabled:opacity-50"
          style={{
            padding: '14px',
            fontSize: '16px',
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            cursor: (saving || !isDirty) ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : items.length > 0 ? 'Save & Publish' : 'Save (Unpublished)'}
        </button>
      </div>

    </div>
  )
}
