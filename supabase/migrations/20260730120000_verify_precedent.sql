-- Verificador de Precedentes — Fase 1
-- Registra cada verificação para (a) teto diário por escritório, (b) custo, (c) histórico.
-- Aditiva: cria tabela nova, não altera nada existente.
-- Reversível com: drop table public.precedent_verifications cascade;

create table if not exists public.precedent_verifications (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete set null,
  entrada        text not null,                    -- texto colado pelo advogado
  tese_alegada   text,                             -- o que ele afirma que o julgado decide
  n_citacoes     int  not null default 0,
  resultado      jsonb not null default '[]'::jsonb,
  -- contagem por estado, para métrica sem varrer o jsonb
  n_confirmado   int not null default 0,
  n_divergente   int not null default 0,
  n_nao_local    int not null default 0,
  input_tokens   int not null default 0,
  output_tokens  int not null default 0,
  cache_read_tokens  int not null default 0,
  cache_write_tokens int not null default 0,
  estimated_cost numeric(10,6) not null default 0,  -- já inclui tokens de cache
  modelo         text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_precver_ws   on public.precedent_verifications(workspace_id);
create index if not exists idx_precver_dia  on public.precedent_verifications(workspace_id, created_at desc);

alter table public.precedent_verifications enable row level security;

-- workspace_id automático a partir do perfil (padrão do projeto)
create or replace function public.set_precver_workspace_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.workspace_id is null then
    new.workspace_id := public.current_workspace_id();
  end if;
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_set_precver_workspace on public.precedent_verifications;
create trigger trg_set_precver_workspace
  before insert on public.precedent_verifications
  for each row execute function public.set_precver_workspace_id();

-- RLS por current_workspace_id() — regra fixada na auditoria de isolamento de 21/07/2026.
-- Somente leitura pelo app: a escrita é feita pela Edge Function com service_role.
drop policy if exists precver_select on public.precedent_verifications;
create policy precver_select on public.precedent_verifications for select
  to authenticated
  using (workspace_id = public.current_workspace_id());

-- Consumo do dia, para a interface exibir o teto sem varrer a tabela.
-- SECURITY DEFINER + filtro explícito por current_workspace_id() — nunca confiar
-- só no RLS numa função definer (lição da auditoria de 21/07).
create or replace function public.precedent_verifications_hoje()
returns int language sql security definer set search_path = public stable as $$
  select coalesce(count(*), 0)::int
    from public.precedent_verifications
   where workspace_id = public.current_workspace_id()
     and created_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo')
                       at time zone 'America/Sao_Paulo'
$$;

revoke all on function public.precedent_verifications_hoje() from public;
grant execute on function public.precedent_verifications_hoje() to authenticated;

comment on table public.precedent_verifications is
  'Verificador de Precedentes (Fase 1). Uma linha por verificação. Base do teto diário do plano e da métrica de custo real.';
