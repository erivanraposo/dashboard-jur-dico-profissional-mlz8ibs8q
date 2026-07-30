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
  | 'DIVERGENTE'
  | 'NAO_LOCALIZADO'

interface Item {
  citacao: string
  tipo: 'sumula' | 'sumula_vinculante' | 'tema' | 'acordao'
  estado: Estado
  url_oficial: string | null
  o_que_decide: string | null
  observacao: string | null
  resolucao: 'deterministica' | 'busca'
}

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

  // Súmula vinculante do STF
  consome(/\bs[úu]mula\s+vinculante\s+(?:n[ºo.]?\s*)?(\d+)(?:\s+d[oe]\s+stf)?\b/gi, (m) => ({
    citacao: m[0].trim(),
    tipo: 'sumula_vinculante',
    estado: 'CONFIRMADO_METADADOS',
    url_oficial: `https://portal.stf.jus.br/jurisprudencia/menuSumario.asp?sumula=${m[1]}`,
    o_que_decide: null,
    observacao:
      'Enunciado localizado por resolução direta no portal do STF. Confira o teor na página oficial — o texto da súmula não foi lido pelo sistema.',
    resolucao: 'deterministica',
  }))

  // Súmula do STF / STJ
  consome(/\bs[úu]mula\s+(?:n[ºo.]?\s*)?(\d+)\s+d[oe]\s+(stf|stj)\b/gi, (m) => {
    const trib = m[2].toUpperCase()
    return {
      citacao: m[0].trim(),
      tipo: 'sumula',
      estado: 'CONFIRMADO_METADADOS',
      url_oficial:
        trib === 'STJ'
          ? `https://scon.stj.jus.br/SCON/sumanot/toc.jsp?sumano=${m[1]}`
          : `https://www.stf.jus.br/portal/jurisprudencia/menuSumarioSumulas.asp?sumula=${m[1]}`,
      o_que_decide: null,
      observacao: `Enunciado localizado por resolução direta no portal do ${trib}. Confira o teor na página oficial.`,
      resolucao: 'deterministica',
    }
  })

  // Tema de repercussão geral (STF) ou repetitivo (STJ)
  consome(/\btema\s+(?:n[ºo.]?\s*)?([\d.]+)\s+d[oe]\s+(stf|stj)\b/gi, (m) => {
    const num = m[1].replace(/\./g, '')
    const trib = m[2].toUpperCase()
    return {
      citacao: m[0].trim(),
      tipo: 'tema',
      estado: 'CONFIRMADO_METADADOS',
      url_oficial:
        trib === 'STJ'
          ? `https://processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp?numero=${num}`
          : `https://portal.stf.jus.br/jurisprudenciaRepercussao/tema.asp?num=${num}`,
      o_que_decide: null,
      observacao: `Tema localizado por resolução direta no portal do ${trib}. Confira a tese firmada na página oficial.`,
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
- "estado": um de
  * CONFIRMADO_INTEIRO_TEOR — você localizou o julgado em fonte oficial E leu conteúdo suficiente para dizer o que ele decide
  * CONFIRMADO_METADADOS — o processo existe (número/classe/órgão/data batem), mas o inteiro teor não estava acessível
  * DIVERGENTE — o julgado existe, porém algum dado da citação não confere (relator, data, órgão, classe) OU ele não decide o que a tese alegada afirma
  * NAO_LOCALIZADO — não encontrado nos portais consultados
- "url_oficial": URL em domínio oficial. OBRIGATÓRIA quando o estado não for NAO_LOCALIZADO. Sem URL, o estado é NAO_LOCALIZADO — nunca invente endereço.
- "o_que_decide": em uma ou duas frases, o que o julgado efetivamente decide, conforme a fonte lida. null se não leu.
- "observacao": o que exatamente diverge, ou o que não foi possível conferir. Seja específico: "o relator é o min. X, não o min. Y" vale; "dados divergentes" não vale.

REGRAS INEGOCIÁVEIS
1. NAO_LOCALIZADO significa "não encontrei nos portais consultados", NUNCA "não existe" e NUNCA "é falso". Diga isso na observação.
2. Se a tese alegada pelo usuário não corresponder ao que o julgado decide, o estado é DIVERGENTE mesmo que todos os metadados estejam corretos. Esse é o caso mais importante: aponte a diferença explicitamente.
3. Não avalie se o precedente serve ao caso do usuário. Isso é juízo do advogado.
4. Na dúvida entre CONFIRMADO_INTEIRO_TEOR e CONFIRMADO_METADADOS, escolha o segundo. Superestimar o grau de confirmação é o pior erro possível aqui.
5. Não prometa resultado nem opine sobre chance de êxito.

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

// Regra de produto aplicada no servidor, não confiada ao modelo:
// sem URL oficial, nenhum estado de confirmação sobrevive.
function normaliza(i: any): Item {
  const url = typeof i.url_oficial === 'string' && /^https?:\/\//i.test(i.url_oficial)
    ? i.url_oficial
    : null
  const oficial =
    url && DOMINIOS_OFICIAIS.some((d) => {
      try {
        return new URL(url).hostname.endsWith(d)
      } catch {
        return false
      }
    })
  let estado: Estado = ['CONFIRMADO_INTEIRO_TEOR', 'CONFIRMADO_METADADOS', 'DIVERGENTE'].includes(
    i.estado,
  )
    ? i.estado
    : 'NAO_LOCALIZADO'
  let observacao = i.observacao ?? null
  if (!oficial && estado !== 'NAO_LOCALIZADO') {
    estado = 'NAO_LOCALIZADO'
    observacao =
      'O sistema não obteve URL em domínio oficial para esta citação. Sem fonte verificável, não confirmamos — o que não significa que a citação seja falsa.'
  }
  return {
    citacao: String(i.citacao ?? '').slice(0, 300),
    tipo: 'acordao',
    estado,
    url_oficial: oficial ? url : null,
    o_que_decide: i.o_que_decide ?? null,
    observacao,
    resolucao: 'busca',
  }
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
