import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const CENTER_EMAIL = process.env.TEST_CENTER_EMAIL || 'center@eum.test'
const AGENCY_EMAIL = process.env.TEST_AGENCY_EMAIL || 'changwon@eum.test'
const CENTER_PASSWORD = process.env.TEST_CENTER_PASSWORD || ''
const AGENCY_PASSWORD = process.env.TEST_AGENCY_PASSWORD || ''

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByRole('textbox', { name: '이메일' }).fill(email)
  await page.getByRole('textbox', { name: '비밀번호' }).fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('/')
}

test.describe('EUM smoke tests', () => {
  test('로그인 후 대시보드가 표시된다', async ({ page }) => {
    await login(page, CENTER_EMAIL, CENTER_PASSWORD)
    await page.waitForURL('/')
    await expect(page.getByRole('heading', { name: /대시보드|이음/ })).toBeVisible()
  })

  test('데이터 등록 폼이 정상적으로 열린다', async ({ page }) => {
    await login(page, AGENCY_EMAIL, AGENCY_PASSWORD)
    await page.goto('/submission')

    await page.getByRole('button', { name: '데이터 등록' }).first().click()
    await page.getByPlaceholder('데이터셋 제목').fill('E2E 테스트 데이터셋')
    await page.getByPlaceholder('예: 인구통계').fill('인구')
    await page.getByPlaceholder('데이터셋 설명 (20자 이상)').fill('E2E 테스트를 위한 더미 데이터셋 설명입니다. 20자 이상 작성합니다.')

    await expect(page.getByRole('button', { name: '심사 요청' })).toBeVisible()
  })

  test('OpenAPI 키 발급 후 /api/v1/datasets를 호출한다', async ({ page, request }) => {
    await login(page, AGENCY_EMAIL, AGENCY_PASSWORD)
    await page.goto('/openapi')

    await page.getByRole('button', { name: '+ API 키 발급' }).first().click()
    await page.getByPlaceholder('예: 행정안전부 연계').fill('E2E 테스트 키')
    await page.getByRole('button', { name: /^발급$/ }).click()

    await expect(page.getByText('API 키가 발급되었습니다. 지금 복사하세요 — 다시 확인할 수 없습니다.')).toBeVisible()
    const keyLocator = page.locator('div:has(> p:has-text("API 키가 발급되었습니다. 지금 복사하세요 — 다시 확인할 수 없습니다.")) code')
    await expect(keyLocator).toBeVisible()
    const apiKey = await keyLocator.textContent()
    expect(apiKey).toBeTruthy()

    const res = await request.get('/api/v1/datasets', {
      headers: { 'x-api-key': apiKey!.trim() },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('data')
    expect(Array.isArray(body.data)).toBe(true)
  })

  test('로그인 페이지에 접근성 위반이 없어야 한다', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible()

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    expect(accessibilityScanResults.violations).toEqual([])
  })
})
