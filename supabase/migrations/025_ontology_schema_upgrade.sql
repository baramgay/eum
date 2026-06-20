-- 025_ontology_schema_upgrade.sql — 온톨로지 Palantir급 고도화를 위한 스키마 업그레이드
-- 요구사항: 멱등성(idempotent) 유지, 기존 데이터 보존, backfill 제공

-- ──────────────────────────────────────────────────────────────────────────
-- 1. onto_objects 에 JSONB 속성 컬럼 추가 및 GIN 인덱스
-- ──────────────────────────────────────────────────────────────────────────

alter table if exists public.onto_objects
  add column if not exists props_jsonb jsonb not null default '{}'::jsonb;

-- 기존 props 문자열('키=값;...')을 JSONB 로 백필.
-- 복잡한 이스케이프가 없는 한국어 공공데이터 특성상 안전하게 split 후 객체로 변환.
-- 값은 문자열로 보존하며, 숫자로 변환 가능한 값은 숫자로 저장해 jsonb 연산을 원활하게 한다.
update public.onto_objects
set props_jsonb = (
  select coalesce(jsonb_object_agg(
    trim(split_part(kv, '=', 1)),
    case
      when split_part(kv, '=', 2) ~ '^-?[0-9]+(\\.[0-9]+)?$'
        then to_jsonb(trim(split_part(kv, '=', 2))::numeric)
      else to_jsonb(trim(split_part(kv, '=', 2)))
    end
  ), '{}'::jsonb)
  from unnest(string_to_array(props, ';')) as kv
  where kv <> '' and split_part(kv, '=', 1) <> ''
)
where props_jsonb = '{}'::jsonb and props is not null and props <> '';

comment on column public.onto_objects.props_jsonb is '노드 속성의 JSONB 표현 (검색·필터·인덱싱용)';

-- 인덱스

create index if not exists idx_onto_objects_obj_type on public.onto_objects(obj_type);
create index if not exists idx_onto_objects_label on public.onto_objects(label);
create index if not exists idx_onto_objects_props_jsonb_gin on public.onto_objects using gin (props_jsonb);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. onto_links 의 PK/FK 정리
-- ──────────────────────────────────────────────────────────────────────────

-- 고아 링크 제거 (onto_objects 에 없는 src/dst 참조 제거 — FK 추가 전 필수)
delete from public.onto_links
where src not in (select obj_id from public.onto_objects)
   or dst not in (select obj_id from public.onto_objects);

-- 중복 엣지 제거 (동일 src/rel/dst 그룹에서 가장 큰 weight 하나만 유지)
with ranked as (
  select ctid,
         row_number() over (partition by src, rel, dst order by weight desc, ctid) as rn
  from public.onto_links
)
delete from public.onto_links
where ctid in (select ctid from ranked where rn > 1);

-- 복합 PK 및 FK 추가 (IF NOT EXISTS 구문이 없으므로 DO 블록으로 멱등성 확보)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'onto_links_pkey' and conrelid = 'public.onto_links'::regclass
  ) then
    alter table public.onto_links add constraint onto_links_pkey primary key (src, rel, dst);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'onto_links_src_fk' and conrelid = 'public.onto_links'::regclass
  ) then
    alter table public.onto_links add constraint onto_links_src_fk
      foreign key (src) references public.onto_objects(obj_id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'onto_links_dst_fk' and conrelid = 'public.onto_links'::regclass
  ) then
    alter table public.onto_links add constraint onto_links_dst_fk
      foreign key (dst) references public.onto_objects(obj_id) on delete cascade;
  end if;
end $$;

-- 인덱스

create index if not exists idx_onto_links_rel on public.onto_links(rel);
create index if not exists idx_onto_links_src on public.onto_links(src);
create index if not exists idx_onto_links_dst on public.onto_links(dst);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. RLS: 인증 사용자는 읽기, service_role/center 역할은 쓰기
-- ──────────────────────────────────────────────────────────────────────────

alter table if exists public.onto_objects enable row level security;
alter table if exists public.onto_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'onto_objects' and policyname = 'onto_objects_select_authenticated'
  ) then
    create policy "onto_objects_select_authenticated"
      on public.onto_objects for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'onto_objects' and policyname = 'onto_objects_all_service'
  ) then
    create policy "onto_objects_all_service"
      on public.onto_objects for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'onto_links' and policyname = 'onto_links_select_authenticated'
  ) then
    create policy "onto_links_select_authenticated"
      on public.onto_links for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'onto_links' and policyname = 'onto_links_all_service'
  ) then
    create policy "onto_links_all_service"
      on public.onto_links for all to service_role using (true) with check (true);
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. 워크스페이스 협업 컬럼 추가
-- ──────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'ontology_workspaces') then
    alter table public.ontology_workspaces
      add column if not exists share_token text unique,
      add column if not exists notes text;
    if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'ontology_workspaces' and indexname = 'idx_ontology_workspaces_share_token') then
      create index idx_ontology_workspaces_share_token on public.ontology_workspaces(share_token);
    end if;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Gold 테이블 updated_at 추가 + 자동 갱신 트리거
-- ──────────────────────────────────────────────────────────────────────────

alter table if exists public.gold_youth_population
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.gold_business
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.gold_public_facility
  add column if not exists updated_at timestamptz not null default now();

-- updated_at 자동 갱신 함수 (030에 정의되나 여기서 먼저 필요 — CREATE OR REPLACE로 멱등성 유지)
create or replace function public.update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- updated_at 자동 갱신 트리거
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'gold_youth_population_updated_at' and tgrelid = 'public.gold_youth_population'::regclass
  ) then
    create trigger gold_youth_population_updated_at
      before update on public.gold_youth_population
      for each row execute function public.update_updated_at_column();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'gold_business_updated_at' and tgrelid = 'public.gold_business'::regclass
  ) then
    create trigger gold_business_updated_at
      before update on public.gold_business
      for each row execute function public.update_updated_at_column();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'gold_public_facility_updated_at' and tgrelid = 'public.gold_public_facility'::regclass
  ) then
    create trigger gold_public_facility_updated_at
      before update on public.gold_public_facility
      for each row execute function public.update_updated_at_column();
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. 온톨로지 자동 재구축 상태 추적
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.ontology_rebuild_state (
  id int primary key default 1 check (id = 1),
  last_max_updated_at timestamptz not null default '1970-01-01'::timestamptz,
  last_rebuilt_at timestamptz,
  objects_count int,
  links_count int,
  updated_at timestamptz not null default now()
);

insert into public.ontology_rebuild_state (id, last_max_updated_at)
values (1, '1970-01-01'::timestamptz)
on conflict (id) do nothing;

alter table if exists public.ontology_rebuild_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ontology_rebuild_state' and policyname = 'ontology_rebuild_state_service'
  ) then
    create policy "ontology_rebuild_state_service"
      on public.ontology_rebuild_state for all to service_role using (true) with check (true);
  end if;
end $$;

comment on table public.ontology_rebuild_state is 'gold 테이블 변경 감지를 통한 온톨로지 자동 재구축 상태';
