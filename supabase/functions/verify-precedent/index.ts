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

const TETO_DIARIO = 40 // verificações por escritório por dia (plano; decisão de 30/07)
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
  resolucao: 'deterministica' | 'busca'
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
3. Não avalie se o precedente serve ao caso do usuário. Isso é juízo do advogado.
4. Na dúvida entre CONFIRMADO_INTEIRO_TEOR e CONFIRMADO_METADADOS, escolha o segundo. Superestimar o grau de confirmação é o pior erro possível aqui.
5. Não prometa resultado nem opine sobre chance de êxito.
6. Página de BUSCA não é documento. Se o que você tem é um endereço de pesquisa (pages/search, pesquisar.jsp, ?queryString=), isso não é a fonte do julgado — deixe "url_oficial" nula e explique que não alcançou o documento. O sistema já oferece o link de busca por conta própria.

Responda SOMENTE com JSON válido: {"itens":[...]}. Sem markdown, sem comentário.`

async function verificaPorBusca(
  citacoesTexto: string,
  tese: string,
  anthropicKey: string,
): Promise<{ itens: Item[]; uso: any }> {
  const userMsg = [
    `CITAÇÕES A VERIFICAR (texto colado pelo advogado):\n${citacoesTexto}`,
    tese
      ? `\nTESE QUE O ADVOGADO AFIRMA que esses julgados sustentam:\n"${tese}"\n\nConfira se cada julgado efetivamente sustenta isso. Se não sustentar, o estado é DIVERGENTE.`
      : '\nO advogado não informou a tese. Confira existência e metadados, e descreva em "o_que_decide" o que cada julgado decide.',
  ].join('\n')

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
          max_uses: 8,
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

// Regras de produto aplicadas NO SERVIDOR, nunca confiadas ao modelo:
//   (a) sem URL oficial, nenhum estado de confirmação sobrevive;
//   (b) a URL tem de ser do TRIBUNAL CITADO — domínio oficial não basta.
// (b) nasceu da falha de 30/07/2026: o modelo devolveu um acórdão do TRF3 como
// fonte de um HC do STF. Link oficial, tribunal errado, selo de confirmado.
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
    resolucao: 'busca',
  })

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

    const admin = createClient(url, serviceKey)
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
    const { itens: deterministicos, resto } = resolveDeterministico(texto)

    // ---- 2) busca, só se sobrou algo que pareça acórdão
    let porBusca: Item[] = []
    let uso: any = {}
    const temAcordao = /[A-Za-z]{2,6}\s*n?[ºo.]?\s*[\d][\d.]{2,}/.test(resto)
    if (temAcordao) {
      const r = await verificaPorBusca(resto.slice(0, 6000), tese, anthropicKey)
      porBusca = r.itens.slice(0, MAX_CITACOES)
      uso = r.uso
    }

    const itens = [...deterministicos, ...porBusca]
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
      n_confirmado: conta('CONFIRMADO_INTEIRO_TEOR') + conta('CONFIRMADO_METADADOS'),
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
