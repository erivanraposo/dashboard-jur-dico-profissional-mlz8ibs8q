-- ================================================================
-- FEATURE "EQUIPE" — Etapa 1 (LexAxis) 2026-07-24
-- Permite que o owner de um workspace convide UM membro (beta) para o
-- MESMO workspace, com papel próprio, sem quebrar o isolamento multi-tenant.
-- Reaproveita current_workspace_id(); adiciona current_user_role() e a tabela
-- de convites; e endurece a exclusão (estagiário não apaga casos).
-- Idempotente (drop-before-create). Rodar no SQL Editor de produção.
-- NÃO altera o gatilho handle_new_user (isso é a Etapa 2, migration própria).
-- ================================================================

-- 0) Helper: papel do usuário atual (SECURITY DEFINER evita recursão de RLS em
--    profiles). NÃO usar o nome reservado current_role().
create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- 1) Tabela de convites
create table if not exists public.workspace_invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email        text not null,
  role         text not null default 'estagiario'
               check (role in ('owner','socio','associado','estagiario','financeiro')),
  status       text not null default 'pending'
               check (status in ('pending','accepted','revoked')),
  invited_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  accepted_by  uuid references public.profiles(id) on delete set null
);

create index if not exists idx_invitations_ws on public.workspace_invitations(workspace_id);
-- No máximo 1 convite pendente por (workspace, e-mail em minúsculas)
create unique index if not exists uq_invitation_pending
  on public.workspace_invitations(workspace_id, lower(email))
  where status = 'pending';

alter table public.workspace_invitations enable row level security;

-- RLS: só o OWNER do próprio workspace enxerga/gerencia os convites.
-- (A Edge Function usa service_role e ignora o RLS ao criar o convite.)
drop policy if exists invitations_owner_all on public.workspace_invitations;
create policy invitations_owner_all on public.workspace_invitations for all
  to authenticated
  using (workspace_id = public.current_workspace_id() and public.current_user_role() = 'owner')
  with check (workspace_id = public.current_workspace_id() and public.current_user_role() = 'owner');

-- 2) Proteção de exclusão: estagiário/associado não APAGAM casos; só owner/sócio.
--    Troca a policy única _modify (ALL) por INSERT + UPDATE (membros, exceto
--    financeiro) + DELETE (só owner/sócio). SELECT permanece intacto.
--    Aplicado a: processes, minutes, prazos, process_attachments.

-- processes
drop policy if exists processes_modify_workspace on public.processes;
drop policy if exists processes_insert on public.processes;
drop policy if exists processes_update on public.processes;
drop policy if exists processes_delete on public.processes;
create policy processes_insert on public.processes for insert to authenticated
  with check (workspace_id = public.current_workspace_id() and public.current_user_role() <> 'financeiro');
create policy processes_update on public.processes for update to authenticated
  using (workspace_id = public.current_workspace_id() and public.current_user_role() <> 'financeiro')
  with check (workspace_id = public.current_workspace_id() and public.current_user_role() <> 'financeiro');
create policy processes_delete on public.processes for delete to authenticated
  using (workspace_id = public.current_workspace_id() and public.current_user_role() in ('owner','socio'));

-- minutes
drop policy if exists minutes_modify_workspace on public.minutes;
drop policy if exists minutes_insert on public.minutes;
drop policy if exists minutes_update on public.minutes;
drop policy if exists minutes_delete on public.minutes;
create policy minutes_insert on public.minutes for insert to authenticated
  with check (workspace_id = public.current_workspace_id() and public.current_user_role() <> 'financeiro');
create policy minutes_update on public.minutes for update to authenticated
  using (workspace_id = public.current_workspace_id() and public.current_user_role() <> 'financeiro')
  with check (workspace_id = public.current_workspace_id() and public.current_user_role() <> 'financeiro');
create policy minutes_delete on public.minutes for delete to authenticated
  using (workspace_id = public.current_workspace_id() and public.current_user_role() in ('owner','socio'));

-- prazos
drop policy if exists prazos_modify on public.prazos;
drop policy if exists prazos_insert on public.prazos;
drop policy if exists prazos_update on public.prazos;
drop policy if exists prazos_delete on public.prazos;
create policy prazos_insert on public.prazos for insert to authenticated
  with check (workspace_id = public.current_workspace_id() and public.current_user_role() <> 'financeiro');
create policy prazos_update on public.prazos for update to authenticated
  using (workspace_id = public.current_workspace_id() and public.current_user_role() <> 'financeiro')
  with check (workspace_id = public.current_workspace_id() and public.current_user_role() <> 'financeiro');
create policy prazos_delete on public.prazos for delete to authenticated
  using (workspace_id = public.current_workspace_id() and public.current_user_role() in ('owner','socio'));

-- process_attachments
drop policy if exists pa_modify_workspace on public.process_attachments;
drop policy if exists pa_insert on public.process_attachments;
drop policy if exists pa_update on public.process_attachments;
drop policy if exists pa_delete on public.process_attachments;
create policy pa_insert on public.process_attachments for insert to authenticated
  with check (workspace_id = public.current_workspace_id() and public.current_user_role() <> 'financeiro');
create policy pa_update on public.process_attachments for update to authenticated
  using (workspace_id = public.current_workspace_id() and public.current_user_role() <> 'financeiro')
  with check (workspace_id = public.current_workspace_id() and public.current_user_role() <> 'financeiro');
create policy pa_delete on public.process_attachments for delete to authenticated
  using (workspace_id = public.current_workspace_id() and public.current_user_role() in ('owner','socio'));
