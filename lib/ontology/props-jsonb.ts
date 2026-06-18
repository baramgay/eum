/**
 * 온톨로지 props 문자열 → JSONB 변환
 * `키=값;키=값` 형태를 파싱해 JSONB 컬럼(props_jsonb)에 저장할 객체로 변환한다.
 * 숫자로 보이는 값은 number로, 그 외는 string으로 저장한다.
 */

export function propsToJsonb(props: string): Record<string, unknown> {
  if (!props) return {}
  const out: Record<string, unknown> = {}
  for (const kv of props.split(';')) {
    if (!kv) continue
    const i = kv.indexOf('=')
    const key = (i === -1 ? kv : kv.slice(0, i)).trim()
    const rawValue = i === -1 ? '' : kv.slice(i + 1).trim()
    if (!key) continue
    const num = Number(rawValue)
    out[key] = Number.isFinite(num) && rawValue !== '' ? num : rawValue
  }
  return out
}
