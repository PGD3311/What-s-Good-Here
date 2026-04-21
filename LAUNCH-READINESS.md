# Launch Readiness — Memorial Day 2026-05-25

**~38 days remaining as of 2026-04-17.**

Any Claude session (Dan's, Denis's, mine, a future one) can check items off as work ships. If you see `[ ]` and you just shipped the thing, tick it. If you see `[x]` on something that's actually broken, flip it back and leave a one-line note.

> **Dan:** I seeded this with what I knew from session history. Review and correct — I marked only items I was sure about.

---

## Core experience

- [ ] Dish rankings + map discovery — polished, verified on iOS + Android
- [ ] "50 Best Dishes on MV" curated list (Denis)
- [ ] Toast POS integration — Order Now buttons with auto-detected slugs (Denis)
- [ ] Ask WGH v1 — conversational dish finder, rate-limited (2 guest / 6 logged-in per hour), prompt-cached
- [ ] Check In + action buttons (Order / Directions / Call) on dishes + restaurants (Denis)
- [ ] Dual-mode homepage (list/map) tested end-to-end on mobile Safari + Chrome

## Trust & safety

- [ ] Jitter WAR v2 — keystroke biometrics for review trust (Denis)
- [x] Column-lock triggers on dishes/specials/events — PR #37
- [x] Vote-gated delete policy — PR #37
- [x] FK `ON DELETE` strategies unblock Delete Account — PR #36
- [ ] Rate limiting verified under synthetic load
- [ ] Content safety (`validateUserContent`) verified end-to-end
- [ ] Admin moderation queue smoke-tested with a real report

## Infrastructure & performance

- [x] Supabase audit — 14 fixes across 5 migrations — PR #36
- [ ] `pg_stat_statements` baseline captured pre-launch
- [ ] `pg_stat_user_indexes` checked ~1 week post-launch (drop dead indexes)
- [ ] Sentry alerting wired on 5xx and unhandled client errors
- [ ] CSP locked down in production `vercel.json`
- [ ] PostHog funnels + retention dashboards live

## iOS native (Capacitor)

- [ ] Apple Developer account active (individual now, LLC transfer post-launch)
- [x] Capacitor shell builds locally — simulator smoke passed 2026-04-20 (#62, #67–#72)
- [ ] App Store review passed
- [ ] Sign In with Apple wired

## Marketing / launch content

- [ ] Landing copy final
- [ ] Social share assets (OG images verified)
- [ ] Launch post drafted — where is it going?
- [ ] First 100 users plan — who, how, when

## Post-launch punch list (NOT blocking)

- Review decay system
- Shareable profile cards
- Biggest Movers feature
- Nantucket expansion
- Cape Cod expansion
- B2B analytics dashboard

---

## How to use this file

- One tick = shipped AND verified. If the PR merged but you haven't confirmed in prod, don't tick yet.
- Keep the "NOT blocking" section short. If a post-launch item starts creeping into scope, either move it up (and accept the tradeoff) or delete it.
- When Dan is slammed at work, this file is how any Claude session answers *"are we on track?"* without needing Dan's head.
