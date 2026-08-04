-- Súmulas Vinculantes 59 a 63 — posteriores à publicação oficial de 2017, que
-- para na SV 56. Enunciados conferidos por Erivan na página do STF, um a um.
--
-- POR QUE NÃO SAÍRAM DOS PDFs: os arquivos são os INTEIROS TEORES dos acórdãos
-- (PSV 139, RE 1.366.243, RE 566.471...), onde convivem entre aspas a redação
-- PROPOSTA, a sugerida em voto, a tese de repercussão geral do precedente e a
-- redação afinal APROVADA — todas parecidas e todas legítimas no seu contexto.
-- Conferindo depois: dos 4 enunciados que a extração arriscou, 3 estavam certos
-- e 1 errado — a SV 62, onde o verbete aprovado é o texto que a heurística
-- classificara como "tese de julgamento", e o que ela apontaria como verbete era
-- a redação proposta. Num verificador, 75% não é aproveitável.
--
-- n_precedentes = 0 nas SV 60 a 63 significa NÃO REGISTRADO, não "sem
-- precedentes": a lista não foi coletada para essas.
--
-- Aditiva e idempotente (on conflict atualiza).

insert into public.stf_sumulas
  (numero, tipo, enunciado, n_precedentes, situacao, data_aprovacao,
   situacao_fonte, situacao_data, enunciado_fonte_data,
   fonte_documento, fonte_arquivo, fonte_url, confianca)
values
  (59, 'vinculante',
   'É impositiva a fixação do regime aberto e a substituição da pena privativa de liberdade por restritiva de direitos quando reconhecida a figura do tráfico privilegiado (art. 33, § 4º, da Lei 11.343/06) e ausentes vetores negativos na primeira fase da dosimetria (art. 59 do CP), observados os requisitos do art. 33, § 2º, alínea c, e do art. 44, ambos do Código Penal.',
   37, 'vigente', 'Sessão Plenária de 19/10/2023',
   'portal do STF (súmulas vinculantes)', date '2026-08-04', date '2023-10-27',
   'STF — Súmula Vinculante 59 (DJe de 27/10/2023; DOU de 27/10/2023, Seção 1, p. 1). Aprovada pela PSV 139.',
   'portal do STF', 'https://portal.stf.jus.br/jurisprudencia/sumariosumulas.asp', 'alta'),

  (60, 'vinculante',
   'O pedido e a análise administrativos de fármacos na rede pública de saúde, a judicialização do caso, bem ainda seus desdobramentos (administrativos e jurisdicionais), devem observar os termos dos 3 (três) acordos interfederativos (e seus fluxos) homologados pelo Supremo Tribunal Federal, em governança judicial colaborativa, no tema 1.234 da sistemática da repercussão geral RE 1.366.243.',
   0, 'vigente', null,
   'portal do STF (súmulas vinculantes)', date '2026-08-04', date '2024-09-16',
   'STF — Súmula Vinculante 60 (DJe de 16/09/2024). Origem: Tema 1.234 da repercussão geral, RE 1.366.243.',
   'portal do STF', 'https://portal.stf.jus.br/jurisprudencia/sumariosumulas.asp', 'alta'),

  (61, 'vinculante',
   'A concessão judicial de medicamento registrado na ANVISA, mas não incorporado às listas de dispensação do Sistema Único de Saúde, deve observar as teses firmadas no julgamento do Tema 6 da Repercussão Geral (RE 566.471).',
   0, 'vigente', null,
   'portal do STF (súmulas vinculantes)', date '2026-08-04', date '2024-10-03',
   'STF — Súmula Vinculante 61 (DJe de 03/10/2024). Origem: Tema 6 da repercussão geral, RE 566.471.',
   'portal do STF', 'https://portal.stf.jus.br/jurisprudencia/sumariosumulas.asp', 'alta'),

  (62, 'vinculante',
   'É legítima a revogação da isenção estabelecida no art. 6º, II, da Lei Complementar 70/1991 pelo art. 56 da Lei 9.430/1996, dado que a LC 70/1991 é apenas formalmente complementar, mas materialmente ordinária com relação aos dispositivos concernentes à contribuição social por ela instituída.',
   0, 'vigente', null,
   'portal do STF (súmulas vinculantes)', date '2026-08-04', date '2025-01-09',
   'STF — Súmula Vinculante 62 (DJe de 09/01/2025).',
   'portal do STF', 'https://portal.stf.jus.br/jurisprudencia/sumariosumulas.asp', 'alta'),

  (63, 'vinculante',
   'O tráfico privilegiado (art. 33, § 4º, da Lei 11.343/2006) não configura crime hediondo, afastando-se a aplicação dos parâmetros mais rigorosos de progressão de regime e de livramento condicional.',
   0, 'vigente', null,
   'portal do STF (súmulas vinculantes)', date '2026-08-04', date '2025-10-22',
   'STF — Súmula Vinculante 63 (DJe de 22/10/2025).',
   'portal do STF', 'https://portal.stf.jus.br/jurisprudencia/sumariosumulas.asp', 'alta')

on conflict (tipo, numero) do update set
  enunciado            = excluded.enunciado,
  n_precedentes        = excluded.n_precedentes,
  situacao             = excluded.situacao,
  data_aprovacao       = excluded.data_aprovacao,
  situacao_fonte       = excluded.situacao_fonte,
  situacao_data        = excluded.situacao_data,
  enunciado_fonte_data = excluded.enunciado_fonte_data,
  fonte_documento      = excluded.fonte_documento,
  fonte_arquivo        = excluded.fonte_arquivo,
  fonte_url            = excluded.fonte_url,
  confianca            = excluded.confianca;
