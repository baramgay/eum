import { NextResponse } from 'next/server'

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

export function err(message: string, status = 400, detail?: unknown) {
  return NextResponse.json({ ok: false, error: message, ...(detail ? { detail } : {}) }, { status })
}

export function noContent() {
  return new NextResponse(null, { status: 204 })
}
