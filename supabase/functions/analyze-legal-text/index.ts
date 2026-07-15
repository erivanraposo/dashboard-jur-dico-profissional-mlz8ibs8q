import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { PDFDocument } from 'npm:pdf-lib@1.17.1'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

// ============================================================================
// Helper: prepara anexos para Claude via Files API + visao multimodal nativa.
//
// PDFs sao splittados em chunks de ate 100 paginas (limite Anthropic por doc),
// uploadados para a Anthropic Files API e referenciados por file_id (evita
// estouro de tamanho de request body que ocorre quando se usa base64 inline).
//
// Files API:
//   POST https://api.anthropic.com/v1/files (multipart/form-data, beta header
//   'files-api-2025-04-14'). Arquivos persistem 30 dias e nao tem custo de
//   upload (so contam tokens no uso). file_id pode ser reusado entre os
//   varios agentes que processam o mesmo documento — combinado com
//   cache_control, garante reuso maximo do prefix entre as chamadas.
//
// DOCX/XLSX/TXT continuam pelo extract-document (texto puro, formatos
// textuais nativos).
//
// Retorno:
//   documentBlocks: array de blocos {type:'document', source:{type:'file',file_id},
//                   cache_control} para serem incluidos como content da
//                   mensagem user. cache_control nos ate 4 ultimos blocos
//                   (limite Anthropic) para maximizar cache reuse.
//   textContext: texto puro dos anexos nao-PDF (DOCX, XLSX, TXT, MD, CSV).
// ============================================================================
// CITATION GROUNDING — converte citações jurídicas em hyperlinks para fontes oficiais.
// Aplicado nas sugestões dos agentes (analyze) e no HTML do documento aplicado (apply).
// Diferencial competitivo: Jus IA não tem, padrão consolidado pelo Lexis+ Protege.
// ============================================================================

const CODE_MAP: Record<string, string> = {
  CC: 'https://www.planalto.gov.br/ccivil_03/leis/2002/L10406compilada.htm',
  CPC: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/L13105.htm',
  CPP: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/Del3689Compilado.htm',
  CP: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/Del2848compilado.htm',
  CTN: 'https://www.planalto.gov.br/ccivil_03/leis/L5172Compilado.htm',
  CDC: 'https://www.planalto.gov.br/ccivil_03/leis/L8078compilado.htm',
  CLT: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/Del5452compilado.htm',
  LINDB: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/Del4657compilado.htm',
}

// Leis ordinárias frequentemente citadas em peças jurídicas brasileiras.
// Quando a IA cita "Lei 13.105/2015" (em vez de "CPC art. X"), cai aqui.
const KNOWN_LAWS: Record<string, string> = {
  // Códigos quando citados pelo número de lei
  '10406/2002': 'https://www.planalto.gov.br/ccivil_03/leis/2002/L10406compilada.htm', // CC
  '13105/2015': 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm', // CPC
  '5172/1966': 'https://www.planalto.gov.br/ccivil_03/leis/L5172Compilado.htm', // CTN
  '8078/1990': 'https://www.planalto.gov.br/ccivil_03/leis/L8078compilado.htm', // CDC
  // Outras leis frequentes
  '13709/2018': 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709compilado.htm', // LGPD
  '7347/1985': 'https://www.planalto.gov.br/ccivil_03/leis/l7347orig.htm', // ACP (só tem versão "orig" no Planalto)
  '8137/1990': 'https://www.planalto.gov.br/ccivil_03/leis/L8137.htm', // Crimes contra ordem tributária
  '9478/1997': 'https://www.planalto.gov.br/ccivil_03/leis/L9478.htm', // Petróleo
  '13964/2019': 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2019/lei/L13964.htm', // Pacote Anticrime
  '14905/2024': 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/L14905.htm', // Juros e correção
  '13874/2019': 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2019/lei/L13874.htm', // Liberdade econômica
  '12846/2013': 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/L12846.htm', // Anticorrupção
  '8429/1992': 'https://www.planalto.gov.br/ccivil_03/leis/L8429compilado.htm', // Improbidade
  '11340/2006': 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/L11340.htm', // Maria da Penha
  '8666/1993': 'https://www.planalto.gov.br/ccivil_03/leis/L8666compilado.htm', // Licitações (revogada)
  '14133/2021': 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/L14133.htm', // Nova Lei de Licitações
  '6404/1976': 'https://www.planalto.gov.br/ccivil_03/leis/L6404compilada.htm', // Sociedades Anônimas
  '9099/1995': 'https://www.planalto.gov.br/ccivil_03/leis/L9099.htm', // Juizados Especiais
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function buildCitationLink(url: string, label: string): string {
  return `<a href="${escapeHtmlAttr(url)}" target="_blank" rel="noopener noreferrer" class="legal-citation">${label}</a>`
}

// Aplica transform SOMENTE em texto puro (fora de tags HTML E fora de <a>...</a>).
// Necessário pra (a) não quebrar tags HTML existentes do apply (<strong>, <p>),
// (b) não criar <a> aninhado quando regex sequenciais matcham labels dentro de
// um <a> recém-gerado (bug que gerava hrefs quebrados tipo sconstj.jus.br).
function applyToTextOnly(input: string, transform: (txt: string) => string): string {
  if (!input) return input
  const segments = input.split(/(<[^>]+>)/g)
  let insideA = false
  return segments
    .map((seg) => {
      if (seg.startsWith('<')) {
        if (/^<a\b/i.test(seg)) insideA = true
        else if (/^<\/a\s*>/i.test(seg)) insideA = false
        return seg
      }
      return insideA ? seg : transform(seg)
    })
    .join('')
}

// URL de lei ordinária:
// 1. Se está em KNOWN_LAWS → URL Planalto verificada manualmente
// 2. Senão → URL de busca LexML (infra Senado+Câmara+Presidência)
//    Vantagem: link de busca nunca quebra; usuário vê resultado e clica na lei certa
//    Evita chutes Planalto que mudam de formato e quebram silenciosamente
function lawUrl(numero: string, anoFull: string): string {
  const cleanNum = numero.replace(/\./g, '')
  const key = `${cleanNum}/${anoFull}`
  if (KNOWN_LAWS[key]) return KNOWN_LAWS[key]
  // Fallback: busca LexML — encontra a lei pelo número/ano e oferece link para fonte oficial
  return `https://www.lexml.gov.br/busca/search?keyword=Lei+${cleanNum}+de+${anoFull}`
}

// URL de Lei Complementar:
// 1. Se URL Planalto padrão funciona (validar caso a caso depois) → manter
// 2. Por enquanto, usar busca LexML que cobre toda LC federal
function lcUrl(numero: string): string {
  return `https://www.lexml.gov.br/busca/search?keyword=Lei+Complementar+${numero}`
}

// Sanitização do HTML retornado pela IA no apply, antes de salvar no banco.
// A IA é confiável (não é input direto de usuário externo) mas:
//   - pode alucinar e gerar HTML malformado
//   - pode incluir tags inesperadas que quebrem o editor TipTap
//   - defesa em profundidade contra prompt injection que faça a IA gerar XSS
// Remove tags perigosas, atributos on*, e protocolos javascript:/vbscript:/data:
// (exceto data:image/ que é legítimo para logos inline).
const DANGEROUS_TAGS = [
  'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea',
  'select', 'option', 'link', 'meta', 'base', 'applet', 'frame', 'frameset',
  'noframes', 'noscript', 'svg', 'math',
]

function sanitizeApplyHtml(html: string): string {
  if (!html) return html
  let s = html

  // 1. Remove tags perigosas (par open/close + conteúdo)
  for (const tag of DANGEROUS_TAGS) {
    const reFull = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi')
    s = s.replace(reFull, '')
    const reSelf = new RegExp(`<${tag}\\b[^>]*/?>`, 'gi')
    s = s.replace(reSelf, '')
  }

  // 2. Remove atributos de evento (on*=)
  s = s.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')

  // 3. Remove protocolos perigosos em href/src
  s = s.replace(/(\s+(?:href|src|action|formaction)\s*=\s*["']?)\s*javascript\s*:[^"'>\s]*/gi, '$1#')
  s = s.replace(/(\s+(?:href|src|action|formaction)\s*=\s*["']?)\s*vbscript\s*:[^"'>\s]*/gi, '$1#')
  // data: exceto data:image/ (usado para logos inline)
  s = s.replace(/(\s+(?:href|src)\s*=\s*["']?)\s*data:(?!image\/)[^"'>\s]*/gi, '$1#')

  // 4. Remove caracteres de controle invisíveis (exceto \t \n \r)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

  return s
}

// Refatoração 24/06/2026 — code review ChatGPT:
// Antes: 8 chamadas a applyToTextOnly (8 splits de HTML por tags). Custo CPU linear
// no tamanho do HTML por número de padrões — pior em apply (HTML grande).
// Agora: 1 chamada a applyToTextOnly + estratégia de placeholders.
// Cada match vira um marcador único CITATION_N (chars que jamais
// aparecem em HTML real). Regex seguintes não casam em placeholders porque
// não contêm palavras-chave. No fim, substitui placeholders pelos <a> reais.
function addCitationLinks(text: string): string {
  if (!text) return text

  return applyToTextOnly(text, (segment) => {
    const placeholders: string[] = []
    const linkify = (label: string, url: string): string => {
      const idx = placeholders.length
      placeholders.push(buildCitationLink(url, label))
      return `CITATION_${idx}`
    }

    let r = segment

    // Expansão 24/06/2026 — code review ChatGPT:
    // - Todas as regex agora são case-insensitive (flag i)
    // - Números de artigo aceitam ordinal (º/ª): "art. 6º", "art. 1ª"
    // - Códigos detectados em forma invertida ("art. 489 do CPC")
    // - Lei aceita "de YYYY" além de "/YYYY"

    // Helper: ARTIGO_NUM captura número com possível ordinal e parágrafo
    // Ex.: "489", "489 § 1º VI", "6º", "1.011"
    const ARTIGO = `(?:art(?:igo|\\.|s\\.?)?\\s*)`
    const NUMERO_ART = `([\\d.]+)(?:[º°ª]|\\s*§\\s*\\d+(?:[º°ª])?(?:\\s+[IVX]+)?)?`

    // 1. Súmulas STJ (case-insensitive)
    r = r.replace(/\bs[úu]mula\s+(\d+)\s+stj\b/gi, (m, num) =>
      linkify(m, `https://scon.stj.jus.br/SCON/sumanot/toc.jsp?sumano=${num}`),
    )

    // 2. Súmulas STF (vinculantes ou não, case-insensitive)
    r = r.replace(/\bs[úu]mula(?:\s+vinculante)?\s+(\d+)\s+stf\b/gi, (m, num) => {
      const vinculante = /vinculante/i.test(m)
      const url = vinculante
        ? `https://www.stf.jus.br/portal/jurisprudencia/listarJurisprudencia.asp?s1=%28SUMULA+VINCULANTE+${num}%29&base=baseSumulasVinculantes`
        : `https://www.stf.jus.br/portal/jurisprudencia/menuSumarioSumulas.asp?sumula=${num}`
      return linkify(m, url)
    })

    // 3. Temas (repetitivos/repercussão geral, case-insensitive)
    r = r.replace(/\btema\s+([\d.]+)\s+(stj|stf)\b/gi, (m, num, trib) => {
      const cleanNum = num.replace(/\./g, '')
      const tribUpper = trib.toUpperCase()
      const url =
        tribUpper === 'STJ'
          ? `https://processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp?numero=${cleanNum}`
          : `https://portal.stf.jus.br/jurisprudenciaRepercussao/tema.asp?num=${cleanNum}`
      return linkify(m, url)
    })

    // 4. Acórdãos do STJ: REsp, AgInt, AREsp, RHC, RMS, EREsp, MS, HC
    // (case-sensitive porque siglas oficiais — evita falsos positivos em "MS" inglês etc.)
    // Mitigação 26/06/2026: SCON do STJ exige captcha humano e às vezes não encontra
    // o acórdão pela query direta. Geramos link primário STJ + fallback LexML em
    // parêntese — usuário tenta STJ; se barrar, clica LexML (URL estável, sem captcha).
    r = r.replace(
      /\b((?:AgInt\s+no\s+|AgRg\s+no\s+|EDcl\s+no\s+|EDcl\s+nos\s+)?)(AREsp|REsp|RHC|RMS|EREsp|MS|HC)\s+([\d.]+)(?:[\/\-]([A-Z]{2}))?/g,
      (full, _prefix, tipo, num) => {
        const cleanNum = num.replace(/\./g, '')
        const query = `${tipo} ${cleanNum}`
        const stjUrl = `https://scon.stj.jus.br/SCON/pesquisar.jsp?b=ACOR&livre=${encodeURIComponent(query)}`
        const lexmlUrl = `https://www.lexml.gov.br/busca/search?keyword=${encodeURIComponent(query)}`
        const stjLink = linkify(full, stjUrl)
        const lexmlLink = linkify('LexML', lexmlUrl)
        return `${stjLink} (${lexmlLink})`
      },
    )

    // 5. Constituição Federal artigo (case-insensitive + ordinal + invertido)
    // Direto: "CF art. 5º", "Constituição Federal art. 6"
    r = r.replace(
      new RegExp(
        `\\b(?:CF|Constitui[çc][ãa]o(?:\\s+Federal)?)(?:\\/88|\\s+de\\s+1988)?\\s+${ARTIGO}${NUMERO_ART}`,
        'gi',
      ),
      (m, num) => {
        const cleanNum = num.replace(/\./g, '')
        return linkify(
          m,
          `https://www.planalto.gov.br/ccivil_03/Constituicao/Constituicao.htm#art${cleanNum}`,
        )
      },
    )
    // Invertido: "art. 5º da CF", "artigo 6 da Constituição"
    r = r.replace(
      new RegExp(
        `\\b${ARTIGO}${NUMERO_ART}\\s+(?:da|do)\\s+(?:CF|Constitui[çc][ãa]o(?:\\s+Federal)?)(?:\\/88|\\s+de\\s+1988)?`,
        'gi',
      ),
      (m, num) => {
        const cleanNum = num.replace(/\./g, '')
        return linkify(
          m,
          `https://www.planalto.gov.br/ccivil_03/Constituicao/Constituicao.htm#art${cleanNum}`,
        )
      },
    )

    // 6. Códigos (CC, CPC, CPP, CP, CTN, CDC, CLT, LINDB) — direto e invertido
    for (const [code, baseUrl] of Object.entries(CODE_MAP)) {
      // Direto: "CPC art. 489", "CC art. 50 § 1º"
      const reDireto = new RegExp(`\\b${code}\\s+${ARTIGO}${NUMERO_ART}`, 'g')
      r = r.replace(reDireto, (m, num) => {
        const cleanNum = num.replace(/\./g, '')
        return linkify(m, `${baseUrl}#art${cleanNum}`)
      })
      // Invertido: "art. 489 do CPC", "artigo 50 do CC"
      const reInvertido = new RegExp(`\\b${ARTIGO}${NUMERO_ART}\\s+(?:do|da)\\s+${code}\\b`, 'g')
      r = r.replace(reInvertido, (m, num) => {
        const cleanNum = num.replace(/\./g, '')
        return linkify(m, `${baseUrl}#art${cleanNum}`)
      })
    }

    // 7. Lei Complementar (LC NNN/AAAA, case-insensitive)
    r = r.replace(/\blc\s+(\d+)\/(\d{4})\b/gi, (m, num) => linkify(m, lcUrl(num)))

    // 8. Lei ordinária (Lei NNNN/AAAA OU Lei NNNN de YYYY, case-insensitive)
    r = r.replace(
      /\blei\s+(?:n[ºo°°]?\s*\.?\s*)?([\d.]+)\s*(?:\/|\s+de\s+)\s*(\d{2,4})\b/gi,
      (m, num, ano) => {
        const fullAno = ano.length === 2 ? (parseInt(ano) > 50 ? `19${ano}` : `20${ano}`) : ano
        return linkify(m, lawUrl(num, fullAno))
      },
    )

    // Substitui placeholders pelos <a> reais
    for (let i = 0; i < placeholders.length; i++) {
      r = r.replace(`CITATION_${i}`, placeholders[i])
    }

    return r
  })
}

// ============================================================================
// Helper de log estruturado em `invocacoes.diagnostic_log`.
// Chamado em pontos-chave para deixar rastro do progresso da Edge Function.
// Se a função morrer (ex: wall-clock kill do Supabase), o último step
// registrado indica onde travou. Formato:
//   [ISO_TIMESTAMP] step_name {detail_json}
// Falhas nesta função são silenciosas (não interrompem o fluxo principal).
// ============================================================================
// PROVENIÊNCIA (memorando grounding, item 2 — fase 1): contagem determinística
// de citações no documento gerado, por categoria, + marcações [A VERIFICAR].
// Sem custo de LLM; roda junto do gate de aderência (validate_output).
// ============================================================================
function buildProvenanceReport(html: string) {
  const count = (re: RegExp) => (html.match(re) || []).length
  const jurisprudencia =
    count(/\b(REsp|AREsp|AgInt|EREsp|RHC|RMS)\s?n?[ºo.]?\s?[\d.]+/gi) +
    count(/\bTema\s?(n[ºo.]?\s?)?\d+/gi) +
    count(/\bS[úu]mula(\s+Vinculante)?\s?(n[ºo.]?\s?)?\d+/gi) +
    count(/\b(ADI|ADC|ADPF)\s?n?[ºo.]?\s?\d+/gi) +
    count(/\bSC\s?COSIT\s?n?[ºo.]?\s?\d+/gi) +
    count(/\bRE\s?n?[ºo.]?\s?\d{5,}/g)
  const legislacao =
    count(/\bLei\s+(Complementar\s+)?(n[ºo.]?\s*)?\d{1,3}\.?\d{3}\/\d{2,4}/gi) +
    count(/\bLC\s?n?[ºo.]?\s?\d+\/\d{4}/gi) +
    count(/\bEC\s?n?[ºo.]?\s?\d+\/\d{4}/gi) +
    count(/\bDecreto(-Lei)?\s+(n[ºo.]?\s*)?[\d.]+/gi) +
    count(/\b(IN|Portaria|Resolu[çc][ãa]o)\s+(RFB\s+|CGIBS\s+|CNJ\s+)?(n[ºo.]?\s*)?[\d.]+/gi)
  const dispositivos = count(/\bart(igo)?s?\.?\s?\d+/gi)
  // Padrão ABNT aproximado: SOBRENOME(S) EM CAIXA ALTA seguido de ", Prenome."
  const doutrina = count(/[A-ZÀ-Ü]{3,}(?:\s(?:JR|JÚNIOR|FILHO|NETO|[A-ZÀ-Ü]{2,}))*,\s+[A-ZÀ-Ü][a-zà-ü]+/g)
  const aVerificar = count(/\[A\s?VERIFICAR/gi)
  return {
    jurisprudencia,
    legislacao,
    dispositivos,
    doutrina,
    a_verificar: aVerificar,
    total_citacoes: jurisprudencia + legislacao + doutrina,
  }
}

async function appendDiagStep(
  supabase: any,
  invocationId: string | null,
  step: string,
  detail?: any,
): Promise<void> {
  if (!invocationId || !supabase) return
  try {
    const { data } = await supabase
      .from('invocacoes')
      .select('diagnostic_log')
      .eq('id', invocationId)
      .maybeSingle()
    const current = data?.diagnostic_log || ''
    const timestamp = new Date().toISOString()
    const detailStr = detail ? ' ' + JSON.stringify(detail) : ''
    const line = `[${timestamp}] ${step}${detailStr}`
    const newLog = current ? `${current}\n${line}` : line
    await supabase
      .from('invocacoes')
      .update({ diagnostic_log: newLog })
      .eq('id', invocationId)
  } catch (e) {
    console.warn(`[appendDiagStep] falhou (step=${step}):`, e)
  }
}

// ============================================================================
// HTTPs transientes em que vale retry exponencial.
// 503/502/504 = upstream sobrecarregado/indisponivel (caso classico Anthropic).
// 500 = erro generico do servidor (raro nao retry, mas pode ser flaky).
// 429 = rate limit (Anthropic devolve esse quando ha pico).
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

// Helper: fetch com retry exponencial. initFactory regenera o RequestInit
// a cada tentativa (necessario porque FormData/AbortSignal nao podem ser reusados).
// Backoff: 1s, 3s, 9s. Max 3 tentativas.
async function fetchWithRetry(
  url: string,
  initFactory: () => RequestInit,
  label: string,
  maxAttempts = 3,
): Promise<Response> {
  let lastErr: any = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, initFactory())
      if (res.ok) return res
      if (!RETRYABLE_STATUSES.has(res.status) || attempt === maxAttempts) return res
      // 5xx/429 com tentativas restantes: espera e retry
      const backoff = 1000 * Math.pow(3, attempt - 1)
      console.warn(
        `[RETRY ${label}] HTTP ${res.status} attempt ${attempt}/${maxAttempts}, waiting ${backoff}ms`,
      )
      await new Promise((r) => setTimeout(r, backoff))
    } catch (err: any) {
      lastErr = err
      const isAbort = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      if (isAbort || attempt === maxAttempts) throw err
      const backoff = 1000 * Math.pow(3, attempt - 1)
      console.warn(
        `[RETRY ${label}] network error "${err?.message}" attempt ${attempt}/${maxAttempts}, waiting ${backoff}ms`,
      )
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
  throw lastErr || new Error(`[fetchWithRetry ${label}] exhausted without response`)
}

async function uploadToAnthropicFilesApi(
  bytes: Uint8Array,
  filename: string,
  anthropicKey: string,
): Promise<string> {
  const res = await fetchWithRetry(
    'https://api.anthropic.com/v1/files',
    () => {
      const form = new FormData()
      form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename)
      return {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'files-api-2025-04-14',
        },
        body: form,
      }
    },
    `files-upload:${filename}`,
  )
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Files API upload failed (HTTP ${res.status}): ${errText}`)
  }
  const data = await res.json()
  if (!data?.id) {
    throw new Error(`Files API upload returned no id: ${JSON.stringify(data)}`)
  }
  return data.id
}

async function prepareAttachmentsForVision(
  supabase: any,
  paths: string[],
  anthropicKey: string,
  sendEvent: (data: any) => void,
): Promise<{ documentBlocks: any[]; textContext: string; digestContext: string }> {
  const MAX_PDF_BYTES = 32 * 1024 * 1024 // limite Anthropic por documento
  const PAGES_PER_CHUNK = 80 // <100 (limite Anthropic) com folga

  const documentBlocks: any[] = []
  let textContext = ''
  let digestContext = ''

  if (!anthropicKey) {
    textContext += '\n\n[Sem ANTHROPIC_API_KEY: PDFs nao podem ser enviados via Files API.]\n'
    return { documentBlocks, textContext, digestContext }
  }

  for (const path of paths) {
    const lower = path.toLowerCase()
    try {
      if (lower.endsWith('.pdf')) {
        // FASE B: anexo com digest pronto entra como TEXTO (digest estruturado)
        // no lugar da visão nativa — custo ~20x menor, sem teto de páginas.
        // Digests são gerados pela Edge Function ingest-document no upload.
        const { data: attRow } = await supabase
          .from('process_attachments')
          .select('id, digest_status')
          .eq('file_path', path)
          .maybeSingle()
        if (attRow?.digest_status === 'done') {
          const { data: digs } = await supabase
            .from('document_digests')
            .select('digest_md')
            .eq('attachment_id', attRow.id)
            .eq('status', 'done')
            .order('chunk_index', { ascending: true })
          const mds = (digs || []).map((d: any) => d.digest_md).filter(Boolean)
          if (mds.length > 0) {
            sendEvent({ status: `Usando digest pré-processado: ${path.split('/').pop()}` })
            digestContext += '\n\n' + mds.join('\n\n')
            continue
          }
        }

        sendEvent({ status: `Baixando PDF: ${path}...` })
        const { data: fileData, error: dlErr } = await supabase.storage
          .from('process-attachments')
          .download(path)
        if (dlErr || !fileData) {
          textContext += `\n\n[Falha ao baixar ${path}: ${dlErr?.message || 'desconhecido'}]\n`
          continue
        }
        if (fileData.size > MAX_PDF_BYTES) {
          textContext += `\n\n[PDF ${path} excede 32 MB (${(fileData.size / 1024 / 1024).toFixed(1)} MB) — limite da API Anthropic. Reduza o arquivo.]\n`
          continue
        }
        const ab = await fileData.arrayBuffer()
        const bytes = new Uint8Array(ab)
        const baseName = path.split('/').pop() || path

        // Fast-path: partes geradas pelo splitter do front carregam o range de
        // paginas no nome (_ptNdeM_pgsX-Y.pdf). Se a parte tem <=80 pgs, sobe
        // direto sem pdf-lib — PDFDocument.load em arquivo grande estoura o
        // limite fixo de CPU do isolate (kill "CPU Time exceeded", 06/07/2026).
        const partMatch = baseName.match(/_pt\d+de\d+_pgs(\d+)-(\d+)\.pdf$/i)
        if (partMatch) {
          const partPages = parseInt(partMatch[2], 10) - parseInt(partMatch[1], 10) + 1
          if (partPages > 0 && partPages <= PAGES_PER_CHUNK) {
            sendEvent({
              status: `PDF ${baseName}: ${partPages} pgs (parte pré-dividida), upload direto...`,
            })
            const fileId = await uploadToAnthropicFilesApi(bytes, baseName, anthropicKey)
            documentBlocks.push({
              type: 'document',
              source: { type: 'file', file_id: fileId },
              title: baseName,
            })
            sendEvent({ status: `PDF ${baseName}: uploaded (file_id=${fileId.slice(0, 16)}...)` })
            continue
          }
        }

        // Conta paginas e decide se precisa splittar
        const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const totalPages = srcDoc.getPageCount()

        if (totalPages <= PAGES_PER_CHUNK) {
          // Cabe inteiro: upload direto
          sendEvent({ status: `PDF ${baseName}: ${totalPages} pgs, fazendo upload...` })
          const fileId = await uploadToAnthropicFilesApi(bytes, baseName, anthropicKey)
          documentBlocks.push({
            type: 'document',
            source: { type: 'file', file_id: fileId },
            title: baseName,
          })
          sendEvent({ status: `PDF ${baseName}: uploaded (file_id=${fileId.slice(0, 16)}...)` })
        } else {
          // Splitta em chunks e faz upload de cada chunk em paralelo
          const numChunks = Math.ceil(totalPages / PAGES_PER_CHUNK)
          sendEvent({
            status: `PDF ${baseName}: ${totalPages} pgs, dividindo em ${numChunks} partes e fazendo upload...`,
          })
          const chunkUploads = []
          for (let i = 0; i < numChunks; i++) {
            const startPage = i * PAGES_PER_CHUNK
            const endPage = Math.min((i + 1) * PAGES_PER_CHUNK, totalPages)
            const chunkPromise = (async () => {
              const chunkDoc = await PDFDocument.create()
              const pageIndices = []
              for (let p = startPage; p < endPage; p++) pageIndices.push(p)
              const copiedPages = await chunkDoc.copyPages(srcDoc, pageIndices)
              copiedPages.forEach((p) => chunkDoc.addPage(p))
              const chunkBytes = await chunkDoc.save()
              const chunkName = `${baseName.replace(/\.pdf$/i, '')}_pt${i + 1}of${numChunks}_pgs${startPage + 1}-${endPage}.pdf`
              const fileId = await uploadToAnthropicFilesApi(chunkBytes, chunkName, anthropicKey)
              return {
                idx: i,
                fileId,
                title: `${baseName} — parte ${i + 1}/${numChunks} (pgs ${startPage + 1}-${endPage})`,
              }
            })()
            chunkUploads.push(chunkPromise)
          }
          const uploaded = await Promise.all(chunkUploads)
          // Mantem ordem dos chunks (idx)
          uploaded.sort((a, b) => a.idx - b.idx)
          for (const u of uploaded) {
            documentBlocks.push({
              type: 'document',
              source: { type: 'file', file_id: u.fileId },
              title: u.title,
            })
          }
          sendEvent({ status: `PDF ${baseName}: ${numChunks} partes uploaded.` })
        }
      } else {
        // Formatos textuais: usa extract-document (texto puro)
        sendEvent({ status: `Extraindo texto: ${path}...` })
        const { data: extData, error: extError } = await supabase.functions.invoke(
          'extract-document',
          { body: { file_path: path } },
        )
        if (!extError && extData?.text && extData.text.trim().length > 0) {
          textContext += `\n\n--- Documento Anexo (${path}) ---\n${extData.text}\n`
        } else if (extError) {
          textContext += `\n\n[Falha ao extrair ${path}: ${extError.message}]\n`
        } else {
          // Extracao retornou vazio (arquivo em branco, 0 bytes ou corrompido)
          console.warn(`[prepareAttachmentsForVision] extracao vazia: ${path}`)
          textContext += `\n\n[AVISO: o anexo ${path} retornou texto vazio na extração — arquivo possivelmente em branco, corrompido ou de 0 bytes. Ignore-o e informe o usuário na primeira sugestão.]\n`
        }
      }
    } catch (e: any) {
      console.error(`[prepareAttachmentsForVision] erro em ${path}:`, e?.message || e)
      textContext += `\n\n[Erro ao processar ${path}: ${e?.message || 'desconhecido'}]\n`
    }
  }

  // Aplica cache_control nos ultimos document blocks. Limite Anthropic:
  // 4 breakpoints POR REQUEST — 1 já é usado no system fixo e, quando há
  // digestContext, 1 vai no bloco de digest. Cap: 3 sem digest, 2 com.
  // (O código antigo usava 4 aqui + 1 no system = 5, que estouraria o
  // limite com PDFs de 4+ chunks — latente, nunca disparou com ≤3.)
  const numBlocks = documentBlocks.length
  if (numBlocks > 0) {
    const maxDocBreakpoints = digestContext ? 2 : 3
    const startCacheAt = Math.max(0, numBlocks - maxDocBreakpoints)
    for (let i = startCacheAt; i < numBlocks; i++) {
      documentBlocks[i].cache_control = { type: 'ephemeral' }
    }
  }

  return { documentBlocks, textContext, digestContext }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // MARKER de versao deployada - se isso aparecer nos logs, a versao NOVA esta rodando
  console.log('>>>>>>>> ANALYZE-LEGAL-TEXT VERSAO 2026-06-12 PDF VISION + CACHE TELEMETRY <<<<<<<<')

  let activeInvocationId: string | null = null
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  let authHeader = req.headers.get('Authorization')

  try {
    const payload = await req.json()
    const {
      invocation_id,
      minute_id,
      content_so_far,
      editor_text,
      content,
      agent_ids,
      agent_id,
      process_context,
      process_id,
      system_prompt: req_system_prompt,
      action,
      suggestions: req_suggestions,
      minute_type,
      attachments,
      analysis_instructions,
      attachment_paths,
      metadata,
      model: req_model,
    } = payload

    activeInvocationId = invocation_id || crypto.randomUUID()
    const finalContent = editor_text || content
    const finalAttachments = attachments || attachment_paths

    const targetAgentIds =
      agent_ids && Array.isArray(agent_ids) && agent_ids.length > 0
        ? agent_ids
        : agent_id
          ? [agent_id]
          : []

    // validate_output (gate de aderência) não usa agentes — só o conteúdo.
    if (!finalContent || (targetAgentIds.length === 0 && action !== 'validate_output')) {
      throw new Error('Missing content or agent_ids')
    }

    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // --- ACTION: VALIDATE_OUTPUT ---
    // Gate de aderência (memorando grounding 10/07/2026): valida se o
    // documento gerado corresponde ao tipo/caso/instruções pedidos.
    // Validador independente e barato (Haiku); JSON persistido no diag.
    if (action === 'validate_output') {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim()
      if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY ausente')

      const docText = String(content || '').slice(0, 240000) // cap ~60K tokens
      const metaStr = metadata
        ? `Cliente: ${metadata.client || '-'} | Comarca: ${metadata.comarca || '-'} | Objeto: ${metadata.objeto || '-'} | Pedido: ${metadata.pedido || '-'}`
        : '-'
      const attNames = Array.isArray(payload.attachment_names)
        ? payload.attachment_names.join('; ')
        : '-'
      const instr =
        typeof analysis_instructions === 'string' && analysis_instructions.trim()
          ? analysis_instructions.trim().slice(0, 2000)
          : '-'

      const gatePrompt = `Você é um VALIDADOR INDEPENDENTE de aderência de documentos jurídicos. Não avalie qualidade da redação — avalie apenas se o documento entregue corresponde ao que foi pedido.

PEDIDO:
- Tipo de documento esperado (gênero): ${minute_type || '-'}
- Metadados do caso: ${metaStr}
- Documentos anexados na análise: ${attNames}
- Instruções específicas do usuário: ${instr}

DOCUMENTO GERADO (HTML):
${docText}

Responda APENAS com um JSON válido, sem markdown, no formato exato:
{"responde_a_consulta": bool, "caso_correto": bool, "genero_correto": bool, "desvios": ["..."], "liberar": bool}

Critérios:
- genero_correto: o documento É do tipo esperado (um Parecer não pode ser um recurso; um Agravo não pode ser um relatório)?
- caso_correto: o documento trata do caso indicado (partes, tema, fatos compatíveis com metadados e anexos)? false se tratar de partes ou matéria claramente distintas.
- responde_a_consulta: o documento atende ao objeto/pedido e às instruções do usuário?
- liberar: true somente se os três acima forem true. desvios: descreva objetivamente cada descasamento encontrado (vazio se nenhum).`

      const gateRes = await fetchWithRetry(
        'https://api.anthropic.com/v1/messages',
        () => ({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 1024,
            messages: [{ role: 'user', content: gatePrompt }],
          }),
          signal: AbortSignal.timeout(60000),
        }),
        'messages:output-gate',
      )
      if (!gateRes.ok) {
        const errText = await gateRes.text()
        throw new Error(`Gate API Error (HTTP ${gateRes.status}): ${errText.slice(0, 300)}`)
      }
      const gateData = await gateRes.json()
      const gateText = (gateData.content || [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('')
      let gate: any = null
      try {
        const m = gateText.match(/\{[\s\S]*\}/)
        gate = m ? JSON.parse(m[0]) : null
      } catch (_e) {
        gate = null
      }
      if (!gate || typeof gate.liberar !== 'boolean') {
        // Falha do validador NUNCA bloqueia o usuário: libera com aviso.
        gate = {
          responde_a_consulta: true,
          caso_correto: true,
          genero_correto: true,
          desvios: ['[gate indisponível — validação automática falhou, revisão humana recomendada]'],
          liberar: true,
          gate_error: true,
        }
      }
      // Relatório de proveniência (determinístico, sem custo de LLM)
      const proveniencia = buildProvenanceReport(docText)
      if (invocation_id) {
        await appendDiagStep(supabase, invocation_id, 'output_gate', gate)
        await appendDiagStep(supabase, invocation_id, 'provenance_report', proveniencia)
      }
      return new Response(JSON.stringify({ gate, proveniencia }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: any) => {
          try {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch (e) {
            // Stream closed or broken connection
          }
        }

        const pingInterval = setInterval(() => {
          sendEvent({ type: 'ping', timestamp: Date.now() })
        }, 5000)

        try {
          sendEvent({ status: 'Preparando contexto...' })

          let additionalContext = ''
          if (metadata) {
            additionalContext += `\n\n--- Metadados da Minuta ---\n`
            if (metadata.client) additionalContext += `Cliente: ${metadata.client}\n`
            if (metadata.comarca) additionalContext += `Comarca: ${metadata.comarca}\n`
            if (metadata.objeto) additionalContext += `Objeto: ${metadata.objeto}\n`
            if (metadata.pedido) additionalContext += `Pedido: ${metadata.pedido}\n`
          }

          // documentBlocks vai como content multimodal no payload Anthropic
          // (visao nativa de PDF). textContext eh texto puro de anexos
          // nao-PDF (DOCX/XLSX/TXT) concatenado no userMessage.
          let documentBlocks: any[] = []
          let digestContext = ''

          sendEvent({ status: 'Obtendo agentes de IA...' })
          const { data: agents, error: agentsError } = await supabase
            .from('agentes')
            .select('*')
            .in('id', targetAgentIds)

          if (agentsError || !agents || agents.length === 0) {
            throw new Error('Agentes não encontrados ou indisponíveis.')
          }

          // Register the invocation BEFORE processing attachments: o processamento
          // de PDF pode matar o isolate (CPU limit) e sem registro nao ha telemetria
          // (falha de 06/07/2026 ficou sem rastro no banco por isso).
          const firstAgent = agents[0]
          const initialInvocationPayload: any = {
            id: activeInvocationId,
            user_id: user.id,
            agent_id: firstAgent.id,
            input_tokens: 0,
            output_tokens: 0,
          }
          if (process_id) initialInvocationPayload.process_id = process_id

          console.log(`Attempting initial DB Save for Invocation ID: ${activeInvocationId}`)
          const { error: initDbErr } = await supabase
            .from('invocacoes')
            .upsert(initialInvocationPayload, { onConflict: 'id', ignoreDuplicates: true })
          if (initDbErr) {
            console.error(
              `Initial DB Save Failed for Invocation ID: ${activeInvocationId} - ${initDbErr.message}`,
              initDbErr.details,
            )
          } else {
            console.log(`Initial DB Save Successful for Invocation ID: ${activeInvocationId}`)
          }
          await appendDiagStep(supabase, activeInvocationId, 'invocation_registered', {
            action: action || 'analyze',
            agent_count: agents.length,
            attachments_count: Array.isArray(finalAttachments) ? finalAttachments.length : 0,
            has_process_id: !!process_id,
            instructions_chars:
              typeof analysis_instructions === 'string' ? analysis_instructions.trim().length : 0,
          })
          if (typeof analysis_instructions === 'string' && analysis_instructions.trim()) {
            sendEvent({
              status: `Instruções do usuário incorporadas (${analysis_instructions.trim().length} caracteres).`,
            })
          }

          if (
            action !== 'apply' &&
            finalAttachments &&
            Array.isArray(finalAttachments) &&
            finalAttachments.length > 0
          ) {
            sendEvent({ status: 'Preparando anexos para analise (visao nativa para PDFs)...' })
            await appendDiagStep(supabase, activeInvocationId, 'attachments_processing', {
              count: finalAttachments.length,
            })
            const anthropicKeyForUpload = Deno.env.get('ANTHROPIC_API_KEY')?.trim() || ''
            const prepared = await prepareAttachmentsForVision(
              supabase,
              finalAttachments,
              anthropicKeyForUpload,
              sendEvent,
            )
            documentBlocks = prepared.documentBlocks
            additionalContext += prepared.textContext
            digestContext = prepared.digestContext
            await appendDiagStep(supabase, activeInvocationId, 'attachments_ready', {
              doc_blocks: documentBlocks.length,
              text_chars: prepared.textContext.length,
              digest_chars: digestContext.length,
            })
            sendEvent({
              status: `Anexos prontos: ${documentBlocks.length} blocos PDF (Files API) + ${prepared.textContext.length} chars texto + ${digestContext.length} chars digest.`,
            })
          }

          const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim()
          const documentType = minute_type ? `Tipo de Minuta: ${minute_type}\n\n` : ''
          const processInfo = process_context ? `Contexto do Processo:\n${process_context}\n\n` : ''
          const fullContext = `${documentType}${processInfo}Conteúdo Principal (Editor):\n${finalContent}${additionalContext}`

          // --- ACTION: APPLY ---
          if (action === 'apply') {
            const agent = firstAgent

            // Standardize the model ID strictly without date suffixes
            let finalModel = req_model || agent.model || 'claude-sonnet-5'
            if (finalModel.includes('sonnet-5')) finalModel = 'claude-sonnet-5'
            else if (finalModel.includes('sonnet')) finalModel = 'claude-sonnet-4-6'
            else if (finalModel.includes('opus')) finalModel = 'claude-opus-4-7'
            else if (finalModel.includes('haiku')) finalModel = 'claude-haiku-4-5'

            // Apply usa Sonnet (qualidade de reescrita melhor que Haiku); SSE parser foi
            // consertado e timeout=900s no config.toml dá folga para a geração mais lenta.
            console.warn(`>>>>> [APPLY START] model=${finalModel} invocation=${activeInvocationId}`)

            const finalSystemPrompt =
              'Você é um editor jurídico especializado em reescrita de documentos HTML. Sua única tarefa é reescrever o documento HTML fornecido aplicando estritamente as sugestões de melhoria que receber, mantendo a formatação HTML original e a estrutura do documento. Retorne EXCLUSIVAMENTE o código HTML revisado e completo, sem comentários explicativos, sem prefácios, sem texto adicional antes ou depois do HTML. Termine sempre com a tag <!-- END_OF_DOCUMENT --> para sinalizar conclusão.'
            // Sonnet 4.6 streaming aceita ate 64K. 32K cobre documentos longos
            // sem precisar de continue_required na maioria dos casos.
            const maxTokens = agent.max_tokens && agent.max_tokens > 16384 ? agent.max_tokens : 32000

            let activeMinuteId = minute_id

            // Ensure minute exists before processing
            if (!activeMinuteId) {
              const title = minute_type
                ? `${minute_type} - ${new Date().toLocaleDateString()}`
                : `Nova Minuta - ${new Date().toLocaleDateString()}`
              const { data: newMin } = await supabase
                .from('minutes')
                .insert({
                  title,
                  content: content_so_far || finalContent || '',
                  status: 'Draft',
                  process_id: process_id || null,
                  client_name: metadata?.client || null,
                  comarca: metadata?.comarca || null,
                  objeto: metadata?.objeto || null,
                  pedido: metadata?.pedido || null,
                  updated_at: new Date().toISOString(),
                  invocation_id: activeInvocationId,
                })
                .select('id')
                .single()

              if (newMin) {
                activeMinuteId = newMin.id
                sendEvent({ type: 'minute_created', minute_id: activeMinuteId })
              }
            } else {
              await supabase
                .from('minutes')
                .update({ invocation_id: activeInvocationId })
                .eq('id', activeMinuteId)
            }

            let applyContextMetadata = ''
            if (metadata) {
              applyContextMetadata += `--- Metadados da Minuta ---\n`
              if (metadata.client) applyContextMetadata += `Cliente: ${metadata.client}\n`
              if (metadata.comarca) applyContextMetadata += `Comarca: ${metadata.comarca}\n`
              if (metadata.objeto) applyContextMetadata += `Objeto: ${metadata.objeto}\n`
              if (metadata.pedido) applyContextMetadata += `Pedido: ${metadata.pedido}\n`
              applyContextMetadata += `\n`
            }
            // Context for apply ignores raw attachments (additionalContext) to save tokens
            const applyContext = `${documentType}${processInfo}${applyContextMetadata}Conteúdo Principal (Editor):\n${finalContent}`

            // Instruções livres do usuário (campo "Instruções para a análise" do front)
            const applyUserInstructions =
              typeof analysis_instructions === 'string' && analysis_instructions.trim()
                ? `Instruções específicas do usuário para esta reescrita (priorize-as):\n${analysis_instructions.trim().slice(0, 4000)}\n\n`
                : ''

            let userMessage = `Aqui está o contexto e o documento atual (em formato HTML):\n\n${applyContext}\n\n${applyUserInstructions}REGRA DE ENTREGÁVEL: o documento final É o entregável em si, do tipo "${minute_type || 'indicado'}". NÃO inclua no corpo do documento: comentários sobre o processo de produção, advertências de que o texto "não é" ou "não constitui" o tipo pedido, avaliações sobre a adequação dos documentos-fonte, nem notas autorreferentes. Se as fontes não sustentarem alguma seção, mantenha a estrutura do tipo pedido e preencha a lacuna com [A VERIFICAR — informação/documento a obter], nunca com meta-comentário.\n\nPor favor, reescreva o Conteúdo Principal (Editor) aplicando as seguintes sugestões de melhoria. Mantenha a formatação HTML original, ajustando apenas o texto onde necessário:\n\n${(req_suggestions || []).map((s: string) => `- ${s}`).join('\n')}\n\nIMPORTANTE — PRESERVAR CAPA/CABEÇALHO: Se o documento contém uma capa, cabeçalho ou seção de identificação no início (com título, número de processo, NOME DO CLIENTE, data, etc.), PRESERVE ESSES ELEMENTOS EXATAMENTE como aparecem no original. NÃO remova o nome do cliente da capa. NÃO consolide/simplifique a capa. Mantenha a estrutura de identificação do documento intacta.\n\nCRÍTICO: Retorne o documento COMPLETO, até a sua conclusão natural. NÃO TRUNQUE o texto (ex: não pare no meio de um parágrafo ou seção). Se o texto for longo, certifique-se de terminar todo o conteúdo sem interrupções. Inclua no final do documento a tag <!-- END_OF_DOCUMENT --> para confirmar que você terminou de gerar todo o texto.\n\nRetorne APENAS o código HTML PURO do Conteúdo Principal revisado. NÃO envolva o HTML em marcação markdown (NÃO use \`\`\`html, NÃO use \`\`\`, NÃO use blocos de código). Comece DIRETAMENTE com a primeira tag HTML e termine na última tag HTML seguida da tag de conclusão. Nenhum texto, explicação ou marcação fora do HTML.`

            if (content_so_far) {
              userMessage = `${userMessage}\n\n---\n\nVOCÊ JÁ INICIOU A REESCRITA EM UMA SOLICITAÇÃO ANTERIOR. Aqui está exatamente o que foi gerado até agora:\n\n${content_so_far}\n\nCONTINUE de onde parou, SEM REPETIR o conteúdo acima. Retorne APENAS a continuação do HTML, mantendo coesão de formatação e estrutura. Termine o documento e inclua a tag <!-- END_OF_DOCUMENT --> ao final.`
            }

            sendEvent({ status: 'Gerando texto (Streaming ativado)...' })

            if (anthropicKey) {
              const messages: any[] = [{ role: 'user', content: userMessage }]

              const payloadParams: any = {
                model: finalModel,
                max_tokens: maxTokens,
                stream: true,
                system: [
                  { type: 'text', text: finalSystemPrompt, cache_control: { type: 'ephemeral' } },
                ],
                messages,
              }
              // Sonnet 5 depreciou `temperature` (HTTP 400 se enviado); modelos
              // anteriores ainda aceitam — reduz variabilidade da reescrita.
              if (!finalModel.includes('sonnet-5')) {
                payloadParams.temperature = 0.3
              }
              // Thinking EXPLICITAMENTE desligado no apply: no Sonnet 5, omitir
              // o campo liga o adaptativo por default, que come o max_tokens em
              // reescritas longas (regressao da rodada 4). Rewrite e mecanico.
              payloadParams.thinking = { type: 'disabled' }

              const anthropicRes = await fetchWithRetry(
                'https://api.anthropic.com/v1/messages',
                () => ({
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-beta': 'prompt-caching-2024-07-31',
                  },
                  body: JSON.stringify(payloadParams),
                  // 10 minutos: Sonnet 4.6 gerando doc longo (20K+ tokens) pode levar
                  // varios minutos. O timeout=900s do config.toml da margem.
                  signal: AbortSignal.timeout(600000),
                }),
                'messages:apply',
              )

              if (!anthropicRes.ok) {
                const errText = await anthropicRes.text()
                throw new Error(`Anthropic API Error: ${errText}`)
              }

              let inputTokens = 0
              let outputTokens = 0
              let cachedTokens = 0
              let fullText = content_so_far || ''
              let charCountSinceLastSave = 0
              let stopReason = null
              let receivedAnyContent = false

              const reader = anthropicRes.body?.getReader()
              const decoder = new TextDecoder()
              let buffer = ''

              while (reader) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })

                // SSE chunks are separated by \n\n. Each chunk may contain
                // "event: TYPE\ndata: JSON" — we must search for the data line
                // within each chunk, not assume the chunk starts with "data: ".
                const sseChunks = buffer.split('\n\n')
                buffer = sseChunks.pop() || ''

                for (const chunk of sseChunks) {
                  // find the line that starts with "data: " (ignore "event:" / comment lines)
                  const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '))
                  if (dataLine) {
                    const dataStr = dataLine.slice(6).trim()
                    if (dataStr === '[DONE]') continue
                    try {
                      const data = JSON.parse(dataStr)
                      if (data.type === 'message_start') {
                        inputTokens = data.message?.usage?.input_tokens || 0
                        cachedTokens =
                          data.message?.usage?.cache_creation_input_tokens ||
                          data.message?.usage?.cache_read_input_tokens ||
                          0
                      } else if (data.type === 'content_block_delta') {
                        if (data.delta?.type === 'text_delta') {
                          const text = data.delta?.text || ''
                          if (text) {
                            receivedAnyContent = true
                          }
                          fullText += text
                          charCountSinceLastSave += text.length
                          sendEvent({ text })

                          if (activeMinuteId && charCountSinceLastSave > 500) {
                            charCountSinceLastSave = 0
                            // Fire-and-forget: nao bloqueia o stream da IA, mas loga erro
                            // se o save incremental falhar (antes era .then() sem callback,
                            // silenciava falhas — code review ChatGPT 24/06).
                            supabase
                              .from('minutes')
                              .update({
                                content: fullText,
                                updated_at: new Date().toISOString(),
                              })
                              .eq('id', activeMinuteId)
                              .then((res) => {
                                if (res.error) {
                                  console.error(
                                    `[apply] save incremental falhou (invocation ${activeInvocationId}): ${res.error.message}`,
                                  )
                                }
                              })
                          }
                        } else if (
                          data.delta?.type === 'thinking_delta' ||
                          data.delta?.type === 'signature_delta'
                        ) {
                          // explicitly ignore thinking and reasoning deltas
                        }
                      } else if (data.type === 'message_delta') {
                        outputTokens = data.usage?.output_tokens || 0
                        stopReason = data.delta?.stop_reason || null
                      }
                    } catch (e) {}
                  }
                }
              }

              // Strip de markdown code fence (```html ... ```) caso o modelo
              // tenha envolvido a resposta apesar das instrucoes no prompt.
              fullText = fullText
                .replace(/^\s*```(?:html|HTML)?\s*\r?\n?/, '')
                .replace(/\r?\n?\s*```\s*$/, '')
                .trim()

              // Sanitização do HTML — defesa em profundidade contra HTML malformado
              // ou prompt injection que faça o modelo gerar XSS/scripts.
              // Remove <script>, <iframe>, atributos on*, protocolos perigosos.
              fullText = sanitizeApplyHtml(fullText)

              // Citation grounding: converte citações jurídicas em hyperlinks
              fullText = addCitationLinks(fullText)

              if (activeMinuteId && charCountSinceLastSave > 0) {
                await supabase
                  .from('minutes')
                  .update({
                    content: fullText,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', activeMinuteId)
              }

              // Final safety save directly in Edge Function to ensure database persistence
              if (activeMinuteId && (charCountSinceLastSave > 0 || receivedAnyContent)) {
                await supabase
                  .from('minutes')
                  .update({
                    content: fullText,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', activeMinuteId)
              }

              if (!receivedAnyContent && (!content_so_far || content_so_far.length === 0)) {
                throw new Error(
                  JSON.stringify({
                    error: 'Erro: A resposta da IA estava vazia ou malformada.',
                    code: 'EMPTY_RESPONSE',
                    invocation_id: activeInvocationId,
                  }),
                )
              }

              // Continuacao automatica APENAS quando o modelo bateu no max_tokens
              // (unico caso onde retomar com content_so_far faz sentido).
              // Outras causas (refusal, pause_turn, etc.) nao sao retomaveis e
              // foram causando recursao indevida + "FALHA NA GERACAO" no front.
              console.warn(`>>>>> [APPLY END] stopReason=${stopReason} fullTextLen=${fullText.length} hasEndMarker=${fullText.includes('<!-- END_OF_DOCUMENT -->')} willContinue=${stopReason === 'max_tokens'} outputTokens=${outputTokens} invocation=${activeInvocationId}`)
              if (stopReason === 'max_tokens') {
                sendEvent({ type: 'continue_required' })
              }

              let costInputPerM = 3.0
              let costOutputPerM = 15.0
              if (finalModel === 'claude-opus-4-7') {
                costInputPerM = 5.0
                costOutputPerM = 25.0
              } else if (finalModel === 'claude-haiku-4-5') {
                costInputPerM = 1.0
                costOutputPerM = 5.0
              }
              const costInput = (inputTokens / 1000000) * costInputPerM
              const costOutput = (outputTokens / 1000000) * costOutputPerM
              const estimatedCost = costInput + costOutput

              console.log(
                `Attempting DB Save for Invocation ID: ${activeInvocationId} (Token/Cost Update)`,
              )
              const { error: invErr } = await supabase
                .from('invocacoes')
                .update({ input_tokens: inputTokens, output_tokens: outputTokens })
                .eq('id', activeInvocationId)
              if (invErr)
                console.error(
                  `DB Save Failed for invocacoes (ID: ${activeInvocationId}):`,
                  invErr.message,
                )
              else console.log(`DB Save Successful for invocacoes (ID: ${activeInvocationId})`)

              const { error: costErr } = await supabase.from('custos').upsert(
                {
                  invocation_id: activeInvocationId,
                  estimated_cost: estimatedCost,
                  currency: 'USD',
                  cached_tokens: cachedTokens,
                },
                { onConflict: 'invocation_id', ignoreDuplicates: false },
              )
              if (costErr)
                console.error(
                  `DB Save Failed for custos (ID: ${activeInvocationId}):`,
                  costErr.message,
                )
              else console.log(`DB Save Successful for custos (ID: ${activeInvocationId})`)
            } else {
              // Fallback Mock
              const mockText =
                finalContent +
                `<br/><br/><div style="color: blue; padding: 10px; border: 1px dashed blue;"><em>[Simulação: Modificações aplicadas]</em></div><!-- END_OF_DOCUMENT -->`
              if (activeMinuteId) {
                await supabase
                  .from('minutes')
                  .update({ content: mockText })
                  .eq('id', activeMinuteId)
              }
              const chunks = mockText.match(/.{1,50}/g) || []
              for (const chunk of chunks) {
                sendEvent({ text: chunk })
                await new Promise((r) => setTimeout(r, 20))
              }
            }
          }
          // --- ACTION: ANALYZE / BRAINSTORM / EXTRACT ---
          else {
            sendEvent({ status: 'Analisando documento e gerando insights...' })
            await appendDiagStep(supabase, activeInvocationId, 'analyze_started')
            let finalSuggestions: any = []
            const agentsToProcess =
              action === 'brainstorm' || action === 'extract_report_fields' ? [agents[0]] : agents

            let totalInputTokens = 0
            let totalOutputTokens = 0
            let totalCachedTokens = 0
            let totalCacheWrite = 0
            let totalCacheRead = 0
            let totalEstimatedCost = 0
            let successCount = 0
            const agentFailures: { agent: string; error: string }[] = []

            const runAgent = async (agent: any) => {
              try {
                let agentSuggestions: string[] = []
                let structuredResult: any = null

                // Respeita o modelo do agente com coercao para IDs validos.
                // Pool migrado para Sonnet 5 em 30/06 (1M de contexto) — o
                // hard-code anterior em Sonnet 4.6 fazia a migracao do banco
                // nunca chegar a API (corrigido 06/07/2026).
                const agentModel = agent.model || ''
                let finalModel = 'claude-sonnet-5'
                if (agentModel.includes('sonnet-4')) finalModel = 'claude-sonnet-4-6'
                else if (agentModel.includes('opus')) finalModel = 'claude-opus-4-7'
                else if (agentModel.includes('haiku')) finalModel = 'claude-haiku-4-5'

                const finalSystemPrompt = req_system_prompt || agent.system_prompt
                const maxTokens = agent.max_tokens || 8192

                let inputTokens = 0
                let outputTokens = 0
                let cachedTokens = 0
                let cacheWrite = 0
                let cacheRead = 0
                let costInputPerM = 3.0
                let costOutputPerM = 15.0

                if (anthropicKey) {
                  // Numero de sugestoes por agente eh dinamico: o total fica em ~30-50
                  // independente de quantos agentes foram selecionados, evitando explosao
                  // de sugestoes (ex: 5 agentes * 30 = 150).
                  const targetPerAgent = Math.max(5, Math.ceil(40 / agentsToProcess.length))
                  const minSug = Math.max(3, targetPerAgent - 2)
                  const maxSug = targetPerAgent + 3

                  // CACHE STRATEGY (Anthropic prompt caching):
                  // render order = tools → system → messages.user.content
                  // Para o cache ser COMPARTILHADO entre os N agentes do analyze,
                  // tudo antes do ultimo cache_control breakpoint precisa ser
                  // BYTE-identico entre as chamadas. Como cada agente tem
                  // system_prompt diferente (persona), nao podemos usar
                  // agent.system_prompt no campo `system` da API — ele vai
                  // pro user content como instrucao especifica do agente,
                  // depois dos documentBlocks (cacheados).
                  //
                  // Resultado:
                  //   1o agente: cache_write em system fixo + documentBlocks
                  //   demais agentes: cache_read no mesmo prefix
                  const FIXED_SYSTEM =
                    'Você é um revisor jurídico sênior. Analise os documentos anexados com rigor técnico, identificando fundamentos legais aplicáveis, jurisprudência relevante e pontos de atenção específicos. REGRA INEGOCIÁVEL DE LEGIBILIDADE: se um documento anexado estiver ilegível, truncado ou com digitalização de qualidade insuficiente para leitura confiável (total ou parcialmente), NÃO presuma nem deduza seu conteúdo — registre uma sugestão própria iniciada por "[DOCUMENTO ILEGÍVEL]" nomeando o arquivo e as páginas afetadas, recomende ao usuário aplicar OCR e reanexar, e restrinja o restante da análise ao que for efetivamente legível. REGRA DE GÊNERO E FONTE: sua função é ajudar a construir o TIPO de documento pedido a partir das fontes disponíveis. Se as fontes anexadas forem de gênero diverso do necessário (ex.: memorando interno, rascunho de trabalho) ou insuficientes para sustentar o documento pedido, registre isso em sugestão própria iniciada por "[FONTE INSUFICIENTE]" explicando o que falta — mas direcione TODAS as demais sugestões para construir o documento do tipo pedido com o que existe, usando [A VERIFICAR] nas lacunas. JAMAIS sugira transformar o documento no gênero da fonte nem inserir no corpo do documento comentários sobre sua própria adequação.'

                  // Instrucao de tarefa (varia por action mas eh igual entre agentes do mesmo action)
                  let taskInstruction =
                    action === 'brainstorm'
                      ? `Retorne um JSON estrito (sem crases ou marcação markdown) com duas chaves: "sugerir_secoes" (array de strings) e "perguntas_chave" (array de strings). NÃO INCLUA nenhum texto conversacional ou de preenchimento antes ou depois do JSON. Retorne APENAS o JSON válido.`
                      : action === 'extract_report_fields'
                        ? `Extraia as informações para um Relatório de Caso. Retorne um JSON estrito (sem crases ou marcação markdown) com as chaves: "situacao", "problemas", "solucoes", "proximos_passos". O conteúdo de cada chave deve ser um texto resumido e profissional focado em relatório jurídico. NÃO INCLUA nenhum texto conversacional ou de preenchimento antes ou depois do JSON. Retorne APENAS o JSON válido.`
                        : `Produza ENTRE ${minSug} E ${maxSug} sugestões objetivas de melhoria, priorizadas (as mais críticas primeiro). Cada sugestão deve ser específica, acionável e referenciar precisamente o ponto do documento. Formate cada sugestão como bullet point em uma linha começando com '- '. NÃO adicione texto introdutório, conclusão ou comentários — apenas a lista.`

                  // Instruções livres do usuário (campo "Instruções para a análise"):
                  // entram no bloco nao-cacheado, iguais para todos os agentes.
                  const analyzeUserInstructions =
                    typeof analysis_instructions === 'string' && analysis_instructions.trim()
                      ? `\n\n## Instruções específicas do usuário para esta análise (priorize-as)\n${analysis_instructions.trim().slice(0, 4000)}`
                      : ''

                  // Texto especifico do agente (vai DEPOIS dos documentBlocks, NAO cacheado):
                  // persona do agente + tarefa + instrucoes do usuario + contexto
                  const agentInstructionText = `## Sua persona\n${finalSystemPrompt}\n\n## Sua tarefa\n${taskInstruction}${analyzeUserInstructions}\n\n## Contexto do caso\n${fullContext}`

                  // userMessage (string) usada como fallback quando nao ha documentBlocks
                  const userMessage = agentInstructionText

                  // Monta content multimodal: documentos cacheados (mesmos para todos
                  // os agentes) + digests (texto cacheado, Fase B) + texto especifico
                  // do agente (varia, no fim do prefix).
                  const digestBlocks: any[] = digestContext
                    ? [
                        {
                          type: 'text',
                          text: `## Autos processados (digests estruturados — cada digest referencia páginas locais da respectiva parte)\n${digestContext}`,
                          cache_control: { type: 'ephemeral' },
                        },
                      ]
                    : []
                  const userContent: any[] | string =
                    documentBlocks.length > 0 || digestBlocks.length > 0
                      ? [
                          ...documentBlocks,
                          ...digestBlocks,
                          { type: 'text', text: agentInstructionText },
                        ]
                      : userMessage

                  // PROVENIÊNCIA FASE 2: busca web server-side restrita a portais
                  // oficiais BR, para confirmação de citações pelos agentes de
                  // pesquisa. UNIFORME em todos os agentes (tools renderizam
                  // antes do system — variar por agente quebraria o prefix do
                  // cache compartilhado); o uso é dirigido pelos prompts.
                  // allowed_callers 'direct': sem isso, a 20260209 default p/
                  // filtragem dinamica (code execution provisionado por baixo),
                  // e o container e incompativel com document blocks source:file
                  // — a API devolve not_found_error "File ... not found" p/ um
                  // file_id recem-uploadado (falha 764b782b, 14/07/2026).
                  const OFFICIAL_SEARCH_TOOL = {
                    type: 'web_search_20260209',
                    name: 'web_search',
                    max_uses: 4,
                    allowed_callers: ['direct'],
                    allowed_domains: ['jus.br', 'gov.br', 'leg.br', 'in.gov.br', 'lexml.gov.br'],
                  }

                  const payloadParams: any = {
                    model: finalModel,
                    max_tokens: maxTokens,
                    tools: [OFFICIAL_SEARCH_TOOL],
                    system: [
                      {
                        type: 'text',
                        text: FIXED_SYSTEM,
                        cache_control: { type: 'ephemeral' },
                      },
                    ],
                    messages: [{ role: 'user', content: userContent }],
                  }
                  // Sonnet 5 depreciou `temperature` (HTTP 400 se enviado);
                  // modelos anteriores ainda aceitam — reduz variabilidade.
                  if (!finalModel.includes('sonnet-5')) {
                    payloadParams.temperature = 0.3
                  }
                  // Thinking EXPLICITAMENTE desligado no analyze: no Sonnet 5,
                  // omitir o campo liga o adaptativo por default — com
                  // max_tokens 8192 o raciocinio consome o budget e o agente
                  // devolve resposta sem blocos de texto (licao das rodadas
                  // 5-6 e das falhas de digest de 06/07).
                  payloadParams.thinking = { type: 'disabled' }

                  // Timeout maior pra 1a chamada (cache write em PDFs grandes
                  // pode levar 60-120s); chamadas com cache hit voam.
                  // Texto puro: 180s — Sonnet 5 com thinking passa de 90s com
                  // frequencia em analises longas (falhas de 03/07 17:34/17:36).
                  // Warm-up (180s) + paralelo (180s) = 360s, cabe no wall-clock 400s.
                  const fetchTimeout = documentBlocks.length > 0 ? 240000 : 180000

                  await appendDiagStep(supabase, activeInvocationId, 'agent_calling_anthropic', {
                    agent_name: agent.name,
                    doc_blocks: documentBlocks.length,
                    fetch_timeout_ms: fetchTimeout,
                  })

                  // Chamada com continuação de pause_turn: a busca web
                  // server-side pode pausar o loop da Anthropic; reenviamos
                  // user + assistant(content) para retomar (máx. 3 retomadas).
                  // Texto e usage são ACUMULADOS entre as retomadas.
                  let aiData: any = null
                  const textBlocks: any[] = []
                  let webSearches = 0
                  let contMessages: any[] = [{ role: 'user', content: userContent }]
                  for (let turno = 0; turno < 4; turno++) {
                    const bodyParams = { ...payloadParams, messages: contMessages }
                    const anthropicRes = await fetchWithRetry(
                      'https://api.anthropic.com/v1/messages',
                      () => ({
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'x-api-key': anthropicKey,
                          'anthropic-version': '2023-06-01',
                          'anthropic-beta': 'prompt-caching-2024-07-31,files-api-2025-04-14',
                        },
                        body: JSON.stringify(bodyParams),
                        signal: AbortSignal.timeout(fetchTimeout),
                      }),
                      `messages:analyze:${agent.name}`,
                    )

                    if (!anthropicRes.ok) {
                      const errText = await anthropicRes.text()
                      await appendDiagStep(supabase, activeInvocationId, 'agent_anthropic_error', {
                        agent_name: agent.name,
                        http_status: anthropicRes.status,
                        err_preview: errText.slice(0, 200),
                      })
                      throw new Error(`Anthropic API Error: ${errText}`)
                    }
                    aiData = await anthropicRes.json()

                    inputTokens += aiData.usage?.input_tokens || 0
                    outputTokens += aiData.usage?.output_tokens || 0
                    cacheWrite += aiData.usage?.cache_creation_input_tokens || 0
                    cacheRead += aiData.usage?.cache_read_input_tokens || 0
                    webSearches += aiData.usage?.server_tool_use?.web_search_requests || 0

                    if (Array.isArray(aiData.content)) {
                      textBlocks.push(
                        ...aiData.content.filter(
                          (c: any) => c.type === 'text' && typeof c.text === 'string',
                        ),
                      )
                    }

                    if (aiData.stop_reason === 'pause_turn' && turno < 3) {
                      await appendDiagStep(supabase, activeInvocationId, 'agent_pause_turn', {
                        agent_name: agent.name,
                        retomada: turno + 1,
                      })
                      contMessages = [
                        { role: 'user', content: userContent },
                        { role: 'assistant', content: aiData.content },
                      ]
                      continue
                    }
                    break
                  }

                  await appendDiagStep(supabase, activeInvocationId, 'agent_anthropic_responded', {
                    agent_name: agent.name,
                    http_status: 200,
                    stop_reason: aiData?.stop_reason || null,
                    web_search_requests: webSearches,
                  })

                  console.log('Raw AI Content Array:', JSON.stringify(aiData?.content))

                  if (
                    !aiData?.content ||
                    !Array.isArray(aiData.content) ||
                    aiData.content.length === 0
                  ) {
                    throw new Error(
                      JSON.stringify({
                        error: 'Erro: A resposta da IA estava vazia ou malformada.',
                        code: 'EMPTY_RESPONSE',
                        agent_name: agent.name,
                      }),
                    )
                  }

                  if (textBlocks.length === 0) {
                    console.log(
                      'Raw AI Content Array (Empty Text Blocks):',
                      JSON.stringify(aiData.content),
                    )
                    throw new Error(
                      JSON.stringify({
                        error:
                          'Erro: A resposta da IA não continha blocos de texto (apenas thinking).',
                        code: 'EMPTY_RESPONSE',
                        agent_name: agent.name,
                      }),
                    )
                  }

                  cachedTokens = cacheWrite + cacheRead

                  // Log diagnostico de cache: confirma se PDFs estao sendo reusados entre agentes
                  console.log(
                    `[CACHE ${agent.name}] input=${inputTokens} write=${cacheWrite} read=${cacheRead} docs=${documentBlocks.length} buscas=${webSearches}`,
                  )

                  const aiText = textBlocks
                    .map((c: any) => c.text)
                    .join('\n')
                    .trim()
                  if (!aiText || aiText.length === 0) {
                    console.log(
                      'Raw AI Content Array (Empty after join):',
                      JSON.stringify(aiData.content),
                    )
                    throw new Error(
                      JSON.stringify({
                        error: 'Erro: A resposta da IA estava vazia após extração.',
                        code: 'EMPTY_RESPONSE',
                        agent_name: agent.name,
                      }),
                    )
                  }

                  if (action === 'brainstorm' || action === 'extract_report_fields') {
                    let jsonStr = aiText.trim()
                    if (jsonStr.startsWith('```json'))
                      jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '')
                    else if (jsonStr.startsWith('```'))
                      jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '')
                    try {
                      structuredResult = JSON.parse(jsonStr)
                    } catch (e) {
                      console.error('JSON parsing failed, falling back to raw text:', jsonStr)
                      if (action === 'extract_report_fields') {
                        structuredResult = {
                          situacao: 'Conteúdo não estruturado retornado pela IA:',
                          problemas:
                            jsonStr.substring(0, 500) + (jsonStr.length > 500 ? '...' : ''),
                          solucoes: 'Consulte o texto bruto.',
                          proximos_passos: 'Tente novamente.',
                        }
                      } else {
                        structuredResult = {
                          sugerir_secoes: ['Conteúdo não estruturado retornado pela IA:'],
                          perguntas_chave: [
                            jsonStr.substring(0, 500) + (jsonStr.length > 500 ? '...' : ''),
                          ],
                        }
                      }
                    }
                  } else {
                    agentSuggestions = aiText
                      .split('\n')
                      .map((l: string) => l.trim())
                      .filter(
                        (l: string) =>
                          l.length > 0 &&
                          (l.startsWith('-') || l.startsWith('*') || l.match(/^\d+\./)),
                      )
                      .map((l: string) =>
                        l
                          .replace(/^[-*]\s*/, '')
                          .replace(/^\d+\.\s*/, '')
                          .trim(),
                      )

                    if (agentSuggestions.length === 0 && aiText) agentSuggestions = [aiText]
                    if (agentsToProcess.length > 1)
                      agentSuggestions = agentSuggestions.map((s: string) => `[${agent.name}] ${s}`)
                    // Citation grounding: converte citações jurídicas em hyperlinks
                    agentSuggestions = agentSuggestions.map((s: string) => addCitationLinks(s))
                  }
                } else {
                  await new Promise((r) => setTimeout(r, 1500))
                  if (action === 'brainstorm') {
                    structuredResult = {
                      sugerir_secoes: ['1. Dos Fatos'],
                      perguntas_chave: ['Quais os danos?'],
                    }
                  } else if (action === 'extract_report_fields') {
                    structuredResult = {
                      situacao: 'O cliente...',
                      problemas: 'Riscos...',
                      solucoes: 'Ações...',
                      proximos_passos: 'Protocolar...',
                    }
                  } else {
                    agentSuggestions.push(`[${agent.name}] Adicione fundamentação.`)
                  }
                }

                const estimatedCost =
                  (inputTokens / 1000000) * costInputPerM +
                  (outputTokens / 1000000) * costOutputPerM

                return {
                  success: true,
                  agentName: agent.name,
                  structuredResult,
                  agentSuggestions,
                  inputTokens,
                  outputTokens,
                  cachedTokens,
                  cacheWrite,
                  cacheRead,
                  estimatedCost,
                }
              } catch (agentErr: any) {
                console.error(`Error processing agent ${agent.name}:`, agentErr.message)
                if (action === 'brainstorm' || action === 'extract_report_fields') {
                  throw agentErr
                } else {
                  return {
                    success: false,
                    agentName: agent.name,
                    errorDetail: agentErr.message || 'Erro desconhecido',
                  }
                }
              }
            }

            // WARM-UP SEQUENCIAL para cache compartilhado:
            // 1o agente paga cache_write (~330K tokens); os demais 4 rodam em paralelo
            // e leem do cache (cache_read = ~0.1x do preco de input).
            // Sem warm-up, 5 requests paralelas chegam antes do cache popular = 5x write.
            // Trade-off: +1x latencia do 1o agente em troca de ~80% de economia.
            let results: PromiseSettledResult<any>[]
            if (agentsToProcess.length > 1) {
              const firstResults = await Promise.allSettled([runAgent(agentsToProcess[0])])
              const restResults = await Promise.allSettled(agentsToProcess.slice(1).map(runAgent))
              results = [...firstResults, ...restResults]
            } else {
              results = await Promise.allSettled(agentsToProcess.map(runAgent))
            }

            for (const result of results) {
              if (result.status === 'fulfilled') {
                const data = result.value
                if (data.success) {
                  totalInputTokens += data.inputTokens!
                  totalOutputTokens += data.outputTokens!
                  totalCachedTokens += data.cachedTokens!
                  totalCacheWrite += data.cacheWrite || 0
                  totalCacheRead += data.cacheRead || 0
                  totalEstimatedCost += data.estimatedCost!
                  successCount++

                  if (action === 'brainstorm' || action === 'extract_report_fields') {
                    finalSuggestions = data.structuredResult
                  } else {
                    finalSuggestions = finalSuggestions.concat(data.agentSuggestions)
                  }
                } else {
                  finalSuggestions.push(`[${data.agentName}] Falha na análise: ${data.errorDetail}`)
                  agentFailures.push({ agent: data.agentName, error: data.errorDetail })
                }
              } else {
                if (action === 'brainstorm' || action === 'extract_report_fields') {
                  throw result.reason
                } else {
                  finalSuggestions.push(
                    `Falha na análise: ${result.reason?.message || 'Erro desconhecido'}`,
                  )
                  agentFailures.push({
                    agent: 'desconhecido',
                    error: result.reason?.message || 'Erro desconhecido',
                  })
                }
              }
            }

            if (
              action !== 'brainstorm' &&
              action !== 'extract_report_fields' &&
              successCount === 0 &&
              agentsToProcess.length > 0
            ) {
              throw new Error(
                JSON.stringify({
                  error: 'Todos os agentes falharam na geração de conteúdo.',
                  code: 'ALL_AGENTS_FAILED',
                  invocation_id: activeInvocationId,
                  failures: agentFailures,
                }),
              )
            }

            console.log(
              `Attempting DB Save for Invocation ID: ${activeInvocationId} (Token/Cost Update)`,
            )
            const { error: invErr } = await supabase
              .from('invocacoes')
              .update({ input_tokens: totalInputTokens, output_tokens: totalOutputTokens })
              .eq('id', activeInvocationId)
            if (invErr)
              console.error(
                `DB Save Failed for invocacoes (ID: ${activeInvocationId}):`,
                invErr.message,
              )
            else console.log(`DB Save Successful for invocacoes (ID: ${activeInvocationId})`)

            const { error: costErr } = await supabase
              .from('custos')
              .upsert(
                {
                  invocation_id: activeInvocationId,
                  estimated_cost: totalEstimatedCost,
                  currency: 'USD',
                  cached_tokens: totalCachedTokens,
                  cache_creation_input_tokens: totalCacheWrite,
                  cache_read_input_tokens: totalCacheRead,
                },
                { onConflict: 'invocation_id', ignoreDuplicates: false },
              )
            if (costErr)
              console.error(
                `DB Save Failed for custos (ID: ${activeInvocationId}):`,
                costErr.message,
              )
            else
              console.log(
                `DB Save Successful for custos (ID: ${activeInvocationId}) — write=${totalCacheWrite} read=${totalCacheRead}`,
              )

            if (action === 'brainstorm' || action === 'extract_report_fields') {
              sendEvent({ type: 'suggestions', data: finalSuggestions })
            } else {
              sendEvent({ type: 'suggestions', data: { suggestions: finalSuggestions } })
            }
          }

          sendEvent({ done: true })
        } catch (err: any) {
          console.error(
            `Stream processing error (Invocation ID: ${activeInvocationId}):`,
            err.message,
          )
          if (activeInvocationId && authHeader) {
            const safeClient = createClient(supabaseUrl, supabaseKey, {
              global: { headers: { Authorization: authHeader } },
            })
            const { error: diagErr } = await safeClient
              .from('invocacoes')
              .update({ diagnostic_log: err.message })
              .eq('id', activeInvocationId)
            if (diagErr) {
              console.error(
                `Failed to save diagnostic_log for Invocation ID ${activeInvocationId}:`,
                diagErr.message,
              )
            }
          }

          let errorMessage = err.message
          try {
            const parsed = JSON.parse(errorMessage)
            if (!parsed.invocation_id) parsed.invocation_id = activeInvocationId
            parsed.diagnostic_id = activeInvocationId
            errorMessage = JSON.stringify(parsed)
          } catch (e) {
            errorMessage = JSON.stringify({
              message: `Falha na Geração: ${errorMessage}`,
              invocation_id: activeInvocationId,
              diagnostic_id: activeInvocationId,
            })
          }

          sendEvent({ error: errorMessage })
        } finally {
          clearInterval(pingInterval)
          try {
            controller.close()
          } catch (e) {}
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...corsHeaders,
      },
    })
  } catch (error: any) {
    if (activeInvocationId && authHeader) {
      const safeClient = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader } },
      })
      // Anexa o erro ao log existente (antes sobrescrevia e apagava os step-events)
      await appendDiagStep(safeClient, activeInvocationId, 'fatal_error', {
        message: error.message,
      })
    }

    let status = 400
    let errorBody: any = { error: error.message }

    try {
      const parsed = JSON.parse(error.message)
      if (parsed.code === 'EMPTY_RESPONSE' || parsed.code === 'ALL_AGENTS_FAILED') {
        status = 500
        errorBody = parsed
      }
    } catch (e) {}

    errorBody.invocation_id = activeInvocationId
    errorBody.diagnostic_log = error.message
    errorBody.diagnostic_id = activeInvocationId
    if (!errorBody.message) {
      errorBody.message = `Falha na Geração: ${error.message}`
    }

    return new Response(JSON.stringify(errorBody), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
