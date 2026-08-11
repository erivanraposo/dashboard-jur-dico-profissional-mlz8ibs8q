-- Contadores que faltavam em precedent_verifications.
--
-- ACHADO DE 10/08: das 29 citações verificadas até então, só 22 apareciam em
-- algum contador. As outras 7 eram IDENTIFICADO e VIGENCIA_COMPROMETIDA — e o
-- estado de que mais nos orgulhamos, o que avisa que a súmula caiu, era
-- justamente o único sem medição.
--
-- A tabela nasceu em 30/07 com três contadores, quando os estados eram três. De
-- lá para cá o sistema ganhou VIGENCIA_COMPROMETIDA (05/08) e CONFIRMADO_BASE_TST
-- (10/08), e os contadores não acompanharam. Medir só o que já se media é como
-- não medir: a soma das colunas deixa de bater com n_citacoes, e ninguém percebe
-- porque nenhuma consulta compara as duas coisas.
--
-- Aditiva, com backfill a partir do jsonb `resultado`, que sempre guardou o item
-- inteiro — os dados históricos estavam lá, só não somados.
--
-- Reversível: alter table public.precedent_verifications
--   drop column n_identificado, drop column n_vigencia_comprometida;

alter table public.precedent_verifications
  add column if not exists n_identificado int not null default 0,
  add column if not exists n_vigencia_comprometida int not null default 0;

-- Backfill: recontar a partir do que já foi gravado.
update public.precedent_verifications v
   set n_identificado = coalesce((
         select count(*) from jsonb_array_elements(v.resultado) i
          where i->>'estado' = 'IDENTIFICADO'), 0),
       n_vigencia_comprometida = coalesce((
         select count(*) from jsonb_array_elements(v.resultado) i
          where i->>'estado' = 'VIGENCIA_COMPROMETIDA'), 0)
 where jsonb_typeof(v.resultado) = 'array';

comment on column public.precedent_verifications.n_vigencia_comprometida is
  'Súmula cancelada, redação anterior, verbete convertido, tese repetitiva cancelada. É o alerta que distingue este produto de um detector — e passou 11 dias sem contador.';

-- Conferência: a soma dos estados tem de bater com n_citacoes. Uma view que
-- denuncia sozinha o dia em que um estado novo entrar sem contador.
create or replace view public.vw_precver_integridade as
  select id,
         created_at::date as dia,
         n_citacoes,
         n_confirmado + n_divergente + n_nao_local
           + n_identificado + n_vigencia_comprometida as somados,
         n_citacoes - (n_confirmado + n_divergente + n_nao_local
           + n_identificado + n_vigencia_comprometida) as nao_contados
    from public.precedent_verifications;

comment on view public.vw_precver_integridade is
  'nao_contados > 0 significa que existe estado sem contador — o defeito de 30/07 a 11/08, quando VIGENCIA_COMPROMETIDA não era somada. Conferir depois de cada estado novo.';
