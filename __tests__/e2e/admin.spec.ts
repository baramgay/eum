import { test, expect } from '@playwright/test'
import { login, CENTER_EMAIL, CENTER_PASSWORD, AGENCY_EMAIL } from './helpers/auth'

test.describe('관리자', () => {
  test('센터 사용자가 /admin에 접속해 사용자 목록을 확인한다', async ({ page }) => {
    await login(page, CENTER_EMAIL, CENTER_PASSWORD)
    await page.goto('/admin')

    await expect(page.getByRole('heading', { name: '기관 관리' })).toBeVisible()

    await page.getByRole('button', { name: '사용자 관리' }).click()
    await expect(page.getByRole('heading', { name: '사용자 관리' })).toBeVisible()

    await expect(page.getByRole('cell', { name: CENTER_EMAIL })).toBeVisible()
    await expect(page.getByRole('cell', { name: AGENCY_EMAIL })).toBeVisible()
  })
})
