/**
 * 클라이언트 안전 메타데이터 — fs 의존성 없음
 * ScenarioSelector, NodeKpiPanel 등 클라이언트 컴포넌트는 여기서만 임포트한다.
 * 서버 전용 빌더(buildDemoGraph)는 demo-graph.ts 에 있다.
 */

export type ScenarioKey = 'youth-exodus' | 'service-gap' | 'industry-cluster' | 'env-risk'

export interface ScenarioMeta {
  key: ScenarioKey
  title: string
  description: string
  icon: string
  dataSources: string[]
  analysisType: 'centrality' | 'community' | 'anomaly'
  layout: 'cluster' | 'radial' | 'force' | 'geo'
  nodeCount: string
  edgeCount: string
  accentColor: string
}

export const SCENARIO_META: ScenarioMeta[] = [
  {
    key: 'youth-exodus',
    title: '청년 유출 핫스팟',
    description: '경남 시군별 청년(20~34세) 순이동 흐름을 시각화합니다. 유출이 심한 시군을 강조하고, 어느 도시로 빠져나가는지 방향성 엣지로 표현합니다.',
    icon: '👥',
    dataSources: ['청년인구 샘플'],
    analysisType: 'centrality',
    layout: 'cluster',
    nodeCount: '18개 시군',
    edgeCount: '최대 54개',
    accentColor: '#EF4444',
  },
  {
    key: 'service-gap',
    title: '공공서비스 격차 지도',
    description: '복지·의료·문화·체육 시설 보유 현황을 노드 크기로 인코딩해 시군 간 격차를 한눈에 표시합니다. 취약 시군은 이상탐지로 강조됩니다.',
    icon: '🏥',
    dataSources: ['복지', '의료', '문화', '체육 샘플'],
    analysisType: 'anomaly',
    layout: 'radial',
    nodeCount: '22개',
    edgeCount: '72개',
    accentColor: '#3B82F6',
  },
  {
    key: 'industry-cluster',
    title: '산업 클러스터 분포',
    description: '업종별 사업체 집중도와 교통 접근성을 결합해 자연 발생한 산업 클러스터를 커뮤니티 탐지로 발견합니다. 동일 클러스터는 같은 색상으로 표현됩니다.',
    icon: '🏭',
    dataSources: ['사업체', '대중교통 샘플'],
    analysisType: 'community',
    layout: 'force',
    nodeCount: '26개',
    edgeCount: '90개',
    accentColor: '#10B981',
  },
  {
    key: 'env-risk',
    title: '환경·안전 취약지역',
    description: '대기질·수질·교통사고·화재안전 4개 지표를 복합 스코어로 합산해 취약 시군을 이상탐지합니다. 위험 시군은 붉은 펄스로 강조됩니다.',
    icon: '⚠️',
    dataSources: ['대기질', '수질', '교통사고', '화재안전 샘플'],
    analysisType: 'anomaly',
    layout: 'geo',
    nodeCount: '18개 시군',
    edgeCount: '인접 관계',
    accentColor: '#F59E0B',
  },
]

/* ────────── KPI 추출 (순수 문자열 파싱 — 서버 의존성 없음) ────────── */

export interface NodeKpi {
  label: string
  value: string
  unit?: string
  trend?: 'up' | 'down' | 'neutral'
  highlight?: boolean
}

export function extractNodeKpis(
  scenarioKey: ScenarioKey,
  nodeId: string,
  nodeProps: string
): NodeKpi[] {
  const props: Record<string, string> = {}
  for (const part of nodeProps.split(';')) {
    const [k, v] = part.split('=')
    if (k && v !== undefined) props[k.trim()] = v.trim()
  }

  switch (scenarioKey) {
    case 'youth-exodus':
      return [
        { label: '청년인구', value: Number(props.total_youth).toLocaleString(), unit: '명' },
        {
          label: '순이동',
          value: Number(props.net_migration) >= 0
            ? `+${Number(props.net_migration).toLocaleString()}`
            : Number(props.net_migration).toLocaleString(),
          unit: '명',
          trend: Number(props.net_migration) >= 0 ? 'up' : 'down',
          highlight: Number(props.net_migration) < 0,
        },
        { label: '유입', value: Number(props.influx).toLocaleString(), unit: '명', trend: 'up' },
        { label: '유출', value: Number(props.outflow).toLocaleString(), unit: '명', trend: 'down' },
        { label: '이동률', value: props.migration_rate ?? '-', unit: '%' },
      ]
    case 'service-gap':
      return [
        { label: '복지시설', value: props.welfare ?? '-', unit: '개' },
        { label: '의료시설', value: props.hospital ?? '-', unit: '개' },
        { label: '문화시설', value: props.cultural ?? '-', unit: '개' },
        { label: '체육시설', value: props.sports ?? '-', unit: '개' },
        { label: '시설 합계', value: Number(props.total_facility).toLocaleString(), unit: '개' },
      ]
    case 'industry-cluster':
      return [
        { label: '사업체 수', value: Number(props.total_biz).toLocaleString(), unit: '개' },
        { label: '종사자 수', value: Number(props.total_emp).toLocaleString(), unit: '명' },
        { label: '버스 노선', value: props.bus_routes ?? '-', unit: '개' },
      ]
    case 'env-risk':
      return [
        { label: '위험 지수', value: (Number(props.risk_score) * 100).toFixed(1), unit: '', highlight: Number(props.z_score) > 1.5 },
        { label: 'PM10 평균', value: props.pm10_avg ?? '-', unit: 'μg/m³', highlight: Number(props.pm10_avg) > 50 },
        { label: 'PM2.5 평균', value: props.pm25_avg ?? '-', unit: 'μg/m³', highlight: Number(props.pm25_avg) > 25 },
        { label: '교통사고', value: props.accidents ?? '-', unit: '건' },
        { label: '안전사고', value: props.fire_cases ?? '-', unit: '건' },
      ]
    default:
      return []
  }
}
