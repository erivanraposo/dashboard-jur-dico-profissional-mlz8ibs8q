-- Duas correções na base STJ do Nível 1, achadas ao montar o conjunto de teste
-- da Jurisprudência em Teses (06/08/2026) — antes de rodar um único caso.
--
-- 1. DATA E TIPO_DATA TROCADOS nos julgados vindos das súmulas.
--
--    A carga de 02/08, que trouxe 553 súmulas para dentro de stj_teses, inverteu
--    os dois campos: `data` ficou com o veículo ("DJe", "DJ") e `tipo_data` com a
--    data. O diagnóstico não deixa margem — dos 4.557 julgados dessa origem,
--    ZERO têm data em `data` e 4.556 têm data em `tipo_data`; nos 18.040 da JT,
--    18.036 estão corretos e nenhum invertido.
--
--    Efeito em produção: confrontaStj compara a data citada contra `meta.data`.
--    Com "DJe" ali, QUALQUER citação correta desses julgados era acusada de
--    divergir, com a frase "a citação diz '04/06/2009', o STJ registra 'DJe'" —
--    sem sentido na tela e, pior, uma acusação falsa. É o espelho do defeito de
--    05/08: lá confirmávamos o errado, aqui recusávamos o certo.
--
--    A troca é condicionada à FORMA, não à origem: só inverte onde `data` não
--    parece data e `tipo_data` parece. Idempotente por construção — depois de
--    rodar, a condição deixa de ser satisfeita.
--
-- 2. NÚMERO COM ZEROS À ESQUERDA NUNCA CASAVA.
--
--    A base guarda "007479", "010078", "005272" (1.070 julgados, 4,7%). O
--    Verificador normaliza a citação tirando só os pontos: "AREsp 7.479/RS" vira
--    "7479". E a RPC comparava por igualdade. Nenhum advogado escreve "AREsp
--    007479/RS", então esses julgados JAMAIS eram encontrados no Nível 1 —
--    caíam no Nível 2 e passavam a custar ~US$0,19 cada. Defeito de cobertura e
--    de custo, silencioso nos dois.
--
--    Passa a comparar sem os zeros dos dois lados, com índice na expressão para
--    não perder o plano.
--
-- Aditiva e reversível.

-- ---------------------------------------------------------------------------
-- 1. desfaz a inversão
-- ---------------------------------------------------------------------------
update public.stj_tese_julgados
   set data = tipo_data,
       tipo_data = data
 where coalesce(data, '')      !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
   and coalesce(tipo_data, '')  ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$';

-- ---------------------------------------------------------------------------
-- 2. casamento de número sem zeros à esquerda
-- ---------------------------------------------------------------------------
create index if not exists idx_stj_tese_julgados_num_norm
  on public.stj_tese_julgados (ltrim(numero, '0'), uf);

drop function if exists public.stj_lookup(text, text, text);

create function public.stj_lookup(p_numero text, p_uf text, p_tese text)
returns table (
  classe text, uf text, relator text, orgao text, data text, tipo_data text, citacao text,
  tese_text text, edicao int, numero_tese int, area text, fonte_url text, fonte_pagina int,
  sim real
) language sql stable security definer set search_path = public as $$
  select j.classe, j.uf, j.relator, j.orgao, j.data, j.tipo_data, j.citacao,
         t.tese_text, t.edicao, t.numero_tese, t.area, t.fonte_url, t.fonte_pagina,
         case when coalesce(p_tese, '') = '' then null
              else greatest(word_similarity(p_tese, t.tese_text),
                            similarity(p_tese, t.tese_text)) end as sim
  from public.stj_tese_julgados j
  join public.stj_teses t on t.id = j.tese_id
  -- "007479" na base contra "7479" na citação real: normaliza os dois lados.
  where ltrim(j.numero, '0') = ltrim(p_numero, '0')
    and (coalesce(p_uf, '') = '' or j.uf = p_uf)
  order by sim desc nulls last
  limit 8
$$;

revoke all on function public.stj_lookup(text, text, text) from public;
grant execute on function public.stj_lookup(text, text, text) to authenticated, service_role;

comment on function public.stj_lookup(text, text, text) is
  'Julgado do STJ na base canônica (Jurisprudência em Teses + súmulas). Compara o número sem zeros à esquerda: a base grava "007479" e a citação real diz "7.479".';
