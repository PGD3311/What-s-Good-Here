import { useState, useEffect } from 'react'
import { Seal } from './Seal'

// 1.8s total. Stamp lands at 0.9s; wordmark fadeUp (0.5s w/ 0.55s delay)
// lands at 1.05s. Hold ~0.45s, then fade out 0.3s.
const SPLASH_DURATION_MS = 1500
const FADE_OUT_MS = 300

// Module-level flag — persists across re-renders within a session so
// the splash doesn't replay when Layout remounts for any reason.
let hasShownThisSession = false

export function WelcomeSplash() {
  const [phase, setPhase] = useState('visible')
  const [shouldShow, setShouldShow] = useState(() => !hasShownThisSession)

  useEffect(() => {
    if (hasShownThisSession) return
    hasShownThisSession = true

    const fadeTimer = setTimeout(() => setPhase('fade-out'), SPLASH_DURATION_MS)
    const hideTimer = setTimeout(() => setShouldShow(false), SPLASH_DURATION_MS + FADE_OUT_MS)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  const handleSkip = () => {
    setPhase('fade-out')
    setTimeout(() => setShouldShow(false), FADE_OUT_MS)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleSkip()
    }
  }

  if (!shouldShow) return null

  return (
    <div
      className="wgh-splash"
      style={{ opacity: phase === 'fade-out' ? 0 : 1 }}
      onClick={handleSkip}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Welcome splash screen. Press Enter or tap to skip."
    >
      <Seal
        className="wgh-splash__seal"
        size={160}
        plateColor="var(--color-surface)"
        monoColor="var(--color-primary)"
        ringColor="var(--color-surface)"
        borderColor="var(--color-surface)"
      />
      <div className="wgh-splash__wordmark">
        <span className="wgh-splash__line">what&rsquo;s</span>
        <span className="wgh-splash__line">good</span>
        <span className="wgh-splash__line">
          here<span className="wgh-splash__period">.</span>
        </span>
      </div>
    </div>
  )
}
