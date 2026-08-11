-- Súmulas do Tribunal Superior Eleitoral. Fecha o direito eleitoral.
--
-- FONTE: TSE — "Súmulas do TSE, do STF e do STJ", publicação oficial
-- (www.tse.jus.br/legislacao/codigo-eleitoral/sumulas/sumulas-do-tse).
-- Extração determinística por tipografia (scripts/extrai_sumulas_tse.py).
--
-- 73 súmulas, SÉRIE COMPLETA de 1 a 73, sem lacuna e sem duplicata:
--   62 vigentes | 7 canceladas | 4 alteradas
--
-- A ausência é conclusiva: não existe Súmula 74 do TSE.
--
-- A REDAÇÃO ANTERIOR DAS QUATRO ALTERADAS FICA PRESERVADA, e é o que esta base
-- tem de mais útil. A Súmula 6 dizia "É inelegível, para o cargo de prefeito, o
-- cônjuge e os parentes ... AINDA QUE este haja renunciado ao cargo há mais de
-- seis meses do pleito". Hoje diz quase o contrário na parte final: "SALVO SE
-- este, reelegível, tenha falecido, renunciado ou se afastado definitivamente
-- do cargo até seis meses antes do pleito".
--
-- Quem cita a redação antiga cita TEXTO LEGÍTIMO, PUBLICADO PELO TSE, QUE JÁ
-- NÃO VALE. Nenhum detector de alucinação pega isso — o texto existe, tem
-- origem oficial e soa correto. Só a fonte denuncia.
--
-- AS NOTAS SÃO DO TRIBUNAL, NÃO DA SÚMULA. O TSE marca em fonte própria
-- (MyriadPro-Light, contra a Regular do enunciado) o que a jurisprudência
-- posterior fez com cada verbete — 55 das 73 têm nota, e a Súmula 11 tem 18,
-- entre elas a de que o STF a afastou para o Ministério Público. Vão em coluna
-- separada: misturar comentário com enunciado seria o erro que este produto
-- existe para não cometer.
--
-- Aditiva. Base de REFERÊNCIA compartilhada. Reversível:
--   drop table public.tse_sumulas cascade;

create table if not exists public.tse_sumulas (
  id            uuid primary key default gen_random_uuid(),
  numero        int  not null,
  titulo_bruto  text not null,            -- "Súmula-TSE n. 6" ou "... (cancelada)"
  marca         text,                     -- o que vem entre parênteses, cru
  situacao      text not null default 'nao_verificada'
                check (situacao in ('vigente', 'cancelada', 'alterada', 'nao_verificada')),
  enunciado     text,                     -- o texto EM VIGOR (ou o revogado, se cancelada)
  redacao_original text,                  -- só nas 4 alteradas
  origem_redacao_atual text,              -- o ato que deu a redação atual
  nota_cancelamento text,                 -- quem cancelou, quando e por qual ato
  notas         text[] not null default '{}',   -- evolução jurisprudencial, do TSE
  referencias   text,
  composicao    text,                     -- ministros que assinaram
  publicacao    text,
  fonte_documento text,
  fonte_pagina  int,
  fonte_url     text,
  colhido_em    date not null default current_date
);

create unique index if not exists uq_tse_sumulas on public.tse_sumulas (numero);
create index if not exists idx_tse_sumulas_trgm
  on public.tse_sumulas using gin ((coalesce(enunciado, '')) gin_trgm_ops);
-- Índice próprio para a redação anterior: é por ele que se descobre que o
-- advogado está citando a versão superada.
create index if not exists idx_tse_sumulas_orig_trgm
  on public.tse_sumulas using gin ((coalesce(redacao_original, '')) gin_trgm_ops);

alter table public.tse_sumulas enable row level security;
drop policy if exists tse_sumulas_select on public.tse_sumulas;
create policy tse_sumulas_select on public.tse_sumulas for select
  to authenticated using (true);

comment on table public.tse_sumulas is
  'Súmulas do TSE, da publicação oficial. Série completa 1 a 73 — ausência de um número É informativa.';
comment on column public.tse_sumulas.redacao_original is
  'Redação anterior das 4 alteradas. Citá-la é citar texto oficial que já não vale — o caso que nenhum detector de alucinação pega.';
comment on column public.tse_sumulas.notas is
  'Evolução jurisprudencial registrada pelo TSE em fonte própria. É comentário do tribunal, NÃO o enunciado.';

-- ---------------------------------------------------------------------------
-- RPC do Nível 1
--
-- Devolve a semelhança da tese com o enunciado EM VIGOR e, separadamente, com a
-- REDAÇÃO ANTERIOR. É a comparação entre as duas que permite dizer "o senhor
-- está citando a redação superada" em vez de um "não confere" sem explicação.
-- ---------------------------------------------------------------------------
create or replace function public.tse_sumula(p_numero int, p_tese text default null)
returns table (
  numero int, titulo_bruto text, situacao text, enunciado text,
  redacao_original text, origem_redacao_atual text, nota_cancelamento text,
  notas text[], referencias text, publicacao text,
  fonte_pagina int, fonte_url text, colhido_em date,
  sim real, sim_original real
) language sql stable security definer set search_path = public as $$
  select s.numero, s.titulo_bruto, s.situacao, s.enunciado, s.redacao_original,
         s.origem_redacao_atual, s.nota_cancelamento, s.notas, s.referencias,
         s.publicacao, s.fonte_pagina, s.fonte_url, s.colhido_em,
         case when coalesce(p_tese, '') = '' then null
              else greatest(word_similarity(p_tese, coalesce(s.enunciado, '')),
                            similarity(p_tese, coalesce(s.enunciado, ''))) end,
         case when coalesce(p_tese, '') = '' or s.redacao_original is null then null
              else greatest(word_similarity(p_tese, s.redacao_original),
                            similarity(p_tese, s.redacao_original)) end
    from public.tse_sumulas s
   where s.numero = p_numero
   limit 1
$$;

revoke all on function public.tse_sumula(int, text) from public;
grant execute on function public.tse_sumula(int, text) to authenticated;
grant execute on function public.tse_sumula(int, text) to service_role;

create or replace function public.tse_sumula_limite()
returns int language sql stable security definer set search_path = public as $$
  select max(numero) from public.tse_sumulas
$$;

revoke all on function public.tse_sumula_limite() from public;
grant execute on function public.tse_sumula_limite() to authenticated;
grant execute on function public.tse_sumula_limite() to service_role;

comment on function public.tse_sumula_limite() is
  'Último número da série do TSE. A série está completa, então número acima do teto é prova de inexistência.';
