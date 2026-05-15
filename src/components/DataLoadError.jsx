/**
 * DataLoadError — shown when a top-level data fetch fails for a logged-in user.
 *
 * Purpose: distinguish "we couldn't reach the server" from "you have no data."
 * Without this, a Supabase blip on profile/home reads like the user's account
 * got wiped. See agent-phone audit #169 P0-1.
 *
 * Pass `fullPage` for a centered viewport-height layout (use on Profile when
 * the entire page failed). Default is an inline banner.
 */
export function DataLoadError({ message, onRetry, fullPage = false }) {
  const content = (
    <div
      className="flex flex-col items-center text-center px-6"
      style={{ maxWidth: '420px', margin: '0 auto' }}
    >
      <div
        className="flex items-center justify-center mb-4"
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'rgba(220, 38, 38, 0.10)',
        }}
        aria-hidden="true"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 8v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3Z"
            stroke="var(--color-danger)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2
        className="text-lg font-bold mb-2"
        style={{ color: 'var(--color-text-primary)' }}
      >
        We couldn’t load your data
      </h2>
      <p
        className="text-sm mb-5"
        style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}
      >
        {message || 'This usually means a network blip. Your account is fine — try again in a moment.'}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-5 py-2.5 rounded-xl font-semibold text-sm"
          style={{
            background: 'var(--color-primary)',
            color: 'var(--color-text-on-primary, white)',
          }}
        >
          Try again
        </button>
      )}
    </div>
  )

  if (fullPage) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: '100dvh', background: 'var(--color-bg)' }}
      >
        {content}
      </div>
    )
  }

  return (
    <div className="py-10 px-4">
      {content}
    </div>
  )
}
