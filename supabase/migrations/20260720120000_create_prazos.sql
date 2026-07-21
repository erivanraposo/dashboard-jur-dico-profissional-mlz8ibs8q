-- Módulo de prazos simples — tabela prazos (multi-tenant, padrão do projeto)
-- Aditiva: cria a tabela nova, não altera nada existente. Reversível com: drop table public.prazos cascade;

create table if not exists public.prazos (
  id          uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  process_id  uuid references public.processes(id) on delete set null,
  lawyer_id   uuid references public.lawyers(id)   on delete set null,
  titulo      text not null,
  descricao   text,
  due_date    date not null,
  status      text not null default 'pendente' check (status in ('pendente','cumprido')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_prazos_ws   on public.prazos(workspace_id);
create index if not exists idx_prazos_due  on public.prazos(due_date);
create index if not exists idx_prazos_proc on public.prazos(process_id);

alter table public.prazos enable row level security;

-- workspace_id preenchido automaticamente a partir do perfil do usuário (auth.uid)
create or replace function public.set_prazos_workspace_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from public.profiles where id = auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_set_prazos_workspace on public.prazos;
create trigger trg_set_prazos_workspace
  before insert on public.prazos
  for each row execute function public.set_prazos_workspace_id();

-- updated_at automático
create or replace function public.touch_prazos_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_touch_prazos on public.prazos;
create trigger trg_touch_prazos
  before update on public.prazos
  for each row execute function public.touch_prazos_updated_at();

-- RLS: cada escritório só vê/edita seus próprios prazos
drop policy if exists prazos_select on public.prazos;
create policy prazos_select on public.prazos for select
  using (workspace_id = (select workspace_id from public.profiles where id = auth.uid()));

drop policy if exists prazos_modify on public.prazos;
create policy prazos_modify on public.prazos for all
  using (workspace_id = (select workspace_id from public.profiles where id = auth.uid()))
  with check (workspace_id = (select workspace_id from public.profiles where id = auth.uid()));
