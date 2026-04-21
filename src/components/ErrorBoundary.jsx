import { Component } from 'react'
import { isChunkLoadError, tryChunkReload } from '../utils/chunkReload'

function ErrorFallback({ error, resetError }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-bg)' }}>
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
          <span className="text-2xl">😵</span>
        </div>
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Something went wrong
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          We've been notified and are working on it. Try refreshing the page.
        </p>
        <div className="space-y-3">
          <button
            onClick={() => window.location.reload()}
            className="w-full px-4 py-3 font-semibold rounded-xl"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
          >
            Refresh Page
          </button>
          <button
            onClick={resetError}
            className="w-full px-4 py-3 font-medium rounded-xl"
            style={{ color: 'var(--color-text-primary)', border: '1px solid var(--color-divider)' }}
          >
            Try Again
          </button>
        </div>
        {import.meta.env.DEV && (
          <details className="mt-6 text-left">
            <summary className="text-xs cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>
              Error details (dev only)
            </summary>
            <pre className="mt-2 p-3 rounded-lg text-xs overflow-auto" style={{ background: 'var(--color-surface)', color: 'var(--color-danger)' }}>
              {error?.message}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}

// Custom error boundary that lazy-loads Sentry for error reporting
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Log the real error to console BEFORE anything else — if Sentry's
    // dynamic import fails (e.g. Capacitor file:// scheme issues), we still
    // want the truth in the native log. Error objects don't stringify well,
    // so pull the fields explicitly.
    console.error('[ErrorBoundary caught]', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      type: error?.type,
      componentStack: errorInfo?.componentStack,
    })

    // Auto-reload on chunk load errors (fallback if lazyWithRetry misses it).
    // Shared attempt counter prevents reload loops across both paths.
    if (isChunkLoadError(error) && tryChunkReload()) return

    // Lazy-load Sentry and report the error
    if (import.meta.env.PROD) {
      import('@sentry/react').then(Sentry => {
        Sentry.captureException(error, {
          contexts: {
            react: {
              componentStack: errorInfo?.componentStack,
            },
          },
        })
      }).catch(sentryErr => {
        console.error('[ErrorBoundary] Sentry failed to load:', sentryErr?.message || sentryErr)
      })
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          resetError={this.resetError}
        />
      )
    }

    return this.props.children
  }
}
