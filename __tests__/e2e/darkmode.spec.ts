import { test, expect } from '@playwright/test'
import { login, CENTER_EMAIL, CENTER_PASSWORD, AGENCY_EMAIL, AGENCY_PASSWORD } from './helpers/auth'

test.describe('다크 모드', () => {
  test('테마 토글로 다크 모드를 활성화하면 html에 dark 클래스가 추가된다', async ({ page }) => {
    await login(page, CENTER_EMAIL, CENTER_PASSWORD)
    await page.waitForLoadState('networkidle')

    // ThemeToggle 버튼 열기
    await page.getByRole('button', { name: '테마 변경' }).click()
    // 다크 옵션 클릭
    await page.getByRole('option', { name: '다크' }).click()

    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('다크 모드 설정이 localStorage에 저장되고 페이지 재로드 후에도 유지된다', async ({ page }) => {
    await login(page, CENTER_EMAIL, CENTER_PASSWORD)
    await page.waitForLoadState('networkidle')

    // localStorage에 직접 설정 (eum-theme 키)
    await page.evaluate(() => localStorage.setItem('eum-theme', 'dark'))
    await page.reload()
    await page.waitForLoadState('networkidle')

    // html에 dark 클래스가 있어야 한다
    await expect(page.locator('html')).toHaveClass(/dark/)

    // localStorage 값도 유지되어야 한다
    const stored = await page.evaluate(() => localStorage.getItem('eum-theme'))
    expect(stored).toBe('dark')
  })

  test('라이트 모드 설정 후 재로드하면 dark 클래스가 없다', async ({ page }) => {
    await login(page, CENTER_EMAIL, CENTER_PASSWORD)
    await page.waitForLoadState('networkidle')

    await page.evaluate(() => localStorage.setItem('eum-theme', 'light'))
    await page.reload()
    await page.waitForLoadState('networkidle')

    const htmlClass = await page.locator('html').getAttribute('class')
    expect(htmlClass ?? '').not.toContain('dark')
  })

  test('다크 모드에서 대시보드 배경이 순수 흰색이 아니다', async ({ page }) => {
    await login(page, CENTER_EMAIL, CENTER_PASSWORD)
    await page.waitForLoadState('networkidle')

    // 다크 모드 적용
    await page.evaluate(() => localStorage.setItem('eum-theme', 'dark'))
    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(page.locator('html')).toHaveClass(/dark/)

    // body는 dark 모드에서 bg-gray-950 → rgb(3,7,18) 또는 유사 어두운 색
    // 순수 흰색(255,255,255)이 아님을 확인
    const bgColor = await page.locator('body').evaluate(el =>
      getComputedStyle(el).backgroundColor
    )
    // rgb(255, 255, 255)는 아니어야 함
    expect(bgColor).not.toBe('rgb(255, 255, 255)')
  })

  test('다크 모드에서 포털 페이지 배경이 순수 흰색이 아니다', async ({ page }) => {
    await login(page, AGENCY_EMAIL, AGENCY_PASSWORD)

    await page.evaluate(() => localStorage.setItem('eum-theme', 'dark'))
    await page.goto('/portal')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('html')).toHaveClass(/dark/)

    const bgColor = await page.locator('body').evaluate(el =>
      getComputedStyle(el).backgroundColor
    )
    expect(bgColor).not.toBe('rgb(255, 255, 255)')
  })

  test('다크 모드에서 품질 페이지 배경이 순수 흰색이 아니다', async ({ page }) => {
    await login(page, CENTER_EMAIL, CENTER_PASSWORD)

    await page.evaluate(() => localStorage.setItem('eum-theme', 'dark'))
    await page.goto('/quality')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('html')).toHaveClass(/dark/)

    const bgColor = await page.locator('body').evaluate(el =>
      getComputedStyle(el).backgroundColor
    )
    expect(bgColor).not.toBe('rgb(255, 255, 255)')
  })

  test('system 테마에서 prefers-color-scheme: dark를 에뮬레이션하면 dark 클래스가 붙는다', async ({ page, browser }) => {
    // dark 선호 미디어 쿼리 에뮬레이션 컨텍스트
    const darkContext = await browser.newContext({ colorScheme: 'dark' })
    const darkPage = await darkContext.newPage()

    await darkPage.goto('/login')
    await darkPage.evaluate(() => localStorage.setItem('eum-theme', 'system'))
    await darkPage.reload()
    await darkPage.waitForLoadState('networkidle')

    await expect(darkPage.locator('html')).toHaveClass(/dark/)
    await darkContext.close()
  })

  test('테마 토글 메뉴에 라이트·다크·시스템 옵션이 모두 있다', async ({ page }) => {
    await login(page, CENTER_EMAIL, CENTER_PASSWORD)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '테마 변경' }).click()

    await expect(page.getByRole('option', { name: '라이트' })).toBeVisible()
    await expect(page.getByRole('option', { name: '다크' })).toBeVisible()
    await expect(page.getByRole('option', { name: '시스템' })).toBeVisible()
  })
})
