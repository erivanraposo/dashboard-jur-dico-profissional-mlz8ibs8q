import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ============================================================================
// VERIFY-PRECEDENT — Verificador de Precedentes, Fase 1
//
// O advogado cola citações que JÁ TEM (de peça da parte contrária, de minuta de
// estagiário, de outra IA, da própria peça antes do protocolo) e o sistema
// atesta se existem e se dizem o que se afirma. É o inverso da alucinação.
//
// NÃO estende a analyze-legal-text de propósito: aquela função tem 98 versões
// em produção e é o caminho crítico do produto. Função nova, risco isolado.
//
// Quatro estados, nunca um "verificado" binário:
//   CONFIRMADO_INTEIRO_TEOR  conteúdo lido na fonte oficial e a tese confere
//   CONFIRMADO_METADADOS     o processo existe no portal; inteiro teor inacessível
//   DIVERGENTE               existe, mas não decide o que a citação afirma
//   NAO_LOCALIZADO           não encontrado nos portais consultados (≠ inexistente)
//
// Regras de produto (spec de 30/07/2026):
//   - nenhum precedente é exibido sem URL de fonte oficial;
//   - súmulas, súmulas vinculantes e temas resolvem por REGEX DETERMINÍSTICO,
//     sem custo de IA (mesmas regras da analyze-legal-text);
//   - o sistema atesta existência e teor; NÃO opina sobre aplicabilidade ao caso;
//   - ausência nos portais consultados não é prova de inexistência.
//
// Payload: { texto: string, tese?: string }
// Retorno: { status:'ok', itens: Item[], consumo_hoje, teto_diario, custo_usd }
// ============================================================================

// Teto por escritório por dia. Baixado de 40 para 10 em 31/07/2026: a medição real
// deu ~US$ 0,35 por verificação, então 40/dia custaria ~US$ 14/dia por escritório —
// mais de 9x o ciclo completo de análise, que é o produto principal (~US$ 1,46).
// Número provisório, a revisar quando o conjunto de teste fechar o custo com
// max_uses=5. Ver lexaxis_custo_real_por_analise_2026-07-27.md.
const TETO_DIARIO = 10
const MAX_CITACOES = 10 // por requisição
const MODELO = 'claude-sonnet-5'

const DOMINIOS_OFICIAIS = ['jus.br', 'gov.br', 'leg.br', 'in.gov.br', 'lexml.gov.br']

// Preços por milhão de tokens (Sonnet 5). Cache: leitura 0,1x e gravação 1,25x —
// ignorar isso foi o bug de medição achado em 27/07 no painel de custos.
const PRECO = { input: 3.0, output: 15.0, cache_read: 0.3, cache_write: 3.75 }

type Estado =
  | 'CONFIRMADO_INTEIRO_TEOR'
  | 'CONFIRMADO_METADADOS'
  | 'CONFIRMADO_REPOSITORIO' // conferido no LexML, não no portal do tribunal
  | 'CONFIRMADO_BASE_STJ' // conferido na Jurisprudência em Teses do STJ (compilação oficial)
  | 'CONFIRMADO_BASE_STF' // metadados conferidos na Coletânea Temática do STF (só metadados)
  | 'DIVERGENTE'
  | 'NAO_LOCALIZADO'
  | 'IDENTIFICADO' // reconhecido por padrão, sem consulta a fonte alguma

// Repositório oficial do governo (Rede de Informação Legislativa e Jurídica).
// Não é o tribunal, mas também não é terceiro: é fonte pública oficial, e —
// diferentemente dos portais do STF e do STJ — legível por máquina. Sustenta
// confirmação num grau PRÓPRIO, que diz de onde veio (decisão de 31/07/2026,
// depois de constatar que os portais dos tribunais superiores só entregam
// formulário de busca a acesso automatizado).
const HOST_REPOSITORIO = 'lexml.gov.br'

interface Item {
  citacao: string
  tipo: 'sumula' | 'sumula_vinculante' | 'tema' | 'acordao'
  tribunal: string | null
  estado: Estado
  url_oficial: string | null
  url_busca: string | null // busca no portal do tribunal, sempre presente
  url_lexml: string | null // segunda via estável
  o_que_decide: string | null
  observacao: string | null
  campos_conferidos?: string[] // metadados que a fonte confirmou
  campos_nao_conferidos?: string[] // afirmados na citação e NÃO vistos na fonte
  resolucao: 'deterministica' | 'busca' | 'base_stj' | 'base_stf'
}

// Host EXIGIDO por tribunal. Correção de 30/07/2026: validar só "domínio oficial"
// deixou passar um acórdão do TRF3 como fonte de um HC do STF — link oficial,
// porém do tribunal errado. Fonte de outro tribunal que apenas MENCIONA o julgado
// não é fonte do julgado.
const HOST_DO_TRIBUNAL: Record<string, string> = {
  STF: 'stf.jus.br',
  STJ: 'stj.jus.br',
  TST: 'tst.jus.br',
  TSE: 'tse.jus.br',
  STM: 'stm.jus.br',
}

// Buscas por parâmetro — estáveis. Deep links para .asp legado do STF apodrecem
// (duas URLs de súmula usadas em produção respondiam 404 em 30/07/2026).
function urlBusca(tribunal: string | null, termo: string): string | null {
  const q = encodeURIComponent(termo.slice(0, 120))
  if (tribunal === 'STF') return `https://jurisprudencia.stf.jus.br/pages/search?base=acordaos&pesquisa_inicial=${q}`
  if (tribunal === 'STJ') return `https://scon.stj.jus.br/SCON/pesquisar.jsp?b=ACOR&livre=${q}`
  if (tribunal === 'TST') return `https://jurisprudencia.tst.jus.br/#/pesquisa?query=${q}`
  return null
}

const urlLexml = (termo: string) =>
  `https://www.lexml.gov.br/busca/search?keyword=${encodeURIComponent(termo.slice(0, 120))}`

// ---------------------------------------------------------------------------
// 1. RESOLUÇÃO DETERMINÍSTICA — súmulas e temas têm URL previsível.
//    Custo de IA: zero. Mesmas regras já em produção na analyze-legal-text.
// ---------------------------------------------------------------------------
function resolveDeterministico(texto: string): { itens: Item[]; resto: string } {
  const itens: Item[] = []
  let resto = texto

  const consome = (re: RegExp, fn: (m: RegExpMatchArray) => Item | null) => {
    resto = resto.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpMatchArray
      const item = fn(m)
      if (item) {
        itens.push(item)
        return ' ' // remove do texto que irá para a busca
      }
      return m[0]
    })
  }

  // Súmula vinculante do STF — sem deep link: o .asp legado não resolve por número
  // (menuSumario.asp?sumula=N devolve a página genérica de súmulas, 404 no navegador).
  consome(/\bs[úu]mula\s+vinculante\s+(?:n[ºo.]?\s*)?(\d+)(?:\s+d[oe]\s+stf)?\b/gi, (m) => ({
    citacao: m[0].trim(),
    tipo: 'sumula_vinculante',
    tribunal: 'STF',
    estado: 'IDENTIFICADO',
    url_oficial: null,
    url_busca: `https://jurisprudencia.stf.jus.br/pages/search?base=sumulas&pesquisa_inicial=${encodeURIComponent(
      `sumula vinculante ${m[1]}`,
    )}`,
    url_lexml: urlLexml(`súmula vinculante ${m[1]}`),
    o_que_decide: null,
    observacao:
      'Enunciado identificado sem consulta de IA. O sistema NÃO leu o texto da súmula — abra a busca oficial do STF para conferir o teor.',
    resolucao: 'deterministica',
  }))

  // Súmula do STF / STJ
  consome(/\bs[úu]mula\s+(?:n[ºo.]?\s*)?(\d+)\s+d[oe]\s+(stf|stj)\b/gi, (m) => {
    const trib = m[2].toUpperCase()
    return {
      citacao: m[0].trim(),
      tipo: 'sumula',
      tribunal: trib,
      estado: 'IDENTIFICADO',
      url_oficial: null,
      url_busca:
        trib === 'STJ'
          ? `https://scon.stj.jus.br/SCON/sumanot/toc.jsp?sumano=${m[1]}`
          : `https://jurisprudencia.stf.jus.br/pages/search?base=sumulas&pesquisa_inicial=${encodeURIComponent(
              `sumula ${m[1]}`,
            )}`,
      url_lexml: urlLexml(`súmula ${m[1]} ${trib}`),
      o_que_decide: null,
      observacao: `Enunciado identificado sem consulta de IA. O sistema NÃO leu o texto — confira o teor no portal do ${trib}.`,
      resolucao: 'deterministica',
    }
  })

  // Tema de repercussão geral (STF) ou repetitivo (STJ) — deep links verificados
  // (respondiam 200 em 30/07/2026).
  consome(/\btema\s+(?:n[ºo.]?\s*)?([\d.]+)\s+d[oe]\s+(stf|stj)\b/gi, (m) => {
    const num = m[1].replace(/\./g, '')
    const trib = m[2].toUpperCase()
    return {
      citacao: m[0].trim(),
      tipo: 'tema',
      tribunal: trib,
      estado: 'IDENTIFICADO',
      url_oficial:
        trib === 'STJ'
          ? `https://processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp?numero=${num}`
          : `https://portal.stf.jus.br/jurisprudenciaRepercussao/tema.asp?num=${num}`,
      url_busca: null,
      url_lexml: urlLexml(`tema ${num} ${trib}`),
      o_que_decide: null,
      observacao: `Tema identificado sem consulta de IA. O sistema NÃO leu a tese firmada — confira na página do ${trib}.`,
      resolucao: 'deterministica',
    }
  })

  return { itens, resto }
}

// ---------------------------------------------------------------------------
// 2. VERIFICAÇÃO POR BUSCA — acórdãos, restrita a domínios oficiais
// ---------------------------------------------------------------------------
const SYSTEM = `Você verifica citações de jurisprudência brasileira contra fontes oficiais. Não redige peças, não opina sobre estratégia.

FERRAMENTA: você tem busca web restrita a domínios oficiais (${DOMINIOS_OFICIAIS.join(', ')}). Use-a. Não responda de memória — memória de modelo é exatamente o que produz citação inventada.

Para CADA citação recebida, devolva um objeto com:
- "citacao": a citação como o usuário a escreveu
- "tribunal": a sigla do tribunal a que a citação se refere (STF, STJ, TST, TSE, STM...). Deduza pela classe processual, pelo ministro citado ou pelo contexto. null se não der para saber.
- "estado": um de
  * CONFIRMADO_INTEIRO_TEOR — você localizou o julgado em fonte oficial E leu conteúdo suficiente para dizer o que ele decide
  * CONFIRMADO_METADADOS — no portal do próprio tribunal, número/classe/órgão/data batem, mas o inteiro teor não estava acessível
  * CONFIRMADO_REPOSITORIO — você não alcançou o portal do tribunal, mas encontrou o registro no **LexML** (lexml.gov.br), repositório oficial do governo. Use este estado sempre que a confirmação vier de lá
  * DIVERGENTE — o julgado existe, porém algum dado da citação não confere (relator, data, órgão, classe) OU ele não decide o que a tese alegada afirma
  * NAO_LOCALIZADO — não encontrado nos portais consultados
- "url_oficial": URL **no domínio do próprio tribunal citado** (citação do STF ⇒ endereço em stf.jus.br; do STJ ⇒ stj.jus.br). OBRIGATÓRIA apenas para os dois estados CONFIRMADO_*. **DIVERGENTE NÃO exige URL**: apontar que um dado está errado se sustenta em indício, e não ter o documento em mãos jamais é motivo para rebaixar uma divergência a NAO_LOCALIZADO. Nunca invente endereço, e nunca ofereça como fonte a decisão de OUTRO tribunal que apenas menciona o julgado: um acórdão de TRF ou de TJ que cita um HC do STF não é fonte daquele HC. Se você só encontrou menção em outro tribunal, o estado é NAO_LOCALIZADO e você diz isso na observação.
- "observado": objeto com os metadados que você EFETIVAMENTE VIU na fonte oficial, tal como lá aparecem — {"classe": "...", "numero": "...", "relator": "...", "redator": "...", "orgao": "...", "data": "AAAA-MM-DD"}. Use **null** em todo campo que você não viu. Não deduza, não repita o que o advogado escreveu, não complete pelo que parece provável: este objeto é o registro do que a FONTE diz, e o sistema compara sozinho com a citação apresentada. Preencher por dedução aqui produz confirmação falsa.
- "o_que_decide": em uma ou duas frases, o que o julgado efetivamente decide, conforme a fonte lida. null se não leu.
- "observacao": o que exatamente diverge, ou o que não foi possível conferir. Seja específico: "o relator é o min. X, não o min. Y" vale; "dados divergentes" não vale.

HIERARQUIA DAS FONTES — três degraus, e o estado muda conforme o degrau alcançado
1. **Portal do próprio tribunal** (stf.jus.br, stj.jus.br...): o melhor. Rende CONFIRMADO_INTEIRO_TEOR ou CONFIRMADO_METADADOS. Aviso prático: os portais do STF e do STJ são aplicações JavaScript e costumam devolver só o formulário de busca — se foi isso que você recebeu, você NÃO alcançou o documento.
2. **LexML** (lexml.gov.br): repositório oficial do governo. Rende CONFIRMADO_REPOSITORIO. Tente-o sempre que o portal do tribunal não entregar o registro — é legível e frequentemente traz a ficha do julgado.
3. **Qualquer outra coisa** (acórdão de outro tribunal citando o julgado, notícia, repositório particular): não confirma nada. Ver a assimetria abaixo.

ASSIMETRIA DA PROVA — leia com atenção, é a regra que mais erra
Fonte SECUNDÁRIA é o degrau 3: acórdão de TRF ou de TJ que menciona um julgado do STF, repositório particular, notícia, artigo.

- Fonte secundária **NUNCA** sustenta confirmação, nem de metadados. Se você só encontrou menções em decisões de outros tribunais, o estado é NAO_LOCALIZADO, ainda que dez fontes repitam os mesmos dados. Repetição não é verificação: todas podem descender da mesma citação errada.
- Fonte secundária **PODE** sustentar DIVERGENTE quando **contradiz** a citação apresentada. Evidência de discrepância é alerta útil ao advogado; evidência de existência vinda de terceiro não é prova. Nesse caso diga na observação que o indício é de fonte secundária e precisa ser conferido no portal do tribunal.

Em resumo: para confirmar, a fonte tem de ser do próprio tribunal. Para levantar suspeita, não.

Consequência prática que você costuma errar: se as fontes secundárias trazem, de forma consistente, um dado DIFERENTE do que o advogado escreveu — outro relator, outra data, outro órgão —, o estado é **DIVERGENTE**, não NAO_LOCALIZADO. Nomeie o dado divergente na observação ("as fontes indicam rel. min. X, não Y"). Escolher NAO_LOCALIZADO nesse caso esconde do advogado justamente o que ele precisa saber, e é falha grave. NAO_LOCALIZADO é para quando você não achou nada, não para quando achou algo que contradiz.

REGRAS INEGOCIÁVEIS
1. NAO_LOCALIZADO significa "não encontrei nos portais consultados", NUNCA "não existe" e NUNCA "é falso". Diga isso na observação.
2. Se a tese alegada pelo usuário não corresponder ao que o julgado decide, o estado é DIVERGENTE mesmo que todos os metadados estejam corretos. Esse é o caso mais importante: aponte a diferença explicitamente.
2-A. **Não confundir "não consegui confirmar" com "está errado".** DIVERGENTE exige evidência POSITIVA de contradição — você viu o dado certo e ele é outro, ou leu o que o julgado decide e não é aquilo. Se os metadados que você conseguiu ver conferem e apenas o teor ficou inacessível, o estado é CONFIRMADO_METADADOS (ou CONFIRMADO_REPOSITORIO), com a observação dizendo que a tese não pôde ser conferida. Marcar divergência por falta de informação faz o advogado descartar citação boa — erro tão grave quanto confirmar citação ruim, e mais frequente.
3. Não avalie se o precedente serve ao caso do usuário. Isso é juízo do advogado.
4. Na dúvida entre CONFIRMADO_INTEIRO_TEOR e CONFIRMADO_METADADOS, escolha o segundo. Superestimar o grau de confirmação é o pior erro possível aqui.
5. Não prometa resultado nem opine sobre chance de êxito.
6. Página de BUSCA não é documento. Se o que você tem é um endereço de pesquisa (pages/search, pesquisar.jsp, ?queryString=), isso não é a fonte do julgado — deixe "url_oficial" nula e explique que não alcançou o documento. O sistema já oferece o link de busca por conta própria.

Responda SOMENTE com JSON válido: {"itens":[...]}. Sem markdown, sem comentário.`

// Uma tentativa. O laço com retentativa fica em verificaPorBusca.
async function chamaModelo(
  userMsg: string,
  anthropicKey: string,
): Promise<{ itens: Item[]; uso: any }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 4000,
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          // 8 -> 5 em 31/07/2026. Medição das 13 primeiras verificações: 70k tokens
          // de GRAVAÇÃO de cache por chamada (3,75/M) = 75% do custo de US$ 0,35.
          // Não é o system prompt (~2,5k) — é o conteúdo das buscas, reescrito no
          // cache a cada volta do laço interno. Cortar buscas é a alavanca real.
          max_uses: 5,
          allowed_callers: ['direct'],
          allowed_domains: DOMINIOS_OFICIAIS,
        },
      ],
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMsg }],
    }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Anthropic HTTP ${res.status}: ${txt.slice(0, 400)}`)
  }
  const data = await res.json()
  const texto = (data.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')

  let itens: Item[] = []
  try {
    const bruto = texto.replace(/^```(?:json)?/gm, '').replace(/```$/gm, '').trim()
    const ini = bruto.indexOf('{')
    const fim = bruto.lastIndexOf('}')
    const obj = JSON.parse(bruto.slice(ini, fim + 1))
    itens = (obj.itens ?? []).map((i: any) => normaliza(i))
  } catch (_e) {
    throw new Error('Resposta do modelo não veio em JSON utilizável.')
  }
  return { itens, uso: data.usage ?? {} }
}

// 3 de 57 chamadas do conjunto de teste (5%) falharam com JSON quebrado — o modelo
// às vezes encerra a resposta em prosa depois de usar a ferramenta de busca. Uma
// retentativa com instrução mais dura resolve sem custo relevante, porque só ocorre
// na fração que falhou.
async function verificaPorBusca(
  citacoesTexto: string,
  tese: string,
  anthropicKey: string,
): Promise<{ itens: Item[]; uso: any }> {
  const base = [
    `CITAÇÕES A VERIFICAR (texto colado pelo advogado):\n${citacoesTexto}`,
    tese
      ? `\nTESE QUE O ADVOGADO AFIRMA que esses julgados sustentam:\n"${tese}"\n\nConfira se cada julgado efetivamente sustenta isso. Se ele NÃO sustentar — e você tiver visto o que ele decide —, o estado é DIVERGENTE. Se apenas não conseguiu ler o teor, não é divergência: confirme os metadados e diga que a tese não pôde ser conferida.`
      : '\nO advogado não informou a tese. Confira existência e metadados, e descreva em "o_que_decide" o que cada julgado decide.',
  ].join('\n')

  try {
    return await chamaModelo(base, anthropicKey)
  } catch (err: any) {
    if (!String(err?.message ?? '').includes('JSON')) throw err
    console.warn('[verify-precedent] JSON quebrado; uma retentativa')
    return await chamaModelo(
      base +
        '\n\nATENÇÃO: sua resposta anterior não veio em JSON. Responda AGORA exclusivamente com o objeto JSON {"itens":[...]}, sem uma palavra antes ou depois, sem cerca de código.',
      anthropicKey,
    )
  }
}

// Regras de produto aplicadas NO SERVIDOR, nunca confiadas ao modelo:
//   (a) sem URL oficial, nenhum estado de confirmação sobrevive;
//   (b) a URL tem de ser do TRIBUNAL CITADO — domínio oficial não basta.
// (b) nasceu da falha de 30/07/2026: o modelo devolveu um acórdão do TRF3 como
// fonte de um HC do STF. Link oficial, tribunal errado, selo de confirmado.
// ---------------------------------------------------------------------------
// COMPARAÇÃO DETERMINÍSTICA DE METADADOS
// Comparar strings é trabalho de código, e eu havia deixado com o modelo. Na
// rodada 2 do conjunto de teste isso custou um FALSO CONFIRMADO: a distorção
// era o órgão julgador, o modelo não conferiu esse campo e confirmou o resto.
// Agora o modelo apenas RELATA o que viu; quem julga igualdade é o servidor.
// ---------------------------------------------------------------------------
const CLASSES_RE =
  /\b(ADI|ADPF|ADC|ADO|RHC|RMS|RvC|RE|ARE|AI|HC|MS|MI|Rcl|ACO|AO|Pet|Rp|SS|STA|SL|AC|Inq|AP|Ext|PPE|EP|CC|AR|SE|IF)\s+([\d.]+)/i

function normaliza2(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\b(MIN|MINISTR[OA]|REL|RELATOR[A]?|DES|DR)\b\.?/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim()
}

function mesmoNome(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return true // sem dado dos dois lados: nada a comparar
  const x = normaliza2(a)
  const y = normaliza2(b)
  if (!x || !y) return true
  return x === y || x.includes(y) || y.includes(x)
}

// Classe vem ora como sigla ("HC"), ora por extenso ("Habeas Corpus"). Comparar
// as duas formas como strings produziu falso divergente em 03/08: relator, data e
// órgão conferiam, e o confronto reprovou por "HC" ≠ "Habeas Corpus".
const CLASSE_CANONICA: Record<string, string> = {
  HC: 'HC', HABEASCORPUS: 'HC',
  RHC: 'RHC', RECURSOEMHABEASCORPUS: 'RHC', RECURSOORDINARIOEMHABEASCORPUS: 'RHC',
  RE: 'RE', RECURSOEXTRAORDINARIO: 'RE',
  ARE: 'ARE', AGRAVOEMRECURSOEXTRAORDINARIO: 'ARE',
  AI: 'AI', AGRAVODEINSTRUMENTO: 'AI',
  ADI: 'ADI', ACAODIRETADEINCONSTITUCIONALIDADE: 'ADI', ADIN: 'ADI',
  ADPF: 'ADPF', ARGUICAODEDESCUMPRIMENTODEPRECEITOFUNDAMENTAL: 'ADPF',
  ADC: 'ADC', ACAODECLARATORIADECONSTITUCIONALIDADE: 'ADC',
  ADO: 'ADO', MS: 'MS', MANDADODESEGURANCA: 'MS',
  MI: 'MI', MANDADODEINJUNCAO: 'MI',
  RCL: 'RCL', RECLAMACAO: 'RCL',
  INQ: 'INQ', INQUERITO: 'INQ',
  AP: 'AP', ACAOPENAL: 'AP',
  EXT: 'EXT', EXTRADICAO: 'EXT',
  PET: 'PET', PETICAO: 'PET',
  RVC: 'RVC', REVISAOCRIMINAL: 'RVC',
  EP: 'EP', EXECUCAOPENAL: 'EP',
  ACO: 'ACO', AO: 'AO', AC: 'AC', AR: 'AR', CC: 'CC',
  RESP: 'RESP', RECURSOESPECIAL: 'RESP',
  ARESP: 'ARESP', AGRAVOEMRECURSOESPECIAL: 'ARESP',
  RMS: 'RMS', RECURSOEMMANDADODESEGURANCA: 'RMS',
}

function canonClasse(s?: string | null): string | null {
  if (!s) return null
  const t = normaliza2(s)
  return CLASSE_CANONICA[t] ?? null // desconhecida: não canoniza, e o confronto se abstém
}

function normOrgao(s?: string | null): string | null {
  if (!s) return null
  const t = normaliza2(s)
  if (/PLENARIO|TRIBUNALPLENO|^P$/.test(t)) return 'PLENARIO'
  if (/(1|PRIMEIRA)(A|Â)?T/.test(t)) return '1T'
  if (/(2|SEGUNDA)(A|Â)?T/.test(t)) return '2T'
  if (/MONOCRAT/.test(t)) return 'MONO'
  if (/CORTEESPECIAL/.test(t)) return 'CE'
  return t || null
}

/** Lê a citação como o advogado a escreveu. */
function parseCitacao(c: string) {
  const out: Record<string, string | null> = {
    classe: null, numero: null, relator: null, redator: null, orgao: null, data: null,
  }
  const m = c.match(CLASSES_RE)
  if (m) {
    out.classe = m[1].toUpperCase()
    out.numero = m[2].replace(/\./g, '')
  }
  const red = c.match(/rel\.?\s*p\/\s*o\s*ac\.?\s*(?:min\.?)?\s*([^,\]]+)/i) ||
    c.match(/red\.?\s*d[oa]\s*ac\.?\s*(?:min\.?)?\s*([^,\]]+)/i)
  if (red) out.redator = red[1].trim()
  else {
    const rel = c.match(/\brel\b\.?\s*(?:min\.?)?\s*([^,\]]+)/i)
    if (rel) out.relator = rel[1].trim()
  }
  const d = c.match(/\bj\.\s*(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (d) out.data = `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`
  const org = c.match(/(plen[áa]rio|1[ªa]\s*turma|2[ªa]\s*turma|corte especial|decis[ãa]o monocr[áa]tica)/i)
  if (org) out.orgao = org[1]
  return out
}

/** Confronta o que o advogado afirmou com o que a fonte mostrou. */
function confronta(citado: Record<string, string | null>, obs: any) {
  const divergencias: string[] = []
  const naoConferidos: string[] = []
  const conferidos: string[] = []
  const campos: Array<[string, string, (a: any, b: any) => boolean]> = [
    ['relator', 'relator', mesmoNome],
    ['redator', 'redator do acórdão', mesmoNome],
    ['data', 'data de julgamento', (a, b) => !a || !b || a === b],
    ['orgao', 'órgão julgador', (a, b) => !a || !b || normOrgao(a) === normOrgao(b)],
    // Só acusa divergência de classe quando as DUAS formas são reconhecidas e
    // canonizam em coisas diferentes. Sigla desconhecida ⇒ abstém-se, nunca
    // reprova por não entender a grafia.
    [
      'classe',
      'classe processual',
      (a, b) => {
        const x = canonClasse(a)
        const y = canonClasse(b)
        return !x || !y || x === y
      },
    ],
  ]
  for (const [k, rotulo, iguais] of campos) {
    const afirmado = citado[k]
    const visto = obs && typeof obs[k] === 'string' && obs[k].trim() ? obs[k].trim() : null
    if (!afirmado) continue
    if (!visto) {
      naoConferidos.push(rotulo)
      continue
    }
    if (iguais(afirmado, visto)) conferidos.push(rotulo)
    else divergencias.push(`${rotulo}: a citação diz "${afirmado}", a fonte registra "${visto}"`)
  }
  return { divergencias, naoConferidos, conferidos }
}

function hostDe(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function normaliza(i: any): Item {
  const citacao = String(i.citacao ?? '').slice(0, 300)
  const tribunal =
    typeof i.tribunal === 'string' && i.tribunal.trim() ? i.tribunal.trim().toUpperCase() : null
  const bruta =
    typeof i.url_oficial === 'string' && /^https?:\/\//i.test(i.url_oficial) ? i.url_oficial : null
  const host = bruta ? hostDe(bruta) : null

  const emDominioOficial = !!host && DOMINIOS_OFICIAIS.some((d) => host.endsWith(d))
  const exigido = tribunal ? HOST_DO_TRIBUNAL[tribunal] : undefined
  const doTribunalCerto = !exigido || (!!host && host.endsWith(exigido))
  // Página de busca não é documento. O modelo devolveu, em 30/07, uma URL de
  // pesquisa do STF como se fosse a fonte do acórdão — passava no teste de host
  // e sustentava um selo de confirmado sem documento nenhum por trás.
  const ehBusca =
    !!bruta && /(pages\/search|pesquisar\.jsp|\?queryString=|\bbusca\b|search\?)/i.test(bruta)

  const noRepositorio = !!host && host.endsWith(HOST_REPOSITORIO)

  let estado: Estado = [
    'CONFIRMADO_INTEIRO_TEOR',
    'CONFIRMADO_METADADOS',
    'CONFIRMADO_REPOSITORIO',
    'DIVERGENTE',
  ].includes(i.estado)
    ? i.estado
    : 'NAO_LOCALIZADO'
  let observacao: string | null = i.observacao ?? null
  let url: string | null = emDominioOficial && !ehBusca ? bruta : null

  // A ressalva do servidor ACRESCENTA, nunca substitui a análise do modelo.
  // Em 30/07 o rebaixamento sobrescreveu a observação e apagou justamente o achado
  // útil ("o relator é Luiz Fux, não Marco Aurélio") — o advogado ficou com um
  // aviso genérico no lugar da informação que importava.
  const ressalva = (txt: string) => {
    observacao = observacao ? `${txt}\n\nO que o sistema apurou: ${observacao}` : txt
  }

  // Confronto determinístico: o modelo relatou o que viu, o servidor julga.
  const cotejo = confronta(parseCitacao(citacao), i.observado)

  const montar = (): Item => ({
    citacao,
    tipo: 'acordao',
    tribunal,
    estado,
    url_oficial: url,
    url_busca: urlBusca(tribunal, citacao),
    url_lexml: urlLexml(citacao),
    o_que_decide: i.o_que_decide ?? null,
    observacao,
    campos_conferidos: cotejo.conferidos,
    campos_nao_conferidos: cotejo.naoConferidos,
    resolucao: 'busca',
  })

  // Divergência de metadado é fato, não opinião: se a fonte mostrou dado diferente
  // do que a citação afirma, é DIVERGENTE — e o servidor decide isso, não o modelo.
  // Só ELEVA para divergente; nunca rebaixa uma divergência que o modelo apontou
  // por outra razão (a tese, por exemplo).
  if (cotejo.divergencias.length > 0) {
    estado = 'DIVERGENTE'
    ressalva(
      'Divergência apurada por comparação direta com a fonte — ' +
        cotejo.divergencias.join('; ') +
        '.',
    )
  } else if (estado.startsWith('CONFIRMADO') && cotejo.naoConferidos.length > 0) {
    // Era assim que passava um falso confirmado: confirmar "os metadados" tendo
    // conferido só parte deles. O que não foi visto na fonte fica dito.
    ressalva(
      `Confirmação PARCIAL. Conferidos na fonte: ${cotejo.conferidos.join(', ') || 'nenhum campo'}. ` +
        `NÃO conferidos: ${cotejo.naoConferidos.join(', ')} — estes campos não foram vistos e podem estar errados.`,
    )
  }

  // Confirmação apoiada no LexML é legítima, mas num grau que diz de onde veio:
  // repositório oficial, não portal do tribunal. Tratado ANTES da checagem de
  // tribunal, que naturalmente reprovaria lexml.gov.br.
  if (estado.startsWith('CONFIRMADO') && noRepositorio && !ehBusca) {
    estado = 'CONFIRMADO_REPOSITORIO'
    ressalva(
      'Conferido no LexML — repositório oficial do governo (Rede de Informação Legislativa e Jurídica) —, não no portal do próprio tribunal. ' +
        'É fonte pública oficial, mas de segunda instância documental: o registro reproduz os dados do julgado, não o inteiro teor autenticado pela Corte.',
    )
    return montar()
  }

  // Só CONFIRMADO exige documento. DIVERGENTE se sustenta em indício.
  if (estado.startsWith('CONFIRMADO') && ehBusca) {
    estado = 'NAO_LOCALIZADO'
    url = null
    ressalva(
      'A única referência obtida foi uma página de BUSCA do portal, não o documento do julgado. Página de pesquisa não atesta nada — não confirmamos, o que não significa que a citação seja falsa.',
    )
  } else if (estado.startsWith('CONFIRMADO') && !emDominioOficial) {
    estado = 'NAO_LOCALIZADO'
    url = null
    ressalva(
      'O sistema não obteve URL em domínio oficial para esta citação. Sem fonte verificável não confirmamos — o que não significa que a citação seja falsa.',
    )
  } else if (estado.startsWith('CONFIRMADO') && !doTribunalCerto) {
    // fonte é oficial, mas de outro tribunal: não serve para atestar este julgado
    estado = 'NAO_LOCALIZADO'
    url = null
    ressalva(
      `A única fonte encontrada (${host}) não é do tribunal citado (${tribunal}). Documento de outro tribunal que menciona o julgado não serve para atestá-lo. Não confirmamos — o que não significa que a citação seja falsa.`,
    )
  } else if (estado === 'DIVERGENTE' && !url) {
    ressalva(
      'Divergência apontada a partir de indício, sem documento do próprio tribunal em mãos. Confirme no portal antes de usar a citação.',
    )
  }

  return montar()
}

function custo(u: any): number {
  const i = u.input_tokens ?? 0
  const o = u.output_tokens ?? 0
  const cr = u.cache_read_input_tokens ?? 0
  const cw = u.cache_creation_input_tokens ?? 0
  return (
    (i * PRECO.input + o * PRECO.output + cr * PRECO.cache_read + cw * PRECO.cache_write) / 1_000_000
  )
}

// Confronto de metadados no FORMATO DO STJ (o confronta() genérico é do STF:
// não lê "DJe DD/MM/YYYY" nem "SEXTA TURMA"). Compara a citação contra a verdade
// da base. Relator por CONTENÇÃO de tokens — robusto a "rel. p/ acórdão" anexado.
function normNomeStj(s?: string | null): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\b(MINISTR[OA]|MIN|DESEMBARGADOR[A]?|DES|CONVOCAD[OA]|DO|DA|TJ[A-Z]{0,3})\b/g, ' ')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
const ORG_STJ_RE =
  /(?:PRIMEIRA|SEGUNDA|TERCEIRA|QUARTA|QUINTA|SEXTA)\s+TURMA|(?:PRIMEIRA|SEGUNDA|TERCEIRA)\s+SE[ÇC][ÃA]O|CORTE ESPECIAL/i
const classePrefix = (c: string) =>
  (c.match(/^\s*([A-Za-zç .]+?)\s*\d/)?.[1] || '')
    .toUpperCase()
    .replace(/\bN[OA]\b|\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function confrontaStj(
  citacao: string,
  meta: any,
): { divergencias: string[]; conferidos: string[]; naoConferidos: string[] } {
  const div: string[] = []
  const ok: string[] = []

  // relator citado (para antes de vírgula ou de "rel. p/ acórdão")
  const mRel = citacao.match(/\brel\.?\s*(?:min(?:istr[oa])?\.?)?\s*([^,]+?)(?=,|$|\s+rel\.?\s*p\/)/i)
  if (mRel && meta.relator) {
    const c = normNomeStj(mRel[1])
    const bt = new Set(normNomeStj(meta.relator).split(' ').filter(Boolean))
    if (c) {
      const contido = c.split(' ').filter(Boolean).every((t) => bt.has(t))
      if (contido) ok.push('relator')
      else div.push(`relator: a citação diz "${mRel[1].trim()}", o STJ registra "${meta.relator}"`)
    }
  }

  // órgão julgador (turmas/seções do STJ)
  const mOrg = citacao.match(ORG_STJ_RE)
  if (mOrg && meta.orgao) {
    const norm = (s: string) => s.toUpperCase().replace(/[ÇC]/g, 'C').replace(/[^A-Z]/g, '')
    if (norm(mOrg[0]) === norm(String(meta.orgao))) ok.push('órgão julgador')
    else div.push(`órgão julgador: a citação diz "${mOrg[0]}", o STJ registra "${meta.orgao}"`)
  }

  // data (DJe/DJEN/DJ/PUB DD/MM/AAAA)
  const mData = citacao.match(/(?:DJe|DJEN|DJ|PUB|publicad[oa] em)\s*(\d{2}\/\d{2}\/\d{4})/i)
  if (mData && meta.data) {
    if (mData[1] === meta.data) ok.push('data de julgamento')
    else div.push(`data de julgamento: a citação diz "${mData[1]}", o STJ registra "${meta.data}"`)
  }

  // classe — comparada contra a citação ORIGINAL da base (texto completo)
  if (meta.citacao) {
    const c = classePrefix(citacao)
    const b = classePrefix(String(meta.citacao))
    if (c && b) {
      if (c === b) ok.push('classe processual')
      else div.push(`classe processual: a citação diz "${c}", o STJ registra "${b}"`)
    }
  }

  return { divergencias: div, conferidos: ok, naoConferidos: [] }
}

// ---------------------------------------------------------------------------
// NÍVEL 1 — base canônica STJ (Jurisprudência em Teses). Custo de IA: zero.
// O STJ mapeia TESE -> JULGADOS: conferimos metadado contra a verdade do próprio
// STJ (não contra palpite de busca) e casamos a tese alegada com a(s) tese(s)
// que aquele julgado sustenta. Pega a distorção de tese sem LLM nem portal.
// Só o que a base não cobre (STF, STJ fora da JT, outros tribunais) cai no Nível 2.
// ---------------------------------------------------------------------------
const LIMIAR_TESE = 0.3 // calibrar no conjunto de teste
// Classes com sinal de STJ (exclui RE/ARE/ADI/ADPF... que são do STF).
// prefixos podem se aninhar ("AgInt nos EDcl no REsp") e usar "no/na/nos/nas" — daí o grupo repetível.
const RE_STJ_CIT =
  /(?:(?:Ag(?:Rg|Int)|EDcl|ED|EAg|ProAfR|MC|QO|Rcl)\s+(?:nos?|nas?)\s+)*(E?A?REsp|RHC|RMS|RvC|HC|AR|Pet|CC|MS|Rcl|SLS|IAC|SEC)\s*n?[ºo.]?\s*(\d[\d.]*)\s*\/\s*([A-Z]{2})/gi

async function verificaPorBaseStj(
  texto: string,
  tese: string | null,
  admin: any,
): Promise<{ itens: Item[]; resto: string }> {
  const itens: Item[] = []
  const remover: string[] = []
  const vistos = new Set<string>()
  let m: RegExpExecArray | null
  RE_STJ_CIT.lastIndex = 0
  while ((m = RE_STJ_CIT.exec(texto)) !== null && vistos.size < 20) {
    const cit = m[0].trim()
    // janela = a citação + o metadado que vem DEPOIS do /UF (rel., órgão, DJe...),
    // que o confrontaStj precisa ver. m[0] termina no /UF.
    const janela = texto.slice(m.index, m.index + m[0].length + 220).replace(/\s+/g, ' ').trim()
    const numero = m[2].replace(/\./g, '')
    const uf = m[3].toUpperCase()
    const chave = `${numero}/${uf}`
    if (vistos.has(chave)) continue
    vistos.add(chave)

    let rows: any[] = []
    try {
      const { data } = await admin.rpc('stj_lookup', {
        p_numero: numero,
        p_uf: uf,
        p_tese: tese || '',
      })
      rows = Array.isArray(data) ? data : []
    } catch {
      rows = []
    }
    if (!rows.length) continue // não está na base -> Nível 2

    const meta = rows[0]
    const cotejo = confrontaStj(janela, meta)
    const cls = m[1].toUpperCase().replace(/\s/g, '')
    const exclusiva = /^(E?A?RESP|RHC|RMS)$/.test(cls)
    const confiavel = exclusiva || cotejo.conferidos.length >= 1
    const prov = (r: any) =>
      `STJ — Jurisprudência em Teses${r.area ? ', ' + r.area : ''}, ed. ${r.edicao}, tese ${r.numero_tese}` +
      (r.fonte_pagina ? ` (pg ${r.fonte_pagina})` : '')

    const item = (estado: Estado, oQue: string | null, obs: string): Item => ({
      citacao: janela.slice(0, 220),
      tipo: 'acordao',
      tribunal: 'STJ',
      estado,
      url_oficial: meta.fonte_url || null,
      url_busca: urlBusca('STJ', cit),
      url_lexml: urlLexml(cit),
      o_que_decide: oQue,
      observacao: obs,
      campos_conferidos: cotejo.conferidos,
      campos_nao_conferidos: cotejo.naoConferidos,
      resolucao: 'base_stj',
    })

    // 1) metadado diverge -> DIVERGENTE (só se confiável que é o mesmo processo STJ)
    if (cotejo.divergencias.length > 0) {
      if (!confiavel) continue // ambíguo (pode ser outro tribunal): Nível 2
      itens.push(
        item(
          'DIVERGENTE',
          null,
          `Divergência apurada na Jurisprudência em Teses do STJ — ${cotejo.divergencias.join('; ')}. Fonte: ${prov(meta)}.`,
        ),
      )
      remover.push(cit)
      continue
    }

    // 2) metadado ok e há tese alegada -> casa a tese
    if (tese) {
      const best = rows.reduce((a, b) => ((b.sim ?? 0) > (a.sim ?? 0) ? b : a), rows[0])
      if ((best.sim ?? 0) >= LIMIAR_TESE) {
        itens.push(
          item(
            'CONFIRMADO_BASE_STJ',
            best.tese_text,
            `Confirmado contra a Jurisprudência em Teses do STJ: o julgado existe, os metadados batem e o STJ o vincula a esta tese. Fonte: ${prov(best)}.`,
          ),
        )
      } else if (confiavel) {
        itens.push(
          item(
            'DIVERGENTE',
            best.tese_text,
            `O julgado existe no STJ, mas o que o próprio STJ registra que ele decide é: "${String(best.tese_text).slice(0, 180)}…" (${prov(best)}) — o que NÃO corresponde à tese alegada. Confira antes de citar.`,
          ),
        )
      } else {
        continue // ambíguo -> Nível 2
      }
      remover.push(cit)
      continue
    }

    // 3) sem tese alegada -> confirma existência/metadados se confiável
    if (confiavel) {
      const onde = rows
        .slice(0, 3)
        .map((r) => `tese ${r.numero_tese} (ed. ${r.edicao})`)
        .join('; ')
      itens.push(
        item(
          'CONFIRMADO_BASE_STJ',
          rows[0].tese_text,
          `Existência e metadados confirmados na Jurisprudência em Teses do STJ. O julgado é invocado em: ${onde}. Fonte: ${prov(rows[0])}.`,
        ),
      )
      remover.push(cit)
    }
    // senão -> Nível 2
  }

  let resto = texto
  for (const c of remover) resto = resto.split(c).join(' ')
  return { itens, resto }
}

// ---------------------------------------------------------------------------
// NÍVEL 1 — STF (Coletâneas Temáticas de Jurisprudência), 03/08/2026
//
// Escopo deliberadamente MENOR que o do STJ: aqui só se confronta METADADO.
// A Jurisprudência em Teses é base autocontida — o STJ mapeia tese→julgados.
// A coletânea do STF não é isso: traz RECORTE (de ementa, de decisão ou de
// VOTO) escolhido por tema. Metadado dá para atestar com autoridade, porque a
// citação vem do próprio STF; "o julgado sustenta esta tese", não — recorte de
// voto é a posição de um ministro, não a ratio do colegiado. Foi essa confusão
// que produziu 36% de falso divergente na rodada 1 do conjunto STF.
//
// Consequência de desenho: havendo tese alegada e metadado conferido, o item
// NÃO é resolvido aqui — segue para o Nível 2, que lê a tese. Confirmar só pelo
// metadado nesse caso seria falso confirmado na categoria TESE, justamente a
// que distingue o produto.
// ---------------------------------------------------------------------------
// Classes que só existem no STF: dispensam corroboração para atribuir o processo.
const STF_EXCLUSIVAS = /^(ADI|ADPF|ADC|ADO|RE|ARE|AI|EP|PPE)$/
const RE_STF_CIT =
  /\b(ADI|ADPF|ADC|ADO|RE|ARE|AI|RHC|HC|MS|MI|Rcl|ACO|AO|Pet|Inq|AP|Ext|RvC|EP|PPE|AC|AR|CC|SS|STA|SL|SE|IF)\s*n?[ºo.]?\s*(\d[\d.]*)((?:\s+(?:AgR|ED|MC|QO|REF|EI|ExtN|ProgReg|TrabExt|segundos?|terceiro|quarto|quinto|primeiro)(?:-[A-Za-z]+)?)*)/g

async function verificaPorBaseStf(
  texto: string,
  tese: string | null,
  admin: any,
): Promise<{ itens: Item[]; resto: string }> {
  const itens: Item[] = []
  const remover: string[] = []
  const vistos = new Set<string>()
  let m: RegExpExecArray | null
  RE_STF_CIT.lastIndex = 0

  while ((m = RE_STF_CIT.exec(texto)) !== null && vistos.size < 20) {
    const cit = m[0].trim()
    // janela = citação + o metadado que vem depois (rel., j., órgão, DJE)
    const janela = texto.slice(m.index, m.index + m[0].length + 220).replace(/\s+/g, ' ').trim()
    const classe = m[1].toUpperCase()
    const numero = m[2].replace(/\./g, '')
    const chave = `${classe}/${numero}`
    if (vistos.has(chave)) continue
    vistos.add(chave)

    let rows: any[] = []
    try {
      const { data } = await admin.rpc('stf_lookup', { p_numero: numero, p_classe: classe })
      rows = Array.isArray(data) ? data : []
    } catch {
      rows = []
    }
    if (!rows.length) continue // fora da base -> Nível 2

    const meta = rows[0]
    // A base guarda o relator vencido em campo próprio; o confronto compara o
    // papel certo com o papel certo (escrever redator como "rel." falsifica a
    // citação — erro que eu mesmo cometi no gerador do conjunto de teste).
    const observado = {
      classe: meta.classe,
      relator: meta.relator,
      redator: meta.redator_acordao,
      orgao: meta.orgao,
      data: meta.data ? String(meta.data).slice(0, 10) : null,
    }
    const cotejo = confronta(parseCitacao(janela), observado)

    // HC, MS, Rcl, Inq, AP... existem nos dois tribunais. Fora das classes
    // exclusivas do STF, só atribuo o processo se ao menos um metadado bater —
    // senão um HC do STJ com o mesmo número seria confundido com um do STF.
    const confiavel = STF_EXCLUSIVAS.test(classe) || cotejo.conferidos.length >= 1
    if (!confiavel) continue

    const prov =
      `STF — Coletânea Temática de Jurisprudência (${meta.colecao === 'penal' ? 'Direito Penal e Processual Penal' : 'Controle de Constitucionalidade'})` +
      (meta.fonte_pagina ? `, pg ${meta.fonte_pagina}` : '')

    const item = (estado: Estado, obs: string): Item => ({
      citacao: janela.slice(0, 220),
      tipo: 'acordao',
      tribunal: 'STF',
      estado,
      url_oficial: meta.fonte_url || null,
      url_busca: urlBusca('STF', cit),
      url_lexml: urlLexml(cit),
      o_que_decide: null, // por desenho: a coletânea traz recorte, não a tese firmada
      observacao: obs,
      campos_conferidos: cotejo.conferidos,
      campos_nao_conferidos: cotejo.naoConferidos,
      resolucao: 'base_stf',
    })

    // 1) metadado diverge -> DIVERGENTE, sem custo de IA
    if (cotejo.divergencias.length > 0) {
      itens.push(
        item(
          'DIVERGENTE',
          `Divergência apurada contra a publicação do próprio STF — ${cotejo.divergencias.join('; ')}. ` +
            `Citação como o STF a registra: "${meta.citacao}". Fonte: ${prov}.`,
        ),
      )
      remover.push(cit)
      continue
    }

    // 2) metadado ok E há tese alegada -> Nível 2 (só ele lê a tese)
    if (tese) continue

    // 3) metadado ok e sem tese alegada -> confirma existência e metadados
    itens.push(
      item(
        'CONFIRMADO_BASE_STF',
        `Existência e metadados confirmados na publicação do próprio STF. ` +
          `Citação como o STF a registra: "${meta.citacao}". Fonte: ${prov}. ` +
          `O que o julgado decide NÃO foi conferido: a coletânea publica recortes selecionados por tema, não a tese firmada.` +
          (meta.confianca !== 'alta'
            ? ' [A VERIFICAR] O registro veio de trecho marcado com confiança média na extração — confira na fonte.'
            : ''),
      ),
    )
    remover.push(cit)
  }

  let resto = texto
  for (const c of remover) resto = resto.split(c).join(' ')
  return { itens, resto }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
  const authHeader = req.headers.get('Authorization')

  // ---- MODO LOTE (avaliação) -------------------------------------------------
  // Habilitado só se a env BATCH_TEST_TOKEN existir E o chamador enviar o mesmo
  // valor em x-batch-token. Serve para rodar o conjunto de teste ponta a ponta,
  // exercitando a MESMA normalização do servidor — que é onde estavam três dos
  // quatro defeitos achados nos testes manuais.
  // Não toca em dados de usuário: sem perfil, sem workspace, sem gravação.
  // O gateway continua exigindo JWT (a anon key, pública, basta).
  const batchToken = Deno.env.get('BATCH_TEST_TOKEN') ?? ''
  const batchHeader = req.headers.get('x-batch-token') ?? ''
  const modoLote = batchToken.length >= 16 && batchHeader === batchToken

  try {
    if (!authHeader) {
      return json({ status: 'error', code: 'unauthorized', message: 'Não autenticado.' }, 401)
    }
    if (!anthropicKey) {
      return json(
        { status: 'error', code: 'no_key', message: 'ANTHROPIC_API_KEY não configurada.' },
        500,
      )
    }

    const payload = await req.json().catch(() => ({}))
    const texto = String(payload?.texto ?? '').trim()
    const tese = String(payload?.tese ?? '').trim().slice(0, 2000)
    if (texto.length < 4) {
      return json(
        { status: 'error', code: 'empty', message: 'Cole ao menos uma citação para verificar.' },
        400,
      )
    }
    if (texto.length > 6000) {
      return json(
        { status: 'error', code: 'too_long', message: 'Texto muito longo. Verifique por partes.' },
        400,
      )
    }

    // cliente service_role — usado pela base STJ (Nível 1) e, no fluxo normal,
    // por perfil/teto/gravação. Criado cedo para o modo lote também alcançar a base.
    const admin = createClient(url, serviceKey)

    // ---- lote: pula identificação, teto e gravação; roda o mesmo miolo
    if (modoLote) {
      const { itens: det, resto: r0 } = resolveDeterministico(texto)
      const { itens: baseStj, resto: r1 } = await verificaPorBaseStj(r0, tese, admin)
      const { itens: baseStf, resto } = await verificaPorBaseStf(r1, tese, admin)
      let busca: Item[] = []
      let usoLote: any = {}
      if (/[A-Za-z]{2,6}\s*n?[ºo.]?\s*[\d][\d.]{2,}/.test(resto)) {
        const r = await verificaPorBusca(resto.slice(0, 6000), tese, anthropicKey)
        busca = r.itens.slice(0, MAX_CITACOES)
        usoLote = r.uso
      }
      const todos = [...det, ...baseStj, ...baseStf, ...busca]
      return json({
        status: 'ok',
        modo: 'lote',
        itens: todos,
        uso: usoLote, // bruto, para conferir a fórmula de custo por fora
        custo_usd: Number(custo(usoLote).toFixed(6)),
      })
    }

    // ---- chamador e workspace
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user: caller },
    } = await asCaller.auth.getUser()
    if (!caller) {
      return json({ status: 'error', code: 'unauthorized', message: 'Não autenticado.' }, 401)
    }

    const { data: perfil } = await admin
      .from('profiles')
      .select('id, workspace_id')
      .eq('id', caller.id)
      .maybeSingle()
    if (!perfil?.workspace_id) {
      return json({ status: 'error', code: 'no_profile', message: 'Perfil não encontrado.' }, 400)
    }

    // ---- teto diário do plano (por escritório)
    const inicioDia = new Date()
    inicioDia.setUTCHours(3, 0, 0, 0) // ~00h em America/Sao_Paulo
    if (inicioDia.getTime() > Date.now()) inicioDia.setUTCDate(inicioDia.getUTCDate() - 1)
    const { count: usadas } = await admin
      .from('precedent_verifications')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', perfil.workspace_id)
      .gte('created_at', inicioDia.toISOString())
    const consumo = usadas ?? 0
    if (consumo >= TETO_DIARIO) {
      return json(
        {
          status: 'error',
          code: 'daily_cap',
          message: `Teto diário de ${TETO_DIARIO} verificações atingido para este escritório. O contador zera à meia-noite.`,
          consumo_hoje: consumo,
          teto_diario: TETO_DIARIO,
        },
        429,
      )
    }

    // ---- 1) determinístico (sem custo de IA)
    const { itens: deterministicos, resto: r0 } = resolveDeterministico(texto)

    // ---- 2) Nível 1: bases canônicas (sem custo de IA)
    //   STJ primeiro: a citação de lá exige /UF, o que a torna inequívoca.
    //   STF depois: HC, MS, Rcl, Inq e AP existem nos dois tribunais, então a
    //   camada do STF só atribui o processo com corroboração de metadado.
    const { itens: baseStj, resto: r1 } = await verificaPorBaseStj(r0, tese, admin)
    const { itens: baseStf, resto } = await verificaPorBaseStf(r1, tese, admin)

    // ---- 3) Nível 2: busca, só no que as bases não cobriram
    let porBusca: Item[] = []
    let uso: any = {}
    const temAcordao = /[A-Za-z]{2,6}\s*n?[ºo.]?\s*[\d][\d.]{2,}/.test(resto)
    if (temAcordao) {
      const r = await verificaPorBusca(resto.slice(0, 6000), tese, anthropicKey)
      porBusca = r.itens.slice(0, MAX_CITACOES)
      uso = r.uso
    }

    const itens = [...deterministicos, ...baseStj, ...baseStf, ...porBusca]
    if (itens.length === 0) {
      return json({
        status: 'ok',
        itens: [],
        aviso:
          'Não reconhecemos nenhuma citação de jurisprudência no texto. Verifique o formato — ex.: "HC 103.118", "Súmula Vinculante 11", "Tema 121 do STF".',
        consumo_hoje: consumo,
        teto_diario: TETO_DIARIO,
      })
    }

    const conta = (e: Estado) => itens.filter((i) => i.estado === e).length
    const custoUsd = custo(uso)

    // ---- registro (service_role; RLS da tabela é somente leitura pelo app)
    await admin.from('precedent_verifications').insert({
      workspace_id: perfil.workspace_id,
      user_id: caller.id,
      entrada: texto.slice(0, 6000),
      tese_alegada: tese || null,
      n_citacoes: itens.length,
      resultado: itens,
      n_confirmado: itens.filter((i) => i.estado.startsWith('CONFIRMADO')).length,
      n_divergente: conta('DIVERGENTE'),
      n_nao_local: conta('NAO_LOCALIZADO'),
      input_tokens: uso.input_tokens ?? 0,
      output_tokens: uso.output_tokens ?? 0,
      cache_read_tokens: uso.cache_read_input_tokens ?? 0,
      cache_write_tokens: uso.cache_creation_input_tokens ?? 0,
      estimated_cost: custoUsd,
      modelo: temAcordao ? MODELO : 'deterministico',
    })

    return json({
      status: 'ok',
      itens,
      consumo_hoje: consumo + 1,
      teto_diario: TETO_DIARIO,
      custo_usd: Number(custoUsd.toFixed(6)),
      dominios_consultados: DOMINIOS_OFICIAIS,
    })
  } catch (err: any) {
    console.error('[verify-precedent]', err?.message ?? err)
    return json(
      {
        status: 'error',
        code: 'internal',
        message: err?.message ?? 'Falha ao verificar. Tente novamente.',
      },
      500,
    )
  }
})
