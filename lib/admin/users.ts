import { z } from 'zod'

export const userRoleSchema = z.enum(['admin', 'center', 'agency', 'viewer', 'public'])

export const createUserSchema = z.object({
  email:     z.string().email('이메일 형식이 아닙니다'),
  password:  z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다'),
  role:      userRoleSchema.default('viewer'),
  tenant_id: z.string().optional().nullable(),
})

export const updateUserSchema = z.object({
  role:         userRoleSchema.optional(),
  tenant_id:    z.string().nullable().optional(),
  banned_until: z.string().datetime().nullable().optional(),
})

export const paginationSchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
})

export function isPasswordCompliant(password: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)
}
