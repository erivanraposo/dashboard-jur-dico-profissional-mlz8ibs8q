-- Base canônica STF (Coletâneas Temáticas de Jurisprudência) — Nível 1 do Verificador.
-- Mesmo padrão da base STJ: base de REFERÊNCIA compartilhada (não é dado de workspace),
-- leitura por qualquer autenticado, escrita só por service_role.
-- Aditiva. Reversível: drop table public.stf_julgados cascade;
--
-- ESCOPO DELIBERADO: só METADADOS. A coletânea do STF traz RECORTE (de ementa, de
-- decisão ou de voto), não a tese firmada como na Jurisprudência em Teses do STJ.
-- Confrontar metadado aqui é seguro; casar tese não é, e continua no Nível 2.

create table if not exists public.stf_julgados (
  id               uuid primary key default gen_random_uuid(),
  classe           text not null,
  numero           text not null,
  sufixo           text,
  relator          text,
  redator_acordao  text,   -- relator vencido: "rel. p/ o ac."
  ministro         text,   -- nomeado sem qualificação de relator
  orgao            text,
  data             date,
  publicacao       text,
  tema_rg          text,
  citacao          text not null,  -- citação literal da publicação do STF
  colecao          text not null,  -- penal | controle
  fonte_pagina     int,
  fonte_url        text,
  confianca        text not null default 'alta',  -- alta | media (fidelidade da extração)
  arquivo          text
);

-- chave natural com sufixo opcional: exige índice único COM expressão
-- (UNIQUE de tabela não aceita coalesce)
create unique index if not exists uq_stf_julgados
  on public.stf_julgados (classe, numero, coalesce(sufixo, ''));

-- lookup do Nível 1 é por número; classe entra como filtro/confronto
create index if not exists idx_stf_julgados_numero on public.stf_julgados(numero);
create index if not exists idx_stf_julgados_cn     on public.stf_julgados(classe, numero);

alter table public.stf_julgados enable row level security;

drop policy if exists stf_julgados_select on public.stf_julgados;
create policy stf_julgados_select on public.stf_julgados for select
  to authenticated using (true);

comment on table public.stf_julgados is
  'Base canônica STF para o Nível 1 do Verificador de Precedentes: metadados autoritativos extraídos das Coletâneas Temáticas de Jurisprudência do próprio STF. NÃO contém tese firmada — coletânea traz recorte, não ratio decidendi.';

-- ---------------------------------------------------------------------------
-- RPC do Nível 1: dado classe+número, devolve os candidatos com metadado
-- autoritativo e a citação original, para o confronto ser feito na função.
-- SECURITY DEFINER porque a Edge Function chama com o JWT do usuário e a base
-- é de referência (sem dado de tenant) — não há o que filtrar por workspace.
-- ---------------------------------------------------------------------------
create or replace function public.stf_lookup(p_numero text, p_classe text default null)
returns table (
  classe text, numero text, sufixo text,
  relator text, redator_acordao text, ministro text,
  orgao text, data date, publicacao text, tema_rg text,
  citacao text, colecao text, fonte_pagina int, fonte_url text,
  confianca text, arquivo text
) language sql stable security definer set search_path = public as $$
  select j.classe, j.numero, j.sufixo,
         j.relator, j.redator_acordao, j.ministro,
         j.orgao, j.data, j.publicacao, j.tema_rg,
         j.citacao, j.colecao, j.fonte_pagina, j.fonte_url,
         j.confianca, j.arquivo
    from public.stf_julgados j
   where j.numero = regexp_replace(coalesce(p_numero, ''), '[^0-9]', '', 'g')
     and (coalesce(p_classe, '') = '' or upper(j.classe) = upper(p_classe))
   order by (j.confianca = 'alta') desc, j.classe, j.sufixo nulls first
   limit 20
$$;

revoke all on function public.stf_lookup(text, text) from public;
grant execute on function public.stf_lookup(text, text) to authenticated;
grant execute on function public.stf_lookup(text, text) to service_role;
