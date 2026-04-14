// Feature flags for gradual rollouts

export const FEATURES = {
  // Rating Identity System - tracks user rating bias and pending votes
  RATING_IDENTITY_ENABLED: import.meta.env.VITE_RATING_IDENTITY_ENABLED === 'true',
  // Sign in with Apple — code is wired up; button only renders when this flag
  // is true. Flip on after the Supabase Apple provider is configured (requires
  // Apple Developer enrollment + App ID + Services ID + .p8 key).
  // Plan: docs/superpowers/plans/2026-04-13-h2-sign-in-with-apple.md
  APPLE_SIGNIN_ENABLED: import.meta.env.VITE_FEATURES_APPLE_SIGNIN === 'true',
}
