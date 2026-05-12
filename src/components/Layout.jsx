import { BottomNav } from './BottomNav'
import { WelcomeSplash } from './WelcomeSplash'
import { TopBar } from './TopBar'
import { OfflineIndicator } from './OfflineIndicator'

export function Layout({ children }) {
  return (
    <div
      style={{
        backgroundColor: 'var(--color-bg)',
        minHeight: '100dvh',
        // 64px nav + safe area inset for devices with home indicator
        paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 16px))',
        // Cancel body's safe-area-top padding so .top-bar can extend its coral
        // edge-to-edge under the status bar. Non-Layout pages keep the body
        // padding so their content stays below the status bar.
        marginTop: 'calc(env(safe-area-inset-top, 0px) * -1)',
      }}
    >
      {/* Skip link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[99999] focus:px-4 focus:py-2 focus:rounded-lg focus:font-medium"
        style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
      >
        Skip to main content
      </a>
      <OfflineIndicator />
      <WelcomeSplash />
      <TopBar />
      <main id="main-content">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
