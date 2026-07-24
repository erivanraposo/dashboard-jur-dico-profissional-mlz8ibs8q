-- ================================================================
-- FEATURE "EQUIPE" — Etapa 7 (LexAxis) 2026-07-24
-- Permite promover um membro a OWNER (co-administrador do mesmo escritório).
-- Ajusta admin_set_member_role para aceitar 'owner' no rol de papéis.
-- A promoção é disparada por uma ação explícita e confirmada na tela (não pelo
-- seletor casual de papéis). Idempotente. Rodar no SQL Editor de produção.
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
  if p_role not in ('owner','socio','associado','estagiario','financeiro') then
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
