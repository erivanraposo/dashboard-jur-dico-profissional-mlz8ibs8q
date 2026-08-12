import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import pdf from 'npm:pdf-parse@1.1.1'
import * as XLSX from 'npm:xlsx@0.18.5'
import mammoth from 'npm:mammoth@1.8.0'
import { Buffer } from 'node:buffer'
import { confereAritmetica, notaDaConferencia } from '../_shared/aritmetica-fiscal.ts'
import { registraAcesso } from '../_shared/registro-acesso.ts'

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

    // REGISTRO DE ACESSO. Depois do download bem-sucedido: o que interessa
    // auditar é leitura consumada, não tentativa. Grava com service_role porque
    // a tabela não aceita inserção de `authenticated` — assim o registro não
    // pode ser forjado nem suprimido pelo navegador. Nunca derruba a operação.
    const admin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )
    await registraAcesso(admin, {
      filePath: file_path,
      acao: 'extracao',
      origem: 'extract-document',
      userId: user.id,
      bytes: fileData.size,
    })

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

    // CAMADA DE TEXTO DANIFICADA — o terceiro caso, e o único em que OCR é a
    // resposta certa.
    //
    // Há três situações distintas, e confundi-las custou caro esta semana:
    //   1. texto íntegro            -> usar (e NÃO recomendar OCR)
    //   2. texto cortado por nós    -> dizer que o corte foi nosso
    //   3. TEXTO INDECIFRÁVEL       -> aqui, e só aqui, OCR resolve
    //
    // O caso 3 apareceu no auto de infração que Fernando Faria anexou em
    // 11/08/2026: PDF do e-Processo cujo conteúdo é desenhado com fonte Type3
    // SEM tabela ToUnicode. Type3 desenha os glifos em vez de codificá-los —
    // sem o mapeamento, não existe como saber que letra cada desenho
    // representa. O texto sai assim:
    //
    //   !!""#$%&'& ()%&% #!! *+,-./0.1234567- 89:;*<.=>?@1A?BC1D>1*<
    //
    // onde a página mostra "MINISTÉRIO DA ECONOMIA / Auto de Infração". Nas 5
    // páginas do formulário, 55 dos 55 spans de conteúdo estavam nessa fonte;
    // as 2 páginas de autenticação, em Helvetica, saíram perfeitas.
    //
    // E AQUI CONVERTER PARA MARKDOWN PIORA: joga fora a imagem da página, que é
    // legível, e preserva o texto, que não é. É o oposto do que ajudou no caso 2.
    //
    // DUAS CONDIÇÕES, nunca uma. Só a proporção de símbolos daria falso
    // positivo em tabela de valores e em código de autenticação — o
    // "EP10.0826.18163.9ABA" desta mesma peça foi marcado como lixo por um
    // detector que só olhava símbolos.
    const diagnostico = (t: string) => {
      const letras = (t.match(/\p{L}/gu) || []).length
      const simbolos = (t.match(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g) || []).length
      const palavrasPt = (
        t.match(/\b(?:de|da|do|em|para|com|que|n[ãa]o|por|dos|das|no|na|os|as|ao|à|uma?)\b/gi) || []
      ).length
      const propSimbolos = simbolos / Math.max(1, letras + simbolos)
      const ptPorMil = (palavrasPt / Math.max(1, t.length)) * 1000
      return {
        suspeito: t.length > 800 && propSimbolos > 0.18 && ptPorMil < 12,
        propSimbolos,
        ptPorMil,
      }
    }

    const d = diagnostico(extractedText)
    if (d.suspeito) {
      console.warn(
        `[extract-document] camada de texto suspeita em ${file_path}: ` +
          `${(d.propSimbolos * 100).toFixed(0)}% símbolos, ${d.ptPorMil.toFixed(1)} palavras/mil`,
      )
      extractedText =
        `[ALERTA DO SISTEMA — CAMADA DE TEXTO ILEGÍVEL, E DESTA VEZ O OCR RESOLVE: o texto ` +
        `extraído deste arquivo veio indecifrável (${(d.propSimbolos * 100).toFixed(0)}% de ` +
        `símbolos onde deveria haver letras). A causa típica é o documento ter sido gerado com ` +
        `fontes que DESENHAM os caracteres sem informar quais são — comum em PDF de sistema ` +
        `oficial, como o e-Processo da Receita Federal. O conteúdo está visível na página, mas ` +
        `não recuperável como texto.\n` +
        `O QUE FAZER: anexe o PDF ORIGINAL em vez de uma conversão para texto ou Markdown — a ` +
        `imagem da página é legível e a conversão descarta justamente ela. Se já for o PDF, ` +
        `aplicar OCR resolve. NÃO trate o conteúdo abaixo como o teor do documento.]\n\n` +
        extractedText
    }

    // CONFERÊNCIA ARITMÉTICA. Determinística, sem IA, custo zero — e roda antes
    // do corte, para conferir o documento inteiro e não só o pedaço que couber.
    try {
      const conf = confereAritmetica(extractedText)
      const nota = notaDaConferencia(conf)
      if (nota) {
        console.log(
          `[extract-document] aritmética em ${file_path}: ${conf.estado} ` +
            `(${conf.conferem}/${conf.linhas.length} linhas fecham)`,
        )
        extractedText = `${nota}\n\n${extractedText}`
      }
    } catch (e) {
      // Conferência é acréscimo: nunca pode impedir a entrega do texto.
      console.error('[extract-document] falha na conferência aritmética:', e)
    }

    // CORTE DE TEXTO — teto e aviso.
    //
    // Era 50.000 caracteres, com o aviso "[Texto truncado devido ao tamanho...]".
    // Dois defeitos, e o segundo é pior que o primeiro.
    //
    // 1. O TETO ERA BAIXO DEMAIS PARA O OFÍCIO. Um relatório fiscal de 30
    //    páginas tem 95 mil caracteres; peça de processo passa disso com
    //    facilidade. Cortar em 50 mil descarta metade de um documento comum.
    //
    // 2. O AVISO NÃO DIZIA QUEM CORTOU. O modelo recebia um texto que acabava no
    //    meio da seção 5.3.5 e concluía, corretamente, que o documento estava
    //    incompleto — mas atribuía a falha ao ARQUIVO e recomendava "aplicar OCR
    //    e reanexar na íntegra". O arquivo estava íntegro; nós é que o havíamos
    //    cortado. O advogado faria retrabalho inútil por ordem nossa.
    //
    // Relatado por Fernando Faria em 11/08/2026, ao converter para Markdown um
    // PDF que o pdf-lib já havia recusado: 95.620 caracteres, completo até o
    // hash da última página, cortado por nós em 50.000.
    //
    // O teto agora acompanha o do gate da analyze-legal-text (240.000, ~60 mil
    // tokens) e o aviso diz o que houve, em nome de quem, e o que NÃO adianta
    // fazer.
    const MAX_TEXT_CHARS = 240_000
    const tamanhoOriginal = extractedText.length
    if (tamanhoOriginal > MAX_TEXT_CHARS) {
      extractedText =
        extractedText.substring(0, MAX_TEXT_CHARS) +
        `\n\n[NOTA DO SISTEMA — NÃO É DEFEITO DO ARQUIVO: o texto acima foi ` +
        `cortado por NÓS em ${MAX_TEXT_CHARS.toLocaleString('pt-BR')} caracteres, ` +
        `de um total de ${tamanhoOriginal.toLocaleString('pt-BR')}. O documento ` +
        `original está íntegro e legível — aplicar OCR ou reexportar NÃO resolve ` +
        `e não deve ser recomendado. Para analisar o restante, divida o arquivo ` +
        `e anexe as partes. Ao relatar limitações, diga que o corte foi do sistema.]`
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
