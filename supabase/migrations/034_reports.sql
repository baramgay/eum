create table if not exists reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null default '새 보고서',
  blocks       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists reports_user_id_idx on reports (user_id, updated_at desc);

alter table reports enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='reports' and policyname='reports_select_own') then
    create policy "reports_select_own" on reports for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='reports' and policyname='reports_insert_own') then
    create policy "reports_insert_own" on reports for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='reports' and policyname='reports_update_own') then
    create policy "reports_update_own" on reports for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='reports' and policyname='reports_delete_own') then
    create policy "reports_delete_own" on reports for delete using (auth.uid() = user_id);
  end if;
end $$;

create or replace function update_reports_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reports_updated_at on reports;
create trigger reports_updated_at
  before update on reports
  for each row execute function update_reports_updated_at();
