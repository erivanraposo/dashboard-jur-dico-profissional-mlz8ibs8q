-- Situação das súmulas do STF + preparação para as 736 comuns.
--
-- ACHADO QUE MOTIVA ISTO: enunciado e situação têm validades DIFERENTES.
-- A lista das 736 súmulas comuns está congelada desde 2003 (o STF parou de
-- editá-las após a EC 45/2004, migrando para vinculantes e repercussão geral),
-- então o ENUNCIADO é estável. A SITUAÇÃO, não: a Súmula 584 (imposto de renda)
-- e a 563 foram CANCELADAS depois da publicação oficial de 1º/12/2017 que usamos
-- como fonte do texto. Confirmar uma súmula cancelada como se valesse seria pior
-- que não responder — e é justamente o erro que este produto existe para evitar.
--
-- Por isso cada campo carrega a data da SUA fonte, e a tela mostra as duas.
--
-- Aditiva. Reversível: alter table public.stf_sumulas drop column situacao, ...

alter table public.stf_sumulas
  add column if not exists situacao text not null default 'nao_verificada',
  add column if not exists nota_situacao text,
  add column if not exists data_aprovacao text,
  add column if not exists situacao_fonte text,
  add column if not exists situacao_data date,
  add column if not exists enunciado_fonte_data date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'stf_sumulas_situacao_check'
       and conrelid = 'public.stf_sumulas'::regclass
  ) then
    alter table public.stf_sumulas
      add constraint stf_sumulas_situacao_check
      check (situacao in ('vigente', 'superada', 'cancelada', 'revogada',
                          'alterada', 'prejudicada', 'nao_verificada'));
  end if;
end $$;

-- As 56 vinculantes já carregadas ficam como 'nao_verificada' DE PROPÓSITO:
-- a publicação de 2017 delas não traz o campo, e marcá-las 'vigente' seria
-- afirmar o que não conferimos. A tela precisa dizer isso, não silenciar.
update public.stf_sumulas
   set enunciado_fonte_data = date '2017-11-09'
 where tipo = 'vinculante' and enunciado_fonte_data is null;

comment on column public.stf_sumulas.situacao is
  'Situação do enunciado. "nao_verificada" NÃO é sinônimo de vigente: significa que não conferimos. Vale com a data em situacao_data — a lista do STF muda, e uma súmula cancelada depois da nossa leitura apareceria aqui como vigente.';

-- ---------------------------------------------------------------------------
-- RPC atualizada: devolve situação e as duas datas de fonte.
-- ---------------------------------------------------------------------------
drop function if exists public.stf_sumula(int, boolean, text);

create function public.stf_sumula(
  p_numero int, p_vinculante boolean default true, p_tese text default null
)
returns table (
  numero int, tipo text, enunciado text, n_precedentes int,
  situacao text, nota_situacao text, data_aprovacao text,
  situacao_data date, enunciado_fonte_data date,
  fonte_arquivo text, fonte_pagina int, fonte_url text, sim real
) language sql stable security definer set search_path = public as $$
  select s.numero, s.tipo, s.enunciado, s.n_precedentes,
         s.situacao, s.nota_situacao, s.data_aprovacao,
         s.situacao_data, s.enunciado_fonte_data,
         s.fonte_arquivo, s.fonte_pagina, s.fonte_url,
         case when coalesce(p_tese, '') = '' then null
              else greatest(word_similarity(p_tese, s.enunciado),
                            similarity(p_tese, s.enunciado)) end as sim
    from public.stf_sumulas s
   where s.numero = p_numero
     and s.tipo = case when p_vinculante then 'vinculante' else 'comum' end
   limit 1
$$;

revoke all on function public.stf_sumula(int, boolean, text) from public;
grant execute on function public.stf_sumula(int, boolean, text) to authenticated;
grant execute on function public.stf_sumula(int, boolean, text) to service_role;
