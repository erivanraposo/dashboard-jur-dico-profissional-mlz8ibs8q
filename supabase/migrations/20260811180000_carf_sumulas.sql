-- Súmulas do CARF — Conselho Administrativo de Recursos Fiscais.
--
-- FONTE: Quadro Geral de Súmulas publicado em
-- carf.economia.gov.br/jurisprudencia/sumulas-carf/quadro-geral-de-sumulas-1
-- Extração determinística da estrutura de parágrafos (extrai_sumulas_carf.py).
--
-- 217 súmulas, SÉRIE COMPLETA de 1 a 217, sem lacuna e sem duplicata:
--   118 vigentes e VINCULANTES | 94 vigentes | 5 revogadas
--
-- Órgãos, somando exatamente 217: Pleno 63, 2ª Turma da CSRF 60,
-- 1ª Turma da CSRF 58, 3ª Turma da CSRF 34, Pleno da CSRF 2.
--
-- ESTA BASE É QUALITATIVAMENTE DIFERENTE DAS OUTRAS. Súmula do CARF com efeito
-- vinculante OBRIGA A ADMINISTRAÇÃO TRIBUTÁRIA (art. 72 do RICARF): não é só
-- "existe ou não existe", é "obriga ou não obriga o julgador". Por isso
-- `vinculante` é coluna própria, e não detalhe da observação.
--
-- E POR ISSO CLASSIFICAR UMA REVOGADA COMO VIGENTE SERIA O PIOR ERRO POSSÍVEL:
-- quem cita súmula revogada num recurso ao próprio CARF perde o argumento, e o
-- relator sabe disso. Dois dos quatro defeitos corrigidos na extração produziam
-- exatamente esse erro.
--
-- DUAS REVOGAÇÕES DIFERENTES, e a distinção fica registrada no domínio:
--   'revogada'            -> o verbete caiu
--   'vinculante_revogado' -> a súmula CONTINUA VÁLIDA, mas deixou de obrigar
--
-- O segundo estado existe no vocabulário do CARF e HOJE NÃO TEM NENHUMA
-- OCORRÊNCIA: as duas súmulas que perderam o efeito vinculante (39 e 119) foram
-- depois revogadas por inteiro. Fica no domínio porque pode voltar a ocorrer —
-- não porque tenhamos casos.
--
-- Aditiva. Base de REFERÊNCIA compartilhada. Reversível:
--   drop table public.carf_sumulas cascade;

create table if not exists public.carf_sumulas (
  id            uuid primary key default gen_random_uuid(),
  numero        int  not null,
  orgao         text,                    -- Pleno, 1ª/2ª/3ª Turma da CSRF, Pleno da CSRF
  aprovada_em   text,                    -- "2006", "03/09/2018", "sessão de 26/09/2024 – vigência em 04/10/2024"
  enunciado     text,
  notas         text[] not null default '{}',   -- vigência, como o CARF escreve
  situacao      text not null default 'nao_verificada'
                check (situacao in ('vigente', 'vigente_vinculante',
                                    'vinculante_revogado', 'revogada', 'nao_verificada')),
  vinculante    boolean not null default false,
  portaria_vinculante text,              -- o ato que deu efeito vinculante
  url_portaria  text,
  precedentes   text,                    -- acórdãos que fundamentaram a súmula
  fonte_url     text,
  colhido_em    date not null default current_date
);

create unique index if not exists uq_carf_sumulas on public.carf_sumulas (numero);
create index if not exists idx_carf_sumulas_trgm
  on public.carf_sumulas using gin ((coalesce(enunciado, '')) gin_trgm_ops);

alter table public.carf_sumulas enable row level security;
drop policy if exists carf_sumulas_select on public.carf_sumulas;
create policy carf_sumulas_select on public.carf_sumulas for select
  to authenticated using (true);

comment on table public.carf_sumulas is
  'Súmulas do CARF, do Quadro Geral oficial. Série completa 1 a 217 — ausência de um número É informativa.';
comment on column public.carf_sumulas.vinculante is
  'Súmula vinculante OBRIGA a administração tributária (art. 72 do RICARF). Distingue esta base das demais: não é só existir, é obrigar o julgador.';
comment on column public.carf_sumulas.situacao is
  '"vinculante_revogado" = súmula válida que perdeu o efeito vinculante. Hoje sem ocorrências; fica no domínio porque pode voltar a ocorrer.';

-- ---------------------------------------------------------------------------
-- RPC do Nível 1
-- ---------------------------------------------------------------------------
create or replace function public.carf_sumula(p_numero int, p_tese text default null)
returns table (
  numero int, orgao text, aprovada_em text, enunciado text, notas text[],
  situacao text, vinculante boolean, portaria_vinculante text, url_portaria text,
  precedentes text, fonte_url text, colhido_em date, sim real
) language sql stable security definer set search_path = public as $$
  select s.numero, s.orgao, s.aprovada_em, s.enunciado, s.notas, s.situacao,
         s.vinculante, s.portaria_vinculante, s.url_portaria, s.precedentes,
         s.fonte_url, s.colhido_em,
         case when coalesce(p_tese, '') = '' then null
              else greatest(word_similarity(p_tese, coalesce(s.enunciado, '')),
                            similarity(p_tese, coalesce(s.enunciado, ''))) end
    from public.carf_sumulas s
   where s.numero = p_numero
   limit 1
$$;

revoke all on function public.carf_sumula(int, text) from public;
grant execute on function public.carf_sumula(int, text) to authenticated;
grant execute on function public.carf_sumula(int, text) to service_role;

create or replace function public.carf_sumula_limite()
returns int language sql stable security definer set search_path = public as $$
  select max(numero) from public.carf_sumulas
$$;

revoke all on function public.carf_sumula_limite() from public;
grant execute on function public.carf_sumula_limite() to authenticated;
grant execute on function public.carf_sumula_limite() to service_role;

comment on function public.carf_sumula_limite() is
  'Último número da série do CARF. A série está completa, então número acima do teto é prova de inexistência.';
