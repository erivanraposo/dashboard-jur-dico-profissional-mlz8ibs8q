import { Link } from 'react-router-dom'
import { Globe, ArrowRight } from 'lucide-react'
import PublicShell from '@/components/PublicShell'

const PASSOS = [
  { n: '1', t: 'Abra uma minuta e escolha o tipo', d: 'Petição inicial, contestação, parecer, recurso, relatório de caso, parecer tributário, resposta à acusação, habeas corpus e outros. O tipo define o template e quais agentes ficam disponíveis.' },
  { n: '2', t: 'Anexe os autos e documentos', d: 'PDFs (inclusive escaneados e com centenas de páginas), DOCX, planilhas. Processos muito grandes são divididos e ingeridos automaticamente.' },
  { n: '3', t: 'Selecione os agentes e escreva instruções', d: 'Escolha os revisores por área pertinentes ao caso. O campo de instruções permite orientar o foco da análise (o que priorizar, o que ignorar).' },
  { n: '4', t: 'Analise', d: 'Os agentes leem a peça e os anexos, conferem as fontes e devolvem sugestões acionáveis em forma de bullets — cada uma com diagnóstico e recomendação.' },
  { n: '5', t: 'Revise e aplique as sugestões', d: 'Você lê cada sugestão e aplica as que fizerem sentido. O sistema reescreve o documento incorporando as contribuições aprovadas.' },
  { n: '6', t: 'Confira a nota de fontes e exporte', d: 'Revise a nota de conferência de fontes ao final do documento e exporte em DOCX ou PDF com o timbre do seu escritório.' },
]

const FAQ = [
  { q: 'A IA pode inventar jurisprudência?', a: 'Ela não afirma o que não consegue confirmar. Referências não verificadas na fonte oficial são marcadas como [A VERIFICAR], nunca apresentadas como fato. Veja a página "Como verificamos as fontes".' },
  { q: 'Consigo analisar um processo inteiro?', a: 'Sim. Autos com centenas de páginas são divididos e ingeridos por partes (digests), sem teto prático de tamanho e a um custo baixo por análise.' },
  { q: 'PDF escaneado funciona?', a: 'Sim — o sistema lê as imagens das páginas. Se um documento estiver ilegível ou de baixa qualidade, ele sinaliza a ilegibilidade e recomenda OCR, em vez de supor o conteúdo.' },
  { q: 'O documento sai com a marca do LexAxis?', a: 'Não. A exportação usa o logo, o cabeçalho e o rodapé do SEU escritório, configurados em Configurações → Identidade Visual. O que você entrega ao cliente leva a sua marca, não a nossa.' },
  { q: 'Meus dados estão seguros?', a: 'Cada escritório opera isolado, com controle de acesso por perfil e em conformidade com a LGPD. Documentos de um caso não contaminam outro.' },
  { q: 'O LexAxis substitui o advogado?', a: 'Não. Ele entrega insumo de alta qualidade — análise, sugestão, minuta. A conferência final, a estratégia e a assinatura são do advogado.' },
]

export default function Ajuda() {
  return (
    <PublicShell>
      {/* Hero */}
      <section className="border-b border-[#1e3a5f]/10">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center md:py-24">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#b98d3e]">
            <span className="h-px w-6 bg-[#c9a35a]" /> Central de ajuda
          </span>
          <h1 className="mt-6 font-serif text-4xl font-bold leading-[1.1] tracking-tight text-[#1e3a5f] md:text-5xl">
            Como usar o LexAxis
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#475569]">
            Um guia direto — do primeiro acesso à minuta exportada — e as respostas às dúvidas mais
            comuns de quem está começando.
          </p>
        </div>
      </section>

      {/* Requisitos */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-6 pt-16">
          <div className="flex items-start gap-4 rounded-xl border border-[#1e3a5f]/10 bg-[#faf8f3] p-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#1e3a5f]/[0.07]">
              <Globe className="h-5 w-5 text-[#1e3a5f]" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#1e3a5f]">O que você precisa</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#475569]">
                Apenas um navegador moderno e conexão com a internet. Nada de instalação,
                certificado digital ou configuração. O LexAxis é 100% web — funciona no seu
                computador do escritório e no de casa, do mesmo jeito.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Passos */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="font-serif text-2xl font-bold text-[#1e3a5f]">Passo a passo</h2>
          <ol className="mt-8 space-y-6">
            {PASSOS.map((p) => (
              <li key={p.n} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1e3a5f] font-serif text-sm font-bold text-white">
                  {p.n}
                </span>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#1e3a5f]">{p.t}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[#475569]">{p.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[#faf8f3]">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="font-serif text-2xl font-bold text-[#1e3a5f]">Perguntas frequentes</h2>
          <div className="mt-8 divide-y divide-[#1e3a5f]/10 border-y border-[#1e3a5f]/10">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-serif text-lg font-semibold text-[#1e3a5f] [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="text-[#c9a35a] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[#475569]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA suporte */}
      <section className="bg-[#1e3a5f]">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="font-serif text-2xl font-bold leading-tight text-white md:text-3xl">
            Ainda com dúvidas?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/70">
            Fale com a gente — respondemos em linguagem de advogado, não em jargão técnico.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a
              href="mailto:contato@lexaxis.com.br?subject=Ajuda%20LexAxis"
              className="inline-flex items-center gap-2 rounded-md bg-[#c9a35a] px-6 py-3 text-sm font-semibold text-[#1e3a5f] transition-all hover:bg-[#d6b571]"
            >
              Falar com o suporte <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              to="/como-verificamos"
              className="inline-flex items-center gap-2 rounded-md border border-white/25 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Como verificamos as fontes
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
