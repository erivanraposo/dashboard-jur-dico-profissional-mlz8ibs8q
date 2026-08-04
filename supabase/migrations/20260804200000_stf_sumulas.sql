-- Base de Súmulas Vinculantes do STF — Nível 1 do Verificador.
--
-- Fecha a assimetria que apareceu no teste de 04/08: "Súmula 7 do STJ" devolvia o
-- enunciado oficial e "Súmula Vinculante 11" devolvia apenas IDENTIFICADO, porque
-- o STJ tinha base e o STF não.
--
-- Fonte: STF — "Súmulas Vinculantes: aplicação e interpretação pelo STF", 2ª ed.,
-- Secretaria de Documentação, 2017, atualizada até a SV 56. Extração determinística
-- (scripts/extrai_sumulas_stf.py): 56 súmulas, SV 1 a 56 sem lacunas, 472
-- precedentes representativos.
--
-- Base de REFERÊNCIA compartilhada, mesmo padrão de stj_teses e stf_julgados:
-- leitura por qualquer autenticado, escrita só por service_role.
-- Aditiva. Reversível: drop table public.stf_sumulas cascade;

create table if not exists public.stf_sumulas (
  id             uuid primary key default gen_random_uuid(),
  numero         int  not null,
  tipo           text not null default 'vinculante'
                 check (tipo in ('vinculante', 'comum')),
  enunciado      text not null,
  -- Guardamos a CONTAGEM de precedentes representativos, não a lista: o
  -- Verificador devolve o enunciado, e carregar 472 citações que ninguém lê
  -- inflaria a migration em 6x. Os precedentes estão no JSONL da extração,
  -- se um dia forem necessários.
  n_precedentes  int  not null default 0,
  fonte_documento text,
  fonte_arquivo  text,
  fonte_pagina   int,
  fonte_url      text,
  confianca      text not null default 'alta'
);

create unique index if not exists uq_stf_sumulas on public.stf_sumulas (tipo, numero);
create index if not exists idx_stf_sumulas_trgm
  on public.stf_sumulas using gin (enunciado gin_trgm_ops);

alter table public.stf_sumulas enable row level security;
drop policy if exists stf_sumulas_select on public.stf_sumulas;
create policy stf_sumulas_select on public.stf_sumulas for select
  to authenticated using (true);

comment on table public.stf_sumulas is
  'Súmulas Vinculantes do STF (1 a 56), da publicação oficial de 2017. Usada pelo Nível 1 do Verificador para devolver o ENUNCIADO em vez de apenas identificar o padrão da citação.';

delete from public.stf_sumulas where tipo = 'vinculante';

insert into public.stf_sumulas
  (numero, tipo, enunciado, n_precedentes,
   fonte_documento, fonte_arquivo, fonte_pagina, fonte_url, confianca)
values
  (1, 'vinculante', 'Ofende a garantia constitucional do ato jurídico perfeito a decisão que, sem ponderar as circunstâncias do caso concreto, desconsidera a validez e a eficácia de acordo constante de termo de adesão instituído pela Lei Complementar 110/2001.', 9, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 9, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (2, 'vinculante', 'É inconstitucional a lei ou ato normativo estadual ou distrital que disponha sobre sistemas de consórcios e sorteios, inclusive bingos e loterias.', 7, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 14, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (3, 'vinculante', 'Nos processos perante o Tribunal de Contas da União, asseguram-se o contraditório e a ampla defesa quando da decisão puder resultar anulação ou revogação de ato administrativo que beneficie o interessado, excetuada a apreciação da legalidade do ato de concessão inicial de aposentadoria, reforma e pensão.', 13, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 18, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (4, 'vinculante', 'Salvo nos casos previstos na Constituição, o salário mínimo não pode ser usado como indexador de base de cálculo de vantagem de servidor público ou de empregado, nem ser substituído por decisão judicial.', 14, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 26, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (5, 'vinculante', 'A falta de defesa técnica por advogado no processo administrativo disciplinar não ofende a Constituição.', 12, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 33, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (6, 'vinculante', 'Não viola a Constituição o estabelecimento de remuneração inferior ao salário mínimo para as praças prestadoras de serviço militar inicial.', 3, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 40, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (7, 'vinculante', 'A norma do § 3º do art. 192 da Constituição, revogada pela Emenda Constitucional 40/2003, que limitava a taxa de juros reais a 12% ao ano, tinha sua aplicação condicionada à edição de lei complementar.', 7, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 42, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (8, 'vinculante', 'São inconstitucionais o parágrafo único do art. 5º do Decreto-Lei 1.569/1977 e os arts. 45 e 46 da Lei 8.212/1991, que tratam de prescrição e decadência de crédito tributário.', 8, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 45, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (9, 'vinculante', 'O disposto no art. 127 da Lei 7.210/1984 (Lei de Execução Penal) foi recebido pela ordem constitucional vigente, e não se lhe aplica o limite temporal previsto no caput do art. 58.', 15, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 50, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (10, 'vinculante', 'Viola a cláusula de reserva de plenário (CF, art. 97) a decisão de órgão fracionário de Tribunal que, embora não declare expressamente a inconstitucionalidade de lei ou ato normativo do poder público, afasta sua incidência, no todo ou em parte.', 40, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 58, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (11, 'vinculante', 'Só é lícito o uso de algemas em casos de resistência e de fundado receio de fuga ou de perigo à integridade física própria ou alheia, por parte do preso ou de terceiros, justificada a excepcionalidade por escrito, sob pena de responsabilidade disciplinar, civil e penal do agente ou da autoridade e de nulidade da prisão ou do ato processual a que se refere, sem prejuízo da responsabilidade civil do Estado.', 13, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 74, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (12, 'vinculante', 'A cobrança de taxa de matrícula nas universidades públicas viola o disposto no art. 206, IV, da Constituição Federal.', 10, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 81, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (13, 'vinculante', 'A nomeação de cônjuge, companheiro ou parente em linha reta, colateral ou por afinidade, até o terceiro grau, inclusive, da autoridade nomeante ou de servidor da mesma pessoa jurídica investido em cargo de direção, chefia ou assessoramento, para o exercício de cargo em comissão ou de confiança ou, ainda, de função gratificada na administração pública direta e indireta em qualquer dos Poderes da União, dos Estados, do Distrito Federal e dos Municípios, compreendido o ajuste mediante designações recíprocas, viola a Constituição Federal.', 19, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 86, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (14, 'vinculante', 'É direito do defensor, no interesse do representado, ter acesso amplo aos elementos de prova que, já documentados em procedimento investigatório realizado por órgão com competência de polícia judiciária, digam respeito ao exercício do direito de defesa.', 19, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 96, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (15, 'vinculante', 'O cálculo de gratificações e outras vantagens do servidor público não incide sobre o abono utilizado para se atingir o salário mínimo.', 3, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 105, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (16, 'vinculante', 'Os arts. 7º, IV, e 39, § 3º (redação da EC 19/1998), da Constituição referem-se ao total da remuneração percebida pelo servidor público.', 6, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 107, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (17, 'vinculante', 'Durante o período previsto no § 1º do art. 100 da Constituição, não incidem juros de mora sobre os precatórios que nele sejam pagos.', 17, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 111, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (18, 'vinculante', 'A dissolução da sociedade ou do vínculo conjugal, no curso do mandato, não afasta a inelegibilidade prevista no § 7º do art. 14 da Constituição Federal.', 8, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 121, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (19, 'vinculante', 'A taxa cobrada exclusivamente em razão dos serviços públicos de coleta, remoção e tratamento ou destinação de lixo ou resíduos provenientes de imóveis não viola o art. 145, II, da Constituição Federal.', 6, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 125, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (20, 'vinculante', 'A Gratificação de Desempenho de Atividade Técnico-Administrativa (GDATA), instituída pela Lei 10.404/2002, deve ser deferida aos inativos nos valores correspondentes a 37,5 (trinta e sete vírgula cinco) pontos no período de fevereiro a maio de 2002 e, nos termos do art. 5º, parágrafo único, da Lei 10.404/2002, no período de junho de 2002 até a conclusão dos efeitos do último ciclo de avaliação a que se refere o art. 1º da Medida Provisória 198/2004, a partir da qual passa a ser de 60 (sessenta) pontos.', 14, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 129, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (21, 'vinculante', 'É inconstitucional a exigência de depósito ou arrolamento prévios de dinheiro ou bens para admissibilidade de recurso administrativo.', 9, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 136, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (22, 'vinculante', 'A Justiça do Trabalho é competente para processar e julgar as ações de indenização por danos morais e patrimoniais decorrentes de acidente de trabalho propostas por empregado contra empregador, inclusive aquelas que ainda não possuíam sentença de mérito em primeiro grau quando da promulgação da Emenda Constitucional 45/2004.', 10, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 141, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (23, 'vinculante', 'A Justiça do Trabalho é competente para processar e julgar ação possessória ajuizada em decorrência do exercício do direito de greve pelos trabalhadores da iniciativa privada.', 7, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 147, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (24, 'vinculante', 'Não se tipifica crime material contra a ordem tributária, previsto no art. 1º, incisos I a IV, da Lei 8.137/1990, antes do lançamento definitivo do tributo.', 20, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 151, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (25, 'vinculante', 'É ilícita a prisão civil de depositário infiel, qualquer que seja a modalidade do depósito.', 5, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 160, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (26, 'vinculante', 'Para efeito de progressão de regime no cumprimento de pena por crime hediondo, ou equiparado, o juízo da execução observará a inconstitucionalidade do art. 2º da Lei 8.072, de 25 de julho de 1990, sem prejuízo de avaliar se o condenado preenche, ou não, os requisitos objetivos e subjetivos do benefício, podendo determinar, para tal fim, de modo fundamentado, a realização de exame criminológico.', 10, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 164, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (27, 'vinculante', 'Compete à Justiça estadual julgar causas entre consumidor e concessionária de serviço público de telefonia, quando a Anatel não seja litisconsorte passiva necessária, assistente, nem opoente.', 3, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 172, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (28, 'vinculante', 'É inconstitucional a exigência de depósito prévio como requisito de admissibilidade de ação judicial na qual se pretenda discutir a exigibilidade de crédito tributário.', 3, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 175, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (29, 'vinculante', 'É constitucional a adoção, no cálculo do valor de taxa, de um ou mais elementos da base de cálculo própria de determinado imposto, desde que não haja integral identidade entre uma base e outra.', 7, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 177, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (30, 'vinculante', '(A Súmula Vinculante 30 está pendente de publicação.)', 0, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 181, 'http://www.stf.jus.br/sumulasvinculantes', 'media'),
  (31, 'vinculante', 'É inconstitucional a incidência do Imposto sobre Serviços de Qualquer Natureza — ISS sobre operações de locação de bens móveis.', 11, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 182, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (32, 'vinculante', 'O ICMS não incide sobre alienação de salvados de sinistro pelas seguradoras.', 3, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 188, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (33, 'vinculante', 'Aplicam-se ao servidor público, no que couber, as regras do regime geral da previdência social sobre aposentadoria especial de que trata o art. 40, § 4º, inciso III, da Constituição Federal, até a edição de lei complementar específica.', 25, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 191, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (34, 'vinculante', 'A Gratificação de Desempenho de Atividade de Seguridade Social e do Trabalho (GDASST), instituída pela Lei 10.483/2002, deve ser estendida aos inativos no valor correspondente a 60 (sessenta) pontos, desde o advento da Medida Provisória 198/2004, convertida na Lei 10.971/2004, quando tais inativos façam jus à paridade constitucional (EC 20/1998, 41/2003 e 47/2005).', 3, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 203, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (35, 'vinculante', 'A homologação da transação penal prevista no art. 76 da Lei 9.099/1995 não faz coisa julgada material e, descumpridas suas cláusulas, retoma-se a situação anterior, possibilitando-se ao Ministério Público a continuidade da persecução penal mediante oferecimento de denúncia ou requisição de inquérito policial.', 3, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 206, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (36, 'vinculante', 'Compete à Justiça Federal comum processar e julgar civil denunciado pelos crimes de falsificação e de uso de documento falso quando se tratar de falsificação da Caderneta de Inscrição e Registro (CIR) ou de Carteira de Habilitação de Amador (CHA), ainda que expedidas pela Marinha do Brasil.', 2, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 210, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (37, 'vinculante', 'Não cabe ao Poder Judiciário, que não tem função legislativa, aumentar vencimentos de servidores públicos sob o fundamento de isonomia.', 15, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 212, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (38, 'vinculante', 'É competente o Município para fixar o horário de funcionamento de estabelecimento comercial.', 6, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 220, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (39, 'vinculante', 'Compete privativamente à União legislar sobre vencimentos dos membros das polícias civil e militar e do corpo de bombeiros militar do Distrito Federal.', 3, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 224, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (40, 'vinculante', 'A contribuição confederativa de que trata o art. 8º, IV, da Constituição Federal só é exigível dos filiados ao sindicato respectivo.', 3, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 227, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (41, 'vinculante', 'O serviço de iluminação pública não pode ser remunerado mediante taxa.', 6, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 230, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (42, 'vinculante', 'É inconstitucional a vinculação do reajuste de vencimentos de servidores estaduais ou municipais a índices federais de correção monetária.', 4, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 235, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (43, 'vinculante', 'É inconstitucional toda modalidade de provimento que propicie ao servidor investir-se, sem prévia aprovação em concurso público destinado ao seu provimento, em cargo que não integra a carreira na qual anteriormente investido.', 10, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 238, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (44, 'vinculante', 'Só por lei se pode sujeitar a exame psicotécnico a habilitação de candidato a cargo público.', 6, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 245, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (45, 'vinculante', 'A competência constitucional do Tribunal do Júri prevalece sobre o foro por prerrogativa de função estabelecido exclusivamente pela constituição estadual.', 3, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 250, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (46, 'vinculante', 'A definição dos crimes de responsabilidade e o estabelecimento das respectivas normas de processo e julgamento são da competência legislativa privativa da União.', 5, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 253, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (47, 'vinculante', 'Os honorários advocatícios incluídos na condenação ou destacados do montante principal devido ao credor consubstanciam verba de natureza alimentar cuja satisfação ocorrerá com a expedição de precatório ou requisição de pequeno valor, observada ordem especial restrita aos créditos dessa natureza.', 11, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 257, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (48, 'vinculante', 'Na entrada de mercadoria importada do exterior, é legítima a cobrança do ICMS por ocasião do desembaraço aduaneiro.', 3, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 264, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (49, 'vinculante', 'Ofende o princípio da livre concorrência lei municipal que impede a instalação de estabelecimentos comerciais do mesmo ramo em determinada área.', 3, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 267, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (50, 'vinculante', 'Norma legal que altera o prazo de recolhimento de obrigação tributária não se sujeita ao princípio da anterioridade.', 2, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 270, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (51, 'vinculante', 'O reajuste de 28,86%, concedido aos servidores militares pelas Leis 8.622/ 1993 e 8.627/1993, estende-se aos servidores civis do Poder Executivo, observadas as eventuais compensações decorrentes dos reajustes diferenciados concedidos pelos mesmos diplomas legais.', 3, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 273, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (52, 'vinculante', 'Ainda quando alugado a terceiros, permanece imune ao IPTU o imóvel pertencente a qualquer das entidades referidas pelo art. 150, VI, c, da Constituição Federal, desde que o valor dos aluguéis seja aplicado nas atividades para as quais tais entidades foram constituídas.', 8, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 278, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (53, 'vinculante', 'A competência da Justiça do Trabalho prevista no art. 114, VIII, da Constituição Federal alcança a execução de ofício das contribuições previdenciárias relativas ao objeto da condenação constante das sentenças que proferir e acordos por ela homologados.', 4, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 283, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (54, 'vinculante', 'A medida provisória não apreciada pelo Congresso Nacional podia, até a Emenda Constitucional 32/2001, ser reeditada dentro do seu prazo de eficácia de trinta dias, mantidos os efeitos de lei desde a primeira edição.', 6, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 287, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (55, 'vinculante', 'O direito ao auxílio-alimentação não se estende aos servidores inativos.', 3, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 291, 'http://www.stf.jus.br/sumulasvinculantes', 'alta'),
  (56, 'vinculante', 'A falta de estabelecimento penal adequado não autoriza a manutenção do condenado em regime prisional mais gravoso, devendo-se observar, nessa hipótese, os parâmetros fixados no RE 641.320/RS.', 4, 'STF — Súmulas Vinculantes: aplicação e interpretação pelo STF', 'Sumulas Vinculantes e interpretação STF- 2a edicao.pdf', 294, 'http://www.stf.jus.br/sumulasvinculantes', 'alta');

-- RPC do Nível 1, espelhando stj_sumula: enunciado + similaridade contra a tese
-- alegada. Enunciado de súmula é texto CURTO, FECHADO E AUTORITATIVO — por isso a
-- comparação lexical é confiável aqui, ao contrário do recorte de coletânea.
create or replace function public.stf_sumula(
  p_numero int, p_vinculante boolean default true, p_tese text default null
)
returns table (
  numero int, tipo text, enunciado text, n_precedentes int,
  fonte_arquivo text, fonte_pagina int, fonte_url text, sim real
) language sql stable security definer set search_path = public as $$
  select s.numero, s.tipo, s.enunciado, s.n_precedentes,
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
