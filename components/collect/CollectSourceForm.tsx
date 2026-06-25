'use client'

import { useState, useMemo } from 'react'
import { FlaskConical } from 'lucide-react'
import { Btn } from '@/components/ui'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Label from '@/components/ui/Label'
import FormError from '@/components/ui/FormError'
import type { CollectSource, TestResult } from './types'
import type { ConnectorConfig } from '@/lib/connectors/types'
import ConnectorForm from './ConnectorForm'

interface Props {
  initialData?: CollectSource | null
  onSubmit: (body: Record<string, unknown>) => Promise<void>
  onTest: (data: Record<string, unknown>) => Promise<void>
  onCancel: () => void
  submitting: boolean
  testing: boolean
  testResult: TestResult | null
}

interface FormErrors {
  title?: string
  url?: string
  auth_value?: string
  json_path?: string
  request_body?: string
  pagination_size?: string
}

export default function CollectSourceForm({
  initialData,
  onSubmit,
  onTest,
  onCancel,
  submitting,
  testing,
  testResult,
}: Props) {
  const isEdit = Boolean(initialData)

  const [authType,       setAuthType]       = useState(initialData?.auth_type ?? 'none')
  const [respFormat,     setRespFormat]     = useState(initialData?.resp_format ?? 'json')
  const [method,         setMethod]         = useState(initialData?.method ?? 'GET')
  const [paginationType, setPaginationType] = useState(initialData?.pagination_type ?? 'none')

  const [requestBody, setRequestBody] = useState(
    initialData?.request_body ? JSON.stringify(initialData.request_body, null, 2) : ''
  )
  const [connectorConfig, setConnectorConfig] = useState<ConnectorConfig | null>(
    initialData?.connector_config ?? null
  )
  const [errors, setErrors] = useState<FormErrors>({})

  const defaultValues = useMemo(() => {
    return {
      title:       initialData?.title ?? '',
      url:         initialData?.url ?? '',
      description: initialData?.description ?? '',
      auth_key:    initialData?.auth_key ?? '',
      json_path:   initialData?.json_path ?? '',
      theme:       initialData?.theme ?? '',
      keywords:    initialData?.keywords ?? '',
      license:     initialData?.license ?? '공공누리 1유형',
      pagination_page_param:  initialData?.pagination_page_param ?? 'pageNo',
      pagination_size_param:  initialData?.pagination_size_param ?? 'numOfRows',
      pagination_size:        initialData?.pagination_size ?? 1000,
      pagination_total_path:  initialData?.pagination_total_path ?? '$.totalCount',
    }
  }, [initialData])

  function clearError(key: keyof FormErrors) {
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  function validateRequestBody(): string | undefined {
    const raw = requestBody.trim()
    if (!raw) return undefined
    try {
      JSON.parse(raw)
      return undefined
    } catch {
      return 'Request Body가 올바른 JSON 형식이 아닙니다.'
    }
  }

  function validate(form: HTMLFormElement): boolean {
    const fd = new FormData(form)
    const next: FormErrors = {}

    const title = (fd.get('title') as string | null)?.trim()
    const url = (fd.get('url') as string | null)?.trim()

    if (!title) next.title = '제목을 입력해주세요.'
    if (!url) next.url = 'URL을 입력해주세요.'
    else if (!/^https?:\/\//i.test(url)) next.url = 'URL은 http:// 또는 https://로 시작해야 합니다.'

    if (authType !== 'none' && !isEdit) {
      const authValue = (fd.get('auth_value') as string | null)?.trim()
      if (!authValue) next.auth_value = '인증 값을 입력해주세요.'
    }

    if (respFormat === 'json' || respFormat === 'xml') {
      const jsonPath = (fd.get('json_path') as string | null)?.trim()
      if (!jsonPath) next.json_path = '데이터 경로를 입력해주세요.'
    }

    const bodyError = validateRequestBody()
    if (bodyError) next.request_body = bodyError

    if (paginationType === 'page' || paginationType === 'offset') {
      const size = Number(fd.get('pagination_size'))
      if (Number.isNaN(size) || size < 1 || size > 5000) {
        next.pagination_size = '페이지당 행 수는 1~5000 사이여야 합니다.'
      }
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  function collectFormData(form: HTMLFormElement): Record<string, unknown> {
    const fd = new FormData(form)
    return {
      url:           fd.get('url'),
      method:        fd.get('method'),
      auth_type:     fd.get('auth_type'),
      auth_key:      fd.get('auth_key') || null,
      auth_value:    fd.get('auth_value') || null,
      resp_format:   fd.get('resp_format'),
      json_path:     fd.get('json_path') || null,
      pagination_type:       fd.get('pagination_type') || 'none',
      pagination_page_param: fd.get('pagination_page_param') || 'pageNo',
      pagination_size_param: fd.get('pagination_size_param') || 'numOfRows',
      pagination_size:       fd.get('pagination_size') ? Number(fd.get('pagination_size')) : 1000,
      pagination_total_path: fd.get('pagination_total_path') || '$.totalCount',
      request_body:  (() => {
        const v = (fd.get('request_body') as string)?.trim()
        if (!v) return null
        try { return JSON.parse(v) } catch { return null }
      })(),
    }
  }

  async function handleTest(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.closest('form') as HTMLFormElement
    const bodyError = validateRequestBody()
    if (bodyError) {
      setErrors(prev => ({ ...prev, request_body: bodyError }))
      return
    }
    const data = collectFormData(form)
    if (!data.url) return
    await onTest(data)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!validate(e.currentTarget)) return

    const fd = new FormData(e.currentTarget)

    let parsedBody: Record<string, unknown> | null = null
    const rawBody = requestBody.trim()
    if (rawBody) {
      try { parsedBody = JSON.parse(rawBody) } catch {
        setErrors(prev => ({ ...prev, request_body: 'Request Body가 올바른 JSON 형식이 아닙니다.' }))
        return
      }
    }

    const body: Record<string, unknown> = {
      title:        fd.get('title'),
      url:          fd.get('url'),
      description:  fd.get('description') || null,
      method:       fd.get('method'),
      auth_type:    fd.get('auth_type'),
      auth_key:     fd.get('auth_key') || null,
      auth_value:   fd.get('auth_value') || null,
      resp_format:  fd.get('resp_format'),
      json_path:    fd.get('json_path') || null,
      theme:        fd.get('theme') || null,
      keywords:     fd.get('keywords') || null,
      license:      fd.get('license') || '공공누리 1유형',
      request_body: parsedBody,
      pagination_type:       fd.get('pagination_type') || 'none',
      pagination_page_param: fd.get('pagination_page_param') || 'pageNo',
      pagination_size_param: fd.get('pagination_size_param') || 'numOfRows',
      pagination_size:       fd.get('pagination_size') ? Number(fd.get('pagination_size')) : 1000,
      pagination_total_path: fd.get('pagination_total_path') || '$.totalCount',
      connector_config:      connectorConfig,
    }
    await onSubmit(body)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* 기본 정보 */}
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="title" className="text-xs text-gray-600 dark:text-gray-400 mb-1" required>제목</Label>
          <Input
            id="title"
            name="title"
            required
            defaultValue={defaultValues.title}
            error={errors.title}
            aria-describedby={errors.title ? 'title-error' : undefined}
            onChange={() => clearError('title')}
            className="px-3 py-2 border rounded-md bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <FormError id="title-error" message={errors.title} />
        </div>
        <div>
          <Label htmlFor="url" className="text-xs text-gray-600 dark:text-gray-400 mb-1" required>URL</Label>
          <Input
            id="url"
            name="url"
            type="url"
            required
            defaultValue={defaultValues.url}
            error={errors.url}
            aria-describedby={errors.url ? 'url-error' : undefined}
            onChange={() => clearError('url')}
            className="px-3 py-2 border rounded-md bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <FormError id="url-error" message={errors.url} />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="description" className="text-xs text-gray-600 dark:text-gray-400 mb-1">설명</Label>
          <Input
            id="description"
            name="description"
            defaultValue={defaultValues.description}
            className="px-3 py-2 border rounded-md bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
        <div>
          <Label htmlFor="method" className="text-xs text-gray-600 dark:text-gray-400 mb-1">HTTP 메서드</Label>
          <Select id="method" name="method" value={method} onChange={e => setMethod(e.target.value)}
            className="px-3 py-2 border rounded-md bg-white">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="resp_format" className="text-xs text-gray-600 dark:text-gray-400 mb-1">응답 형식</Label>
          <Select id="resp_format" name="resp_format" value={respFormat} onChange={e => setRespFormat(e.target.value)}
            className="px-3 py-2 border rounded-md bg-white">
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="xml">XML</option>
          </Select>
        </div>

        <div>
          <Label htmlFor="auth_type" className="text-xs text-gray-600 dark:text-gray-400 mb-1">인증 방식</Label>
          <Select id="auth_type" name="auth_type" value={authType} onChange={e => setAuthType(e.target.value)}
            className="px-3 py-2 border rounded-md bg-white">
            <option value="none">인증 없음</option>
            <option value="api_key">API 키 (헤더)</option>
            <option value="bearer">Bearer 토큰</option>
          </Select>
        </div>

        {authType === 'api_key' && (
          <>
            <div>
              <Label htmlFor="auth_key" className="text-xs text-gray-600 dark:text-gray-400 mb-1">헤더 키</Label>
              <Input
                id="auth_key"
                name="auth_key"
                defaultValue={defaultValues.auth_key}
                className="px-3 py-2 border rounded-md bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="auth_value" className="text-xs text-gray-600 dark:text-gray-400 mb-1" required={!isEdit}>API 키 값</Label>
              <Input
                id="auth_value"
                name="auth_value"
                type="password"
                placeholder={isEdit ? '변경 시에만 입력' : '••••••••'}
                error={errors.auth_value}
                aria-describedby={errors.auth_value ? 'auth_value-error' : undefined}
                onChange={() => clearError('auth_value')}
                className="px-3 py-2 border rounded-md bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <FormError id="auth_value-error" message={errors.auth_value} />
            </div>
          </>
        )}
        {authType === 'bearer' && (
          <div className="md:col-span-2">
            <Label htmlFor="auth_value" className="text-xs text-gray-600 dark:text-gray-400 mb-1" required={!isEdit}>Bearer 토큰</Label>
            <Input
              id="auth_value"
              name="auth_value"
              type="password"
              placeholder={isEdit ? '변경 시에만 입력' : '••••••••'}
              error={errors.auth_value}
              aria-describedby={errors.auth_value ? 'auth_value-error' : undefined}
              onChange={() => clearError('auth_value')}
              className="px-3 py-2 border rounded-md bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <FormError id="auth_value-error" message={errors.auth_value} />
          </div>
        )}
        {authType === 'none' && (
          <>
            <input type="hidden" name="auth_key" defaultValue="" />
            <input type="hidden" name="auth_value" defaultValue="" />
          </>
        )}

        {(respFormat === 'json' || respFormat === 'xml') && (
          <div>
            <Label htmlFor="json_path" className="text-xs text-gray-600 dark:text-gray-400 mb-1" required>
              데이터 경로 (JSON Path / XML Path) <span className="text-gray-400 dark:text-gray-300 font-normal">예: $.response.body.items.item</span>
            </Label>
            <Input
              id="json_path"
              name="json_path"
              defaultValue={defaultValues.json_path}
              error={errors.json_path}
              aria-describedby={errors.json_path ? 'json_path-error' : undefined}
              onChange={() => clearError('json_path')}
              className="px-3 py-2 border rounded-md bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <FormError id="json_path-error" message={errors.json_path} />
          </div>
        )}

        {method === 'POST' && (
          <div className="md:col-span-2">
            <Label htmlFor="request_body" className="text-xs text-gray-600 dark:text-gray-400 mb-1">Request Body (JSON)</Label>
            <Textarea
              id="request_body"
              name="request_body"
              rows={3}
              value={requestBody}
              onChange={e => {
                setRequestBody(e.target.value)
                clearError('request_body')
              }}
              placeholder='{"key": "value"}'
              error={errors.request_body}
              className="px-3 py-2 border rounded-md font-mono bg-white"
              aria-describedby={errors.request_body ? 'request_body-error' : undefined}
            />
            <FormError id="request_body-error" message={errors.request_body} />
          </div>
        )}
      </div>

      {/* 외부 시스템 커넥터 설정 */}
      <ConnectorForm value={connectorConfig} onChange={setConnectorConfig} />

      {/* 페이지네이션 설정 */}
      <div className="border rounded-md p-3 bg-gray-50 dark:bg-gray-950">
        <div className="flex items-center gap-2 mb-3">
          <label htmlFor="pagination_type" className="text-xs font-semibold text-gray-700 dark:text-gray-300">페이지네이션</label>
          <Select id="pagination_type" name="pagination_type" value={paginationType} onChange={e => setPaginationType(e.target.value)}
            className="px-2 py-1 border rounded text-xs bg-white">
            <option value="none">없음 (단일 요청)</option>
            <option value="page">페이지 번호 (공공데이터포털 기본)</option>
            <option value="offset">오프셋 (offset + limit)</option>
          </Select>
        </div>

        {(paginationType === 'page' || paginationType === 'offset') && (
          <div className="grid md:grid-cols-4 gap-2">
            <div>
              <label htmlFor="pagination_page_param" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                {paginationType === 'page' ? '페이지 파라미터' : '오프셋 파라미터'}
              </label>
              <Input id="pagination_page_param" name="pagination_page_param"
                defaultValue={defaultValues.pagination_page_param}
                className="px-2 py-1 border rounded text-xs bg-white" />
            </div>
            <div>
              <label htmlFor="pagination_size_param" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">크기 파라미터</label>
              <Input id="pagination_size_param" name="pagination_size_param"
                defaultValue={defaultValues.pagination_size_param}
                className="px-2 py-1 border rounded text-xs bg-white" />
            </div>
            <div>
              <label htmlFor="pagination_size" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">페이지당 행 수</label>
              <Input id="pagination_size" name="pagination_size" type="number" defaultValue={defaultValues.pagination_size} min={1} max={5000}
                className="px-2 py-1 border rounded text-xs bg-white" />
            </div>
            {paginationType === 'page' && (
              <div>
                <label htmlFor="pagination_total_path" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">전체 건수 경로</label>
                <Input id="pagination_total_path" name="pagination_total_path" defaultValue={defaultValues.pagination_total_path}
                  className="px-2 py-1 border rounded text-xs bg-white" />
              </div>
            )}
          </div>
        )}
        {(paginationType === 'none' || paginationType === '') && (
          <>
            <input type="hidden" name="pagination_page_param" defaultValue="pageNo" />
            <input type="hidden" name="pagination_size_param" defaultValue="numOfRows" />
            <input type="hidden" name="pagination_size" defaultValue={1000} />
            <input type="hidden" name="pagination_total_path" defaultValue="$.totalCount" />
          </>
        )}
        <FormError message={errors.pagination_size} />
      </div>

      {/* 메타 */}
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <Label htmlFor="theme" className="text-xs text-gray-600 dark:text-gray-400 mb-1">주제</Label>
          <Input
            id="theme"
            name="theme"
            defaultValue={defaultValues.theme}
            className="px-3 py-2 border rounded-md bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
        <div>
          <Label htmlFor="keywords" className="text-xs text-gray-600 dark:text-gray-400 mb-1">키워드</Label>
          <Input
            id="keywords"
            name="keywords"
            defaultValue={defaultValues.keywords}
            className="px-3 py-2 border rounded-md bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
        <div>
          <Label htmlFor="license" className="text-xs text-gray-600 dark:text-gray-400 mb-1">라이선스</Label>
          <Input
            id="license"
            name="license"
            defaultValue={defaultValues.license}
            className="px-3 py-2 border rounded-md bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
      </div>

      {/* 테스트 결과 */}
      {testResult && (
        <div className={`rounded-md p-3 text-sm ${testResult.ok ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
          {testResult.ok ? (
            <div>
              <p className="font-medium text-green-700 dark:text-green-300 mb-1">
                테스트 성공 — 총 {testResult.rows_fetched?.toLocaleString()}행
                {testResult.pages_fetched && testResult.pages_fetched > 1 && ` (${testResult.pages_fetched}페이지)`}
              </p>
              {testResult.columns && testResult.columns.length > 0 && (
                <p className="text-xs text-green-600 dark:text-green-400 mb-2">컬럼: {testResult.columns.join(', ')}</p>
              )}
              {testResult.preview && testResult.preview.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse w-full">
                    <thead>
                      <tr className="bg-green-100 dark:bg-green-900/40">
                        {testResult.columns?.map(c => (
                          <th key={c} className="border border-green-200 dark:border-green-700 px-2 py-1 text-left font-medium text-green-800 dark:text-green-200">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {testResult.preview.slice(0, 5).map((row, i) => (
                        <tr key={i} className="hover:bg-green-50 dark:hover:bg-green-900/20">
                          {testResult.columns?.map(c => (
                            <td key={c} className="border border-green-100 px-2 py-0.5 text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
                              {row[c] != null ? String(row[c]) : <span className="text-gray-300 dark:text-gray-200">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="text-red-600 dark:text-red-400 font-medium">오류: {testResult.error}</p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Btn type="button" variant="secondary" size="sm" loading={testing} onClick={handleTest}>
          <FlaskConical className="w-3.5 h-3.5" />
          {testing ? '테스트 중...' : '테스트'}
        </Btn>
        <Btn type="submit" size="sm" loading={submitting}>
          {submitting ? '저장 중...' : (isEdit ? '수정 저장' : '등록')}
        </Btn>
        <Btn type="button" variant="ghost" size="sm" onClick={onCancel}>취소</Btn>
      </div>
    </form>
  )
}
