import { test, expect } from '../fixtures/test.js'

test.describe('/browse legacy route', () => {
  test('/browse?category=<id> redirects to / with category param preserved', async ({ page }) => {
    await page.goto('/browse?category=pizza')
    await expect(page).toHaveURL(/\/\?category=pizza$/, { timeout: 10_000 })
  })

  test('/browse?q=<query> redirects to / with query param preserved', async ({ page }) => {
    await page.goto('/browse?q=lobster')
    await expect(page).toHaveURL(/\/\?q=lobster$/, { timeout: 10_000 })
  })

  test('bare /browse redirects to /', async ({ page }) => {
    await page.goto('/browse')
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 })
  })
})
