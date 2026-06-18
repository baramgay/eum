/**
 * API 호출에서 발생하는 오류를 표현하는 커스텀 에러.
 * HTTP 상태 코드와 서버 응답 본문을 함께 보관한다.
 */
export class ApiError extends Error {
  status: number
  details: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details ?? null
  }
}
