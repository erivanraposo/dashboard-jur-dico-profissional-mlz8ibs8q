import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileText, ArrowLeft, ArrowRight, Gavel, Scale, Quote, Trash2 } from 'lucide-react'
import useLegalStore from '@/stores/use-legal-store'
import { useToast } from '@/hooks/use-toast'

type TemplateType =
  | 'Habeas Corpus'
  | 'Resposta à Acusação'
  | 'Petição Inicial'
  | 'Contestação'
  | null

export default function GeradorMinutas() {
  const [template, setTemplate] = useState<TemplateType>(null)
  const [step, setStep] = useState(1)
  const { clippedCases, removeCase } = useLegalStore()
  const { toast } = useToast()

  // Form State
  const [formData, setFormData] = useState({
    cliente: '',
    comarca: '',
    vara: '',
    autoridade: '',
    fatos: '',
    pedidos: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  if (!template) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
            <FileText className="h-8 w-8" />
            Gerador de Minutas
          </h1>
          <p className="text-muted-foreground mt-1">
            Selecione um modelo padronizado para iniciar a automação da peça jurídica.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mt-8">
          <div className="space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2 text-red-800">
              <Gavel className="h-5 w-5" /> Área Penal
            </h2>
            <Card
              className="hover:border-red-400 hover:shadow-md transition-all cursor-pointer"
              onClick={() => setTemplate('Habeas Corpus')}
            >
              <CardHeader>
                <CardTitle className="text-base">Habeas Corpus</CardTitle>
                <CardDescription>
                  Pedido de revogação de prisão preventiva ou relaxamento de flagrante.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card
              className="hover:border-red-400 hover:shadow-md transition-all cursor-pointer"
              onClick={() => setTemplate('Resposta à Acusação')}
            >
              <CardHeader>
                <CardTitle className="text-base">Resposta à Acusação</CardTitle>
                <CardDescription>Defesa preliminar do artigo 396-A do CPP.</CardDescription>
              </CardHeader>
            </Card>
          </div>

          <div className="space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2 text-blue-800">
              <Scale className="h-5 w-5" /> Área Cível
            </h2>
            <Card
              className="hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
              onClick={() => setTemplate('Petição Inicial')}
            >
              <CardHeader>
                <CardTitle className="text-base">Petição Inicial</CardTitle>
                <CardDescription>
                  Modelo padrão para ações indenizatórias e cobranças.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card
              className="hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
              onClick={() => setTemplate('Contestação')}
            >
              <CardHeader>
                <CardTitle className="text-base">Contestação</CardTitle>
                <CardDescription>Defesa padrão no rito ordinário do CPC.</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  const renderPreview = () => {
    return (
      <div className="legal-document">
        <p className="text-center font-bold mb-12 uppercase">
          EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA {formData.vara || '[VARA]'} DA COMARCA DE{' '}
          {formData.comarca || '[COMARCA]'}
        </p>

        <p className="mt-8">
          <strong>{formData.cliente || '[NOME DO CLIENTE]'}</strong>, devidamente qualificado nos
          autos do processo em epígrafe, vem, mui respeitosamente, à presença de Vossa Excelência,
          por intermédio de seu advogado que esta subscreve, apresentar a presente
        </p>

        <p className="text-center font-bold uppercase my-10 text-lg">{template}</p>

        <p>pelos motivos de fato e de direito a seguir aduzidos.</p>

        <h3 className="font-bold uppercase mt-8 mb-4">I. DOS FATOS</h3>
        <p className="whitespace-pre-wrap">
          {formData.fatos || 'Breve relato dos fatos articulados pela acusação/autor...'}
        </p>

        <h3 className="font-bold uppercase mt-8 mb-4">II. DO DIREITO</h3>
        <p>
          O direito pátrio, bem como a mais balizada jurisprudência, amparam a pretensão ora
          deduzida.
        </p>

        {clippedCases.length > 0 && (
          <div className="mt-6 ml-8 border-l-4 border-slate-300 pl-6 italic text-sm text-slate-700">
            {clippedCases.map((c) => (
              <div key={c.id} className="mb-4">
                <p>"{c.ementa}"</p>
                <p className="mt-1 font-semibold">
                  ({c.tribunal}, Relator: {c.relator}, Ano: {c.ano})
                </p>
              </div>
            ))}
          </div>
        )}

        <h3 className="font-bold uppercase mt-8 mb-4">III. DOS PEDIDOS</h3>
        <p className="whitespace-pre-wrap">
          {formData.pedidos || 'Ante o exposto, requer a Vossa Excelência...'}
        </p>

        <div className="mt-20 text-center">
          <p>Termos em que,</p>
          <p>Pede Deferimento.</p>
          <p className="mt-4">
            {formData.comarca || 'São Paulo'}, {new Date().toLocaleDateString('pt-BR')}.
          </p>

          <div className="mt-16 w-64 border-t border-black mx-auto pt-2">
            <p className="font-bold">Dr. Alberto Souza</p>
            <p>OAB/SP 123.456</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col xl:flex-row gap-6 animate-fade-in">
      {/* Esquerda: Formulário (Stepper) */}
      <div className="w-full xl:w-1/3 flex flex-col bg-card rounded-lg border shadow-sm h-[calc(100vh-8rem)]">
        <div className="p-6 border-b flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setTemplate(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="font-bold text-lg">{template}</h2>
            <p className="text-sm text-muted-foreground">Passo {step} de 3</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-4 animate-fade-in-up">
              <h3 className="font-semibold mb-4">Qualificação e Endereçamento</h3>
              <div className="space-y-2">
                <Label>Nome do Cliente / Paciente</Label>
                <Input
                  name="cliente"
                  value={formData.cliente}
                  onChange={handleChange}
                  placeholder="Ex: João da Silva"
                />
              </div>
              <div className="space-y-2">
                <Label>Comarca</Label>
                <Input
                  name="comarca"
                  value={formData.comarca}
                  onChange={handleChange}
                  placeholder="Ex: São Paulo - SP"
                />
              </div>
              <div className="space-y-2">
                <Label>Vara / Juízo</Label>
                <Input
                  name="vara"
                  value={formData.vara}
                  onChange={handleChange}
                  placeholder="Ex: 1ª Vara Criminal"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fade-in-up">
              <h3 className="font-semibold mb-4">Fatos e Pedidos</h3>
              <div className="space-y-2">
                <Label>Relato dos Fatos</Label>
                <Textarea
                  name="fatos"
                  value={formData.fatos}
                  onChange={handleChange}
                  className="min-h-[150px]"
                  placeholder="Descreva a situação fática de forma objetiva..."
                />
              </div>
              <div className="space-y-2">
                <Label>Pedidos Específicos</Label>
                <Textarea
                  name="pedidos"
                  value={formData.pedidos}
                  onChange={handleChange}
                  className="min-h-[100px]"
                  placeholder="Ex: a) A concessão da ordem para relaxamento da prisão..."
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-fade-in-up">
              <h3 className="font-semibold mb-4">Jurisprudência Clipada</h3>
              <p className="text-sm text-muted-foreground mb-4">
                As decisões abaixo serão inseridas automaticamente na seção "Do Direito".
              </p>

              {clippedCases.length === 0 ? (
                <div className="text-center p-6 border border-dashed rounded-lg bg-slate-50">
                  <Quote className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhuma jurisprudência adicionada.
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-2"
                    onClick={() => window.open('/jurisprudencia', '_blank')}
                  >
                    Buscar Jurisprudência
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {clippedCases.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 border rounded-md bg-slate-50 text-sm relative group pr-10"
                    >
                      <p className="font-medium line-clamp-2">{c.ementa}</p>
                      <span className="text-xs text-muted-foreground">{c.tribunal}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeCase(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t flex justify-between bg-muted/20">
          <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 1}>
            Anterior
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)}>
              Próximo <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={() => {
                toast({
                  title: 'Minuta Finalizada!',
                  description: 'Documento salvo em seus rascunhos.',
                })
              }}
            >
              Finalizar Minuta
            </Button>
          )}
        </div>
      </div>

      {/* Direita: Preview (A4) */}
      <div className="w-full xl:w-2/3 bg-slate-200/50 rounded-lg border shadow-inner p-4 overflow-y-auto h-[calc(100vh-8rem)] relative">
        <div className="absolute top-6 right-8 flex gap-2 z-10">
          <Badge variant="outline" className="bg-white text-xs">
            Preview em Tempo Real
          </Badge>
        </div>
        {renderPreview()}
      </div>
    </div>
  )
}
