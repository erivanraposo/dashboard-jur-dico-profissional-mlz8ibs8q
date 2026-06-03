import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import pdf from 'npm:pdf-parse@1.1.1'
import * as XLSX from 'npm:xlsx@0.18.5'
import mammoth from 'npm:mammoth@1.8.0'
import { Buffer } from 'node:buffer'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

// PDFs grandes (>50MB) tendem a estourar a memoria do Edge Function ao descompactar.
// 50MB cobre processos juridicos longos sem risco.
const MAX_PDF_BYTES = 50 * 1024 * 1024
// Excel raramente passa de 10MB com conteudo util; limite generoso.
const MAX_XLSX_BYTES = 20 * 1024 * 1024
// Word .docx idem.
const MAX_DOCX_BYTES = 20 * 1024 * 1024

function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function extractFromXlsx(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const parts: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    // Converte em CSV-like, mantendo legivel para a IA. Usa | como separador.
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ' | ', blankrows: false })
    if (csv.trim()) {
      parts.push(`### Planilha: ${sheetName}\n\n${csv.trim()}`)
    }
  }
  return parts.join('\n\n---\n\n')
}

async function extractFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer })
  return result.value || ''
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { file_path } = await req.json()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('process-attachments')
      .download(file_path)

    if (downloadError || !fileData) {
      throw new Error(
        'Failed to download file from process-attachments: ' +
          (downloadError?.message || 'Unknown error'),
      )
    }

    let extractedText = ''
    const lowerPath = file_path.toLowerCase()
    const fileSize = fileData.size

    if (lowerPath.endsWith('.pdf')) {
      if (fileSize > MAX_PDF_BYTES) {
        throw new Error(
          `PDF muito grande (${humanFileSize(fileSize)}). O limite atual e ${humanFileSize(MAX_PDF_BYTES)}. Divida o documento em partes menores ou extraia previamente o texto.`,
        )
      }
      const arrayBuffer = await fileData.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const pdfData = await pdf(buffer)
      extractedText = pdfData.text
    } else if (lowerPath.endsWith('.xlsx') || lowerPath.endsWith('.xls')) {
      if (fileSize > MAX_XLSX_BYTES) {
        throw new Error(
          `Planilha Excel muito grande (${humanFileSize(fileSize)}). O limite atual e ${humanFileSize(MAX_XLSX_BYTES)}.`,
        )
      }
      const arrayBuffer = await fileData.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      extractedText = extractFromXlsx(buffer)
    } else if (lowerPath.endsWith('.docx')) {
      if (fileSize > MAX_DOCX_BYTES) {
        throw new Error(
          `Word .docx muito grande (${humanFileSize(fileSize)}). O limite atual e ${humanFileSize(MAX_DOCX_BYTES)}.`,
        )
      }
      const arrayBuffer = await fileData.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      extractedText = await extractFromDocx(buffer)
    } else if (
      lowerPath.endsWith('.txt') ||
      lowerPath.endsWith('.md') ||
      lowerPath.endsWith('.csv')
    ) {
      extractedText = await fileData.text()
    } else {
      throw new Error(
        `Formato de arquivo nao suportado: ${file_path}. Formatos aceitos: PDF, XLSX, XLS, DOCX, TXT, MD, CSV.`,
      )
    }

    if (extractedText.length > 50000) {
      extractedText =
        extractedText.substring(0, 50000) + '\n\n[Texto truncado devido ao tamanho...]'
    }

    // OCR cleanup via IA — desabilitado por padrao agora, pois adiciona latencia/custo
    // e PDFs com texto nativo (maioria dos processos juridicos) ja vem bem formatados.
    // Re-habilitar se for relevante para PDFs escaneados (OCR ruim).
    const useAiCleanup = false

    if (useAiCleanup) {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim()
      if (anthropicKey && extractedText.trim()) {
        try {
          const payloadParams = {
            model: 'claude-haiku-4-5',
            max_tokens: 4096,
            system: [
              {
                type: 'text',
                text: 'You are an expert OCR cleanup assistant. Your task is to receive raw text extracted from a PDF and fix formatting, typos, and structural issues without removing any actual content.',
                cache_control: { type: 'ephemeral' },
              },
            ],
            messages: [
              {
                role: 'user',
                content: `Please clean up the following extracted text:\n\n${extractedText}`,
              },
            ],
          }
          const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'prompt-caching-2024-07-31',
            },
            body: JSON.stringify(payloadParams),
          })
          if (anthropicRes.ok) {
            const aiData = await anthropicRes.json()
            if (aiData.content?.[0]?.text) {
              extractedText = aiData.content[0].text
            }
          } else {
            const errText = await anthropicRes.text()
            if (errText.includes('not_found_error')) {
              console.error('Model Not Found Error - Payload:', JSON.stringify(payloadParams))
            }
          }
        } catch (e) {
          console.error('AI cleanup failed', e)
        }
      }
    }

    return new Response(JSON.stringify({ text: extractedText }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
