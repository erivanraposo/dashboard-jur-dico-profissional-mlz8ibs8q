-- Registro de acesso a documento de cliente — 12/08/2026.
--
-- POR QUE ESTE É O ÚNICO ITEM URGENTE DO LEVANTAMENTO DE NORMAS: é o único que
-- NÃO DÁ PARA RECONSTRUIR DEPOIS. Política de IA, avaliação de impacto e termo
-- de tratamento podem ser escritos em qualquer momento e valem retroativamente
-- como compromisso. Acesso que não foi registrado está perdido — e a pergunta
-- "quem abriu este documento?" só tem resposta se alguém tiver anotado na hora.
--
-- Exigido, com palavras diferentes, por três frentes:
--   LGPD          — demonstrar o tratamento (art. 37: registro das operações)
--   CNJ 615/2025  — auditoria de soluções e registro de eventos (arts. 11 e 12)
--   ISO 42001     — A.6, registro de eventos do ciclo de vida; A.8, informação
--                   às partes interessadas
--
-- ONDE REGISTRA, E POR QUÊ ALI: os documentos de cliente são lidos pelo
-- SERVIDOR, em três Edge Functions (extract-document, analyze-legal-text,
-- ingest-document). Registrar nelas não depende do navegador e não pode ser
-- contornado pela aplicação.
--
-- O QUE ISTO NÃO É — e convém dizer antes que alguém suponha: não é registro de
-- acesso ao ARMAZENAMENTO. Quem tiver a chave anônima e o caminho exato pode
-- chamar a API de storage diretamente, sem passar por aqui. O que se registra é
-- o acesso ATRAVÉS DA APLICAÇÃO, que é o que responde por uso normal e é o que
-- as três normas pedem na prática. Fechar o outro caminho é o que a migration
-- de isolamento de hoje mais cedo fez.
--
-- Aditiva. Reversível: drop table public.document_access_log cascade;

create table if not exists public.document_access_log (
  id            bigserial primary key,
  workspace_id  uuid,                    -- pode ser nulo em anexo órfão
  attachment_id uuid,                    -- nulo quando o arquivo não tem registro
  file_path     text not null,
  file_name     text,
  user_id       uuid,                    -- quem provocou o acesso
  acao          text not null check (acao in ('extracao', 'analise', 'digest', 'leitura')),
  origem        text not null,           -- nome da função que leu
  bytes         bigint,
  detalhe       text,                    -- livre: motivo, erro, contexto
  created_at    timestamptz not null default now()
);

create index if not exists idx_dal_workspace on public.document_access_log (workspace_id, created_at desc);
create index if not exists idx_dal_file on public.document_access_log (file_path, created_at desc);
create index if not exists idx_dal_user on public.document_access_log (user_id, created_at desc);

alter table public.document_access_log enable row level security;

-- LEITURA: só quem responde pelo escritório vê o registro do próprio workspace.
-- Registro de auditoria que todo mundo lê é fofoca; que ninguém lê é inútil.
drop policy if exists dal_select on public.document_access_log;
create policy dal_select on public.document_access_log for select to authenticated
using (
  workspace_id = public.current_workspace_id()
  and public.current_user_role() in ('owner', 'socio')
);

-- ESCRITA: nenhuma política para `authenticated`. Só as Edge Functions gravam,
-- com service_role, que ignora RLS. Assim o registro não pode ser forjado nem
-- suprimido a partir do navegador.

comment on table public.document_access_log is
  'Quem leu qual documento de cliente, quando e por qual função. Registra o acesso ATRAVÉS DA APLICAÇÃO — não substitui log do armazenamento.';
comment on column public.document_access_log.acao is
  'extracao = texto lido para uso direto; analise = enviado ao modelo; digest = resumo em lote; leitura = download pela interface.';

-- ---------------------------------------------------------------------------
-- Consulta de auditoria: a resposta para "quem abriu este documento?"
-- ---------------------------------------------------------------------------
create or replace function public.acessos_do_documento(p_file_path text)
returns table (
  quando timestamptz, quem text, acao text, origem text, detalhe text
) language sql stable security definer set search_path = public as $$
  select l.created_at,
         coalesce(p.full_name, l.user_id::text, 'não identificado'),
         l.acao, l.origem, l.detalhe
    from public.document_access_log l
    left join public.profiles p on p.id = l.user_id
   where l.file_path = p_file_path
     and l.workspace_id = public.current_workspace_id()
     and public.current_user_role() in ('owner', 'socio')
   order by l.created_at desc
$$;

revoke all on function public.acessos_do_documento(text) from public;
grant execute on function public.acessos_do_documento(text) to authenticated;

comment on function public.acessos_do_documento(text) is
  'Histórico de acesso de um documento. Restrita ao próprio workspace e a owner/sócio — a função é security definer, então a restrição está no corpo dela.';
