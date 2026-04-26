import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    exclude: [
      'e2e/**',
      'whats-good-here-soul/**',
      'node_modules/**',
      // Deno-native tests — these use `https://deno.land/std/...` + `https://esm.sh/...`
      // URL imports that Node's ESM loader rejects. Run them with:
      //   deno test --allow-net --allow-env <path>
      // Other supabase/functions/*.test.ts files are pure vitest (import from 'vitest')
      // and stay included by default — only list the Deno-specific ones here.
      'supabase/functions/_shared/apple.test.ts',
      'supabase/functions/_test/observability.test.ts',
      'supabase/functions/apple-revocation-retry/index.test.ts',
      'supabase/functions/apple-token-exchange/index.test.ts',
      'supabase/functions/apple-token-persist/index.test.ts',
      'supabase/functions/delete-account/index.test.ts',
    ],
  },
})
