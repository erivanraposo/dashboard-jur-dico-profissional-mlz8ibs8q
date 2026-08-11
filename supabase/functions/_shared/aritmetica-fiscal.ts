// Conferência aritmética de documento fiscal.
//
// Todo auto de infração traz a mesma tríade impressa: BASE DE CÁLCULO,
// PERCENTUAL e VALOR. Conferir `base × percentual = valor` é aritmética, não
// interpretação — determinística, sem IA, custo zero. Mesmo princípio das bases
// canônicas: conferir contra o que JÁ ESTÁ no documento.
//
// NASCEU DE UM ERRO DE OCR. No auto que Fernando Faria anexou em 11/08/2026
// (R$ 9.144.991,08), o texto do PDF era indecifrável (fonte Type3) e foi preciso
// OCR. O OCR leu bem e comeu um dígito:
//
//   linha 10/2018:  leu 200.621,76   |  está escrito 209.621,76
//
// Nove mil reais a menos numa base de cálculo, e INVISÍVEL na leitura: o número
// é plausível, tem a forma dos vizinhos, não destoa. Só a conta denuncia —
// 200.621,76 × 1,5 = 300.932,64, mas o auto declara 314.432,64; com 209.621,76
// dá exatamente 314.432,64.
//
// E A MESMA CONTA PEGA ERRO DO PRÓPRIO FISCO, que não é higiene de dados: é
// argumento de defesa. Auto cuja aritmética não fecha tem vício demonstrável,
// aferível sem perícia e sem discutir mérito.
//
// DISTINGUIR AS DUAS COISAS É POSSÍVEL, e é o que dá utilidade ao resultado:
//   - se um valor CORRIGIDO faz a conta fechar -> foi erro de leitura
//   - se nenhuma correção plausível fecha      -> o defeito é do documento
//
// LIMITE DELIBERADO: só multiplicação simples (base × alíquota), como multa
// isolada e retenção. IRPJ com adições e exclusões, ICMS com substituição e
// contribuição por faixas têm outra conta, e errar aqui seria pior que não
// conferir.

export type LinhaConferida = {
  trecho: string
  base: number
  percentual: number
  valorDeclarado: number
  valorCalculado: number
  confere: boolean
  /** Base que faria a conta fechar, quando difere da lida por um só dígito. */
  baseDeduzida: number | null
}

export type Conferencia = {
  linhas: LinhaConferida[]
  conferem: number
  divergentes: LinhaConferida[]
  leiturasSuspeitas: LinhaConferida[]
  estado: 'ARITMETICA_CONFERE' | 'ARITMETICA_NAO_CONFERE' | 'LEITURA_SUSPEITA' | 'SEM_TABELA'
}

const NUM_RE = /\d{1,3}(?:\.\d{3})*,\d{2}(?![\d.,])|(?<![\d.,])\d+,\d{2}(?![\d.,])/g
const PCT_RE = /(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g

/** "1.058.092,38" -> 1058092.38 */
function numPt(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.'))
}

/** 1058092.38 -> "1.058.092,38" */
export function formataPt(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Um só dígito de diferença — inclui troca, supressão e inserção.
 *
 * É o que separa erro de LEITURA de vício do DOCUMENTO: OCR erra um algarismo,
 * o Fisco erra a conta. Comparar os dígitos sem a pontuação evita que
 * "200.621,76" e "209.621,76" pareçam distantes por causa dos pontos.
 */
function umDigitoDeDiferenca(a: number, b: number): boolean {
  const da = a.toFixed(2).replace(/\D/g, '')
  const db = b.toFixed(2).replace(/\D/g, '')
  if (da === db) return false
  if (da.length === db.length) {
    let dif = 0
    for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) dif++
    return dif === 1
  }
  if (Math.abs(da.length - db.length) !== 1) return false
  const [curto, longo] = da.length < db.length ? [da, db] : [db, da]
  for (let i = 0; i < longo.length; i++) {
    if (longo.slice(0, i) + longo.slice(i + 1) === curto) return true
  }
  return false
}

const perto = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 1e-6)

type Token = { tipo: 'num' | 'pct'; valor: number; ini: number; fim: number }

/**
 * Números e percentuais na ORDEM DO DOCUMENTO, ignorando a quebra de linha.
 *
 * A primeira versão lia linha a linha e passou nos meus casos de teste — que eu
 * havia escrito à mão, com um registro por linha. A extração REAL não faz isso:
 * põe cada célula em sua própria linha.
 *
 *   04/2016 Compensação indevida
 *   15.244,79
 *   150,00%
 *   22.867,18
 *
 * Contra o auto verdadeiro, aquela versão reconheceu ZERO linhas — e teria
 * devolvido "sem tabela" para um documento cheio de tabelas. Foi teste sintético
 * confirmando o que eu já esperava, que é o modo mais confortável de errar.
 *
 * Trabalhar sobre a sequência resolve os dois formatos de uma vez, porque em
 * ambos a ORDEM é a mesma: base, percentual, valor.
 */
function tokeniza(texto: string): Token[] {
  const toks: Token[] = []
  const re = new RegExp(`${PCT_RE.source}|${NUM_RE.source}`, 'g')
  for (const m of texto.matchAll(re)) {
    const bruto = m[0]
    if (bruto.includes('%')) {
      toks.push({ tipo: 'pct', valor: numPt(m[1]), ini: m.index!, fim: m.index! + bruto.length })
    } else {
      toks.push({ tipo: 'num', valor: numPt(bruto), ini: m.index!, fim: m.index! + bruto.length })
    }
  }
  return toks
}

export function confereAritmetica(texto: string): Conferencia {
  const linhas: LinhaConferida[] = []
  const toks = tokeniza(texto)

  // Reconhecimento POR RELAÇÃO NUMÉRICA, não por cabeçalho: os rótulos variam
  // entre órgãos ("Multa (%)", "Alíquota", "Percentual"), a relação não varia.
  // A tríade procurada é num → pct → num em sequência.
  for (let k = 1; k < toks.length - 1; k++) {
    const p = toks[k]
    if (p.tipo !== 'pct' || p.valor <= 0) continue
    const a = toks[k - 1]
    const b = toks[k + 1]
    if (a.tipo !== 'num' || b.tipo !== 'num' || a.valor <= 0 || b.valor <= 0) continue

    const base = a.valor
    const valor = b.valor
    const calc = Math.round(base * (p.valor / 100) * 100) / 100
    const confere = perto(calc, valor)
    const baseNecessaria = Math.round((valor / (p.valor / 100)) * 100) / 100
    // O trecho é citado ao advogado: não pode começar no meio de um número
    // ("...,99 150,00% 849.955,48 10/2018..."). Descarta-se o primeiro pedaço
    // parcial.
    const trecho = texto
      .slice(Math.max(0, a.ini - 60), b.fim)
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\S*\s+/, '')
      .slice(-140)

    linhas.push({
      trecho,
      base,
      percentual: p.valor,
      valorDeclarado: valor,
      valorCalculado: calc,
      confere,
      // Candidato a erro de leitura: qual base produziria o valor declarado? Se
      // difere da lida por um só algarismo, é erro de extração, não do documento.
      baseDeduzida: !confere && umDigitoDeDiferenca(base, baseNecessaria) ? baseNecessaria : null,
    })
  }

  const conferem = linhas.filter((l) => l.confere).length
  const divergentes = linhas.filter((l) => !l.confere && l.baseDeduzida === null)
  const leiturasSuspeitas = linhas.filter((l) => !l.confere && l.baseDeduzida !== null)

  // SÓ SE PRONUNCIA COM LASTRO. Uma linha isolada que não fecha pode ser
  // coincidência numérica; um documento em que a maioria fecha e uma escapa é
  // achado. Exige-se ao menos três linhas reconhecidas e maioria conferindo —
  // do contrário o que temos não é uma tabela fiscal.
  const lastro = linhas.length >= 3 && conferem >= linhas.length - Math.max(1, Math.floor(linhas.length * 0.2))

  const estado: Conferencia['estado'] =
    linhas.length === 0 || !lastro
      ? 'SEM_TABELA'
      : leiturasSuspeitas.length > 0
        ? 'LEITURA_SUSPEITA'
        : divergentes.length > 0
          ? 'ARITMETICA_NAO_CONFERE'
          : 'ARITMETICA_CONFERE'

  return { linhas, conferem, divergentes, leiturasSuspeitas, estado }
}

/**
 * Nota para juntar ao texto do anexo. NUNCA corrige o documento em silêncio:
 * mostra a conta e diz que houve dedução, porque quem assina é o advogado.
 */
export function notaDaConferencia(c: Conferencia): string | null {
  if (c.estado === 'SEM_TABELA' || c.estado === 'ARITMETICA_CONFERE') return null

  const linha = (l: LinhaConferida) =>
    `base ${formataPt(l.base)} × ${formataPt(l.percentual)}% = ${formataPt(l.valorCalculado)}, ` +
    `mas o documento declara ${formataPt(l.valorDeclarado)}`

  if (c.estado === 'LEITURA_SUSPEITA') {
    const l = c.leiturasSuspeitas[0]
    return (
      `[CONFERÊNCIA ARITMÉTICA — PROVÁVEL ERRO DE LEITURA, NÃO DO DOCUMENTO: ${c.conferem} de ` +
      `${c.linhas.length} linhas fecham exatamente, e ${c.leiturasSuspeitas.length} não. ` +
      `Em "${l.trecho}": ${linha(l)}. O valor ${formataPt(l.baseDeduzida!)} faria a conta fechar ` +
      `ao centavo, e difere do lido por um único algarismo — típico de erro de extração ou OCR. ` +
      `NÃO substitua o número por conta própria: confira a base de cálculo dessa linha no ` +
      `documento original antes de usar. Não afirme vício no lançamento com base nisto.]`
    )
  }

  return (
    `[CONFERÊNCIA ARITMÉTICA — A CONTA NÃO FECHA: ${c.conferem} de ${c.linhas.length} linhas ` +
    `conferem, e ${c.divergentes.length} não. ` +
    c.divergentes
      .slice(0, 3)
      .map((l) => `Em "${l.trecho}": ${linha(l)}`)
      .join('. ') +
    `. Nenhuma correção de um algarismo faz a conta fechar, o que afasta erro de leitura e ` +
    `aponta para divergência no próprio documento. Confira no original: se confirmada, é vício ` +
    `aferível sem perícia e sem discutir o mérito.]`
  )
}
