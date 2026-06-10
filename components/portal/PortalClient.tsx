'use client'

import { useEffect, useState } from 'react'

interface CatalogItem {
  id: string; title: string; theme: string; format: string; license: string
  quality_summary: string | null; description: string | null
}

const SORT_OPTIONS = [
  { value: 'title', label: '이름순' },
  { value: 'theme', label: '주제별' },
  { value: 'created_at', label: '최신순' },
]

export default function PortalClient() {
  const [items, setItems]   = useState<CatalogItem[]>([])
  const [q, setQ]           = useState('')
  const [sort, setSort]     = useState('title')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ sort })
    if (q.trim()) params.set('q', q.trim())
    fetch(`/api/catalog?${params}`).then(r => r.json()).then(d => {
      setItems(Array.isArray(d) ? d : [])
      setLoading(false)
    })
  }, [q, sort])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">데이터 포털</h2>
      </div>
      <div className="flex gap-2">
        <input
          value={q} onChange={e => setQ(e.target.value)} placeholder="데이터셋 검색..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm">
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {loading ? (
        <div className="text-center py-8 text-gray-400">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-gray-400">검색 결과가 없습니다.</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-lg border p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{item.theme}</span>
                <span className="text-xs text-gray-400">{item.format}</span>
              </div>
              <h3 className="font-medium text-gray-800 text-sm mb-1">{item.title}</h3>
              {item.description && <p className="text-xs text-gray-500 line-clamp-2">{item.description}</p>}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-400">{item.license}</span>
                {item.quality_summary && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    item.quality_summary.includes('통과') ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>{item.quality_summary}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
