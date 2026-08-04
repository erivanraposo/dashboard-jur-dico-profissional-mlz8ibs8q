import { Link } from 'react-router-dom'
import { Check, ArrowRight, ShieldCheck, Gauge, Users, Zap } from 'lucide-react'
import PublicShell from '@/components/PublicShell'

// ---------------------------------------------------------------------------
// PLANOS — preços decididos em 04/08/2026 (lexaxis_decisao_precos_2026-08-04.md).
// O medidor é o CRÉDITO DE ANÁLISE (1 crédito = 1 ciclo completo), não "IA
// ilimitada": ler autos inteiros e conferir fontes oficiais custa computação
// real, e planos ilimitados só são possíveis para quem não faz esse trabalho.
// Monitoramento processual está FORA de propósito — é paridade de mercado, não
// nosso diferencial, e o vendor cobra piso fixo que não se dilui em baixo volume.
// ---------------------------------------------------------------------------

const PLANOS = [
  {
    nome: 'Essencial',
    para: 'advogado autônomo',
    preco: '297',
    icone: Users,
    destaque: false,
    itens: [
      '1 usuário',
      '10 créditos de análise por mês',
      'Todos os tipos de peça e todos os agentes',
      'Verificador de Precedentes',
      'Módulo de prazos com calculadora (CPC)',
      'Exportação DOCX e PDF com seu timbre',
    ],
  },
  {
    nome: 'Escritório',
    para: 'o mais escolhido',
    preco: '697',
    icone: Gauge,
    destaque: true,
    itens: [
      'Até 5 usuários, com papéis e aprovação de minutas',
      '30 créditos por mês, compartilhados pelo escritório',
      'Tudo do Essencial',
      'Gestão de equipe: estagiário → revisão → titular',
      'Painel de consumo por membro',
      'Verificador com limite ampliado',
    ],
  },
  {
    nome: 'Performance',
    para: 'contencioso intenso',
    preco: '1.297',
    icone: Zap,
    destaque: false,
    itens: [
      'Até 10 usuários',
      '60 créditos por mês',
      'Tudo do Escritório',
      'Indexação prioritária de autos volumosos',
      'Suporte prioritário',
      'Verificador com o limite mais alto',
    ],
  },
]

const EM_TODOS = [
  'Verificação em portais oficiais (jus.br, gov.br, leg.br, DOU, LexML)',
  'Relatório de proveniência e nota de conferência em cada documento',
  'Auditoria de aderência antes da entrega, com direito de descarte',
  '[A VERIFICAR] e [FONTE INSUFICIENTE] declarados — nunca certeza inventada',
  'Espaço de trabalho isolado: seus casos não treinam modelos',
  'Sem fidelidade; cancele quando quiser',
]

const FAQ = [
  {
    q: 'Posso trocar de plano?',
    a: 'A qualquer momento. Os créditos do mês corrente são preservados.',
  },
  {
    q: 'E se os créditos acabarem no meio do mês?',
    a: 'O painel avisa antes. Você adiciona um pacote de 10 créditos por R$ 179 ou aguarda a renovação — nenhum trabalho é perdido, e nada é cobrado sem que você peça.',
  },
  {
    q: 'O LexAxis acompanha meus processos nos tribunais?',
    a: 'Ainda não. Monitoramento processual automático não está incluído, e preferimos dizer isso a prometer o que não entregamos. Você cadastra os processos e usa o módulo de prazos, com cálculo determinístico pelo CPC.',
  },
  {
    q: 'Vocês treinam modelos com os meus casos?',
    a: 'Não. Cada escritório tem espaço de trabalho isolado, e o conteúdo dos casos não é usado para treinar modelo nenhum — nosso nem de terceiros.',
  },
]

export default function Planos() {
  return (
    <PublicShell>
      {/* Hero */}
      <section className="border-b border-[#1e3a5f]/10">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center md:py-24">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#b98d3e]">
            <span className="h-px w-6 bg-[#c9a35a]" /> Planos
          </span>
          <h1 className="mt-5 font-serif text-4xl font-bold leading-tight tracking-tight text-[#1e3a5f] md:text-5xl">
            Planos para quem assina o que protocola.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-[#475569]">
            Todos os planos incluem o núcleo completo: agentes especialistas, leitura dos autos,
            verificação em fontes oficiais, relatório de proveniência e auditoria de cada minuta.
            A diferença entre planos é volume e equipe — <strong>nunca a qualidade da verificação</strong>.
          </p>
        </div>
      </section>

      {/* Tabela */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {PLANOS.map((p) => {
            const Icone = p.icone
            return (
              <div
                key={p.nome}
                className={`relative flex flex-col rounded-xl border bg-white p-7 ${
                  p.destaque
                    ? 'border-[#c9a35a] shadow-lg shadow-[#c9a35a]/10'
                    : 'border-[#1e3a5f]/12'
                }`}
              >
                {p.destaque && (
                  <span className="absolute -top-3 left-7 rounded-full bg-[#c9a35a] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
                    o mais escolhido
                  </span>
                )}
                <Icone className="h-7 w-7 text-[#c9a35a]" />
                <h2 className="mt-4 font-serif text-2xl font-bold text-[#1e3a5f]">{p.nome}</h2>
                <p className="mt-1 text-sm text-[#475569]">{p.para}</p>
                <p className="mt-6">
                  <span className="text-sm text-[#475569]">R$ </span>
                  <span className="font-serif text-4xl font-bold text-[#1e3a5f]">{p.preco}</span>
                  <span className="text-sm text-[#475569]"> /mês</span>
                </p>
                <ul className="mt-7 flex-1 space-y-3">
                  {p.itens.map((i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-[#334155]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#c9a35a]" />
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/login"
                  className={`mt-8 inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition-colors ${
                    p.destaque
                      ? 'bg-[#1e3a5f] text-white hover:bg-[#16304e]'
                      : 'border border-[#1e3a5f]/25 text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white'
                  }`}
                >
                  Começar <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )
          })}
        </div>

        {/* Enterprise + add-on */}
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-[#1e3a5f]/12 bg-white p-6">
            <h3 className="font-serif text-lg font-bold text-[#1e3a5f]">
              Enterprise — departamentos jurídicos
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#475569]">
              Volume, assentos, integrações e SLA sob medida.{' '}
              <a href="mailto:contato@lexaxis.com.br" className="font-semibold text-[#1e3a5f] underline underline-offset-2">
                Falar com a gente
              </a>
              .
            </p>
          </div>
          <div className="rounded-xl border border-[#1e3a5f]/12 bg-white p-6">
            <h3 className="font-serif text-lg font-bold text-[#1e3a5f]">Mês puxado?</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#475569]">
              Pacote adicional de <strong>10 créditos por R$ 179</strong>, sem mudar de plano e sem
              cobrança automática — só quando você pedir.
            </p>
          </div>
        </div>
      </section>

      {/* O que é um crédito */}
      <section className="border-y border-[#1e3a5f]/10 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="font-serif text-2xl font-bold text-[#1e3a5f]">
            O que é um crédito de análise?
          </h2>
          <p className="mt-5 leading-relaxed text-[#334155]">
            Um crédito corresponde a um <strong>ciclo completo sobre um caso</strong>: os agentes leem
            os autos e os documentos anexados, produzem sugestões fundamentadas e verificadas, a minuta
            é reescrita com elas e passa pela auditoria final — com relatório de proveniência incluído.
          </p>
          <p className="mt-4 leading-relaxed text-[#334155]">
            Analisar de novo o mesmo caso, depois de juntar documentos novos, consome um novo crédito.
            Já a <strong>indexação dos autos é feita uma única vez</strong> e vale para todas as
            análises seguintes daquele processo.
          </p>
          <h3 className="mt-10 font-serif text-lg font-bold text-[#1e3a5f]">
            Por que créditos, e não “ilimitado”?
          </h3>
          <p className="mt-3 leading-relaxed text-[#334155]">
            Porque cada análise consome computação real de verificação: ler autos inteiros e conferir
            fontes oficiais custa mais do que gerar texto solto. Planos “ilimitados” de IA jurídica são
            possíveis justamente quando a ferramenta <em>não</em> faz esse trabalho. O medidor fica no
            seu painel, análise por análise.
          </p>
        </div>
      </section>

      {/* Verificador */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-xl border border-[#c9a35a]/40 bg-[#c9a35a]/5 p-8">
          <ShieldCheck className="h-8 w-8 text-[#b98d3e]" />
          <h2 className="mt-4 font-serif text-2xl font-bold text-[#1e3a5f]">
            O Verificador de Precedentes vem em todos os planos
          </h2>
          <p className="mt-4 leading-relaxed text-[#334155]">
            Cole uma citação de qualquer origem — da peça da parte contrária, da minuta do estagiário,
            da saída de outra IA, ou da sua própria peça antes do protocolo — e o sistema confere em
            portais oficiais se ela existe e se diz o que se afirma.
          </p>
          <p className="mt-4 leading-relaxed text-[#334155]">
            O resultado nunca é um “verificado” binário: ele diz <strong>o que foi conferido e o que
            não foi</strong>, e aponta o dado divergente quando há. Súmulas, temas e julgados que já
            estão em nossas bases oficiais são conferidos <strong>sem consumir crédito</strong>.
          </p>
          <Link
            to="/como-verificamos"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#1e3a5f] underline underline-offset-4"
          >
            Como verificamos as fontes <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Em todos os planos */}
      <section className="border-t border-[#1e3a5f]/10 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-center font-serif text-2xl font-bold text-[#1e3a5f]">
            Em todos os planos
          </h2>
          <div className="mt-10 grid gap-x-10 gap-y-5 md:grid-cols-2">
            {EM_TODOS.map((t) => (
              <div key={t} className="flex gap-3 text-sm leading-relaxed text-[#334155]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#c9a35a]" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="font-serif text-2xl font-bold text-[#1e3a5f]">Perguntas frequentes</h2>
        <dl className="mt-8 space-y-7">
          {FAQ.map((f) => (
            <div key={f.q}>
              <dt className="font-semibold text-[#1e3a5f]">{f.q}</dt>
              <dd className="mt-2 leading-relaxed text-[#475569]">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </PublicShell>
  )
}
