-- Plano do escritório — sustenta o teto escalonado do Verificador de Precedentes.
-- Preços decididos em 04/08/2026: R$ 297 / R$ 697 / R$ 1.297 + add-on R$ 179.
-- Aditiva. Reversível: alter table public.workspaces drop column plano;
--
-- 'beta' é o padrão de propósito: os 6 escritórios do beta não estão em nenhuma
-- faixa comercial ainda, e vão continuar com o teto do meio até a virada.

alter table public.workspaces
  add column if not exists plano text not null default 'beta';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'workspaces_plano_check'
       and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint workspaces_plano_check
      check (plano in ('beta', 'essencial', 'escritorio', 'performance', 'enterprise'));
  end if;
end $$;

comment on column public.workspaces.plano is
  'Faixa comercial do escritório. Define o teto diário de custo do Verificador de Precedentes (essencial US$0,60 | escritorio 1,50 | performance 3,00 | enterprise 10,00 | beta 1,50). Decisão de 04/08/2026.';

-- Leitura do plano pela Edge Function sem depender do RLS de workspaces:
-- a função roda com service_role, mas manter uma RPC explícita documenta a
-- intenção e evita SELECT amplo na tabela de workspaces.
create or replace function public.plano_do_workspace(p_workspace uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(w.plano, 'beta') from public.workspaces w where w.id = p_workspace
$$;

revoke all on function public.plano_do_workspace(uuid) from public;
grant execute on function public.plano_do_workspace(uuid) to service_role;
