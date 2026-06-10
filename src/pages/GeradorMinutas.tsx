import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RichTextEditor } from '@/components/RichTextEditor'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import {
  Loader2,
  Wand2,
  Check,
  Sparkles,
  FolderOpen,
  FileText,
  X,
  Upload,
  ChevronsUpDown,
  Save,
  Download,
  LayoutTemplate,
  Plus,
  Trash2,
  MoreHorizontal,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Maximize2, Minimize2, PanelRightClose, PanelRightOpen } from 'lucide-react'
import pdfMake from 'pdfmake/build/pdfmake'
import * as _pdfFonts from 'pdfmake/build/vfs_fonts'
import htmlToPdfmake from 'html-to-pdfmake'

;(pdfMake as any).vfs =
  (_pdfFonts as any).pdfMake?.vfs ||
  (_pdfFonts as any).vfs ||
  (_pdfFonts as any).default?.pdfMake?.vfs ||
  (_pdfFonts as any).default?.vfs ||
  (pdfMake as any).vfs

if (!(pdfMake as any).vfs || Object.keys((pdfMake as any).vfs).length === 0) {
  console.error('[pdfmake] VFS não foi carregado — verifique o import de vfs_fonts')
}

const extractCoverHtml = (html: string): string | null => {
  if (!html) return null
  const m = html.match(/<div[^>]*class=["']cover-page["'][^>]*>([\s\S]*?)<\/div>/i)
  return m ? m[1] : null
}

const extractTitleFromCover = (coverHtmlInner: string | null): string | null => {
  if (!coverHtmlInner) return null
  const m = coverHtmlInner.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (!m) return null
  return (
    m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .trim() || null
  )
}

const htmlToPlain = (html: string): string => {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const ACTION_VERBS = [
  'emitir',
  'pagar',
  'cumprir',
  'realizar',
  'efetuar',
  'apresentar',
  'aguardar',
  'verificar',
  'monitorar',
  'notificar',
  'comparecer',
  'depositar',
  'recolher',
  'juntar',
  'protocolar',
  'encaminhar',
  'designar',
]

const looksLikeAction = (text: string): boolean => {
  if (!text) return false
  const firstWord = text.trim().split(' ')[0].toLowerCase()
  return ACTION_VERBS.includes(firstWord)
}

const extractFromText = (text: string, pattern: RegExp): string | null => {
  if (!text) return null
  const m = text.match(pattern)
  return m ? m[1].trim() : null
}

const extractMetadata = (min: any, proc: any, rawContent: string) => {
  const coverHtml = extractCoverHtml(rawContent) || ''
  const coverPlain = htmlToPlain(coverHtml)
  const fullPlain = htmlToPlain(rawContent)

  const processRegex =
    /(?:Processo|Ação Penal|Execução(?:\s+Penal)?)[\s:n°ºNo.]*([\d]{4,7}[-.]?[\d]{1,2}[-.]?[\d]{4}[-.]?[\d][-.]?[\d]{2}[-.]?[\d]{4})/i
  const clientRegex = /Cliente[\s:]+([^[<\n]+?)(?:\s+\(|\s+CPF|\s+Data|\s+LexControl|$)/i

  const procNumForCover =
    proc?.case_number ||
    extractFromText(coverPlain, processRegex) ||
    extractFromText(fullPlain, processRegex)

  let extractedClient = extractFromText(coverPlain, clientRegex)
  if (extractedClient && looksLikeAction(extractedClient)) {
    extractedClient = null
  }

  const clientForCoverSafe = min?.client_name || proc?.client_name || extractedClient || null

  return { procNumForCover, clientForCoverSafe }
}

const MINUTE_TYPES = [
  'Petição Inicial',
  'Contestação',
  'Réplica',
  'Alegações Finais',
  'Recurso de Apelação',
  'Agravo de Instrumento',
  'Relatório de Caso',
  'Parecer Jurídico',
  'Outros',
]

export default function GeradorMinutas() {
  const defaultContent =
    '<h1>Nova Peça Jurídica</h1><p>Inicie a redação do seu documento aqui...</p>'
  const [content, setContent] = useState(defaultContent)
  const [minuteId, setMinuteId] = useState<string | null>(null)

  useEffect(() => {
    const savedDraft = localStorage.getItem('lexcontrol_gerador_draft')
    if (savedDraft && savedDraft !== defaultContent) {
      setContent(savedDraft)
    }
  }, [])

  const handleContentChange = (val: string) => {
    setContent(val)
    localStorage.setItem('lexcontrol_gerador_draft', val)
  }
  const [agents, setAgents] = useState<any[]>([])
  const [processes, setProcesses] = useState<any[]>([])
  const [lawyers, setLawyers] = useState<any[]>([])
  const [selectedLawyer, setSelectedLawyer] = useState<string>('none')
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [selectedProcess, setSelectedProcess] = useState<string>('none')
  const [minuteType, setMinuteType] = useState<string>('')
  const [attachments, setAttachments] = useState<{ name: string; path: string }[]>([])

  const [clientName, setClientName] = useState('')
  const [comarca, setComarca] = useState('')
  const [objeto, setObjeto] = useState('')
  const [pedido, setPedido] = useState('')

  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [progressStatus, setProgressStatus] = useState<string>('')

  const [processOpen, setProcessOpen] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [activeTab, setActiveTab] = useState('config')

  const { toast } = useToast()

  const handleClearEditor = () => {
    if (window.confirm('Descartar o conteúdo atual do editor e começar do zero?')) {
      setContent(defaultContent)
      localStorage.removeItem('lexcontrol_gerador_draft')
      setMinuteId(null)
      setSuggestions([])
      toast({
        title: 'Editor limpo',
        description: 'Você pode começar uma nova minuta agora.',
      })
    }
  }

  const handleNovaMinuta = () => {
    if (content && content !== defaultContent && content !== '') {
      if (
        !window.confirm(
          'Você tem alterações não salvas. Deseja realmente iniciar uma nova minuta e descartar o conteúdo atual?',
        )
      ) {
        return
      }
    }
    setContent(defaultContent)
    setSelectedProcess('none')
    setSelectedAgents([])
    setAttachments([])
    setSuggestions([])
    setMinuteId(null)
    setMinuteType('')
    setClientName('')
    setComarca('')
    setObjeto('')
    setPedido('')
    localStorage.removeItem('lexcontrol_gerador_draft')
    toast({ title: 'Nova minuta iniciada' })
  }

  useEffect(() => {
    async function loadData() {
      const [{ data: agentsData }, { data: procsData }, { data: lawyersData }] = await Promise.all([
        supabase.from('agentes').select('*').eq('is_active', true),
        supabase.from('processes').select('id, case_number, client_name, area, description'),
        supabase.from('lawyers').select('id, full_name, oab_number'),
      ])

      if (agentsData) setAgents(agentsData)
      if (procsData) setProcesses(procsData)
      if (lawyersData) setLawyers(lawyersData)
    }
    loadData()
  }, [])

  useEffect(() => {
    if (selectedProcess !== 'none') {
      const proc = processes.find((p) => p.id === selectedProcess)
      if (proc && !clientName) setClientName(proc.client_name)
    }
  }, [selectedProcess])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado.')

      const newAttachments = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]

        if (file.name.toLowerCase().endsWith('.pdf') && file.size > 50 * 1024 * 1024) {
          toast({
            title: 'Arquivo muito grande',
            description:
              'Arquivo muito grande. Por favor, divida o PDF em partes menores para análise.',
            variant: 'destructive',
          })
          continue
        }

        const filePath = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

        const { error: uploadError } = await supabase.storage
          .from('process-attachments')
          .upload(filePath, file)
        if (uploadError) throw uploadError

        const attachmentData = {
          file_name: file.name,
          file_path: filePath,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
          process_id: selectedProcess !== 'none' ? selectedProcess : null,
        }

        await supabase.from('process_attachments').insert(attachmentData)
        newAttachments.push({ name: file.name, path: filePath })
      }

      setAttachments((prev) => [...prev, ...newAttachments])
      toast({
        title: 'Sucesso',
        description: `${files.length} documento(s) anexado(s) com sucesso.`,
      })
    } catch (error: any) {
      toast({
        title: 'Erro ao anexar',
        description: `Falha ao fazer upload: ${error.message || 'Erro desconhecido'}`,
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  const removeAttachment = (path: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== path))
  }

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
    )
  }

  const getProcessContext = () => {
    if (selectedProcess === 'none') return null
    const proc = processes.find((p) => p.id === selectedProcess)
    if (!proc) return null
    return `Processo: ${proc.case_number} - Cliente: ${proc.client_name}\nÁrea: ${proc.area}\nDescrição: ${proc.description || 'N/A'}`
  }

  const handleAnalyze = async () => {
    const hasAttachments = attachments.length > 0
    const hasProcessContext = selectedProcess !== 'none'
    const hasContent = content && content.length >= 10 && content !== defaultContent

    if (!hasContent && !hasAttachments && !hasProcessContext) {
      return toast({
        title: 'Atenção',
        description: 'Adicione algum conteúdo, anexo ou selecione um processo para análise.',
        variant: 'destructive',
      })
    }
    if (!minuteType) {
      return toast({
        title: 'Atenção',
        description: 'Selecione o Tipo de Minuta.',
        variant: 'destructive',
      })
    }
    if (selectedAgents.length === 0) {
      return toast({
        title: 'Atenção',
        description: 'Selecione pelo menos um Agente de IA.',
        variant: 'destructive',
      })
    }

    setLoading(true)
    setProgressStatus('Iniciando análise com IA...')
    setSuggestions([])

    try {
      const invocation_id = crypto.randomUUID()
      const processCtx = getProcessContext()

      const hasValidContent = content && content.trim().length >= 10 && content !== defaultContent
      const payloadContent = hasValidContent
        ? content
        : `<p>Solicitação de análise de documentos anexados. Tipo de minuta: ${minuteType}.</p>`

      const bodyPayload: any = {
        invocation_id,
        content: payloadContent,
        agent_ids: selectedAgents,
        action: 'analyze',
        minute_type: minuteType,
        attachment_paths: attachments.map((a) => a.path),
        metadata: { client: clientName, comarca, objeto, pedido },
        model: 'claude-sonnet-4-6',
      }

      if (selectedProcess !== 'none') {
        bodyPayload.process_id = selectedProcess
        if (processCtx) bodyPayload.process_context = processCtx
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('Não autenticado')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${supabaseUrl}/functions/v1/analyze-legal-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(bodyPayload),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error(`Raw response from AI (Diagnostic ID: ${invocation_id}):`, errText)
        let parsedErr: any = {}
        try {
          parsedErr = JSON.parse(errText)
        } catch {
          /* intentionally ignored */
        }
        throw new Error(
          JSON.stringify({
            message:
              parsedErr.error || errText || `Falha na comunicação com a API. Status: ${res.status}`,
            invocation_id: parsedErr.invocation_id || invocation_id,
            diagnostic_log: parsedErr.diagnostic_log || errText,
          }),
        )
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let receivedSuggestions = false

      while (true) {
        const { done, value } = await reader!.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim()
            if (dataStr === '[DONE]') continue
            try {
              const data = JSON.parse(dataStr)
              if (data.type === 'ping') continue
              if (data.status) setProgressStatus(data.status)
              if (data.error) {
                console.error(
                  `Stream error response (Diagnostic ID: ${invocation_id}):`,
                  data.error,
                )
                throw new Error(data.error)
              }
              if (data.type === 'suggestions') {
                const suggs = data.data?.suggestions || data.data?.sugerir_secoes || []
                if (suggs && Array.isArray(suggs) && suggs.length > 0) {
                  setSuggestions(suggs)
                  receivedSuggestions = true
                } else {
                  throw new Error('A IA não retornou conteúdo')
                }
              }
            } catch (e: any) {
              if (e.message && e.message !== 'Unexpected end of JSON input') throw e
            }
          }
        }
      }

      if (!receivedSuggestions) {
        throw new Error(
          JSON.stringify({
            message: 'A IA não retornou conteúdo',
            invocation_id,
          }),
        )
      }

      toast({ title: 'Análise concluída', description: 'Sugestões geradas com sucesso.' })
    } catch (err: any) {
      console.error('Analyze error:', err)
      let errorMsg = err.message || 'Falha desconhecida de conexão.'
      let isNotFoundError = false
      let diagId = ''

      let diagnosticLog = ''
      try {
        const parsedErr = JSON.parse(err.message)
        if (parsedErr.invocation_id) diagId = parsedErr.invocation_id
        if (parsedErr.diagnostic_log) diagnosticLog = parsedErr.diagnostic_log
        if (parsedErr.error && parsedErr.error.message) {
          errorMsg = `Erro da API (${parsedErr.error.type}): ${parsedErr.error.message}`
          if (parsedErr.error.type === 'not_found_error') isNotFoundError = true
        } else if (parsedErr.message) {
          errorMsg = parsedErr.message
        }
        if (typeof parsedErr.error === 'string') {
          errorMsg = parsedErr.error
        }
      } catch (e) {
        // Not a JSON error
        if (err.message?.includes('not_found_error')) isNotFoundError = true
      }

      if (err.name === 'AbortError')
        errorMsg = 'Tempo limite excedido (Timeout). A requisição demorou muito para responder.'
      else if (err.message?.includes('fetch')) errorMsg = 'Erro de rede. Verifique sua conexão.'

      if (isNotFoundError) {
        errorMsg =
          'Modelo de IA não encontrado (Model Not Found). A configuração foi ajustada, por favor tente novamente.'
      }
      if (
        errorMsg.includes('EMPTY_RESPONSE') ||
        err.message?.includes('EMPTY_RESPONSE') ||
        errorMsg.includes('vazia ou malformada') ||
        errorMsg.includes('A IA não retornou conteúdo')
      ) {
        errorMsg = 'A IA não retornou conteúdo'
      }

      const errorDesc = diagnosticLog ? `${errorMsg} \nDetalhes: ${diagnosticLog}` : errorMsg

      toast({
        title: 'Falha na Análise',
        description: `${errorDesc}${diagId ? ` (ID Diagnóstico: ${diagId})` : ''}`,
        variant: 'destructive',
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Force bypassing cache / state by calling with same params immediately
              setTimeout(() => handleAnalyze(), 0)
            }}
          >
            Tentar Novamente
          </Button>
        ),
      })
    } finally {
      setLoading(false)
      setProgressStatus('')
    }
  }

  const [originalContentForRetry, setOriginalContentForRetry] = useState('')
  const suggestionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (suggestions.length > 0) {
      setActiveTab('ai')
      setTimeout(() => {
        suggestionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 150)
    }
  }, [suggestions])

  const handleApplySuggestions = async (
    retryContent?: string,
    isResume = false,
    contentSoFarStr = '',
    retryCount = 0,
  ) => {
    const contentToProcess = retryContent || content
    if (!contentToProcess || suggestions.length === 0 || selectedAgents.length === 0) return

    if (retryCount === 0 && !isResume) {
      setApplying(true)
    }
    setProgressStatus(
      isResume
        ? retryCount > 0
          ? `Reconectando... (Tentativa ${retryCount}/3)`
          : `Processando próximo lote de texto...`
        : 'Escrevendo...',
    )
    const originalContent = contentToProcess
    if (!retryContent && !isResume) setOriginalContentForRetry(originalContent)

    let accumulatedContent = contentSoFarStr
    let hasStartedStreaming = false

    let currentMinuteId = minuteId
    const invocation_id = crypto.randomUUID()

    try {
      // Create or save draft first to enable incremental saving
      if (!currentMinuteId && !isResume) {
        currentMinuteId = (await handleSave(originalContent, true)) as string
      }
      const processCtx = getProcessContext()

      const bodyPayload: any = {
        invocation_id,
        minute_id: currentMinuteId,
        content: originalContent,
        content_so_far: contentSoFarStr,
        agent_ids: selectedAgents,
        action: 'apply',
        suggestions,
        minute_type: minuteType,
        attachment_paths: attachments.map((a) => a.path),
        metadata: { client: clientName, comarca, objeto, pedido },
        model: 'claude-sonnet-4-6',
      }

      if (selectedProcess !== 'none') {
        bodyPayload.process_id = selectedProcess
        if (processCtx) bodyPayload.process_context = processCtx
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('Não autenticado')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${supabaseUrl}/functions/v1/analyze-legal-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(bodyPayload),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error(`Raw response from AI (Diagnostic ID: ${invocation_id}):`, errText)
        let parsedErr: any = {}
        try {
          parsedErr = JSON.parse(errText)
        } catch {
          /* intentionally ignored */
        }
        throw new Error(
          JSON.stringify({
            message:
              parsedErr.error || errText || `Erro ${res.status}: falha na comunicação com a API.`,
            invocation_id: parsedErr.invocation_id || invocation_id,
            diagnostic_log: parsedErr.diagnostic_log || errText,
          }),
        )
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let lastSaveTime = Date.now()
      let needsContinue = false

      while (true) {
        const { done, value } = await reader!.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim()
            if (dataStr === '[DONE]') continue
            try {
              const data = JSON.parse(dataStr)
              if (data.type === 'ping') continue
              if (data.status) setProgressStatus(data.status)
              if (data.error) {
                console.error(
                  `Stream error response (Diagnostic ID: ${invocation_id}):`,
                  data.error,
                )
                throw new Error(data.error)
              }
              if (data.type === 'minute_created') {
                setMinuteId(data.minute_id)
                currentMinuteId = data.minute_id
              }
              if (data.type === 'continue_required') {
                needsContinue = true
              }
              if (data.text) {
                if (!hasStartedStreaming) {
                  hasStartedStreaming = true
                  if (!isResume && contentSoFarStr === '') {
                    accumulatedContent = ''
                  }
                  setContent('')
                }
                accumulatedContent += data.text
                setContent(accumulatedContent)
                localStorage.setItem('lexcontrol_gerador_draft', accumulatedContent)

                // Incremental Persistence is now handled by the Edge Function
                // We keep a lightweight local sync just in case, every 5 seconds
                if (currentMinuteId && Date.now() - lastSaveTime > 5000) {
                  lastSaveTime = Date.now()
                  supabase
                    .from('minutes')
                    .update({
                      content: accumulatedContent,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', currentMinuteId)
                    .then()
                }
              }
            } catch (e: any) {
              if (e.message && e.message !== 'Unexpected end of JSON input') throw e
            }
          }
        }
      }

      if (needsContinue) {
        // Automatically trigger the next chunk (Polled-Batching)
        return handleApplySuggestions(
          originalContentForRetry || originalContent,
          true,
          accumulatedContent,
          0,
        )
      }

      if (!accumulatedContent || accumulatedContent.trim() === '') {
        throw new Error(
          JSON.stringify({
            message:
              'A IA não gerou texto novo. Tente novamente, simplifique as sugestões selecionadas, ou reduza o tamanho dos anexos.',
            invocation_id,
          }),
        )
      }

      let revised_content = accumulatedContent.replace('<!-- END_OF_DOCUMENT -->', '')

      // Sync the content directly from database before finalizing
      if (currentMinuteId) {
        try {
          const { data: dbMinute } = await supabase
            .from('minutes')
            .select('content')
            .eq('id', currentMinuteId)
            .single()

          if (dbMinute?.content && dbMinute.content.length > 0) {
            revised_content = dbMinute.content.replace('<!-- END_OF_DOCUMENT -->', '')
            accumulatedContent = dbMinute.content
            setContent(revised_content)
            localStorage.setItem('lexcontrol_gerador_draft', revised_content)
          }
        } catch (dbSyncErr) {
          console.error('Failed to sync final content from database:', dbSyncErr)
        }
      }

      if (!revised_content || revised_content.trim() === '' || revised_content.length === 0) {
        throw new Error(
          JSON.stringify({
            message: 'A IA não retornou conteúdo',
            invocation_id,
          }),
        )
      }

      setContent(revised_content)
      localStorage.setItem('lexcontrol_gerador_draft', revised_content)

      setSuggestions([])

      // Final save to ensure complete document is persisted
      if (currentMinuteId) {
        await supabase
          .from('minutes')
          .update({
            content: revised_content,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentMinuteId)
      }

      const isSaved = await handleSave(revised_content, true, currentMinuteId)
      if (isSaved) {
        toast({
          title: 'Geração Concluída',
          description: 'Seu documento foi reescrito e salvo com sucesso.',
        })
      }
      setApplying(false)
      setProgressStatus('')
    } catch (err: any) {
      console.error('Streaming error caught:', err)

      let recoveredFromDB = false
      try {
        if (currentMinuteId) {
          const { data } = await supabase
            .from('minutes')
            .select('content')
            .eq('id', currentMinuteId)
            .single()

          if (data?.content && data.content.length > accumulatedContent.length) {
            accumulatedContent = data.content
            setContent(data.content)
            localStorage.setItem('lexcontrol_gerador_draft', data.content)
            recoveredFromDB = true
          }
        }
      } catch (dbErr) {
        // ignore db error during recovery attempt
      }

      if (
        recoveredFromDB &&
        (accumulatedContent.includes('<!-- END_OF_DOCUMENT -->') ||
          accumulatedContent.length > originalContent.length + 500)
      ) {
        setApplying(false)
        setProgressStatus('')
        toast({
          title: 'Conexão Restaurada',
          description: 'A resposta da IA foi recuperada com sucesso do servidor.',
        })
        return
      }

      let errorMsg = err.message || 'Falha desconhecida.'
      let isApiError = false
      let isNotFoundError = false
      let diagId = ''

      let diagnosticLog = ''
      try {
        const parsedErr = JSON.parse(err.message)
        if (parsedErr.invocation_id) diagId = parsedErr.invocation_id
        if (parsedErr.diagnostic_log) diagnosticLog = parsedErr.diagnostic_log
        if (parsedErr.error && parsedErr.error.message) {
          errorMsg = `Erro da API (${parsedErr.error.type}): ${parsedErr.error.message}`
          isApiError = true
          if (parsedErr.error.type === 'not_found_error') isNotFoundError = true
        } else if (parsedErr.message) {
          errorMsg = parsedErr.message
          isApiError = true
        }
        if (typeof parsedErr.error === 'string') {
          errorMsg = parsedErr.error
          isApiError = true
        }
      } catch (e) {
        // Not a JSON error
        if (err.message?.includes('not_found_error')) isNotFoundError = true
      }

      if (err.name === 'AbortError')
        errorMsg =
          'Tempo limite excedido (120s). O documento é muito longo ou o servidor demorou a responder.'
      else if (err.message?.includes('fetch') || err.message?.includes('NetworkError'))
        errorMsg = 'Erro de rede ao conectar com o servidor.'
      else if (err.message?.includes('401') || err.message?.includes('Não autenticado'))
        errorMsg = 'Problema de autenticação. Faça login novamente.'

      if (isNotFoundError) {
        errorMsg =
          'Modelo de IA não encontrado (Model Not Found). A configuração foi ajustada, por favor tente novamente.'
      }
      if (
        errorMsg.includes('EMPTY_RESPONSE') ||
        err.message?.includes('EMPTY_RESPONSE') ||
        errorMsg.includes('vazia ou malformada') ||
        errorMsg.includes('A IA não retornou conteúdo') ||
        errorMsg.includes('A IA não gerou texto novo')
      ) {
        errorMsg =
          'A IA não gerou texto novo. Tente novamente, simplifique as sugestões selecionadas, ou reduza o tamanho dos anexos.'
      }

      // Do not auto-retry if it's a known API structural error (like model not found or empty response)
      if (
        retryCount < 3 &&
        !err.message?.includes('401') &&
        !isApiError &&
        !err.message?.includes('EMPTY_RESPONSE') &&
        !errorMsg.includes('vazia ou malformada') &&
        !errorMsg.includes('A IA não retornou conteúdo') &&
        !errorMsg.includes('A IA não gerou texto novo')
      ) {
        setProgressStatus(
          `Conexão instável. Tentando reconectar (Tentativa ${retryCount + 1}/3)...`,
        )
        await new Promise((r) => setTimeout(r, 1000 * (retryCount + 1)))

        let latestContent = accumulatedContent
        if (minuteId) {
          try {
            const { data } = await supabase
              .from('minutes')
              .select('content')
              .eq('id', minuteId)
              .single()
            if (data?.content) latestContent = data.content
          } catch {
            /* intentionally ignored */
          }
        }

        return handleApplySuggestions(
          originalContentForRetry || originalContent,
          true,
          latestContent,
          retryCount + 1,
        )
      }

      const errorDesc = diagnosticLog ? `${errorMsg} \nDetalhes: ${diagnosticLog}` : errorMsg

      toast({
        title: 'Falha na Geração',
        description: `${errorDesc} A conexão foi interrompida.${diagId ? ` (ID Diagnóstico: ${diagId})` : ''}`,
        variant: 'destructive',
        action: (
          <div className="flex flex-col gap-2 w-full mt-2">
            <Button
              variant="secondary"
              size="sm"
              className="w-full text-xs bg-white/20 hover:bg-white/30 text-white border-0"
              onClick={async () => {
                try {
                  setApplying(true)
                  setProgressStatus('Recuperando...')
                  let targetId = currentMinuteId || minuteId
                  if (!targetId && diagId) {
                    const { data: searchData } = await supabase
                      .from('minutes')
                      .select('id')
                      .eq('invocation_id', diagId)
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .single()
                    if (searchData) targetId = searchData.id
                  }

                  if (targetId) {
                    const { data } = await supabase
                      .from('minutes')
                      .select('content')
                      .eq('id', targetId)
                      .single()
                    if (data?.content && data.content.length > 10) {
                      setContent(data.content)
                      setMinuteId(targetId)
                      toast({
                        title: 'Sucesso',
                        description: 'Conteúdo mais recente recuperado do banco de dados.',
                      })
                      return
                    }
                  }

                  toast({
                    title: 'Aviso',
                    description:
                      'Nenhum conteúdo salvo foi encontrado no banco de dados para essa sessão.',
                    variant: 'destructive',
                  })
                } catch (e) {
                  toast({
                    title: 'Erro',
                    description: 'Falha ao tentar recuperar do banco de dados.',
                    variant: 'destructive',
                  })
                } finally {
                  setApplying(false)
                  setProgressStatus('')
                }
              }}
            >
              Forçar Sincronização do Banco
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={async () => {
                await handleSave(accumulatedContent || originalContent)
                handleApplySuggestions(
                  originalContentForRetry || originalContent,
                  true,
                  accumulatedContent,
                  0,
                )
              }}
            >
              Tentar Novamente
            </Button>
          </div>
        ),
      })
      if (!accumulatedContent) {
        setContent(originalContent)
        localStorage.setItem('lexcontrol_gerador_draft', originalContent)
      }
      setApplying(false)
      setProgressStatus('')
    }
  }

  const handleSave = async (
    contentToSave = content,
    silent = false,
    explicitMinuteId?: string | null,
  ) => {
    if (!contentToSave || contentToSave.length < 20) {
      if (!silent) {
        toast({
          title: 'Atenção',
          description: 'O documento está vazio e não pode ser salvo.',
          variant: 'destructive',
        })
      }
      return false
    }

    if (!silent) setSaving(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      const title = minuteType
        ? `${minuteType} - ${new Date().toLocaleDateString()}`
        : `Nova Minuta - ${new Date().toLocaleDateString()}`
      const proc = processes.find((p) => p.id === selectedProcess)

      const payload: any = {
        title,
        content: contentToSave,
        status: 'Draft',
        process_id: selectedProcess !== 'none' ? selectedProcess : null,
        client_name: clientName || proc?.client_name || null,
        comarca: comarca || null,
        objeto: objeto || null,
        pedido: pedido || null,
        updated_at: new Date().toISOString(),
      }

      if (selectedLawyer !== 'none') {
        payload.lawyer_id = selectedLawyer
      }

      let res
      const targetMinuteId = explicitMinuteId || minuteId
      if (targetMinuteId) {
        res = await supabase
          .from('minutes')
          .update(payload)
          .eq('id', targetMinuteId)
          .select('id')
          .single()
      } else {
        res = await supabase.from('minutes').insert(payload).select('id').single()
      }

      if (res.error) throw res.error
      if (res.data?.id) setMinuteId(res.data.id)

      if (!silent) {
        toast({ title: 'Sucesso', description: 'Minuta salva e sincronizada com sucesso!' })
      }
      return res.data?.id || minuteId || true
    } catch (error: any) {
      if (!silent) {
        toast({ title: 'Erro ao Salvar', description: error.message, variant: 'destructive' })
      }
      return false
    } finally {
      if (!silent) setSaving(false)
    }
  }

  const handleExportPDF = async () => {
    let targetId = minuteId
    if (content !== defaultContent) {
      const savedId = await handleSave(content, true)
      if (savedId && typeof savedId === 'string') {
        targetId = savedId
      }
    }

    if (!targetId) {
      return toast({
        title: 'Aviso',
        description: 'Salve a minuta primeiro antes de exportar.',
        variant: 'destructive',
      })
    }

    toast({ title: 'Processando', description: 'Gerando o arquivo PDF...' })

    try {
      const { data: min, error } = await supabase
        .from('minutes')
        .select('*, processes(*)')
        .eq('id', targetId)
        .single()

      if (error || !min) throw new Error('Minuta não encontrada.')

      const proc = min.processes as any

      const rawContent = min.content || ''

      const { procNumForCover, clientForCoverSafe: clientForCover } = extractMetadata(
        min,
        proc,
        rawContent,
      )

      const coverHtmlForTitle = extractCoverHtml(rawContent) || ''
      const titleFromCover = extractTitleFromCover(coverHtmlForTitle)

      // --- HTML Sanitization ---
      let cleanHtml = rawContent

      // Remove <div class="tableWrapper"> and <div class="table-wrapper"> replacing with <div>
      cleanHtml = cleanHtml.replace(
        /<div[^>]*class=["'][^"']*(?:tableWrapper|table-wrapper)[^"']*["'][^>]*>/g,
        '<div>',
      )

      // Convert cover-page class to data-cover="1"
      cleanHtml = cleanHtml.replace(
        /class=["']([^"']*)cover-page([^"']*)["']/g,
        'data-cover="1" class="$1$2"',
      )

      // Use DOMParser for safer structural manipulation
      const parser = new DOMParser()
      const htmlDoc = parser.parseFromString(cleanHtml, 'text/html')

      // Remove Template Cover
      const covers = htmlDoc.querySelectorAll('[data-cover="1"], .cover-page')
      covers.forEach((el) => el.remove())

      // Remove Template Summary
      const tocs = htmlDoc.querySelectorAll('.table-of-contents')
      tocs.forEach((el) => el.remove())

      // Unwrap Report Content
      const reportContents = htmlDoc.querySelectorAll('.report-content')
      reportContents.forEach((el) => {
        const fragment = document.createDocumentFragment()
        while (el.firstChild) {
          fragment.appendChild(el.firstChild)
        }
        if (el.parentNode) {
          el.parentNode.replaceChild(fragment, el)
        }
      })

      // Cleanup Page Breaks
      const pageBreaks = htmlDoc.querySelectorAll('.page-break')
      pageBreaks.forEach((el) => el.remove())

      cleanHtml = htmlDoc.body.innerHTML

      // Remove empty page-break divs (legacy style matches)
      cleanHtml = cleanHtml.replace(
        /<div[^>]*class=["'][^"']*\bpage-break\b[^"']*["'][^>]*>(?:\s*|&nbsp;|<br\s*\/?>)*<\/div>/gi,
        '',
      )
      cleanHtml = cleanHtml.replace(
        /<div[^>]*style=["'][^"']*\bpage-break-(?:after|before|inside)[^"']*["'][^>]*>(?:\s*|&nbsp;|<br\s*\/?>)*<\/div>/gi,
        '',
      )

      // Strip all inline font-family styles
      cleanHtml = cleanHtml.replace(/font-family\s*:[^;"']+;?/gi, '')

      // Strip chaotic background colors specifically from text elements, preserving tables
      cleanHtml = cleanHtml.replace(
        /<(div|p|span|blockquote)\b([^>]*)style=(["'])(.*?)\3([^>]*)>/gi,
        (match, tag, beforeStyle, quote, styleContent, afterStyle) => {
          const cleanedStyle = styleContent.replace(
            /\bbackground(?:-color|_color)?\s*:[^;]+;?/gi,
            '',
          )
          return `<${tag}${beforeStyle}style=${quote}${cleanedStyle}${quote}${afterStyle}>`
        },
      )

      // Normalize <br>
      cleanHtml = cleanHtml.replace(/<br\s*\/?>/g, '<br/>')

      // Clean up Emojis and graphic symbols
      cleanHtml = cleanHtml.replace(/\p{Extended_Pictographic}/gu, '')

      // --- Placeholder Replacement ---
      const currentDate = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
      const processNumber = procNumForCover || '—'
      const clientNamePlaceholder = clientForCover || '—'

      cleanHtml = cleanHtml.replace(/\[N[ÚU]MERO(?: DO PROCESSO)?\]/gi, processNumber)
      cleanHtml = cleanHtml.replace(/\[(?:NOME DO )?CLIENTE\]/gi, clientNamePlaceholder)
      cleanHtml = cleanHtml.replace(/\[DATA(?: DE ELABORA[ÇC][ÃA]O)?\]/gi, currentDate)
      cleanHtml = cleanHtml.replace(/\[VERS[ÃA]O\]/gi, '1.0')
      cleanHtml = cleanHtml.replace(/\[(?:NOME DO )?RESPONS[ÁA]VEL\]/gi, '—')

      // Explicitly set to false to force programmatic cover
      const contentHasCover = false

      const pdfMakeStyles = {
        H1: { fontSize: 16, bold: true, color: '#1E40AF', margin: [0, 16, 0, 8] },
        H2: { fontSize: 13, bold: true, color: '#1E40AF', margin: [0, 12, 0, 6] },
        H3: { fontSize: 11, bold: true, color: '#334155', margin: [0, 10, 0, 4] },
        H4: { fontSize: 11, bold: true, color: '#334155', margin: [0, 10, 0, 4] },
        P: { fontSize: 11, alignment: 'justify', lineHeight: 1.4 },
        BLOCKQUOTE: { italics: true, margin: [12, 5, 12, 5], background: '#f9fafb' },
        TH: { bold: true, fontSize: 10 },
        TABLE: { margin: [0, 5, 0, 15] },
        UL: { marginBottom: 6, alignment: 'justify' },
        OL: { marginBottom: 6, alignment: 'justify' },
        LI: { fontSize: 11, marginBottom: 3, alignment: 'justify', lineHeight: 1.4 },
      }

      let htmlConverted
      try {
        htmlConverted = htmlToPdfmake(cleanHtml, {
          defaultStyles: {
            h1: pdfMakeStyles.H1,
            h2: pdfMakeStyles.H2,
            h3: pdfMakeStyles.H3,
            h4: pdfMakeStyles.H4,
            p: pdfMakeStyles.P,
            blockquote: pdfMakeStyles.BLOCKQUOTE,
            th: pdfMakeStyles.TH,
            table: pdfMakeStyles.TABLE,
            ul: pdfMakeStyles.UL,
            ol: pdfMakeStyles.OL,
            li: pdfMakeStyles.LI,
          },
        })

        if (!htmlConverted || (Array.isArray(htmlConverted) && htmlConverted.length === 0)) {
          toast({
            title: 'Erro ao gerar PDF',
            description: 'Erro ao gerar PDF: O conteúdo do editor não pôde ser convertido.',
            variant: 'destructive',
          })
          return
        }
      } catch (err: any) {
        toast({
          title: 'Erro ao converter HTML para PDF',
          description: err.message || 'Falha na conversão do conteúdo.',
          variant: 'destructive',
        })
        return
      }

      const rawTitle = min.title || 'Documento Jurídico'
      const sanitizedTitle = rawTitle.replace(/\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}$/, '')
      const finalTitle = titleFromCover || sanitizedTitle
      const uppercaseTitle = finalTitle.toUpperCase()

      const docDefinition: any = {
        pageSize: 'A4',
        pageMargins: [50, 70, 50, 60],
        header: function (currentPage: number) {
          if (currentPage > 1 && !contentHasCover) {
            return {
              text: uppercaseTitle,
              alignment: 'right',
              margin: [0, 30, 50, 0],
              fontSize: 9,
              color: '#64748b',
            }
          }
          return null
        },
        footer: function (currentPage: number, pageCount: number) {
          return {
            columns: [
              {
                text: 'Confidencial — uso restrito ao destinatário',
                alignment: 'left',
                color: '#94a3b8',
                fontSize: 8,
              },
              {
                text: `${currentPage} / ${pageCount}`,
                alignment: 'right',
                color: '#94a3b8',
                fontSize: 8,
              },
            ],
            margin: [50, 20, 50, 0],
          }
        },
        content: [],
        defaultStyle: {
          fontSize: 11,
          lineHeight: 1.4,
        },
        styles: {
          tocTitle: {
            fontSize: 20,
            bold: true,
            color: '#1E40AF',
            alignment: 'left',
            margin: [0, 0, 0, 16],
          },
        },
      }

      // Cover Page Logic
      if (!contentHasCover) {
        docDefinition.content.push({
          text: uppercaseTitle,
          fontSize: 26,
          bold: true,
          alignment: 'center',
          margin: [0, 150, 0, 20],
          color: '#1E40AF',
        })

        if (procNumForCover) {
          docDefinition.content.push({
            text: `Processo Nº ${procNumForCover}`,
            fontSize: 14,
            alignment: 'center',
            margin: [0, 0, 0, 10],
            color: '#334155',
          })
        }
        if (clientForCover) {
          docDefinition.content.push({
            text: `Cliente: ${clientForCover}`,
            fontSize: 14,
            alignment: 'center',
            margin: [0, 0, 0, 10],
            color: '#334155',
          })
        }

        docDefinition.content.push({
          text: `Data: ${new Date().toLocaleDateString()}`,
          fontSize: 11,
          italics: true,
          alignment: 'center',
          margin: [0, 40, 0, 0],
          color: '#64748b',
          pageBreak: 'after',
        })
      }

      docDefinition.content.push({
        toc: {
          title: { text: 'Sumário', style: 'tocTitle', margin: [0, 0, 0, 16] },
          numberStyle: { color: '#6b7280' },
        },
        pageBreak: 'after',
      })

      // Process Information Block
      const hasProcData =
        procNumForCover || clientForCover || min.comarca || min.objeto || min.pedido
      if (!contentHasCover && hasProcData) {
        const procTableBody = []

        if (procNumForCover)
          procTableBody.push([
            { text: 'Processo nº:', bold: true, width: 100 },
            { text: procNumForCover },
          ])
        if (clientForCover)
          procTableBody.push([
            { text: 'Cliente:', bold: true, width: 100 },
            { text: clientForCover },
          ])
        if (min.comarca)
          procTableBody.push([{ text: 'Comarca:', bold: true, width: 100 }, { text: min.comarca }])
        if (min.objeto)
          procTableBody.push([{ text: 'Objeto:', bold: true, width: 100 }, { text: min.objeto }])
        if (min.pedido)
          procTableBody.push([
            { text: 'Pedido/Valor:', bold: true, width: 100 },
            { text: min.pedido },
          ])

        if (procTableBody.length > 0) {
          docDefinition.content.push({
            table: {
              widths: [100, '*'],
              body: procTableBody,
            },
            layout: {
              hLineWidth: function () {
                return 0.5
              },
              vLineWidth: function () {
                return 0
              },
              hLineColor: function () {
                return '#cbd5e1'
              },
              paddingTop: function () {
                return 4
              },
              paddingBottom: function () {
                return 4
              },
            },
            margin: [0, 0, 0, 20],
          })
        }
      }

      // Add main content
      const processHtmlNodes = (nodes: any[]): any[] => {
        if (!Array.isArray(nodes)) return nodes
        return nodes.map((node) => {
          if (node.nodeName === 'TABLE') {
            if (node.table && node.table.body && node.table.body.length > 0) {
              const numCols = node.table.body[0].length
              node.table.widths = Array(numCols).fill('auto')
            }
          }
          if (node.stack) {
            node.stack = processHtmlNodes(node.stack)
          }
          return node
        })
      }

      const processedContent = processHtmlNodes(
        Array.isArray(htmlConverted) ? htmlConverted : [htmlConverted],
      )

      const ensureTableHeaderRows = (nodes: any[]) => {
        if (!Array.isArray(nodes)) return

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i]
          if (!node) continue

          if (
            node.nodeName === 'TABLE' &&
            node.table &&
            node.table.body &&
            node.table.body.length > 0
          ) {
            const firstRow = node.table.body[0]
            if (Array.isArray(firstRow)) {
              let hasHeaderHints = false

              // Detect header hints
              for (const cell of firstRow) {
                if (!cell) continue

                const isThNode =
                  cell.nodeName === 'TH' ||
                  cell.style === 'th' ||
                  (Array.isArray(cell.style) && cell.style.includes('th'))
                if (cell.bold === true || cell.fillColor || isThNode) {
                  hasHeaderHints = true
                  break
                }

                if (Array.isArray(cell.text)) {
                  for (const t of cell.text) {
                    if (
                      t &&
                      (t.bold === true || t.fillColor || t.style === 'th' || t.nodeName === 'TH')
                    ) {
                      hasHeaderHints = true
                      break
                    }
                  }
                } else if (cell.text && typeof cell.text === 'object') {
                  const t = cell.text
                  if (t.bold === true || t.fillColor || t.style === 'th' || t.nodeName === 'TH') {
                    hasHeaderHints = true
                    break
                  }
                }
              }

              if (hasHeaderHints) {
                if (node.table.headerRows === undefined) {
                  node.table.headerRows = 1
                }
                // Visual Sanitization
                for (const cell of firstRow) {
                  if (!cell) continue

                  if (typeof cell === 'object') {
                    delete cell.fillColor
                    delete cell.background
                    delete cell.color
                    cell.bold = true
                    cell.fontSize = cell.fontSize || 10
                  }

                  if (Array.isArray(cell.text)) {
                    for (const t of cell.text) {
                      if (t && typeof t === 'object') {
                        delete t.fillColor
                        delete t.background
                        delete t.color
                        t.bold = true
                        t.fontSize = t.fontSize || 10
                      }
                    }
                  } else if (cell.text && typeof cell.text === 'object') {
                    delete cell.text.fillColor
                    delete cell.text.background
                    delete cell.text.color
                    cell.text.bold = true
                    cell.text.fontSize = cell.text.fontSize || 10
                  }
                }
              }
            }
          }

          // Recursion
          if (node.stack && !node.unbreakable) ensureTableHeaderRows(node.stack)
          if (node.columns) ensureTableHeaderRows(node.columns)
          if (node.table && node.table.body) {
            node.table.body.forEach((row: any[]) => {
              row.forEach((cell: any) => {
                if (cell) {
                  if (cell.text && Array.isArray(cell.text)) ensureTableHeaderRows(cell.text)
                  if (cell.stack && !cell.unbreakable) ensureTableHeaderRows(cell.stack)
                }
              })
            })
          }
        }
      }

      const isHeadingNode = (node: any) => {
        if (!node) return false
        if (node.style) {
          const isHeadingStyle = (style: any) =>
            typeof style === 'string' && /\b(h[1-4]|html-h[1-4])\b/i.test(style)
          if (Array.isArray(node.style)) {
            if (node.style.some(isHeadingStyle)) return true
          } else if (typeof node.style === 'string') {
            if (isHeadingStyle(node.style)) return true
          }
        }
        if (node.bold === true && node.fontSize >= 12) {
          return true
        }
        return false
      }

      const groupHeadingsWithNext = (nodes: any[]) => {
        if (!Array.isArray(nodes)) return

        // 1. Recursive Traversal
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i]
          if (!node) continue

          if (node.stack && !node.unbreakable) groupHeadingsWithNext(node.stack)
          if (node.columns) groupHeadingsWithNext(node.columns)
          if (node.table && node.table.body) {
            node.table.body.forEach((row: any[]) => {
              row.forEach((cell: any) => {
                if (cell) {
                  if (cell.text && Array.isArray(cell.text)) groupHeadingsWithNext(cell.text)
                  if (cell.stack && !cell.unbreakable) groupHeadingsWithNext(cell.stack)
                }
              })
            })
          }
        }

        // 2. Grouping
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i]
          if (!node) continue

          if (!node._grouped && isHeadingNode(node)) {
            let chainLen = 1
            while (
              i + chainLen < nodes.length &&
              isHeadingNode(nodes[i + chainLen]) &&
              !nodes[i + chainLen]._grouped
            ) {
              chainLen++
            }

            let hasTableNext = false
            let tableNode = null
            if (i + chainLen < nodes.length) {
              if (nodes[i + chainLen].nodeName === 'TABLE') {
                hasTableNext = true
                tableNode = nodes[i + chainLen]
              }
              chainLen++
            }

            if (chainLen > 1) {
              const chain = nodes.slice(i, i + chainLen)

              const wrapper = {
                stack: chain,
                unbreakable: true,
                _grouped: true,
              }
              nodes.splice(i, chainLen, wrapper)
            }
          }
        }
      }

      const forcePageBreakBeforeTableInUnbreakable = (nodes: any[]) => {
        if (!Array.isArray(nodes)) return

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i]
          if (!node) continue

          if (node.stack) forcePageBreakBeforeTableInUnbreakable(node.stack)
          if (node.columns) forcePageBreakBeforeTableInUnbreakable(node.columns)
          if (node.table && node.table.body) {
            node.table.body.forEach((row: any[]) => {
              row.forEach((cell: any) => {
                if (cell) {
                  if (cell.text && Array.isArray(cell.text))
                    forcePageBreakBeforeTableInUnbreakable(cell.text)
                  if (cell.stack) forcePageBreakBeforeTableInUnbreakable(cell.stack)
                }
              })
            })
          }

          if (node.unbreakable && Array.isArray(node.stack) && node.stack.length > 0) {
            const hasTable = node.stack.some((n: any) => n?.table || n?.nodeName === 'TABLE')
            if (hasTable) {
              if (node.pageBreak === undefined) {
                node.pageBreak = 'before'
              }

              const hasLargeTable = node.stack.find((n: any) => n?.table?.body?.length > 15)
              if (hasLargeTable) {
                delete node.unbreakable
              }
            }
          }
        }
      }

      const markTocItems = (nodes: any[]) => {
        if (!Array.isArray(nodes)) return

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i]
          if (!node) continue

          let isHeader = false
          let isH1 = false

          if (node.style) {
            const isHeadingStyle = (style: any) =>
              typeof style === 'string' && /\b(h1|h2|html-h1|html-h2)\b/i.test(style)

            if (Array.isArray(node.style)) {
              if (node.style.some(isHeadingStyle)) {
                isHeader = true
                isH1 = node.style.some((s: string) => /\b(h1|html-h1)\b/i.test(s))
              }
            } else if (typeof node.style === 'string') {
              if (isHeadingStyle(node.style)) {
                isHeader = true
                isH1 = /\b(h1|html-h1)\b/i.test(node.style)
              }
            }
          }

          if (isHeader) {
            node.tocItem = true
            node.tocStyle = { fontSize: 11, color: '#000000' }
            node.tocMargin = isH1 ? [0, 4, 0, 0] : [12, 2, 0, 0]
          }

          if (node.stack) markTocItems(node.stack)
          if (node.columns) markTocItems(node.columns)
          if (node.table && node.table.body) {
            node.table.body.forEach((row: any[]) => {
              row.forEach((cell: any) => {
                if (cell) {
                  if (cell.text && Array.isArray(cell.text)) markTocItems(cell.text)
                  if (cell.stack) markTocItems(cell.stack)
                }
              })
            })
          }
        }
      }

      groupHeadingsWithNext(processedContent)
      forcePageBreakBeforeTableInUnbreakable(processedContent)
      markTocItems(processedContent)
      ensureTableHeaderRows(processedContent)

      const cleanTableBodyFills = (nodes: any[]) => {
        if (!Array.isArray(nodes)) return

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i]
          if (!node) continue

          if (node.nodeName === 'TABLE' && node.table && node.table.body) {
            const headerRows = node.table.headerRows || 0

            node.layout = {
              hLineWidth: function () {
                return 0.5
              },
              vLineWidth: function () {
                return 0.5
              },
              hLineColor: function () {
                return '#cbd5e1'
              },
              vLineColor: function () {
                return '#cbd5e1'
              },
              paddingTop: function () {
                return 5
              },
              paddingBottom: function () {
                return 5
              },
              paddingLeft: function () {
                return 6
              },
              paddingRight: function () {
                return 6
              },
              fillColor: function (rowIndex: number) {
                if (rowIndex < headerRows) return null
                return (rowIndex - headerRows) % 2 === 0 ? '#fafafa' : null
              },
            }

            for (let r = headerRows; r < node.table.body.length; r++) {
              const row = node.table.body[r]
              if (!Array.isArray(row)) continue
              for (const cell of row) {
                if (!cell) continue

                if (typeof cell === 'object') {
                  delete cell.fillColor
                  delete cell.background
                  delete cell.color
                }

                if (Array.isArray(cell.text)) {
                  for (const t of cell.text) {
                    if (t && typeof t === 'object') {
                      delete t.fillColor
                      delete t.background
                      delete t.color
                    }
                  }
                } else if (cell.text && typeof cell.text === 'object') {
                  delete cell.text.fillColor
                  delete cell.text.background
                  delete cell.text.color
                }
              }
            }
          }

          if (node.stack) cleanTableBodyFills(node.stack)
          if (node.columns) cleanTableBodyFills(node.columns)
          if (node.table && node.table.body) {
            node.table.body.forEach((row: any[]) => {
              row.forEach((cell: any) => {
                if (cell) {
                  if (cell.text && Array.isArray(cell.text)) cleanTableBodyFills(cell.text)
                  if (cell.stack) cleanTableBodyFills(cell.stack)
                }
              })
            })
          }
        }
      }

      cleanTableBodyFills(processedContent)

      docDefinition.content = docDefinition.content.concat(processedContent)

      const filename = `${min.title || 'documento'}.pdf`
      const pdfDocGenerator = pdfMake.createPdf(docDefinition)

      pdfDocGenerator.getBlob((blob: Blob | null) => {
        if (!blob || blob.size === 0) {
          console.error('[pdfmake] Generated blob is empty or null', blob)
          toast({
            title: 'Erro ao gerar PDF',
            description: 'O PDF foi gerado vazio. Verifique o console (F12) para detalhes.',
            variant: 'destructive',
          })
          return
        }

        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        setTimeout(() => URL.revokeObjectURL(url), 1000)

        toast({ title: 'Sucesso', description: 'Download do PDF concluído.' })
      })
    } catch (err: any) {
      console.error('PDF export failed:', err)
      toast({
        title: 'Erro ao gerar PDF',
        description: err.message || 'Erro desconhecido ao exportar PDF.',
        variant: 'destructive',
      })
    }
  }

  const handleExportDOCX = async () => {
    let targetId = minuteId
    if (content !== defaultContent) {
      const savedId = await handleSave(content, true)
      if (savedId && typeof savedId === 'string') {
        targetId = savedId
      }
    }

    if (!targetId) {
      return toast({
        title: 'Aviso',
        description: 'Salve a minuta primeiro antes de exportar.',
        variant: 'destructive',
      })
    }

    try {
      const { data: min, error } = await supabase
        .from('minutes')
        .select('*, processes(*)')
        .eq('id', targetId)
        .single()

      if (error || !min) throw new Error('Minuta não encontrada.')

      const proc = min.processes as any

      const rawContent = min.content || ''

      let safeContent = rawContent
      safeContent = safeContent.replace(/\s+@[a-zA-Z][\w-]*\s*=\s*"[^"]*"/g, '')
      safeContent = safeContent.replace(/\s+@[a-zA-Z][\w-]*\s*=\s*'[^']*'/g, '')
      safeContent = safeContent.replace(/\s+data-[a-zA-Z][\w-]*\s*=\s*"[^"]*"/g, '')
      safeContent = safeContent.replace(/\s+data-[a-zA-Z][\w-]*\s*=\s*'[^']*'/g, '')
      // Clean up Emojis and graphic symbols
      safeContent = safeContent.replace(/\p{Extended_Pictographic}/gu, '')

      const contentHasCover = /class=["']cover-page["']/i.test(safeContent)

      const { procNumForCover, clientForCoverSafe: clientForCover } = extractMetadata(
        min,
        proc,
        rawContent,
      )

      const coverHtmlForTitle = extractCoverHtml(rawContent) || ''
      const titleFromCover = extractTitleFromCover(coverHtmlForTitle)

      const rawTitle = min.title || 'Documento Jurídico'
      const sanitizedTitle = rawTitle.replace(/\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}$/, '')
      const finalTitle = titleFromCover || sanitizedTitle
      const uppercaseTitle = finalTitle.toUpperCase()

      let htmlString = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${uppercaseTitle}</title>
      <style>
        @page { margin: 2.5cm; }
        body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; color: black; }
        h1 { font-size: 16pt; font-weight: bold; margin-bottom: 1em; }
        h2 { font-size: 14pt; font-weight: bold; margin-bottom: 1em; }
        h3, h4, h5, h6 { font-size: 12pt; font-weight: bold; margin-bottom: 1em; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 1em; border: 1px solid #000; }
        th, td { border: 1px solid #000; padding: 8px; text-align: left; }
        .cover-page { text-align: center; }
        .page-break { page-break-after: always; }
        blockquote { margin: 12pt 24pt; border-left: 2px solid #ccc; padding-left: 10px; }
        p { margin-bottom: 1em; line-height: 1.5; }
      </style>
      </head><body>`

      if (!contentHasCover) {
        htmlString += `<h1 style="text-align: center;">${uppercaseTitle}</h1>`
        if (procNumForCover) {
          htmlString += `<h2 style="text-align: center;">Processo Nº ${procNumForCover}</h2>`
        }

        if (clientForCover || min.comarca || min.objeto || min.pedido) {
          htmlString += `<div>`
          if (clientForCover) htmlString += `<p><strong>Cliente:</strong> ${clientForCover}</p>`
          if (min.comarca) htmlString += `<p><strong>Comarca:</strong> ${min.comarca}</p>`
          if (min.objeto) htmlString += `<p><strong>Objeto:</strong> ${min.objeto}</p>`
          if (min.pedido) htmlString += `<p><strong>Pedido/Valor:</strong> ${min.pedido}</p>`
          htmlString += `<hr/></div>`
        }
      }

      htmlString += safeContent
      htmlString += `</body></html>`

      toast({ title: 'Processando', description: 'Gerando o arquivo DOCX...' })

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) throw new Error('Sessão expirada. Faça login novamente.')

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const res = await fetch(`${supabaseUrl}/functions/v1/export-docx`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ html: htmlString, title: min.title || 'documento' }),
        })

        if (!res.ok) {
          let errorMsg = 'Falha na comunicação com o servidor de exportação.'
          try {
            const errData = await res.json()
            if (errData.error) errorMsg = errData.error
          } catch {
            const errText = await res.text()
            if (errText) errorMsg = errText
          }
          throw new Error(errorMsg)
        }

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${min.title || 'documento'}.docx`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        toast({ title: 'Sucesso', description: 'Download do DOCX concluído.' })
      } catch (err: any) {
        console.error('DOCX conversion failed:', err)
        toast({
          title: 'Erro ao exportar DOCX',
          description: err.message || 'Erro desconhecido ao exportar DOCX.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({ title: 'Erro ao gerar DOCX', description: err.message, variant: 'destructive' })
    }
  }

  const handleApplyTemplate = () => {
    const proc = processes.find((p) => p.id === selectedProcess)
    const processStr = proc ? `Processo nº ${proc.case_number}` : 'Processo nº [NÚMERO]'
    const clientStr = clientName || (proc ? proc.client_name : '[NOME DO CLIENTE]')

    const template = `
      <div class="cover-page" style="text-align: center; margin-top: 100px; margin-bottom: 200px;">
        <h1 style="color: #1E40AF; font-size: 36px; font-weight: bold; margin-bottom: 20px;">Relatório de Caso Jurídico</h1>
        <h2 style="color: #334155; font-size: 24px; margin-bottom: 10px;">${processStr}</h2>
        <h3 style="color: #64748b; font-size: 20px;">Cliente: ${clientStr}</h3>
        <div style="margin-top: 60px; padding-top: 20px; border-top: 2px solid #e2e8f0; display: inline-block; color: #94a3b8; font-weight: 500;">
          LexControl - Inteligência Jurídica
        </div>
      </div>
      <div class="page-break" style="page-break-after: always; display: block; height: 0; clear: both;"></div>
      <div class="table-of-contents" style="margin-bottom: 30px;">
        <h2 style="color: #1E40AF; border-bottom: 2px solid #1E40AF; padding-bottom: 10px; margin-bottom: 20px; font-weight: bold;">Sumário</h2>
        <ul style="list-style-type: none; padding-left: 0; line-height: 2; font-size: 18px; color: #334155;">
          <li><span style="font-weight: bold;">1.</span> Situação Atual</li>
          <li><span style="font-weight: bold;">2.</span> Problemas Identificados</li>
          <li><span style="font-weight: bold;">3.</span> Soluções e Estratégias</li>
          <li><span style="font-weight: bold;">4.</span> Próximos Passos</li>
        </ul>
      </div>
      <div class="page-break" style="page-break-after: always; display: block; height: 0; clear: both;"></div>
      <div class="report-content" style="font-family: inherit;">
        <h2 style="color: #1E40AF; margin-top: 20px; font-weight: bold;">1. Situação Atual</h2>
        <p style="margin-bottom: 20px; color: #334155; line-height: 1.6;">Descreva a situação atual do caso detalhadamente, com base no histórico e nos documentos analisados.</p>
        
        <h2 style="color: #1E40AF; margin-top: 20px; font-weight: bold;">2. Problemas Identificados</h2>
        <p style="margin-bottom: 20px; color: #334155; line-height: 1.6;">Liste os riscos, prazos expirados ou questões críticas encontradas que demandam atenção da equipe.</p>
        
        <h2 style="color: #1E40AF; margin-top: 20px; font-weight: bold;">3. Soluções e Estratégias</h2>
        <p style="margin-bottom: 20px; color: #334155; line-height: 1.6;">Apresente os planos de ação e as teses de defesas sugeridas pela equipe jurídica e pela IA.</p>
        
        <h2 style="color: #1E40AF; margin-top: 20px; font-weight: bold;">4. Próximos Passos</h2>
        <p style="margin-bottom: 20px; color: #334155; line-height: 1.6;">Defina os responsáveis e os próximos movimentos a serem executados no processo no curto prazo.</p>
      </div>
    `

    const hasUserContent =
      content !== defaultContent && content.trim() !== '' && !content.includes('class="cover-page"')

    if (hasUserContent) {
      if (
        !window.confirm(
          'O editor já tem conteúdo. Clique OK para INSERIR a capa + sumário NO INÍCIO (preservando seu texto), ou Cancelar para abortar.',
        )
      ) {
        return
      }

      const templateHeader = template.replace(/<div class="report-content"[\s\S]*?<\/div>\s*$/, '')
      const newContent = `${templateHeader}<div class="report-content" style="font-family: inherit;">${content}</div>`

      setContent(newContent)
      localStorage.setItem('lexcontrol_gerador_draft', newContent)
      toast({
        title: 'Template Aplicado',
        description: 'Capa e sumário inseridos no início do documento.',
      })
    } else {
      setContent(template)
      localStorage.setItem('lexcontrol_gerador_draft', template)
      toast({
        title: 'Template Aplicado',
        description: 'Template corporativo de Relatório de Caso gerado.',
      })
    }
  }

  useEffect(() => {
    if (minuteType && content.includes('class="cover-page"')) {
      toast({
        title: 'Editor contém um template antigo',
        description:
          "O conteúdo no editor é de um tipo de minuta anterior. Clique em 'Limpar Editor' antes de gerar a nova minuta para evitar duplicação de capa.",
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteType])

  return (
    <div
      className={cn(
        'flex gap-6 animate-fade-in-up transition-all duration-300',
        isFullScreen ? 'fixed inset-0 z-50 bg-background p-6' : 'h-[calc(100vh-6rem)]',
      )}
    >
      <div
        className={cn(
          'flex flex-col min-w-0 transition-all duration-300',
          isSidebarOpen ? 'w-[65%] lg:w-[70%]' : 'w-full',
        )}
      >
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-b mb-4 -mx-4 sm:mx-0 sm:rounded-t-lg shadow-sm">
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-primary">
              Gerador de Minutas
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <p className="text-muted-foreground text-xs md:text-sm hidden sm:block">
                Crie e edite suas peças com auxílio de Inteligência Artificial.
              </p>
              {minuteType && (
                <Badge
                  variant="outline"
                  className="text-xs bg-primary/5 text-primary border-primary/20 whitespace-nowrap"
                >
                  {minuteType}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {content !== defaultContent && content.trim() !== '' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportPDF}
                  disabled={saving || applying || loading}
                  className="text-red-600 border-red-200 hover:bg-red-50 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 sm:mr-2" />{' '}
                  <span className="hidden sm:inline">Exportar PDF</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportDOCX}
                  disabled={saving || applying || loading}
                  className="text-blue-600 border-blue-200 hover:bg-blue-50 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 sm:mr-2" />{' '}
                  <span className="hidden sm:inline">Exportar DOCX</span>
                </Button>
              </>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="px-2" title="Mais opções">
                  <MoreHorizontal className="w-4 h-4" />
                  <span className="sr-only">Mais opções</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onClick={handleNovaMinuta}
                  disabled={saving || applying || loading}
                  className="cursor-pointer"
                >
                  <Plus className="w-4 h-4 mr-2 text-green-600" /> Nova Minuta
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleSave(content)}
                  disabled={saving || content === defaultContent}
                  className="cursor-pointer"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin text-primary" />
                  ) : (
                    <Save className="w-4 h-4 mr-2 text-primary" />
                  )}
                  Salvar Minuta
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleClearEditor}
                  disabled={content === defaultContent || saving || applying || loading}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Limpar Editor
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={isFullScreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
              className="px-2"
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            {!isFullScreen && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                title={isSidebarOpen ? 'Ocultar Painel' : 'Mostrar Painel'}
                className="px-2"
              >
                {isSidebarOpen ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelRightOpen className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>
        </div>

        {minuteType === 'Relatório de Caso' && (
          <div className="mb-4 p-3 bg-blue-50/50 border border-blue-100 rounded-md flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm text-blue-800">
              <LayoutTemplate className="w-5 h-5 text-blue-600" />
              <span>
                <strong>Template LexControl:</strong> Recomendamos aplicar a formatação automática
                de capa e sumário para o seu Relatório.
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleApplyTemplate}
              className="bg-white hover:bg-blue-50 text-blue-700 border border-blue-200"
            >
              Aplicar Template LexControl
            </Button>
          </div>
        )}

        {(applying || loading) && progressStatus && (
          <div
            className={cn(
              'mb-4 p-3 rounded-md flex items-center justify-between animate-pulse shadow-sm border',
              applying ? 'bg-green-50/80 border-green-200' : 'bg-primary/5 border-primary/20',
            )}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <Loader2
                  className={cn(
                    'w-5 h-5 animate-spin',
                    applying ? 'text-green-600' : 'text-primary',
                  )}
                />
                <span
                  className={cn(
                    'absolute top-0 right-0 w-2 h-2 rounded-full animate-ping',
                    applying ? 'bg-green-500' : 'bg-primary',
                  )}
                ></span>
              </div>
              <span
                className={cn(
                  'text-sm font-medium',
                  applying ? 'text-green-800' : 'text-foreground/80',
                )}
              >
                {progressStatus}
              </span>
            </div>
            <Badge
              variant="outline"
              className={cn(
                applying ? 'bg-green-100 text-green-800 border-green-300' : 'bg-background',
              )}
            >
              {applying ? 'Streaming Ativo' : 'Processando IA'}
            </Badge>
          </div>
        )}

        <div
          className={cn(
            'flex-1 overflow-hidden rounded-lg border shadow-sm transition-all relative',
            applying
              ? 'border-green-300 ring-2 ring-green-500/20'
              : 'border-border/50 bg-background',
          )}
        >
          {applying && (
            <div className="absolute top-2 right-4 z-10 flex items-center gap-2 bg-green-100 text-green-800 px-3 py-1.5 rounded-full shadow-sm animate-pulse border border-green-200">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs font-semibold">Aplicando sugestões e reescrevendo...</span>
            </div>
          )}
          <RichTextEditor value={content} onChange={handleContentChange} readOnly={applying} />
        </div>
      </div>

      {!isFullScreen && isSidebarOpen && (
        <div className="w-[35%] lg:w-[30%] flex flex-col gap-4 shrink-0 transition-all duration-300">
          <Card className="flex flex-col h-full border-border/50 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 pb-3 pt-3 border-b px-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="config">Configuração</TabsTrigger>
                  <TabsTrigger value="ai" className="relative">
                    Sugestões IA
                    {suggestions.length > 0 && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    )}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0 overflow-hidden bg-background">
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full h-full flex flex-col"
              >
                <TabsContent
                  value="config"
                  className="flex-1 h-full overflow-hidden m-0 data-[state=active]:flex flex-col p-4 pt-4"
                >
                  <ScrollArea className="flex-1 pr-3 -mr-3">
                    <div className="flex flex-col gap-5 pb-2">
                      <div className="space-y-3">
                        <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <FolderOpen className="w-4 h-4 text-muted-foreground" /> Vincular Processo
                        </label>
                        <Popover open={processOpen} onOpenChange={setProcessOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={processOpen}
                              className="w-full justify-between font-normal text-left overflow-hidden"
                            >
                              <span className="truncate">
                                {selectedProcess !== 'none'
                                  ? processes.find((p) => p.id === selectedProcess)?.case_number ||
                                    'Não encontrado'
                                  : 'Pesquisar processo...'}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[330px] p-0">
                            <Command>
                              <CommandInput placeholder="Buscar por número ou cliente..." />
                              <CommandList>
                                <CommandEmpty>Nenhum processo encontrado.</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    value="none"
                                    onSelect={() => {
                                      setSelectedProcess('none')
                                      setProcessOpen(false)
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        selectedProcess === 'none' ? 'opacity-100' : 'opacity-0',
                                      )}
                                    />
                                    Sem vínculo (Avulso)
                                  </CommandItem>
                                  {processes.map((p) => (
                                    <CommandItem
                                      key={p.id}
                                      value={`${p.case_number} ${p.client_name}`}
                                      onSelect={() => {
                                        setSelectedProcess(p.id)
                                        setProcessOpen(false)
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          'mr-2 h-4 w-4',
                                          selectedProcess === p.id ? 'opacity-100' : 'opacity-0',
                                        )}
                                      />
                                      <div className="flex flex-col overflow-hidden">
                                        <span className="truncate font-medium">
                                          {p.case_number}
                                        </span>
                                        <span className="truncate text-xs text-muted-foreground">
                                          {p.client_name}
                                        </span>
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-3">
                        <label className="text-sm font-semibold text-foreground">
                          Tipo de Minuta
                        </label>
                        <Select value={minuteType} onValueChange={setMinuteType}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            {MINUTE_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <Accordion
                        type="single"
                        collapsible
                        className="w-full bg-muted/20 border rounded-md"
                      >
                        <AccordionItem value="metadata" className="border-b-0 px-3">
                          <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
                            Metadados da Minuta
                          </AccordionTrigger>
                          <AccordionContent className="space-y-3 pt-1 pb-3">
                            <div className="space-y-1">
                              <label className="text-xs font-medium">Cliente</label>
                              <Input
                                className="h-8"
                                placeholder="Nome do cliente..."
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium">Comarca</label>
                              <Input
                                className="h-8"
                                placeholder="Ex: São Paulo/SP"
                                value={comarca}
                                onChange={(e) => setComarca(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium">Objeto</label>
                              <Input
                                className="h-8"
                                placeholder="Ex: Indenização"
                                value={objeto}
                                onChange={(e) => setObjeto(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium">Pedido / Valor</label>
                              <Input
                                className="h-8"
                                placeholder="Ex: R$ 10.000,00"
                                value={pedido}
                                onChange={(e) => setPedido(e.target.value)}
                              />
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>

                      {lawyers.length > 0 && (
                        <div className="space-y-3">
                          <label className="text-sm font-semibold text-foreground">
                            Advogado Responsável
                          </label>
                          <Select value={selectedLawyer} onValueChange={setSelectedLawyer}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Selecione o advogado..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhum / Não informar</SelectItem>
                              {lawyers.map((l) => (
                                <SelectItem key={l.id} value={l.id}>
                                  {l.full_name} ({l.oab_number})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <label className="text-sm font-semibold text-foreground">
                            Agentes de IA
                          </label>
                          <span
                            className={cn(
                              'text-xs font-medium',
                              selectedAgents.length > 8
                                ? 'text-destructive'
                                : 'text-muted-foreground',
                            )}
                          >
                            {selectedAgents.length} de 8 agentes selecionados
                          </span>
                        </div>
                        <Popover open={agentOpen} onOpenChange={setAgentOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={agentOpen}
                              className={cn(
                                'w-full justify-between font-normal',
                                selectedAgents.length > 8 && 'border-destructive ring-destructive',
                              )}
                            >
                              <span className="truncate">
                                {selectedAgents.length > 0
                                  ? `${selectedAgents.length} selecionado(s)`
                                  : 'Selecione agentes...'}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[330px] p-0">
                            <Command>
                              <CommandInput placeholder="Buscar agente..." />
                              <CommandList>
                                <CommandEmpty>Nenhum agente encontrado.</CommandEmpty>
                                <CommandGroup>
                                  {agents.map((a) => (
                                    <CommandItem
                                      key={a.id}
                                      value={a.name}
                                      onSelect={() => toggleAgent(a.id)}
                                      className="flex flex-col items-start py-2"
                                    >
                                      <div className="flex items-center w-full">
                                        <Check
                                          className={cn(
                                            'mr-2 h-4 w-4 shrink-0',
                                            selectedAgents.includes(a.id)
                                              ? 'opacity-100'
                                              : 'opacity-0',
                                          )}
                                        />
                                        <span className="font-medium truncate">{a.name}</span>
                                      </div>
                                      {(a.descricao || a.description) && (
                                        <span className="text-xs text-muted-foreground ml-6 mt-0.5 line-clamp-2 leading-tight">
                                          {a.descricao || a.description}
                                        </span>
                                      )}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>

                        {selectedAgents.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {selectedAgents.map((id) => {
                              const agent = agents.find((a) => a.id === id)
                              return agent ? (
                                <Badge
                                  key={id}
                                  variant="secondary"
                                  className="flex items-center gap-1 font-normal bg-primary/10 text-primary hover:bg-primary/20"
                                >
                                  {agent.name}{' '}
                                  <X
                                    className="w-3 h-3 cursor-pointer opacity-70 hover:opacity-100"
                                    onClick={() => toggleAgent(id)}
                                  />
                                </Badge>
                              ) : null
                            })}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <Upload className="w-4 h-4 text-muted-foreground" /> Anexar Documentos de
                          Base
                        </label>
                        <div className="border-2 border-dashed border-border rounded-md p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors relative">
                          <input
                            type="file"
                            multiple
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={handleFileUpload}
                            disabled={uploading}
                            accept=".pdf,application/pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain,.md,text/markdown,.csv,text/csv"
                          />
                          {uploading ? (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Loader2 className="w-6 h-6 animate-spin" />{' '}
                              <span className="text-sm">Processando anexo...</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <FileText className="w-6 h-6" />{' '}
                              <span className="text-sm text-balance">
                                Clique ou arraste arquivos (PDF, Excel, Word, Text) para contexto da
                                IA
                              </span>
                            </div>
                          )}
                        </div>
                        {attachments.length > 0 && (
                          <div className="flex flex-col gap-2 mt-2">
                            {attachments.map((file, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between bg-muted/40 p-2 rounded text-sm border border-border/50"
                              >
                                <span className="truncate flex-1 mr-2" title={file.name}>
                                  {file.name}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0"
                                  onClick={() => removeAttachment(file.path)}
                                >
                                  <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </ScrollArea>
                  <div className="pt-4 border-t border-border/50 mt-auto">
                    <Button
                      onClick={handleAnalyze}
                      disabled={
                        loading ||
                        applying ||
                        saving ||
                        selectedAgents.length === 0 ||
                        selectedAgents.length > 8
                      }
                      className="w-full shrink-0 shadow-sm hover:shadow-md transition-shadow"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Wand2 className="w-4 h-4 mr-2" />
                      )}
                      {loading ? 'Processando Documento...' : 'Analisar com IA'}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent
                  value="ai"
                  className="flex-1 h-full overflow-hidden m-0 data-[state=active]:flex flex-col p-4 pt-4"
                >
                  {suggestions.length > 0 && (
                    <div className="flex flex-col gap-3 pb-4 border-b border-border animate-in fade-in slide-in-from-top-2 shrink-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
                        <Sparkles className="w-5 h-5" />
                        <span>{suggestions.length} sugestões da IA prontas</span>
                      </div>
                      <Button
                        onClick={() => handleApplySuggestions()}
                        disabled={
                          applying ||
                          saving ||
                          selectedAgents.length === 0 ||
                          selectedAgents.length > 8
                        }
                        className="w-full bg-green-600 hover:bg-green-700 text-white shadow-sm hover:shadow-md transition-all"
                      >
                        {applying ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4 mr-2" />
                        )}
                        {applying ? 'Reescrevendo...' : 'Reescrever e Aplicar Todas'}
                      </Button>
                    </div>
                  )}
                  <ScrollArea className="flex-1 pr-3 -mr-3 mt-2">
                    <div className="flex flex-col gap-5 pb-2">
                      {suggestions.length > 0 ? (
                        <div ref={suggestionsRef} className="flex flex-col gap-4 scroll-mt-4">
                          <div className="space-y-3">
                            {suggestions.map((s, i) => (
                              <div
                                key={i}
                                className="bg-primary/5 border border-primary/10 p-3 rounded-md text-sm text-foreground/90 shadow-sm leading-relaxed"
                              >
                                {s}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center text-center px-4 pt-10">
                          <p className="text-sm text-muted-foreground">
                            {loading
                              ? 'Analisando...'
                              : 'Nenhuma sugestão ainda. Anexe documentos e analise na aba de configuração.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
