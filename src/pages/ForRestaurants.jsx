import { useNavigate } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

/**
 * ForRestaurants — pitch page for door-knocking.
 * Shows on Denis's phone when talking to restaurant owners.
 * No auth, no data fetching, pure persuasion.
 */
export function ForRestaurants() {
  useDocumentTitle('For restaurants')
  var navigate = useNavigate()

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      {/* Hero */}
      <div className="px-6 pt-12 pb-8 text-center">
        <div
          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold mb-6"
          style={{ background: 'var(--color-primary-muted)', color: 'var(--color-primary)' }}
        >
          FREE FOR RESTAURANTS
        </div>
        <h1
          className="font-bold leading-tight"
          style={{ fontSize: '32px', color: 'var(--color-text-primary)' }}
        >
          Your best dishes,{' '}
          <span style={{ color: 'var(--color-primary)' }}>ranked by locals</span>
        </h1>
        <p
          className="mt-4 mx-auto"
          style={{
            fontSize: '16px',
            color: 'var(--color-text-secondary)',
            maxWidth: '320px',
            lineHeight: 1.5,
          }}
        >
          What's Good Here helps tourists find your restaurant through your
          highest-rated dishes — not ads, not reviews, real votes.
        </p>
      </div>

      {/* How it works */}
      <div className="px-6 pb-8">
        <h2
          className="font-bold text-center mb-5"
          style={{ fontSize: '13px', letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}
        >
          How It Works
        </h2>
        <ol className="space-y-3 list-none p-0 m-0">
          {[
            {
              num: '1',
              title: 'Locals vote on your dishes',
              desc: 'Simple 1-10 rating: "Would you order this again?" No long reviews, no fake stars.',
            },
            {
              num: '2',
              title: 'Your best dishes climb the rankings',
              desc: 'Top-rated dishes appear on the leaderboard. Tourists see what\'s actually good.',
            },
            {
              num: '3',
              title: 'Tourists find you through your food',
              desc: 'They search "best lobster roll" and your dish shows up — ranked, rated, trusted.',
            },
          ].map(function (step) {
            return (
              <li
                key={step.num}
                className="flex items-start gap-4 p-4 rounded-xl"
                style={{ background: 'var(--color-card)', border: '2px solid var(--color-card-border)' }}
              >
                <span
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold"
                  style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)', fontSize: '14px' }}
                  aria-hidden="true"
                >
                  {step.num}
                </span>
                <div>
                  <p className="font-bold" style={{ fontSize: '15px', color: 'var(--color-text-primary)' }}>
                    {step.title}
                  </p>
                  <p className="mt-1" style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                    {step.desc}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {/* Value props */}
      <div className="px-6 pb-8">
        <h2
          className="font-bold text-center mb-5"
          style={{ fontSize: '13px', letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}
        >
          Why Restaurants Love It
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: '0', label: 'Cost to you', desc: 'Free. Forever.' },
            { icon: '10s', label: 'Time to set up', desc: 'We add your menu' },
            { icon: '80%', label: 'Users are tourists', desc: 'New customers, not regulars' },
            { icon: '0', label: 'Fake reviews', desc: 'Vote-based, not review-based' },
          ].map(function (prop) {
            return (
              <div
                key={prop.label}
                className="p-4 rounded-xl text-center"
                style={{ background: 'var(--color-card)', border: '2px solid var(--color-card-border)' }}
              >
                <p className="font-bold" style={{ fontSize: '24px', color: 'var(--color-primary)' }}>
                  {prop.icon}
                </p>
                <p className="font-bold mt-1" style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
                  {prop.label}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                  {prop.desc}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* What you get */}
      <div className="px-6 pb-8">
        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--color-card)', border: '2px solid var(--color-card-border)' }}
        >
          <h3 className="font-bold mb-3" style={{ fontSize: '16px', color: 'var(--color-text-primary)' }}>
            Your restaurant gets:
          </h3>
          <ul className="space-y-2.5">
            {[
              'A dedicated page with all your dishes ranked',
              'Real-time ratings from actual customers',
              'Free promotion when your dishes trend',
              'A manager dashboard to track performance',
              'Ability to post specials and events',
            ].map(function (item) {
              return (
                <li key={item} className="flex items-start gap-2.5">
                  <span
                    className="flex-shrink-0 mt-0.5"
                    style={{ color: 'var(--color-primary)', fontSize: '14px', fontWeight: 800 }}
                  >
                    +
                  </span>
                  <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                    {item}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 pb-12 text-center">
        <button
          onClick={function () { navigate('/restaurants') }}
          className="w-full py-4 rounded-xl font-bold text-base transition-all active:scale-[0.98]"
          style={{
            background: 'var(--color-primary)',
            color: 'var(--color-text-on-primary)',
            border: '2px solid var(--color-primary)',
          }}
        >
          See Restaurants on WGH
        </button>
        <p className="mt-4" style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>
          Questions? Reach out — <a href="mailto:denisgingras75@gmail.com" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>denisgingras75@gmail.com</a>
        </p>
      </div>
    </div>
  )
}
