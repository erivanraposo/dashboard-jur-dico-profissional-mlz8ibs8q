import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FileText,
  ArrowLeft,
  ArrowRight,
  Gavel,
  Scale,
  Save,
  Download,
  Sparkles,
  Printer,
  CheckCircle2,
} from 'lucide-react'
import useLegalStore from '@/stores/use-legal-store'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { RichTextEditor } from '@/components/RichTextEditor'

type TemplateType =
  | 'Habeas Corpus'
  | 'Resposta à Acusação'
  | 'Petição Inicial'
  | 'Contestação'
  | null

export default function GeradorMinutas() {
  const [template, setTemplate] = useState<TemplateType>(null)
  const [step, setStep] = useState(1)
  const { clippedCases } = useLegalStore()
  const { toast } = useToast()

  const [lawyers, setLawyers] = useState<any[]>([])
  const [selectedLawyerId, setSelectedLawyerId] = useState<string>('')

  const [editorContent, setEditorContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState<
    'idle' | 'analyzing' | 'completed' | 'applying' | 'applied'
  >('idle')
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  const [agents, setAgents] = useState<any[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')

  const [formData, setFormData] = useState({
    cliente: '',
    comarca: '',
    vara: '',
    fatos: '',
    pedidos: '',
  })

  useEffect(() => {
    supabase
      .from('lawyers')
      .select('*')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setLawyers(data)
          setSelectedLawyerId(data[0].id)
        }
      })

    supabase
      .from('agentes')
      .select('*')
      .eq('is_active', true)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setAgents(data)
          const defaultAgent = data.find((a) => a.name === 'revisao-peticao')
          if (defaultAgent) {
            setSelectedAgentId(defaultAgent.id)
          } else {
            setSelectedAgentId(data[0].id)
          }
        }
      })
  }, [])

  useEffect(() => {
    if (step === 3 && !editorContent) {
      const lawyer = lawyers.find((l) => l.id === selectedLawyerId)
      const html = `
        <p style="text-align: center; font-weight: bold; text-transform: uppercase;">
          EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA ${formData.vara || '[VARA]'} DA COMARCA DE ${formData.comarca || '[COMARCA]'}
        </p>
        <br/><br/>
        <p><strong>${formData.cliente || '[NOME DO CLIENTE]'}</strong>, devidamente qualificado nos autos do processo em epígrafe, vem, mui respeitosamente, à presença de Vossa Excelência, apresentar a presente</p>
        <p style="text-align: center; font-weight: bold; text-transform: uppercase; margin: 2rem 0; font-size: 1.25rem;">${template}</p>
        <p>pelos motivos de fato e de direito a seguir aduzidos.</p>
        <h3>I. DOS FATOS</h3>
        <p>${formData.fatos.replace(/\n/g, '<br/>')}</p>
        <h3>II. DO DIREITO</h3>
        <p>O direito pátrio ampara a pretensão ora deduzida.</p>
        ${clippedCases.map((c) => `<blockquote>"${c.ementa}" (${c.tribunal}, Relator: ${c.relator}, Ano: ${c.ano})</blockquote>`).join('')}
        <h3>III. DOS PEDIDOS</h3>
        <p>${formData.pedidos.replace(/\n/g, '<br/>')}</p>
        <br/><br/>
        <p style="text-align: center;">Termos em que,<br/>Pede Deferimento.</p>
        <p style="text-align: center; margin-top: 1rem;">${formData.comarca || 'Cidade'}, ${new Date().toLocaleDateString('pt-BR')}</p>
        <br/><br/>
        <div style="text-align: center; border-top: 1px solid black; width: 300px; margin: 0 auto; padding-top: 10px;">
          <p><strong>${lawyer?.full_name || 'Advogado'}</strong></p>
          <p>${lawyer?.oab_number || 'OAB'}</p>
        </div>
      `
      setEditorContent(html)
    }
  }, [step, template, formData, clippedCases, lawyers, selectedLawyerId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSave = async () => {
    setIsSaving(true)
    const { error } = await supabase.from('minutes').insert({
      lawyer_id: selectedLawyerId,
      title: `Minuta - ${template} - ${formData.cliente}`,
      content: editorContent,
      status: 'Draft',
    })

    setIsSaving(false)
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' })
    } else {
      setLastSaved(new Date())
      toast({ title: 'Minuta salva com sucesso!', description: 'Sincronizada no banco de dados.' })
    }
  }

  const handleAnalyzeAI = async () => {
    if (!selectedAgentId) {
      toast({
        title: 'Atenção',
        description: 'Selecione um agente de IA primeiro.',
        variant: 'destructive',
      })
      return
    }
    setAnalysisStatus('analyzing')
    setAiSuggestions([])
    try {
      const selectedAgent = agents.find((a) => a.id === selectedAgentId)

      const { data, error } = await supabase.functions.invoke('analyze-legal-text', {
        body: {
          content: editorContent,
          agent_id: selectedAgentId,
          system_prompt: selectedAgent?.system_prompt,
          model: selectedAgent?.model,
        },
      })

      if (error) {
        let errorMessage = error.message
        if (error.name === 'FunctionsHttpError' && (error as any).context) {
          try {
            const body = await (error as any).context.json()
            if (body && body.error) errorMessage = body.error
          } catch {
            // keep default message
          }
        }
        throw new Error(errorMessage)
      }

      if (data?.suggestions) {
        setAiSuggestions(data.suggestions)
        setAnalysisStatus('completed')
        toast({ title: 'Análise Concluída', description: 'Veja as sugestões na aba lateral.' })
      }
    } catch (err: any) {
      let msg = err.message || 'Ocorreu um erro ao processar a requisição'
      const lowerMsg = msg.toLowerCase()

      if (
        lowerMsg.includes('model not found') ||
        lowerMsg.includes('does not exist') ||
        lowerMsg.includes('invalid model')
      ) {
        msg = 'O modelo de IA selecionado não está disponível. Por favor, contate o suporte.'
      } else if (
        lowerMsg.includes('balance') ||
        lowerMsg.includes('credit') ||
        lowerMsg.includes('billing')
      ) {
        msg = 'Saldo insuficiente para realizar esta operação. Verifique seus créditos.'
      }

      toast({
        title: 'Erro na IA',
        description: msg,
        variant: 'destructive',
      })
      setAnalysisStatus('idle')
    }
  }

  const handleApplySuggestions = async () => {
    if (!selectedAgentId || aiSuggestions.length === 0) return

    setAnalysisStatus('applying')
    try {
      const selectedAgent = agents.find((a) => a.id === selectedAgentId)

      const { data, error } = await supabase.functions.invoke('analyze-legal-text', {
        body: {
          content: editorContent,
          agent_id: selectedAgentId,
          system_prompt: selectedAgent?.system_prompt,
          model: selectedAgent?.model,
          action: 'apply',
          suggestions: aiSuggestions,
        },
      })

      if (error) throw new Error(error.message)

      if (data?.revised_content) {
        setEditorContent(data.revised_content)
        setAnalysisStatus('applied')
        toast({
          title: 'Sugestões Aplicadas',
          description: 'O documento foi atualizado com base nas sugestões da IA.',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao Aplicar',
        description: err.message || 'Falha ao aplicar sugestões.',
        variant: 'destructive',
      })
      setAnalysisStatus('completed')
    }
  }

  const exportDocx = () => {
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>Minuta</title></head><body>`
    const footer = '</body></html>'
    const sourceHTML = header + editorContent + footer
    const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Minuta_${template?.replace(/\s+/g, '_')}.doc`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!template) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto animate-fade-in no-print">
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
              className="hover:border-red-400 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => setTemplate('Habeas Corpus')}
            >
              <CardHeader>
                <CardTitle className="text-base group-hover:text-red-700 transition-colors">
                  Habeas Corpus
                </CardTitle>
                <CardDescription>
                  Pedido de revogação de prisão preventiva ou relaxamento de flagrante.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card
              className="hover:border-red-400 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => setTemplate('Resposta à Acusação')}
            >
              <CardHeader>
                <CardTitle className="text-base group-hover:text-red-700 transition-colors">
                  Resposta à Acusação
                </CardTitle>
                <CardDescription>Defesa preliminar do artigo 396-A do CPP.</CardDescription>
              </CardHeader>
            </Card>
          </div>

          <div className="space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2 text-blue-800">
              <Scale className="h-5 w-5" /> Área Cível
            </h2>
            <Card
              className="hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => setTemplate('Petição Inicial')}
            >
              <CardHeader>
                <CardTitle className="text-base group-hover:text-blue-700 transition-colors">
                  Petição Inicial
                </CardTitle>
                <CardDescription>
                  Modelo padrão para ações indenizatórias e cobranças.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card
              className="hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => setTemplate('Contestação')}
            >
              <CardHeader>
                <CardTitle className="text-base group-hover:text-blue-700 transition-colors">
                  Contestação
                </CardTitle>
                <CardDescription>Defesa padrão no rito ordinário do CPC.</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (step === 3) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] animate-fade-in print:h-auto print:block">
        <div className="flex items-center justify-between mb-4 no-print">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setStep(2)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h2 className="font-bold text-lg">{template} - Editor Avançado</h2>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {lastSaved ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-green-500" /> Salvo em{' '}
                    {lastSaved.toLocaleTimeString()}
                  </>
                ) : (
                  'Rascunho não salvo'
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="hidden sm:block">
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Agente IA" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.titulo || a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={handleAnalyzeAI}
              disabled={
                analysisStatus === 'analyzing' || analysisStatus === 'applying' || !selectedAgentId
              }
              className="gap-2"
            >
              <Sparkles className="h-4 w-4 text-purple-500" />
              {analysisStatus === 'analyzing' ? 'Analisando...' : 'Revisão IA'}
            </Button>
            <Button
              variant="outline"
              onClick={exportDocx}
              className="gap-2"
              title="Exportar para DOCX"
            >
              <Download className="h-4 w-4" /> Exportar para DOCX
            </Button>
            <Button
              variant="outline"
              onClick={() => window.print()}
              className="gap-2"
              title="Exportar para PDF"
            >
              <Printer className="h-4 w-4" /> Exportar para PDF
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              <Save className="h-4 w-4" /> {isSaving ? 'Salvando...' : 'Salvar no Banco'}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 gap-6 overflow-hidden print:block print:overflow-visible">
          <div className="flex-1 overflow-hidden rounded-lg shadow-sm border print:border-none print:shadow-none bg-slate-200 p-4 print:p-0 print:bg-white flex flex-col items-center">
            <div className="w-full max-w-4xl h-full flex flex-col print:max-w-none">
              <div className="print-area h-full flex flex-col">
                <RichTextEditor value={editorContent} onChange={setEditorContent} />
              </div>
            </div>
          </div>

          {aiSuggestions.length > 0 && (
            <div className="w-80 overflow-y-auto border rounded-lg bg-card p-4 space-y-4 no-print animate-fade-in-right flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2 text-purple-700">
                  <Sparkles className="h-4 w-4" /> Sugestões da IA
                </h3>
              </div>

              {(analysisStatus === 'completed' || analysisStatus === 'applied') && (
                <div className="flex gap-2">
                  {analysisStatus === 'completed' && (
                    <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                      Análise Concluída
                    </span>
                  )}
                  {analysisStatus === 'applied' && (
                    <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                      Modificações Aplicadas
                    </span>
                  )}
                </div>
              )}

              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {aiSuggestions.map((sug, i) => (
                  <div
                    key={i}
                    className="p-3 bg-purple-50/80 border border-purple-100 rounded-md text-sm text-slate-700 leading-relaxed shadow-sm"
                  >
                    {sug}
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t flex flex-col gap-2 mt-auto">
                <Button
                  className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
                  onClick={handleApplySuggestions}
                  disabled={analysisStatus === 'applying' || analysisStatus === 'applied'}
                >
                  {analysisStatus === 'applying' ? (
                    'Aplicando...'
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      {analysisStatus === 'applied' ? 'Sugestões Aplicadas' : 'Aplicar Sugestões'}
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-xs text-muted-foreground"
                  onClick={() => {
                    setAiSuggestions([])
                    setAnalysisStatus('idle')
                  }}
                  disabled={analysisStatus === 'applying'}
                >
                  Dispensar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col xl:flex-row gap-6 animate-fade-in no-print">
      <div className="w-full xl:w-1/2 flex flex-col bg-card rounded-lg border shadow-sm h-[calc(100vh-8rem)] mx-auto">
        <div className="p-6 border-b flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (step > 1 ? setStep(step - 1) : setTemplate(null))}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="font-bold text-lg">{template}</h2>
            <p className="text-sm text-muted-foreground">Passo {step} de 2 - Configuração</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-4 animate-fade-in-up">
              <h3 className="font-semibold mb-4">Qualificação e Assinatura</h3>
              <div className="space-y-2">
                <Label>Nome do Cliente / Paciente</Label>
                <Input
                  name="cliente"
                  value={formData.cliente}
                  onChange={handleChange}
                  placeholder="Ex: João da Silva"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
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

              <div className="space-y-3 pt-6 border-t mt-6">
                <Label className="text-base font-semibold">Assinatura do Documento</Label>
                <Select value={selectedLawyerId} onValueChange={setSelectedLawyerId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o advogado" />
                  </SelectTrigger>
                  <SelectContent>
                    {lawyers.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.full_name} ({l.oab_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
        </div>

        <div className="p-6 border-t flex justify-end bg-muted/20">
          <Button onClick={() => setStep(step + 1)}>
            {step === 2 ? 'Ir para o Editor' : 'Próximo'} <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  )
}
