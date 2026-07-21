import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  Link2,
  AlertTriangle,
  FileSearch,
  Layers,
  FileText,
  Stamp,
  ArrowRight,
  Lock,
} from 'lucide-react'

/**
 * Landing pública do LexAxis.
 * Tese central: IA jurídica auditável — cada citação com fonte verificável.
 * Ordem: hero (escopo + diferencial) → capacidades num relance → como funciona
 *        → problema → proveniência (aprofundamento) → recursos → confiança → CTA.
 * Paleta de marca: navy #1e3a5f, dourado #c9a35a, grafite #475569.
 * Título em Merriweather (font-serif), corpo em Inter (font-sans).
 */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#b98d3e]">
      <span className="h-px w-6 bg-[#c9a35a]" />
      {children}
    </span>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#faf8f3] font-sans text-[#1a2230] antialiased">
      {/* ===== NAV ===== */}
      <header className="sticky top-0 z-30 border-b border-[#1e3a5f]/10 bg-[#faf8f3]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="#topo" className="flex items-center gap-2.5">
            <img src="/brand/logo-symbol-128.png" alt="" className="h-8 w-8 object-contain" />
            <span className="font-serif text-xl font-bold tracking-tight text-[#1e3a5f]">LexAxis</span>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-medium text-[#475569] md:flex">
            <a href="#como" className="transition-colors hover:text-[#1e3a5f]">Como funciona</a>
            <a href="#proveniencia" className="transition-colors hover:text-[#1e3a5f]">Proveniência</a>
            <a href="#recursos" className="transition-colors hover:text-[#1e3a5f]">Recursos</a>
            <a href="#confianca" className="transition-colors hover:text-[#1e3a5f]">Confiança</a>
          </nav>
          <Link
            to="/login"
            className="rounded-md border border-[#1e3a5f]/25 px-4 py-2 text-sm font-semibold text-[#1e3a5f] transition-colors hover:bg-[#1e3a5f] hover:text-white"
          >
            Entrar
          </Link>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section id="topo" className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <Eyebrow>IA jurídica auditável</Eyebrow>
            <h1 className="mt-6 font-serif text-5xl font-bold leading-[1.04] tracking-tight text-[#1e3a5f] md:text-6xl">
              Dos autos à minuta.
            </h1>
            <p className="mt-5 font-serif text-xl font-normal leading-snug text-[#1a2230] [text-wrap:balance] md:text-[1.7rem]">
              Com a fonte de cada citação{' '}
              <span className="relative whitespace-nowrap font-semibold text-[#1e3a5f]">
                conferida
                <span className="absolute -bottom-1 left-0 h-[3px] w-full bg-[#c9a35a]" />
              </span>
              .
            </p>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#475569]">
              Analisa processos inteiros, redige minutas e confere cada precedente contra a fonte
              oficial. O que não se confirma é marcado — nunca inventado. O eixo da sua gestão
              jurídica.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a
                href="#como"
                className="inline-flex items-center gap-2 rounded-md bg-[#1e3a5f] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#182f4c] hover:shadow-md"
              >
                Veja como funciona <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-md px-4 py-3 text-sm font-semibold text-[#1e3a5f] transition-colors hover:text-[#182f4c]"
              >
                Já sou cliente
              </Link>
            </div>
          </div>

          {/* Card de proveniência — o visual do hero é o próprio diferencial */}
          <div className="relative">
            <div className="absolute -right-6 -top-6 hidden h-24 w-24 rounded-full bg-[#c9a35a]/15 blur-2xl md:block" />
            <div className="relative rounded-xl border border-[#1e3a5f]/10 bg-white p-6 shadow-[0_20px_60px_-20px_rgba(30,58,95,0.35)]">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                  Sugestão do agente
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" /> Fonte conferida
                </span>
              </div>
              <p className="text-sm leading-relaxed text-[#1a2230]">
                A tese encontra amparo no entendimento firmado pelo STJ em{' '}
                <span className="rounded bg-[#1e3a5f]/[0.06] px-1 font-medium text-[#1e3a5f] underline decoration-[#c9a35a] decoration-2 underline-offset-2">
                  REsp 1.574.350/SC
                </span>
                , que dispensa prova do dano quando configurada a hipótese em análise.
              </p>
              <div className="mt-4 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-[#475569]">
                <Link2 className="h-3.5 w-3.5 shrink-0 text-[#1e3a5f]" />
                <span className="truncate">scon.stj.jus.br · verificado na fonte oficial</span>
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>[A VERIFICAR]</strong> vigência da Súmula citada pela parte contrária —
                  não confirmada na base oficial.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CAPACIDADES (num relance) ===== */}
      <section className="border-y border-[#1e3a5f]/10 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-7">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {[
              { icon: FileSearch, label: 'Análise de autos' },
              { icon: FileText, label: 'Geração de minutas' },
              { icon: ShieldCheck, label: 'Conferência de fontes' },
              { icon: Stamp, label: 'Exportação com timbre' },
            ].map((c) => (
              <li key={c.label} className="flex items-center gap-2.5 text-sm font-semibold text-[#1e3a5f]">
                <c.icon className="h-5 w-5 shrink-0 text-[#c9a35a]" />
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ===== COMO FUNCIONA ===== */}
      <section id="como" className="bg-[#faf8f3]">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-2xl">
            <Eyebrow>Como funciona</Eyebrow>
            <h2 className="mt-6 font-serif text-3xl font-bold leading-tight text-[#1e3a5f] md:text-4xl">
              Dos autos à minuta, com as fontes conferidas.
            </h2>
          </div>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {[
              {
                n: '01',
                title: 'Anexe os autos',
                body: 'PDFs de processos inteiros — inclusive centenas de páginas e documentos escaneados. O sistema divide e ingere o que não caberia num único contexto.',
              },
              {
                n: '02',
                title: 'Os agentes analisam',
                body: 'Agentes especializados por área leem a peça e os anexos, cruzam com a fonte oficial e devolvem sugestões acionáveis — sem inventar precedente.',
              },
              {
                n: '03',
                title: 'Minuta pronta e conferível',
                body: 'Você aplica as sugestões, revisa a nota de conferência de fontes e exporta em DOCX ou PDF com o timbre do seu escritório.',
              },
            ].map((s) => (
              <div key={s.n} className="relative">
                <span className="font-serif text-5xl font-bold text-[#c9a35a]/50">{s.n}</span>
                <h3 className="mt-3 font-serif text-xl font-bold text-[#1e3a5f]">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#475569]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PROBLEMA ===== */}
      <section className="border-y border-[#1e3a5f]/10 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <p className="font-serif text-2xl font-normal leading-snug text-[#1a2230] md:text-[1.75rem]">
            Uma IA que <span className="text-[#b98d3e]">inventa jurisprudência</span> não é assistente
            — é passivo. Um acórdão citado errado numa peça é risco real para o advogado e para o
            cliente.
          </p>
        </div>
      </section>

      {/* ===== PROVENIÊNCIA (seção escura — o diferencial) ===== */}
      <section id="proveniencia" className="bg-[#1e3a5f] text-white">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c9a35a]">
              <span className="h-px w-6 bg-[#c9a35a]" /> O diferencial
            </span>
            <h2 className="mt-6 font-serif text-3xl font-bold leading-tight md:text-4xl">
              Cada citação, uma fonte que você pode abrir.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-white/70">
              O LexAxis não pede confiança cega. Toda referência a lei, súmula ou acórdão vem com o
              link para a base oficial. O que o modelo não consegue confirmar não vira afirmação —
              vira uma marcação explícita para o advogado decidir.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: Link2,
                title: 'Citação com fonte',
                body: 'Lei, súmula e acórdão com hyperlink para o repositório oficial (.jus.br / .gov.br) — inclusive fallback quando a fonte primária está fora do ar.',
              },
              {
                icon: AlertTriangle,
                title: 'O incerto fica visível',
                body: 'O que não se confirma na fonte é renderizado como [A VERIFICAR], nunca como fato. A disciplina de não-invenção é regra do sistema, não promessa.',
              },
              {
                icon: ShieldCheck,
                title: 'Nota de conferência',
                body: 'Cada minuta sai com um resumo automático das fontes citadas — legislação, jurisprudência e o que resta a conferir — editável pelo advogado.',
              },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-6 transition-colors hover:bg-white/[0.07]"
              >
                <c.icon className="h-6 w-6 text-[#c9a35a]" />
                <h3 className="mt-4 font-serif text-lg font-bold">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== RECURSOS ===== */}
      <section id="recursos" className="border-t border-[#1e3a5f]/10 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-2xl">
            <Eyebrow>Recursos</Eyebrow>
            <h2 className="mt-6 font-serif text-3xl font-bold leading-tight text-[#1e3a5f] md:text-4xl">
              Feito para o trabalho real do escritório.
            </h2>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {[
              {
                icon: FileSearch,
                title: 'Análise de processos longos',
                body: 'Ingestão de autos com centenas de páginas via digests — o custo de ler um processo inteiro cai a centavos, sem teto de tamanho.',
              },
              {
                icon: Layers,
                title: 'Agentes por área',
                body: 'Revisores especializados — cível, criminal, tributário, contratos, jurisprudência, doutrina, cálculo — cada um com seu mandato e critérios.',
              },
              {
                icon: FileText,
                title: 'Gerador de minutas',
                body: 'De petição inicial a parecer e recurso: o sistema analisa, sugere por bullets e reescreve o documento aplicando as contribuições.',
              },
              {
                icon: Stamp,
                title: 'Exportação com timbre',
                body: 'DOCX e PDF saem com o logo, o cabeçalho e o rodapé do seu escritório — prontos para o cliente, sem marca da plataforma.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="flex gap-4 rounded-xl border border-slate-100 bg-[#faf8f3] p-6 transition-shadow hover:shadow-[0_12px_40px_-16px_rgba(30,58,95,0.28)]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#1e3a5f]/[0.07]">
                  <f.icon className="h-5 w-5 text-[#1e3a5f]" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#1e3a5f]">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#475569]">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== ROTINA (table stakes, discreto) ===== */}
      <section className="border-t border-[#1e3a5f]/10 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-10 text-center">
          <p className="text-sm leading-relaxed text-[#475569]">
            <span className="font-semibold text-[#1e3a5f]">E o essencial da rotina, sem alarde:</span>{' '}
            organização de processos por cliente e área, documentos e minutas vinculados a cada caso,
            e status de acompanhamento — inclusive a marcação de prazo fatal.
          </p>
        </div>
      </section>

      {/* ===== CONFIANÇA ===== */}
      <section id="confianca" className="bg-[#faf8f3]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 md:grid-cols-2">
          <div>
            <Eyebrow>Confiança</Eyebrow>
            <h2 className="mt-6 font-serif text-3xl font-bold leading-tight text-[#1e3a5f] md:text-4xl">
              Transparência não é um recurso. É o método.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[#475569]">
              Publicamos como o sistema confere cada fonte, o que ele faz quando não consegue
              confirmar, e onde o julgamento do advogado continua insubstituível. Nenhum cálculo
              jurídico é entregue por adivinhação do modelo.
            </p>
            <Link
              to="/como-verificamos"
              className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#1e3a5f] underline decoration-[#c9a35a] decoration-2 underline-offset-4 transition-colors hover:text-[#182f4c]"
            >
              Como verificamos as fontes <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="rounded-xl border border-[#1e3a5f]/10 bg-white p-8 shadow-sm">
            <div className="flex items-start gap-4">
              <Lock className="mt-1 h-6 w-6 shrink-0 text-[#1e3a5f]" />
              <div>
                <h3 className="font-serif text-lg font-bold text-[#1e3a5f]">Dados e sigilo</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#475569]">
                  Isolamento por escritório, controle de acesso por perfil e conformidade com a LGPD.
                  Cada documento que você entrega ao cliente sai com a identidade do seu escritório —
                  não com a nossa.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA EARLY ACCESS ===== */}
      <section className="bg-[#1e3a5f]">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="font-serif text-3xl font-bold leading-tight text-white md:text-[2.5rem]">
            Acesso antecipado ao LexAxis
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/70">
            Estamos abrindo o sistema para um grupo inicial de escritórios. Fale com a gente para
            conhecer a plataforma e participar da fase de acesso antecipado.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-4">
            <a
              href="mailto:contato@lexaxis.com.br?subject=Acesso%20antecipado%20ao%20LexAxis"
              className="inline-flex items-center gap-2 rounded-md bg-[#c9a35a] px-7 py-3.5 text-sm font-semibold text-[#1e3a5f] shadow-sm transition-all hover:bg-[#d6b571] hover:shadow-md"
            >
              Quero acesso antecipado <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-md border border-white/25 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Entrar
            </Link>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-[#1e3a5f]/10 bg-[#faf8f3]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 md:flex-row">
          <div className="flex items-center gap-2.5">
            <img src="/brand/logo-symbol-128.png" alt="" className="h-7 w-7 object-contain" />
            <div>
              <p className="font-serif text-base font-bold text-[#1e3a5f]">LexAxis</p>
              <p className="text-xs text-[#475569]">O eixo da sua gestão jurídica.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-[#475569]">
            <Link to="/como-verificamos" className="transition-colors hover:text-[#1e3a5f]">Como verificamos</Link>
            <Link to="/ajuda" className="transition-colors hover:text-[#1e3a5f]">Ajuda</Link>
            <a href="#recursos" className="transition-colors hover:text-[#1e3a5f]">Recursos</a>
            <Link to="/login" className="transition-colors hover:text-[#1e3a5f]">Entrar</Link>
          </div>
          <p className="text-xs text-[#475569]">© {new Date().getFullYear()} LexAxis</p>
        </div>
      </footer>
    </div>
  )
}
