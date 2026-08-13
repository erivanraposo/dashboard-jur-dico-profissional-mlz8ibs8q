-- A tabela que faltava no repositório: public.workspace_branding.
--
-- ACHADO DO ENSAIO ESTÁTICO DAS MIGRATIONS (13/08/2026). A tabela EXISTE em
-- produção, com 18 colunas, e nenhuma das 80 migrations a criava. Foi feita à
-- mão — provavelmente pelo painel — e a migration 20260616140000 apenas
-- acrescenta uma política de DELETE a algo que já estava lá.
--
-- POR QUE IMPORTA, mesmo sem quebrar nada hoje: o repositório não descrevia o
-- banco por inteiro. Quem tentasse recriar o ambiente só com as migrations —
-- para teste, para cliente novo, para recuperar de desastre — não teria esta
-- tabela, e a falha apareceria longe da causa: a política de 16/06 quebraria
-- primeiro, apontando para o lugar errado.
--
-- E o que ela guarda não é acessório. Nome do escritório, logomarca, cores, OAB
-- do responsável, endereço e rodapé de confidencialidade — é o que aparece no
-- TIMBRE de todo documento gerado. Ambiente sem ela produz peça sem
-- identificação do escritório.
--
-- DATADA DE 15/06, um dia antes da migration que a usa. A ordem é o ponto: com
-- carimbo de agosto, o banco limpo continuaria quebrando em 16/06.
--
-- SÓ A TABELA, aqui. As políticas de leitura e escrita dependem de
-- current_workspace_id() e current_user_role(), que só nascem em 21/07 e 24/07 —
-- e por isso vão em migration separada, de agosto. Enquanto isso, vale a
-- política de DELETE de 16/06, que usa subconsulta direta em `profiles`.
--
-- INÓCUA EM PRODUÇÃO: `if not exists` em tudo.
--
-- Colunas conforme os tipos gerados do Supabase em 12/08/2026.

create table if not exists public.workspace_branding (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  nome_escritorio text,
  logo_path text,
  cor_primaria text,
  cor_secundaria text,
  oab_responsavel_nome text,
  oab_responsavel_numero text,
  oab_responsavel_uf text,
  endereco_logradouro text,
  endereco_cidade text,
  endereco_uf text,
  endereco_cep text,
  telefone text,
  email text,
  website text,
  cabecalho_extra text,
  rodape_confidencialidade text,
  updated_at timestamptz default now()
);

alter table public.workspace_branding enable row level security;

comment on table public.workspace_branding is
  'Identidade visual e dados do escritório, usados no timbre dos documentos gerados. Existia em produção desde antes de junho/2026 sem migration que a criasse; esta preenche a lacuna para que o repositório descreva o banco inteiro.';
