-- RPC do Nível 1 do Verificador: dado um número de processo (e UF), devolve os
-- julgados da base STJ com seus metadados autoritativos e a(s) tese(s) que ele
-- sustenta, já com a similaridade contra a tese alegada (word_similarity é
-- robusto a diferença de tamanho entre a alegação curta e a tese longa).
-- Aditiva. Idempotente. Rodar no SQL Editor.

create or replace function public.stj_lookup(p_numero text, p_uf text, p_tese text)
returns table (
  classe text, uf text, relator text, orgao text, data text, tipo_data text,
  tese_text text, edicao int, numero_tese int, area text, fonte_url text, fonte_pagina int,
  sim real
) language sql stable security definer set search_path = public as $$
  select j.classe, j.uf, j.relator, j.orgao, j.data, j.tipo_data,
         t.tese_text, t.edicao, t.numero_tese, t.area, t.fonte_url, t.fonte_pagina,
         case when coalesce(p_tese, '') = '' then null
              else greatest(word_similarity(p_tese, t.tese_text),
                            similarity(p_tese, t.tese_text)) end as sim
  from public.stj_tese_julgados j
  join public.stj_teses t on t.id = j.tese_id
  where j.numero = p_numero
    and (coalesce(p_uf, '') = '' or j.uf = p_uf)
  order by sim desc nulls last
  limit 8
$$;

revoke all on function public.stj_lookup(text, text, text) from public;
grant execute on function public.stj_lookup(text, text, text) to authenticated, service_role;
