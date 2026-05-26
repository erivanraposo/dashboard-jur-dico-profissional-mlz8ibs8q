import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Search, Filter, BookOpen, PlusCircle, Check } from 'lucide-react'
import useLegalStore, { Jurisprudence } from '@/stores/use-legal-store'
import { useToast } from '@/hooks/use-toast'

const mockResults: Jurisprudence[] = [
  {
    id: 'jur-1',
    tribunal: 'STJ',
    ano: '2023',
    ramo: 'Penal',
    relator: 'Min. Reynaldo Soares da Fonseca',
    ementa:
      'HABEAS CORPUS. TRÁFICO DE DROGAS. PRISÃO PREVENTIVA. FUNDAMENTAÇÃO INIDÔNEA. QUANTIDADE DE DROGA NÃO EXORBITANTE. CONCESSÃO DA ORDEM.',
    inteiroTeor:
      'O EXMO. SR. MINISTRO REYNALDO SOARES DA FONSECA (Relator): Trata-se de habeas corpus, com pedido liminar, impetrado em benefício de [Paciente], apontando como autoridade coatora o Tribunal de Justiça do Estado de São Paulo. A prisão preventiva exige fundamentação concreta, baseada em elementos extraídos dos autos que demonstrem a necessidade da segregação cautelar. No caso, a quantidade de droga apreendida (50g de maconha) não se revela exorbitante a ponto de, por si só, justificar a prisão preventiva com base na garantia da ordem pública. Concedo a ordem para revogar a prisão preventiva do paciente, mediante a imposição de medidas cautelares diversas da prisão.',
  },
  {
    id: 'jur-2',
    tribunal: 'TJSP',
    ano: '2023',
    ramo: 'Cível',
    relator: 'Des. Francisco Loureiro',
    ementa:
      'APELAÇÃO CÍVEL. AÇÃO DE INDENIZAÇÃO POR DANOS MORAIS. INSCRIÇÃO INDEVIDA NOS ÓRGÃOS DE PROTEÇÃO AO CRÉDITO. DANO IN RE IPSA. QUANTUM INDENIZATÓRIO MANTIDO.',
    inteiroTeor:
      'AÇÃO DECLARATÓRIA DE INEXIGIBILIDADE DE DÉBITO CUMULADA COM INDENIZAÇÃO POR DANOS MORAIS. Inscrição indevida do nome da autora nos cadastros de inadimplentes. Relação de consumo. Inversão do ônus da prova. Ré que não se desincumbiu do ônus de comprovar a contratação e a origem do débito. Dano moral in re ipsa. Valor da indenização fixado em R$ 10.000,00 que se mostra adequado aos princípios da razoabilidade e proporcionalidade, bem como aos precedentes desta Câmara. Sentença mantida. Recurso desprovido.',
  },
  {
    id: 'jur-3',
    tribunal: 'STF',
    ano: '2022',
    ramo: 'Penal',
    relator: 'Min. Gilmar Mendes',
    ementa:
      'AGRAVO REGIMENTAL EM HABEAS CORPUS. ROUBO MAJORADO. RECONHECIMENTO FOTOGRÁFICO. INOBSERVÂNCIA DO ART. 226 DO CPP. NULIDADE.',
    inteiroTeor:
      'O reconhecimento de pessoa, presencial ou por fotografia, realizado na fase do inquérito policial, apenas é apto, para identificar o réu e fixar a autoria delitiva, quando observadas as formalidades previstas no art. 226 do Código de Processo Penal e quando corroborado por outras provas colhidas na fase judicial, sob o crivo do contraditório e da ampla defesa. A inobservância das referidas formalidades acarreta a nulidade do ato e a sua desconsideração para fins probatórios. Agravo regimental provido para absolver o agravante.',
  },
]

export default function Jurisprudencia() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<Jurisprudence[]>(mockResults)
  const [selectedCase, setSelectedCase] = useState<Jurisprudence | null>(null)
  const { clippedCases, clipCase } = useLegalStore()
  const { toast } = useToast()

  const handleSearch = () => {
    setIsSearching(true)
    setTimeout(() => {
      setIsSearching(false)
      const filtered = mockResults.filter(
        (r) =>
          r.ementa.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.tribunal.toLowerCase().includes(searchTerm.toLowerCase()),
      )
      setResults(filtered)
      if (filtered.length === 0) {
        toast({
          title: 'Nenhum resultado',
          description: 'Não encontramos jurisprudência com os termos buscados.',
        })
      }
    }, 600)
  }

  const handleClip = (c: Jurisprudence) => {
    clipCase(c)
    toast({
      title: 'Jurisprudência Adicionada',
      description: 'Disponível no Gerador de Minutas.',
    })
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
          <BookOpen className="h-8 w-8" />
          Busca de Jurisprudência
        </h1>
        <p className="text-muted-foreground mt-1">
          Pesquise precedentes nos principais tribunais do país para embasar suas minutas.
        </p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Ex: Habeas Corpus tráfico de drogas quantidade não exorbitante..."
                className="pl-10 h-12 text-base"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch} className="h-12 px-8" disabled={isSearching}>
              {isSearching ? 'Buscando...' : 'Pesquisar'}
            </Button>
          </div>

          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" /> Filtros:
            </div>
            <Select defaultValue="todos">
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Tribunal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Tribunais</SelectItem>
                <SelectItem value="stf">STF</SelectItem>
                <SelectItem value="stj">STJ</SelectItem>
                <SelectItem value="tjsp">TJSP</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="todos">
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Ramo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Ramos</SelectItem>
                <SelectItem value="penal">Penal</SelectItem>
                <SelectItem value="civel">Cível</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="2023">
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
                <SelectItem value="2022">2022</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {results.map((result) => {
          const isClipped = clippedCases.some((c) => c.id === result.id)
          return (
            <Card
              key={result.id}
              className="border-border/50 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden animate-fade-in-up"
            >
              <CardHeader className="pb-3" onClick={() => setSelectedCase(result)}>
                <div className="flex justify-between items-start">
                  <div className="flex gap-2 items-center mb-2">
                    <Badge variant="secondary" className="font-mono bg-slate-100">
                      {result.tribunal}
                    </Badge>
                    <Badge variant="outline" className="text-muted-foreground">
                      {result.ano}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        result.ramo === 'Penal'
                          ? 'border-red-200 text-red-700 bg-red-50'
                          : 'border-blue-200 text-blue-700 bg-blue-50'
                      }
                    >
                      {result.ramo}
                    </Badge>
                  </div>
                  <Button
                    variant={isClipped ? 'secondary' : 'outline'}
                    size="sm"
                    className="gap-1 z-10"
                    onClick={(e) => {
                      e.stopPropagation()
                      !isClipped && handleClip(result)
                    }}
                    disabled={isClipped}
                  >
                    {isClipped ? (
                      <>
                        <Check className="h-4 w-4 text-green-600" /> Adicionado
                      </>
                    ) : (
                      <>
                        <PlusCircle className="h-4 w-4" /> Clipar
                      </>
                    )}
                  </Button>
                </div>
                <CardTitle className="text-lg leading-relaxed font-serif">
                  {result.ementa}
                </CardTitle>
                <CardDescription className="pt-2 text-primary font-medium">
                  Relator: {result.relator}
                </CardDescription>
              </CardHeader>
            </Card>
          )
        })}
      </div>

      <Sheet open={!!selectedCase} onOpenChange={(open) => !open && setSelectedCase(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="pb-6 border-b">
            <div className="flex gap-2 items-center mb-4">
              <Badge variant="secondary" className="font-mono">
                {selectedCase?.tribunal}
              </Badge>
              <Badge variant="outline">{selectedCase?.ano}</Badge>
              <Badge variant="outline">{selectedCase?.ramo}</Badge>
            </div>
            <SheetTitle className="text-xl font-serif text-justify leading-relaxed">
              {selectedCase?.ementa}
            </SheetTitle>
            <SheetDescription className="text-base text-primary font-medium mt-4">
              Relator: {selectedCase?.relator}
            </SheetDescription>
          </SheetHeader>
          <div className="py-6">
            <h4 className="font-semibold mb-4 uppercase text-sm tracking-wider text-muted-foreground">
              Inteiro Teor / Decisão
            </h4>
            <div className="prose prose-slate font-serif text-justify max-w-none text-slate-800 leading-loose">
              <p>{selectedCase?.inteiroTeor}</p>
            </div>
          </div>
          <div className="pt-6 border-t mt-auto sticky bottom-0 bg-background/95 backdrop-blur">
            <Button
              className="w-full h-12 text-base gap-2"
              onClick={() => {
                if (selectedCase) handleClip(selectedCase)
                setSelectedCase(null)
              }}
              disabled={clippedCases.some((c) => c.id === selectedCase?.id)}
            >
              <PlusCircle className="h-5 w-5" />
              {clippedCases.some((c) => c.id === selectedCase?.id)
                ? 'Já adicionado à Minuta'
                : 'Exportar para Minuta'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
