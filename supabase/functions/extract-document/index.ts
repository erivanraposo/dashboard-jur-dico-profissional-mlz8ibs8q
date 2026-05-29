import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import pdf from 'npm:pdf-parse@1.1.1'
import { Buffer } from 'node:buffer'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
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

    if (file_path.toLowerCase().endsWith('.pdf')) {
      const arrayBuffer = await fileData.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const pdfData = await pdf(buffer)
      extractedText = pdfData.text
    } else {
      extractedText = await fileData.text()
    }

    if (extractedText.length > 50000) {
      extractedText =
        extractedText.substring(0, 50000) + '\n\n[Texto truncado devido ao tamanho...]'
    }

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
