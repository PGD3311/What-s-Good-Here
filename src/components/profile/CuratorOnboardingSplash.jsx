const ONBOARDING_POINTS = [
  {
    title: 'Pick your Top 10',
    body: 'Add the dishes visitors should order — your personal best-of.',
  },
  {
    title: 'Rate before you add',
    body: "You can only add dishes you've rated. That's what makes your list worth trusting.",
  },
  {
    title: 'Tell them who you are',
    body: 'Add a short bio so people know whose taste they’re following.',
  },
]

export function CuratorOnboardingSplash({ onDismiss }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome, local curator"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', padding: '24px' }}
    >
      <div
        className="w-full rounded-2xl"
        style={{
          maxWidth: '420px',
          background: 'var(--color-surface-elevated)',
          padding: '28px 24px',
          maxHeight: '88vh',
          overflowY: 'auto',
        }}
      >
        <p
          style={{
            fontFamily: "'Amatic SC', cursive",
            fontSize: '40px',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            lineHeight: 1,
            marginBottom: '6px',
          }}
        >
          You're a local curator
        </p>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
          Three steps to a list people trust.
        </p>

        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {ONBOARDING_POINTS.map((point, i) => (
            <li key={point.title} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span
                style={{
                  flexShrink: 0,
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 700,
                  background: 'var(--color-primary)',
                  color: '#fff',
                }}
              >
                {i + 1}
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '2px' }}>
                  {point.title}
                </p>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
                  {point.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={onDismiss}
          className="w-full rounded-xl"
          style={{
            marginTop: '24px',
            padding: '14px',
            fontSize: '15px',
            fontWeight: 700,
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Start building
        </button>
      </div>
    </div>
  )
}
