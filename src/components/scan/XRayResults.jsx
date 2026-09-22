import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MIN_VOTES_FOR_RANKING } from '../../constants/app'
import { useAuth } from '../../context/AuthContext'
import { LoginModal } from '../Auth/LoginModal'
import { menuScanApi } from '../../api/menuScanApi'
import { getUserMessage } from '../../utils/errorHandler'
import { capture } from '../../lib/analytics'
import { XRayRow } from './XRayRow'

// The X-Ray view reads like the paper menu in your hand: printed-menu order
// (no reordering, nothing hidden), section headers, dish … price · rating.
// The crowd's verdict sits in the margin as a site-colored number; the
// "tell me what to get" button (in ScanMenu) owns the decisive answer.
//
// Beneath the menu: "Not in the app yet · N" — the lines we don't have, with
// ONE button. Logged in: "Add these N" commits the server-staged list in a
// single tap. Guest: "Sign in to add these". Nothing is written without that
// tap (2026-09-22 one-camera design).
export function XRayResults({ result, photoUrl }) {
  const { restaurant, sections, summary, extraction_id: extractionId } = result
  const { user } = useAuth()
  const [loginOpen, setLoginOpen] = useState(false)
  const [added, setAdded] = useState(null) // { inserted, updated } after a successful add

  const allItems = sections.flatMap(s => s.items)
  const favorites = allItems
    .filter(i => i.match && (i.match.totalVotes ?? 0) >= MIN_VOTES_FOR_RANKING && i.match.avgRating >= 8.0).length
  const addable = allItems.filter(i => i.addable)
  // Commit by the server's staged count (summary.addable) — that is the length
  // of the staged array commit-menu-dishes indexes into.
  const stagedCount = Number.isInteger(summary?.addable) ? summary.addable : addable.length

  const addMutation = useMutation({
    mutationFn: () => menuScanApi.addStagedDishes({ extractionId, count: stagedCount }),
    onSuccess: (data) => {
      setAdded(data)
      const n = (data?.inserted ?? 0) + (data?.updated ?? 0)
      toast.success(`Added ${n} to ${restaurant.name}`)
      capture('scan_dishes_added', { restaurant_id: restaurant.id, inserted: data?.inserted ?? 0, updated: data?.updated ?? 0 })
    },
    onError: (err) => {
      toast.error(getUserMessage(err, 'adding these dishes'))
    },
  })

  const handleAdd = () => {
    if (!user) { setLoginOpen(true); return }
    addMutation.mutate()
  }

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
            {addable.length > 0 && !added && ` · ${addable.length} not in the app yet`}
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

      {/* Not in the app yet — one tap adds them all. */}
      {addable.length > 0 && (
        <section
          data-testid="xray-addable"
          className="mt-4 px-4 py-4 rounded-2xl"
          style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-divider)' }}
        >
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '18px', color: 'var(--color-text-primary)', lineHeight: 1.1 }}>
            {added ? 'Added to the map' : 'Not in the app yet'}
            <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 600 }}> · {addable.length}</span>
          </h2>
          <p className="text-sm mt-1.5 leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
            {added
              ? `You just put ${addable.length === 1 ? 'this dish' : 'these dishes'} on the map. Be the first to rate one.`
              : addable.map(i => i.name).join(' · ')}
          </p>
          {!added && (
            <button
              type="button"
              onClick={handleAdd}
              disabled={addMutation.isPending}
              className="w-full mt-3 py-3 rounded-xl font-semibold"
              style={{
                background: 'var(--color-primary)',
                color: 'var(--color-text-on-primary)',
                opacity: addMutation.isPending ? 0.6 : 1,
              }}
            >
              {addMutation.isPending
                ? 'Adding…'
                : user ? `Add these ${addable.length}` : 'Sign in to add these'}
            </button>
          )}
          {!added && user && !extractionId && (
            <p className="text-xs mt-2 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
              Re-scan to add — this scan was made before you signed in.
            </p>
          )}
        </section>
      )}

      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  )
}
