import { Link } from 'react-router-dom'
import { Link2, Search, AlertTriangle, ClipboardCheck, ShieldCheck, ArrowRight } from 'lucide-react'
import PublicShell from '@/components/PublicShell'

const ETAPAS = [
  {
    icon: Link2,
    title: 'Toda citação vira um link para a fonte oficial',
    body: 'Cada lei, súmula ou acórdão citado recebe um hyperlink para o repositório oficial (STF, STJ, Planalto, LexML, Diário Oficial). Quando a base primária está instável — o SCON do STJ, por exemplo, cai com frequência —, oferecemos um segundo link estável para a mesma referência.',
  },
  {
    icon: Search,
    title: 'Os agentes conferem na fonte durante a análise',
    body: 'Os agentes de pesquisa consultam bases oficiais no momento da análise, com a busca restrita a domínios .jus.br e .gov.br. A referência não vem só da memória do modelo: ela é cotejada com a fonte pública.',
  },
  {
    icon: AlertTriangle,
    title: 'O que não se confirma vira [A VERIFICAR]',
    body: 'Quando o sistema não consegue confirmar uma referência na fonte — vigência de uma súmula, número de um acórdão, página de doutrina —, ele não afirma. Marca explicitamente como [A VERIFICAR], indicando o que conferir e onde. A não-invenção é regra do sistema, não uma promessa de marketing.',
  },
  {
    icon: ClipboardCheck,
    title: 'Cada minuta sai com uma nota de conferência',
    body: 'Ao final, o documento traz um resumo automático das fontes citadas — legislação, jurisprudência, dispositivos e doutrina — e do que ainda resta conferir. Uma checklist pronta para a revisão do advogado, editável e incorporada ao documento exportado.',
  },
  {
    icon: ShieldCheck,
    title: 'Um validador independente confere a entrega',
    body: 'Antes de liberar o documento, um segundo modelo verifica se a peça responde à consulta, se é do caso certo e do gênero certo (um parecer não pode sair no formato de um recurso). Se algo não bate, o sistema avisa em vez de entregar em silêncio.',
  },
]

const LIMITES = [
  {
    q: 'A IA não substitui o advogado.',
    a: 'O LexAxis produz insumo — análise, sugestão, minuta. A conferência final, a decisão estratégica e a assinatura são, e continuam sendo, do advogado.',
  },
  {
    q: 'Cálculo não sai por adivinhação do modelo.',
    a: 'Valores, prazos e atualizações seguem regras e fórmulas explícitas; o modelo de linguagem nunca é usado como calculadora. Números sem base confirmada são sinalizados.',
  },
  {
    q: 'Documento ilegível é sinalizado, não presumido.',
    a: 'Se um PDF escaneado está ilegível ou truncado, o sistema declara a ilegibilidade e recomenda OCR — em vez de "supor" o conteúdo e seguir em frente.',
  },
  {
    q: 'Doutrina pede conferência de edição e página.',
    a: 'Citações doutrinárias vêm do conhecimento do modelo e são úteis para localizar o argumento; edição e página exatas saem como [A VERIFICAR] quando não puderem ser confirmadas. Anexar a obra ao caso permite a citação com página correta.',
  },
]

export default function ComoVerificamos() {
  return (
    <PublicShell>
      {/* Hero */}
      <section className="border-b border-[#1e3a5f]/10">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center md:py-24">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#b98d3e]">
            <span className="h-px w-6 bg-[#c9a35a]" /> Confiança
          </span>
          <h1 className="mt-6 font-serif text-4xl font-bold leading-[1.1] tracking-tight text-[#1e3a5f] md:text-5xl">
            Como verificamos as fontes
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#475569]">
            Uma IA jurídica só é útil se o advogado puder confiar no que ela afirma. Por isso não
            pedimos confiança cega: mostramos a origem de cada citação e deixamos visível o que ainda
            precisa de conferência. Este é o método.
          </p>
        </div>
      </section>

      {/* Etapas */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <ol className="space-y-12">
            {ETAPAS.map((e, i) => (
              <li key={e.title} className="flex gap-5">
                <div className="flex flex-col items-center">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#1e3a5f]/[0.07]">
                    <e.icon className="h-5 w-5 text-[#1e3a5f]" />
                  </div>
                  {i < ETAPAS.length - 1 && <span className="mt-2 w-px flex-1 bg-[#1e3a5f]/10" />}
                </div>
                <div className="pb-2">
                  <h2 className="font-serif text-xl font-bold text-[#1e3a5f]">{e.title}</h2>
                  <p className="mt-2 leading-relaxed text-[#475569]">{e.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Limites (honestidade) */}
      <section className="bg-[#faf8f3]">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#b98d3e]">
              <span className="h-px w-6 bg-[#c9a35a]" /> Os limites, com franqueza
            </span>
            <h2 className="mt-6 font-serif text-3xl font-bold leading-tight text-[#1e3a5f]">
              Onde o julgamento do advogado continua insubstituível.
            </h2>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {LIMITES.map((l) => (
              <div key={l.q} className="rounded-xl border border-[#1e3a5f]/10 bg-white p-6">
                <h3 className="font-serif text-lg font-bold text-[#1e3a5f]">{l.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#475569]">{l.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1e3a5f]">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="font-serif text-2xl font-bold leading-tight text-white md:text-3xl">
            Transparência não é um recurso. É o método.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/ajuda"
              className="inline-flex items-center gap-2 rounded-md bg-[#c9a35a] px-6 py-3 text-sm font-semibold text-[#1e3a5f] transition-all hover:bg-[#d6b571]"
            >
              Ver a central de ajuda <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-md border border-white/25 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Voltar ao início
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
