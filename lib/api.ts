import { NextResponse } from 'next/server'

export function jsonError(message: string, status: number = 500, details?: unknown) {
  const body: { error: string; details?: unknown } = { error: message }
  if (details !== undefined) body.details = details
  return NextResponse.json(body, { status })
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}
