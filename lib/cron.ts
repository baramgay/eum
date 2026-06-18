/**
 * 최소한의 cron 해석기.
 * 표준 5필드 cron(minute hour day month weekday) 을 분 단위 brute-force 로 해석한다.
 * Vercel Cron 이 매시간 호출하는 환경에서 가벼운 스케줄만 처리하면 충분하다.
 */

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>()

  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i)
      continue
    }

    if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2), 10)
      if (!isNaN(step) && step > 0) {
        for (let i = min; i <= max; i += step) values.add(i)
      }
      continue
    }

    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-')
      const start = parseInt(startStr, 10)
      const end = parseInt(endStr, 10)
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = Math.max(min, start); i <= Math.min(max, end); i++) values.add(i)
      }
      continue
    }

    const n = parseInt(part, 10)
    if (!isNaN(n)) values.add(n)
  }

  return values
}

function matchesCron(date: Date, parts: string[]): boolean {
  const [minute, hour, day, month, weekday] = parts
  const m = parseField(minute, 0, 59)
  const h = parseField(hour, 0, 23)
  const d = parseField(day, 1, 31)
  const mo = parseField(month, 1, 12)
  // JS getDay(): 0=일요일, cron: 0=일요일(또는 7)
  const wd = parseField(weekday.replace('7', '0'), 0, 6)

  return (
    m.has(date.getMinutes()) &&
    h.has(date.getHours()) &&
    d.has(date.getDate()) &&
    mo.has(date.getMonth() + 1) &&
    wd.has(date.getDay())
  )
}

export function getNextRunAt(cronExpr: string, from: Date = new Date()): Date | null {
  const parts = cronExpr.trim().split(/\s+/)
  if (parts.length !== 5) return null

  const start = new Date(from)
  // 시작 시각 이후부터 탐색(1분 뒤부터)
  start.setSeconds(0, 0)
  const cursor = new Date(start.getTime() + 60_000)

  // 최대 366일까지 탐색
  const maxCursor = new Date(cursor)
  maxCursor.setDate(maxCursor.getDate() + 366)

  while (cursor <= maxCursor) {
    if (matchesCron(cursor, parts)) {
      return new Date(cursor)
    }
    cursor.setMinutes(cursor.getMinutes() + 1)
  }

  return null
}
