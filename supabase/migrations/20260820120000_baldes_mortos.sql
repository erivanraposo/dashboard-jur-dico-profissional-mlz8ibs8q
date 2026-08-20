-- Encerra os dois baldes que a migration 20260812140000 deixou anotados.
--
-- O QUE A AUDITORIA DE 20/08/2026 APUROU
-- A migration de 12/08 fechou o isolamento de 'process-attachments' e registrou,
-- nas suas linhas 119-133, que 'legal_documents' e 'legal-attachments' tinham o
-- mesmo defeito — política "FOR ALL TO authenticated USING (bucket_id = ...)",
-- sem filtro de workspace. Não foram corrigidos ali porque não se sabia se
-- estavam em uso. Agora se sabe:
--
--   balde                objetos
--   -------------------  -------
--   process-attachments       33   <- o único em uso
--   workspace-branding         2
--   Escritorio                 1   <- ver nota ao final
--   legal_documents            0
--   legal-attachments          0
--
-- Os dois baldes defeituosos NUNCA receberam um arquivo. A política era errada
-- e a consequência foi nenhuma: não houve exposição de dado de cliente.
--
-- 'legal_documents' era o destino da aba "Anexos" (src/pages/Processos.tsx).
-- O código foi repontado para 'process-attachments' ANTES desta migration, com
-- caminho <user_id>/<uuid>-<nome>, porque a política pa_storage_insert exige
-- que a primeira pasta seja o auth.uid(). A ORDEM IMPORTA: aplicar isto com o
-- código antigo no ar transformaria um caminho morto e inofensivo em erro
-- visível para o testador.

-- ---------------------------------------------------------------------------
-- 1) As políticas defeituosas.
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated_manage_legal_documents" on storage.objects;
drop policy if exists "Authenticated users can select legal-attachments" on storage.objects;
drop policy if exists "Authenticated users can upload legal-attachments" on storage.objects;
drop policy if exists "Authenticated users can delete legal-attachments" on storage.objects;

-- ---------------------------------------------------------------------------
-- 2) Os baldes — com trava.
--    Só apaga se estiverem realmente vazios. A conferência foi feita hoje, mas
--    entre a conferência e a aplicação alguém pode ter subido alguma coisa, e
--    apagar balde com arquivo dentro é irreversível.
-- ---------------------------------------------------------------------------
do $$
declare
  v_balde text;
  v_qtd   int;
begin
  foreach v_balde in array array['legal_documents', 'legal-attachments'] loop
    select count(*) into v_qtd from storage.objects where bucket_id = v_balde;

    if v_qtd > 0 then
      raise exception
        'ABORTADO: o balde % tem % objeto(s). Estava vazio na auditoria de 20/08 — apurar antes de apagar.',
        v_balde, v_qtd;
    end if;

    delete from storage.buckets where id = v_balde;
    raise notice 'balde % removido (estava vazio)', v_balde;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) O balde 'Escritorio' NÃO é tocado aqui, de propósito.
--
--    Não consta de nenhuma migration do repositório: foi criado à mão em
--    15/06, mesma data do 'workspace-branding', e guarda 1 arquivo de 904 kB —
--    provavelmente um logo.
--
--    Não tem política NENHUMA. Com RLS ativo em storage.objects e nenhuma
--    política casando, nenhum usuário autenticado lê, grava ou apaga ali: só a
--    service_role alcança. Não é exposição.
--
--    Mas é dado que nenhuma eliminação orientada por processo atinge — a mesma
--    natureza dos órfãos, para efeito da cláusula 10 do DPA. Identificar o
--    arquivo (só com a chave de serviço) e então decidir entre migrar para
--    'workspace-branding' ou apagar balde e conteúdo.
-- ---------------------------------------------------------------------------
