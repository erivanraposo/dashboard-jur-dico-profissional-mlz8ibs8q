-- Situação da súmula no caminho dos PRECEDENTES, fechando a incoerência entre
-- os dois caminhos do STJ.
--
-- O SISTEMA SE CONTRADIZIA. Perguntar "Súmula 603 do STJ" devolvia, desde
-- 05/08, o alerta de que ela foi cancelada em 2018 — porque essa consulta usa a
-- tabela stj_sumulas, que tem situação. Mas citar um julgado que sustenta a
-- mesma súmula passava pela stj_lookup, que lê stj_teses — onde as 553 súmulas
-- trazidas em 02/08 entraram sem situação nenhuma. Mesma súmula, duas respostas
-- opostas, conforme o caminho. Para quem testa, isso é pior que uma lacuna
-- assumida: parece sistema que se desmente.
--
-- O detector de cancelamento posto em 06/08 só alcança as 49 teses que trazem o
-- aviso no PRÓPRIO texto ("determinou o CANCELAMENTO da Súmula 469..."). As 553
-- súmulas antigas têm texto limpo, e por isso escapavam.
--
-- A informação existia e não estava sendo usada aqui. As 553 seguem o padrão
-- "Súmula N do STJ: ..." em 553 de 553, então o número sai do texto sem
-- ambiguidade e casa com stj_sumulas — que tem situação conferida na lista viva
-- do STJ em 04/08/2026.
--
-- Muda o tipo de retorno (acrescenta três colunas) => drop antes do create.
-- Aditiva. Reversível: reaplicar 20260806120000_stj_lookup_correcoes.sql.

drop function if exists public.stj_lookup(text, text, text);

create function public.stj_lookup(p_numero text, p_uf text, p_tese text)
returns table (
  classe text, uf text, relator text, orgao text, data text, tipo_data text, citacao text,
  tese_text text, edicao int, numero_tese int, area text, fonte_url text, fonte_pagina int,
  sim real,
  situacao text, nota_situacao text, situacao_data date
) language sql stable security definer set search_path = public as $$
  select j.classe, j.uf, j.relator, j.orgao, j.data, j.tipo_data, j.citacao,
         t.tese_text, t.edicao, t.numero_tese, t.area, t.fonte_url, t.fonte_pagina,
         case when coalesce(p_tese, '') = '' then null
              else greatest(word_similarity(p_tese, t.tese_text),
                            similarity(p_tese, t.tese_text)) end as sim,
         s.situacao, s.nota_situacao, s.situacao_data
    from public.stj_tese_julgados j
    join public.stj_teses t on t.id = j.tese_id
    -- só as linhas que SÃO súmula (edição nula) buscam situação; as teses da
    -- Jurisprudência em Teses não têm equivalente em stj_sumulas.
    left join public.stj_sumulas s
      on t.edicao is null
     and s.numero = nullif(substring(t.tese_text from '^S[úu]mula\s+([0-9]+)'), '')::int
   where ltrim(j.numero, '0') = ltrim(p_numero, '0')
     and (coalesce(p_uf, '') = '' or j.uf = p_uf)
   order by sim desc nulls last
   limit 8
$$;

revoke all on function public.stj_lookup(text, text, text) from public;
grant execute on function public.stj_lookup(text, text, text) to authenticated, service_role;

comment on function public.stj_lookup(text, text, text) is
  'Julgado do STJ na base canônica. Quando a "tese" é na verdade uma súmula, traz a situação conferida em stj_sumulas — o mesmo dado que a consulta direta por súmula já usava.';
