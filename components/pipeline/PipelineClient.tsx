'use client'

import { useEffect, useState } from 'react'
import {
  BarChart2, FlaskConical, Target, Plus, Trash2, Save,
  CheckCircle, AlertTriangle, Clock, ExternalLink, FileText,
  Layers,
} from 'lucide-react'
import PipelineFlow from './PipelineFlow'

// ────── 타입 ──────
interface AnalysisRecord {
  record_id: string; tenant_id: string; title: string
  purpose: string | null; datasets_used: string[] | null
  result_summary: string | null; policy_applied: boolean
  performed_at: string; created_at: string
}
interface SyntheticCase {
  case_id: string; tenant_id: string
  case_type: 'synthetic' | 'anonymized'
  title: string; dataset_id: string | null; portal_url: string | null
  opened_at: string; created_at: string
}
interface Targets {
  target_year: number; open_rate_goal: number; ai_ready_goal: number
  quality_pass_goal: number; synthetic_goal: number; analysis_goal: number
}

type PerformanceTab = 'analysis' | 'synthetic' | 'targets' | 'qualitative'
type MainTab = 'flow' | 'performance'

interface QualInput {
  key: string; name: string
  status: 'ok' | 'warn' | 'na'
  note: string | null
  updated_at: string | null
}

// ────── 서브컴포넌트: 분석 실적 ──────
function AnalysisTab() {
  const [records, setRecords] = useState<AnalysisRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '', purpose: '', datasets_used: '', result_summary: '',
    policy_applied: false, performed_at: '',
  })

  const load = () =>
    fetch('/api/pipeline/analysis')
      .then(r => r.json())
      .then(d => { setRecords(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.title.trim() || !form.performed_at) return
    setSaving(true)
    const res = await fetch('/api/pipeline/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        purpose: form.purpose || undefined,
        datasets_used: form.datasets_used
          ? form.datasets_used.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        result_summary: form.result_summary || undefined,
        policy_applied: form.policy_applied,
        performed_at: form.performed_at,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setForm({ title: '', purpose: '', datasets_used: '', result_summary: '', policy_applied: false, performed_at: '' })
      setShowForm(false)
      load()
    }
  }

  const del = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/pipeline/analysis/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-800">데이터 분석·활용 실적</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            평가편람 분석·활용 ①-1 지표 — 데이터 분석·정책활용 실적 (10점)
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          실적 등록
        </button>
      </div>

      {showForm && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-purple-800">분석 실적 신규 등록</h4>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">분석명 *</label>
              <input
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300 focus:outline-none"
                placeholder="예: 경남 청년인구 이동패턴 분석"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">수행일 *</label>
              <input
                type="date"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300 focus:outline-none"
                value={form.performed_at}
                onChange={e => setForm(p => ({ ...p, performed_at: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">분석 목적</label>
              <input
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300 focus:outline-none"
                placeholder="정책활용 / 서비스개선 / 사회문제해결"
                value={form.purpose}
                onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">활용 데이터셋 (쉼표 구분)</label>
              <input
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300 focus:outline-none"
                placeholder="주민등록인구통계, 청년지원사업현황"
                value={form.datasets_used}
                onChange={e => setForm(p => ({ ...p, datasets_used: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">결과 요약</label>
              <textarea
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300 focus:outline-none resize-none"
                rows={2}
                placeholder="분석 결과 및 정책 제언 요약"
                value={form.result_summary}
                onChange={e => setForm(p => ({ ...p, result_summary: e.target.value }))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded accent-purple-600"
              checked={form.policy_applied}
              onChange={e => setForm(p => ({ ...p, policy_applied: e.target.checked }))}
            />
            <span className="text-gray-700">정책에 실제 반영됨</span>
          </label>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              취소
            </button>
            <button
              onClick={save}
              disabled={saving || !form.title.trim() || !form.performed_at}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">로딩 중...</div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
          <BarChart2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">등록된 분석 실적이 없습니다.</p>
          <p className="text-xs text-gray-300 mt-1">
            분석·활용 지표 기여를 위해 실적을 등록하세요.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <div key={r.record_id} className="bg-white border rounded-xl p-4 flex items-start gap-3 hover:border-purple-200 transition-colors">
              <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${r.policy_applied ? 'bg-green-100' : 'bg-gray-100'}`}>
                {r.policy_applied
                  ? <CheckCircle className="w-4 h-4 text-green-600" />
                  : <Clock className="w-4 h-4 text-gray-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800">{r.title}</p>
                  <button
                    onClick={() => del(r.record_id)}
                    className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  <span className="text-xs text-gray-400">{r.performed_at.slice(0, 10)}</span>
                  {r.purpose && <span className="text-xs text-purple-600">{r.purpose}</span>}
                  {r.policy_applied && (
                    <span className="text-xs text-green-600 font-medium">정책 반영</span>
                  )}
                </div>
                {r.datasets_used && r.datasets_used.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.datasets_used.map(ds => (
                      <span key={ds} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{ds}</span>
                    ))}
                  </div>
                )}
                {r.result_summary && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{r.result_summary}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ────── 서브컴포넌트: 가명·합성 실적 ──────
const CASE_TYPE_LABEL = { synthetic: '합성데이터', anonymized: '가명정보 제공' }
const CASE_TYPE_COLOR = { synthetic: 'bg-blue-100 text-blue-700', anonymized: 'bg-amber-100 text-amber-700' }

function SyntheticTab() {
  const [cases, setCases] = useState<SyntheticCase[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    case_type: 'synthetic' as 'synthetic' | 'anonymized',
    title: '', dataset_id: '', portal_url: '', opened_at: '',
  })

  const load = () =>
    fetch('/api/pipeline/synthetic')
      .then(r => r.json())
      .then(d => { setCases(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))

  useEffect(() => { load() }, [])

  const bonusScore = Math.min(cases.length, 5)

  const save = async () => {
    if (!form.title.trim() || !form.opened_at) return
    setSaving(true)
    const res = await fetch('/api/pipeline/synthetic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_type: form.case_type,
        title: form.title,
        dataset_id: form.dataset_id || undefined,
        portal_url: form.portal_url || undefined,
        opened_at: form.opened_at,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setForm({ case_type: 'synthetic', title: '', dataset_id: '', portal_url: '', opened_at: '' })
      setShowForm(false)
      load()
    }
  }

  const del = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/pipeline/synthetic/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-800">가명정보·합성데이터 개방 실적</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            평가편람 ⑤ 가점 — 1건당 1점, 최대 5점 가점
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          실적 등록
        </button>
      </div>

      {/* 가점 현황 배지 */}
      <div className={`rounded-xl p-4 flex items-center gap-4 ${bonusScore >= 5 ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'}`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold ${bonusScore >= 5 ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          +{bonusScore}
        </div>
        <div>
          <p className={`text-sm font-semibold ${bonusScore >= 5 ? 'text-green-700' : 'text-blue-700'}`}>
            현재 가점 {bonusScore}점 / 최대 5점
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {cases.length}건 등록 — {bonusScore >= 5 ? '최대 가점 달성!' : `${5 - bonusScore}건 추가 시 만점`}
          </p>
        </div>
        <div className="flex-1">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${bonusScore >= 5 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${(bonusScore / 5) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-blue-800">가명정보·합성데이터 실적 등록</h4>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">유형 *</label>
              <select
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-300 focus:outline-none bg-white"
                value={form.case_type}
                onChange={e => setForm(p => ({ ...p, case_type: e.target.value as 'synthetic' | 'anonymized' }))}
              >
                <option value="synthetic">합성데이터 개방</option>
                <option value="anonymized">가명정보 제공</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">개방·제공일 *</label>
              <input
                type="date"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-300 focus:outline-none"
                value={form.opened_at}
                onChange={e => setForm(p => ({ ...p, opened_at: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">데이터명 *</label>
              <input
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-300 focus:outline-none"
                placeholder="예: 경남 복지서비스 이용 합성데이터"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">연관 데이터셋 ID</label>
              <input
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-300 focus:outline-none"
                placeholder="catalog 데이터셋 ID"
                value={form.dataset_id}
                onChange={e => setForm(p => ({ ...p, dataset_id: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">공공데이터포털 URL</label>
              <input
                type="url"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-300 focus:outline-none"
                placeholder="https://data.go.kr/..."
                value={form.portal_url}
                onChange={e => setForm(p => ({ ...p, portal_url: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              취소
            </button>
            <button
              onClick={save}
              disabled={saving || !form.title.trim() || !form.opened_at}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">로딩 중...</div>
      ) : cases.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
          <FlaskConical className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">등록된 실적이 없습니다.</p>
          <p className="text-xs text-gray-300 mt-1">1건 등록 시 1점 가점 부여됩니다.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map(c => (
            <div key={c.case_id} className="bg-white border rounded-xl p-4 flex items-start gap-3 hover:border-blue-200 transition-colors">
              <div className="mt-0.5 w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <FlaskConical className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{c.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CASE_TYPE_COLOR[c.case_type]}`}>
                        {CASE_TYPE_LABEL[c.case_type]}
                      </span>
                      <span className="text-xs text-gray-400">{c.opened_at.slice(0, 10)}</span>
                      {c.portal_url && (
                        <a
                          href={c.portal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline flex items-center gap-0.5"
                        >
                          포털 <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => del(c.case_id)}
                    className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ────── 서브컴포넌트: 평가 목표 ──────
function TargetsTab() {
  const [targets, setTargets] = useState<Targets>({
    target_year: 2026, open_rate_goal: 80, ai_ready_goal: 50,
    quality_pass_goal: 100, synthetic_goal: 2, analysis_goal: 5,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/pipeline/targets')
      .then(r => r.json())
      .then(d => { setTargets(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    const res = await fetch('/api/pipeline/targets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(targets),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  type NumField = keyof Omit<Targets, 'target_year'>

  const fields: { key: NumField; label: string; unit: string; desc: string }[] = [
    { key: 'open_rate_goal',      label: '개방 목표율',        unit: '%',  desc: '개방계획 이행률 목표 (편람 ①-1)' },
    { key: 'ai_ready_goal',       label: 'AI-Ready 목표율',    unit: '%',  desc: 'AI친화 데이터 비율 목표 (편람 ②)' },
    { key: 'quality_pass_goal',   label: '품질진단 통과 목표', unit: '%',  desc: '품질진단 통과율 목표 (편람 ②)' },
    { key: 'synthetic_goal',      label: '가명·합성 목표건수', unit: '건', desc: '가점 목표 (최대 5건 = 5점)' },
    { key: 'analysis_goal',       label: '분석 실적 목표건수', unit: '건', desc: '분석·활용 ①-1 지표 목표' },
  ]

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">로딩 중...</div>

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-800">평가 목표 설정</h3>
        <p className="text-xs text-gray-500 mt-0.5">목표 대비 현황을 리포트에서 비교합니다.</p>
      </div>
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b flex items-center gap-2">
          <Target className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-gray-700">{targets.target_year}년 평가 목표</span>
        </div>
        <div className="p-4 space-y-4">
          {fields.map(f => (
            <div key={f.key} className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">{f.label}</p>
                <p className="text-xs text-gray-400">{f.desc}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <input
                  type="number"
                  min={0}
                  max={f.unit === '%' ? 100 : 100}
                  step={f.unit === '%' ? 5 : 1}
                  className="w-20 px-2 py-1.5 text-sm border rounded-lg text-right focus:ring-2 focus:ring-amber-300 focus:outline-none"
                  value={targets[f.key]}
                  onChange={e => setTargets(p => ({ ...p, [f.key]: Number(e.target.value) }))}
                />
                <span className="text-xs text-gray-500 w-4">{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t bg-gray-50 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg transition-colors font-medium ${
              saved
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            } disabled:opacity-50`}
          >
            {saved ? (
              <><CheckCircle className="w-3.5 h-3.5" /> 저장됨</>
            ) : (
              <><Save className="w-3.5 h-3.5" /> {saving ? '저장 중...' : '목표 저장'}</>
            )}
          </button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-700 space-y-1">
            <p className="font-medium">목표 설정 안내</p>
            <p>편람 기준: 개방율 80% 이상, AI-Ready 50% 이상, 품질진단 통과율 100%, 가명·합성 2건 이상.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ────── 서브컴포넌트: 정성지표 입력 ──────
const STATUS_LABEL: Record<string, string> = { ok: '우수', warn: '보통', na: '미입력' }
const STATUS_COLOR: Record<string, string> = {
  ok:   'bg-green-100 text-green-700',
  warn: 'bg-yellow-100 text-yellow-700',
  na:   'bg-gray-100 text-gray-500',
}

function QualitativeTab() {
  const [inputs, setInputs] = useState<QualInput[] | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ status: 'ok' | 'warn' | 'na'; note: string }>({ status: 'na', note: '' })

  useEffect(() => {
    fetch('/api/evaluation/qualitative')
      .then(async r => {
        if (r.status === 400) { setErrMsg('no_tenant'); setLoading(false); return null }
        if (!r.ok) { setErrMsg('server_error'); setLoading(false); return null }
        return r.json()
      })
      .then((d: QualInput[] | null) => { if (d) { setInputs(Array.isArray(d) ? d : []); setLoading(false) } })
      .catch(() => { setErrMsg('server_error'); setLoading(false) })
  }, [])

  function startEdit(inp: QualInput) {
    setEditing(inp.key)
    setDraft({ status: inp.status, note: inp.note ?? '' })
  }

  async function saveEdit(key: string) {
    setSaving(key)
    const res = await fetch('/api/evaluation/qualitative', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, status: draft.status, note: draft.note || undefined }),
    })
    setSaving(null)
    if (res.ok) {
      setInputs(prev => (prev ?? []).map(i =>
        i.key === key ? { ...i, status: draft.status, note: draft.note || null, updated_at: new Date().toISOString() } : i
      ))
      setEditing(null)
    }
  }

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">로딩 중...</div>
  if (errMsg === 'no_tenant') return (
    <div className="text-center py-12 text-gray-400 text-sm">
      <p className="font-medium text-gray-500">기관 담당자 전용 기능입니다.</p>
      <p className="mt-1">개별 기관 계정으로 로그인하면 정성지표 실적을 입력할 수 있습니다.</p>
    </div>
  )
  if (errMsg === 'server_error') return (
    <div className="text-center py-12 text-amber-600 text-sm">
      <p className="font-medium">데이터베이스 준비 중입니다.</p>
      <p className="mt-1 text-gray-500">Supabase SQL Editor에서 017_qualitative_inputs.sql 마이그레이션을 적용해주세요.</p>
    </div>
  )

  const safeInputs = inputs ?? []
  const naCount = safeInputs.filter(i => i.status === 'na').length

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-800">정성지표 실적 입력</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          자동 집계가 불가한 정성 지표는 담당자가 직접 실적을 입력합니다.
        </p>
      </div>

      {naCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-xs text-amber-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{naCount}개 지표가 아직 입력되지 않았습니다. 실적을 입력하면 평가 점수에 반영됩니다.</span>
        </div>
      )}

      <div className="space-y-2">
        {safeInputs.map(inp => (
          <div key={inp.key} className="bg-white border rounded-xl p-4">
            {editing === inp.key ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-800">{inp.name}</p>
                <div className="flex gap-2">
                  {(['ok', 'warn', 'na'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setDraft(p => ({ ...p, status: s }))}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        draft.status === s ? STATUS_COLOR[s] + ' border-current' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
                <textarea
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-300 focus:outline-none resize-none"
                  rows={3}
                  placeholder="실적 내용, 증빙 자료, 이행 현황 등을 간략히 기재하세요"
                  value={draft.note}
                  onChange={e => setDraft(p => ({ ...p, note: e.target.value }))}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">취소</button>
                  <button
                    onClick={() => saveEdit(inp.key)}
                    disabled={saving === inp.key}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Save className="w-3 h-3" />
                    {saving === inp.key ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[inp.status]}`}>
                      {STATUS_LABEL[inp.status]}
                    </span>
                    <p className="text-sm font-medium text-gray-800">{inp.name}</p>
                  </div>
                  {inp.note && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{inp.note}</p>
                  )}
                  {inp.updated_at && (
                    <p className="text-xs text-gray-400 mt-1">
                      최종 수정: {new Date(inp.updated_at).toLocaleDateString('ko-KR')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => startEdit(inp)}
                  className="flex-shrink-0 px-2.5 py-1 text-xs text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                >
                  입력
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ────── 메인 컴포넌트 ──────
const PERFORMANCE_TABS: { key: PerformanceTab; label: string; Icon: React.ElementType; color: string }[] = [
  { key: 'analysis',    label: '분석 실적',      Icon: BarChart2,    color: 'purple' },
  { key: 'synthetic',   label: '가명·합성 실적',  Icon: FlaskConical, color: 'blue' },
  { key: 'qualitative', label: '정성지표 입력',   Icon: FileText,     color: 'indigo' },
  { key: 'targets',     label: '평가 목표',      Icon: Target,       color: 'amber' },
]

const ACTIVE_STYLE: Record<string, string> = {
  purple: 'border-purple-500 text-purple-700 bg-purple-50',
  blue:   'border-blue-500 text-blue-700 bg-blue-50',
  indigo: 'border-indigo-500 text-indigo-700 bg-indigo-50',
  amber:  'border-amber-500 text-amber-700 bg-amber-50',
}

export default function PipelineClient() {
  const [mainTab, setMainTab] = useState<MainTab>('flow')
  const [perfTab, setPerfTab] = useState<PerformanceTab>('analysis')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">데이터 파이프라인</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          데이터가 수집·가공·분석·품질진단을 거쳐 개방되는 전체 흐름을 관리합니다.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'flow', label: '데이터 처리 흐름', Icon: Layers },
          { key: 'performance', label: '실적 관리', Icon: BarChart2 },
        ].map(({ key, label, Icon }) => {
          const active = mainTab === key
          return (
            <button
              key={key}
              onClick={() => setMainTab(key as MainTab)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                active
                  ? 'border-blue-600 text-blue-700 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          )
        })}
      </div>

      {mainTab === 'flow' && <PipelineFlow />}

      {mainTab === 'performance' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold text-gray-800">평가편람 실적 관리</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              평가편람 정량 지표에 직접 기여하는 실적을 등록하고 관리합니다.
            </p>
          </div>

          <div className="flex gap-1 border-b border-gray-200">
            {PERFORMANCE_TABS.map(({ key, label, Icon, color }) => {
              const active = perfTab === key
              return (
                <button
                  key={key}
                  onClick={() => setPerfTab(key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                    active ? ACTIVE_STYLE[color] : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              )
            })}
          </div>

          <div>
            {perfTab === 'analysis'    && <AnalysisTab />}
            {perfTab === 'synthetic'   && <SyntheticTab />}
            {perfTab === 'qualitative' && <QualitativeTab />}
            {perfTab === 'targets'     && <TargetsTab />}
          </div>
        </div>
      )}
    </div>
  )
}
