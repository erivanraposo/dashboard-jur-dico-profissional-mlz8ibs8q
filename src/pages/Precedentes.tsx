import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  ShieldCheck, ShieldAlert, ShieldQuestion, SearchX, ExternalLink, Copy, Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import HelpButton from '@/components/HelpButton'
import { useToast } from '@/hooks/use-toast'

// ---------------------------------------------------------------------------
// VERIFICADOR DE PRECEDENTES — Fase 1
// O advogado cola citações que já tem; o sistema atesta se existem e se dizem
// o que se afirma. Quatro estados declarados, nunca um "verificado" binário.
// ---------------------------------------------------------------------------

type Estado =
  | 'CONFIRMADO_INTEIRO_TEOR'
  | 'CONFIRMADO_METADADOS'
  | 'CONFIRMADO_REPOSITORIO'
  | 'CONFIRMADO_BASE_STJ'
  | 'CONFIRMADO_BASE_STF'
  | 'VIGENCIA_COMPROMETIDA'
  | 'DIVERGENTE'
  | 'NAO_LOCALIZADO'
  | 'IDENTIFICADO'

type Item = {
  citacao: string
  tipo: string
  tribunal: string | null
  estado: Estado
  url_oficial: string | null
  url_busca: string | null
  url_lexml: string | null
  o_que_decide: string | null
  observacao: string | null
  campos_conferidos?: string[]
  campos_nao_conferidos?: string[]
  resolucao: 'deterministica' | 'busca'
}

const ESTADOS: Record<Estado, { rotulo: string; cls: string; Icone: any; ajuda: string }> = {
  CONFIRMADO_INTEIRO_TEOR: {
    rotulo: 'Confirmado — inteiro teor',
    cls: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    Icone: ShieldCheck,
    ajuda: 'O julgado foi localizado em fonte oficial e o conteúdo foi lido.',
  },
  CONFIRMADO_METADADOS: {
    rotulo: 'Confirmado — metadados',
    cls: 'bg-[#c9a35a]/20 text-[#8a6d2f] border-[#c9a35a]/50',
    Icone: ShieldQuestion,
    ajuda:
      'Número, classe, relator e data foram conferidos em fonte do próprio tribunal, mas o inteiro teor não estava acessível — não sabemos o que o julgado decide.',
  },
  CONFIRMADO_BASE_STJ: {
    rotulo: 'Confirmado — base do STJ',
    cls: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    Icone: ShieldCheck,
    ajuda:
      'Conferido na Jurisprudência em Teses, compilação do próprio STJ: o julgado existe, os metadados batem e o STJ o vincula à tese indicada.',
  },
  CONFIRMADO_BASE_STF: {
    rotulo: 'Confirmado — base do STF (metadados)',
    cls: 'bg-[#c9a35a]/20 text-[#8a6d2f] border-[#c9a35a]/50',
    Icone: ShieldQuestion,
    ajuda:
      'Número, classe, relator, órgão e data conferidos na Coletânea Temática publicada pelo próprio STF. O que o julgado decide NÃO foi conferido: a coletânea traz recortes selecionados por tema, não a tese firmada.',
  },
  CONFIRMADO_REPOSITORIO: {
    rotulo: 'Confirmado — repositório oficial',
    cls: 'bg-[#c9a35a]/20 text-[#8a6d2f] border-[#c9a35a]/50',
    Icone: ShieldQuestion,
    ajuda:
      'Registro localizado no LexML, repositório oficial do governo — não no portal do próprio tribunal. Fonte pública oficial, mas de segunda instância documental.',
  },
  IDENTIFICADO: {
    rotulo: 'Identificado — não conferido',
    cls: 'bg-slate-100 text-slate-700 border-slate-300',
    Icone: ShieldQuestion,
    ajuda:
      'Reconhecemos a citação pelo formato e abrimos a busca oficial. Nenhuma fonte foi consultada e o teor não foi lido — isto não é uma confirmação.',
  },
  VIGENCIA_COMPROMETIDA: {
    rotulo: 'Vigência comprometida',
    cls: 'bg-red-100 text-red-800 border-red-300',
    Icone: ShieldAlert,
    ajuda:
      'O enunciado existe e é esse mesmo — mas foi cancelado, revogado, superado ou alterado. Citá-lo como vigente derruba o argumento.',
  },
  DIVERGENTE: {
    rotulo: 'Divergente',
    cls: 'bg-red-100 text-red-800 border-red-300',
    Icone: ShieldAlert,
    ajuda:
      'O julgado existe, mas algum dado não confere ou ele não decide o que a citação afirma. Leia a observação.',
  },
  NAO_LOCALIZADO: {
    rotulo: 'Não localizado',
    cls: 'bg-slate-100 text-slate-700 border-slate-300',
    Icone: SearchX,
    ajuda:
      'Não encontrado nos portais consultados. Isso não é prova de que a citação seja falsa — pode ser limite de cobertura.',
  },
}

const EXEMPLO = `HC 103.118, rel. min. Luiz Fux, j. 20-3-2012, 1ª Turma
Súmula Vinculante 11
Tema 121 do STF`

export default function Precedentes() {
  const [texto, setTexto] = useState('')
  const [tese, setTese] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [etapa, setEtapa] = useState('')
  const [itens, setItens] = useState<Item[] | null>(null)
  const [consumo, setConsumo] = useState<{ hoje: number; teto: number } | null>(null)
  const [dominios, setDominios] = useState<string[]>([])
  const { toast } = useToast()

  // Streaming: a Edge Function corta em 150s sem tráfego, e uma verificação
  // demorada morria em 504 na cara do advogado. O batimento mantém a conexão
  // viva e, de quebra, a espera deixa de ser uma tela parada.
  const verificar = async () => {
    if (texto.trim().length < 4) {
      toast({ title: 'Cole ao menos uma citação', variant: 'destructive' })
      return
    }
    setCarregando(true)
    setItens(null)
    setEtapa('Reconhecendo as citações…')
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada. Entre novamente.')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-precedent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ texto, tese }),
        },
      )
      if (!res.ok && res.status !== 200) {
        const txt = await res.text()
        let msg = `Falha na verificação (HTTP ${res.status}).`
        try {
          msg = JSON.parse(txt)?.message ?? msg
        } catch {
          /* corpo não-JSON */
        }
        throw new Error(msg)
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let data: any = null
      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const partes = buffer.split('\n\n')
        buffer = partes.pop() ?? ''
        for (const p of partes) {
          const linha = p.trim()
          if (!linha.startsWith('data:')) continue
          let evt: any
          try {
            evt = JSON.parse(linha.slice(5).trim())
          } catch {
            continue
          }
          if (evt.tipo === 'progresso') setEtapa(evt.etapa)
          else if (evt.tipo === 'resultado') data = evt
        }
      }
      if (!data) throw new Error('A verificação terminou sem resposta. Tente novamente.')

      if (data?.status === 'error') {
        toast({ title: 'Não foi possível verificar', description: data.message, variant: 'destructive' })
        if (data.consumo_hoje != null) setConsumo({ hoje: data.consumo_hoje, teto: data.teto_diario })
        return
      }
      setItens(data.itens ?? [])
      setDominios(data.dominios_consultados ?? [])
      if (data.consumo_hoje != null) setConsumo({ hoje: data.consumo_hoje, teto: data.teto_diario })
      if (data.aviso) toast({ title: 'Nada reconhecido', description: data.aviso })
    } catch (e: any) {
      toast({ title: 'Erro na verificação', description: e.message, variant: 'destructive' })
    } finally {
      setCarregando(false)
      setEtapa('')
    }
  }

  // Copia o achado inteiro — citação, veredito, o que o julgado decide, ressalva e
  // fonte. Copiar só a citação induzia a achar que a explicação tinha ido junto.
  const copiar = (i: Item) => {
    const meta = ESTADOS[i.estado] ?? ESTADOS.NAO_LOCALIZADO
    const linhas = [
      i.citacao,
      `[${meta.rotulo}]`,
      i.o_que_decide ? `O que decide: ${i.o_que_decide}` : null,
      i.observacao ? `Ressalva: ${i.observacao}` : null,
      i.url_oficial ? `Fonte oficial: ${i.url_oficial}` : null,
      i.url_busca ? `Busca no portal: ${i.url_busca}` : null,
      i.url_lexml ? `LexML: ${i.url_lexml}` : null,
      'Verificado pelo LexAxis — confira na fonte antes de protocolar.',
    ].filter(Boolean)
    navigator.clipboard.writeText(linhas.join('\n'))
    toast({
      title: 'Achado copiado',
      description: 'Citação, veredito, o que o julgado decide e os links de conferência.',
    })
  }

  const resumo = itens
    ? {
        conf: itens.filter((i) => i.estado.startsWith('CONFIRMADO')).length,
        div: itens.filter((i) => i.estado === 'DIVERGENTE').length,
        nao: itens.filter((i) => i.estado === 'NAO_LOCALIZADO').length,
        ide: itens.filter((i) => i.estado === 'IDENTIFICADO').length,
      }
    : null

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
            <ShieldCheck className="h-8 w-8" />
            Verificador de Precedentes
          </h1>
          <p className="text-muted-foreground mt-1">
            Cole citações de qualquer origem — peça da parte contrária, minuta de estagiário, saída
            de outra IA, sua própria peça antes do protocolo. Conferimos em portais oficiais.
          </p>
        </div>
        <HelpButton anchor="verificador-precedentes" />
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div>
            <Label htmlFor="citacoes">Citações</Label>
            <Textarea
              id="citacoes"
              className="mt-1.5 min-h-[130px] font-mono text-sm"
              placeholder={EXEMPLO}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Uma por linha, ou cole o parágrafo inteiro da peça. Até 10 por vez.
            </p>
          </div>
          <div>
            <Label htmlFor="tese">
              Tese alegada <span className="text-muted-foreground font-normal">(opcional, mas é o que torna a conferência forte)</span>
            </Label>
            <Textarea
              id="tese"
              className="mt-1.5 min-h-[70px]"
              placeholder="O que você está afirmando que esses julgados sustentam. Ex.: que o STF admite a modulação de efeitos em declaração de não recepção."
              value={tese}
              onChange={(e) => setTese(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Sem a tese, conferimos existência e metadados. Com ela, conferimos também se o julgado
              decide mesmo o que se afirma — que é onde mora a citação inventada.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Button onClick={verificar} disabled={carregando} className="h-11 px-8 gap-2">
              {carregando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Verificando...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" /> Verificar
                </>
              )}
            </Button>
            {carregando && etapa ? (
              <span className="text-xs text-muted-foreground animate-pulse">{etapa}</span>
            ) : (
              consumo && (
                <span className="text-xs text-muted-foreground">
                  {consumo.hoje} {consumo.hoje === 1 ? 'verificação' : 'verificações'} hoje
                </span>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {resumo && itens && itens.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge className={ESTADOS.CONFIRMADO_INTEIRO_TEOR.cls}>{resumo.conf} confirmada(s)</Badge>
          {resumo.div > 0 && <Badge className={ESTADOS.DIVERGENTE.cls}>{resumo.div} divergente(s)</Badge>}
          {resumo.nao > 0 && <Badge className={ESTADOS.NAO_LOCALIZADO.cls}>{resumo.nao} não localizada(s)</Badge>}
          {resumo.ide > 0 && <Badge className={ESTADOS.IDENTIFICADO.cls}>{resumo.ide} identificada(s)</Badge>}
        </div>
      )}

      <div className="space-y-4">
        {itens?.map((i, n) => {
          const meta = ESTADOS[i.estado] ?? ESTADOS.NAO_LOCALIZADO
          const { Icone } = meta
          // Súmula não tem "julgado" nem "metadados a bater" — tem enunciado.
          // O texto genérico do selo descrevia um acórdão e dizia o que não foi feito.
          const ehSumula = i.tipo === 'sumula' || i.tipo === 'sumula_vinculante'
          const sumulaConferida = ehSumula && i.estado.startsWith('CONFIRMADO_BASE')
          const ajuda = sumulaConferida
            ? `Enunciado lido na publicação oficial do ${i.tribunal ?? 'tribunal'}. O texto ao lado é o da súmula, como o tribunal o publica.`
            : meta.ajuda
          // O rótulo do STF diz "(metadados)", que descreve acórdão. Em súmula não
          // há metadado a conferir — há o enunciado, e ele foi lido.
          const rotulo = sumulaConferida
            ? `Confirmado — base do ${i.tribunal ?? 'tribunal'}`
            : meta.rotulo
          return (
            <Card key={n} className="border-border/50 shadow-sm overflow-hidden">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-serif text-base leading-relaxed">{i.citacao}</p>
                  <Badge className={`${meta.cls} shrink-0 gap-1`}>
                    <Icone className="h-3.5 w-3.5" />
                    {rotulo}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground">{ajuda}</p>

                {i.o_que_decide && (
                  <div className="text-sm">
                    <span className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">
                      O que o julgado decide
                    </span>
                    <p className="mt-1 text-slate-700">{i.o_que_decide}</p>
                  </div>
                )}

                {(i.campos_conferidos?.length || i.campos_nao_conferidos?.length) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {!!i.campos_conferidos?.length && (
                      <span className="text-emerald-700">
                        ✓ conferido na fonte: {i.campos_conferidos.join(', ')}
                      </span>
                    )}
                    {!!i.campos_nao_conferidos?.length && (
                      <span className="text-amber-700">
                        ⚠ não conferido: {i.campos_nao_conferidos.join(', ')}
                      </span>
                    )}
                  </div>
                )}

                {i.observacao && (
                  <div
                    className={`text-sm rounded-md p-3 ${
                      i.estado === 'DIVERGENTE'
                        ? 'bg-red-50 text-red-900'
                        : 'bg-muted/50 text-slate-700'
                    }`}
                  >
                    {i.observacao}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {i.url_oficial && (
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <a href={i.url_oficial} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" /> Documento no portal
                        {i.tribunal ? ` do ${i.tribunal}` : ''}
                      </a>
                    </Button>
                  )}
                  {i.url_busca && (
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <a href={i.url_busca} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" /> Buscar
                        {i.tribunal ? ` no ${i.tribunal}` : ' no portal'}
                      </a>
                    </Button>
                  )}
                  {i.url_lexml && (
                    <Button asChild variant="ghost" size="sm" className="gap-1.5">
                      <a href={i.url_lexml} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" /> LexML
                      </a>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => copiar(i)}>
                    <Copy className="h-3.5 w-3.5" /> Copiar achado
                  </Button>
                  {i.resolucao === 'deterministica' && (
                    <span className="text-xs text-muted-foreground">
                      Identificado sem consulta de IA.
                    </span>
                  )}
                </div>
                {!i.url_oficial && (
                  <p className="text-xs text-muted-foreground italic">
                    Sem link direto para o documento — nada é exibido como confirmado sem fonte do
                    próprio tribunal. Os botões acima abrem a busca oficial já preenchida.
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {itens && itens.length > 0 && (
        <p className="text-xs text-muted-foreground border-t pt-4 leading-relaxed">
          Consultamos exclusivamente domínios oficiais
          {dominios.length > 0 && <> ({dominios.join(', ')})</>}. Ausência nos portais consultados
          não é prova de inexistência. O sistema atesta existência e teor —{' '}
          <strong>não avalia se o precedente serve ao seu caso</strong>, o que é juízo do advogado.
          Confira sempre na fonte antes de protocolar.
        </p>
      )}
    </div>
  )
}
