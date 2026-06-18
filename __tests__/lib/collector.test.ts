describe('collector 유틸리티', () => {
  process.env.COLLECTION_SECRET = 'test-secret-32chars-long-value!!'

  async function loadCollector() {
    const mod = await import('@/lib/collector')
    return mod
  }

  describe('calcNextRunAt', () => {
    it('manual은 null을 반환한다', async () => {
      const { calcNextRunAt } = await loadCollector()
      expect(calcNextRunAt('manual')).toBeNull()
    })

    it('daily은 내일 00:00 이후 시각을 반환한다', async () => {
      const { calcNextRunAt } = await loadCollector()
      const next = new Date(calcNextRunAt('daily')!)
      const now = new Date()
      expect(next.getHours()).toBe(0)
      expect(next.getMinutes()).toBe(0)
      expect(next.getTime()).toBeGreaterThan(now.getTime())
    })

    it('weekly은 다음 월요일 00:00을 반환한다', async () => {
      const { calcNextRunAt } = await loadCollector()
      const next = new Date(calcNextRunAt('weekly')!)
      expect(next.getDay()).toBe(1)
      expect(next.getHours()).toBe(0)
      expect(next.getMinutes()).toBe(0)
    })

    it('monthly은 다음 달 1일 00:00을 반환한다', async () => {
      const { calcNextRunAt } = await loadCollector()
      const next = new Date(calcNextRunAt('monthly')!)
      expect(next.getDate()).toBe(1)
      expect(next.getHours()).toBe(0)
      expect(next.getMinutes()).toBe(0)
    })
  })

  describe('extractByJsonPath', () => {
    it('배열 루트를 반환한다', async () => {
      const { extractByJsonPath } = await loadCollector()
      const payload = [{ id: 1 }, { id: 2 }]
      expect(extractByJsonPath(payload, '$')).toEqual(payload)
    })

    it('중첩 경로의 배열을 추출한다', async () => {
      const { extractByJsonPath } = await loadCollector()
      const payload = { response: { body: { items: [{ name: 'a' }, { name: 'b' }] } } }
      expect(extractByJsonPath(payload, '$.response.body.items')).toEqual([{ name: 'a' }, { name: 'b' }])
    })

    it('존재하지 않는 경로는 빈 배열을 반환한다', async () => {
      const { extractByJsonPath } = await loadCollector()
      expect(extractByJsonPath({}, '$.missing.path')).toEqual([])
    })
  })

  describe('parseCsv', () => {
    it('기본 CSV를 파싱한다', async () => {
      const { parseCsv } = await loadCollector()
      const text = 'name,age\nAlice,30\nBob,25'
      const rows = parseCsv(text)
      expect(rows).toHaveLength(2)
      expect(rows[0]).toMatchObject({ name: 'Alice', age: 30 })
      expect(rows[1]).toMatchObject({ name: 'Bob', age: 25 })
    })

    it('따옴표와 이중 따옴표를 처리한다', async () => {
      const { parseCsv } = await loadCollector()
      const text = 'id,desc\n1,"hello, world"\n2,"with ""quote"""'
      const rows = parseCsv(text)
      expect(rows[0].desc).toBe('hello, world')
      expect(rows[1].desc).toBe('with "quote"')
    })

    it('빈 값은 null로 변환한다', async () => {
      const { parseCsv } = await loadCollector()
      const text = 'a,b\n1,\n,2'
      const rows = parseCsv(text)
      expect(rows[0].b).toBeNull()
      expect(rows[1].a).toBeNull()
    })
  })

  describe('diffRows', () => {
    it('동일한 행 집합은 0을 반환한다', async () => {
      const { diffRows } = await loadCollector()
      const rows = [{ id: 1 }, { id: 2 }]
      const result = diffRows(rows, rows)
      expect(result.rows_new).toBe(0)
      expect(result.rows_deleted).toBe(0)
    })

    it('추가/삭제된 행을 계산한다', async () => {
      const { diffRows } = await loadCollector()
      const prev = [{ id: 1 }, { id: 2 }]
      const next = [{ id: 2 }, { id: 3 }]
      const result = diffRows(prev, next)
      expect(result.rows_new).toBe(1)
      expect(result.rows_deleted).toBe(1)
    })
  })

  describe('parseXmlOrJson (via collector)', () => {
    it('XML 응답을 행 배열로 파싱한다', async () => {
      const { fetchSource } = await loadCollector()
      const xml = `<?xml version="1.0"?><response><body><items><item><id>1</id></item></items></body></response>`

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => xml,
      } as unknown as Response)

      const result = await fetchSource({
        source_id: 'src_xml', tenant_id: 't1', title: 'xml test', description: null,
        url: 'https://apis.data.go.kr/test', method: 'GET', auth_type: 'none',
        auth_key: null, auth_value: null, query_params: {}, request_body: null,
        resp_format: 'xml', json_path: '$.response.body.items.item',
        theme: null, keywords: null, license: null,
        pagination_type: 'none', pagination_page_param: null,
        pagination_size_param: null, pagination_size: null,
        pagination_total_path: null, created_at: '', updated_at: '',
      })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].id).toBe('1')
    })
  })

  describe('cursor pagination', () => {
    it('cursor 파라미터로 다음 페이지를 가져온다', async () => {
      const { fetchSource } = await loadCollector()

      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify({ data: [{ id: 1 }], next_cursor: 'c2' }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify({ data: [{ id: 2 }] }),
        } as unknown as Response)

      const result = await fetchSource({
        source_id: 'src_cursor', tenant_id: 't1', title: 'cursor test', description: null,
        url: 'https://example.com/api', method: 'GET', auth_type: 'none',
        auth_key: null, auth_value: null, query_params: {}, request_body: null,
        resp_format: 'json', json_path: '$.data',
        theme: null, keywords: null, license: null,
        pagination_type: 'cursor', pagination_page_param: 'cursor',
        pagination_size_param: 'limit', pagination_size: 1,
        pagination_total_path: '$.next_cursor', created_at: '', updated_at: '',
      })

      expect(result.rows).toHaveLength(2)
      expect(result.rows[0].id).toBe(1)
      expect(result.rows[1].id).toBe(2)
      expect(result.pagesFetched).toBe(2)

      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls[0][0]).toContain('limit=1')
      expect(calls[1][0]).toContain('cursor=c2')
    })
  })
})
