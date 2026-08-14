-- Interruptor de busca externa, por escritório — 13/08/2026.
--
-- O Nível 2 do Verificador usa a ferramenta de busca da Anthropic quando as dez
-- bases canônicas não resolvem a citação. Essa busca é executada por
-- SUBPROCESSADORES da Anthropic — Brave Search e TurboPuffer, ambos nos EUA,
-- conforme a lista colhida em 13/08/2026 — e o texto da consulta chega a eles.
--
-- POR QUE RESTRINGIR DOMÍNIO NÃO RESOLVE. O `allowed_domains`, que já usamos e
-- limita a busca aos portais oficiais, filtra o que VOLTA — não o que SAI. A
-- consulta é enviada ao provedor de qualquer modo; só os resultados são
-- filtrados. Vale para o parâmetro por requisição e para a restrição no Console.
--
-- E a lista de subprocessadores pode mudar com aviso de 30 dias. Se amanhã for
-- acrescentado um terceiro provedor de busca, restrição de domínio não protege.
-- SÓ NÃO BUSCAR é robusto a mudança de cadeia; qualquer outra medida depende de
-- vigiar uma lista que muda por decisão de terceiro.
--
-- POR QUE POR ESCRITÓRIO, E NÃO GLOBAL. Desligar no Console da Anthropic vale
-- para a organização inteira e faz QUALQUER requisição que inclua a ferramenta
-- FALHAR com erro 400 — não degrada, quebra. Aqui a decisão é de quem responde
-- pelo sigilo, escritório a escritório, e o produto continua funcionando dos
-- dois modos.
--
-- O CUSTO É DE COBERTURA, e é menor do que parece: os 126 casos de teste
-- resolvem TODOS pelas dez bases, a custo zero de IA. A busca só entra para
-- acórdão fora delas — que, desligada, volta como IDENTIFICADO dizendo que não
-- foi conferido e por quê. É a disciplina de sempre: não confirmar em vez de
-- confirmar sem base.
--
-- PADRÃO LIGADO. Quem não escolher nada mantém o comportamento atual; desligar é
-- ato deliberado de quem sabe o que está trocando.
--
-- Aditiva. Reversível: alter table public.workspaces drop column busca_externa;

alter table public.workspaces
  add column if not exists busca_externa boolean not null default true;

comment on column public.workspaces.busca_externa is
  'Quando falso, o Verificador não usa a ferramenta de busca da Anthropic: a consulta sequer é formulada, e nada chega aos provedores de busca (subprocessadores dela). Citação fora das bases canônicas volta como IDENTIFICADO, para conferência manual.';
