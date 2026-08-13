-- Isolamento do branding: políticas da tabela e correção do balde.
--
-- Duas coisas que a leitura de 13/08 encontrou juntas.
--
-- ===========================================================================
-- PARTE 1 — a mesma falha de ontem, ainda aberta no balde de logomarcas
-- ===========================================================================
--
-- A migration 20260616140000 criou:
--
--   CREATE POLICY "Authenticated users can manage workspace branding"
--     ON storage.objects FOR ALL TO authenticated
--     USING (bucket_id = 'workspace-branding')
--
-- É EXATAMENTE o defeito corrigido ontem (c81d311) no balde
-- 'process-attachments': política que confere apenas o bucket_id e mais nada.
--
-- Existem também as wb_storage_select/insert/update/delete, corretamente
-- restritas por foldername(name)[1]. Mas políticas permissivas se SOMAM (OR):
-- basta uma passar. A frouxa ANULA as corretas, e qualquer conta autenticada
-- lê, sobrescreve e apaga a logomarca de qualquer escritório.
--
-- Gravidade menor que a de ontem — é identidade visual, não documento de
-- cliente sob sigilo. Mas é a mesma falha, e ela estava na primeira linha da
-- consulta que rodamos ontem, à vista.
--
-- LIÇÃO A REGISTRAR: corrigir um balde não corrige os outros. A auditoria de
-- ontem procurou o problema em 'process-attachments' porque era ali que estavam
-- os 487 arquivos — e passou ao largo do que estava na mesma tela.

drop policy if exists "Authenticated users can manage workspace branding" on storage.objects;

-- As wb_storage_* já existem e já restringem por workspace. Recriadas aqui com
-- `if not exists` implícito (drop + create) para que um banco limpo as tenha
-- mesmo sem a aplicação manual que as criou em produção.
drop policy if exists wb_storage_select on storage.objects;
create policy wb_storage_select on storage.objects for select to authenticated
using (
  bucket_id = 'workspace-branding'
  and (storage.foldername(name))[1] in (
    select p.workspace_id::text from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists wb_storage_insert on storage.objects;
create policy wb_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'workspace-branding'
  and (storage.foldername(name))[1] in (
    select p.workspace_id::text from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists wb_storage_update on storage.objects;
create policy wb_storage_update on storage.objects for update to authenticated
using (
  bucket_id = 'workspace-branding'
  and (storage.foldername(name))[1] in (
    select p.workspace_id::text from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists wb_storage_delete on storage.objects;
create policy wb_storage_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'workspace-branding'
  and (storage.foldername(name))[1] in (
    select p.workspace_id::text from public.profiles p where p.id = auth.uid()
  )
);

-- ===========================================================================
-- PARTE 2 — políticas da TABELA workspace_branding
-- ===========================================================================
--
-- A tabela passou a ser criada por migration em 20260615120000. As políticas
-- ficam aqui, e não lá, porque dependem de current_workspace_id() e
-- current_user_role(), que só nascem em 21/07 e 24/07.
--
-- A política de DELETE (wb_delete_own) vem de 20260616140000 e não é recriada.

drop policy if exists wb_select_own on public.workspace_branding;
create policy wb_select_own on public.workspace_branding for select to authenticated
using (workspace_id = public.current_workspace_id());

drop policy if exists wb_insert_own on public.workspace_branding;
create policy wb_insert_own on public.workspace_branding for insert to authenticated
with check (
  workspace_id = public.current_workspace_id()
  and public.current_user_role() in ('owner', 'socio')
);

drop policy if exists wb_update_own on public.workspace_branding;
create policy wb_update_own on public.workspace_branding for update to authenticated
using (
  workspace_id = public.current_workspace_id()
  and public.current_user_role() in ('owner', 'socio')
)
with check (
  workspace_id = public.current_workspace_id()
  and public.current_user_role() in ('owner', 'socio')
);
