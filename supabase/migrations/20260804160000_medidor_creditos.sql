-- Medidor de créditos de análise — sustenta a promessa da página /planos
-- ("o medidor está no seu painel, análise por análise").
--
-- 1 CRÉDITO = 1 CICLO COMPLETO sobre um caso. Contamos apenas a AÇÃO DE ANÁLISE:
-- a aplicação na minuta e o gate de aderência fazem parte do mesmo ciclo e não
-- consomem crédito próprio. Verificações de precedente também não — elas têm
-- teto próprio, por custo (decisão de 04/08/2026).
--
-- Aditiva. Reversível:
--   alter table public.invocacoes drop column action, drop column workspace_id;

alter table public.invocacoes add column if not exists action text;
alter table public.invocacoes add column if not exists workspace_id uuid
  references public.workspaces(id) on delete cascade;

-- Backfill: invocacoes só tem user_id; o workspace vem do perfil.
update public.invocacoes i
   set workspace_id = p.workspace_id
  from public.profiles p
 where p.id = i.user_id
   and i.workspace_id is null;

create index if not exists idx_invocacoes_ws_data
  on public.invocacoes(workspace_id, created_at desc);

-- Preenche workspace_id nas inserções futuras. Deriva de NEW.user_id e NÃO de
-- auth.uid(): a Edge Function insere com service_role, quando auth.uid() é nulo.
create or replace function public.set_invocacoes_workspace_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.workspace_id is null and new.user_id is not null then
    select workspace_id into new.workspace_id from public.profiles where id = new.user_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_set_invocacoes_workspace on public.invocacoes;
create trigger trg_set_invocacoes_workspace
  before insert on public.invocacoes
  for each row execute function public.set_invocacoes_workspace_id();

-- Cota mensal por faixa comercial. 'beta' fica com a cota do Performance:
-- os testadores não pagam e não devem esbarrar em limite durante o beta.
create or replace function public.creditos_do_plano(p_plano text)
returns int language sql immutable as $$
  select case p_plano
           when 'essencial'   then 10
           when 'escritorio'  then 30
           when 'performance' then 60
           when 'enterprise'  then 1000
           else 60                      -- beta
         end
$$;

-- Consumo do mês corrente do workspace do chamador.
-- SECURITY DEFINER com filtro explícito por current_workspace_id() — regra da
-- auditoria de isolamento de 21/07: nunca confiar só no RLS numa função definer.
create or replace function public.creditos_do_mes()
returns json language sql stable security definer set search_path = public as $$
  with ws as (
    select public.current_workspace_id() as id
  ),
  plano as (
    select coalesce(w.plano, 'beta') as p
      from public.workspaces w, ws
     where w.id = ws.id
  ),
  usados as (
    select count(*)::int as n
      from public.invocacoes i, ws
     where i.workspace_id = ws.id
       and coalesce(i.action, 'analyze') = 'analyze'
       and i.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo')
                           at time zone 'America/Sao_Paulo'
  )
  select json_build_object(
           'plano',    (select p from plano),
           'usados',   (select n from usados),
           'limite',   public.creditos_do_plano((select p from plano)),
           'renova_em', (date_trunc('month', now() at time zone 'America/Sao_Paulo')
                          + interval '1 month')::date
         )
$$;

revoke all on function public.creditos_do_mes() from public;
grant execute on function public.creditos_do_mes() to authenticated;

comment on function public.creditos_do_mes() is
  'Medidor de créditos do mês para o workspace do chamador. 1 crédito = 1 ciclo de análise; aplicação e gate não contam. Sustenta a promessa da página /planos.';
