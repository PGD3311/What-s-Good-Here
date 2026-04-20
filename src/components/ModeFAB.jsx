export function ModeFAB({ mode, onToggle }) {
  var isMap = mode === 'map'

  return (
    <button
      onClick={onToggle}
      aria-label={isMap ? 'Switch to list view' : 'Switch to map view'}
      className="flex items-center gap-2 px-4 py-3"
      style={{
        position: 'fixed',
        // 64px nav + 16px gap + home-indicator safe area
        bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
        right: '16px',
        zIndex: 50,
        borderRadius: '28px',
        background: 'var(--color-surface-elevated)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.15)',
        border: '1px solid var(--color-divider)',
        fontSize: '14px',
        fontWeight: 700,
        color: 'var(--color-text-primary)',
        cursor: 'pointer',
      }}
    >
      {isMap ? (
        <>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
          List
        </>
      ) : (
        <>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
          </svg>
          Map
        </>
      )}
    </button>
  )
}
