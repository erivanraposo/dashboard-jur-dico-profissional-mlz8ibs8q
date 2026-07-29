import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Globe, ArrowRight, ShieldCheck, FileText, Clock, Users, Download, Bot } from 'lucide-react'
import PublicShell from '@/components/PublicShell'

const TOC = [
  { id: 'o-que-e', label: 'O que é o LexAxis' },
  { id: 'primeiro-acesso', label: 'Primeiro acesso' },
  { id: 'processos', label: 'Cadastrar processos' },
  { id: 'minutas', label: 'Gerar uma minuta' },
  { id: 'analisar', label: 'Como a análise funciona' },
  { id: 'agentes', label: 'Os agentes' },
  { id: 'prazos', label: 'Prazos' },
  { id: 'config', label: 'Configurações' },
  { id: 'exportar', label: 'Exportação' },
  { id: 'confianca', label: 'Confiança e limites' },
  { id: 'faq', label: 'Perguntas frequentes' },
]

const PASSOS = [
  { n: '1', t: 'Abra uma minuta e escolha o tipo', d: 'Relatório de Caso, Petição Inicial, Contestação, Parecer, Recurso e outros. O tipo define o modelo e quais agentes ficam disponíveis.' },
  { n: '2', t: 'Anexe os autos e documentos', d: 'PDFs (inclusive escaneados), DOCX, planilhas. Comece com poucos documentos por vez — muitos arquivos pesados de uma vez podem exceder o tempo de processamento.' },
  { n: '3', t: 'Selecione os agentes e escreva instruções', d: 'Escolha os revisores pertinentes ao caso. O campo "Instruções para a análise" permite orientar o foco.' },
  { n: '4', t: 'Analise', d: 'Os agentes leem a peça e os anexos, conferem as fontes e devolvem sugestões em forma de bullets.' },
  { n: '5', t: 'Revise e aplique', d: 'Você lê cada sugestão e clica em "Reescrever e Aplicar". O sistema incorpora as contribuições ao documento.' },
  { n: '6', t: 'Confira a nota de fontes e exporte', d: 'Revise a nota de conferência de fontes ao final e exporte em DOCX ou PDF com o timbre do escritório.' },
]

const AGENTES = [
  {
    cat: 'Pesquisa',
    intro: 'Trazem e conferem o material jurídico externo — jurisprudência, doutrina e legislação.',
    itens: [
      ['Analista de Jurisprudência', 'Alinha as teses da peça com precedentes qualificados e confirma as citações centrais em portais oficiais durante a análise: precedente confirmado vem com a URL do tribunal ao lado; não confirmado sai marcado [A VERIFICAR].'],
      ['pesquisa-stj-stf', 'Teses e precedentes dos tribunais superiores — temas repetitivos, repercussão geral e súmulas do STJ e do STF —, com verificação na fonte oficial e indicação do status da tese.'],
      ['doutrina', 'Fundamentação doutrinária (ABNT), majoritária × minoritária.'],
      ['Análise de Legislação', 'Analisa uma norma: vigência, alterações, conflitos, regulamentação.'],
    ],
  },
  {
    cat: 'Contencioso',
    intro: 'Técnica processual das peças e do andamento do caso.',
    itens: [
      ['Peticionador Cível', 'Especialista pré-selecionado nos tipos Petição Inicial, Réplica, Alegações Finais, Apelação e Agravo. Na petição inicial, domina os três ritos (comum, juizado especial cível e juizado especial federal) — indique o rito no campo de instruções; confere cabimento, teto, matérias vedadas e forma, e alerta [CABIMENTO] quando o caso não couber no rito.'],
      ['Contestação Cível', 'Especialista pré-selecionado do tipo Contestação: preliminares (CPC art. 337), impugnação específica dos fatos, ônus da prova e construção das teses de defesa.'],
      ['Contrarrazões', 'Especialista pré-selecionado do tipo Contrarrazões. Resposta a recurso (apelação, agravo, REsp/RE, RO/RR, apelação criminal, RESE, agravo em execução): admissibilidade e preliminares de não conhecimento, refutação pontual do mérito e defesa da decisão recorrida. Indique o recurso no campo de instruções.'],
      ['Análise de Sentença', 'Analisa sentença/acórdão: fundamentos, vícios e cabimento recursal.'],
      ['ms-tributario', 'Mandado de segurança tributário: cabimento, prazo, autoridade, liminar.'],
      ['embargos-execucao-fiscal', 'Embargos à execução fiscal: garantia, prazo, CDA, prescrição.'],
      ['defesa-fiscal-carf', 'Especialista pré-selecionado do tipo Defesa Fiscal (CARF). Contencioso administrativo fiscal (Decreto 70.235/72, RICARF): impugnação, manifestação de inconformidade, recurso voluntário, contrarrazões, recurso especial à CSRF e embargos — indique a peça no campo de instruções. Confere prazos e admissibilidade, súmulas CARF (inclusive as obrigatórias), precedentes de reprodução obrigatória (RICARF art. 62), nulidades do lançamento e os requisitos do pedido de perícia (quesitos + perito, sob pena de preclusão).'],
      ['Preparação de Audiências', 'Roteiro oral, perguntas e checklist para a audiência.'],
    ],
  },
  {
    cat: 'Criminal',
    intro: 'Defesa e garantias penais.',
    itens: [
      ['Revisor Penal', 'Revisão de mérito penal em qualquer peça: tipicidade, garantias processuais, nulidades e coerência da tese defensiva.'],
      ['resposta-acusacao', 'Especialista pré-selecionado do tipo Resposta à Acusação: tempestividade (CPP art. 396), preliminares (inépcia da denúncia, falta de justa causa), hipóteses de absolvição sumária (art. 397), estratégia do que sustentar já ou reservar à instrução, e rol de testemunhas — que preclui se não vier na resposta.'],
      ['habeas-corpus', 'Especialista pré-selecionado do tipo Habeas Corpus: cabimento e adequação da via, autoridade coatora e competência (evita supressão de instância), hipóteses de constrangimento ilegal (CPP art. 648), prova pré-constituída — aponta afirmação sem documento no rol — e fundamentação da liminar.'],
    ],
  },
  {
    cat: 'Consultivo',
    intro: 'Pareceres, contratos e compliance.',
    itens: [
      ['parecer-juridico', 'Especialista pré-selecionado dos tipos Parecer Jurídico e Parecer Tributário: estrutura consultiva completa (ementa, premissas fáticas, análise por temas, riscos e limites, conclusão), distinguindo interpretação majoritária, minoritária e hipótese própria — sem promessa de resultado.'],
      ['Revisão de Contratos', 'Risco por cláusula (CRÍTICO/ATENÇÃO/ADEQUADA) + score 0-100.'],
      ['comparacao-contratos', 'Compara versões de um contrato e classifica o impacto das mudanças.'],
      ['due-diligence', 'Red flags e contingências de due diligence em 8 frentes.'],
      ['Compliance LGPD (Escritório)', 'Adequação à LGPD para escritórios (sigilo OAB, dados sensíveis).'],
      ['Notificação Extrajudicial', 'Redige minuta de notificação extrajudicial pronta para envio.'],
    ],
  },
  {
    cat: 'Revisão',
    intro: 'Melhoram e desafiam o que já foi escrito.',
    itens: [
      ['Revisor Sênior', 'Revisão avançada: lógica, terminologia, forma e estilo.'],
      ['red-team-juridico', 'O "advogado do diabo": critica premissas e antecipa o adversário.'],
    ],
  },
  {
    cat: 'Transversais e outros',
    intro: 'Apoio a qualquer tipo de trabalho.',
    itens: [
      ['resumo-processo', 'Especialista pré-selecionado do tipo Relatório de Caso: sintetiza andamentos, despachos e o estado atual do processo em visão executiva.'],
      ['Gestão de Prazos Processuais', 'Mapeia e calcula prazos (dias úteis, recesso, prazo em dobro).'],
      ['calculo', 'Estimativas e conferência de cálculos (atualização, juros, verbas).'],
      ['Analista de Documentos Estrangeiros', 'Contratos e normas em inglês adaptados ao direito brasileiro.'],
    ],
  },
]

const FAQ = [
  { q: 'A IA pode inventar jurisprudência?', a: 'Ela não afirma o que não consegue confirmar. Referências não verificadas na fonte oficial são marcadas como [A VERIFICAR], nunca apresentadas como fato.' },
  { q: 'Consigo analisar um processo inteiro?', a: 'Sim. Comece com poucos documentos por vez; para processos muito extensos, a ingestão por partes está em evolução. Se a análise não retornar resultado, reduza o número de anexos.' },
  { q: 'PDF escaneado funciona?', a: 'Sim — o sistema lê as imagens das páginas. Se um documento estiver ilegível, ele sinaliza e recomenda OCR, em vez de supor o conteúdo.' },
  { q: 'O documento sai com a marca do LexAxis?', a: 'Não. A exportação usa o logo, o cabeçalho e o rodapé do SEU escritório (Configurações → Identidade Visual).' },
  { q: 'Por que meu documento foi "reprovado"?', a: 'Um validador confere se o resultado corresponde ao caso e ao gênero pedido. Se você misturar documentos que não pertencem ao processo, ou deixar os metadados vazios, ele avisa — é proteção contra alucinação, não um erro. Use documentos do próprio caso e preencha cliente/comarca/objeto.' },
  { q: 'Meus dados estão seguros?', a: 'Cada escritório opera isolado, com controle de acesso por perfil e em conformidade com a LGPD. Documentos de um caso não contaminam outro.' },
  { q: 'O LexAxis substitui o advogado?', a: 'Não. Ele entrega insumo — análise, sugestão, minuta. A conferência final, a estratégia e a assinatura são do advogado.' },
]

function Sec({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-serif text-2xl font-bold text-[#1e3a5f]">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-[#475569]">{children}</div>
    </section>
  )
}

export default function Ajuda() {
  // Em SPA, o navegador tenta rolar até a âncora antes de o React renderizar a seção.
  // Rolamos manualmente após o render (e a cada mudança de hash).
  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.replace('#', '')
      if (!id) return
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    const t = setTimeout(scrollToHash, 60)
    window.addEventListener('hashchange', scrollToHash)
    return () => {
      clearTimeout(t)
      window.removeEventListener('hashchange', scrollToHash)
    }
  }, [])

  return (
    <PublicShell>
      {/* Hero */}
      <section className="border-b border-[#1e3a5f]/10">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center md:py-20">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#b98d3e]">
            <span className="h-px w-6 bg-[#c9a35a]" /> Central de ajuda
          </span>
          <h1 className="mt-6 font-serif text-4xl font-bold leading-[1.1] tracking-tight text-[#1e3a5f] md:text-5xl">
            Manual do LexAxis
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[#475569]">
            Do primeiro acesso à minuta exportada — como usar cada parte do sistema, o que faz cada
            agente, e o que esperar (e o que não esperar) da IA.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-6 py-14">
        {/* Índice */}
        <nav className="mb-14 rounded-xl border border-[#1e3a5f]/10 bg-white p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#475569]">Neste manual</p>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {TOC.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-sm text-[#1e3a5f] hover:underline">{s.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-14">
          <Sec id="o-que-e" title="O que é o LexAxis">
            <p>
              O LexAxis <strong>não é um chat</strong> como o ChatGPT. Ele trabalha com{' '}
              <strong>agentes de IA especializados</strong> — cada um numa função jurídica (jurisprudência,
              doutrina, revisão, cálculo, e até um "advogado do diabo" que contrapõe as teses). Você
              monta a análise, escolhe os agentes, e eles produzem sugestões e o texto.
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#1e3a5f]" />
              <span>
                O diferencial: <strong>cada citação vem com a fonte oficial</strong>. O que o sistema
                não confirma é marcado como <strong>[A VERIFICAR]</strong>, nunca apresentado como certo.
              </span>
            </p>
          </Sec>

          <Sec id="primeiro-acesso" title="Primeiro acesso">
            <p className="flex items-start gap-2">
              <Globe className="mt-1 h-5 w-5 shrink-0 text-[#1e3a5f]" />
              <span>
                Só é preciso um <strong>navegador moderno</strong> e internet — nada de instalação ou
                certificado. Acesse por <strong>lexaxis.com.br</strong>, entre com seu e-mail e senha, e
                no primeiro acesso troque a senha em <strong>/reset-password</strong>.
              </span>
            </p>
          </Sec>

          <Sec id="processos" title="Cadastrar e organizar processos">
            <p>
              Em <strong>Processos</strong>, cadastre cada processo (número, cliente, área, status). No
              detalhe do processo você anexa <strong>Documentos</strong> e vê as <strong>Minutas</strong>{' '}
              vinculadas. Para um processo aguardando decisão, use <strong>"Resumir / Indexar"</strong> —
              ele abre o Gerador já configurado para um Relatório de Caso.
            </p>
          </Sec>

          <Sec id="minutas" title="Gerar uma minuta">
            <p>
              Toda análise acontece no <strong>Gerador de Minutas</strong>. Escolha o <strong>tipo</strong>{' '}
              conforme o que você precisa: <em>Relatório de Caso</em> (analisa o processo inteiro),
              Petição Inicial, Contestação, Parecer Jurídico, Parecer Tributário,{' '}
              <em>Defesa Fiscal (CARF)</em>, Recurso de Apelação, Agravo, <em>Contrarrazões</em>,
              Resposta à Acusação, Habeas Corpus, entre outros. O tipo define o modelo e filtra os
              agentes compatíveis.
            </p>
            <p className="rounded-lg border border-[#c9a35a]/40 bg-[#c9a35a]/10 px-4 py-3 text-sm text-[#1e3a5f]">
              <strong>Respondendo a um recurso?</strong> Escolha o tipo <em>Contrarrazões</em>: aparece o
              agente <strong>Contrarrazões</strong>, especialista em prazos, admissibilidade e nas súmulas
              de cada recurso. No campo de <strong>instruções</strong>, diga qual recurso está respondendo
              (ex.: <em>“contrarrazões à apelação da parte X”</em> ou <em>“ao recurso especial”</em>) para
              ele ajustar a análise.
            </p>
            <p className="rounded-lg border border-[#c9a35a]/40 bg-[#c9a35a]/10 px-4 py-3 text-sm text-[#1e3a5f]">
              <strong>Abrindo um processo (Petição Inicial)?</strong> O melhor resultado vem de três
              entradas juntas: <strong>(1) os metadados</strong> preenchidos (Cliente, Comarca, Objeto,
              Pedido — alimentam os agentes e a auditoria final); <strong>(2) os documentos</strong>{' '}
              anexados (contrato, provas, procuração); e <strong>(3) as instruções</strong> com o que não
              está nos papéis: a narrativa do problema, os pedidos desejados e o <strong>rito</strong> —{' '}
              <em>“rito comum”</em>, <em>“juizado especial cível”</em> (Lei 9.099/95, até 40 salários
              mínimos, peça curta e direta) ou <em>“juizado especial federal”</em> (Lei 10.259/2001, até
              60). O agente <strong>Peticionador Cível</strong> aplica as regras do rito indicado e alerta{' '}
              <em>[CABIMENTO]</em> se o valor ou a matéria não couberem no Juizado. Documentos sem
              contexto geram petição vaga — as instruções fazem diferença.
            </p>
            <p className="rounded-lg border border-[#c9a35a]/40 bg-[#c9a35a]/10 px-4 py-3 text-sm text-[#1e3a5f]">
              <strong>Defendendo no CARF ou na DRJ?</strong> Escolha o tipo{' '}
              <em>Defesa Fiscal (CARF)</em>: o agente <strong>defesa-fiscal-carf</strong> entra
              pré-selecionado e cobre todo o processo administrativo fiscal. No campo de{' '}
              <strong>instruções</strong>, diga qual peça está preparando —{' '}
              <em>“impugnação ao auto de infração”</em>, <em>“manifestação de inconformidade”</em>,{' '}
              <em>“recurso voluntário”</em>, <em>“recurso especial à CSRF”</em> ou{' '}
              <em>“embargos de declaração”</em> — e ele aplica os prazos, a admissibilidade e as
              súmulas próprias de cada uma. Citações de acórdãos e súmulas do CARF passam pela mesma
              verificação em fonte oficial das demais.
            </p>
            <ol className="mt-2 space-y-4">
              {PASSOS.map((p) => (
                <li key={p.n} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1e3a5f] text-xs font-bold text-white">{p.n}</span>
                  <div>
                    <p className="font-semibold text-[#1e3a5f]">{p.t}</p>
                    <p className="text-sm">{p.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Sec>

          <Sec id="analisar" title="Como a análise funciona">
            <p>
              Ao clicar em <strong>Analisar</strong>, os agentes selecionados leem os autos e a peça,
              conferem as fontes e devolvem <strong>sugestões</strong>. Você aplica as que fizerem
              sentido, e o sistema reescreve o documento. Ao final, um <strong>validador independente</strong>{' '}
              confere se o resultado corresponde ao caso e ao gênero — se algo não bate, ele avisa antes
              de entregar.
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Dica:</strong> use documentos que pertençam ao caso e preencha cliente/comarca/objeto.
              Misturar documentos sem relação faz o validador reprovar o resultado — é proteção, não erro.
            </p>
          </Sec>

          <Sec id="agentes" title="Os agentes">
            <p>
              Cada agente é um revisor especializado. Selecione os pertinentes ao caso — não precisa
              usar todos. Abaixo, o que cada um faz, por categoria.
            </p>
            <p className="rounded-lg border border-[#c9a35a]/40 bg-[#c9a35a]/10 px-4 py-3 text-sm text-[#1e3a5f]">
              <strong>Pré-seleção automática do especialista.</strong> Ao escolher o tipo de peça, o
              LexAxis já seleciona o agente <em>dono daquele gênero</em> — por exemplo,{' '}
              <strong>Peticionador Cível</strong> na Petição Inicial (é ele quem aplica as regras do
              rito, inclusive dos Juizados Especiais), <strong>Contrarrazões</strong> nas
              Contrarrazões, <strong>habeas-corpus</strong> no Habeas Corpus. Você pode removê-lo e
              montar a seleção que preferir — mas, sem o especialista do gênero, a análise perde as
              verificações técnicas próprias daquela peça (cabimento, prazos do rito, estrutura).
              Complete a seleção com 2 a 3 agentes de apoio (jurisprudência, cálculo, red-team) —
              para a maioria dos casos, 3 a 4 agentes são o ponto ideal.
            </p>
            <div className="mt-4 space-y-6">
              {AGENTES.map((g) => (
                <div key={g.cat}>
                  <h3 className="flex items-center gap-2 font-serif text-lg font-bold text-[#1e3a5f]">
                    <Bot className="h-4 w-4 text-[#c9a35a]" /> {g.cat}
                  </h3>
                  <p className="mt-1 text-sm italic text-[#475569]/80">{g.intro}</p>
                  <ul className="mt-2 space-y-1.5">
                    {g.itens.map(([nome, desc]) => (
                      <li key={nome} className="text-sm">
                        <span className="font-semibold text-[#1e3a5f]">{nome}</span> — {desc}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Sec>

          <Sec id="prazos" title="Prazos">
            <p className="flex items-start gap-2">
              <Clock className="mt-1 h-5 w-5 shrink-0 text-[#1e3a5f]" />
              <span>
                Em <strong>Prazos</strong>, registre datas-limite ou use a <strong>calculadora</strong>:
                informe a data da intimação e o tipo de ato, e o sistema calcula a data fatal (dias
                úteis, feriados nacionais, recesso e prazo em dobro). A régua de urgência (D-7/D-3/hoje)
                sinaliza o que está próximo, e o dashboard mostra os prazos mais urgentes.
              </span>
            </p>
            <p className="text-sm">
              A calculadora sempre traz um aviso <strong>[A VERIFICAR]</strong> lembrando de conferir os
              feriados forenses locais do tribunal — ela cobre os nacionais, mas cada tribunal tem os seus.
            </p>
          </Sec>

          <Sec id="config" title="Configurações do escritório">
            <p className="flex items-start gap-2">
              <Users className="mt-1 h-5 w-5 shrink-0 text-[#1e3a5f]" />
              <span>
                Em <strong>Configurações</strong>, o responsável (owner) define a <strong>identidade
                visual</strong> (logo, cabeçalho, cores) que aparece nos documentos exportados, cadastra
                os <strong>advogados do escritório</strong> (que ficam disponíveis como responsáveis nas
                minutas) e gere a <strong>equipe</strong> e seus papéis.
              </span>
            </p>
          </Sec>

          <Sec id="exportar" title="Exportação">
            <p className="flex items-start gap-2">
              <Download className="mt-1 h-5 w-5 shrink-0 text-[#1e3a5f]" />
              <span>
                Exporte a minuta em <strong>DOCX</strong> ou <strong>PDF</strong>, com o timbre do seu
                escritório (logo, cabeçalho, rodapé e paginação). O DOCX abre no Word para os ajustes
                finais; o PDF sai pronto para o cliente.
              </span>
            </p>
          </Sec>

          <Sec id="confianca" title="Confiança e limites">
            <ul className="space-y-2">
              <li className="flex items-start gap-2"><FileText className="mt-1 h-4 w-4 shrink-0 text-[#1e3a5f]" /><span><strong>Conferência de fontes:</strong> cada lei, súmula ou acórdão vem com link para a base oficial.</span></li>
              <li className="flex items-start gap-2"><FileText className="mt-1 h-4 w-4 shrink-0 text-[#1e3a5f]" /><span><strong>[A VERIFICAR]:</strong> o que não se confirma não vira afirmação — vira marcação para você decidir.</span></li>
              <li className="flex items-start gap-2"><FileText className="mt-1 h-4 w-4 shrink-0 text-[#1e3a5f]" /><span><strong>Cálculo não sai por adivinhação</strong> — segue regras e fórmulas explícitas.</span></li>
              <li className="flex items-start gap-2"><FileText className="mt-1 h-4 w-4 shrink-0 text-[#1e3a5f]" /><span><strong>É apoio, não substituição:</strong> a peça é insumo para a sua revisão e assinatura.</span></li>
            </ul>
            <p className="mt-2">
              Quer entender o método em detalhe?{' '}
              <Link to="/como-verificamos" className="font-semibold text-[#1e3a5f] underline decoration-[#c9a35a] decoration-2 underline-offset-2">Como verificamos as fontes</Link>.
            </p>
          </Sec>

          <Sec id="faq" title="Perguntas frequentes">
            <div className="divide-y divide-[#1e3a5f]/10 border-y border-[#1e3a5f]/10">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-serif text-base font-semibold text-[#1e3a5f] [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="text-[#c9a35a] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-[#475569]">{f.a}</p>
                </details>
              ))}
            </div>
          </Sec>
        </div>
      </div>

      {/* CTA suporte */}
      <section className="bg-[#1e3a5f]">
        <div className="mx-auto max-w-3xl px-6 py-14 text-center">
          <h2 className="font-serif text-2xl font-bold leading-tight text-white md:text-3xl">Ainda com dúvidas?</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/70">Fale com a gente — respondemos em linguagem de advogado.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a href="mailto:contato@lexaxis.com.br?subject=Ajuda%20LexAxis" className="inline-flex items-center gap-2 rounded-md bg-[#c9a35a] px-6 py-3 text-sm font-semibold text-[#1e3a5f] transition-all hover:bg-[#d6b571]">
              Falar com o suporte <ArrowRight className="h-4 w-4" />
            </a>
            <Link to="/como-verificamos" className="inline-flex items-center gap-2 rounded-md border border-white/25 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10">
              Como verificamos as fontes
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
