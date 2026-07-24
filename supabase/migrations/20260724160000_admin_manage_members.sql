-- ================================================================
-- FEATURE "EQUIPE" — Etapa 6 (LexAxis) 2026-07-24
-- Gerência de membros pelo OWNER.
--
-- Motivo: a policy de UPDATE de profiles só permite auto-update (id = auth.uid()),
-- então o owner NÃO consegue alterar o papel de outro membro nem removê-lo pelo
-- cliente (o update silenciosamente afeta 0 linhas). Estas funções SECURITY
-- DEFINER fazem a operação com checagem de owner no corpo.
--
-- - admin_set_member_role: troca o papel de um membro do próprio workspace.
-- - admin_remove_member: "remove" o membro destacando-o para um workspace pessoal
--   novo (NÃO-destrutivo: mantém a conta; ele perde acesso aos casos do escritório,
--   e o trabalho já feito permanece no workspace do owner). Libera o teto de 1.
-- Idempotente. Rodar no SQL Editor de produção.
-- ================================================================

create or replace function public.admin_set_member_role(p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller_ws   uuid := public.current_workspace_id();
  caller_role text := public.current_user_role();
  target_ws   uuid;
begin
  if caller_role <> 'owner' then
    raise exception 'Apenas o owner pode gerenciar membros';
  end if;
  if p_role not in ('socio','associado','estagiario','financeiro') then
    raise exception 'Papel inválido';
  end if;
  if p_member = auth.uid() then
    raise exception 'Não é possível alterar o próprio papel';
  end if;
  select workspace_id into target_ws from public.profiles where id = p_member;
  if target_ws is null or target_ws <> caller_ws then
    raise exception 'Membro não pertence ao seu workspace';
  end if;
  update public.profiles set role = p_role where id = p_member;
end $$;

create or replace function public.admin_remove_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller_ws   uuid := public.current_workspace_id();
  caller_role text := public.current_user_role();
  target_ws   uuid;
  target_name text;
  new_ws      uuid := gen_random_uuid();
begin
  if caller_role <> 'owner' then
    raise exception 'Apenas o owner pode gerenciar membros';
  end if;
  if p_member = auth.uid() then
    raise exception 'Não é possível remover a si mesmo';
  end if;
  select workspace_id, full_name into target_ws, target_name
    from public.profiles where id = p_member;
  if target_ws is null or target_ws <> caller_ws then
    raise exception 'Membro não pertence ao seu workspace';
  end if;

  -- Destaca o membro para um workspace pessoal novo (não-destrutivo).
  insert into public.workspaces (id, name, budget_mensal_usd)
    values (new_ws, coalesce(target_name, 'Escritório') || ' — LexAxis', 100.0);
  update public.profiles set workspace_id = new_ws, role = 'owner' where id = p_member;
end $$;

grant execute on function public.admin_set_member_role(uuid, text) to authenticated;
grant execute on function public.admin_remove_member(uuid) to authenticated;
