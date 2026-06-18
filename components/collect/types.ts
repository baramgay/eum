import type { ConnectorConfig } from '@/lib/connectors/types'

export interface CollectSource {
  source_id:        string
  tenant_id:        string
  title:            string
  description:      string | null
  url:              string
  method:           string
  auth_type:        string
  auth_key:         string | null
  auth_value:       string | null
  query_params:     Record<string, string> | null
  request_body:     Record<string, unknown> | null
  resp_format:      string
  json_path:        string | null
  theme:            string | null
  keywords:         string | null
  license:          string | null
  pagination_type:       string
  pagination_page_param: string | null
  pagination_size_param: string | null
  pagination_size:       number | null
  pagination_total_path: string | null
  connector_config: ConnectorConfig | null
  created_at:       string
  updated_at:       string
}

export interface CollectJob {
  job_id:        string
  source_id:     string
  tenant_id:     string
  schedule_type: string
  status:        string
  enabled:       boolean
  last_run_at:   string | null
  next_run_at:   string | null
  last_log_id:   string | null
  created_at:    string
}

export interface CollectLog {
  log_id:        string
  job_id:        string
  source_id:     string
  tenant_id:     string
  started_at:    string
  finished_at:   string | null
  duration_ms:   number | null
  status:        string
  rows_fetched:  number
  rows_new:      number
  rows_changed:  number
  rows_deleted:  number
  error_msg:     string | null
  table_name:    string | null
  source_title?: string | null
}

export interface SourceWithJob extends CollectSource {
  job?: CollectJob
}

export interface TestResult {
  ok:            boolean
  rows_fetched?: number
  pages_fetched?: number
  preview?:      Record<string, unknown>[]
  columns?:      string[]
  error?:        string
}
