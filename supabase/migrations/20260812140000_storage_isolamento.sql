-- Isolamento do armazenamento de anexos entre workspaces — 12/08/2026.
--
-- ACHADO DA AUDITORIA DE HOJE. As TABELAS estavam corretas: process_attachments,
-- processes, minutes, prazos, custos, invocacoes e document_digests já filtravam
-- por workspace em todas as operações. O ARMAZENAMENTO, não: as políticas de
-- storage.objects para o balde 'process-attachments' conferiam apenas o
-- bucket_id, e mais nada.
--
--   Authenticated users can read process-attachments   SELECT  bucket_id = '...'
--   Authenticated users can select from process-...    SELECT  bucket_id = '...'
--   Allow authenticated to delete process attachments  DELETE  bucket_id = '...'
--   Authenticated users can delete process-attachments DELETE  bucket_id = '...'
--   authenticated_all_process_attachments_storage      ALL     bucket_id = '...'
--
-- POR QUE ISSO ERA EXPLORÁVEL mesmo com as tabelas certas: o armazenamento tem
-- API própria. A tabela impede listar os caminhos alheios, mas
-- storage.from('process-attachments').list() não passa pela tabela — passa por
-- storage.objects. Com SELECT liberado por balde, qualquer conta autenticada
-- enumerava os 487 anexos de TODOS os workspaces e baixava qualquer um. O
-- DELETE aberto permitia apagar arquivo de terceiro.
--
-- Entre os 487 há documento sob SIGILO FISCAL, com CNPJ, CPF e endereço de
-- terceiro, subido por testador em 10/08.
--
-- O MOLDE JÁ EXISTIA NESTE MESMO BANCO: o balde 'workspace-branding' tem
-- wb_storage_select/insert/update/delete corretamente restritos por
-- foldername(name)[1]. Os anexos de processo nunca receberam o mesmo cuidado.
--
-- DUAS CHAVES DIFERENTES, e a diferença importa:
--   'workspace-branding' guarda em <workspace_id>/...
--   'process-attachments' guarda em <user_id>/<uuid>-<arquivo>
-- Por isso aqui não dá para repetir o mesmo predicado. A escrita é limitada à
-- PASTA DO PRÓPRIO USUÁRIO (que é o que o app faz), e a leitura é liberada para
-- o WORKSPACE, via a tabela process_attachments — assim um sócio continua vendo
-- o anexo que o colega subiu, que é o comportamento esperado de um escritório.
--
-- Reversível: as políticas antigas estão nomeadas nos drops abaixo.

-- ---------------------------------------------------------------------------
-- 1) Remover as políticas frouxas do balde de anexos.
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated_all_process_attachments_storage" on storage.objects;
drop policy if exists "Authenticated users can read process-attachments" on storage.objects;
drop policy if exists "Authenticated users can select from process-attachments" on storage.objects;
drop policy if exists "Authenticated users can upload process-attachments" on storage.objects;
drop policy if exists "Authenticated users can upload to process-attachments" on storage.objects;
drop policy if exists "Authenticated users can delete process-attachments" on storage.objects;
drop policy if exists "Allow authenticated to delete process attachments" on storage.objects;

-- ---------------------------------------------------------------------------
-- 2) Escrita: só na própria pasta.
--
-- O app grava em `${user.id}/${uuid}-${nome}`. Restringir a primeira pasta ao
-- próprio usuário impede que alguém escreva por cima do arquivo de outro.
-- ---------------------------------------------------------------------------
create policy pa_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'process-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------------------------
-- 3) Leitura: própria pasta OU anexo registrado no seu workspace.
--
-- A segunda condição é o que mantém o trabalho em equipe: o sócio lê o anexo
-- que o colega subiu, porque a linha em process_attachments carrega o
-- workspace_id — e aquela tabela já está corretamente isolada.
-- ---------------------------------------------------------------------------
create policy pa_storage_select on storage.objects for select to authenticated
using (
  bucket_id = 'process-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
        from public.process_attachments a
       where a.file_path = storage.objects.name
         and a.workspace_id in (
           select p.workspace_id from public.profiles p where p.id = auth.uid()
         )
    )
  )
);

-- ---------------------------------------------------------------------------
-- 4) Apagar: própria pasta, ou anexo do workspace por quem pode apagar.
--
-- Espelha pa_delete da tabela: só owner e sócio removem anexo alheio dentro do
-- workspace. Quem subiu sempre pode remover o que subiu.
-- ---------------------------------------------------------------------------
create policy pa_storage_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'process-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
        from public.process_attachments a
       where a.file_path = storage.objects.name
         and a.workspace_id = public.current_workspace_id()
         and public.current_user_role() in ('owner', 'socio')
    )
  )
);

-- ---------------------------------------------------------------------------
-- 5) Atualizar (sobrescrever): só a própria pasta.
-- ---------------------------------------------------------------------------
create policy pa_storage_update on storage.objects for update to authenticated
using (
  bucket_id = 'process-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'process-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------------------------
-- 6) Os outros dois baldes têm o mesmo defeito, e ficam registrados aqui.
--
-- 'legal-attachments' e 'legal_documents' também liberam por bucket_id apenas.
-- NÃO são corrigidos nesta migration porque não sei se ainda estão em uso, e
-- fechar acesso a um balde vivo derruba funcionalidade sem aviso. Conferir com:
--
--   select bucket_id, count(*), min(created_at)::date, max(created_at)::date
--     from storage.objects
--    where bucket_id in ('legal-attachments', 'legal_documents')
--    group by bucket_id;
--
-- Se estiverem vazios, o certo é apagar as políticas e os baldes. Se tiverem
-- conteúdo, replicar o que está acima.
-- ---------------------------------------------------------------------------
