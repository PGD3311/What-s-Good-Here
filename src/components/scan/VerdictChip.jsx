import { getVerdict } from '../../utils/verdict'

// The rating mark in the menu's right margin. getVerdict maps tier + the
// site-standard rating color (green/amber/red), so a score reads the same here
// as on the dish page. Vote counts are intentionally omitted — that detail
// lives on the dish card. Three states: rated (colored number), a vote or two
// (muted gray number), none (a soft "+" invitation).
export function VerdictChip({ avgRating, totalVotes }) {
  const v = getVerdict(avgRating, totalVotes)

  if (v.tier === 'new') {
    return <span className="text-[17px] font-bold leading-none" style={{ color: 'var(--color-text-tertiary)' }}>+</span>
  }
  if (v.tier === 'early') {
    return (
      <span className="text-[15px] font-bold" style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
        {v.score}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: v.color }} />
      <span className="text-[16px] font-extrabold leading-none" style={{ color: v.color, fontVariantNumeric: 'tabular-nums' }}>{v.score}</span>
    </span>
  )
}
