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

// TETO DIÁRIO POR CUSTO, não por chamadas (03/08/2026).
// Contar chamadas fazia sentido quando toda verificação passava pelo Sonnet
// (~US$ 0,35). Com o Nível 1, uma verificação resolvida na base custa ~US$ 0 e
// uma do Nível 2 custa ~US$ 0,19 (medido na rodada 4, 57 casos) — contar chamadas
// passou a punir exatamente quem usa o caminho barato. Limita-se a despesa.
// US$ 1,50/dia ≈ 8 verificações caras, ou dezenas de baratas; o ciclo completo de
// análise, que é o produto principal, custa ~US$ 1,46. Rever ao definir os planos.
// Teto ESCALONADO por faixa (decisão de 04/08/2026). Com teto único, a margem
// caía conforme o plano encarecia — o plano de entrada pagava o mesmo teto do
// caro. 'beta' fica no teto do meio até a virada comercial.
const TETO_POR_PLANO: Record<string, number> = {
  essencial: 0.6,
  escritorio: 1.5,
  performance: 3.0,
  enterprise: 10.0,
  beta: 1.5,
}
const TETO_PADRAO_USD = 1.5
// Backstop contra abuso do caminho barato: não é limite comercial, é sanidade.
const TETO_CHAMADAS_DIA = 200
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
  | 'CONFIRMADO_BASE_TST' // conferido no Índice Temático de Precedentes do TST/SPR
  | 'CONFIRMADO_BASE_TSE' // conferido na publicação oficial de Súmulas do TSE
  | 'CONFIRMADO_BASE_CARF' // conferido no Quadro Geral de Súmulas do CARF
  // O enunciado existe e é aquele mesmo, mas foi cancelado, revogado, superado ou
  // alterado. Não é confirmação nem divergência — é um terceiro aviso, e o mais
  // grave na prática: citar súmula morta derruba a peça.
  | 'VIGENCIA_COMPROMETIDA'
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

  // Súmula do CARF. "Súmula CARF nº 17", "Súmula 17 do CARF". Aceita o sinal de
  // grau (°) além do ordinal (º): é assim que o próprio quadro geral escreve a
  // Súmula 17, e um caractere trocado bastaria para não reconhecer a citação.
  consome(
    /\bs[úu]mula\s+CARF\s+n?[ºo°.]?\s*(\d{1,3})\b|\bs[úu]mula\s+n?[ºo°.]?\s*(\d{1,3})\s+d[oe]\s+CARF\b/gi,
    (m) => {
      const num = m[1] || m[2]
      return {
        citacao: m[0].trim(),
        tipo: 'sumula',
        tribunal: 'CARF',
        estado: 'IDENTIFICADO',
        url_oficial:
          'https://carf.economia.gov.br/jurisprudencia/sumulas-carf/quadro-geral-de-sumulas-1',
        url_busca: null,
        url_lexml: urlLexml(`Súmula ${num} CARF`),
        o_que_decide: null,
        observacao:
          'Súmula do CARF identificada sem consulta de IA. O sistema NÃO leu o texto — confira no Quadro Geral.',
        resolucao: 'deterministica',
        _carfSum: String(num),
      } as Item & { _carfSum: string }
    },
  )

  // Súmula do TSE. "Súmula 47 do TSE", "Súmula-TSE n. 47", e a forma por
  // extenso — o Tribunal Superior Eleitoral aparece escrito assim em peça
  // eleitoral com frequência maior que a sigla.
  consome(
    /\bs[úu]mula[-\s]*(?:TSE\s*)?n?[ºo.]?\s*(\d{1,3})\s+d[oe]\s+(?:TSE|tribunal\s+superior\s+eleitoral)\b|\bs[úu]mula-TSE\s+n\.?\s*(\d{1,3})\b/gi,
    (m) => {
      const num = m[1] || m[2]
      return {
        citacao: m[0].trim(),
        tipo: 'sumula',
        tribunal: 'TSE',
        estado: 'IDENTIFICADO',
        url_oficial:
          'https://www.tse.jus.br/legislacao/codigo-eleitoral/sumulas/sumulas-do-tse',
        url_busca: null,
        url_lexml: urlLexml(`Súmula ${num} TSE`),
        o_que_decide: null,
        observacao:
          'Súmula do TSE identificada sem consulta de IA. O sistema NÃO leu o texto — confira na publicação oficial.',
        resolucao: 'deterministica',
        _tseSum: String(num),
      } as Item & { _tseSum: string }
    },
  )

  // Súmulas, OJs e Precedentes Normativos do TST. Sete séries, e a seção importa:
  // "OJ 191" sem dizer de qual subseção é citação incompleta — a SDI-1 e a SDI-2
  // têm ambas uma OJ 191, sobre coisas diferentes. Por isso a seção é exigida:
  // adivinhar a mais comum acertaria na maioria e erraria feio no resto.
  const SECAO_TST: Record<string, string> = {
    SDI1: 'OJ-SDI1', SDII: 'OJ-SDI1', SBDI1: 'OJ-SDI1', SBDII: 'OJ-SDI1',
    SDI2: 'OJ-SDI2', SDIII: 'OJ-SDI2', SBDI2: 'OJ-SDI2', SBDIII: 'OJ-SDI2',
    SDC: 'OJ-SDC', TP: 'OJ-TP/OE', OE: 'OJ-TP/OE',
  }
  const canonSecao = (s: string) =>
    SECAO_TST[s.toUpperCase().replace(/[^A-Z0-9]/g, '')] ?? null

  const itemTst = (cit: string, tipo: string, num: string): Item & { _tstSum: string } => ({
    citacao: cit.trim(),
    tipo: 'sumula',
    tribunal: 'TST',
    estado: 'IDENTIFICADO',
    url_oficial: 'https://www.tst.jus.br/livro-de-sumulas-ojs-e-pns',
    url_busca: null,
    url_lexml: urlLexml(`${tipo} ${num} TST`),
    o_que_decide: null,
    observacao:
      'Verbete do TST identificado sem consulta de IA. O sistema NÃO leu o texto — confira no Livro de Súmulas do TST.',
    resolucao: 'deterministica',
    _tstSum: `${tipo}:${num}`,
  })

  // "Súmula 331 do TST"
  consome(/\bs[úu]mula\s+(?:n[ºo.]?\s*)?(\d{1,3})\s+d[oe]\s+tst\b/gi, (m) =>
    itemTst(m[0], 'SUM', m[1]),
  )

  // "OJ-SDI1-191" — a forma como o próprio Livro escreve
  consome(
    /\bOJ[-\s]?(SDI\s?-?\s?1\s?T|SBDI\s?-?\s?1\s?T|SDI\s?-?\s?[12I]{1,3}|SBDI\s?-?\s?[12I]{1,3}|SDC|TP\/OE)[-\s]?(\d{1,3})\b/gi,
    (m) => {
      const transitoria = /T\s*$/i.test(m[1].replace(/\s/g, ''))
      const tipo = transitoria ? 'OJ-SDI1T' : canonSecao(m[1])
      return tipo ? itemTst(m[0], tipo, m[2]) : null
    },
  )

  // "OJ 191 da SDI-1", "Orientação Jurisprudencial nº 191 da SBDI-1",
  // "OJ transitória 70 da SDI-1"
  consome(
    /\b(?:OJ|orienta[çc][ãa]o\s+jurisprudencial)\s+(transit[óo]ria\s+)?(?:n[ºo.]?\s*)?(\d{1,3})\s+d[ao]\s+(S?BDI\s?-?\s?[12I]{1,3}|SDI\s?-?\s?[12I]{1,3}|SDC|[óo]rg[ãa]o\s+especial|tribunal\s+pleno)\b/gi,
    (m) => {
      const tipo = m[1]
        ? 'OJ-SDI1T'
        : /especial|pleno/i.test(m[3])
          ? 'OJ-TP/OE'
          : canonSecao(m[3])
      return tipo ? itemTst(m[0], tipo, m[2]) : null
    },
  )

  // "OJ 191" SEM DIZER A SUBSEÇÃO. Vem por último, quando os padrões completos
  // já consumiram o que era inequívoco. Não se adivinha aqui: quem resolve é a
  // camada que tem os tetos de cada série. Um número baixo pode pertencer a
  // quatro séries; um alto, a uma só.
  consome(
    /\b(?:OJ|orienta[çc][ãa]o\s+jurisprudencial)\s+(?:n[ºo.]?\s*)?(\d{1,3})\b(?!\s*d[ao]\s)/gi,
    (m) => itemTst(m[0], 'OJ?', m[1]),
  )

  // "PN 119 do TST", "Precedente Normativo 119"
  consome(
    /\b(?:PN|precedente\s+normativo)\s+(?:n[ºo.]?\s*)?(\d{1,3})(?:\s+d[oe]\s+tst)?\b/gi,
    (m) => itemTst(m[0], 'PN', m[1]),
  )

  // Precedente qualificado do TST: "Tema 41 do TST", "IRR 41", "IAC 2 do TST".
  // O TST numera seus repetitivos como IRR, e é assim que a base guarda.
  //
  // "IRR" exige espaço e no máximo três dígitos, sem hífen adiante: o número do
  // PROCESSO também começa por IRR ("IRR-243000-58.2013.5.13.0023"), e casar com
  // ele produziria "Tema 243" a partir de um número de autos.
  consome(
    /\b(?:tema\s+(?:n[ºo.]?\s*)?(\d{1,3})\s+d[oe]\s+tst|irr\s+n?[ºo.]?\s*(\d{1,3})(?![\d.\-\/])|iac\s+n?[ºo.]?\s*(\d{1,3})\s+d[oe]\s+tst)\b/gi,
    (m) => {
      const num = m[1] || m[2] || m[3]
      const tipo = m[3] ? 'IAC' : 'IRR'
      return {
        citacao: m[0].trim(),
        tipo: 'tema',
        tribunal: 'TST',
        estado: 'IDENTIFICADO',
        url_oficial: 'https://www.tst.jus.br/nugep-sp/recursos-repetitivos/tabela-completa',
        url_busca: null,
        url_lexml: urlLexml(`${tipo} ${num} TST`),
        o_que_decide: null,
        observacao: `Precedente do TST identificado sem consulta de IA. O sistema NÃO leu a tese — confira na tabela do NUGEP.`,
        resolucao: 'deterministica',
        _tst: `${tipo}:${num}`,
      } as Item & { _tst: string }
    },
  )

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
  confirmados: ConfirmadoBase[] = [],
  // BUSCA EXTERNA — desligável por escritório.
  //
  // A ferramenta de busca é OPCIONAL POR REQUISIÇÃO: só roda quando vai no array
  // `tools`. Não indo, a consulta sequer é formulada — e portanto não sai.
  //
  // Isso importa por uma razão que a restrição de domínio NÃO resolve. O
  // `allowed_domains` filtra o que VOLTA, não o que SAI: o texto da consulta é
  // enviado ao provedor de busca de todo modo. E os provedores são
  // subprocessadores da Anthropic — Brave Search e TurboPuffer (EUA), conforme a
  // lista colhida em 13/08/2026 — que podem mudar com aviso de 30 dias.
  //
  // Só NÃO BUSCAR é robusto a mudança de cadeia. Qualquer outra medida depende
  // de vigiar uma lista que muda por decisão de terceiro.
  //
  // O custo é de cobertura, e é menor do que parece: os 126 casos de teste
  // resolvem TODOS pelas dez bases canônicas, a custo zero. A busca só entra
  // para acórdão fora delas — que, sem ela, volta como IDENTIFICADO dizendo que
  // não foi conferido e por quê. É a disciplina de sempre: não confirmar em vez
  // de confirmar sem base.
  buscaExterna = true,
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
      tools: buscaExterna
        ? [
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
          ]
        : [],
      // O SYSTEM PRECISA SABER QUE NÃO HÁ BUSCA. Sem isto o modelo tentaria
      // usar uma ferramenta ausente, ou — pior — responderia de memória, que é
      // exatamente o que produz citação inventada. O aviso substitui a instrução
      // "use a busca" por "diga que não conferiu".
      //
      // O bloco extra vai FORA do trecho com cache_control: o system em cache é
      // idêntico nos dois modos, e só o aviso muda. Assim o escritório que
      // desliga a busca não perde o cache do prompt principal.
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        ...(buscaExterna
          ? []
          : [
              {
                type: 'text',
                text:
                  'MODO SEM BUSCA EXTERNA. Este escritório optou por não permitir consulta a mecanismos de busca. ' +
                  'VOCÊ NÃO TEM A FERRAMENTA DE BUSCA nesta requisição — ignore a instrução acima que manda usá-la. ' +
                  'Para toda citação que não venha já conferida nas bases canônicas, devolva estado "IDENTIFICADO" ' +
                  '(NUNCA "NAO_LOCALIZADO": nada foi procurado, e dizer que não se encontrou sugere que se procurou). ' +
                  '\n\n' +
                  'SOBRE O QUE VOCÊ SABE DE MEMÓRIA. Você pode oferecer o que sabe sobre a citação — é útil ao ' +
                  'advogado como orientação. Mas a proveniência tem de ser INEQUÍVOCA, porque memória de modelo é ' +
                  'exatamente o mecanismo que produz citação inventada com ar de certeza, e quem lê não tem como ' +
                  'distinguir um acerto de um erro. Então: comece o trecho com "DA MEMÓRIA DO MODELO, NÃO DE FONTE ' +
                  'CONSULTADA:" e termine dizendo em que portal oficial conferir, nomeando-o. Nunca escreva que a ' +
                  'citação "corresponde a" ou "é" algo — escreva que você ACREDITA tratar-se disso, e que não foi ' +
                  'verificado. Se não souber, diga que não sabe; inventar aqui é pior que calar.',
              },
            ]),
      ],
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
    itens = (obj.itens ?? []).map((i: any) => normaliza(i, confirmados))
  } catch (_e) {
    throw new Error('Resposta do modelo não veio em JSON utilizável.')
  }
  return { itens, uso: data.usage ?? {} }
}

function blocoConfirmados(cs: ConfirmadoBase[]): string {
  if (!cs.length) return ''
  const linhas = cs.map(
    (c) =>
      `- ${c.classe} ${c.numero}: ${c.campos.join(', ')} — já conferidos contra "${c.citacaoOficial}" (${c.fonte}).`,
  )
  return (
    '\n\nMETADADOS JÁ CONFERIDOS PELO SISTEMA, em publicação do próprio tribunal:\n' +
    linhas.join('\n') +
    '\n\nNÃO reconfira nem contradiga esses campos: eles vêm de publicação oficial e têm precedência sobre o que você encontrar em busca. ' +
    'Se o portal não devolver o processo, isso é limite de cobertura do portal — NÃO é motivo para divergir. ' +
    'Sua tarefa aqui é só uma: ler o que o julgado decide e dizer se sustenta a tese alegada.'
  )
}

// 3 de 57 chamadas do conjunto de teste (5%) falharam com JSON quebrado — o modelo
// às vezes encerra a resposta em prosa depois de usar a ferramenta de busca. Uma
// retentativa com instrução mais dura resolve sem custo relevante, porque só ocorre
// na fração que falhou. Na rodada de 06/08 restou 1 caso em 57 que falhou nas duas
// tentativas: resíduo, não ausência de tratamento.
async function verificaPorBusca(
  citacoesTexto: string,
  tese: string,
  anthropicKey: string,
  confirmados: ConfirmadoBase[] = [],
  buscaExterna = true,
): Promise<{ itens: Item[]; uso: any }> {
  // SEM BUSCA, "NÃO LOCALIZADO" É AFIRMAÇÃO QUE NÃO PODEMOS FAZER.
  //
  // No primeiro teste com a busca desligada (13/08), o modelo devolveu
  // NAO_LOCALIZADO — e a tela exibiu "Não encontrado nos portais consultados".
  // NENHUM portal foi consultado. Dizer que não se encontrou sugere que se
  // procurou; é afirmação diferente de "não procurei", e distinguir essas duas
  // coisas é a razão de existir deste produto.
  //
  // Corrigido POR CÓDIGO, não por instrução no prompt: o modelo já havia sido
  // instruído a devolver IDENTIFICADO e não obedeceu. Instrução é pedido;
  // remapeamento no servidor é garantia.
  const corrigeSemBusca = (r: { itens: Item[]; uso: any }) => {
    if (buscaExterna) return r
    return {
      ...r,
      itens: r.itens.map((i) =>
        i.estado === 'NAO_LOCALIZADO'
          ? {
              ...i,
              estado: 'IDENTIFICADO' as const,
              observacao:
                'A busca externa está desativada por opção do escritório, então esta citação NÃO FOI ' +
                'PROCURADA em portal nenhum — o que não é o mesmo que não ter sido encontrada. ' +
                (i.observacao ?? ''),
            }
          : i,
      ),
    }
  }

  const base = [
    `CITAÇÕES A VERIFICAR (texto colado pelo advogado):\n${citacoesTexto}`,
    tese
      ? `\nTESE QUE O ADVOGADO AFIRMA que esses julgados sustentam:\n"${tese}"\n\nConfira se cada julgado efetivamente sustenta isso. Se ele NÃO sustentar — e você tiver visto o que ele decide —, o estado é DIVERGENTE. Se apenas não conseguiu ler o teor, não é divergência: confirme os metadados e diga que a tese não pôde ser conferida.`
      : '\nO advogado não informou a tese. Confira existência e metadados, e descreva em "o_que_decide" o que cada julgado decide.',
  ].join('\n') + blocoConfirmados(confirmados)

  try {
    return corrigeSemBusca(await chamaModelo(base, anthropicKey, confirmados, buscaExterna))
  } catch (err: any) {
    if (!String(err?.message ?? '').includes('JSON')) throw err
    console.warn('[verify-precedent] JSON quebrado; uma retentativa')
    return corrigeSemBusca(
      await chamaModelo(
        base +
          '\n\nATENÇÃO: sua resposta anterior não veio em JSON. Responda AGORA exclusivamente com o objeto JSON {"itens":[...]}, sem uma palavra antes ou depois, sem cerca de código.',
        anthropicKey,
        confirmados,
        buscaExterna,
      ),
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
// Sufixos que designam um INCIDENTE dentro do processo — agravo regimental,
// embargos, questão de ordem, medida cautelar. Cada um é julgado em sessão
// própria, com relator e data próprios.
// Inclui RG (repercussão geral, reconhecida em plenário virtual, com data
// própria) e os embargos com ordinal — "AP 470 EDj-vigésimos sextos" é um ato
// distinto de "AP 470". Calibrado contra as 246 citações do conjunto de teste:
// 246 acertos, zero falso positivo. Sufixo não detectado volta a comparar e
// pode acusar citação correta, então a cobertura importa.
const ORDINAL =
  '(?:primeir|segund|terceir|quart|quint|sext|s[eé]tim|oitav|non|d[eé]cim|vig[eé]sim|trig[eé]sim)[oa]s?'
const SUFIXO_RE = new RegExp(
  '\\b(?:AgR|AgRg|EDcl|EDv|EDj|ED|MC|QO|REF|EI|RG|ExtN|ProgReg|TrabExt)\\b' +
    '(?:-[A-Za-zÀ-ÿ]+)*(?:\\s+' + ORDINAL + ')*' +
    '|\\b' + ORDINAL + '\\s+julgamento\\b',
  'i',
)

function parseCitacao(c: string) {
  const out: Record<string, string | null> = {
    classe: null, numero: null, relator: null, redator: null, orgao: null, data: null,
    sufixo: null,
  }
  const m = c.match(CLASSES_RE)
  if (m) {
    out.classe = m[1].toUpperCase()
    out.numero = m[2].replace(/\./g, '')
    // procura o sufixo DEPOIS do número, para não confundir com a classe
    const s = c.slice(m.index! + m[0].length, m.index! + m[0].length + 60).match(SUFIXO_RE)
    if (s) out.sufixo = s[0].trim().toUpperCase()
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
  // CITAÇÃO COM SUFIXO APONTA PARA UM INCIDENTE, não para o processo principal —
  // e o incidente tem relator e data próprios. "HC 96.760 AgR" foi relatado por
  // Luiz Fux, enquanto o HC 96.760 é de Eros Grau; a "ADC 1 QO" foi julgada em
  // 27/10/1993 e a ADC 1 em 01/12/1993. Comparar a citação do agravo com o
  // registro do principal produz acusação falsa contra citação correta.
  //
  // Só se abstém de RELATOR, REDATOR e DATA: o órgão julgador do incidente é,
  // em regra, o mesmo do principal, e a classe evidentemente também.
  const norm = (s: string | null) => (s || '').toUpperCase().replace(/[^A-Z]/g, '')
  const atoDiferente = !!citado.sufixo && norm(citado.sufixo) !== norm(obs?.sufixo ?? null)

  for (const [k, rotulo, iguais] of campos) {
    const afirmado = citado[k]
    const visto = obs && typeof obs[k] === 'string' && obs[k].trim() ? obs[k].trim() : null
    if (!afirmado) continue
    if (atoDiferente && (k === 'relator' || k === 'redator' || k === 'data')) {
      naoConferidos.push(rotulo)
      continue
    }
    if (!visto) {
      naoConferidos.push(rotulo)
      continue
    }
    if (iguais(afirmado, visto)) conferidos.push(rotulo)
    else divergencias.push(`${rotulo}: a citação diz "${afirmado}", a fonte registra "${visto}"`)
  }
  return { divergencias, naoConferidos, conferidos, atoDiferente }
}

function hostDe(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function normaliza(i: any, confirmados: ConfirmadoBase[] = []): Item {
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
  const citado = parseCitacao(citacao)
  const cotejo = confronta(citado, i.observado)

  // PRECEDÊNCIA DA BASE (03/08/2026). Entre a coletânea publicada pelo próprio
  // tribunal e o que o modelo diz ter visto numa busca, a coletânea vence.
  // Sem isso, o confronto determinístico virava amplificador do erro do modelo:
  // no POS-017 ele reportou data 2015-09-22 para o HC 123.144 e eu emiti
  // "divergência apurada" com ar de fato — enquanto a citação do STF, repetida
  // em duas páginas da coletânea, diz 10-5-2016.
  const daBase = confirmados.find(
    (c) =>
      c.numero === (citado.numero ?? '') &&
      (!citado.classe || !canonClasse(c.classe) || canonClasse(c.classe) === canonClasse(citado.classe)),
  )
  if (daBase && daBase.campos.length) {
    const suprimidas = cotejo.divergencias.filter((d) =>
      daBase.campos.some((campo) => d.startsWith(campo + ':')),
    )
    if (suprimidas.length) {
      cotejo.divergencias = cotejo.divergencias.filter((d) => !suprimidas.includes(d))
      cotejo.conferidos = Array.from(new Set([...cotejo.conferidos, ...daBase.campos]))
      cotejo.naoConferidos = cotejo.naoConferidos.filter(
        (c) => !daBase.campos.includes(c),
      )

      // ...E DIZER AO USUÁRIO QUAIS FONTES DIVERGEM E O QUE CADA UMA REGISTRA.
      //
      // A precedência da coletânea resolve o julgamento, mas resolvê-lo EM
      // SILÊNCIO esconde do advogado que o próprio STF se contradiz. Foi o caso
      // do HC 87.817 (coletânea: 17/11/2009; acompanhamento processual:
      // 24/11/2009) e do HC 106.709 (28/06/2011 contra 21/06/2011), que ficaram
      // meses anotados como ressalva de auditoria sem chegar a quem usa.
      //
      // "Fontes divergem" sem dizer QUAIS e O QUÊ é alarme, não informação — e
      // seria incompreensível para quem lê. Por isso a ressalva nomeia as duas
      // publicações e transcreve os dois valores. A divergência é do tribunal,
      // não do advogado, e ele precisa saber disso antes de a parte contrária
      // invocar a outra data.
      const detalhe = suprimidas.map((d) => {
        const p = d.match(/^([^:]+): a citação diz "([^"]*)", a fonte registra "([^"]*)"/)
        if (!p) return d
        return (
          `${p[1]} — a Coletânea Temática do STF registra "${p[2]}", que é o mesmo da citação; ` +
          `a busca no acompanhamento processual indicou "${p[3]}"`
        )
      })
      ressalva(
        `DUAS FONTES OFICIAIS DO STF DIVERGEM: ${detalhe.join('. ')}. ` +
          `Adotei a Coletânea Temática por ser publicação do próprio tribunal` +
          (daBase.citacaoOficial ? `, que cita assim: “${daBase.citacaoOficial}”` : '') +
          `. A divergência é entre fontes do STF, não erro da citação — mas confira antes de ` +
          `usar, porque a parte contrária pode invocar a outra data.`,
      )
    }
  }

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
        `NÃO conferidos: ${cotejo.naoConferidos.join(', ')} — estes campos não foram vistos e podem estar errados.` +
        (cotejo.atoDiferente
          ? ` A citação aponta para um incidente do processo (${citado.sufixo}), que é julgado em sessão própria: ` +
            `relator e data do incidente podem diferir dos do processo principal, e por isso não foram comparados.`
          : ''),
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
  } else if (
    estado === 'DIVERGENTE' &&
    cotejo.divergencias.length === 0 &&
    !!url &&
    emDominioOficial &&
    !doTribunalCerto
  ) {
    // DOCUMENTO DE OUTRO TRIBUNAL NÃO SUSTENTA DIVERGÊNCIA. A regra de que a
    // fonte tem de ser do tribunal citado já valia para CONFIRMAR desde 30/07;
    // faltava para DIVERGIR — e a assimetria não se justifica: se um acórdão do
    // TJES não serve para atestar o que o STF decidiu, também não serve para
    // dizer que decidiu outra coisa.
    //
    // Foi o POS-010 da rodada de 06/08: citação correta acusada de divergente
    // com base em "indício de fonte secundária (TJES)". A demoção por ausência
    // de documento não pegava o caso, porque o modelo havia preenchido o que o
    // julgado decide — só que a partir da fonte errada.
    estado = 'NAO_LOCALIZADO'
    url = null
    ressalva(
      `A única fonte encontrada (${host}) não é do tribunal citado (${tribunal}). ` +
        `Documento de outro tribunal não atesta o que este julgado decidiu — nem para confirmar, ` +
        `nem para divergir. Não confirmamos e não acusamos: confira no portal do ${tribunal}.`,
    )
  } else if (
    estado === 'DIVERGENTE' &&
    cotejo.divergencias.length === 0 &&
    // A divergência pode ser de TESE, e o servidor nunca compara tese — só
    // metadado. Se o modelo estabeleceu o que o julgado decide, sua conclusão
    // tem base ainda que a URL não sirva; rebaixar aqui foi o erro da primeira
    // versão desta regra, que derrubou TESE-001 a 003 (divergências corretas)
    // para NAO_LOCALIZADO na rodada de 06/08.
    !String(i.o_que_decide ?? '').trim() &&
    (!url || ehBusca || !emDominioOficial || !doTribunalCerto)
  ) {
    // NÃO ALCANÇAR A FONTE NÃO É INDÍCIO DE DIVERGÊNCIA — é ausência de
    // informação. A regra "DIVERGENTE se sustenta em indício" vale quando HÁ
    // indício: uma fonte secundária que mostre relator diferente sustenta a
    // suspeita, ainda que não sirva para confirmar. Ela não vale quando não há
    // documento nenhum E a comparação de metadados feita aqui não apontou nada.
    //
    // A rodada paga de 06/08 mostrou três citações CORRETAS acusadas de
    // divergir com "não consegui abrir o inteiro teor" / "não alcancei o portal
    // do STF" como única base. Acusar de errada uma citação certa porque o
    // portal não respondeu é o mesmo erro que corrigimos na base do STJ nesta
    // manhã, do outro lado do sistema.
    estado = 'NAO_LOCALIZADO'
    url = null
    ressalva(
      'Não foi possível alcançar o documento no portal do tribunal, e a comparação de metadados feita aqui não apontou divergência alguma. ' +
        'Ausência de fonte não é prova de erro: não confirmamos nem acusamos. Confira no portal antes de usar a citação.',
    )
  } else if (estado === 'DIVERGENTE' && !url) {
    // Sobrou o caso legítimo: o servidor apurou divergência de metadado, mas o
    // documento do tribunal não foi obtido. O achado tem base; a fonte, não.
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

// Enunciado citado dentro de uma observação: corta sem podar o sentido.
// O enunciado já termina em ponto; citá-lo entre aspas e acrescentar outro
// produz `julgador.".` na tela. A pontuação final fica DENTRO das aspas.
const corta = (s: string, n = 220) => (s.length > n ? s.slice(0, n) + '…' : s)
const citado = (s: string) => `"${corta(s)}"`
const dataPt = (d: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : null)

// Negação pesa quase nada em similaridade lexical: "É hediondo o delito" e
// "Não é hediondo o delito" compartilham todo o vocabulário e batem muito acima
// do limiar. No conjunto de teste de 05/08, alegar o OPOSTO EXATO da Súmula 668
// do STJ gerou "o enunciado oficial corresponde à tese alegada" — a pior falha
// possível aqui, porque manda para a peça uma tese invertida com selo de
// conferida.
//
// A contagem de marcadores é grosseira e vai gerar alarme falso em paráfrase
// legítima que troque a construção negativa por outra. Erra para o lado certo:
// deixa de confirmar, nunca confirma errado — e diz ao usuário exatamente por
// que parou, com os dois textos à vista.
const NEGACAO =
  /\b(n[ãa]o|nem|jamais|inexist\w*|descab\w*|incab[íi]ve\w*|vedad[ao]s?|veda|pro[íi]be|proibid[ao]s?|imposs[íi]ve\w*)\b/gi
const contaNegacao = (s: string) => (s.match(NEGACAO) || []).length
const mesmaPolaridade = (a: string, b: string) => contaNegacao(a) === contaNegacao(b)
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
    // A base guarda duas coisas em stj_teses: as teses da Jurisprudência em Teses
    // (com edição) e as 553 súmulas trazidas em 02/08 (sem edição, texto começando
    // por "Súmula N do STJ:"). Sem distinguir, a procedência de uma súmula saía
    // como "Jurisprudência em Teses, ed. null, tese 407" — que erra a fonte e
    // ainda imprime "null" na tela.
    const ehSumulaDaBase = (r: any) =>
      r.edicao == null && /^S[úu]mula\s+\d+\s+d[oe]\s+STJ:/i.test(String(r.tese_text ?? ''))
    const baseNome = (r: any) =>
      ehSumulaDaBase(r) ? 'base oficial de súmulas do STJ' : 'Jurisprudência em Teses do STJ'
    const prov = (r: any) =>
      (ehSumulaDaBase(r)
        ? `STJ — precedente da ${String(r.tese_text).match(/^S[úu]mula\s+\d+/i)?.[0] ?? 'súmula'} do STJ`
        : `STJ — Jurisprudência em Teses${r.area ? ', ' + r.area : ''}, ed. ${r.edicao}, tese ${r.numero_tese}`) +
      (r.fonte_pagina ? ` (pg ${r.fonte_pagina})` : '')

    // 49 registros de stj_teses não são teses: são AVISOS DE CANCELAMENTO que o
    // próprio STJ publica no lugar da tese superada, com a redação anterior
    // logo em seguida. Quem alegar aquela redação casa por similaridade e
    // receberia CONFIRMADO de algo cancelado — o defeito de 05/08 outra vez,
    // agora dentro da Jurisprudência em Teses.
    const cancelada = (r: any) =>
      /(?:determinou|deliberou)[^.]{0,60}cancelamento|cancelamento d[ao]s?\s+(?:s[úu]mula|tese)|cancelou\s+a\s+(?:s[úu]mula|tese)/i
        .test(String(r.tese_text ?? ''))

    // As 553 súmulas antigas têm texto limpo — o detector acima não as alcança.
    // A situação vem agora da própria stj_sumulas, a mesma fonte que a consulta
    // direta por súmula já usava desde 05/08. Sem isto, o sistema respondia
    // coisas opostas sobre a Súmula 603 conforme o caminho.
    const situacaoRuim = (r: any) =>
      !!r.situacao && !['vigente', 'nao_verificada'].includes(String(r.situacao))
    const numSumula = (r: any) =>
      String(r.tese_text ?? '').match(/^S[úu]mula\s+(\d+)/i)?.[1] ?? null

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
          `Divergência apurada na ${baseNome(meta)} — ${cotejo.divergencias.join('; ')}. Fonte: ${prov(meta)}.`,
        ),
      )
      remover.push(cit)
      continue
    }

    // 2) metadado ok e há tese alegada -> casa a tese
    if (tese) {
      const best = rows.reduce((a, b) => ((b.sim ?? 0) > (a.sim ?? 0) ? b : a), rows[0])
      if ((best.sim ?? 0) >= LIMIAR_TESE && situacaoRuim(best)) {
        itens.push(
          item(
            'VIGENCIA_COMPROMETIDA',
            best.tese_text,
            `O julgado existe e os metadados batem, mas a tese alegada é a Súmula ${numSumula(best) ?? ''} ` +
              `do STJ, que em ${dataPt(best.situacao_data) ?? 'data não registrada'} a lista do STJ ` +
              `registrava como **${best.situacao}**. ` +
              (best.nota_situacao ? `${best.nota_situacao} ` : '') +
              `O precedente continua existindo — o que caiu é o enunciado. Fonte: ${prov(best)}.`,
          ),
        )
      } else if ((best.sim ?? 0) >= LIMIAR_TESE && cancelada(best)) {
        itens.push(
          item(
            'VIGENCIA_COMPROMETIDA',
            best.tese_text,
            `O julgado existe e os metadados batem, mas a tese que ele sustentava foi CANCELADA — ` +
              `o que a base registra no lugar dela é o próprio aviso de cancelamento. ` +
              `Registro do STJ: ${citado(String(best.tese_text))} ` +
              `Citar essa tese como vigente derruba o argumento. Fonte: ${prov(best)}.`,
          ),
        )
      } else if ((best.sim ?? 0) >= LIMIAR_TESE && !mesmaPolaridade(tese, String(best.tese_text))) {
        itens.push(
          item(
            'DIVERGENTE',
            best.tese_text,
            `A tese alegada usa quase as mesmas palavras da que o STJ vincula a este julgado, mas com ` +
              `NEGAÇÃO diferente — e inverter a negação inverte o sentido. Por isso não confirmo. ` +
              `Texto oficial: ${citado(String(best.tese_text))} Compare os dois antes de citar. Fonte: ${prov(best)}.`,
          ),
        )
      } else if ((best.sim ?? 0) >= LIMIAR_TESE) {
        itens.push(
          item(
            'CONFIRMADO_BASE_STJ',
            best.tese_text,
            `Confirmado contra a ${baseNome(best)}: o julgado existe, os metadados batem e o STJ o vincula a esta tese. Fonte: ${prov(best)}.`,
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
      // "tese 407 (ed. null)" era o mesmo erro de rótulo da procedência: o que
      // está ali é a Súmula 407, não a tese 407 de edição nenhuma.
      const rotulo = (r: any) =>
        ehSumulaDaBase(r) ? `Súmula ${numSumula(r)} do STJ` : `tese ${r.numero_tese} (ed. ${r.edicao})`
      const onde = rows.slice(0, 3).map(rotulo).join('; ')
      // Sem tese alegada, o julgado citado está intacto — quem caiu foi o
      // enunciado que ele sustenta. Confirmar sem dizer isso seria meia verdade.
      const caidas = rows.filter((r) => situacaoRuim(r) || cancelada(r)).slice(0, 3)
      const alerta = caidas.length
        ? ` ATENÇÃO: ${caidas
            .map((r) => `${rotulo(r)} consta como ${r.situacao ?? 'cancelada'}`)
            .join('; ')} — o precedente existe, o enunciado não vale mais.`
        : ''
      itens.push(
        item(
          'CONFIRMADO_BASE_STJ',
          rows[0].tese_text,
          `Existência e metadados confirmados na ${baseNome(rows[0])}. O julgado é invocado em: ${onde}. Fonte: ${prov(rows[0])}.${alerta}`,
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
// SÚMULA DO STJ — enriquecimento do determinístico (04/08/2026)
//
// O determinístico reconhece o PADRÃO "Súmula N do STJ" e devolvia IDENTIFICADO:
// "reconhecemos a citação, não lemos o texto". Mas as 553 súmulas estão na base
// desde 02/08 — dava para ler. Aqui o item é promovido a CONFIRMADO_BASE_STJ com
// o ENUNCIADO oficial, e, havendo tese alegada, a similaridade decide se ela
// corresponde ao que a súmula diz.
//
// Súmula é o caso mais favorável do produto: o enunciado é curto, fechado e
// autoritativo — não há recorte nem ratio a interpretar, como no STF.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// NÍVEL 1 — Temas de repercussão geral do STF. Custo de IA: zero.
//
// Até 06/08 toda citação de tema saía como IDENTIFICADO ("não lemos a tese") e
// caía no Nível 2, a ~US$0,19. Era a maior lacuna de cobertura que restava, num
// tipo de citação frequentíssimo em peça.
//
// ASSIMETRIA EM RELAÇÃO ÀS SÚMULAS: lá a série é completa e ausência prova
// inexistência. Aqui NÃO: faltam 146 dos 1.430 temas, os sem mérito julgado.
// Por isso um tema fora da base continua IDENTIFICADO — jamais NAO_LOCALIZADO.
// ---------------------------------------------------------------------------
async function enriqueceTemas(itens: Item[], tese: string | null, admin: any): Promise<Item[]> {
  const saida: Item[] = []
  for (const it of itens) {
    const num = it.tipo === 'tema' && it.tribunal === 'STF' ? (it.citacao.match(/(\d[\d.]*)/) || [])[1] : null
    if (!num) {
      saida.push(it) // repetitivo do STJ ainda não tem base — segue identificado
      continue
    }

    let linha: any = null
    try {
      const { data } = await admin.rpc('stf_tema', {
        p_numero: Number(num.replace(/\./g, '')),
        p_tese: tese || '',
      })
      linha = Array.isArray(data) ? data[0] : data
    } catch {
      /* migration ainda não aplicada: mantém o IDENTIFICADO */
    }
    if (!linha?.tese) {
      saida.push(it) // fora da base: pode estar pendente de julgamento
      continue
    }

    const colhido = dataPt(linha.colhido_em) ?? 'data não registrada'
    const julgado = dataPt(linha.data_andamento)
    const paradigma = linha.classe && linha.processo ? `${linha.classe} ${linha.processo}` : null
    const fonte =
      `STF — banco de teses de repercussão geral` +
      (paradigma ? `, paradigma ${paradigma}` : '') +
      (julgado ? `, ${julgado}` : '') +
      ` (colhido em ${colhido})`
    const base = {
      ...it,
      o_que_decide: linha.tese,
      url_oficial: linha.fonte_url || it.url_oficial,
      resolucao: 'base_stf' as const,
    }

    // O STF NEGOU repercussão geral: o texto não é tese firmada, é a decisão de
    // que a matéria é infraconstitucional. Citar como se fixasse tese é erro
    // comum em petição — e confirmar seria endossá-lo.
    if (linha.tem_rg === false) {
      saida.push({
        ...base,
        estado: 'DIVERGENTE',
        observacao:
          `Neste tema o STF NEGOU repercussão geral — não há tese firmada a invocar. ` +
          `O que o tribunal registra é: ${citado(String(linha.tese))} ` +
          `Citá-lo como precedente vinculante inverte o que foi decidido. Fonte: ${fonte}.`,
      })
      continue
    }

    if (!tese) {
      saida.push({
        ...base,
        estado: 'CONFIRMADO_BASE_STF',
        observacao: `Tese firmada conferida no banco de teses do STF. Fonte: ${fonte}.`,
      })
      continue
    }

    const sim = Number(linha.sim ?? 0)
    if (sim >= LIMIAR_TESE && mesmaPolaridade(tese, String(linha.tese))) {
      saida.push({
        ...base,
        estado: 'CONFIRMADO_BASE_STF',
        observacao: `O tema existe e a tese firmada corresponde à alegada. Fonte: ${fonte}.`,
      })
    } else if (sim >= LIMIAR_TESE) {
      saida.push({
        ...base,
        estado: 'DIVERGENTE',
        observacao:
          `A tese alegada usa quase as mesmas palavras da firmada, mas com NEGAÇÃO diferente — ` +
          `e inverter a negação inverte o sentido. Por isso não confirmo. ` +
          `Tese oficial: ${citado(String(linha.tese))} Compare as duas antes de citar. Fonte: ${fonte}.`,
      })
    } else {
      saida.push({
        ...base,
        estado: 'DIVERGENTE',
        observacao:
          `O tema existe, mas a tese que o STF firmou nele não corresponde à alegada. ` +
          `Tese oficial: ${citado(String(linha.tese))} Fonte: ${fonte}.`,
      })
    }
  }
  return saida
}

// ---------------------------------------------------------------------------
// NÍVEL 1 — Precedentes qualificados do TST. Custo de IA: zero.
//
// Fecha a lacuna que o convite de 07/08 expôs: as bases eram todas do STF e do
// STJ, e quem atua na Justiça do Trabalho citava justamente o que não
// cobríamos. Fonte: Índice Temático do TST/SPR, agosto de 2026.
//
// ASSIMETRIA PRÓPRIA, diferente das duas anteriores: o IRR é SÉRIE COMPLETA
// (1 a 313, conferida contra a tabela do NUGEP), então ausência ali é
// informativa; mas o RG dessa base é SELEÇÃO por interesse trabalhista, e a
// ausência de um tema de repercussão geral não diz nada. Por isso nada aqui
// devolve NAO_LOCALIZADO: fora da base, segue IDENTIFICADO.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// NÍVEL 1 — Súmulas do CARF. Custo de IA: zero.
//
// Série completa de 1 a 217, então a ausência é conclusiva.
//
// ESTA BASE RESPONDE UMA PERGUNTA QUE AS OUTRAS NÃO TÊM. Súmula do CARF com
// efeito vinculante OBRIGA A ADMINISTRAÇÃO TRIBUTÁRIA (art. 72 do RICARF) —
// 118 das 217 estão nessa condição. Para quem recorre ao próprio CARF, saber se
// a súmula apenas EXISTE ou se ela OBRIGA O JULGADOR muda a peça inteira: uma é
// argumento, a outra é fundamento que o relator não pode contrariar.
//
// E é por isso que confirmar uma revogada seria o pior erro possível aqui: quem
// a invoca perde o argumento diante de quem conhece a revogação melhor que ele.
// ---------------------------------------------------------------------------
async function enriqueceCarfSumulas(
  itens: Item[],
  tese: string | null,
  admin: any,
): Promise<Item[]> {
  const saida: Item[] = []
  let teto: number | null = null

  for (const it of itens) {
    const num = (it as any)._carfSum as string | undefined
    if (!num) {
      saida.push(it)
      continue
    }
    delete (it as any)._carfSum

    let linha: any = null
    try {
      const { data } = await admin.rpc('carf_sumula', {
        p_numero: Number(num),
        p_tese: tese || '',
      })
      linha = Array.isArray(data) ? data[0] : data
    } catch {
      /* migration ainda não aplicada: mantém o IDENTIFICADO */
    }

    if (!linha) {
      if (teto === null) {
        try {
          const { data } = await admin.rpc('carf_sumula_limite')
          teto = Number(data) || 0
        } catch {
          teto = 0
        }
      }
      if (teto && Number(num) > teto) {
        saida.push({
          ...it,
          estado: 'NAO_LOCALIZADO',
          observacao:
            `O CARF editou ${teto} súmulas. Não existe Súmula CARF nº ${num}. A série está ` +
            `completa na nossa base, por isso a ausência é conclusiva — confira o número.`,
        })
        continue
      }
      saida.push(it)
      continue
    }

    const colhido = dataPt(linha.colhido_em) ?? 'data não registrada'
    const fonte = `CARF — Quadro Geral de Súmulas (colhido em ${colhido})`
    const base = {
      ...it,
      o_que_decide: linha.enunciado || null,
      url_oficial: linha.fonte_url || it.url_oficial,
      resolucao: 'base_stf' as const,
    }
    const comoOCarfEscreve = Array.isArray(linha.notas) && linha.notas.length
      ? ` Como o CARF registra: ${citado(String(linha.notas.join(' ')))}`
      : ''

    if (linha.situacao === 'revogada') {
      saida.push({
        ...base,
        estado: 'VIGENCIA_COMPROMETIDA',
        observacao:
          `A Súmula CARF nº ${num} está REVOGADA.${comoOCarfEscreve} Invocá-la em recurso ao ` +
          `próprio CARF derruba o argumento — o relator conhece a revogação. Fonte: ${fonte}.`,
      })
      continue
    }

    if (linha.situacao === 'vinculante_revogado') {
      saida.push({
        ...base,
        estado: 'VIGENCIA_COMPROMETIDA',
        observacao:
          `A Súmula CARF nº ${num} CONTINUA VÁLIDA, mas PERDEU O EFEITO VINCULANTE: ela já não ` +
          `obriga a administração tributária. Segue servindo como argumento, não como fundamento ` +
          `que o julgador não possa contrariar.${comoOCarfEscreve} Fonte: ${fonte}.`,
      })
      continue
    }

    // A FORÇA, não só a existência. É o que esta base acrescenta.
    const forca = linha.vinculante
      ? ` Esta súmula é VINCULANTE${
          linha.portaria_vinculante ? ` (${linha.portaria_vinculante})` : ''
        } — obriga a administração tributária, nos termos do art. 72 do RICARF.`
      : ` Atenção: esta súmula NÃO tem efeito vinculante. Orienta o CARF, mas não obriga a ` +
        `administração — é argumento, não fundamento incontrastável.`

    if (!linha.enunciado) {
      saida.push({ ...base, estado: 'IDENTIFICADO' })
      continue
    }

    if (!tese) {
      saida.push({
        ...base,
        estado: 'CONFIRMADO_BASE_CARF',
        observacao: `Texto conferido no Quadro Geral de Súmulas do CARF. Fonte: ${fonte}.${forca}`,
      })
      continue
    }

    const sim = Number(linha.sim ?? 0)
    if (sim >= LIMIAR_TESE && mesmaPolaridade(tese, String(linha.enunciado))) {
      saida.push({
        ...base,
        estado: 'CONFIRMADO_BASE_CARF',
        observacao: `A súmula existe e o texto oficial corresponde à tese alegada. Fonte: ${fonte}.${forca}`,
      })
    } else if (sim >= LIMIAR_TESE) {
      saida.push({
        ...base,
        estado: 'DIVERGENTE',
        observacao:
          `A tese alegada usa quase as mesmas palavras da súmula, mas com NEGAÇÃO diferente — ` +
          `e inverter a negação inverte o sentido. Texto oficial: ${citado(String(linha.enunciado))} ` +
          `Fonte: ${fonte}.`,
      })
    } else {
      saida.push({
        ...base,
        estado: 'DIVERGENTE',
        observacao:
          `A súmula existe, mas o que ela enuncia não corresponde à tese alegada. ` +
          `Texto oficial: ${citado(String(linha.enunciado))} Fonte: ${fonte}.`,
      })
    }
  }
  return saida
}

// ---------------------------------------------------------------------------
// NÍVEL 1 — Súmulas do TSE. Custo de IA: zero.
//
// Série completa de 1 a 73, então a ausência é conclusiva: não existe Súmula 74.
//
// O QUE ESTA BASE TEM DE PRÓPRIO é a redação anterior das quatro alteradas. A
// Súmula 6 dizia "É inelegível, para o cargo de prefeito, o cônjuge e os
// parentes ... AINDA QUE este haja renunciado ao cargo há mais de seis meses do
// pleito"; hoje diz "SALVO SE este, reelegível, tenha falecido, renunciado ou se
// afastado definitivamente do cargo até seis meses antes do pleito" — quase o
// contrário na parte final.
//
// Por isso a tese é comparada com as DUAS redações. Quando casa melhor com a
// anterior, a resposta não é um "não confere" seco: é dizer ao advogado que ele
// está com a versão superada na mão. Texto legítimo, publicado pelo TSE, que já
// não vale — o caso que nenhum detector de alucinação pega, porque o texto
// existe e soa correto.
// ---------------------------------------------------------------------------
async function enriqueceTseSumulas(
  itens: Item[],
  tese: string | null,
  admin: any,
): Promise<Item[]> {
  const saida: Item[] = []
  let teto: number | null = null

  for (const it of itens) {
    const num = (it as any)._tseSum as string | undefined
    if (!num) {
      saida.push(it)
      continue
    }
    delete (it as any)._tseSum

    let linha: any = null
    try {
      const { data } = await admin.rpc('tse_sumula', {
        p_numero: Number(num),
        p_tese: tese || '',
      })
      linha = Array.isArray(data) ? data[0] : data
    } catch {
      /* migration ainda não aplicada: mantém o IDENTIFICADO */
    }

    if (!linha) {
      if (teto === null) {
        try {
          const { data } = await admin.rpc('tse_sumula_limite')
          teto = Number(data) || 0
        } catch {
          teto = 0
        }
      }
      if (teto && Number(num) > teto) {
        saida.push({
          ...it,
          estado: 'NAO_LOCALIZADO',
          observacao:
            `O TSE editou ${teto} súmulas. Não existe Súmula ${num} do TSE. A série está ` +
            `completa na nossa base, por isso a ausência é conclusiva — confira o número, ` +
            `ou o tribunal: pode ser súmula do STF ou do STJ.`,
        })
        continue
      }
      saida.push(it)
      continue
    }

    const colhido = dataPt(linha.colhido_em) ?? 'data não registrada'
    const fonte = `TSE — Súmulas do TSE (pg ${linha.fonte_pagina}, colhido em ${colhido})`
    const base = {
      ...it,
      o_que_decide: linha.enunciado || null,
      url_oficial: linha.fonte_url || it.url_oficial,
      resolucao: 'base_stf' as const,
    }

    if (linha.situacao === 'cancelada') {
      saida.push({
        ...base,
        estado: 'VIGENCIA_COMPROMETIDA',
        observacao:
          `A Súmula ${num} do TSE está CANCELADA. ` +
          (linha.nota_cancelamento ? `${linha.nota_cancelamento} ` : '') +
          `Citá-la como vigente derruba o argumento. Fonte: ${fonte}.`,
      })
      continue
    }

    const sim = Number(linha.sim ?? 0)
    const simOrig = Number(linha.sim_original ?? 0)
    const alterada = linha.situacao === 'alterada'

    // A TESE CASA MELHOR COM A REDAÇÃO ANTERIOR. É a descoberta que justifica
    // guardar as duas: não é citação falsa nem tese errada — é a versão certa
    // de um texto que mudou.
    if (alterada && linha.redacao_original && simOrig >= LIMIAR_TESE && simOrig > sim) {
      saida.push({
        ...base,
        estado: 'VIGENCIA_COMPROMETIDA',
        observacao:
          `A tese alegada corresponde à REDAÇÃO ANTERIOR da Súmula ${num} do TSE, não à que ` +
          `está em vigor. O texto que o senhor cita foi mesmo publicado pelo TSE — e foi ` +
          // A origem vem da publicação já com ponto final ("...no PA n. 32345."),
          // e acrescentar o nosso produzia "32345..". O texto é lido por advogado
          // como transcrição — pontuação dobrada denuncia montagem automática.
          `substituído${
            linha.origem_redacao_atual
              ? ` por ${String(linha.origem_redacao_atual).replace(/\s*\.\s*$/, '')}`
              : ''
          }. ` +
          `Redação em vigor: ${citado(String(linha.enunciado))} ` +
          `Redação anterior: ${citado(String(linha.redacao_original))} Fonte: ${fonte}.`,
      })
      continue
    }

    const ressalva = alterada
      ? ` Atenção: esta súmula teve a redação ALTERADA${
          linha.origem_redacao_atual ? ` (${linha.origem_redacao_atual})` : ''
        } — o texto acima é o em vigor, e publicações anteriores trazem outra.`
      : ''
    const comNotas =
      Array.isArray(linha.notas) && linha.notas.length
        ? ` O TSE registra ${linha.notas.length} nota(s) de evolução jurisprudencial sobre este verbete — ` +
          `são comentários do tribunal, não parte do enunciado.`
        : ''

    if (!linha.enunciado) {
      saida.push({ ...base, estado: 'IDENTIFICADO' })
      continue
    }

    if (!tese) {
      saida.push({
        ...base,
        estado: 'CONFIRMADO_BASE_TSE',
        observacao: `Texto conferido na publicação oficial do TSE. Fonte: ${fonte}.${ressalva}${comNotas}`,
      })
      continue
    }

    if (sim >= LIMIAR_TESE && mesmaPolaridade(tese, String(linha.enunciado))) {
      saida.push({
        ...base,
        estado: 'CONFIRMADO_BASE_TSE',
        observacao: `A súmula existe e o texto oficial corresponde à tese alegada. Fonte: ${fonte}.${ressalva}${comNotas}`,
      })
    } else if (sim >= LIMIAR_TESE) {
      saida.push({
        ...base,
        estado: 'DIVERGENTE',
        observacao:
          `A tese alegada usa quase as mesmas palavras da súmula, mas com NEGAÇÃO diferente — ` +
          `e inverter a negação inverte o sentido. Texto oficial: ${citado(String(linha.enunciado))} ` +
          `Fonte: ${fonte}.`,
      })
    } else {
      saida.push({
        ...base,
        estado: 'DIVERGENTE',
        observacao:
          `A súmula existe, mas o que ela enuncia não corresponde à tese alegada. ` +
          `Texto oficial: ${citado(String(linha.enunciado))} Fonte: ${fonte}.${ressalva}`,
      })
    }
  }
  return saida
}

// ---------------------------------------------------------------------------
// NÍVEL 1 — Súmulas, OJs e Precedentes Normativos do TST. Custo de IA: zero.
//
// Fonte: Livro de Súmulas do TST, 1.292 verbetes em sete séries, TODAS
// COMPLETAS — então aqui, ao contrário dos temas, ausência é informativa.
//
// A situação vem do próprio documento. E há um estado que nenhuma outra base
// tinha: CONVERTIDA. "Cancelada em decorrência da sua conversão na Súmula nº
// 405" não é o mesmo que cancelada — o verbete caiu, mas o conteúdo migrou.
// Quem cita a OJ convertida não invoca coisa inexistente: invoca pelo nome
// antigo. Dizer "não existe" seria tão errado quanto confirmar.
// ---------------------------------------------------------------------------
async function enriqueceTstSumulas(
  itens: Item[],
  tese: string | null,
  admin: any,
): Promise<Item[]> {
  const saida: Item[] = []
  let limites: Record<string, number> | null = null
  const limitesDe = async () => {
    if (limites) return limites
    const m: Record<string, number> = {}
    try {
      const { data } = await admin.rpc('tst_sumula_limites')
      for (const l of data ?? []) m[l.tipo] = l.maximo
    } catch {
      /* migration ainda não aplicada */
    }
    limites = m
    return limites
  }

  for (const it of itens) {
    const marca = (it as any)._tstSum as string | undefined
    if (!marca) {
      saida.push(it)
      continue
    }
    let [tipo, num] = marca.split(':')
    delete (it as any)._tstSum

    // CITAÇÃO SEM SUBSEÇÃO ("OJ 191"). Resolve-se pelos TETOS das séries, não
    // por palpite: a SDI-1 vai até 421, a SDI-2 até 158, as transitórias até 79,
    // a SDC até 38. Uma "OJ 191" só pode ser da SDI-1; uma "OJ 30" pode ser de
    // quatro séries, e aí a citação está incompleta — dizer isso ao advogado é
    // mais útil que escolher por ele, e é o tipo de imprecisão que a parte
    // contrária aponta.
    if (tipo === 'OJ?') {
      const tetos = await limitesDe()
      const candidatos = Object.entries(tetos)
        .filter(([t, max]) => t.startsWith('OJ') && Number(num) <= max)
        .map(([t]) => t)
      if (candidatos.length === 0) {
        saida.push({
          ...it,
          estado: 'NAO_LOCALIZADO',
          observacao:
            `Nenhuma série de Orientações Jurisprudenciais do TST chega ao número ${num}. ` +
            `As séries estão completas na nossa base, por isso a ausência é conclusiva.`,
        })
        continue
      }
      if (candidatos.length > 1) {
        saida.push({
          ...it,
          estado: 'IDENTIFICADO',
          observacao:
            `Citação incompleta: existe uma OJ ${num} em mais de uma subseção do TST ` +
            `(${candidatos.join(', ')}), e são verbetes diferentes. Indique a subseção — ` +
            `"OJ ${num} da SDI-1", por exemplo — para que eu confira o texto certo.`,
        })
        continue
      }
      tipo = candidatos[0]
    }

    let linha: any = null
    try {
      const { data } = await admin.rpc('tst_sumula', {
        p_tipo: tipo,
        p_numero: Number(num),
        p_tese: tese || '',
      })
      linha = Array.isArray(data) ? data[0] : data
    } catch {
      /* migration ainda não aplicada: mantém o IDENTIFICADO */
    }

    const nome = (t: string, n: string | number) =>
      t === 'SUM' ? `Súmula ${n} do TST` : t === 'PN' ? `Precedente Normativo ${n}` : `${t}-${n}`

    if (!linha) {
      // Série completa: número acima do teto é prova de inexistência.
      const teto = (await limitesDe())[tipo]
      if (teto && Number(num) > teto) {
        saida.push({
          ...it,
          estado: 'NAO_LOCALIZADO',
          observacao:
            `O TST editou ${teto} verbetes nesta série. Não existe ${nome(tipo, num)}. ` +
            `A série está completa na nossa base, por isso a ausência é conclusiva — ` +
            `confira a citação: pode ser de outra subseção, ou número trocado.`,
        })
        continue
      }
      saida.push(it)
      continue
    }

    const colhido = dataPt(linha.colhido_em) ?? 'data não registrada'
    const fonte = `TST — Livro de Súmulas, OJs e PNs (pg ${linha.fonte_pagina}, colhido em ${colhido})`
    const texto: string | null = linha.texto || null
    const base = {
      ...it,
      o_que_decide: texto || linha.titulo || null,
      url_oficial: linha.fonte_url || it.url_oficial,
      resolucao: 'base_stf' as const,
    }
    const comoOTstEscreve = linha.titulo_bruto
      ? ` Como o TST registra: ${citado(String(linha.titulo_bruto))}`
      : ''

    // CONVERTIDA — o verbete caiu, o conteúdo seguiu noutro lugar.
    if (linha.situacao === 'convertida') {
      saida.push({
        ...base,
        estado: 'VIGENCIA_COMPROMETIDA',
        observacao:
          `${nome(tipo, num)} foi CONVERTIDA: o verbete deixou de existir com esse nome, mas o ` +
          `conteúdo migrou para outro. Não é que a tese tenha caído — mudou de endereço, e citar ` +
          `pelo nome antigo pode ser contraditado.${comoOTstEscreve} Fonte: ${fonte}.`,
      })
      continue
    }

    if (linha.situacao === 'cancelada') {
      saida.push({
        ...base,
        estado: 'VIGENCIA_COMPROMETIDA',
        observacao:
          `${nome(tipo, num)} está CANCELADA segundo o Livro de Súmulas do TST.` +
          comoOTstEscreve +
          ` Citá-la como vigente derruba o argumento. Fonte: ${fonte}.`,
      })
      continue
    }

    const ressalva =
      linha.situacao === 'alterada'
        ? ` Atenção: a redação deste verbete foi ALTERADA — o texto acima é o em vigor, e publicações anteriores trazem outra.`
        : ''
    const natureza =
      linha.natureza === 'negativo'
        ? ' Precedente NEGATIVO: o TST nega o direito nele tratado, não o afirma.'
        : linha.natureza === 'positivo'
          ? ' Precedente positivo: afirma o direito.'
          : ''

    if (!texto) {
      saida.push({
        ...base,
        estado: 'IDENTIFICADO',
        observacao:
          `${nome(tipo, num)} existe, mas o Livro não reproduz o texto deste verbete.` +
          comoOTstEscreve + ` Fonte: ${fonte}.`,
      })
      continue
    }

    if (!tese) {
      saida.push({
        ...base,
        estado: 'CONFIRMADO_BASE_TST',
        observacao: `Texto conferido no Livro de Súmulas do TST. Fonte: ${fonte}.${ressalva}${natureza}`,
      })
      continue
    }

    const sim = Number(linha.sim ?? 0)
    if (sim >= LIMIAR_TESE && mesmaPolaridade(tese, texto)) {
      saida.push({
        ...base,
        estado: 'CONFIRMADO_BASE_TST',
        observacao: `O verbete existe e o texto oficial corresponde à tese alegada. Fonte: ${fonte}.${ressalva}${natureza}`,
      })
    } else if (sim >= LIMIAR_TESE) {
      saida.push({
        ...base,
        estado: 'DIVERGENTE',
        observacao:
          `A tese alegada usa quase as mesmas palavras do verbete, mas com NEGAÇÃO diferente — ` +
          `e inverter a negação inverte o sentido. Por isso não confirmo. ` +
          `Texto oficial: ${citado(texto)} Compare os dois antes de citar. Fonte: ${fonte}.`,
      })
    } else {
      saida.push({
        ...base,
        estado: 'DIVERGENTE',
        observacao:
          `O verbete existe, mas o que ele enuncia não corresponde à tese alegada. ` +
          `Texto oficial: ${citado(texto)} Fonte: ${fonte}.`,
      })
    }
  }
  return saida
}

async function enriqueceTst(itens: Item[], tese: string | null, admin: any): Promise<Item[]> {
  const saida: Item[] = []
  for (const it of itens) {
    const marca = (it as any)._tst as string | undefined
    if (!marca) {
      saida.push(it)
      continue
    }
    const [tipo, num] = marca.split(':')
    delete (it as any)._tst

    let linha: any = null
    try {
      const { data } = await admin.rpc('tst_precedente', {
        p_tipo: tipo,
        p_numero: Number(num),
        p_tese: tese || '',
      })
      linha = Array.isArray(data) ? data[0] : data
    } catch {
      /* migration ainda não aplicada: mantém o IDENTIFICADO */
    }
    const texto: string | null = linha?.tese_firmada || linha?.tese || null
    if (!texto) {
      saida.push(it)
      continue
    }

    const colhido = dataPt(linha.colhido_em) ?? 'data não registrada'
    const fonte =
      `TST — Índice Temático de Precedentes (${linha.tipo} ${linha.numero}` +
      (linha.tribunal ? `, ${linha.tribunal}` : '') +
      `, colhido em ${colhido})`
    const transito = dataPt(linha.transito_julgado)
    const base = {
      ...it,
      o_que_decide: texto,
      url_oficial: linha.fonte_url || it.url_oficial,
      resolucao: 'base_stf' as const,
    }
    // O trânsito em julgado é o que separa precedente firme de tese ainda em
    // discussão — e é o campo que esta fonte dá de graça, ao contrário do STF.
    const ressalva = transito
      ? ` Transitado em julgado em ${transito}.`
      : ` ATENÇÃO: o índice não registra trânsito em julgado para este precedente — pode estar pendente de recurso.`
    const ondeAparece =
      Array.isArray(linha.secoes) && linha.secoes.length
        ? ` Assuntos no índice do TST: ${linha.secoes.slice(0, 3).join('; ')}.`
        : ''

    if (!tese) {
      saida.push({
        ...base,
        estado: 'CONFIRMADO_BASE_TST',
        observacao:
          `Tese conferida no Índice Temático do TST. Processos representativos: ${linha.processos}. ` +
          `Fonte: ${fonte}.${ressalva}${ondeAparece}`,
      })
      continue
    }

    const sim = Number(linha.sim ?? 0)
    if (sim >= LIMIAR_TESE && mesmaPolaridade(tese, texto)) {
      saida.push({
        ...base,
        estado: 'CONFIRMADO_BASE_TST',
        observacao:
          `O precedente existe e a tese firmada corresponde à alegada. Fonte: ${fonte}.${ressalva}`,
      })
    } else if (sim >= LIMIAR_TESE) {
      saida.push({
        ...base,
        estado: 'DIVERGENTE',
        observacao:
          `A tese alegada usa quase as mesmas palavras da firmada, mas com NEGAÇÃO diferente — ` +
          `e inverter a negação inverte o sentido. Por isso não confirmo. ` +
          `Texto oficial: ${citado(texto)} Compare os dois antes de citar. Fonte: ${fonte}.`,
      })
    } else {
      saida.push({
        ...base,
        estado: 'DIVERGENTE',
        observacao:
          `O precedente existe, mas a tese que o ${linha.tribunal?.includes('STF') ? 'STF' : 'TST'} ` +
          `firmou nele não corresponde à alegada. Texto oficial: ${citado(texto)} Fonte: ${fonte}.`,
      })
    }
  }
  return saida
}

async function enriqueceSumulas(
  itens: Item[],
  tese: string | null,
  admin: any,
): Promise<Item[]> {
  const saida: Item[] = []

  // Teto de cada série, buscado no máximo uma vez por verificação.
  let limites: Record<string, { maximo: number; ultima: string | null }> | null = null
  const limitesDe = async () => {
    if (limites) return limites
    const m: Record<string, { maximo: number; ultima: string | null }> = {}
    try {
      const { data } = await admin.rpc('sumula_limites')
      for (const l of data ?? []) m[l.base] = { maximo: l.maximo, ultima: l.ultima_publicacao }
    } catch {
      /* migration ainda não aplicada: segue sem afirmar inexistência */
    }
    limites = m
    return limites
  }

  for (const it of itens) {
    const ehSumula = it.tipo === 'sumula' || it.tipo === 'sumula_vinculante'
    const num = ehSumula ? (it.citacao.match(/(\d+)/) || [])[1] : null
    if (!num) {
      saida.push(it)
      continue
    }

    const doStf = it.tribunal === 'STF'
    let linha: any = null
    try {
      const { data } = doStf
        ? await admin.rpc('stf_sumula', {
            p_numero: Number(num),
            p_vinculante: it.tipo === 'sumula_vinculante',
            p_tese: tese || '',
          })
        : await admin.rpc('stj_sumula', { p_numero: Number(num), p_tese: tese || '' })
      linha = Array.isArray(data) ? data[0] : data
    } catch {
      /* migration ainda não aplicada: mantém o IDENTIFICADO */
    }
    if (!linha?.enunciado) {
      // Série completa na base: número acima do teto é INEXISTÊNCIA, não ausência.
      // Dizer "não leu o texto" aqui seria reticência sobre algo que sabemos.
      const serie = doStf
        ? it.tipo === 'sumula_vinculante'
          ? 'stf_vinculante'
          : 'stf_comum'
        : 'stj'
      const lim = (await limitesDe())[serie]
      if (lim && Number(num) > lim.maximo) {
        const comoSeChama =
          serie === 'stf_vinculante' ? `Súmula Vinculante ${num}` : `Súmula ${num} do ${it.tribunal}`
        const oQueExiste =
          serie === 'stj'
            ? `O STJ editou ${lim.maximo} súmulas, a última publicada em ${dataPt(lim.ultima) ?? 'data não registrada'}.`
            : serie === 'stf_vinculante'
              ? `O STF editou ${lim.maximo} súmulas vinculantes.`
              : `As súmulas comuns do STF vão de 1 a ${lim.maximo} — o tribunal deixou de editá-las em 2003, ` +
                `passando a usar súmulas vinculantes e repercussão geral após a EC 45/2004.`
        saida.push({
          ...it,
          estado: 'NAO_LOCALIZADO',
          observacao:
            `${oQueExiste} Não existe ${comoSeChama}. ` +
            `Nossa base cobre a série inteira, por isso a ausência é conclusiva — não é falta de consulta. ` +
            `Confira a citação: pode ser súmula de outro tribunal, ou número trocado.`,
        })
        continue
      }
      saida.push(it) // dentro da faixa e fora da base — segue identificada
      continue
    }

    // A base do STJ guarda o enunciado com o prefixo "Súmula N do STJ: " embutido
    // no tese_text; a do STF, não. Tirar aqui deixa o texto uniforme na tela — a
    // citação já aparece logo acima, repeti-la dentro do enunciado é ruído.
    const enunciado: string = String(linha.enunciado).replace(
      /^S[úu]mula\s+(?:Vinculante\s+)?\d+\s+d[oe]\s+ST[FJ]:\s*/i,
      '',
    )
    const fonte = doStf
      ? `STF — Súmulas Vinculantes: aplicação e interpretação pelo STF` +
        (linha.fonte_pagina ? ` (pg ${linha.fonte_pagina})` : '')
      : `STJ — ${linha.area ? linha.area + ', ' : ''}base oficial de súmulas` +
        (linha.fonte_pagina ? ` (pg ${linha.fonte_pagina})` : '')
    const confirmado: Estado = doStf ? 'CONFIRMADO_BASE_STF' : 'CONFIRMADO_BASE_STJ'
    const base = {
      ...it,
      o_que_decide: enunciado,
      url_oficial: linha.fonte_url || it.url_oficial,
      resolucao: (doStf ? 'base_stf' : 'base_stj') as 'base_stf' | 'base_stj',
    }

    // ---- VIGÊNCIA, antes de qualquer confirmação ------------------------------
    // Enunciado e situação têm validades diferentes: o texto das 736 comuns está
    // congelado desde 2003, a situação muda a qualquer momento. Por isso cada um
    // vem com a data da SUA fonte, e nenhuma afirmação sai sem ela.
    const situacao: string | null = linha.situacao ?? null
    const dataSit: string | null = linha.situacao_data
      ? String(linha.situacao_data).slice(0, 10)
      : null
    const emPt = (d: string | null) =>
      d ? d.split('-').reverse().join('/') : 'data não registrada'

    // 'alterada' NÃO é queda: o enunciado em vigor é o que temos, e o texto antigo
    // fica em redacao_anterior. Tratá-la como as canceladas seria alarme falso —
    // a Súmula 309 (prisão civil por alimentos) mudou de redação e segue valendo.
    // O risco real é outro: manuais e petições antigas ainda citam o texto velho.
    // Quando é ELE que o usuário alega, dizer "divergente" esconde o que importa.
    if (situacao === 'alterada') {
      const anterior: string | null = linha.redacao_anterior ?? null
      const simAnt = Number(linha.sim_anterior ?? 0)
      if (
        anterior &&
        simAnt >= LIMIAR_TESE &&
        simAnt > Number(linha.sim ?? 0) &&
        mesmaPolaridade(tese ?? '', anterior)
      ) {
        saida.push({
          ...base,
          estado: 'VIGENCIA_COMPROMETIDA',
          observacao:
            `A súmula existe, mas a tese alegada corresponde à REDAÇÃO ANTERIOR dela, ` +
            `não à que está em vigor. ` +
            (linha.nota_situacao ? `${linha.nota_situacao} ` : '') +
            `Texto em vigor: ${citado(enunciado)} ` +
            `Situação conferida na lista do ${it.tribunal} em ${emPt(dataSit)}. Fonte: ${fonte}.`,
        })
        continue
      }
    }

    if (situacao && !['vigente', 'nao_verificada', 'alterada'].includes(situacao)) {
      saida.push({
        ...base,
        estado: 'VIGENCIA_COMPROMETIDA',
        observacao:
          `O enunciado existe e é este, mas em ${emPt(dataSit)} a lista do ${it.tribunal} ` +
          `registrava a súmula como **${situacao}**. ` +
          (linha.nota_situacao ? `${linha.nota_situacao} ` : '') +
          (it.tipo === 'sumula_vinculante'
            ? 'Atenção: contra ato que aplique indevidamente súmula vinculante cabe reclamação ao STF (Lei 11.417/2006, art. 7º). '
            : '') +
          `Confirme a situação atual no portal antes de usar. Fonte do texto: ${fonte}.`,
      })
      continue
    }

    // Situação não conferida não é sinônimo de vigente — e precisa ser dita.
    const ressalvaVigencia =
      situacao === 'vigente'
        ? ` Situação conferida na lista do ${it.tribunal} em ${emPt(dataSit)} — a lista muda, confira se for citar em peça.`
        : situacao === 'alterada'
          ? ` Atenção: a redação deste enunciado foi ALTERADA — o texto acima é o em vigor, ` +
            `conferido em ${emPt(dataSit)}, e publicações anteriores trazem outra. ` +
            (linha.nota_situacao ?? '')
          : ` A SITUAÇÃO (vigente, superada, cancelada) NÃO foi conferida: temos o texto, não o estado atual.`

    // Sem tese alegada: confirma e entrega o enunciado.
    if (!tese) {
      saida.push({
        ...base,
        estado: confirmado,
        observacao: `Enunciado conferido na publicação oficial. Fonte: ${fonte}.${ressalvaVigencia}`,
      })
      continue
    }

    // Com tese alegada: o enunciado é curto e fechado, então a comparação
    // lexical é confiável aqui — diferente do recorte de coletânea do STF.
    const sim = Number(linha.sim ?? 0)
    if (sim >= LIMIAR_TESE && mesmaPolaridade(tese, enunciado)) {
      saida.push({
        ...base,
        estado: confirmado,
        observacao: `A súmula existe e o enunciado oficial corresponde à tese alegada. Fonte: ${fonte}.${ressalvaVigencia}`,
      })
    } else if (sim >= LIMIAR_TESE) {
      // Vocabulário quase idêntico, negação diferente: o caso clássico de tese
      // invertida. Não confirmar é obrigatório; explicar por quê é o que
      // permite ao usuário resolver em dez segundos, com os dois textos à vista.
      saida.push({
        ...base,
        estado: 'DIVERGENTE',
        observacao:
          `A tese alegada usa quase as mesmas palavras do enunciado, mas com NEGAÇÃO diferente — ` +
          `e inverter a negação inverte o sentido. Por isso não confirmo. ` +
          `Texto oficial: ${citado(enunciado)} Compare os dois antes de citar. Fonte: ${fonte}.`,
      })
    } else {
      saida.push({
        ...base,
        estado: 'DIVERGENTE',
        observacao:
          `A súmula existe, mas o que ela enuncia não corresponde à tese alegada. ` +
          `Texto oficial: ${citado(enunciado)} Fonte: ${fonte}.`,
      })
    }
  }
  return saida
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

// O que a base já atestou, para o Nível 2 não refazer nem contradizer.
export interface ConfirmadoBase {
  classe: string
  numero: string
  campos: string[] // rótulos: relator, órgão julgador, data de julgamento...
  citacaoOficial: string
  fonte: string
}

async function verificaPorBaseStf(
  texto: string,
  tese: string | null,
  admin: any,
): Promise<{ itens: Item[]; resto: string; confirmados: ConfirmadoBase[] }> {
  const itens: Item[] = []
  const remover: string[] = []
  const confirmados: ConfirmadoBase[] = []
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
      // a coletânea guarda o sufixo em campo próprio: "HC 96.760 AgR" e
      // "HC 96.760" são registros distintos, com relatores distintos
      sufixo: meta.sufixo ?? null,
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

    // 2) metadado ok E há tese alegada -> Nível 2 (só ele lê a tese).
    // Mas o que a base atestou vai JUNTO: sem isso o Nível 2 refazia o trabalho,
    // não achava o processo no portal (que é uma SPA) e divergia por não achar —
    // 5 dos 8 falsos divergentes da rodada 3 eram exatamente isso.
    if (tese) {
      confirmados.push({
        classe: meta.classe,
        numero: meta.numero,
        campos: cotejo.conferidos,
        citacaoOficial: meta.citacao,
        fonte: prov,
      })
      continue
    }

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
  return { itens, resto, confirmados }
}

// SSE. A Edge Function do Supabase corta a requisição aos 150s SEM TRÁFEGO, e
// como a chamada ao modelo é um await único, tudo conta como ocioso: uma
// verificação demorada morria em 504 IDLE_TIMEOUT — no runner e, pior, na tela do
// advogado (caso POS-019 da rodada 4). O batimento a cada 12s mantém bytes
// fluindo e, de quebra, mostra a quem espera o que está acontecendo.
function respostaStream(trabalho: (send: (d: any) => void) => Promise<any>): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (d: any) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(d)}\n\n`))
        } catch {
          /* cliente desconectou */
        }
      }
      const batimento = setInterval(
        () => send({ tipo: 'progresso', etapa: 'Consultando fontes oficiais…' }),
        12_000,
      )
      try {
        const payload = await trabalho(send)
        send({ tipo: 'resultado', ...payload })
      } catch (e: any) {
        console.error('[verify-precedent/stream]', e?.message ?? e)
        send({
          tipo: 'resultado',
          status: 'error',
          code: 'internal',
          message: e?.message ?? 'Falha ao verificar. Tente novamente.',
        })
      } finally {
        clearInterval(batimento)
        try {
          controller.close()
        } catch {
          /* já fechado */
        }
      }
    },
  })
  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Streaming só a pedido do cliente — mantém compatível quem consome JSON.
  const querStream = (req.headers.get('Accept') ?? '').includes('text/event-stream')

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
    // O corte em 2.000 existe para limitar o que vai ao MODELO, e só para isso.
    // O Nível 1 compara contra o banco, sem custo — e comparar uma tese cortada
    // com o texto oficial inteiro produz falsa divergência: foi o que aconteceu
    // com o Tema 6 (2.657 caracteres), acusado de "negação diferente" quando a
    // tese alegada era idêntica à firmada. Ao truncar, sumiram negações que só
    // existiam depois do caractere 2.000.
    const teseIntegral = String(payload?.tese ?? '').trim().slice(0, 20000)
    const tese = teseIntegral.slice(0, 2000)
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
      const miolo = async () => {
        const { itens: det0, resto: r0 } = resolveDeterministico(texto)
        const det = await enriqueceCarfSumulas(
          await enriqueceTseSumulas(
            await enriqueceTstSumulas(
              await enriqueceTst(
                await enriqueceTemas(
                  await enriqueceSumulas(det0, teseIntegral, admin),
                  teseIntegral,
                  admin,
                ),
                teseIntegral,
                admin,
              ),
              teseIntegral,
              admin,
            ),
            teseIntegral,
            admin,
          ),
          teseIntegral,
          admin,
        )
        const { itens: baseStj, resto: r1 } = await verificaPorBaseStj(r0, teseIntegral, admin)
        const { itens: baseStf, resto, confirmados } = await verificaPorBaseStf(r1, teseIntegral, admin)
        let busca: Item[] = []
        let usoLote: any = {}
        if (/[A-Za-z]{2,6}\s*n?[ºo.]?\s*[\d][\d.]{2,}/.test(resto)) {
          const r = await verificaPorBusca(resto.slice(0, 6000), tese, anthropicKey, confirmados)
          busca = r.itens.slice(0, MAX_CITACOES)
          usoLote = r.uso
        }
        return {
          status: 'ok',
          modo: 'lote',
          itens: [...det, ...baseStj, ...baseStf, ...busca],
          uso: usoLote, // bruto, para conferir a fórmula de custo por fora
          custo_usd: Number(custo(usoLote).toFixed(6)),
        }
      }

      // O batimento SSE de 12s existe para atravessar o corte de 150s SEM
      // TRÁFEGO da Edge Function — e até 06/08 valia só no caminho da tela. O
      // lote devolvia JSON de uma vez, então toda verificação longa morria em
      // IDLE_TIMEOUT: pagávamos a chamada e não recebíamos o resultado. Um
      // conjunto de teste que perde justamente os casos mais demorados mede o
      // sistema pelo lado fácil. O executor já aceita as duas formas.
      if ((req.headers.get('accept') || '').includes('text/event-stream')) {
        return respostaStream(miolo)
      }
      return json(await miolo())
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

    // Interruptor de busca externa, por escritório. Padrão LIGADO: falha de
    // leitura, coluna ausente ou workspace sem preferência mantêm o
    // comportamento atual. Desligar é ato deliberado — e o `!== false` garante
    // que só o valor explícito desliga.
    const { data: wsCfg } = await admin
      .from('workspaces')
      .select('busca_externa')
      .eq('id', perfil.workspace_id)
      .maybeSingle()
    const buscaExterna = wsCfg?.busca_externa !== false

    // ---- teto diário do plano, por CUSTO (por escritório)
    // Contar chamadas deixou de fazer sentido quando o Nível 1 entrou: uma
    // verificação resolvida na base custa ~US$ 0 e uma do Nível 2 custa ~US$ 0,19.
    // Contar chamadas punia justamente quem só confere súmula e tese — quem usa
    // o caminho barato. O que precisa ser limitado é a despesa, não o uso.
    const inicioDia = new Date()
    inicioDia.setUTCHours(3, 0, 0, 0) // ~00h em America/Sao_Paulo
    if (inicioDia.getTime() > Date.now()) inicioDia.setUTCDate(inicioDia.getUTCDate() - 1)
    const { data: doDia } = await admin
      .from('precedent_verifications')
      .select('estimated_cost')
      .eq('workspace_id', perfil.workspace_id)
      .gte('created_at', inicioDia.toISOString())
    const linhasDia = Array.isArray(doDia) ? doDia : []
    const gastoDia = linhasDia.reduce((s: number, r: any) => s + Number(r.estimated_cost || 0), 0)
    const consumo = linhasDia.length

    // teto pela faixa comercial do escritório
    let plano = 'beta'
    try {
      const { data: p } = await admin.rpc('plano_do_workspace', {
        p_workspace: perfil.workspace_id,
      })
      if (typeof p === 'string' && p) plano = p
    } catch {
      /* migration ainda não aplicada: cai no padrão */
    }
    const tetoUsd = TETO_POR_PLANO[plano] ?? TETO_PADRAO_USD

    if (gastoDia >= tetoUsd || consumo >= TETO_CHAMADAS_DIA) {
      const porCusto = gastoDia >= tetoUsd
      return json(
        {
          status: 'error',
          code: 'daily_cap',
          message: porCusto
            ? 'O limite diário de verificações deste escritório foi atingido. O contador zera à meia-noite. ' +
              'Consultas a súmula, tema e a julgados já conferidos na base oficial não consomem esse limite.'
            : `Limite de ${TETO_CHAMADAS_DIA} verificações no dia atingido. O contador zera à meia-noite.`,
          consumo_hoje: consumo,
          teto_diario: TETO_CHAMADAS_DIA,
        },
        429,
      )
    }

    const trabalho = async (send: (d: any) => void) => {
    // ---- 1) determinístico (sem custo de IA), com súmula do STJ lida na base
    const { itens: det0, resto: r0 } = resolveDeterministico(texto)
    const deterministicos = await enriqueceCarfSumulas(
      await enriqueceTseSumulas(
        await enriqueceTstSumulas(
          await enriqueceTst(
            await enriqueceTemas(
              await enriqueceSumulas(det0, teseIntegral, admin),
              teseIntegral,
              admin,
            ),
            teseIntegral,
            admin,
          ),
          teseIntegral,
          admin,
        ),
        teseIntegral,
        admin,
      ),
      teseIntegral,
      admin,
    )

    // ---- 2) Nível 1: bases canônicas (sem custo de IA)
    //   STJ primeiro: a citação de lá exige /UF, o que a torna inequívoca.
    //   STF depois: HC, MS, Rcl, Inq e AP existem nos dois tribunais, então a
    //   camada do STF só atribui o processo com corroboração de metadado.
    const { itens: baseStj, resto: r1 } = await verificaPorBaseStj(r0, teseIntegral, admin)
    const { itens: baseStf, resto, confirmados } = await verificaPorBaseStf(r1, teseIntegral, admin)
    const naBase = baseStj.length + baseStf.length
    if (naBase) {
      send({
        tipo: 'progresso',
        etapa: `${naBase} citação(ões) conferida(s) nas bases oficiais, sem consulta externa…`,
      })
    }

    // ---- 3) Nível 2: busca, só no que as bases não cobriram
    let porBusca: Item[] = []
    let uso: any = {}
    const temAcordao = /[A-Za-z]{2,6}\s*n?[ºo.]?\s*[\d][\d.]{2,}/.test(resto)
    if (temAcordao) {
      send({ tipo: 'progresso', etapa: 'Consultando os portais oficiais dos tribunais…' })
      const r = await verificaPorBusca(
        resto.slice(0, 6000),
        tese,
        anthropicKey,
        confirmados,
        buscaExterna,
      )
      porBusca = r.itens.slice(0, MAX_CITACOES)
      uso = r.uso
    }

    const itens = [...deterministicos, ...baseStj, ...baseStf, ...porBusca]
    if (itens.length === 0) {
      return {
        status: 'ok',
        itens: [],
        aviso:
          'Não reconhecemos nenhuma citação de jurisprudência no texto. Verifique o formato — ex.: "HC 103.118", "Súmula Vinculante 11", "Tema 121 do STF".',
        consumo_hoje: consumo,
        teto_diario: TETO_CHAMADAS_DIA,
      }
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
      // Um contador por FAMÍLIA de estado, e a soma tem de fechar com
      // n_citacoes. Entre 30/07 e 11/08 não fechava: VIGENCIA_COMPROMETIDA e
      // IDENTIFICADO ficaram sem coluna, e 7 das 29 citações verificadas não
      // apareciam em medição nenhuma — justamente o alerta que distingue este
      // produto de um detector. A view vw_precver_integridade denuncia o dia em
      // que isso se repetir.
      n_confirmado: itens.filter((i) => i.estado.startsWith('CONFIRMADO')).length,
      n_divergente: conta('DIVERGENTE'),
      n_nao_local: conta('NAO_LOCALIZADO'),
      n_identificado: conta('IDENTIFICADO'),
      n_vigencia_comprometida: conta('VIGENCIA_COMPROMETIDA'),
      input_tokens: uso.input_tokens ?? 0,
      output_tokens: uso.output_tokens ?? 0,
      cache_read_tokens: uso.cache_read_input_tokens ?? 0,
      cache_write_tokens: uso.cache_creation_input_tokens ?? 0,
      estimated_cost: custoUsd,
      modelo: temAcordao ? MODELO : 'deterministico',
    })

      return {
        status: 'ok',
        itens,
        consumo_hoje: consumo + 1,
        teto_diario: TETO_CHAMADAS_DIA,
        custo_usd: Number(custoUsd.toFixed(6)),
        dominios_consultados: DOMINIOS_OFICIAIS,
      }
    }

    if (querStream) return respostaStream(trabalho)
    return json(await trabalho(() => {}))
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
