import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useProfile } from '../../hooks/useProfile'
import { WghLogo } from '../WghLogo'
import { capture } from '../../lib/analytics'
import { getUserMessage } from '../../utils/errorHandler'

const STEPS = [
  {
    id: 'welcome',
    title: 'Find the best dishes near you',
    subtitle: 'Real ratings from locals & visitors like you',
    description: 'Find the best food faster.',
  },
  {
    id: 'how-it-works',
    icon: 'star',
    title: "Rate dishes you've actually tried, 1–10.",
    subtitle: 'Find the best food faster.',
    description: 'Your ratings help locals and visitors discover what\'s actually good.',
  },
  {
    id: 'photos',
    icon: 'camera',
    title: 'Snap it before you eat it',
    subtitle: 'Real photos from real people',
    description: 'No stock photos. When you order something, snap a quick pic — the community will thank you.',
  },
  {
    id: 'name',
    emoji: '\uD83D\uDC4B',
    title: 'Enter your name',
    subtitle: 'Join the community',
    description: 'Friends can find you by your name',
  },
]

export function WelcomeModal() {
  const { user } = useAuth()
  const { profile, updateProfile, loading } = useProfile(user?.id)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [isOpen, setIsOpen] = useState(false)
  const [phase, setPhase] = useState('onboarding') // 'onboarding' | 'celebration' | 'fade-out'

  // Skip name step if user already set one during signup
  const hasName = profile?.display_name && profile.display_name.trim().length > 0
  const activeSteps = hasName ? STEPS.filter(s => s.id !== 'name') : STEPS

  useEffect(() => {
    if (user && !loading && profile) {
      if (!profile.has_onboarded) {
        setIsOpen(true)
        capture('onboarding_started')
      }
    }
  }, [user, profile, loading])

  const displayName = name.trim() || profile?.display_name || ''

  const completeOnboarding = async (nameSet) => {
    // Snapshot the name at submit time so a late-typed character can't desync
    // what gets persisted from what the celebration screen shows.
    const submittedName = name.trim()
    setSaving(true)
    setSaveError(null)
    const updates = { has_onboarded: true }
    if (submittedName) updates.display_name = submittedName
    const { error } = await updateProfile(updates)
    setSaving(false)

    if (error) {
      // Surface the error so the user can correct it (most likely: duplicate display_name)
      setSaveError(getUserMessage(error, 'saving your name'))
      capture('onboarding_failed', { name_set: nameSet, error: error.message })
      return
    }

    capture('onboarding_completed', { name_set: nameSet })

    // Show celebration screen
    setPhase('celebration')

    // Auto-dismiss after 2.5s
    setTimeout(() => setPhase('fade-out'), 2500)
    setTimeout(() => setIsOpen(false), 2800)
  }

  const handleNext = async () => {
    if (step < activeSteps.length - 1) {
      setStep(step + 1)
    } else {
      await completeOnboarding(hasName)
    }
  }

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1)
    }
  }

  const handleNameSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    await completeOnboarding(true)
  }

  const handleSkipName = async () => {
    await completeOnboarding(false)
  }

  if (!isOpen) return null

  // ==================== CELEBRATION SCREEN ====================
  if (phase === 'celebration' || phase === 'fade-out') {
    return (
      <div
        className="fixed inset-0 z-[100000] flex items-center justify-center p-4"
        style={{
          opacity: phase === 'fade-out' ? 0 : 1,
          transition: 'opacity 300ms ease-out',
        }}
      >
        <div
          className="absolute inset-0"
          style={{ background: 'var(--color-bg)' }}
        />

        <div className="relative z-10 text-center px-8">
          {/* Logo — matches splash page layout */}
          <div className="flex justify-center" style={{ marginBottom: '-18px', position: 'relative', zIndex: 2 }}>
            <WghLogo size={72} />
          </div>

          {/* Brand name */}
          <h1
            style={{
              fontFamily: "'Amatic SC', cursive",
              fontSize: '42px',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              lineHeight: 1,
              letterSpacing: '0.04em',
              position: 'relative',
              zIndex: 1,
            }}
          >
            What's <span style={{ color: 'var(--color-primary)' }}>Good</span> Here
          </h1>

          {/* Welcome line */}
          <p
            style={{
              color: 'var(--color-text-primary)',
              fontSize: '18px',
              fontWeight: 500,
              lineHeight: 1.4,
              marginTop: '16px',
            }}
          >
            Welcome{displayName ? `, ${displayName}` : ''}.
          </p>

          {/* Tagline — matches splash page */}
          <p
            style={{
              color: 'var(--color-text-secondary)',
              opacity: 0.7,
              fontSize: '13px',
              fontWeight: 500,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginTop: '14px',
            }}
          >
            Dish Discovery
          </p>
        </div>
      </div>
    )
  }

  // ==================== ONBOARDING STEPS ====================
  const currentStep = activeSteps[step]
  const isNameStep = currentStep.id === 'name'

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm pointer-events-none" />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Welcome"
        className="relative z-10 rounded-3xl max-w-md w-full shadow-xl overflow-hidden"
        style={{ animationDelay: '0.1s', background: 'var(--color-text-on-primary)' }}
      >
        {/* Decorative gradient header */}
        <div className="h-2" style={{ background: 'var(--color-primary)' }} />

        <div className="p-8">
          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-6">
            {activeSteps.map((_, i) => (
              <button
                key={i}
                onClick={() => i < step && setStep(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === step
                    ? 'w-6'
                    : i < step
                      ? 'cursor-pointer'
                      : ''
                }`}
                style={{
                  background: i === step
                    ? 'var(--color-primary)'
                    : i < step
                      ? 'var(--color-primary-muted, rgba(244, 122, 31, 0.5))'
                      : 'var(--color-divider)'
                }}
                disabled={i > step}
              />
            ))}
          </div>

          {/* Step icon */}
          {currentStep.id === 'welcome' ? (
            <div className="flex justify-center mb-6">
              <WghLogo size={56} />
            </div>
          ) : (
            <div
              className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center shadow-lg transition-all"
              style={{ background: 'var(--color-primary)' }}
            >
              {currentStep.icon === 'star' ? <span className="text-4xl">⭐</span>
                : currentStep.icon === 'camera' ? (
                  <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                  </svg>
                ) : <span className="text-4xl">{currentStep.emoji}</span>}
            </div>
          )}

          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
              {currentStep.title}
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {currentStep.subtitle}
            </p>
            {currentStep.description && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                {currentStep.description}
              </p>
            )}
          </div>

          {/* How it works visual — rating-first rail */}
          {currentStep.id === 'how-it-works' && (
            <div className="flex justify-center items-center gap-2 mb-6">
              {[3, 5, 7, 9, 10].map((n) => (
                <div
                  key={n}
                  className="flex flex-col items-center justify-center rounded-xl"
                  style={{
                    width: 44,
                    height: 44,
                    background: n >= 8
                      ? 'rgba(22, 163, 74, 0.15)'
                      : n >= 6
                        ? 'rgba(245, 158, 11, 0.15)'
                        : 'rgba(220, 38, 38, 0.08)',
                    color: n >= 8
                      ? 'var(--color-rating)'
                      : n >= 6
                        ? 'var(--color-accent-gold)'
                        : 'var(--color-text-secondary)',
                    fontWeight: 700,
                  }}
                >
                  {n}
                </div>
              ))}
            </div>
          )}

          {/* Photos step visual */}
          {currentStep.id === 'photos' && (
            <div className="flex justify-center gap-3 mb-6">
              <div className="flex flex-col items-center p-3 rounded-xl" style={{ background: 'var(--color-category-strip)' }}>
                <span className="text-2xl mb-1">📸</span>
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Snap</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-xl" style={{ background: 'var(--color-category-strip)' }}>
                <span className="text-2xl mb-1">⬆️</span>
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Upload</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-xl" style={{ background: 'var(--color-category-strip)' }}>
                <span className="text-2xl mb-1">🍽️</span>
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Help others</span>
              </div>
            </div>
          )}

          {/* Name input step */}
          {isNameStep ? (
            <form onSubmit={handleNameSubmit} className="space-y-4">
              <input
                id="welcome-name"
                aria-label="Your name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (saveError) setSaveError(null)
                }}
                placeholder="Your name"
                autoFocus
                maxLength={50}
                disabled={saving}
                className="w-full px-4 py-4 border-2 rounded-xl text-lg text-center focus:outline-none transition-colors disabled:opacity-60"
                style={{
                  background: 'var(--color-bg)',
                  borderColor: saveError ? 'var(--color-danger)' : 'var(--color-divider)',
                  color: 'var(--color-text-primary)',
                }}
              />
              {saveError && (
                <p
                  role="alert"
                  className="text-sm text-center"
                  style={{ color: 'var(--color-danger)' }}
                >
                  {saveError}
                </p>
              )}
              <button
                type="submit"
                disabled={!name.trim() || saving}
                className="w-full px-6 py-4 font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
              >
                {saving ? 'Saving...' : "Let's go!"}
              </button>
              <button
                type="button"
                onClick={handleSkipName}
                disabled={saving}
                className="w-full py-2 text-sm transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Skip for now
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              {saveError && (
                <p
                  role="alert"
                  className="text-sm text-center"
                  style={{ color: 'var(--color-danger)' }}
                >
                  {saveError}
                </p>
              )}
              <button
                onClick={handleNext}
                disabled={saving}
                className="w-full px-6 py-4 font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
              >
                {saving ? 'Saving...' : step === activeSteps.length - 1 ? "Let's go!" : 'Next'}
              </button>
              {step > 0 && (
                <button
                  onClick={handleBack}
                  className="w-full py-2 text-sm transition-colors"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  Back
                </button>
              )}
            </div>
          )}

          {/* Fun footer text */}
          {!isNameStep && (
            <p className="mt-6 text-xs text-center" style={{ color: 'var(--color-text-tertiary)' }}>
              {step === 0 && "Trusted by island food lovers"}
              {step === 1 && "Dishes need 5+ votes to get ranked"}
              {step === 2 && "Your photos help everyone eat better"}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
