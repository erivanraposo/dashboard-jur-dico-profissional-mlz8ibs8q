import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'npm:docx@9.0.3'
import { DOMParser } from 'npm:linkedom@0.18.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
  'Access-Control-Expose-Headers': 'content-disposition',
}

interface Branding {
  nome_escritorio: string
  endereco_logradouro: string
  endereco_cidade: string
  endereco_uf: string
  endereco_cep: string
  telefone: string
  email: string
  website: string
  oab_responsavel_nome: string
  oab_responsavel_numero: string
  oab_responsavel_uf: string
  logo_path: string
  cor_primaria: string
  cor_secundaria: string
  rodape_confidencialidade: string
  cabecalho_extra: string
}

// Remove # de cor hex (docx aceita apenas '1a3a5e', nao '#1a3a5e')
function normalizeColor(hex: string, fallback: string): string {
  return (hex || fallback).replace(/^#/, '')
}

// Extrai TextRuns de um node DOM, propagando estilos bold/italic/underline.
function extractRuns(node: any, parentStyle: any = {}): TextRun[] {
  const runs: TextRun[] = []
  if (!node) return runs
  const children = node.childNodes ? Array.from(node.childNodes) : []
  for (const ch of children) {
    const c = ch as any
    // TEXT_NODE = 3
    if (c.nodeType === 3) {
      const text = c.textContent ?? ''
      if (text) runs.push(new TextRun({ text, ...parentStyle }))
      continue
    }
    // ELEMENT_NODE = 1
    if (c.nodeType !== 1) continue
    const tag = (c.tagName || '').toLowerCase()
    if (tag === 'br') {
      runs.push(new TextRun({ break: 1, ...parentStyle }))
      continue
    }
    const style = { ...parentStyle }
    if (tag === 'strong' || tag === 'b') style.bold = true
    if (tag === 'em' || tag === 'i') style.italics = true
    if (tag === 'u') style.underline = {}
    if (tag === 's' || tag === 'strike' || tag === 'del') style.strike = true
    // Recursivo: pega runs dos descendentes com o estilo herdado
    runs.push(...extractRuns(c, style))
  }
  return runs
}

// Converte uma <table> HTML em objeto Table docx.
function convertTable(tableNode: any): Table | null {
  const rows: TableRow[] = []
  // Coleta todos os <tr> (em thead, tbody, tfoot, ou diretos)
  const trList = tableNode.querySelectorAll('tr')
  if (!trList || trList.length === 0) return null
  for (let i = 0; i < trList.length; i++) {
    const tr = trList[i]
    const cellNodes = tr.querySelectorAll('td, th')
    if (!cellNodes || cellNodes.length === 0) continue
    const cells: TableCell[] = []
    for (let j = 0; j < cellNodes.length; j++) {
      const c = cellNodes[j]
      const isHeader = (c.tagName || '').toLowerCase() === 'th'
      const baseStyle = isHeader ? { bold: true } : {}
      let runs = extractRuns(c, baseStyle)
      if (runs.length === 0) runs = [new TextRun({ text: '' })]
      cells.push(
        new TableCell({
          children: [new Paragraph({ children: runs })],
        }),
      )
    }
    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells }))
    }
  }
  if (rows.length === 0) return null
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  })
}

// Converte uma <ul> ou <ol> em lista de Paragraphs com bullet/numbering.
function convertList(listNode: any, ordered: boolean, level = 0): Paragraph[] {
  const items: Paragraph[] = []
  const children = elementChildren(listNode)
  for (const li of children) {
    const liEl = li as any
    if ((liEl.tagName || '').toLowerCase() !== 'li') continue
    const runs = extractRuns(liEl)
    items.push(
      new Paragraph({
        bullet: !ordered ? { level } : undefined,
        numbering: ordered ? { reference: 'numbered-list', level } : undefined,
        children: runs.length > 0 ? runs : [new TextRun({ text: '' })],
      }),
    )
    // Listas aninhadas
    const subLists = liEl.querySelectorAll(':scope > ul, :scope > ol')
    if (subLists) {
      for (const sl of Array.from(subLists)) {
        const slEl = sl as any
        items.push(...convertList(slEl, (slEl.tagName || '').toLowerCase() === 'ol', level + 1))
      }
    }
  }
  return items
}

// Converte um node DOM em Paragraph(s) ou Table.
function convertNode(node: any): (Paragraph | Table)[] {
  if (!node || node.nodeType !== 1) return []
  const tag = (node.tagName || '').toLowerCase()
  const HEADING_MAP: Record<string, any> = {
    h1: HeadingLevel.HEADING_1,
    h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3,
    h4: HeadingLevel.HEADING_4,
    h5: HeadingLevel.HEADING_5,
    h6: HeadingLevel.HEADING_6,
  }
  // Headings: aplica formato DIRETO nos runs (bold/size/color) em vez de
  // depender de pStyle (a lib docx nao deixa sobrescrever os defaults).
  if (HEADING_MAP[tag]) {
    const headingMeta: Record<
      string,
      {
        size: number
        bold: boolean
        italics?: boolean
        color: string
        align?: any
        spacing: { before: number; after: number }
      }
    > = {
      h1: {
        size: 32,
        bold: true,
        color: '000000',
        align: AlignmentType.CENTER,
        spacing: { before: 360, after: 240 },
      },
      h2: { size: 28, bold: true, color: '000000', spacing: { before: 280, after: 180 } },
      h3: { size: 26, bold: true, color: '000000', spacing: { before: 200, after: 120 } },
      h4: {
        size: 24,
        bold: true,
        italics: true,
        color: '000000',
        spacing: { before: 160, after: 100 },
      },
      h5: { size: 24, bold: true, color: '333333', spacing: { before: 120, after: 80 } },
      h6: { size: 22, bold: true, color: '333333', spacing: { before: 100, after: 60 } },
    }
    const meta = headingMeta[tag]
    // Propaga bold/size/color/italics para todos os runs do heading.
    // Bolds inline (<strong> dentro de <h1>) ficam OK porque extractRuns
    // ja preserva bold quando o parent ja tem.
    const runs = extractRuns(node, {
      bold: meta.bold,
      size: meta.size,
      color: meta.color,
      italics: meta.italics,
    })
    if (runs.length === 0) return []
    return [
      new Paragraph({
        alignment: meta.align,
        spacing: meta.spacing,
        // Mantem o heading sempre junto com o proximo paragrafo na mesma pagina.
        // Evita titulo sozinho no rodape (ex.: "TERMOS EM QUE PEDE DEFERIMENTO").
        keepNext: true,
        // Evita que o proprio heading seja quebrado entre paginas.
        keepLines: true,
        children: runs,
      }),
    ]
  }
  if (tag === 'p') {
    const runs = extractRuns(node)
    if (runs.length === 0) return [new Paragraph({})]
    // Decisao de alinhamento (em ordem de prioridade):
    // 1. style="text-align: ..." explicito no HTML
    // 2. Se o p tem <br> (multi-linhas com dados curtos), evita justified
    //    porque o Word distribui espaco entre palavras de cada linha
    // 3. Default: justified (peca juridica padrao)
    const styleAttr = (node.getAttribute && node.getAttribute('style')) || ''
    const taMatch = styleAttr.match(/text-align\s*:\s*(left|center|right|justify)/i)
    let alignment: any = AlignmentType.JUSTIFIED
    if (taMatch) {
      const t = taMatch[1].toLowerCase()
      alignment =
        t === 'center'
          ? AlignmentType.CENTER
          : t === 'right'
            ? AlignmentType.RIGHT
            : t === 'left'
              ? AlignmentType.LEFT
              : AlignmentType.JUSTIFIED
    } else {
      // Auto-detecta multi-linhas via <br>
      const hasBr = !!(node.querySelector && node.querySelector('br'))
      if (hasBr) alignment = AlignmentType.LEFT
    }
    return [
      new Paragraph({
        alignment,
        spacing: { after: 120, line: 360 }, // 1.5 line height + 6pt after
        children: runs,
      }),
    ]
  }
  if (tag === 'br') return [new Paragraph({})]
  if (tag === 'hr') {
    return [
      new Paragraph({
        border: {
          bottom: { color: '888888', space: 1, style: BorderStyle.SINGLE, size: 6 },
        },
      }),
    ]
  }
  if (tag === 'ul') return convertList(node, false)
  if (tag === 'ol') return convertList(node, true)
  if (tag === 'table') {
    const t = convertTable(node)
    return t ? [t] : []
  }
  if (tag === 'blockquote') {
    const runs = extractRuns(node, { italics: true })
    return [
      new Paragraph({
        indent: { left: 720 },
        children: runs.length > 0 ? runs : [new TextRun({ text: '' })],
      }),
    ]
  }
  // Containers (div, section, article, main, aside, header, footer in body): processa
  // children recursivamente. Se nao houver elementos block-level, transforma em Paragraph
  // a partir dos runs textuais.
  if (['div', 'section', 'article', 'main', 'aside', 'figure'].includes(tag)) {
    const result: (Paragraph | Table)[] = []
    const childEls = elementChildren(node)
    let hasBlockChildren = false
    for (const ch of childEls) {
      const tagCh = ((ch as any).tagName || '').toLowerCase()
      if (
        HEADING_MAP[tagCh] ||
        tagCh === 'p' ||
        tagCh === 'ul' ||
        tagCh === 'ol' ||
        tagCh === 'table' ||
        tagCh === 'hr' ||
        tagCh === 'div' ||
        tagCh === 'blockquote'
      ) {
        hasBlockChildren = true
        result.push(...convertNode(ch as any))
      }
    }
    if (!hasBlockChildren) {
      const runs = extractRuns(node)
      if (runs.length > 0) result.push(new Paragraph({ children: runs }))
    }
    return result
  }
  // Inline/desconhecido: converte em Paragraph com runs.
  const runs = extractRuns(node)
  if (runs.length > 0) return [new Paragraph({ children: runs })]
  return []
}

// Helper: retorna so filhos que sao Element (nodeType=1). Funciona em qualquer
// implementacao DOM (linkedom usa .childNodes; .children pode estar undefined).
function elementChildren(node: any): any[] {
  if (!node) return []
  const all = node.childNodes ? Array.from(node.childNodes) : []
  return all.filter((n: any) => n && n.nodeType === 1)
}

// Sanitiza HTML e converte em children docx (Paragraph[] | Table[]).
function htmlToDocxChildren(html: string): (Paragraph | Table)[] {
  let s = html
  // 1. Caracteres de controle invalidos em XML
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  // 2. Comentarios
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  // 3. Scripts, styles, iframes — remove inteiro
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
  // 4. STRIP de boilerplate de documento — globalmente, sem cuidado com aninhamento.
  // O front (SKIP) manda HTML completo e nossa Edge envolveria de novo. Resultado:
  // <body> aninhado mal-fechado, linkedom retorna 1 child generico. Solucao: tirar
  // TUDO que e boilerplate e envolver com nosso proprio <html><body> controlado.
  s = s.replace(/<!DOCTYPE[^>]*>/gi, '')
  s = s.replace(/<\/?html[^>]*>/gi, '')
  s = s.replace(/<head[\s\S]*?<\/head>/gi, '')
  s = s.replace(/<\/?head[^>]*>/gi, '')
  s = s.replace(/<\/?body[^>]*>/gi, '')
  s = s.replace(/<\/?title[^>]*>/gi, '')
  s = s.replace(/<\/?meta[^>]*\/?>/gi, '')
  s = s.trim()

  // Parse HTML com meta charset explicito (linkedom precisa pra UTF-8 funcionar)
  const parser = new DOMParser()
  const wrappedForParse = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${s}</body></html>`
  const doc = parser.parseFromString(wrappedForParse, 'text/html')
  const body = doc.querySelector('body') || doc.documentElement
  if (!body) {
    return [new Paragraph({ children: [new TextRun({ text: s.replace(/<[^>]+>/g, '') })] })]
  }

  const result: (Paragraph | Table)[] = []
  const children = elementChildren(body)
  console.log(`[export-docx] body element children: ${children.length}`)
  if (children.length > 0 && children.length <= 5) {
    children.forEach((c: any, i: number) => {
      console.log(
        `  [${i}] <${(c.tagName || '?').toLowerCase()}> (childNodes: ${c.childNodes?.length || 0})`,
      )
    })
  }
  for (const child of children) {
    result.push(...convertNode(child))
  }
  console.log(`[export-docx] block-level elementos gerados: ${result.length}`)
  // Fallback: se body tem so texto solto (sem tags block-level), gera um Paragraph
  if (result.length === 0) {
    const text = body.textContent ?? ''
    if (text.trim()) {
      result.push(new Paragraph({ children: [new TextRun({ text: text.trim() })] }))
    } else {
      result.push(new Paragraph({}))
    }
  }
  return result
}

// ----------------- Branding (header + footer programaticos) -----------------

function buildDocxHeader(b: Branding, logoBytes: Uint8Array | null): Header {
  const children: Paragraph[] = []
  const corPrimaria = normalizeColor(b.cor_primaria, '1a3a5e')
  const corSecundaria = normalizeColor(b.cor_secundaria, '666666')

  if (logoBytes) {
    try {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: logoBytes,
              transformation: { width: 100, height: 50 },
              type: 'png',
            } as any),
          ],
        }),
      )
    } catch (e) {
      console.warn('[export-docx] ImageRun falhou:', e)
    }
  }

  if (b.nome_escritorio) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: b.nome_escritorio,
            bold: true,
            size: 24, // 12pt = 24 half-points
            color: corPrimaria,
          }),
        ],
      }),
    )
  }

  if (b.cabecalho_extra) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: b.cabecalho_extra,
            size: 18, // 9pt
            color: corSecundaria,
          }),
        ],
      }),
    )
  }

  if (children.length === 0) {
    children.push(new Paragraph({}))
  }

  return new Header({ children })
}

function buildDocxFooter(b: Branding | null): Footer {
  const children: Paragraph[] = []
  const corSecundaria = normalizeColor(b?.cor_secundaria || '666666', '666666')

  if (b) {
    const cidadeUf =
      b.endereco_cidade && b.endereco_uf
        ? `${b.endereco_cidade}/${b.endereco_uf}`
        : b.endereco_cidade || b.endereco_uf
    const enderecoLine = [b.endereco_logradouro, cidadeUf, b.endereco_cep]
      .filter(Boolean)
      .join(' — ')
    const contatoLine = [b.telefone, b.email, b.website].filter(Boolean).join(' | ')
    const oabLine = b.oab_responsavel_nome
      ? `Resp.: ${b.oab_responsavel_nome} — OAB/${b.oab_responsavel_uf} nº ${b.oab_responsavel_numero}`
      : ''

    const lineParagraph = (text: string, italics = false) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text,
            size: 16, // 8pt
            color: corSecundaria,
            italics,
          }),
        ],
      })

    if (enderecoLine) children.push(lineParagraph(enderecoLine))
    if (contatoLine) children.push(lineParagraph(contatoLine))
    if (oabLine) children.push(lineParagraph(oabLine))
    if (b.rodape_confidencialidade) {
      children.push(lineParagraph(b.rodape_confidencialidade, true))
    }
  }

  // Paginacao sempre (mesmo sem branding)
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60 },
      children: [
        new TextRun({ text: 'Página ', size: 16, color: corSecundaria }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: corSecundaria }),
        new TextRun({ text: ' de ', size: 16, color: corSecundaria }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: corSecundaria }),
      ],
    }),
  )

  return new Footer({ children })
}

async function fetchBrandingForUser(
  supabase: any,
  userId: string,
): Promise<{ branding: Branding | null; logoBytes: Uint8Array | null }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userId)
    .maybeSingle()
  if (!profile?.workspace_id) return { branding: null, logoBytes: null }

  const { data: branding } = await supabase
    .from('workspace_branding')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle()
  if (!branding) return { branding: null, logoBytes: null }

  let logoBytes: Uint8Array | null = null
  if (branding.logo_path) {
    try {
      const { data: logoData } = await supabase.storage
        .from('workspace-branding')
        .download(branding.logo_path)
      if (logoData) {
        const ab = await logoData.arrayBuffer()
        logoBytes = new Uint8Array(ab)
      }
    } catch (e) {
      console.warn('[export-docx] logo download falhou:', e)
    }
  }

  return { branding, logoBytes }
}

// ----------------- HTTP handler -----------------

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
    const safeTitle = (title || 'Documento').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 100)

    const { branding, logoBytes } = await fetchBrandingForUser(supabase, user.id)
    const hasBranding = !!(branding?.nome_escritorio || branding?.logo_path)

    console.log(`[export-docx] convertendo HTML (${html.length} chars)...`)
    const bodyChildren = htmlToDocxChildren(html)
    console.log(`[export-docx] ${bodyChildren.length} elementos docx criados`)

    const doc = new Document({
      creator: 'Dashboard Juridico',
      title: safeTitle,
      styles: {
        default: {
          document: {
            run: { font: 'Times New Roman', size: 24 }, // 12pt
          },
        },
        paragraphStyles: [
          {
            id: 'Heading1',
            name: 'Heading 1',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: { size: 32, bold: true, color: '000000', font: 'Times New Roman' }, // 16pt
            paragraph: {
              spacing: { before: 360, after: 240 },
              alignment: AlignmentType.CENTER,
            },
          },
          {
            id: 'Heading2',
            name: 'Heading 2',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: { size: 28, bold: true, color: '000000', font: 'Times New Roman' }, // 14pt
            paragraph: { spacing: { before: 280, after: 180 } },
          },
          {
            id: 'Heading3',
            name: 'Heading 3',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: { size: 26, bold: true, color: '000000', font: 'Times New Roman' }, // 13pt
            paragraph: { spacing: { before: 200, after: 120 } },
          },
          {
            id: 'Heading4',
            name: 'Heading 4',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: { size: 24, bold: true, italics: true, color: '000000' }, // 12pt
            paragraph: { spacing: { before: 160, after: 100 } },
          },
          {
            id: 'Heading5',
            name: 'Heading 5',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: { size: 24, bold: true, color: '333333' },
            paragraph: { spacing: { before: 120, after: 80 } },
          },
          {
            id: 'Heading6',
            name: 'Heading 6',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: { size: 22, bold: true, color: '333333' },
            paragraph: { spacing: { before: 100, after: 60 } },
          },
        ],
      },
      numbering: {
        config: [
          {
            reference: 'numbered-list',
            levels: [
              { level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START },
              { level: 1, format: 'decimal', text: '%2.', alignment: AlignmentType.START },
            ],
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: hasBranding ? 1700 : 1440,
                right: 1440,
                bottom: hasBranding ? 1700 : 1440,
                left: 1440,
                header: 720,
                footer: 720,
              },
            },
          },
          headers: hasBranding ? { default: buildDocxHeader(branding!, logoBytes) } : undefined,
          footers: { default: buildDocxFooter(branding) },
          children: bodyChildren,
        },
      ],
    })

    console.log(`[export-docx] gerando DOCX via Packer...`)
    const buffer = await Packer.toBuffer(doc)
    const body = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    console.log(`[export-docx] DOCX gerado: ${body.byteLength} bytes`)

    return new Response(body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeTitle}.docx"`,
      },
    })
  } catch (error: any) {
    console.error('[export-docx] erro:', error?.message || error, error?.stack || '')
    return new Response(JSON.stringify({ error: error?.message || 'Falha ao gerar DOCX' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
