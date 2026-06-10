/**
 * 공급자 워크플로우 (app/submission.py → TypeScript)
 * CSV 업로드, 제출 관리, 승인/반려, 코멘트
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const TABLE_NAME_RE = /^sub_(.+)_[0-9a-f]{8}$/

export function validateTableName(name: string): string {
  if (!TABLE_NAME_RE.test(name)) throw new Error(`유효하지 않은 테이블명: ${name}`)
  return name
}

export function newTableName(tenantId: string): string {
  const arr = new Uint8Array(4)
  crypto.getRandomValues(arr)
  const suffix = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('')
  return `sub_${tenantId}_${suffix}`
}

export function inferSchema(rows: Record<string, unknown>[]): Array<{ name: string; type: string }> {
  if (!rows.length) return []
  return Object.entries(rows[0]).map(([name, val]) => {
    const type = typeof val === 'number'  ? (Number.isInteger(val) ? 'INTEGER' : 'FLOAT')
               : typeof val === 'boolean' ? 'BOOLEAN'
               : 'TEXT'
    return { name, type }
  })
}

export async function createSubmission(
  supabase: SupabaseClient,
  meta: Record<string, string>,
  tableName: string,
  rows: number,
  qualitySummary: string,
): Promise<string> {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  const submissionId = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('')
  await supabase.from('submissions').insert({
    submission_id: submissionId,
    tenant_id: meta.tenant_id, title: meta.title, description: meta.description,
    theme: meta.theme, keywords: meta.keywords, license: meta.license, format: meta.format,
    table_name: tableName, rows, status: 'submitted',
    quality_summary: qualitySummary, decision_note: null,
    submitted_at: new Date().toISOString(), decided_at: null,
  })
  return submissionId
}

export async function recordDecision(
  supabase: SupabaseClient,
  submissionId: string,
  status: 'approved' | 'rejected',
  decisionNote = '',
): Promise<void> {
  await supabase.from('submissions').update({
    status,
    decision_note: decisionNote,
    decided_at: new Date().toISOString(),
  }).eq('submission_id', submissionId)
}

export async function addComment(
  supabase: SupabaseClient,
  submissionId: string,
  comment: string,
): Promise<string> {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  const commentId = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('')
  await supabase.from('consultant_comments').insert({
    comment_id: commentId, submission_id: submissionId,
    comment, created_at: new Date().toISOString(),
  })
  return commentId
}

export async function getSubmission(supabase: SupabaseClient, submissionId: string) {
  const { data: sub } = await supabase
    .from('submissions').select('*').eq('submission_id', submissionId).maybeSingle()
  if (!sub) return null

  const { data: upload } = await supabase
    .from('submission_uploads').select('preview,schema_info')
    .eq('table_name', sub.table_name).maybeSingle()
  const { data: comments } = await supabase
    .from('consultant_comments').select('*')
    .eq('submission_id', submissionId).order('created_at')

  return {
    meta: sub,
    preview: (upload?.preview as unknown[]) ?? [],
    comments: comments ?? [],
  }
}

export function summarizeQuality(result: {
  rule_count: number; errors: number; error_rate: number; passed: boolean
}): string {
  const verdict = result.passed ? '통과' : '미통과'
  return `규칙 ${result.rule_count}종 / 오류 ${result.errors}건 / 오류율 ${result.error_rate}% / ${verdict}`
}
