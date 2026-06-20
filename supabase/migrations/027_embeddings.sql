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

-- pgvector 컬럼 및 임베딩 모델 정보 (vector 확장 활성화 후 적용)
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    -- search_path에 extensions 포함해 vector 타입·연산자 사용 가능하게 설정
    SET LOCAL search_path = extensions, public;

    ALTER TABLE catalog ADD COLUMN IF NOT EXISTS description_embedding vector(1536);
    ALTER TABLE catalog ADD COLUMN IF NOT EXISTS embedding_model text;

    EXECUTE $func$
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
      SET search_path = extensions, public
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
      $$
    $func$;

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'catalog' AND indexname = 'idx_catalog_embedding'
    ) THEN
      CREATE INDEX idx_catalog_embedding
        ON catalog USING ivfflat (description_embedding vector_cosine_ops)
        WHERE description_embedding IS NOT NULL;
    END IF;
  END IF;
END $outer$;
