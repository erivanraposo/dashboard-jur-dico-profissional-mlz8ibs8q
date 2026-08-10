-- Súmulas, Orientações Jurisprudenciais e Precedentes Normativos do TST.
--
-- Fecha a área do testador convidado em 07/08: faltava exatamente isto — súmula
-- do TST e OJ da SDI, que são o que mais aparece em peça trabalhista.
--
-- FONTE: TST — "Livro de Súmulas, Orientações Jurisprudenciais e Precedentes
-- Normativos", versão PDF publicada em www.tst.jus.br/livro-de-sumulas-ojs-e-pns
-- (579 páginas). Extração determinística por tipografia
-- (scripts/extrai_sumulas_tst.py).
--
-- 1.292 verbetes, SETE SÉRIES TODAS COMPLETAS, sem lacuna e sem duplicata:
--   SUM       463  súmulas                    1 a 463
--   OJ-SDI1   421  orientações da SBDI-1      1 a 421
--   OJ-SDI2   158  orientações da SBDI-2      1 a 158
--   PN        120  precedentes normativos     1 a 120
--   OJ-SDI1T   79  transitórias da SBDI-1     1 a  79
--   OJ-SDC     38  da Seção de Dissídios Coletivos
--   OJ-TP/OE   13  do Tribunal Pleno / Órgão Especial
--
-- A SITUAÇÃO VEM DO PRÓPRIO DOCUMENTO, entre parênteses no título: 585
-- vigentes, 352 canceladas, 187 alteradas, 168 convertidas. Vantagem que nenhuma
-- outra base nos deu — no STJ foi preciso cruzar com publicação avulsa de
-- canceladas, e no STF a situação das vinculantes antigas segue não verificada.
--
-- "CONVERTIDA" NÃO É "CANCELADA": o verbete caiu, mas o conteúdo migrou para
-- outro ("cancelada em decorrência da sua conversão na Súmula nº 405"). Quem
-- cita a OJ convertida não está citando coisa inexistente — está citando pelo
-- nome antigo. A resposta certa é apontar o sucessor, não dizer que não existe.
--
-- NATUREZA ≠ SITUAÇÃO: nos precedentes normativos, "(positivo)" e "(negativo)"
-- dizem se o PN afirma ou nega o direito. Tratá-los como estado inventaria um
-- cancelamento que não existe — por isso vão em coluna própria.
--
-- As marcas cruas ficam em `marcas`: a classificação é interpretação nossa, e
-- quem auditar precisa ver o que o TST escreveu.
--
-- Aditiva. Base de REFERÊNCIA compartilhada. Reversível:
--   drop table public.tst_sumulas cascade;

create table if not exists public.tst_sumulas (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in
                  ('SUM', 'OJ-SDI1', 'OJ-SDI2', 'OJ-SDI1T', 'OJ-SDC', 'OJ-TP/OE', 'PN')),
  numero        int  not null,
  titulo        text,
  titulo_bruto  text not null,          -- como o TST escreve, com marcas e resolução
  texto         text,                   -- ausente em 66 verbetes cancelados/convertidos
  historico     text,                   -- linha do tempo: redação original, alterações
  marcas        text[] not null default '{}',
  situacao      text not null default 'nao_verificada'
                check (situacao in ('vigente', 'cancelada', 'alterada',
                                    'convertida', 'nao_verificada')),
  natureza      text check (natureza in ('positivo', 'negativo')),  -- só PN
  fonte_documento text,
  fonte_pagina  int,
  fonte_url     text,
  colhido_em    date not null default current_date
);

create unique index if not exists uq_tst_sumulas on public.tst_sumulas (tipo, numero);
create index if not exists idx_tst_sumulas_trgm
  on public.tst_sumulas using gin ((coalesce(texto, '') || ' ' || coalesce(titulo, '')) gin_trgm_ops);

alter table public.tst_sumulas enable row level security;
drop policy if exists tst_sumulas_select on public.tst_sumulas;
create policy tst_sumulas_select on public.tst_sumulas for select
  to authenticated using (true);

comment on table public.tst_sumulas is
  'Súmulas, OJs e Precedentes Normativos do TST, do Livro oficial. Sete séries completas — ausência de um número É informativa, ao contrário da base de temas.';
comment on column public.tst_sumulas.situacao is
  '"convertida" significa que o verbete caiu mas o conteúdo migrou para outro; o texto do sucessor está em `marcas`. Não confundir com "cancelada".';
comment on column public.tst_sumulas.natureza is
  'Só precedentes normativos: "positivo" afirma o direito, "negativo" o nega. NÃO é situação.';

-- ---------------------------------------------------------------------------
-- RPC do Nível 1
-- ---------------------------------------------------------------------------
create or replace function public.tst_sumula(p_tipo text, p_numero int, p_tese text default null)
returns table (
  tipo text, numero int, titulo text, titulo_bruto text, texto text,
  historico text, marcas text[], situacao text, natureza text,
  fonte_pagina int, fonte_url text, colhido_em date, sim real
) language sql stable security definer set search_path = public as $$
  select s.tipo, s.numero, s.titulo, s.titulo_bruto, s.texto, s.historico,
         s.marcas, s.situacao, s.natureza, s.fonte_pagina, s.fonte_url, s.colhido_em,
         case when coalesce(p_tese, '') = '' then null
              else greatest(word_similarity(p_tese, coalesce(s.texto, s.titulo, '')),
                            similarity(p_tese, coalesce(s.texto, s.titulo, ''))) end as sim
    from public.tst_sumulas s
   where s.tipo = upper(p_tipo) and s.numero = p_numero
   limit 1
$$;

revoke all on function public.tst_sumula(text, int, text) from public;
grant execute on function public.tst_sumula(text, int, text) to authenticated;
grant execute on function public.tst_sumula(text, int, text) to service_role;

-- Teto de cada série, para afirmar inexistência com base — como em sumula_limites.
create or replace function public.tst_sumula_limites()
returns table (tipo text, maximo int) language sql stable security definer
set search_path = public as $$
  select s.tipo, max(s.numero) from public.tst_sumulas s group by s.tipo
$$;

revoke all on function public.tst_sumula_limites() from public;
grant execute on function public.tst_sumula_limites() to authenticated;
grant execute on function public.tst_sumula_limites() to service_role;

comment on function public.tst_sumula_limites() is
  'Último número de cada série do TST. As séries estão completas, então número acima do teto é prova de inexistência.';
