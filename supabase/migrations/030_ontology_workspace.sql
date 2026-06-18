-- 온톨로지 워크스페이스(저장된 탐색 세션)
create table if not exists public.ontology_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ontology_workspaces is '사용자가 저장한 온톨로지 탐색 워크스페이스';
comment on column public.ontology_workspaces.snapshot is '그래프 필터, 레이아웃, 침라, 선택 노드, 분석 상태 등을 담은 JSON';

-- RLS 활성화
alter table public.ontology_workspaces enable row level security;

-- 사용자는 자신의 워크스페이스만 조회/생성/수정/삭제
create policy if not exists "ontology_workspaces_select_own"
  on public.ontology_workspaces
  for select
  to authenticated
  using ( (select auth.uid()) = user_id );

create policy if not exists "ontology_workspaces_insert_own"
  on public.ontology_workspaces
  for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

create policy if not exists "ontology_workspaces_update_own"
  on public.ontology_workspaces
  for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy if not exists "ontology_workspaces_delete_own"
  on public.ontology_workspaces
  for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

-- 관리자는 모든 워크스페이스 접근 가능(서비스 롤을 통한 관리용)
create policy if not exists "ontology_workspaces_admin_all"
  on public.ontology_workspaces
  for all
  to service_role
  using (true)
  with check (true);

-- 인덱스
create index if not exists idx_ontology_workspaces_user_id
  on public.ontology_workspaces(user_id);

create index if not exists idx_ontology_workspaces_updated_at
  on public.ontology_workspaces(updated_at desc);

-- updated_at 자동 갱신 트리거
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security invoker;

drop trigger if exists ontology_workspaces_updated_at
  on public.ontology_workspaces;

create trigger ontology_workspaces_updated_at
  before update on public.ontology_workspaces
  for each row
  execute function public.update_updated_at_column();
