import { getVerdict } from '../../utils/verdict'

export function VerdictChip({ avgRating, totalVotes }) {
  const v = getVerdict(avgRating, totalVotes)
  if (v.tier === 'new') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap"
        style={{ color: 'var(--color-accent-gold)', border: '1.5px dashed var(--color-accent-gold)', background: 'var(--color-surface)' }}
      >
        🆕 be the first
      </span>
    )
  }
  if (v.tier === 'early') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap"
        style={{ color: 'var(--color-text-tertiary)', background: 'var(--color-surface)' }}
      >
        {v.score} · {v.votes} vote{v.votes === 1 ? '' : 's'}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-bold whitespace-nowrap"
      style={{ color: v.color, background: 'var(--color-surface-elevated)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: v.color }} />
      {v.score}
    </span>
  )
}
