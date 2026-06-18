-- 027_embeddings.sql — 카탈로그 의미 검색(pgvector) 및 AI-Ready 제안 컬럼

-- vector 확장이 사용 가능할 때만 활성화 (Supabase 기본 제공)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
  END IF;
END $$;

-- AI-Ready 메타데이터 개선 제안 저장용 (LLM 기반)
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS suggestions JSONB;

-- pgvector 컬럼 및 임베딩 모델 정보
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE catalog ADD COLUMN IF NOT EXISTS description_embedding vector(1536);
    ALTER TABLE catalog ADD COLUMN IF NOT EXISTS embedding_model text;

    CREATE OR REPLACE FUNCTION match_catalog(
      query_embedding vector(1536),
      match_threshold float DEFAULT 0.5,
      match_count int DEFAULT 5
    )
    RETURNS TABLE(
      dataset_id text,
      title text,
      theme text,
      keywords text,
      description text,
      format text,
      similarity float
    )
    LANGUAGE sql STABLE
    AS $$
      SELECT
        c.dataset_id,
        c.title,
        c.theme,
        c.keywords,
        c.description,
        c.format,
        1 - (c.description_embedding <=> query_embedding) AS similarity
      FROM catalog c
      WHERE c.description_embedding IS NOT NULL
        AND c.ai_ready = true
        AND 1 - (c.description_embedding <=> query_embedding) > match_threshold
      ORDER BY c.description_embedding <=> query_embedding
      LIMIT match_count;
    $$;

    CREATE INDEX IF NOT EXISTS idx_catalog_embedding
      ON catalog USING ivfflat (description_embedding vector_cosine_ops)
      WHERE description_embedding IS NOT NULL;
  END IF;
END $$;
