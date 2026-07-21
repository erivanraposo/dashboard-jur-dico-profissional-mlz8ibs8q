-- Provisionamento automático de novos usuários (Modelo B: cada usuário = tenant próprio).
-- Ao criar um usuário (via painel Supabase → Add user, ou signup), cria automaticamente
-- um workspace próprio + profile (role owner) ligado a ele. Idempotente.
-- Reversível: drop trigger on_auth_user_created on auth.users; drop function public.handle_new_user;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_id uuid := gen_random_uuid();
  nome  text := coalesce(
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1)
  );
begin
  -- Já provisionado? não faz nada.
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  insert into public.workspaces (id, name, budget_mensal_usd)
  values (ws_id, coalesce(nome, 'Escritório') || ' — LexAxis', 100.0);

  insert into public.profiles (id, full_name, role, workspace_id)
  values (new.id, coalesce(nome, 'Novo usuário'), 'owner', ws_id);

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
