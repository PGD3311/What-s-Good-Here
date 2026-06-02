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
      '**/node_modules/**',
      '.claude/**',
      // Deno-native edge-function tests run under `deno test`, not Vitest (they
      // import from https://deno.land / esm.sh, which Node's ESM loader rejects).
      // Named by convention so this stays a single glob — no per-file maintenance:
      //   *.deno.test.ts    = hermetic, run in CI (.github/workflows/ci.yml)
      //   *.deno-it.test.ts = integration, need a live Supabase (run manually)
      '**/*.deno.test.ts',
      '**/*.deno-it.test.ts',
    ],
  },
})
