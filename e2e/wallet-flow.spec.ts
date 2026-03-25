import { test, expect } from '@playwright/test'

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const TEST_PIN = '1234'

test.describe('Wallet import and sweep flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/start')
    await page.evaluate(() => localStorage.clear())
  })

  test('navigates to /start by default when no wallet stored', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/start/)
  })

  test('import page renders recovery phrase input', async ({ page }) => {
    await page.goto('/start')
    await expect(page.getByPlaceholder(/abandon ability/i)).toBeVisible()
  })

  test('import page renders PIN input', async ({ page }) => {
    await page.goto('/start')
    await expect(page.getByPlaceholder(/4-digit PIN/i)).toBeVisible()
  })

  test('shows error for invalid mnemonic on import', async ({ page }) => {
    await page.goto('/start')
    await page.getByPlaceholder(/abandon ability/i).fill('invalid words here that are not a mnemonic')
    await page.getByPlaceholder(/4-digit PIN/i).fill(TEST_PIN)
    await page.getByRole('button', { name: /Restore wallet/i }).click()
    await expect(page.getByText(/Invalid recovery phrase/i)).toBeVisible()
  })

  test('stores mnemonic and PIN in localStorage after import', async ({ page }) => {
    await page.goto('/start')
    await page.getByPlaceholder(/abandon ability/i).fill(TEST_MNEMONIC)
    await page.getByPlaceholder(/4-digit PIN/i).fill(TEST_PIN)
    await page.getByRole('button', { name: /Restore wallet/i }).click()

    const mnemonic = await page.evaluate(() => localStorage.getItem('wallet_mnemonic'))
    expect(mnemonic).toBeTruthy()
  })
})
