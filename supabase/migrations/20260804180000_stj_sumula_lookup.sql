-- Súmula do STJ no Nível 1 do Verificador.
--
-- As 553 súmulas carregadas em 02/08 já estão em `stj_teses` (extrai_sumulas.py):
-- tese_text no formato "Súmula N do STJ: <enunciado>", `edicao` NULA — é isso que
-- as distingue das teses da Jurisprudência em Teses, que sempre têm edição.
--
-- Até agora o Verificador só reconhecia o PADRÃO da citação e devolvia
-- IDENTIFICADO ("não lemos o texto"). Com esta RPC ele passa a devolver o
-- ENUNCIADO conferido na publicação oficial — e, havendo tese alegada, a
-- similaridade contra ela, no mesmo desenho do stj_lookup.
--
-- Aditiva. Reversível: drop function public.stj_sumula(int, text);

create or replace function public.stj_sumula(p_numero int, p_tese text default null)
returns table (
  numero_tese int,
  area text,
  enunciado text,
  fonte_arquivo text,
  fonte_pagina int,
  fonte_url text,
  sim real
) language sql stable security definer set search_path = public as $$
  select t.numero_tese,
         t.area,
         t.tese_text,
         t.fonte_arquivo,
         t.fonte_pagina,
         t.fonte_url,
         case when coalesce(p_tese, '') = '' then null
              else greatest(word_similarity(p_tese, t.tese_text),
                            similarity(p_tese, t.tese_text)) end as sim
    from public.stj_teses t
   where t.numero_tese = p_numero
     and t.edicao is null                        -- súmula, não tese de edição
     and t.tese_text ilike 'S%mula%STJ:%'
   order by sim desc nulls last
   limit 1
$$;

revoke all on function public.stj_sumula(int, text) from public;
grant execute on function public.stj_sumula(int, text) to authenticated;
grant execute on function public.stj_sumula(int, text) to service_role;

comment on function public.stj_sumula(int, text) is
  'Enunciado de súmula do STJ a partir da base canônica (SumulasSTJ.pdf). Usada pelo Nível 1 do Verificador de Precedentes para deixar de responder apenas IDENTIFICADO em citação de súmula.';
