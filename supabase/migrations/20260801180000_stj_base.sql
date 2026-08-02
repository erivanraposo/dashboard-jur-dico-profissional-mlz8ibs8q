-- Base canônica STJ (Jurisprudência em Teses) — referência do Verificador de Precedentes (Nível 1).
-- Aditiva. Base de REFERÊNCIA compartilhada (não é dado de workspace): leitura por qualquer
-- autenticado, escrita só por service_role (carga + Edge Function). Mesmo padrão de agentes/jurisprudence.
-- Reversível: drop table public.stj_tese_julgados, public.stj_teses cascade;

create extension if not exists pg_trgm;

create table if not exists public.stj_teses (
  id               uuid primary key default gen_random_uuid(),
  edicao           int,
  area             text,
  numero_tese      int,
  tese_text        text not null,
  tema_repetitivo  text,
  base_legal       text,
  fonte_arquivo    text,
  fonte_pagina     int,
  fonte_url        text
);
-- casamento de tese por similaridade lexical (Nível 1)
create index if not exists idx_stj_teses_trgm on public.stj_teses using gin (tese_text gin_trgm_ops);

create table if not exists public.stj_tese_julgados (
  id           uuid primary key default gen_random_uuid(),
  tese_id      uuid not null references public.stj_teses(id) on delete cascade,
  classe       text,
  numero       text,
  uf           text,
  relator      text,
  orgao        text,
  data         text,
  tipo_data    text,
  monocratica  boolean not null default false,
  citacao      text
);
-- lookup por número do processo (Nível 1)
create index if not exists idx_stj_julg_num   on public.stj_tese_julgados(numero);
create index if not exists idx_stj_julg_numuf on public.stj_tese_julgados(numero, uf);
create index if not exists idx_stj_julg_tese  on public.stj_tese_julgados(tese_id);

alter table public.stj_teses        enable row level security;
alter table public.stj_tese_julgados enable row level security;

drop policy if exists stj_teses_read on public.stj_teses;
create policy stj_teses_read on public.stj_teses for select to authenticated using (true);
drop policy if exists stj_julgados_read on public.stj_tese_julgados;
create policy stj_julgados_read on public.stj_tese_julgados for select to authenticated using (true);
