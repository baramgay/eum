// 색상 틴트 단일 정본 — 라이트/다크 className 조합을 한 곳에서 관리한다.
// Tailwind JIT가 탐지하도록 모든 클래스는 완전한 리터럴 문자열로 둔다(`bg-${c}-50` 식 동적 조합 금지).
// 신규 callout·badge·강조 영역은 인라인 조합 대신 여기 TINT를 써서 다크모드 드리프트를 구조적으로 막는다.
// 컨벤션: bg-50→dark:bg-900/20 · bg-100→dark:bg-900/30 · text-700→dark:text-300 ·
//         text-600→dark:text-400 · border-200→dark:border-800 · hover→/40.

export type TintColor =
  | 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'indigo'
  | 'emerald' | 'yellow' | 'orange' | 'teal' | 'cyan' | 'sky' | 'rose' | 'gray'

export interface Tint {
  /** 옅은 배경 (bg-50 계열) — note·callout 박스용 */
  subtle: string
  /** 채운 배경 (bg-100 계열) — badge·강조 칩용 */
  solid: string
  /** 본문 색 (text-700 계열) */
  text: string
  /** 약한 본문 색 (text-600 계열) */
  textSoft: string
  /** 테두리 (border-200 계열) */
  border: string
}

export const TINT: Record<TintColor, Tint> = {
  blue: {
    subtle: 'bg-blue-50 dark:bg-blue-900/20',
    solid: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300',
    textSoft: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
  },
  green: {
    subtle: 'bg-green-50 dark:bg-green-900/20',
    solid: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-300',
    textSoft: 'text-green-600 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
  },
  amber: {
    subtle: 'bg-amber-50 dark:bg-amber-900/20',
    solid: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-300',
    textSoft: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
  },
  red: {
    subtle: 'bg-red-50 dark:bg-red-900/20',
    solid: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-300',
    textSoft: 'text-red-600 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800',
  },
  purple: {
    subtle: 'bg-purple-50 dark:bg-purple-900/20',
    solid: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-300',
    textSoft: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
  },
  indigo: {
    subtle: 'bg-indigo-50 dark:bg-indigo-900/20',
    solid: 'bg-indigo-100 dark:bg-indigo-900/30',
    text: 'text-indigo-700 dark:text-indigo-300',
    textSoft: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-200 dark:border-indigo-800',
  },
  emerald: {
    subtle: 'bg-emerald-50 dark:bg-emerald-900/20',
    solid: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    textSoft: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  yellow: {
    subtle: 'bg-yellow-50 dark:bg-yellow-900/20',
    solid: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-700 dark:text-yellow-300',
    textSoft: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-200 dark:border-yellow-800',
  },
  orange: {
    subtle: 'bg-orange-50 dark:bg-orange-900/20',
    solid: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-300',
    textSoft: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800',
  },
  teal: {
    subtle: 'bg-teal-50 dark:bg-teal-900/20',
    solid: 'bg-teal-100 dark:bg-teal-900/30',
    text: 'text-teal-700 dark:text-teal-300',
    textSoft: 'text-teal-600 dark:text-teal-400',
    border: 'border-teal-200 dark:border-teal-800',
  },
  cyan: {
    subtle: 'bg-cyan-50 dark:bg-cyan-900/20',
    solid: 'bg-cyan-100 dark:bg-cyan-900/30',
    text: 'text-cyan-700 dark:text-cyan-300',
    textSoft: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-200 dark:border-cyan-800',
  },
  sky: {
    subtle: 'bg-sky-50 dark:bg-sky-900/20',
    solid: 'bg-sky-100 dark:bg-sky-900/30',
    text: 'text-sky-700 dark:text-sky-300',
    textSoft: 'text-sky-600 dark:text-sky-400',
    border: 'border-sky-200 dark:border-sky-800',
  },
  rose: {
    subtle: 'bg-rose-50 dark:bg-rose-900/20',
    solid: 'bg-rose-100 dark:bg-rose-900/30',
    text: 'text-rose-700 dark:text-rose-300',
    textSoft: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-800',
  },
  gray: {
    subtle: 'bg-gray-50 dark:bg-gray-900/40',
    solid: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-700 dark:text-gray-300',
    textSoft: 'text-gray-600 dark:text-gray-400',
    border: 'border-gray-200 dark:border-gray-700',
  },
}

/** note·callout 박스 표준 조합 (옅은 배경 + 테두리 + 본문색) */
export function tintNote(color: TintColor): string {
  const t = TINT[color]
  return `${t.subtle} ${t.border} ${t.text}`
}

/** 배지·강조 칩 표준 조합 (채운 배경 + 본문색) */
export function tintBadge(color: TintColor): string {
  const t = TINT[color]
  return `${t.solid} ${t.text}`
}
