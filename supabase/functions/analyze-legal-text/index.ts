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
): Promise<{ documentBlocks: any[]; textContext: string }> {
  const MAX_PDF_BYTES = 32 * 1024 * 1024 // limite Anthropic por documento
  const PAGES_PER_CHUNK = 80 // <100 (limite Anthropic) com folga

  const documentBlocks: any[] = []
  let textContext = ''

  if (!anthropicKey) {
    textContext += '\n\n[Sem ANTHROPIC_API_KEY: PDFs nao podem ser enviados via Files API.]\n'
    return { documentBlocks, textContext }
  }

  for (const path of paths) {
    const lower = path.toLowerCase()
    try {
      if (lower.endsWith('.pdf')) {
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

        // Conta paginas e decide se precisa splittar
        const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const totalPages = srcDoc.getPageCount()
        const baseName = path.split('/').pop() || path

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
        if (!extError && extData?.text) {
          textContext += `\n\n--- Documento Anexo (${path}) ---\n${extData.text}\n`
        } else if (extError) {
          textContext += `\n\n[Falha ao extrair ${path}: ${extError.message}]\n`
        }
      }
    } catch (e: any) {
      console.error(`[prepareAttachmentsForVision] erro em ${path}:`, e?.message || e)
      textContext += `\n\n[Erro ao processar ${path}: ${e?.message || 'desconhecido'}]\n`
    }
  }

  // Aplica cache_control nos ate 4 ultimos document blocks
  // (limite Anthropic: 4 breakpoints por request; cache cobre via prefix-match)
  const numBlocks = documentBlocks.length
  if (numBlocks > 0) {
    const startCacheAt = Math.max(0, numBlocks - 4)
    for (let i = startCacheAt; i < numBlocks; i++) {
      documentBlocks[i].cache_control = { type: 'ephemeral' }
    }
  }

  return { documentBlocks, textContext }
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

    if (!finalContent || targetAgentIds.length === 0) {
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

          if (
            action !== 'apply' &&
            finalAttachments &&
            Array.isArray(finalAttachments) &&
            finalAttachments.length > 0
          ) {
            sendEvent({ status: 'Preparando anexos para analise (visao nativa para PDFs)...' })
            const anthropicKeyForUpload = Deno.env.get('ANTHROPIC_API_KEY')?.trim() || ''
            const prepared = await prepareAttachmentsForVision(
              supabase,
              finalAttachments,
              anthropicKeyForUpload,
              sendEvent,
            )
            documentBlocks = prepared.documentBlocks
            additionalContext += prepared.textContext
            sendEvent({
              status: `Anexos prontos: ${documentBlocks.length} blocos PDF (Files API) + ${prepared.textContext.length} chars texto.`,
            })
          }

          sendEvent({ status: 'Obtendo agentes de IA...' })
          const { data: agents, error: agentsError } = await supabase
            .from('agentes')
            .select('*')
            .in('id', targetAgentIds)

          if (agentsError || !agents || agents.length === 0) {
            throw new Error('Agentes não encontrados ou indisponíveis.')
          }

          const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim()
          const documentType = minute_type ? `Tipo de Minuta: ${minute_type}\n\n` : ''
          const processInfo = process_context ? `Contexto do Processo:\n${process_context}\n\n` : ''
          const fullContext = `${documentType}${processInfo}Conteúdo Principal (Editor):\n${finalContent}${additionalContext}`

          // Register the invocation immediately
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

          // --- ACTION: APPLY ---
          if (action === 'apply') {
            const agent = firstAgent

            // Standardize the model ID strictly without date suffixes
            let finalModel = req_model || agent.model || 'claude-sonnet-4-6'
            if (finalModel.includes('sonnet')) finalModel = 'claude-sonnet-4-6'
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

            let userMessage = `Aqui está o contexto e o documento atual (em formato HTML):\n\n${applyContext}\n\nPor favor, reescreva o Conteúdo Principal (Editor) aplicando as seguintes sugestões de melhoria. Mantenha a formatação HTML original, ajustando apenas o texto onde necessário:\n\n${(req_suggestions || []).map((s: string) => `- ${s}`).join('\n')}\n\nIMPORTANTE — PRESERVAR CAPA/CABEÇALHO: Se o documento contém uma capa, cabeçalho ou seção de identificação no início (com título, número de processo, NOME DO CLIENTE, data, etc.), PRESERVE ESSES ELEMENTOS EXATAMENTE como aparecem no original. NÃO remova o nome do cliente da capa. NÃO consolide/simplifique a capa. Mantenha a estrutura de identificação do documento intacta.\n\nCRÍTICO: Retorne o documento COMPLETO, até a sua conclusão natural. NÃO TRUNQUE o texto (ex: não pare no meio de um parágrafo ou seção). Se o texto for longo, certifique-se de terminar todo o conteúdo sem interrupções. Inclua no final do documento a tag <!-- END_OF_DOCUMENT --> para confirmar que você terminou de gerar todo o texto.\n\nRetorne APENAS o código HTML PURO do Conteúdo Principal revisado. NÃO envolva o HTML em marcação markdown (NÃO use \`\`\`html, NÃO use \`\`\`, NÃO use blocos de código). Comece DIRETAMENTE com a primeira tag HTML e termine na última tag HTML seguida da tag de conclusão. Nenhum texto, explicação ou marcação fora do HTML.`

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
                temperature: 0.3, // reduz variabilidade da reescrita; Sonnet 4.6 aceita 0..1
                system: [
                  { type: 'text', text: finalSystemPrompt, cache_control: { type: 'ephemeral' } },
                ],
                messages,
              }
              // Ensure thinking mode is strictly disabled for rewriting and applying
              delete payloadParams.thinking

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
                            supabase
                              .from('minutes')
                              .update({
                                content: fullText,
                                updated_at: new Date().toISOString(),
                              })
                              .eq('id', activeMinuteId)
                              .then()
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
              // Garante que o que vai pro DB e exports nao tenha lixo no inicio/fim.
              fullText = fullText
                .replace(/^\s*```(?:html|HTML)?\s*\r?\n?/, '')
                .replace(/\r?\n?\s*```\s*$/, '')
                .trim()

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

            const runAgent = async (agent: any) => {
              try {
                let agentSuggestions: string[] = []
                let structuredResult: any = null

                // For analysis actions, use Sonnet 4.6 (1M context window).
                // Haiku 4.5 cap is 200K tokens — fica pequeno demais quando
                // o anexo PDF e grande (e.g. 217 pgs viram ~337K tokens).
                let finalModel = 'claude-sonnet-4-6'

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
                    'Você é um revisor jurídico sênior. Analise os documentos anexados com rigor técnico, identificando fundamentos legais aplicáveis, jurisprudência relevante e pontos de atenção específicos.'

                  // Instrucao de tarefa (varia por action mas eh igual entre agentes do mesmo action)
                  let taskInstruction =
                    action === 'brainstorm'
                      ? `Retorne um JSON estrito (sem crases ou marcação markdown) com duas chaves: "sugerir_secoes" (array de strings) e "perguntas_chave" (array de strings). NÃO INCLUA nenhum texto conversacional ou de preenchimento antes ou depois do JSON. Retorne APENAS o JSON válido.`
                      : action === 'extract_report_fields'
                        ? `Extraia as informações para um Relatório de Caso. Retorne um JSON estrito (sem crases ou marcação markdown) com as chaves: "situacao", "problemas", "solucoes", "proximos_passos". O conteúdo de cada chave deve ser um texto resumido e profissional focado em relatório jurídico. NÃO INCLUA nenhum texto conversacional ou de preenchimento antes ou depois do JSON. Retorne APENAS o JSON válido.`
                        : `Produza ENTRE ${minSug} E ${maxSug} sugestões objetivas de melhoria, priorizadas (as mais críticas primeiro). Cada sugestão deve ser específica, acionável e referenciar precisamente o ponto do documento. Formate cada sugestão como bullet point em uma linha começando com '- '. NÃO adicione texto introdutório, conclusão ou comentários — apenas a lista.`

                  // Texto especifico do agente (vai DEPOIS dos documentBlocks, NAO cacheado):
                  // persona do agente + tarefa + contexto do editor/metadados
                  const agentInstructionText = `## Sua persona\n${finalSystemPrompt}\n\n## Sua tarefa\n${taskInstruction}\n\n## Contexto do caso\n${fullContext}`

                  // userMessage (string) usada como fallback quando nao ha documentBlocks
                  const userMessage = agentInstructionText

                  // Monta content multimodal: documentos cacheados (mesmos para todos
                  // os agentes) + texto especifico do agente (varia, no fim do prefix).
                  const userContent: any[] =
                    documentBlocks.length > 0
                      ? [...documentBlocks, { type: 'text', text: agentInstructionText }]
                      : userMessage

                  const payloadParams: any = {
                    model: finalModel,
                    max_tokens: maxTokens,
                    temperature: 0.3, // reduz variabilidade no numero/conteudo das sugestoes
                    system: [
                      {
                        type: 'text',
                        text: FIXED_SYSTEM,
                        cache_control: { type: 'ephemeral' },
                      },
                    ],
                    messages: [{ role: 'user', content: userContent }],
                  }

                  // Timeout maior pra 1a chamada (cache write em PDFs grandes
                  // pode levar 60-120s); chamadas com cache hit voam.
                  const fetchTimeout = documentBlocks.length > 0 ? 240000 : 90000

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
                      body: JSON.stringify(payloadParams),
                      signal: AbortSignal.timeout(fetchTimeout),
                    }),
                    `messages:analyze:${agent.name}`,
                  )

                  if (!anthropicRes.ok) {
                    const errText = await anthropicRes.text()
                    throw new Error(`Anthropic API Error: ${errText}`)
                  }

                  const aiData = await anthropicRes.json()

                  console.log('Raw AI Content Array:', JSON.stringify(aiData.content))

                  if (
                    !aiData.content ||
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

                  const textBlocks = aiData.content.filter(
                    (c: any) => c.type === 'text' && typeof c.text === 'string',
                  )
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

                  inputTokens = aiData.usage?.input_tokens || 0
                  outputTokens = aiData.usage?.output_tokens || 0
                  cacheWrite = aiData.usage?.cache_creation_input_tokens || 0
                  cacheRead = aiData.usage?.cache_read_input_tokens || 0
                  cachedTokens = cacheWrite + cacheRead

                  // Log diagnostico de cache: confirma se PDFs estao sendo reusados entre agentes
                  console.log(
                    `[CACHE ${agent.name}] input=${inputTokens} write=${cacheWrite} read=${cacheRead} docs=${documentBlocks.length}`,
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
                }
              } else {
                if (action === 'brainstorm' || action === 'extract_report_fields') {
                  throw result.reason
                } else {
                  finalSuggestions.push(
                    `Falha na análise: ${result.reason?.message || 'Erro desconhecido'}`,
                  )
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
      const { error: diagErr } = await safeClient
        .from('invocacoes')
        .update({ diagnostic_log: error.message })
        .eq('id', activeInvocationId)
      if (diagErr) {
        console.error(
          `Failed to save diagnostic_log for Invocation ID ${activeInvocationId}:`,
          diagErr.message,
        )
      }
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
