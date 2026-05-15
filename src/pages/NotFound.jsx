import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function NotFound() {
  useDocumentTitle('Page not found')
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--color-surface)' }}
    >
      <div className="text-center max-w-sm">
        <img
          src="/empty-plate.webp"
          alt=""
          className="w-20 h-20 mx-auto mb-6 rounded-full object-cover"
        />
        <h1
          className="text-2xl font-bold mb-2"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Page not found
        </h1>
        <p
          className="text-sm mb-8"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Looks like this dish isn't on the menu. Let's get you back to exploring.
        </p>
        <Link
          to="/"
          className="block w-full py-3 px-6 rounded-xl font-semibold text-center transition-all hover:opacity-90"
          style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
        >
          Explore the Map
        </Link>
      </div>
    </div>
  )
}
