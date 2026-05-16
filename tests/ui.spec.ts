/**
 * Playwright UI tests for FormatEntropy web app
 */

import { test, expect } from '@playwright/test'

const APP_URL = 'http://localhost:5173'

test.describe('FormatEntropy App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForSelector('h1', { timeout: 10000 })
    await page.waitForTimeout(2000)
  })

  test('app loads with correct header and description', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('FormatEntropy')
    await expect(page.locator('p').first()).toContainText('Shannon entropy')
  })

  test('LMStudio config panel is visible with inputs', async ({ page }) => {
    await expect(page.locator('text=LMStudio')).toBeVisible()
    await expect(page.locator('input[placeholder="http://localhost:1234"]')).toBeVisible()
    await expect(page.locator('input[placeholder="local-model"]')).toBeVisible()
  })

  test('format components panel shows toggles', async ({ page }) => {
    await expect(page.locator('text=Components')).toBeVisible()
    const checkboxes = page.locator('input[type="checkbox"]')
    const count = await checkboxes.count()
    expect(count).toBeGreaterThan(5)
  })

  test('format components have all/none toggles', async ({ page }) => {
    await expect(page.locator('text=Components')).toBeVisible()
    const allButton = page.locator('button').filter({ hasText: 'All' }).first()
    await expect(allButton).toBeVisible()
    const noneButton = page.locator('button').filter({ hasText: 'None' }).first()
    await expect(noneButton).toBeVisible()
  })

  test('prompt selector shows prompts', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Prompts/ })).toBeVisible()
    const checkboxes = page.locator('input[type="checkbox"]')
    const count = await checkboxes.count()
    expect(count).toBeGreaterThan(5)
  })

  test('run button is present', async ({ page }) => {
    const runButton = page.locator('button').filter({ hasText: /Run All/ })
    await expect(runButton).toBeVisible()
  })

  test('download button is present', async ({ page }) => {
    const downloadButton = page.locator('button').filter({ hasText: /Download/ })
    await expect(downloadButton).toBeVisible()
  })

  test('seed domain info is displayed', async ({ page }) => {
    await expect(page.locator('text=Narrative Psychology')).toBeVisible()
  })

  test('entropy chart area is present', async ({ page }) => {
    await expect(page.locator('text=Live Entropy Stream')).toBeVisible()
  })

  test('TSD export section is present', async ({ page }) => {
    await expect(page.locator('text=TSD Export')).toBeVisible()
  })

  test('select all/deselect all prompts work', async ({ page }) => {
    const allButton = page.locator('text=All').first()
    await allButton.click()
    const checkboxes = page.locator('input[type="checkbox"]')
    const count = await checkboxes.count()
    expect(count).toBeGreaterThan(5)
  })

  test('entropy stream container exists', async ({ page }) => {
    await expect(page.locator('text=Live Entropy Stream')).toBeVisible()
  })

  test('app has dark theme styling', async ({ page }) => {
    const body = page.locator('body')
    const bgColor = await body.evaluate(el => window.getComputedStyle(el).backgroundColor)
    expect(bgColor).toContain('10, 10, 15')
  })

  test('app is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const header = page.locator('h1').first()
    await expect(header).toBeVisible()
  })
})
