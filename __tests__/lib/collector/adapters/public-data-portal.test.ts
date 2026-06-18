/**
 * @jest-environment node
 */
import {
  fetchData,
  fetchList,
  isPublicDataPortalUrl,
  normalizePublicDataPortalResponse,
  parseXmlOrJson,
} from '@/lib/collector/adapters/public-data-portal'

const DATA_GO_KR_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header>
    <resultCode>00</resultCode>
    <resultMsg>NORMAL SERVICE.</resultMsg>
  </header>
  <body>
    <items>
      <item>
        <sggCd>48121</sggCd>
        <sigun>창원시</sigun>
        <value>10</value>
      </item>
      <item>
        <sggCd>48170</sggCd>
        <sigun>진주시</sigun>
        <value>20</value>
      </item>
    </items>
    <numOfRows>10</numOfRows>
    <pageNo>1</pageNo>
    <totalCount>2</totalCount>
  </body>
</response>`

const ODCLOUD_JSON = JSON.stringify({
  data: [
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
  ],
  totalCount: 2,
  page: 1,
  perPage: 1000,
})

describe('public-data-portal adapter', () => {
  describe('parseXmlOrJson', () => {
    it('JSON을 파싱한다', () => {
      expect(parseXmlOrJson('{"a":1}')).toEqual({ a: 1 })
    })

    it('공공데이터포털 XML을 객체로 파싱한다', () => {
      const parsed = parseXmlOrJson(DATA_GO_KR_XML) as Record<string, unknown>
      const body = (parsed.response as Record<string, unknown>).body as Record<string, unknown>
      expect(body.totalCount).toBe('2')
      const items = (body.items as Record<string, unknown>).item as unknown[]
      expect(items).toHaveLength(2)
      expect((items[0] as Record<string, unknown>).sigun).toBe('창원시')
    })

    it('XML 개체 참조를 디코딩한다', () => {
      const xml = '<root><msg>a &amp; b &lt; c</msg></root>'
      const parsed = parseXmlOrJson(xml) as Record<string, unknown>
      expect((parsed.root as Record<string, unknown>).msg).toBe('a & b < c')
    })
  })

  describe('normalizePublicDataPortalResponse', () => {
    it('data.go.kr XML 응답에서 item 배열을 추출한다', () => {
      const payload = parseXmlOrJson(DATA_GO_KR_XML)
      const rows = normalizePublicDataPortalResponse(payload)
      expect(rows).toHaveLength(2)
      expect(rows[0].sigun).toBe('창원시')
      expect(rows[1].value).toBe('20')
    })

    it('api.odcloud.kr JSON 응답에서 data 배열을 추출한다', () => {
      const payload = JSON.parse(ODCLOUD_JSON)
      const rows = normalizePublicDataPortalResponse(payload)
      expect(rows).toHaveLength(2)
      expect(rows[1].name).toBe('b')
    })

    it('원본 배열을 그대로 반환한다', () => {
      const arr = [{ id: 1 }]
      expect(normalizePublicDataPortalResponse(arr)).toEqual(arr)
    })
  })

  describe('isPublicDataPortalUrl', () => {
    it('data.go.kr URL을 인식한다', () => {
      expect(isPublicDataPortalUrl('https://apis.data.go.kr/B551408/hospital')).toBe(true)
    })
    it('api.odcloud.kr URL을 인식한다', () => {
      expect(isPublicDataPortalUrl('https://api.odcloud.kr/api/123/v1/uddi:456')).toBe(true)
    })
    it('일반 URL은 false를 반환한다', () => {
      expect(isPublicDataPortalUrl('https://example.com/api')).toBe(false)
    })
  })

  describe('fetchList / fetchData', () => {
    const originalFetch = global.fetch

    afterEach(() => {
      global.fetch = originalFetch
    })

    it('fetchList가 data.go.kr XML 응답을 정규화한다', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => DATA_GO_KR_XML,
      } as unknown as Response)

      const result = await fetchList('test-api-key', 'B551408/hospital', { pageNo: 1, numOfRows: 10 })
      expect(result.items).toHaveLength(2)
      expect(result.totalCount).toBe(2)
      expect(result.pageNo).toBe(1)
      expect(result.numOfRows).toBe(10)

      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string
      expect(calledUrl).toContain('serviceKey=test-api-key')
      expect(calledUrl).toContain('pageNo=1')
      expect(calledUrl).toContain('numOfRows=10')
    })

    it('fetchList가 api.odcloud.kr JSON 응답을 정규화한다', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => ODCLOUD_JSON,
      } as unknown as Response)

      const result = await fetchList('test-api-key', '123/v1/uddi:456', {}, 'https://api.odcloud.kr/api')
      expect(result.items).toHaveLength(2)
      expect(result.totalCount).toBe(2)

      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string
      expect(calledUrl).toContain('serviceKey=test-api-key')
      expect(calledUrl).toContain('page=')
      expect(calledUrl).toContain('perPage=')
    })

    it('fetchData는 행 배엧만 반환한다', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => ODCLOUD_JSON,
      } as unknown as Response)

      const rows = await fetchData('test-api-key', '123/v1/uddi:456', {}, 'https://api.odcloud.kr/api')
      expect(rows).toHaveLength(2)
      expect(rows[0]).not.toHaveProperty('data')
    })

    it('HTTP 오류를 던진다', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as unknown as Response)

      await expect(fetchList('key', 'svc')).rejects.toThrow('HTTP 500')
    })
  })
})
