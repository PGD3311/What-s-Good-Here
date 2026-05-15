import { useState } from 'react'
import { JITTER_TIERS } from '../constants/jitter'
import { jitterApi } from '../api/jitterApi'
import { logger } from '../utils/logger'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

/**
 * JitterLanding — standalone explainer page.
 * Three layers: Hook → Explainer → Protocol.
 * Route: /jitter
 */
export default function JitterLanding() {
  useDocumentTitle('Jitter — every review is verified human')
  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <HookSection />
      <ExplainerSection />
      <ProtocolSection />
      <WaitlistSection position="bottom" />
      <Footer />
    </div>
  )
}

// ── Layer 1: The Hook ──────────────────────────────────────────────

function HookSection() {
  return (
    <section className="px-6 pt-16 pb-12 text-center" style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div className="mb-6">
        <JitterWordmark />
      </div>
      <h1
        className="text-3xl font-bold mb-4"
        style={{ color: 'var(--color-text-primary)', lineHeight: 1.2, letterSpacing: '-0.02em' }}
      >
        Every review is verified human.
      </h1>
      <p className="text-base mb-8" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
        Jitter proves reviews are written by real people using typing patterns — not what you type, just how.
        No surveillance. No tracking. Just proof.
      </p>
      <WaitlistSection position="top" />
    </section>
  )
}

// ── Layer 2: The Explainer ─────────────────────────────────────────

function ExplainerSection() {
  return (
    <section className="px-6 py-12" style={{ maxWidth: '640px', margin: '0 auto' }}>
      {/* How it works */}
      <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--color-text-primary)' }}>
        How it works
      </h2>
      <div className="flex flex-col gap-4 mb-10">
        <StepCard number="1" title="You type" description="Write your review naturally. Jitter runs silently in the background." />
        <StepCard number="2" title="Jitter reads rhythm" description="Timing between keystrokes creates a unique pattern — like a fingerprint, but for typing." />
        <StepCard number="3" title="Badge earned over time" description="One session isn't enough. Trust builds across multiple reviews over weeks and months." />
      </div>

      {/* What the tiers mean */}
      <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
        What the badges mean
      </h2>
      <div className="flex flex-col gap-3 mb-10">
        {Object.keys(JITTER_TIERS).map(function (key) {
          var tier = JITTER_TIERS[key]
          return (
            <div key={key} className="rounded-xl p-4" style={{ background: tier.bg }}>
              <p className="font-semibold text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>
                {tier.label}
              </p>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                {tier.description}
              </p>
            </div>
          )
        })}
      </div>

      {/* What we don't do */}
      <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
        What we don't do
      </h2>
      <div className="flex flex-col gap-3 mb-10">
        <PrivacyPoint text="We never see your words. Only timing metadata." />
        <PrivacyPoint text="We never track you across sites." />
        <PrivacyPoint text="Everything stays on your device by default." />
        <PrivacyPoint text="No account required. No personal data collected." />
      </div>

      {/* Why time matters */}
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-divider)' }}
      >
        <h3 className="font-bold text-sm mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Why time is the defense
        </h3>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
          A bot can fake one typing session. It cannot economically maintain consistent human-like patterns
          across months of reviews. The longer you use Jitter, the more your trust compounds — and the more
          expensive it becomes for anyone to fake it.
        </p>
      </div>
    </section>
  )
}

// ── Layer 3: The Protocol ──────────────────────────────────────────

function ProtocolSection() {
  return (
    <section className="px-6 py-12" style={{ maxWidth: '640px', margin: '0 auto', borderTop: '1.5px solid var(--color-divider)' }}>
      <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--color-text-primary)' }}>
        The protocol
      </h2>

      {/* WAR Score */}
      <h3 className="font-bold text-sm mb-2 mt-6" style={{ color: 'var(--color-text-primary)' }}>
        The WAR Score (0–10)
      </h3>
      <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
        Weighted Authenticity Rating. Nine signals, each measuring a different dimension of human typing:
      </p>
      <div className="flex flex-col gap-1.5 mb-6">
        <SignalRow name="Rhythm consistency" weight="18%" description="How stable is your bigram timing across a session?" />
        <SignalRow name="Per-key uniqueness" weight="15%" description="Does each key have its own dwell signature?" />
        <SignalRow name="Cross-signal correlation" weight="15%" description="Do your signals move independently or in lockstep?" />
        <SignalRow name="Distribution shape" weight="12%" description="Does your timing follow natural human distributions?" />
        <SignalRow name="Inter-key variance" weight="10%" description="How much does your speed vary between different key pairs?" />
        <SignalRow name="Dwell consistency" weight="10%" description="How long you hold each key — and how consistent that is." />
        <SignalRow name="Average dwell" weight="8%" description="Baseline hold time across all keys." />
        <SignalRow name="Editing behavior" weight="7%" description="Backspaces, corrections, rewrites — the mess of real writing." />
        <SignalRow name="Typing purity" weight="5%" description="Ratio of original typing to pasted content." />
      </div>

      {/* Cryptographic proof */}
      <h3 className="font-bold text-sm mb-2" style={{ color: 'var(--color-text-primary)' }}>
        Cryptographic proof
      </h3>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
        Every session generates an ECDSA P-256 signature over your typing metrics. These signatures chain
        together into a hash chain — a tamper-evident ledger of your typing history. No one can insert or
        remove sessions without breaking the chain.
      </p>

      {/* Sequential gating */}
      <h3 className="font-bold text-sm mb-2" style={{ color: 'var(--color-text-primary)' }}>
        Sequential trust gating
      </h3>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
        Defenses run in series, not parallel. Fail any gate and you restart from day one. Each gate multiplies
        the cost of faking it. Phone verification alone costs $0.01. But phone + aged account + time dilation +
        biometric scoring + dish-level granularity pushes the cost of 50 fake reviews past $2,000.
      </p>

      {/* For developers */}
      <div
        className="rounded-xl p-5 mt-6"
        style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-divider)' }}
      >
        <h3 className="font-bold text-sm mb-2" style={{ color: 'var(--color-text-primary)' }}>
          For developers
        </h3>
        <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
          Jitter is becoming an embeddable widget — drop a script tag, get human verification on any text input.
          Like reCAPTCHA, but for content authenticity instead of form submission.
        </p>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
          Join the waitlist below for early access.
        </p>
      </div>

      {/* Patent */}
      <p className="text-xs mt-6" style={{ color: 'var(--color-text-tertiary)' }}>
        Patent pending. US Provisional Applications #63/994,858 and #63/997,498.
      </p>
    </section>
  )
}

// ── Waitlist ───────────────────────────────────────────────────────

function WaitlistSection({ position }) {
  var [email, setEmail] = useState('')
  var [status, setStatus] = useState(null) // null | 'sending' | 'done' | 'error'

  function handleSubmit(e) {
    e.preventDefault()
    if (!email || status === 'sending') return
    setStatus('sending')

    jitterApi.joinWaitlist(email, position === 'bottom' ? 'developer' : 'general')
      .then(function () {
        setStatus('done')
        setEmail('')
      })
      .catch(function (err) {
        logger.error('Waitlist failed:', err)
        setStatus('error')
      })
  }

  if (status === 'done') {
    return (
      <p className="text-sm text-center py-3" style={{ color: 'var(--color-rating)' }}>
        You're on the list. We'll be in touch.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 max-w-sm mx-auto">
      <input
        type="email"
        value={email}
        onChange={function (e) { setEmail(e.target.value) }}
        placeholder="your@email.com"
        required
        className="flex-1 rounded-xl px-4 py-2.5 text-sm"
        style={{
          background: 'var(--color-surface)',
          border: '1.5px solid var(--color-divider)',
          color: 'var(--color-text-primary)',
          outline: 'none',
        }}
      />
      <button
        type="submit"
        disabled={status === 'sending'}
        className="rounded-xl px-5 py-2.5 text-sm font-semibold"
        style={{
          background: 'var(--color-primary)',
          color: 'white',
          opacity: status === 'sending' ? 0.6 : 1,
        }}
      >
        {status === 'sending' ? '...' : 'Join'}
      </button>
    </form>
  )
}

// ── Shared small components ────────────────────────────────────────

function JitterWordmark() {
  return (
    <span
      style={{
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontWeight: 700,
        fontSize: '14px',
        letterSpacing: '0.08em',
        color: 'var(--color-rating)',
        textTransform: 'lowercase',
      }}
    >
      jitter
    </span>
  )
}

function StepCard({ number, title, description }) {
  return (
    <div className="flex gap-4 items-start">
      <span
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
        style={{ background: 'var(--color-primary)', color: 'white' }}
      >
        {number}
      </span>
      <div>
        <p className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{title}</p>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{description}</p>
      </div>
    </div>
  )
}

function PrivacyPoint({ text }) {
  return (
    <div className="flex gap-2 items-start">
      <span className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-rating)' }}>&#10003;</span>
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{text}</p>
    </div>
  )
}

function SignalRow({ name, weight, description }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: 'var(--color-surface)' }}>
      <div className="flex justify-between mb-0.5">
        <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{name}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{weight}</span>
      </div>
      <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{description}</p>
    </div>
  )
}

function Footer() {
  return (
    <footer className="px-6 py-8 text-center" style={{ borderTop: '1.5px solid var(--color-divider)' }}>
      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
        Jitter Integrity Tracking &amp; Typing Entropy Recognition<br />
        Patent pending &middot; Built on Martha's Vineyard
      </p>
    </footer>
  )
}
