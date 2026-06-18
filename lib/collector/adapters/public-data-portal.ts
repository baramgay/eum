/**
 * 공공데이터포털(data.go.kr / api.odcloud.kr) 어댑터
 *
 * data.go.kr 표준 API(JSON/XML) 응답을 파싱하고 페이지네이션을 추상화합니다.
 */

export interface PublicDataPortalListResult {
  items: Record<string, unknown>[]
  totalCount: number
  pageNo: number
  numOfRows: number
}

const DEFAULT_BASE_URL = 'https://apis.data.go.kr'

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function attributesToObject(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([a-zA-Z_][\w:.-]*)\s*=\s*"([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = decodeXmlEntities(m[2])
  }
  return attrs
}

interface XmlParseResult {
  value: unknown
  remaining: string
}

function parseXmlNode(s: string): XmlParseResult {
  // 주석 건 너뛰기
  let rest = s.trim()
  while (rest.startsWith('<!--')) {
    const end = rest.indexOf('-->')
    if (end === -1) break
    rest = rest.slice(end + 3).trim()
  }

  const openMatch = rest.match(/^<([a-zA-Z_][\w:.-]*)([^>]*)>/)
  if (!openMatch) {
    return { value: decodeXmlEntities(rest), remaining: '' }
  }

  const [, tagName, attrStr] = openMatch
  const tagEnd = openMatch[0]
  const selfClosing = tagEnd.endsWith('/>')
  const attrs = attributesToObject(attrStr)

  if (selfClosing) {
    return {
      value: Object.keys(attrs).length ? { [tagName]: attrs } : { [tagName]: null },
      remaining: rest.slice(tagEnd.length).trim(),
    }
  }

  rest = rest.slice(tagEnd.length)
  const children: unknown[] = []
  let text = ''

  while (rest.length > 0) {
    if (rest.startsWith(`</${tagName}>`)) {
      rest = rest.slice(`</${tagName}>`.length).trim()
      break
    }

    if (rest[0] === '<') {
      if (text.trim()) {
        children.push(decodeXmlEntities(text.trim()))
        text = ''
      }
      const child = parseXmlNode(rest)
      children.push(child.value)
      rest = child.remaining
    } else {
      const nextTag = rest.indexOf('<')
      if (nextTag === -1) {
        text += rest
        rest = ''
      } else {
        text += rest.slice(0, nextTag)
        rest = rest.slice(nextTag)
      }
    }
  }

  let value: unknown
  const trimmedText = text.trim()
  if (children.length === 0 && !trimmedText) {
    value = Object.keys(attrs).length ? { [tagName]: attrs } : { [tagName]: null }
  } else if (children.length === 0 && trimmedText) {
    const textValue = decodeXmlEntities(trimmedText)
    value = Object.keys(attrs).length
      ? { [tagName]: { ...attrs, __text: textValue } }
      : { [tagName]: textValue }
  } else if (children.length === 1 && typeof children[0] === 'string') {
    const textValue = children[0]
    value = Object.keys(attrs).length
      ? { [tagName]: { ...attrs, __text: textValue } }
      : { [tagName]: textValue }
  } else {
    const obj: Record<string, unknown> = { ...attrs }
    for (const child of children) {
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        const childObj = child as Record<string, unknown>
        const key = Object.keys(childObj)[0]
        const val = childObj[key]
        if (key in obj) {
          obj[key] = Array.isArray(obj[key]) ? [...(obj[key] as unknown[]), val] : [obj[key], val]
        } else {
          obj[key] = val
        }
      }
    }
    value = { [tagName]: obj }
  }

  return { value, remaining: rest }
}

/** XML 선언문/주석을 제거하고 루트 요소를 파싱합니다. */
export function parseXmlOrJson(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.length === 0) return null
  if (trimmed[0] === '<') {
    const cleaned = trimmed.replace(/<\?xml[^?]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim()
    if (cleaned.length === 0) return null
    const { value } = parseXmlNode(cleaned)
    return value
  }
  return JSON.parse(trimmed)
}

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

/**
 * 공공데이터포털 응답 형식(data.go.kr XML/JSON, api.odcloud.kr JSON)을
 * 표준화된 행 배열로 변환합니다.
 */
export function normalizePublicDataPortalResponse(
  payload: unknown,
): Record<string, unknown>[] {
  if (payload == null) return []
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]

  const obj = payload as Record<string, unknown>

  // api.odcloud.kr / BDJ 협회 OpenAPI
  if (obj.data && Array.isArray(obj.data)) {
    return obj.data as Record<string, unknown>[]
  }

  // data.go.kr 표준 JSON/XML: response.body.items
  const body = (obj.response as Record<string, unknown> | undefined)?.body as
    | Record<string, unknown>
    | undefined
  if (body && typeof body === 'object') {
    const items = body.items
    if (Array.isArray(items)) return items as Record<string, unknown>[]
    if (items && typeof items === 'object') {
      const item = (items as Record<string, unknown>).item
      return toArray(item) as Record<string, unknown>[]
    }
  }

  return [obj]
}

function buildUrl(
  baseUrl: string,
  serviceId: string,
  params: Record<string, string | number>,
): string {
  const url = new URL(serviceId, baseUrl.replace(/\/$/, '') + '/')
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  })
  return url.toString()
}

/**
 * data.go.kr / api.odcloud.kr 목록 API를 호출합니다.
 *
 * @param apiKey   serviceKey 또는 api.odcloud.kr serviceKey
 * @param serviceId URL 경로 (예: 'B551408/hospital')
 * @param params   pageNo, numOfRows 등 추가 파라미터
 * @param baseUrl  'https://apis.data.go.kr' 또는 'https://api.odcloud.kr/api'
 */
export async function fetchList(
  apiKey: string,
  serviceId: string,
  params: Record<string, string | number> = {},
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<PublicDataPortalListResult> {
  const isOdcloud = baseUrl.includes('api.odcloud.kr')
  const pageNo = Number(params.pageNo ?? params.page ?? 1)
  const numOfRows = Number(params.numOfRows ?? params.perPage ?? 1000)

  const query: Record<string, string | number> = {
    serviceKey: apiKey,
    ...params,
  }

  if (isOdcloud) {
    query.page = pageNo
    query.perPage = numOfRows
    delete query.pageNo
    delete query.numOfRows
  } else {
    query.pageNo = pageNo
    query.numOfRows = numOfRows
    delete query.page
    delete query.perPage
  }

  const url = buildUrl(baseUrl, serviceId, query)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`공공데이터포털 API 오류: HTTP ${res.status}`)
  }

  const text = await res.text()
  const payload = parseXmlOrJson(text)
  const items = normalizePublicDataPortalResponse(payload)

  if (isOdcloud) {
    const data = (payload as Record<string, unknown> | undefined) ?? {}
    return {
      items,
      totalCount: Number(data.totalCount ?? data.currentCount ?? items.length),
      pageNo: Number(data.page ?? pageNo),
      numOfRows: Number(data.perPage ?? numOfRows),
    }
  }

  const response = (payload as Record<string, unknown> | null)?.response as
    | Record<string, unknown>
    | undefined
  const body = response?.body as Record<string, unknown> | undefined

  return {
    items,
    totalCount: Number(body?.totalCount ?? items.length),
    pageNo: Number(body?.pageNo ?? pageNo),
    numOfRows: Number(body?.numOfRows ?? numOfRows),
  }
}

/** fetchList의 단축 버전 — 행 배엧만 반환합니다. */
export async function fetchData(
  apiKey: string,
  serviceId: string,
  params: Record<string, string | number> = {},
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<Record<string, unknown>[]> {
  const result = await fetchList(apiKey, serviceId, params, baseUrl)
  return result.items
}

/** 소스 URL이 공공데이터포털인지 판별합니다. */
export function isPublicDataPortalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.hostname.includes('data.go.kr') ||
      u.hostname.includes('api.odcloud.kr')
    )
  } catch {
    return false
  }
}
