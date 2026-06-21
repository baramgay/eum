/**
 * 온톨로지 Palantir급 고도화용 공유 타입
 * lib/ontology/* 및 components/ontology/*, app/api/ontology/* 에서 참조
 */

// 기존 OntologyNode/OntologyEdge는 lib/ontology-utils.ts에 정의되어 있음
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'

export type { OntologyNode, OntologyEdge }

/** 그래프 전체 데이터 */
export interface OntologyGraphData {
  nodes: OntologyNode[]
  edges: OntologyEdge[]
}

/** 레이아웃 종류 */
export type GraphLayoutType = 'force' | 'cluster' | 'galaxy' | 'circular' | 'hierarchical' | 'radial' | 'geo' | 'time' | 'lineage'

/** 그래프 시뮬레이션에서 사용하는 위치 정보 */
export interface SimulationNodePosition {
  obj_id: string
  x: number
  y: number
  vx?: number
  vy?: number
}

/** 워크스페이스 스냅샷 */
export interface WorkspaceSnapshot {
  name?: string
  sgg?: string | null
  layout?: GraphLayoutType
  camera?: { x: number; y: number; k: number }
  selectedNodeId?: string | null
  activeRels?: string[]
  activeTypes?: string[]
  activeAnalytics?: AnalyticsPayload | null
  nodeSearch?: string
  createdAt?: string
}

/** 워크스페이스 DB 레코드 */
export interface OntologyWorkspace {
  id: string
  user_id: string
  name: string
  snapshot: WorkspaceSnapshot
  share_token?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

/** 분석 API 페이로드 */
export interface AnalyticsPayload {
  type: 'centrality' | 'community' | 'path' | 'similarity' | 'anomaly'
  /** centrality/community/anomaly 용 옵션 */
  metric?: 'degree' | 'weightedDegree' | 'betweenness' | 'closeness' | 'eigenvector'
  /** path 용 */
  source?: string
  target?: string
  /** similarity 용 */
  nodeId?: string
  top?: number
}

/** 중심성 분석 결과 */
export interface CentralityResult {
  obj_id: string
  label: string
  obj_type: string
  score: number
  rank: number
}

/** 커뮤니티(군집) 분석 결과 */
export interface CommunityResult {
  communityId: number
  nodes: Array<{ obj_id: string; label: string; obj_type: string }>
  size: number
  density: number
}

/** 최단 경로 결과 */
export interface PathResult {
  path: string[]
  labels: string[]
  distance: number
  edges: Array<{ src: string; rel: string; dst: string; weight: number }>
}

/** 유사도 분석 결과 */
export interface SimilarityResult {
  obj_id: string
  label: string
  obj_type: string
  score: number
}

/** 이상탐지 결과 */
export interface AnomalyResult {
  obj_id: string
  label: string
  obj_type: string
  zScore: number
  reason: string
}

/** 분석 API 응답 */
export type AnalyticsResult =
  | { type: 'centrality'; metric: string; results: CentralityResult[] }
  | { type: 'community'; communities: CommunityResult[] }
  | { type: 'path'; source: string; target: string; result: PathResult | null }
  | { type: 'similarity'; nodeId: string; results: SimilarityResult[] }
  | { type: 'anomaly'; results: AnomalyResult[] }

/** 분석 결과를 그래프에 시각적으로 반영할 때 사용하는 인코딩 */
export interface VisualEncoding {
  nodeColors: Map<string, string>
  nodeRadii: Map<string, number>
  nodeStrokes: Map<string, string>
  edgeColors: Map<string, string>
  edgeWidths: Map<string, number>
  legend: Array<{ color: string; label: string; type: 'node' | 'edge' }>
}

/** 정책 액션 스코어링 결과 */
export interface ScoredRegion {
  rank: number
  sgg_cd: string
  sigun: string
  youth_pop: number
  net_migration: number
  employees: number
  youth_centers: number
  priority_score: number
}

/** YAML 스키마 구조 */
export interface OntologyActionConfig {
  name: string
  description: string
  weights: {
    youth_pop: number
    employees: number
    facility_gap: number
    outmigration: number
  }
}

/** 메트릭 집계 방식 */
export type DomainMetricAggregate = 'sum' | 'avg'

/** 샘플 도메인 개별 메트릭 정의 */
export interface DomainMetricConfig {
  key: string
  label: string
  aggregate: DomainMetricAggregate
  /** props 문자열 포맷 시 사용할 소수점 자릿수 */
  fractionDigits?: number
}

export interface DomainConfig {
  name: string
  relation: string
  /** 이 도메인을 구성하는 메트릭 정의 (선택) */
  metrics?: DomainMetricConfig[]
}

/** YAML 스키마 전체 구조 */
export interface OntologySchemaConfig {
  facility_filter: string
  facility_filters: string[]
  sample_domains: Record<string, DomainConfig>
  actions: Record<string, OntologyActionConfig>
  keyword_mapping: Record<string, string[]>
}

/** score_action_data RPC 반환 타입 */
export interface ScoreActionRow {
  sgg_cd: string
  sigun: string
  pop: number
  net: number
  emp: number
  fac: number
}

/** 시군 Geo 중심좌표 (data/geo/sigun_centroids.json) */
export interface SigunCentroid {
  sgg_cd: string
  sigun: string
  lat: number
  lng: number
}

/** Supabase onto_objects/onto_links 조회 결과 */
export interface OntologyDbNode {
  obj_id: string
  obj_type: string
  label: string
  props: string
}

export interface OntologyDbEdge {
  src: string
  rel: string
  dst: string
  weight: number
}
