-- ================================================================
-- FIX ISOLAMENTO MULTI-TENANT — LexAxis (antes do beta) 2026-07-21
-- Fecha vazamentos de leitura e buracos de escrita entre workspaces:
--   vw_recent_invocations, 3 funções do dashboard, profiles, lawyers, workspaces.
-- Idempotente. Rodar no SQL Editor de produção.
-- ================================================================

-- 0) Helper: workspace do usuário atual (SECURITY DEFINER evita recursão de RLS)
create or replace function public.current_workspace_id()
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from public.profiles where id = auth.uid()
$$;

-- 1) View "Atividades Recentes": passa a respeitar o RLS do usuário
alter view public.vw_recent_invocations set (security_invoker = true);

-- 2) Funções do dashboard: filtrar pelo workspace do chamador
create or replace function public.get_agent_ranking(start_date timestamp with time zone, end_date timestamp with time zone)
returns table(agent_id uuid, agent_name text, invocations_count bigint, total_tokens bigint, total_cost numeric)
language sql security definer set search_path = public as $function$
  select a.id as agent_id, a.name as agent_name,
    count(i.id)::bigint as invocations_count,
    coalesce(sum(coalesce(i.input_tokens,0)+coalesce(i.output_tokens,0)),0)::bigint as total_tokens,
    coalesce(sum(coalesce(c.estimated_cost,0.0)),0.0)::numeric as total_cost
  from public.invocacoes i
  join public.agentes a on a.id = i.agent_id
  left join public.custos c on c.invocation_id = i.id
  where i.created_at >= start_date and i.created_at <= end_date
    and i.workspace_id = public.current_workspace_id()
  group by a.id, a.name
  order by total_cost desc;
$function$;

create or replace function public.get_daily_consumption(start_date timestamp with time zone, end_date timestamp with time zone)
returns table(date text, cost numeric, invocations bigint)
language sql security definer set search_path = public as $function$
  select to_char(date_trunc('day', i.created_at), 'YYYY-MM-DD') as date,
    coalesce(sum(coalesce(c.estimated_cost,0.0)),0.0)::numeric as cost,
    count(i.id)::bigint as invocations
  from public.invocacoes i
  left join public.custos c on c.invocation_id = i.id
  where i.created_at >= start_date and i.created_at <= end_date
    and i.workspace_id = public.current_workspace_id()
  group by date_trunc('day', i.created_at)
  order by date_trunc('day', i.created_at) asc;
$function$;

create or replace function public.get_user_ranking(start_date timestamp with time zone, end_date timestamp with time zone)
returns table(user_id uuid, full_name text, invocations_count bigint, total_cost numeric, last_activity timestamp with time zone)
language sql security definer set search_path = public as $function$
  select p.id as user_id, coalesce(p.full_name,'Desconhecido') as full_name,
    count(i.id)::bigint as invocations_count,
    coalesce(sum(coalesce(c.estimated_cost,0.0)),0.0)::numeric as total_cost,
    max(i.created_at) as last_activity
  from public.invocacoes i
  join public.profiles p on p.id = i.user_id
  left join public.custos c on c.invocation_id = i.id
  where i.created_at >= start_date and i.created_at <= end_date
    and i.workspace_id = public.current_workspace_id()
  group by p.id, p.full_name
  order by total_cost desc;
$function$;

-- 3) profiles: cada um só vê perfis do PRÓPRIO workspace (era SELECT true)
drop policy if exists authenticated_select_profiles on public.profiles;
create policy profiles_select on public.profiles for select
  using (workspace_id = public.current_workspace_id());

-- 4) lawyers: isolar por workspace (era SELECT true, sem workspace_id)
alter table public.lawyers add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.lawyers set workspace_id = (
  select p.workspace_id from public.profiles p
  join auth.users u on u.id = p.id
  where u.email = 'erivan.raposo@gmail.com' limit 1
) where workspace_id is null;
alter table public.lawyers alter column workspace_id set not null;
create index if not exists idx_lawyers_ws on public.lawyers(workspace_id);

create or replace function public.set_lawyers_workspace_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.workspace_id is null then new.workspace_id := public.current_workspace_id(); end if;
  return new;
end $$;
drop trigger if exists trg_set_lawyers_ws on public.lawyers;
create trigger trg_set_lawyers_ws before insert on public.lawyers
  for each row execute function public.set_lawyers_workspace_id();

drop policy if exists authenticated_select_lawyers on public.lawyers;
drop policy if exists lawyers_select on public.lawyers;
create policy lawyers_select on public.lawyers for select
  using (workspace_id = public.current_workspace_id());
drop policy if exists lawyers_modify on public.lawyers;
create policy lawyers_modify on public.lawyers for all
  using (workspace_id = public.current_workspace_id())
  with check (workspace_id = public.current_workspace_id());

-- 5) workspaces: cada um só vê/edita o PRÓPRIO (eram todas true; DELETE aberto = perda de dados)
drop policy if exists authenticated_select_workspaces on public.workspaces;
drop policy if exists authenticated_update_workspaces on public.workspaces;
drop policy if exists authenticated_delete_workspaces on public.workspaces;
drop policy if exists authenticated_insert_workspaces on public.workspaces;
create policy workspaces_select on public.workspaces for select
  using (id = public.current_workspace_id());
create policy workspaces_update on public.workspaces for update
  using (id = public.current_workspace_id())
  with check (id = public.current_workspace_id());
-- INSERT/DELETE: sem policy de cliente. O gatilho handle_new_user (SECURITY DEFINER)
-- cria workspaces ignorando RLS, então o provisionamento de novos usuários segue funcionando.
