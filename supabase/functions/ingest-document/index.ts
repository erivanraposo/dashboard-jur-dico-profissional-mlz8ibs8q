import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// ============================================================================
// INGEST-DOCUMENT — Fase B (ingestão com digests)
//
// Processa UMA parte de PDF por invocação: baixa do Storage, sobe à Anthropic
// Files API e gera um DIGEST ESTRUTURADO (markdown) que fica persistido em
// document_digests. O digest é pago 1x por documento e reutilizado por todas
// as análises futuras do analyze-legal-text (contexto texto, cacheável).
//
// Regra de ouro: cada invocação trata 1 anexo (parte de ≤80 pgs gerada pelo
// splitter do front). Sem pdf-lib — o range de páginas vem do nome do arquivo
// (_ptNdeM_pgsX-Y.pdf). Isso mantém a função muito abaixo do limite de CPU
// do isolate (lição do CPU kill de 06/07/2026).
//
// Payload: { attachment_id: uuid }
// Retorno: { status: 'done'|'already_done'|'error', digest_id?, pages?, ... }
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

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

// Modelo do digest: Sonnet 5. O digest é pago 1x e consumido por TODAS as
// análises futuras — qualidade aqui é alavancada, vale o modelo forte.
const DIGEST_MODEL = 'claude-sonnet-5'
// Preço normal Sonnet 5: $3/$15 por 1M (intro $2/$10 até 31/08/2026 —
// usamos o preço normal para não subestimar custo).
const COST_INPUT_PER_M = 3.0
const COST_OUTPUT_PER_M = 15.0

function buildDigestPrompt(fileName: string, pageStart: number | null, pageEnd: number | null) {
  const rangeNote =
    pageStart && pageEnd
      ? `Esta parte corresponde às páginas ${pageStart} a ${pageEnd} do documento original completo.`
      : `Este arquivo é um documento jurídico integral (não é parte de divisão).`

  return `Você é um analista judicial experiente. O PDF anexado é uma parte de autos processuais ou um documento jurídico extenso. ${rangeNote}

Produza um DIGEST ESTRUTURADO, fiel e denso, em Markdown. Ele substituirá o documento integral no contexto de outros analistas de IA — tudo que não estiver no digest será invisível para eles. Priorize completude factual.

Estrutura obrigatória (omita seções sem conteúdo, indicando "— nada nesta parte"):

# DIGEST — ${fileName}${pageStart && pageEnd ? ` (páginas ${pageStart}-${pageEnd} do original)` : ''}

## 1. Peças e documentos identificados
Lista: [pg N-M local] tipo da peça/documento — 1 linha sobre o conteúdo.

## 2. Partes e qualificação
Todas as pessoas físicas e jurídicas com papel processual (autor, réu, juiz, MP, peritos, terceiros), com dados de qualificação presentes no texto.

## 3. Cronologia
Eventos relevantes: data — descrição objetiva — [pg N local].

## 4. Decisões judiciais
Para cada decisão nesta parte: órgão/juízo, dispositivo, fundamentos centrais, [pg N local].

## 5. Prazos e pendências
Intimações, prazos em curso, diligências determinadas e não cumpridas.

## 6. Valores, bens e constrições
Quantias, bloqueios, penhoras, garantias, honorários — com [pg N local].

## 7. Trechos literais essenciais
Citações curtas (até 3 linhas cada) decisivas, entre aspas, com [pg N local].

## 8. Observações do analista
Inconsistências, lacunas, páginas ilegíveis, pontos de atenção factual.

Regras inegociáveis:
- NUNCA invente conteúdo. Se algo estiver ilegível, registre "[ilegível pg N]".
- Referencie páginas na numeração LOCAL desta parte (pg 1 = primeira página do PDF anexado). O cabeçalho do digest já informa o offset no documento original.
- Sem análise de mérito, sem recomendações, sem opinião — isso é papel dos agentes que consumirão este digest.
- Use listas e frases diretas; nada de prosa introdutória ou conclusiva.`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('>>>>>>>> INGEST-DOCUMENT FASE B v1 <<<<<<<<')

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const authHeader = req.headers.get('Authorization')

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })

  let attachmentId: string | null = null
  let supabase: any = null

  try {
    const payload = await req.json()
    attachmentId = payload?.attachment_id || null
    if (!attachmentId) throw new Error('attachment_id é obrigatório')
    if (!authHeader) throw new Error('Unauthorized')

    supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    // 1. Anexo
    const { data: att, error: attErr } = await supabase
      .from('process_attachments')
      .select('id, file_name, file_path, file_size, digest_status')
      .eq('id', attachmentId)
      .maybeSingle()
    if (attErr || !att) throw new Error(`Anexo não encontrado: ${attErr?.message || attachmentId}`)
    if (!att.file_path.toLowerCase().endsWith('.pdf')) {
      throw new Error('Ingestão com digest suporta apenas PDF (formatos textuais já vão como texto)')
    }

    // 2. Idempotência: digest pronto → retorna sem reprocessar
    const { data: existing } = await supabase
      .from('document_digests')
      .select('id, status')
      .eq('attachment_id', attachmentId)
      .eq('chunk_index', 0)
      .maybeSingle()
    if (existing?.status === 'done') {
      return json({ status: 'already_done', digest_id: existing.id })
    }

    // 3. Range de páginas pelo nome (partes do splitter: _ptNdeM_pgsX-Y.pdf)
    const partMatch = att.file_name.match(/_pt\d+de\d+_pgs(\d+)-(\d+)\.pdf$/i)
    const pageStart = partMatch ? parseInt(partMatch[1], 10) : null
    const pageEnd = partMatch ? parseInt(partMatch[2], 10) : null

    // 4. Marca processing (anexo + linha do digest)
    await supabase
      .from('process_attachments')
      .update({ digest_status: 'processing' })
      .eq('id', attachmentId)
    const { data: digestRow, error: upsertErr } = await supabase
      .from('document_digests')
      .upsert(
        {
          attachment_id: attachmentId,
          chunk_index: 0,
          page_start: pageStart,
          page_end: pageEnd,
          status: 'processing',
          model: DIGEST_MODEL,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'attachment_id,chunk_index' },
      )
      .select('id')
      .single()
    if (upsertErr) throw new Error(`Falha ao registrar digest: ${upsertErr.message}`)

    // 5. Download do Storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from('process-attachments')
      .download(att.file_path)
    if (dlErr || !fileData) throw new Error(`Falha ao baixar ${att.file_path}: ${dlErr?.message}`)
    const bytes = new Uint8Array(await fileData.arrayBuffer())

    // 6. Files API
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim()
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY ausente')
    const fileId = await uploadToAnthropicFilesApi(bytes, att.file_name, anthropicKey)

    // 7. Chamada de digest (sem thinking; tarefa é transcrição estruturada)
    const res = await fetchWithRetry(
      'https://api.anthropic.com/v1/messages',
      () => ({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'files-api-2025-04-14',
        },
        // Sonnet 5: sem `temperature` (removido, HTTP 400) e com thinking
        // EXPLICITAMENTE desligado — omitir o campo liga o adaptativo por
        // default, que consome o max_tokens e devolve resposta sem blocos
        // de texto ("Digest vazio", falhas de 06/07). Digest e transcricao
        // estruturada, nao precisa de raciocinio. max_tokens 16000: digests
        // de 80 pgs batiam no teto de 8192 (truncamento silencioso).
        body: JSON.stringify({
          model: DIGEST_MODEL,
          max_tokens: 16000,
          thinking: { type: 'disabled' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'document', source: { type: 'file', file_id: fileId }, title: att.file_name },
                { type: 'text', text: buildDigestPrompt(att.file_name, pageStart, pageEnd) },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(300000),
      }),
      `messages:digest:${att.file_name}`,
    )
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Anthropic API Error (HTTP ${res.status}): ${errText.slice(0, 500)}`)
    }
    const aiData = await res.json()
    const digestMd = (aiData.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim()
    if (!digestMd) throw new Error('Digest vazio: resposta sem blocos de texto')

    const inputTokens = aiData.usage?.input_tokens || 0
    const outputTokens = aiData.usage?.output_tokens || 0
    const estimatedCost =
      (inputTokens / 1_000_000) * COST_INPUT_PER_M + (outputTokens / 1_000_000) * COST_OUTPUT_PER_M

    // 8. Persiste
    const { error: doneErr } = await supabase
      .from('document_digests')
      .update({
        digest_md: digestMd,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost: estimatedCost,
        status: 'done',
        error_detail: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', digestRow.id)
    if (doneErr) throw new Error(`Falha ao salvar digest: ${doneErr.message}`)
    await supabase
      .from('process_attachments')
      .update({ digest_status: 'done' })
      .eq('id', attachmentId)

    console.log(
      `[DIGEST OK] ${att.file_name} pgs=${pageStart}-${pageEnd} in=${inputTokens} out=${outputTokens} cost=$${estimatedCost.toFixed(4)}`,
    )
    return json({
      status: 'done',
      digest_id: digestRow.id,
      page_start: pageStart,
      page_end: pageEnd,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: estimatedCost,
    })
  } catch (error: any) {
    console.error(`[DIGEST ERROR] attachment=${attachmentId}:`, error?.message || error)
    // Melhor esforço: marca erro no anexo e na linha do digest
    try {
      if (supabase && attachmentId) {
        await supabase
          .from('process_attachments')
          .update({ digest_status: 'error' })
          .eq('id', attachmentId)
        await supabase
          .from('document_digests')
          .update({
            status: 'error',
            error_detail: String(error?.message || error).slice(0, 1000),
            updated_at: new Date().toISOString(),
          })
          .eq('attachment_id', attachmentId)
          .eq('chunk_index', 0)
      }
    } catch (_e) {
      // não mascarar o erro original
    }
    return json({ status: 'error', error: error?.message || 'Erro desconhecido' }, 500)
  }
})
