/**
 * Cálculo de prazos processuais — portado do agente `lembrete-prazo`.
 * Determinístico (sem IA). Base: CPC 219 (dias úteis), 224 (início no 1º dia útil
 * seguinte), 220 (recesso 20/12–20/01), 183/186/229 (prazo em dobro).
 *
 * IMPORTANTE: só exclui feriados NACIONAIS por lei federal. Carnaval, Sexta-feira
 * Santa e Corpus Christi NÃO são feriados nacionais — são suspensão de expediente
 * forense LOCAL. Não os excluímos automaticamente (isso empurraria a data fatal
 * para depois da real). Em vez disso, a saída sempre traz um aviso [A VERIFICAR]
 * para o advogado conferir o calendário do tribunal.
 */

export type Contagem = 'uteis' | 'corridos'

export interface TipoPrazo {
  key: string
  label: string
  dias: number
  contagem: Contagem
  base: string
}

export const TIPOS_PRAZO: TipoPrazo[] = [
  { key: 'contestacao', label: 'Contestação (cível)', dias: 15, contagem: 'uteis', base: 'CPC 335' },
  { key: 'replica', label: 'Réplica', dias: 15, contagem: 'uteis', base: 'CPC 350' },
  { key: 'apelacao', label: 'Apelação', dias: 15, contagem: 'uteis', base: 'CPC 1.003 §5' },
  { key: 'agravo', label: 'Agravo de instrumento', dias: 15, contagem: 'uteis', base: 'CPC 1.003 §5' },
  { key: 'embargos_decl', label: 'Embargos de declaração', dias: 5, contagem: 'uteis', base: 'CPC 1.023' },
  { key: 'resp_re', label: 'Recurso especial / extraordinário', dias: 15, contagem: 'uteis', base: 'CPC 1.003 §5' },
  { key: 'embargos_exec', label: 'Embargos à execução', dias: 15, contagem: 'uteis', base: 'CPC 915' },
  { key: 'impugnacao', label: 'Impugnação ao cumprimento de sentença', dias: 15, contagem: 'uteis', base: 'CPC 525' },
  { key: 'ro_trab', label: 'Recurso ordinário trabalhista', dias: 8, contagem: 'uteis', base: 'CLT 895' },
  { key: 'resp_acusacao', label: 'Resposta à acusação (penal)', dias: 10, contagem: 'corridos', base: 'CPP 396' },
  { key: 'apelacao_crim', label: 'Apelação criminal', dias: 5, contagem: 'corridos', base: 'CPP 593' },
  { key: 'custom', label: 'Outro (informar os dias)', dias: 15, contagem: 'uteis', base: '' },
]

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => new Date(s + 'T00:00:00')
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

/** Feriados NACIONAIS por lei federal (Lei 662/49 + 6.802/80 + 10.607/2002 + 14.759/2023). */
function feriadosNacionais(ano: number): Set<string> {
  return new Set([
    `${ano}-01-01`, `${ano}-04-21`, `${ano}-05-01`, `${ano}-09-07`,
    `${ano}-10-12`, `${ano}-11-02`, `${ano}-11-15`, `${ano}-11-20`, `${ano}-12-25`,
  ])
}

/** Recesso forense 20/12 a 20/01 (CPC 220) — prazos suspensos. */
function emRecesso(d: Date): boolean {
  const m = d.getMonth() + 1, dia = d.getDate()
  return (m === 12 && dia >= 20) || (m === 1 && dia <= 20)
}

function ehDiaUtil(d: Date, feriados: Set<string>, comRecesso: boolean): boolean {
  const wd = d.getDay() // 0=domingo, 6=sábado
  if (wd === 0 || wd === 6) return false
  if (feriados.has(iso(d))) return false
  if (comRecesso && emRecesso(d)) return false
  return true
}

export interface CalcInput {
  intimacao: string // 'YYYY-MM-DD'
  dias: number
  contagem: Contagem
  emDobro: boolean
}

export interface CalcResult {
  fatal: string | null
  inicio: string | null
  passos: string[]
  avisos: string[]
}

export function calcularPrazo(inp: CalcInput): CalcResult {
  const avisos: string[] = []
  const passos: string[] = []
  if (!inp.intimacao || !inp.dias || inp.dias < 1) {
    return { fatal: null, inicio: null, passos, avisos }
  }

  const intimacao = parse(inp.intimacao)
  const anos = [intimacao.getFullYear(), intimacao.getFullYear() + 1]
  const feriados = new Set<string>()
  anos.forEach((a) => feriadosNacionais(a).forEach((f) => feriados.add(f)))

  const diasEfetivos = inp.emDobro ? inp.dias * 2 : inp.dias
  if (inp.emDobro) passos.push(`Prazo em dobro aplicado: ${inp.dias} → ${diasEfetivos} dias (CPC 183/186/229).`)

  const fmt = (d: Date) => d.toLocaleDateString('pt-BR')

  if (inp.contagem === 'uteis') {
    // Início = 1º dia útil seguinte à intimação (CPC 224)
    let inicio = addDays(intimacao, 1)
    while (!ehDiaUtil(inicio, feriados, true)) inicio = addDays(inicio, 1)
    passos.push(`Intimação em ${fmt(intimacao)}; início da contagem no 1º dia útil seguinte: ${fmt(inicio)} (CPC 224).`)
    // Conta `diasEfetivos` dias úteis, com o início como dia 1
    let d = new Date(inicio)
    let restantes = diasEfetivos - 1
    while (restantes > 0) {
      d = addDays(d, 1)
      if (ehDiaUtil(d, feriados, true)) restantes--
    }
    passos.push(`${diasEfetivos} dias úteis (CPC 219), excluídos fins de semana, feriados nacionais e recesso 20/12–20/01 (CPC 220).`)
    avisos.push('[A VERIFICAR] Feriados forenses locais do tribunal (Carnaval, Corpus Christi, padroeiro da comarca, etc.) NÃO estão incluídos — confirme no calendário oficial; podem adiar a data fatal.')
    return { fatal: iso(d), inicio: iso(inicio), passos, avisos }
  }

  // Dias corridos (penal/eleitoral): exclui o dia da intimação, conta calendário
  let inicio = addDays(intimacao, 1)
  passos.push(`Intimação em ${fmt(intimacao)}; contagem em dias corridos a partir de ${fmt(inicio)} (exclui o dia do começo).`)
  let fatal = addDays(inicio, diasEfetivos - 1)
  passos.push(`${diasEfetivos} dias corridos.`)
  // Vencimento prorroga para o próximo dia útil se cair em dia sem expediente
  if (!ehDiaUtil(fatal, feriados, false)) {
    const orig = new Date(fatal)
    while (!ehDiaUtil(fatal, feriados, false)) fatal = addDays(fatal, 1)
    passos.push(`Vencimento em ${fmt(orig)} caía em dia sem expediente; prorrogado para ${fmt(fatal)}.`)
  }
  avisos.push('[A VERIFICAR] Feriados forenses locais e eventual suspensão de expediente não estão incluídos — confirme no tribunal.')
  return { fatal: iso(fatal), inicio: iso(inicio), passos, avisos }
}
