'use client'

import { useState } from 'react'
import { Btn } from '@/components/ui'
import type { ConnectorConfig } from '@/lib/connectors/types'
import { testConnector } from '@/lib/connectors/client'

type ConnectorType = 'none' | 'postgres' | 'sftp' | 'api'

interface Props {
  value: ConnectorConfig | null
  onChange: (config: ConnectorConfig | null) => void
}

export default function ConnectorForm({ value, onChange }: Props) {
  const [type, setType] = useState<ConnectorType>(value?.type ?? 'none')
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)

  function updateConfig(next: ConnectorConfig | null) {
    setTestMessage(null)
    onChange(next)
  }

  function handleTypeChange(next: ConnectorType) {
    setType(next)
    setTestMessage(null)
    if (next === 'none') {
      onChange(null)
      return
    }
    if (next === 'postgres') {
      onChange({ type: 'postgres', host: '', port: 5432, database: '', username: '', password: '', ssl: false })
    } else if (next === 'sftp') {
      onChange({ type: 'sftp', host: '', port: 22, username: '', remotePath: '' })
    } else if (next === 'api') {
      onChange({ type: 'api', url: '', method: 'GET', headers: {}, authType: 'none' })
    }
  }

  function patch(patchObj: Partial<ConnectorConfig>) {
    if (!value) return
    updateConfig({ ...value, ...patchObj } as ConnectorConfig)
  }

  async function handleTest() {
    if (!value) return
    setTesting(true)
    setTestMessage(null)
    const result = await testConnector(value)
    setTestMessage(result.message ?? (result.ok ? '연결 성공' : '연결 실패'))
    setTesting(false)
  }

  const inputClass =
    'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500'
  const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

  return (
    <div className="border rounded-md p-3 bg-gray-50 dark:bg-gray-950 space-y-3">
      <div className="flex items-center gap-2">
        <label htmlFor="connector-type" className="text-xs font-semibold text-gray-700 dark:text-gray-300">외부 시스템 커넥터</label>
        <select
          id="connector-type"
          value={type}
          onChange={e => handleTypeChange(e.target.value as ConnectorType)}
          className="px-2 py-1 border rounded text-xs bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
        >
          <option value="none">사용 안 함</option>
          <option value="postgres">PostgreSQL</option>
          <option value="sftp">SFTP</option>
          <option value="api">HTTP API</option>
        </select>
      </div>

      {value?.type === 'postgres' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="pg-host" className={labelClass}>호스트</label>
            <input
              id="pg-host"
              value={(value as Extract<ConnectorConfig, { type: 'postgres' }>).host}
              onChange={e => patch({ host: e.target.value })}
              className={inputClass}
              placeholder="db.example.com"
            />
          </div>
          <div>
            <label htmlFor="pg-port" className={labelClass}>포트</label>
            <input
              id="pg-port"
              type="number"
              value={(value as Extract<ConnectorConfig, { type: 'postgres' }>).port}
              onChange={e => patch({ port: Number(e.target.value) })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="pg-database" className={labelClass}>데이터베이스</label>
            <input
              id="pg-database"
              value={(value as Extract<ConnectorConfig, { type: 'postgres' }>).database}
              onChange={e => patch({ database: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="pg-username" className={labelClass}>사용자</label>
            <input
              id="pg-username"
              value={(value as Extract<ConnectorConfig, { type: 'postgres' }>).username}
              onChange={e => patch({ username: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="pg-password" className={labelClass}>비밀번호</label>
            <input
              id="pg-password"
              type="password"
              value={(value as Extract<ConnectorConfig, { type: 'postgres' }>).password}
              onChange={e => patch({ password: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="flex items-center gap-2 h-full pt-5">
            <input
              id="pg-ssl"
              type="checkbox"
              checked={(value as Extract<ConnectorConfig, { type: 'postgres' }>).ssl ?? false}
              onChange={e => patch({ ssl: e.target.checked })}
            />
            <label htmlFor="pg-ssl" className="text-xs text-gray-600 dark:text-gray-400">SSL 사용</label>
          </div>
        </div>
      )}

      {value?.type === 'sftp' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="sftp-host" className={labelClass}>호스트</label>
            <input
              id="sftp-host"
              value={(value as Extract<ConnectorConfig, { type: 'sftp' }>).host}
              onChange={e => patch({ host: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="sftp-port" className={labelClass}>포트</label>
            <input
              id="sftp-port"
              type="number"
              value={(value as Extract<ConnectorConfig, { type: 'sftp' }>).port}
              onChange={e => patch({ port: Number(e.target.value) })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="sftp-username" className={labelClass}>사용자</label>
            <input
              id="sftp-username"
              value={(value as Extract<ConnectorConfig, { type: 'sftp' }>).username}
              onChange={e => patch({ username: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="sftp-remotePath" className={labelClass}>원격 경로</label>
            <input
              id="sftp-remotePath"
              value={(value as Extract<ConnectorConfig, { type: 'sftp' }>).remotePath}
              onChange={e => patch({ remotePath: e.target.value })}
              className={inputClass}
              placeholder="/data/files"
            />
          </div>
          <div>
            <label htmlFor="sftp-password" className={labelClass}>비밀번호</label>
            <input
              id="sftp-password"
              type="password"
              value={(value as Extract<ConnectorConfig, { type: 'sftp' }>).password ?? ''}
              onChange={e => patch({ password: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="sftp-privateKey" className={labelClass}>개인 키 (선택)</label>
            <textarea
              id="sftp-privateKey"
              value={(value as Extract<ConnectorConfig, { type: 'sftp' }>).privateKey ?? ''}
              onChange={e => patch({ privateKey: e.target.value })}
              className={inputClass}
              rows={3}
            />
          </div>
        </div>
      )}

      {value?.type === 'api' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label htmlFor="api-url" className={labelClass}>URL</label>
            <input
              id="api-url"
              value={(value as Extract<ConnectorConfig, { type: 'api' }>).url}
              onChange={e => patch({ url: e.target.value })}
              className={inputClass}
              placeholder="https://api.example.com/data"
            />
          </div>
          <div>
            <label htmlFor="api-method" className={labelClass}>메서드</label>
            <select
              id="api-method"
              value={(value as Extract<ConnectorConfig, { type: 'api' }>).method}
              onChange={e => patch({ method: e.target.value as 'GET' | 'POST' })}
              className={inputClass}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </div>
          <div>
            <label htmlFor="api-authType" className={labelClass}>인증 방식</label>
            <select
              id="api-authType"
              value={(value as Extract<ConnectorConfig, { type: 'api' }>).authType}
              onChange={e => patch({ authType: e.target.value as 'none' | 'bearer' | 'api_key' })}
              className={inputClass}
            >
              <option value="none">없음</option>
              <option value="bearer">Bearer</option>
              <option value="api_key">API 키</option>
            </select>
          </div>
          {(value as Extract<ConnectorConfig, { type: 'api' }>).authType === 'api_key' && (
            <div>
              <label htmlFor="api-authKey" className={labelClass}>헤더 키</label>
              <input
                id="api-authKey"
                value={(value as Extract<ConnectorConfig, { type: 'api' }>).authKey ?? ''}
                onChange={e => patch({ authKey: e.target.value })}
                className={inputClass}
              />
            </div>
          )}
          {(value as Extract<ConnectorConfig, { type: 'api' }>).authType !== 'none' && (
            <div>
              <label htmlFor="api-authValue" className={labelClass}>인증 값</label>
              <input
                id="api-authValue"
                type="password"
                value={(value as Extract<ConnectorConfig, { type: 'api' }>).authValue ?? ''}
                onChange={e => patch({ authValue: e.target.value })}
                className={inputClass}
              />
            </div>
          )}
          <div className="md:col-span-2">
            <label htmlFor="api-headers" className={labelClass}>헤더 (JSON)</label>
            <textarea
              id="api-headers"
              value={JSON.stringify((value as Extract<ConnectorConfig, { type: 'api' }>).headers ?? {}, null, 2)}
              onChange={e => {
                try {
                  patch({ headers: JSON.parse(e.target.value) })
                } catch {}
              }}
              className={inputClass}
              rows={2}
            />
          </div>
        </div>
      )}

      {value && type !== 'none' && (
        <div className="flex items-center gap-2">
          <Btn type="button" size="sm" variant="secondary" loading={testing} onClick={handleTest}>
            {testing ? '테스트 중...' : '연결 테스트'}
          </Btn>
          {testMessage && (
            <span className={`text-xs ${testMessage.includes('성공') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {testMessage}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
