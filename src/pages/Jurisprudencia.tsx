import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { supabase } from '@/lib/supabase/client'

export default function Jurisprudencia() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<Jurisprudence[]>([])
  const [selectedCase, setSelectedCase] = useState<Jurisprudence | null>(null)

  const { clippedCases, clipCase } = useLegalStore()
  const { toast } = useToast()

  const handleSearch = async () => {
    setIsSearching(true)
    try {
      let query = supabase.from('jurisprudence').select('*')
      if (searchTerm) {
        query = query.ilike('summary', `%${searchTerm}%`)
      }

      const { data, error } = await query
      if (error) throw error

      if (data) {
        setResults(
          data.map((d) => ({
            id: d.id,
            tribunal: d.court,
            ano: '2023', // mocked or extracted from date
            ramo: d.tags?.includes('Penal') ? 'Penal' : 'Cível',
            relator: 'Ministro/Desembargador', // usually from metadata
            ementa: d.summary,
            inteiroTeor: d.full_text,
          })),
        )

        if (data.length === 0) {
          toast({
            title: 'Nenhum resultado',
            description: 'Não encontramos jurisprudência com os termos buscados.',
          })
        }
      }
    } catch (err: any) {
      toast({ title: 'Erro na busca', description: err.message, variant: 'destructive' })
    } finally {
      setIsSearching(false)
    }
  }

  // Load initial data
  useEffect(() => {
    handleSearch()
  }, [])

  const handleClip = (c: Jurisprudence) => {
    clipCase(c)
    toast({ title: 'Jurisprudência Adicionada', description: 'Disponível no Gerador de Minutas.' })
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
                placeholder="Busque por termos, ex: tráfico privilegiado..."
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
                      if (!isClipped) handleClip(result)
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
              <Badge variant="outline">{selectedCase?.ramo}</Badge>
            </div>
            <SheetTitle className="text-xl font-serif text-justify leading-relaxed">
              {selectedCase?.ementa}
            </SheetTitle>
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
