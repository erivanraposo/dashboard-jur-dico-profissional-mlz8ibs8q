-- Base canônica de PRECEDENTES QUALIFICADOS DO TST — Nível 1 do Verificador.
--
-- Fecha a lacuna que o convite do último testador expôs: as bases eram todas do
-- STF e do STJ, e súmula do TST, OJ da SDI ou tema repetitivo trabalhista caíam
-- no caminho lento, que busca no portal e nem sempre encontra. Para quem atua na
-- Justiça do Trabalho, era justamente o que mais aparece na peça.
--
-- FONTE: TST/SPR — "Índice Temático de Repercussão Geral: Temas de Interesse da
-- Justiça do Trabalho", versão de agosto de 2026, 362 páginas. Extração
-- determinística por geometria e tipografia (scripts/extrai_precedentes_tst.py).
--
-- ACESSO AUTORIZADO, e isto merece registro: o robots.txt de www.tst.jus.br traz
-- "User-agent: * / Allow: /", com sitemap publicado — o oposto do STF (que veda
-- /processos) e do STJ (que veda o host inteiro em processo.stj.jus.br). Só
-- jurisprudencia.tst.jus.br está vedado, e não precisamos dele.
--
-- 619 verbetes distintos:
--   IRR 313 — incidentes de recursos de revista repetitivos, SÉRIE COMPLETA de
--             1 a 313, conferida contra a tabela do NUGEP (tst.jus.br/nugep-sp)
--   RG  305 — temas de repercussão geral do STF selecionados por interesse
--             trabalhista, COM título, tese e observação do NUGEP
--   IAC   1
--
-- POR QUE TABELA PRÓPRIA, e não enriquecer stf_temas: os 305 RG também estão
-- lá, mas a SELEÇÃO e os COMENTÁRIOS são do TST, não do STF. Misturar apagaria a
-- proveniência — e esta semana aprendemos, no HC 87.817 e no HC 106.709, que
-- duas fontes oficiais podem discordar. Quando discordarem aqui, queremos poder
-- dizer qual é qual.
--
-- ASSIMETRIA, pela terceira vez e sempre diferente:
--   * súmulas — série completa, ausência PROVA inexistência;
--   * temas do STF — faltam os não julgados, ausência não prova nada;
--   * aqui — o IRR é série completa (ausência prova), mas o RG é SELEÇÃO por
--     interesse trabalhista: faltam 1.140 temas entre 1 e 1.445 simplesmente
--     porque não interessam à Justiça do Trabalho. Dizer "não existe" seria
--     grosseiramente errado.
--
-- Aditiva. Base de REFERÊNCIA compartilhada: leitura por qualquer autenticado,
-- escrita só por service_role. Reversível: drop table public.tst_precedentes cascade;

create table if not exists public.tst_precedentes (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('IRR', 'RG', 'IAC', 'CC')),
  numero         int  not null,
  tribunal       text,                 -- TST ou STF: o índice cobre os dois
  titulo         text,                 -- a questão submetida
  tese           text,                 -- o que se decidiu (rótulo "Tese")
  tese_firmada   text,                 -- quando o documento distingue as duas
  decisao        text,
  observacao_nugep text,
  assunto        text,
  processos      text not null,        -- representativos da controvérsia
  secoes         text[] not null default '{}',   -- capítulos temáticos em que aparece
  ocorrencias    int  not null default 1,        -- quantas vezes aparece no índice
  transito_julgado date,
  fonte_documento text,
  fonte_pagina   int,
  fonte_url      text,
  colhido_em     date not null default current_date
);

create unique index if not exists uq_tst_precedentes on public.tst_precedentes (tipo, numero);
create index if not exists idx_tst_precedentes_trgm
  on public.tst_precedentes using gin ((coalesce(tese_firmada, '') || ' ' || coalesce(tese, '') || ' ' || coalesce(titulo, '')) gin_trgm_ops);

alter table public.tst_precedentes enable row level security;
drop policy if exists tst_precedentes_select on public.tst_precedentes;
create policy tst_precedentes_select on public.tst_precedentes for select
  to authenticated using (true);

comment on table public.tst_precedentes is
  'Precedentes qualificados do TST e temas de repercussão geral de interesse trabalhista, do Índice Temático do TST/SPR. IRR é série completa; RG é SELEÇÃO — ausência de um tema de RG aqui não significa que ele não exista.';
comment on column public.tst_precedentes.secoes is
  'Capítulos temáticos do índice em que o precedente aparece. Um mesmo tema reaparece sob cada assunto a que interessa — é dado, não repetição.';
comment on column public.tst_precedentes.tese_firmada is
  'Quando o documento distingue "Tese" de "Tese Firmada", esta é a fixada. Distinção que nos custou trabalho nos temas do STF e que aqui a fonte já separa.';

-- ---------------------------------------------------------------------------
-- RPC do Nível 1
-- ---------------------------------------------------------------------------
create or replace function public.tst_precedente(p_tipo text, p_numero int, p_tese text default null)
returns table (
  tipo text, numero int, tribunal text, titulo text, tese text, tese_firmada text,
  observacao_nugep text, processos text, secoes text[], transito_julgado date,
  fonte_url text, fonte_pagina int, colhido_em date, sim real
) language sql stable security definer set search_path = public as $$
  select t.tipo, t.numero, t.tribunal, t.titulo, t.tese, t.tese_firmada,
         t.observacao_nugep, t.processos, t.secoes, t.transito_julgado,
         t.fonte_url, t.fonte_pagina, t.colhido_em,
         case when coalesce(p_tese, '') = '' then null
              else greatest(
                     word_similarity(p_tese, coalesce(t.tese_firmada, '')),
                     word_similarity(p_tese, coalesce(t.tese, '')),
                     similarity(p_tese, coalesce(t.tese_firmada, t.tese, ''))) end as sim
    from public.tst_precedentes t
   where t.tipo = upper(p_tipo) and t.numero = p_numero
   limit 1
$$;

revoke all on function public.tst_precedente(text, int, text) from public;
grant execute on function public.tst_precedente(text, int, text) to authenticated;
grant execute on function public.tst_precedente(text, int, text) to service_role;

comment on function public.tst_precedente(text, int, text) is
  'Precedente qualificado do TST (IRR/IAC) ou tema de RG de interesse trabalhista. Devolver nada NÃO autoriza dizer que o tema não existe quando o tipo é RG: a base é seleção temática, não a série inteira.';
