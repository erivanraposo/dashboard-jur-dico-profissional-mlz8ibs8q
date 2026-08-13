-- Prazo de retenção para anexo sem processo — 13/08/2026.
--
-- Fecha o ciclo aberto pela auditoria de 12/08, em que 457 anexos (813 MB) e 104
-- órfãos (40 MB) foram encontrados sem vínculo com processo algum. A limpeza
-- resolveu o acervo; isto impede que ele se forme de novo.
--
-- É a opção B do desenho (lexaxis_anexo_sem_dono_opcoes.md). A opção C — tornar
-- visíveis, em Configurações — entrou ontem e continua sendo a rede principal:
-- quem quiser guardar, guarda; quem esquecer, é avisado antes de perder.
--
-- O QUE ISTO PERMITE ESCREVER NO DPA. A cláusula 10 promete "eliminação
-- comprovada" sem dizer quando. Com prazo declarado, passa a haver política de
-- retenção de verdade: anexo não vinculado a processo é eliminado em 45 dias,
-- com aviso a partir do 38º. Promessa com data é diferente de promessa.
--
-- 45 DIAS, E NÃO 15 OU 30, por uma razão prática: prazo processual comum é de 15
-- dias úteis, o que dá cerca de três semanas corridas. Um advogado que anexa os
-- autos no início do prazo e volta ao fim dele não pode perder o material. 45
-- dias cobrem o prazo inteiro com folga, e ainda deixam margem para férias
-- curtas.
--
-- NÃO APAGA NADA SOZINHO NESTA MIGRATION. Ela só cria a marcação e a função. A
-- execução automática (pg_cron) fica para decisão separada — apagar arquivo de
-- cliente por rotina é coisa que se liga com os olhos abertos, depois de ver a
-- primeira lista do que seria apagado.
--
-- Reversível:
--   drop function public.anexos_a_expirar(int);
--   drop function public.anexos_expirados(int);
--   alter table public.process_attachments drop column expira_avisado_em;

alter table public.process_attachments
  add column if not exists expira_avisado_em timestamptz;

comment on column public.process_attachments.expira_avisado_em is
  'Quando o usuário foi avisado de que este anexo sem processo se aproxima do fim do prazo de retenção. Nulo = ainda não avisado.';

-- ---------------------------------------------------------------------------
-- Quem está PERTO de expirar — a lista do aviso.
--
-- Só anexo SEM PROCESSO entra. Anexo vinculado a processo não tem prazo: ele
-- vive e morre com o processo, que é o comportamento esperado num escritório.
-- ---------------------------------------------------------------------------
create or replace function public.anexos_a_expirar(p_dias_aviso int default 7)
returns table (
  id uuid, file_name text, file_path text, file_size bigint,
  created_at timestamptz, dias_restantes int, ja_avisado boolean
) language sql stable security definer set search_path = public as $$
  select a.id, a.file_name, a.file_path, a.file_size, a.created_at,
         45 - extract(day from (now() - a.created_at))::int,
         a.expira_avisado_em is not null
    from public.process_attachments a
   where a.process_id is null
     and a.workspace_id = public.current_workspace_id()
     and a.created_at < now() - make_interval(days => 45 - p_dias_aviso)
     and a.created_at >= now() - interval '45 days'
   order by a.created_at
$$;

revoke all on function public.anexos_a_expirar(int) from public;
grant execute on function public.anexos_a_expirar(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Quem JÁ passou do prazo — a lista da eliminação.
--
-- Devolve, não apaga. Quem apaga é o script de limpeza, que remove o ARQUIVO
-- antes da LINHA (ordem que impede resíduo invisível — a lição dos 104 órfãos).
-- ---------------------------------------------------------------------------
create or replace function public.anexos_expirados(p_dias int default 45)
returns table (
  id uuid, file_name text, file_path text, file_size bigint,
  workspace_id uuid, created_at timestamptz, dias_de_vida int
) language sql stable security definer set search_path = public as $$
  select a.id, a.file_name, a.file_path, a.file_size, a.workspace_id, a.created_at,
         extract(day from (now() - a.created_at))::int
    from public.process_attachments a
   where a.process_id is null
     and a.created_at < now() - make_interval(days => p_dias)
   order by a.created_at
$$;

-- Sem grant para `authenticated`: esta é a lista OPERACIONAL, de todos os
-- workspaces, usada pela rotina de limpeza com service_role. O usuário comum vê
-- os próprios anexos pela tela de Configurações e por anexos_a_expirar().
revoke all on function public.anexos_expirados(int) from public;
grant execute on function public.anexos_expirados(int) to service_role;

comment on function public.anexos_expirados(int) is
  'Anexos sem processo além do prazo de retenção, de TODOS os workspaces. Só service_role. Devolve a lista — não apaga.';
comment on function public.anexos_a_expirar(int) is
  'Anexos sem processo do PRÓPRIO workspace que se aproximam do fim do prazo. Alimenta o aviso na interface.';
