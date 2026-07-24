-- Novo tipo de peça "Contrarrazões" (resposta ao recurso da parte adversa).
--
-- O tipo é definido no front-end (MINUTE_TYPES) e seleciona um template próprio.
-- Aqui marcamos quais AGENTES são compatíveis com o tipo, para que apareçam na
-- seleção quando o usuário escolher "Contrarrazões" — do contrário nenhum agente
-- surgiria (a lista é filtrada por compatible_minute_types).
--
-- Conjunto escolhido: agentes contenciosos, de pesquisa e de revisão pertinentes a
-- uma peça de resistência recursal (refutar fundamentos + manter a decisão recorrida).

update public.agentes
set compatible_minute_types = array_append(compatible_minute_types, 'Contrarrazões')
where name in (
  'Peticionador Cível',
  'Análise de Sentença',
  'Revisor Sênior',
  'Revisor Penal',
  'Analista de Jurisprudência',
  'doutrina',
  'pesquisa-stj-stf',
  'red-team-juridico',
  'Gestão de Prazos Processuais',
  'Analista de Documentos Estrangeiros'
)
and not ('Contrarrazões' = any(compatible_minute_types));
