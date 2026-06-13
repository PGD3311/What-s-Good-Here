import { getRatingColor } from '../../utils/ranking'

export function BatchSummary({
  restaurantName,
  dishes,
  ratingsById,
  onBack,
  onEdit,
  onSubmit,
  submitting,
  submitError,
  uploadStatus,
}) {
  var submittedCount = submitError && submitError.submittedCount != null ? submitError.submittedCount : 0

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--color-bg)' }}>
      <div
        className="sticky top-0 z-20 px-4 py-3"
        style={{
          background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-divider)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
            style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)' }}
            aria-label="Back to dishes"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h1
              className="font-bold"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--color-text-primary)',
                fontSize: '20px',
                fontWeight: 700,
                letterSpacing: '0',
              }}
            >
              Review Your Meal
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              {restaurantName}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-3">
        {dishes.map(function (dish, index) {
          var rating = ratingsById[dish.clientId]
          return (
            <button
              key={dish.clientId}
              onClick={function () { onEdit(index) }}
              className="w-full text-left rounded-2xl px-4 py-4 transition-all active:scale-[0.99]"
              style={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-divider)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {dish.name}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="font-bold text-lg" style={{ color: getRatingColor(rating.rating10) }}>
                      {Number(rating.rating10).toFixed(1)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>/10</span>
                    {rating.reviewText ? (
                      <span
                        className="px-2 py-1 rounded-full text-xs font-semibold"
                        style={{
                          background: 'var(--color-surface)',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        Note
                      </span>
                    ) : null}
                    {rating.photoFile ? (
                      <span
                        className="px-2 py-1 rounded-full text-xs font-semibold"
                        style={{
                          background: 'var(--color-primary-muted)',
                          color: 'var(--color-primary)',
                        }}
                      >
                        Photo
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
                    Edit
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                    Dish {index + 1}
                  </p>
                </div>
              </div>
            </button>
          )
        })}

        {submitError && (
          <div
            className="rounded-2xl px-4 py-4"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-danger)',
            }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>
              {submittedCount > 0
                ? 'Stopped after ' + submittedCount + ' dish' + (submittedCount === 1 ? '' : 'es')
                : "Couldn't submit your meal"}
            </p>
            <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
              {submitError?.message || 'Please try again.'}
            </p>
            {submittedCount > 0 && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                Retry is safe. Existing votes update in place.
              </p>
            )}
          </div>
        )}

        {uploadStatus && (
          <div
            className="rounded-2xl px-4 py-4"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-divider)',
            }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Preparing photos
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              {uploadStatus}
            </p>
          </div>
        )}
      </div>

      <div
        className="fixed left-0 right-0 z-30 px-4 pt-3 pb-3"
        style={{
          bottom: 'calc(64px + env(safe-area-inset-bottom))',
          background: 'var(--color-bg)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.08)',
        }}
      >
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="w-full rounded-2xl py-3.5 font-bold text-sm transition-all"
          style={{
            background: submitting ? 'var(--color-surface-elevated)' : 'var(--color-primary)',
            color: submitting ? 'var(--color-text-tertiary)' : 'var(--color-text-on-primary)',
          }}
        >
          {submitting ? 'Submitting...' : 'Submit All'}
        </button>
      </div>
    </div>
  )
}
