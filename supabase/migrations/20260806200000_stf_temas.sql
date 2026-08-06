-- Base canônica de TEMAS DE REPERCUSSÃO GERAL do STF — Nível 1 do Verificador.
--
-- Fecha a maior lacuna de cobertura que restava: até aqui, TODA citação de tema
-- ("Tema 1.234 do STF") caía no Nível 2 e custava ~US$0,19, porque não havia
-- base nenhuma. Tema é das citações mais frequentes em peça.
--
-- COMO A FONTE FOI OBTIDA — e por que isso contraria o que assumimos em 30/07.
-- Concluímos, à época, que os portais do STF e do STJ eram ilegíveis por
-- máquina, por serem aplicações JavaScript. Verdade pela metade: a página
-- portal.stf.jus.br/repercussaogeral/teses.asp é de fato uma casca, e a tabela
-- vem por script. Mas o script que a preenche
-- (/scripts/tesesrepercussaogeral.js) chama
--   POST /repercussaogeral/retornartesesrepercussaogeral.asp   {tipo: "com"|"sem"}
-- que devolve JSON puro, com o texto integral de cada tese. "O portal é uma
-- SPA" não implica "os dados são inacessíveis" — vale revisitar essa conclusão
-- para os repetitivos do STJ também.
--
-- Colhido em 06/08/2026: 811 teses COM repercussão geral e 473 SEM, 1.284 temas
-- distintos, do 1 ao 1.430. Zero duplicata, zero tese vazia, zero entidade HTML,
-- todas as datas no padrão, nenhuma sobreposição entre as duas listas.
--
-- ATENÇÃO À ASSIMETRIA — é o oposto do caso das súmulas. Lá a série era
-- COMPLETA, e ausência provava inexistência ("não existe Súmula 999"). Aqui
-- faltam 146 temas entre 1 e 1.430 (10%) — os que ainda não tiveram mérito
-- julgado. Ausência aqui significa "ainda não julgado ou fora da nossa base",
-- NUNCA "não existe". Afirmar inexistência de tema seria repetir, invertido, o
-- erro que corrigimos em 05/08.
--
-- A lista "sem" não guarda tese no sentido usual: guarda a decisão de que a
-- matéria é infraconstitucional e não tem repercussão geral. Citar um tema
-- dessa lista como se fixasse tese é erro comum, e passamos a apontá-lo.
--
-- Aditiva. Base de REFERÊNCIA compartilhada: leitura por qualquer autenticado,
-- escrita só por service_role. Reversível: drop table public.stf_temas cascade;

create table if not exists public.stf_temas (
  id             uuid primary key default gen_random_uuid(),
  numero         int  not null,
  tem_rg         boolean not null,     -- false = o STF NEGOU repercussão geral
  tese           text not null,
  classe         text,
  processo       text,
  incidente      text,
  data_andamento date,
  fonte_url      text,
  colhido_em     date not null default current_date
);

create unique index if not exists uq_stf_temas on public.stf_temas (numero);
create index if not exists idx_stf_temas_trgm
  on public.stf_temas using gin (tese gin_trgm_ops);

alter table public.stf_temas enable row level security;
drop policy if exists stf_temas_select on public.stf_temas;
create policy stf_temas_select on public.stf_temas for select
  to authenticated using (true);

comment on table public.stf_temas is
  'Temas de repercussão geral do STF, do banco de teses do próprio tribunal. NÃO é série completa: faltam os temas sem mérito julgado. Ausência não prova inexistência.';
comment on column public.stf_temas.tem_rg is
  'false significa que o STF NEGOU repercussão geral — o texto em `tese` é a decisão de inadmissão, não uma tese firmada.';

-- ---------------------------------------------------------------------------
-- RPC do Nível 1
-- ---------------------------------------------------------------------------
create or replace function public.stf_tema(p_numero int, p_tese text default null)
returns table (
  numero int, tem_rg boolean, tese text, classe text, processo text,
  data_andamento date, fonte_url text, colhido_em date, sim real
) language sql stable security definer set search_path = public as $$
  select t.numero, t.tem_rg, t.tese, t.classe, t.processo,
         t.data_andamento, t.fonte_url, t.colhido_em,
         case when coalesce(p_tese, '') = '' then null
              else greatest(word_similarity(p_tese, t.tese),
                            similarity(p_tese, t.tese)) end as sim
    from public.stf_temas t
   where t.numero = p_numero
   limit 1
$$;

revoke all on function public.stf_tema(int, text) from public;
grant execute on function public.stf_tema(int, text) to authenticated;
grant execute on function public.stf_tema(int, text) to service_role;

comment on function public.stf_tema(int, text) is
  'Tema de repercussão geral do STF. Devolve nada quando o tema não está na base — o que NÃO autoriza dizer que ele não existe: pode estar pendente de julgamento.';
