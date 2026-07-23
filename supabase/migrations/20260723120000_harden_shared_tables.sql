-- Endurece as tabelas COMPARTILHADAS (globais, não workspace-scoped): agentes e jurisprudence.
--
-- Contexto: ambas são somente-leitura para o aplicativo. O cliente faz apenas .select
-- (GeradorMinutas, Index, Jurisprudencia) e a Edge Function analyze-legal-text usa
-- service_role, que ignora RLS. Ainda assim havia políticas [ALL] true concedidas a
-- `authenticated`, o que permitia a QUALQUER usuário logado (inclusive um beta tester)
-- inserir, alterar ou APAGAR todos os registros dessas tabelas.
--
-- Correção: manter a leitura, remover a escrita.

-- agentes: já possui a política authenticated_select_agentes (SELECT/true).
-- Basta remover a política ALL para bloquear INSERT/UPDATE/DELETE.
drop policy if exists "authenticated_all_agentes" on public.agentes;

-- jurisprudence: a política ALL era a ÚNICA (servia também de leitura).
-- Criamos a leitura ANTES de remover o ALL para não deixar a tabela sem SELECT.
create policy "authenticated_select_jurisprudence"
  on public.jurisprudence
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated_all_jurisprudence" on public.jurisprudence;
