-- ================================================================
-- FEATURE "EQUIPE" — Etapa 2 (LexAxis) 2026-07-24
-- Altera handle_new_user: se houver CONVITE PENDENTE para o e-mail do novo
-- usuário, anexa-o ao workspace do convite (com o papel do convite) em vez de
-- criar um workspace próprio. Sem convite → comportamento antigo (workspace
-- próprio, role owner). Idempotente. Rodar no SQL Editor de produção.
--
-- Segurança: casa por LINHA de convite existente (criada pela Edge Function
-- gated por owner) — não confia em metadata do cliente, então fecha spoofing
-- mesmo que um dia exista signup público.
-- Reversível: reinstalar a versão da migration 20260721120000_handle_new_user.sql.
-- ================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_id  uuid := gen_random_uuid();
  nome   text := coalesce(
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1)
  );
  inv    public.workspace_invitations%rowtype;
begin
  -- Já provisionado? não faz nada.
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  -- Existe convite pendente para este e-mail? (o mais recente)
  select * into inv
  from public.workspace_invitations
  where status = 'pending' and lower(email) = lower(new.email)
  order by created_at desc
  limit 1;

  if found then
    -- CONVIDADO: entra no workspace do convite, com o papel do convite.
    insert into public.profiles (id, full_name, role, workspace_id)
    values (new.id, coalesce(nome, 'Novo membro'), inv.role, inv.workspace_id);

    update public.workspace_invitations
      set status = 'accepted', accepted_at = now(), accepted_by = new.id
      where id = inv.id;

    return new;
  end if;

  -- SEM convite: comportamento antigo — workspace próprio, role owner.
  insert into public.workspaces (id, name, budget_mensal_usd)
  values (ws_id, coalesce(nome, 'Escritório') || ' — LexAxis', 100.0);

  insert into public.profiles (id, full_name, role, workspace_id)
  values (new.id, coalesce(nome, 'Novo usuário'), 'owner', ws_id);

  return new;
end $$;

-- O trigger on_auth_user_created já existe (migration 20260721120000); recriamos
-- por segurança (idempotente).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
