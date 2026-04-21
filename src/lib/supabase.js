import { createClient } from '@supabase/supabase-js'
import { logger } from '../utils/logger'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Check if Supabase is properly configured
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

// Throw in production if not configured - don't mask the error
if (!isSupabaseConfigured) {
  const message = 'Supabase not configured: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables are required'
  if (import.meta.env.PROD) {
    throw new Error(`[CRITICAL] ${message}`)
  } else {
    logger.error(`[DEV] ${message} - App will not function correctly!`)
  }
}

// SECURITY: Session tokens in localStorage
// ========================================
// Tokens are stored in localStorage for session persistence across page reloads.
// XSS protection is handled by Content-Security-Policy headers in vercel.json:
// - script-src restricts JavaScript execution to trusted sources
// - connect-src restricts network requests to known APIs
// See vercel.json for the full CSP configuration.
export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      persistSession: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      storageKey: 'whats-good-here-auth',
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    }
  }
)
