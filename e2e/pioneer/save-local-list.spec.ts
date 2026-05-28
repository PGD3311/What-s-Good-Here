import { test, expect } from '@playwright/test'

// Auth model note:
// Pioneer specs run under the `pioneer-chromium` Playwright project, which
// applies storageState from e2e/.auth/pioneer.json (produced by
// e2e/pioneer/auth.setup.js). There is no signInAsFoodie() helper — the
// browser arrives already authenticated. The signed-out test below opts
// out of that storage state explicitly.

// Before running: set E2E_CURATOR_ID to a userId that:
//   1. has an active local_list with >=3 items
//   2. is NOT the signed-in pioneer account (else the page shows Edit, not Save)
//   3. is not blocked by the pioneer account
// Find a candidate via Supabase SQL Editor:
//   SELECT user_id FROM local_lists WHERE is_active = true
//     AND user_id <> '<PIONEER_USER_ID>' LIMIT 1;

test.describe('Save a Local List into my playlists', () => {
  test('signed-in user clones a curator list and lands on the new playlist', async ({ page }) => {
    const CURATOR_ID = process.env.E2E_CURATOR_ID
    test.skip(!CURATOR_ID, 'set E2E_CURATOR_ID env var to a seeded curator with an active list')

    await page.goto(`/locals/${CURATOR_ID}`)

    await expect(page.getByRole('button', { name: /save to my list/i })).toBeVisible()

    await page.getByRole('button', { name: /save to my list/i }).click()

    await expect(page.getByText(/saved \d+ dishes/i)).toBeVisible({ timeout: 5000 })
    await expect(page).toHaveURL(/\/playlist\/[0-9a-f-]{36}/)
  })

  test.describe('signed-out', () => {
    // Opt out of the pioneer project's authenticated storage state.
    test.use({ storageState: { cookies: [], origins: [] } })

    test('signed-out user is redirected to /login with a return URL', async ({ page }) => {
      const CURATOR_ID = process.env.E2E_CURATOR_ID
      test.skip(!CURATOR_ID, 'set E2E_CURATOR_ID env var to a seeded curator with an active list')

      await page.goto(`/locals/${CURATOR_ID}`)
      await page.getByRole('button', { name: /save to my list/i }).click()

      await expect(page).toHaveURL(/\/login\?next=/)
      expect(page.url()).toContain(encodeURIComponent(`/locals/${CURATOR_ID}`))
    })
  })
})
