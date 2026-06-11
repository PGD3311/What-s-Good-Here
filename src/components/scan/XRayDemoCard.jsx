import { VerdictChip } from './VerdictChip'

// The landing page's show-don't-tell: a little paper menu being x-rayed on
// loop, using the REAL VerdictChip component so the demo is never out of sync
// with what a scan actually renders. Purely decorative — hidden from a11y tree.
const DEMO_ROWS = [
  { name: 'Lobster Roll', price: 34, avgRating: 9.4, totalVotes: 12 },
  { name: 'Fried Clams', price: 22, avgRating: 9.1, totalVotes: 2 },
  { name: 'Crab Cakes', price: 24, avgRating: null, totalVotes: 0 },
]

export function XRayDemoCard() {
  return (
    <div className="relative w-full" aria-hidden="true">
      <div
        className="relative mx-auto px-4 pt-2.5 pb-3 overflow-hidden"
        style={{
          maxWidth: '330px',
          background: 'var(--color-surface-elevated)',
          borderRadius: '6px',
          border: '1px solid var(--color-category-strip)',
          transform: 'rotate(-1.5deg)',
          boxShadow: '0 14px 30px rgba(40,30,20,0.16), 0 2px 6px rgba(40,30,20,0.08)',
        }}
      >
        <p
          className="text-center mb-0.5"
          style={{
            fontFamily: "'Amatic SC', cursive",
            fontWeight: 700,
            fontSize: '21px',
            letterSpacing: '1.5px',
            color: 'var(--color-accent-gold)',
          }}
        >
          THE MAINS
        </p>
        {DEMO_ROWS.map((row) => (
          <div key={row.name} className="flex items-center gap-2 py-1.5">
            <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
              {row.name}
            </span>
            <span
              className="flex-1 mb-1"
              style={{ borderBottom: '1.5px dotted var(--color-text-tertiary)', opacity: 0.45, minWidth: '12px' }}
            />
            <span className="text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>${row.price}</span>
            <VerdictChip avgRating={row.avgRating} totalVotes={row.totalVotes} />
          </div>
        ))}
        <div className="xray-demo-line" />
      </div>
      <style>{`
        .xray-demo-line {
          position: absolute; left: 0; right: 0; top: 0; height: 2px;
          background: linear-gradient(90deg, transparent, var(--color-rating), #fff, var(--color-rating), transparent);
          box-shadow: 0 0 14px 3px rgba(22, 163, 74, 0.45);
          animation: xray-demo-sweep 3.4s cubic-bezier(0.5, 0, 0.5, 1) infinite;
          pointer-events: none;
        }
        @keyframes xray-demo-sweep {
          0%   { top: 6%;  opacity: 0; }
          10%  { opacity: 1; }
          48%  { top: 92%; opacity: 1; }
          58%  { top: 92%; opacity: 0; }
          100% { top: 6%;  opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .xray-demo-line { animation: none; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
