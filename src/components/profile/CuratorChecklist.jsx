const CHECKLIST_STEPS = [
  { key: 'hasDish', label: 'Add a dish', hint: 'Search and add a dish you love.' },
  { key: 'hasBio', label: 'Write your bio', hint: 'Tell visitors whose taste this is.' },
  { key: 'isPublished', label: 'Publish your list', hint: 'Go live on the homepage.' },
]

function CheckMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

export function CuratorChecklist({ hasDish, hasBio, isPublished }) {
  const done = { hasDish, hasBio, isPublished }
  if (hasDish && hasBio && isPublished) return null

  return (
    <div
      className="mx-4 mb-3 rounded-xl"
      style={{
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-divider)',
        padding: '14px 16px',
      }}
    >
      <p
        style={{
          fontFamily: "'Amatic SC', cursive",
          fontSize: '26px',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          marginBottom: '8px',
          lineHeight: 1,
        }}
      >
        Set up your list
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {CHECKLIST_STEPS.map((step, i) => {
          const isDone = done[step.key]
          return (
            <li key={step.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span
                style={{
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: isDone ? 'var(--color-success)' : 'transparent',
                  color: isDone ? '#fff' : 'var(--color-text-tertiary)',
                  border: isDone ? 'none' : '1.5px solid var(--color-divider)',
                }}
              >
                {isDone ? <CheckMark /> : i + 1}
              </span>
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: isDone ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                    textDecoration: isDone ? 'line-through' : 'none',
                  }}
                >
                  {step.label}
                </p>
                {!isDone && (
                  <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    {step.hint}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
