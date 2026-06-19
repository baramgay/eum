import { test, expect } from '@playwright/test'

test.describe('login page', () => {
  test('로그인 페이지가 렌더링된다', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible()
  })
})
