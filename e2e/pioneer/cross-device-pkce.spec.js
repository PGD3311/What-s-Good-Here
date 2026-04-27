import { test, expect } from '@playwright/test'

// Cross-device PKCE recovery — when a user opens a magic link / password
// reset on a device that didn't initiate the auth flow, supabase rejects
// exchangeCodeForSession with a "code verifier" error. The frontend should
// land them on /auth/cross-device with a friendly resend form.
//
// This test exercises the recovery PAGE directly. The full universal-link
// flow (Capacitor App.appUrlOpen → exchange → navigate) only fires inside
// the iOS native build, which Playwright doesn't drive. Here we just verify
// the recovery page renders correctly when navigated to manually — that's
// the only piece in this PR that's reachable from a browser.

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Pioneer — Cross-device PKCE recovery', () => {
  test('cross-device recovery page renders and accepts an email', async ({ page }) => {
    await page.goto('/auth/cross-device')

    // Dismiss splash if present
    try {
      const splash = page.getByRole('button', { name: /Welcome splash/ })
      await splash.waitFor({ state: 'visible', timeout: 3000 })
      await splash.click()
      await splash.waitFor({ state: 'hidden', timeout: 3000 })
    } catch {
      // No splash
    }

    // Headline + body
    await expect(page.getByRole('heading', { name: /Open the link on this device/i })).toBeVisible()
    await expect(page.getByText(/different device/i)).toBeVisible()

    // Email input + submit button visible
    const emailInput = page.getByPlaceholder('you@example.com')
    await expect(emailInput).toBeVisible()
    await expect(page.getByRole('button', { name: /Send new link/i })).toBeVisible()

    // Submitting an email transitions to the "Check your email" confirmation.
    // Default type (no location.state) is 'magiclink' so this hits authApi.signInWithMagicLink.
    // The actual send happens against Supabase — non-deterministic in CI. We just
    // verify the form accepts the input and the page doesn't crash.
    await emailInput.fill('e2e-cross-device@example.com')
    // Don't submit — no Supabase available in CI without test env. The interaction
    // surface (typing) is enough to prove the page is reachable + interactive.
  })

  test('cross-device recovery page is accessible without auth', async ({ page }) => {
    // Confirm /auth/cross-device is in the public route allow-list (not gated by
    // login). A logged-out user receiving a stale link must reach the recovery
    // page — that's the whole point.
    const response = await page.goto('/auth/cross-device')
    expect(response?.status()).toBeLessThan(400)
    await expect(page.getByRole('heading', { name: /Open the link on this device/i })).toBeVisible()
  })
})
