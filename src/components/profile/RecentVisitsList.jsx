import { Link } from 'react-router-dom'
import { useUserCheckIns } from '../../hooks/useUserCheckIns'

/**
 * RecentVisitsList — chronological list of a user's check-ins.
 *
 * Drops onto the Profile "Visits" tab. Each row routes to the restaurant
 * detail page so the user can see their full check-in history there OR
 * tap dishes they may want to rate.
 *
 * Native + web both render — the data is RLS-public for the viewing user
 * and the count lives in the database, not native-only state. Web users
 * who haven't checked in via iOS will see the empty state.
 */
export function RecentVisitsList({ userId }) {
  const { checkIns, loading, error } = useUserCheckIns(userId)

  if (loading) {
    return (
      <div className="px-4 pt-4 pb-6">
        <div className="animate-pulse">
          {[0, 1, 2].map(function (i) {
            return (
              <div
                key={i}
                style={{
                  background: 'var(--color-card)',
                  borderRadius: '14px',
                  padding: '14px',
                  marginBottom: '8px',
                  height: '76px',
                }}
              />
            )
          })}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 pt-6 pb-6">
        <p style={{
          fontFamily: 'Outfit, sans-serif',
          fontSize: '14px',
          color: 'var(--color-text-secondary)',
        }}>
          Couldn't load your visits — {error.message}
        </p>
      </div>
    )
  }

  if (checkIns.length === 0) {
    return (
      <div className="px-4 pt-8 pb-6 text-center">
        <p style={{
          fontFamily: 'Outfit, sans-serif',
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginBottom: '6px',
        }}>
          No visits yet
        </p>
        <p style={{
          fontFamily: 'Outfit, sans-serif',
          fontSize: '13px',
          color: 'var(--color-text-tertiary)',
          lineHeight: 1.45,
        }}>
          Check in from the iOS app to log your visits here.
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 pb-6">
      <div
        className="text-xs font-bold uppercase tracking-wider pb-3"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        {checkIns.length} {checkIns.length === 1 ? 'visit' : 'visits'}
      </div>

      {checkIns.map(function (visit) {
        return <VisitCard key={visit.id} visit={visit} />
      })}
    </div>
  )
}

function VisitCard({ visit }) {
  const isLive = visit.kind === 'live'
  const friendlyDate = formatFriendlyDate(visit.visited_at)
  const town = visit.restaurant_town
  const dishCount = visit.dish_count || 0

  return (
    <Link
      to={'/restaurants/' + visit.restaurant_id}
      className="no-underline block active:scale-[0.98] transition-transform"
      style={{
        background: 'var(--color-card)',
        borderRadius: '14px',
        padding: '14px',
        marginBottom: '8px',
        color: 'var(--color-text-primary)',
        display: 'block',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <span aria-hidden="true" style={{ fontSize: '20px', lineHeight: 1 }}>📍</span>

        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <p style={{
            margin: 0,
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 700,
            fontSize: '15px',
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {visit.restaurant_name}
          </p>

          <p style={{
            margin: '2px 0 0',
            fontFamily: 'Outfit, sans-serif',
            fontSize: '12px',
            color: 'var(--color-text-secondary)',
          }}>
            {town ? town + ' · ' : ''}{friendlyDate}
            {dishCount > 0 && (
              <span style={{ marginLeft: '6px', color: 'var(--color-text-tertiary)' }}>
                · {dishCount} {dishCount === 1 ? 'dish' : 'dishes'}
              </span>
            )}
          </p>

          {visit.note && (
            <p style={{
              margin: '6px 0 0',
              fontFamily: 'Outfit, sans-serif',
              fontStyle: 'italic',
              fontSize: '13px',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              "{visit.note}"
            </p>
          )}
        </div>

        {/* Kind pill — small, secondary visual */}
        <span style={{
          flex: '0 0 auto',
          fontFamily: 'Outfit, sans-serif',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          padding: '3px 8px',
          borderRadius: '999px',
          background: isLive ? 'var(--color-primary-muted)' : 'var(--color-surface)',
          color: isLive ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
          border: '1px solid ' + (isLive ? 'var(--color-primary)' : 'var(--color-divider)'),
          whiteSpace: 'nowrap',
        }}>
          {isLive ? 'live' : 'logged'}
        </span>
      </div>
    </Link>
  )
}

// Lightweight date formatter — "Today" / "Yesterday" / "Mar 12" / "Mar 12, 2024".
// Avoids the Intl.RelativeTimeFormat dep dance and keeps display consistent
// with what other journal-style surfaces in the app do.
function formatFriendlyDate(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()

  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return 'Today'

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'

  const month = d.toLocaleString('en-US', { month: 'short' })
  const day = d.getDate()
  const sameYear = d.getFullYear() === now.getFullYear()
  return sameYear ? month + ' ' + day : month + ' ' + day + ', ' + d.getFullYear()
}
