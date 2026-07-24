-- ================================================================
-- FEATURE "EQUIPE" — Etapa 8 (LexAxis) 2026-07-24
-- Proteção do administrador FUNDADOR.
--
-- Problema: um co-administrador (owner promovido) podia revogar/remover QUALQUER
-- owner, inclusive o fundador do escritório. Regra nova:
--   - o FUNDADOR (o owner mais antigo do workspace) nunca é revogado/removido;
--   - apenas o fundador gerencia ADMINISTRADORES (promover a owner, revogar owner,
--     remover owner). Co-admins seguem gerenciando MEMBROS comuns.
-- Idempotente. Rodar no SQL Editor de produção.
-- ================================================================

-- Fundador do workspace = owner mais antigo (created_at, id como desempate).
create or replace function public.workspace_founder(p_ws uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles
  where workspace_id = p_ws and role = 'owner'
  order by created_at asc, id asc
  limit 1
$$;

create or replace function public.admin_set_member_role(p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller_ws   uuid := public.current_workspace_id();
  caller_role text := public.current_user_role();
  founder     uuid := public.workspace_founder(caller_ws);
  target_ws   uuid;
  target_role text;
begin
  if caller_role <> 'owner' then
    raise exception 'Apenas o owner pode gerenciar membros';
  end if;
  if p_role not in ('owner','socio','associado','estagiario','financeiro') then
    raise exception 'Papel inválido';
  end if;
  if p_member = auth.uid() then
    raise exception 'Não é possível alterar o próprio papel';
  end if;
  select workspace_id, role into target_ws, target_role from public.profiles where id = p_member;
  if target_ws is null or target_ws <> caller_ws then
    raise exception 'Membro não pertence ao seu workspace';
  end if;
  if p_member = founder then
    raise exception 'Não é possível alterar o administrador fundador';
  end if;
  -- Operação de nível ADMIN (mexe com owner): só o fundador pode.
  if (target_role = 'owner' or p_role = 'owner') and auth.uid() <> founder then
    raise exception 'Apenas o administrador fundador pode gerenciar administradores';
  end if;
  update public.profiles set role = p_role where id = p_member;
end $$;

create or replace function public.admin_remove_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller_ws   uuid := public.current_workspace_id();
  caller_role text := public.current_user_role();
  founder     uuid := public.workspace_founder(caller_ws);
  target_ws   uuid;
  target_role text;
  target_name text;
  new_ws      uuid := gen_random_uuid();
begin
  if caller_role <> 'owner' then
    raise exception 'Apenas o owner pode gerenciar membros';
  end if;
  if p_member = auth.uid() then
    raise exception 'Não é possível remover a si mesmo';
  end if;
  select workspace_id, role, full_name into target_ws, target_role, target_name
    from public.profiles where id = p_member;
  if target_ws is null or target_ws <> caller_ws then
    raise exception 'Membro não pertence ao seu workspace';
  end if;
  if p_member = founder then
    raise exception 'Não é possível remover o administrador fundador';
  end if;
  if target_role = 'owner' and auth.uid() <> founder then
    raise exception 'Apenas o administrador fundador pode remover administradores';
  end if;

  insert into public.workspaces (id, name, budget_mensal_usd)
    values (new_ws, coalesce(target_name, 'Escritório') || ' — LexAxis', 100.0);
  update public.profiles set workspace_id = new_ws, role = 'owner' where id = p_member;
end $$;

grant execute on function public.workspace_founder(uuid) to authenticated;
