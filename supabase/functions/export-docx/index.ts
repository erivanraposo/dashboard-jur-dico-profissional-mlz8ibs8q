import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import HTMLtoDOCX from 'npm:html-to-docx@1.8.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
  'Access-Control-Expose-Headers': 'content-disposition',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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

    const { html, title } = await req.json()

    if (!html || typeof html !== 'string' || html.trim().length === 0) {
      throw new Error('HTML vazio ou invalido fornecido para export DOCX')
    }

    // html-to-docx aceita HTML e produz um Buffer com o arquivo .docx valido.
    // Configura header com titulo, footer com numero de pagina, e tabelas que
    // nao quebram entre paginas.
    const safeTitle = (title || 'Documento').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 100)
    const wrappedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title></head><body>${html}</body></html>`

    const docxBuffer = await HTMLtoDOCX(wrappedHtml, null, {
      orientation: 'portrait',
      pageNumber: true,
      footer: true,
      title: safeTitle,
      table: { row: { cantSplit: true } },
      font: 'Times New Roman',
      fontSize: 24, // half-points (= 12pt)
    })

    // html-to-docx returns either Buffer ou Blob, dependendo do ambiente.
    // Em Deno é Buffer (Uint8Array).
    let body: Uint8Array
    if (docxBuffer instanceof Uint8Array) {
      body = docxBuffer
    } else if (docxBuffer && typeof (docxBuffer as any).arrayBuffer === 'function') {
      body = new Uint8Array(await (docxBuffer as Blob).arrayBuffer())
    } else {
      throw new Error('html-to-docx retornou formato inesperado')
    }

    return new Response(body, {
      headers: {
        ...corsHeaders,
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeTitle}.docx"`,
      },
    })
  } catch (error: any) {
    console.error('[export-docx] erro:', error?.message || error)
    return new Response(JSON.stringify({ error: error?.message || 'Falha ao gerar DOCX' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
