import { execFileSync } from 'child_process'
import type { Page } from '@playwright/test'

export const CENTER_EMAIL = process.env.TEST_CENTER_EMAIL || 'center@eum.test'
export const CENTER_PASSWORD = process.env.TEST_CENTER_PASSWORD || ''
export const AGENCY_EMAIL = process.env.TEST_AGENCY_EMAIL || 'changwon@eum.test'
export const AGENCY_PASSWORD = process.env.TEST_AGENCY_PASSWORD || ''

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByRole('textbox', { name: '이메일' }).fill(email)
  await page.getByRole('textbox', { name: '비밀번호' }).fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('/')
}

export function seedTestUsers() {
  execFileSync('node', ['scripts/e2e-seed.mjs'], { stdio: 'inherit', env: process.env })
}

export function cleanupTestUsers() {
  execFileSync('node', ['scripts/e2e-seed.mjs', '--cleanup'], { stdio: 'inherit', env: process.env })
}
