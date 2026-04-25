import { test, expect } from '../fixtures/test.js'

test.describe("Home — Locals' Picks banner + TOC", () => {
  test('banner appears on homepage and opens /locals', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-dish-id]').first()).toBeVisible({ timeout: 20_000 })

    const banner = page.getByRole('button', { name: /Open Locals['’] Picks/i })
    await expect(banner).toBeVisible({ timeout: 10_000 })
    await banner.click()

    await expect(page).toHaveURL(/\/locals$/)
    await expect(page.getByText(/The Locals['’]\s*Picks/i).first()).toBeVisible()

    const readTab = page.getByRole('tab', { name: 'Read' })
    await expect(readTab).toHaveAttribute('aria-selected', 'true')
  })

  test('TOC tab switching works', async ({ page }) => {
    await page.goto('/locals')
    await expect(page.getByText(/The Locals['’]\s*Picks/i).first()).toBeVisible({ timeout: 15_000 })

    await page.getByRole('tab', { name: 'Search' }).click()
    await expect(page.getByPlaceholder(/What are you looking for\?/i)).toBeVisible()

    await page.getByRole('tab', { name: 'Index' }).click()
    await expect(page.getByText(/every dish picked/i)).toBeVisible()

    await page.getByRole('tab', { name: 'Read' }).click()
    await expect(page.getByText(/or pick a local/i)).toBeVisible()
  })

  test('curator row opens menu page', async ({ page }) => {
    await page.goto('/locals')

    const curatorBtn = page.getByRole('button', { name: /Open .* list/i }).first()
    await expect(curatorBtn).toBeVisible({ timeout: 15_000 })
    await curatorBtn.click()

    await expect(page).toHaveURL(/\/locals\/[0-9a-f-]+$/)
    await expect(page.getByText(/the menu/i).first()).toBeVisible()

    await page.getByRole('button', { name: /All locals/i }).click()
    await expect(page).toHaveURL(/\/locals$/)
  })
})
