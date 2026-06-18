import type { SupabaseClient } from '@supabase/supabase-js'

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/**
 * ai_ready=true 인 카탈로그 데이터셋마다 동적 조회 도구를 생성하고,
 * 기본 도구(query_dataset, list_datasets, run_ontology_action, run_sql)를 합친다.
 */
export async function buildDynamicTools(supabase: SupabaseClient): Promise<ToolDefinition[]> {
  const { data: rows } = await supabase
    .from('catalog')
    .select('dataset_id,title,description,theme,keywords,table_name,rows')
    .eq('ai_ready', true)

  const dynamicTools: ToolDefinition[] = (rows ?? []).map((r) => {
    const descriptionParts = [
      `데이터셋: ${r.title ?? r.dataset_id}`,
      r.description ? `설명: ${r.description}` : '',
      r.theme ? `주제: ${r.theme}` : '',
      r.keywords ? `키워드: ${r.keywords}` : '',
      r.table_name ? `테이블: ${r.table_name}` : '',
    ].filter(Boolean)

    return {
      type: 'function',
      function: {
        name: `query_dataset_${r.dataset_id}`,
        description: descriptionParts.join('\n').slice(0, 1024),
        parameters: {
          type: 'object',
          properties: {
            filters: {
              type: 'array',
              items: { type: 'string' },
              description: '필터 조건 문자열 목록 (예: "sigun=창원시")',
            },
            limit: {
              type: 'number',
              description: '최대 행 수 (기본 20)',
            },
          },
        },
      },
    }
  })

  const baseTools: ToolDefinition[] = [
    {
      type: 'function',
      function: {
        name: 'query_dataset',
        description: '경남 공공데이터에서 사용자의 의도에 맞는 데이터를 조회합니다.',
        parameters: {
          type: 'object',
          properties: {
            intent: {
              type: 'string',
              description:
                '의도 (예: 정착잠재지수, 청년인구 유출입, 사업체·고용, 제조업 사업체, 공공시설, 소득·신용 현황)',
            },
            sigun: { type: 'string', description: '시군명 (예: 창원시)' },
            filters: {
              type: 'array',
              items: { type: 'string' },
              description: '필터 조건 문자열 목록 (예: "소득 300 이상")',
            },
          },
          required: ['intent'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_datasets',
        description: '카탈로그에서 ai_ready=true인 데이터셋 목록을 조회합니다.',
        parameters: {
          type: 'object',
          properties: {
            theme: { type: 'string', description: '주제 필터' },
            limit: { type: 'number', description: '최대 개수' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'run_ontology_action',
        description: '온톨로지 기반 정책 액션 스코어링을 실행합니다.',
        parameters: {
          type: 'object',
          properties: {
            action_key: {
              type: 'string',
              description: '액션 키 (예: settlement, housing, employment)',
            },
            sgg: { type: 'string', description: '특정 시군 코드 (선택)' },
          },
          required: ['action_key'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'run_sql',
        description: '자연어를 안전한 SELECT SQL로 변환하여 실행합니다.',
        parameters: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: '사용자가 원하는 데이터를 자연어로 설명',
            },
          },
          required: ['question'],
        },
      },
    },
  ]

  return [...dynamicTools, ...baseTools]
}
