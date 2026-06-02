// Feature flags for gradual rollouts

export const FEATURES = {
  // Rating Identity System - tracks user rating bias and pending votes
  RATING_IDENTITY_ENABLED: import.meta.env.VITE_RATING_IDENTITY_ENABLED === 'true',
  // Sign in with Apple — shipped to production via PR #170 after the first
  // App Store rejection. Default-on; set VITE_FEATURES_APPLE_SIGNIN=false in
  // a local .env.local (or via a Vercel env var) to disable for debugging.
  APPLE_SIGNIN_ENABLED: import.meta.env.VITE_FEATURES_APPLE_SIGNIN !== 'false',
  // Share-to-Instagram (image → native share sheet). Default-on; set
  // VITE_FEATURES_IG_SHARE=false to kill instantly without a deploy.
  IG_SHARE_ENABLED: import.meta.env.VITE_FEATURES_IG_SHARE !== 'false',
}
