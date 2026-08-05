-- Teto de cada série de súmulas — permite afirmar INEXISTÊNCIA, não só ausência.
--
-- ACHADO DO CONJUNTO DE TESTE DE SÚMULAS (05/08/2026): "Súmula 999 do STJ",
-- "Súmula Vinculante 99" e "Súmula 737 do STF" — nenhuma existe — voltavam como
-- "Enunciado identificado. O sistema NÃO leu o texto." A frase afirma que um
-- enunciado foi identificado quando não há enunciado nenhum, e soa como
-- reticência quando na verdade temos certeza.
--
-- E temos: ao contrário dos acórdãos, onde a base é AMOSTRA e ausência não
-- prova nada, as três séries de súmulas estão COMPLETAS na base — STJ de 1 a
-- 676, vinculantes de 1 a 63, comuns do STF de 1 a 736. Numa série completa,
-- ausência é prova de inexistência. É a assimetria de prova do sistema aplicada
-- ao contrário: aqui o silêncio da base é conclusivo, e estávamos desperdiçando
-- uma certeza.
--
-- Devolve o ÚLTIMO número de cada série. A data acompanha só o STJ, que segue
-- editando; para o STF ela seria enganosa — a data que temos das comuns é a da
-- publicação de 2017 que usamos como fonte, não a da edição de cada súmula.
--
-- Aditiva. Reversível: drop function public.sumula_limites();

create or replace function public.sumula_limites()
returns table (base text, maximo int, ultima_publicacao date)
language sql stable security definer set search_path = public as $$
  (select 'stj'::text, s.numero, s.data_publicacao
     from public.stj_sumulas s order by s.numero desc limit 1)
  union all
  (select 'stf_vinculante'::text, f.numero, null::date
     from public.stf_sumulas f where f.tipo = 'vinculante' order by f.numero desc limit 1)
  union all
  (select 'stf_comum'::text, f.numero, null::date
     from public.stf_sumulas f where f.tipo = 'comum' order by f.numero desc limit 1)
$$;

revoke all on function public.sumula_limites() from public;
grant execute on function public.sumula_limites() to authenticated;
grant execute on function public.sumula_limites() to service_role;

comment on function public.sumula_limites() is
  'Último número de cada série de súmulas. As séries estão completas na base, então um número acima do teto é prova de inexistência — não mera ausência.';
