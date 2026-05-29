import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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

  const { toast } = useToast()

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
    if (!content || content.length < 10) {
      return toast({
        title: 'Atenção',
        description: 'Adicione mais conteúdo para análise.',
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

      const bodyPayload: any = {
        invocation_id,
        content,
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

      if (err.name === 'AbortError') errorMsg = 'A requisição foi cancelada (Timeout).'
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
    if (suggestions.length > 0 && suggestionsRef.current) {
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
    setContent(accumulatedContent) // Prepare editor for streaming text

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

      if (minuteType === 'Relatório de Caso' && !isResume && retryCount === 0) {
        const proc = processes.find((p) => p.id === selectedProcess)
        const processStr = proc ? `Processo nº ${proc.case_number}` : 'Processo nº [NÚMERO]'
        const clientStr = clientName || (proc ? proc.client_name : '[NOME DO CLIENTE]')

        const templateHead = `
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
        `
        revised_content = templateHead + revised_content + '</div>'
        setContent(revised_content)
        localStorage.setItem('lexcontrol_gerador_draft', revised_content)
      }

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

      const isSaved = await handleSave(revised_content, true)
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

      if (err.name === 'AbortError') errorMsg = 'A requisição foi cancelada por timeout da rede.'
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
        errorMsg.includes('A IA não retornou conteúdo')
      ) {
        errorMsg = 'A IA não retornou conteúdo'
      }

      // Do not auto-retry if it's a known API structural error (like model not found or empty response)
      if (
        retryCount < 3 &&
        !err.message?.includes('401') &&
        !isApiError &&
        !err.message?.includes('EMPTY_RESPONSE') &&
        !errorMsg.includes('vazia ou malformada') &&
        !errorMsg.includes('A IA não retornou conteúdo')
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

  const handleSave = async (contentToSave = content, silent = false) => {
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
      if (minuteId) {
        res = await supabase
          .from('minutes')
          .update(payload)
          .eq('id', minuteId)
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

  const handlePrint = async () => {
    let targetId = minuteId
    if (content !== defaultContent) {
      // Force a silent save to ensure the latest content is printed from DB
      const savedId = await handleSave(content, true)
      if (savedId && typeof savedId === 'string') {
        targetId = savedId
      }
    }

    if (!targetId) {
      toast({
        title: 'Aviso',
        description: 'Salve a minuta primeiro antes de baixar o PDF.',
        variant: 'destructive',
      })
      return
    }

    try {
      const { data: min, error } = await supabase
        .from('minutes')
        .select('*, processes(*)')
        .eq('id', targetId)
        .single()

      if (error || !min) throw new Error('Minuta não encontrada.')

      const printWindow = window.open('', '', 'width=800,height=600')
      if (!printWindow) {
        toast({
          title: 'Aviso',
          description: 'Permita pop-ups para gerar o PDF.',
          variant: 'destructive',
        })
        return
      }

      const proc = min.processes as any

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${min.title}</title>
            <style>
              body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; padding: 20mm; color: black; }
              h1, h2, h3 { font-weight: bold; margin-top: 1.5em; margin-bottom: 0.5em; }
              p { text-indent: 2em; margin-bottom: 1em; text-align: justify; }
              @media print {
                @page { margin: 25mm; }
                body { padding: 0; }
              }
            </style>
          </head>
          <body>
            <div style="text-align: center; margin-bottom: 2em;">
              <h1 style="text-transform: uppercase; font-size: 14pt;">${min.title || 'Documento Jurídico'}</h1>
              ${proc?.case_number ? `<h2 style="font-size: 12pt;">Processo Nº ${proc.case_number}</h2>` : ''}
            </div>
            ${
              min.client_name || min.comarca || min.objeto || min.pedido
                ? `
            <div style="margin-bottom: 2em; border-bottom: 2px solid black; padding-bottom: 1em; font-size: 10pt;">
              ${min.client_name ? `<p style="margin:0; text-indent:0;"><strong>Cliente:</strong> ${min.client_name}</p>` : ''}
              ${min.comarca ? `<p style="margin:0; text-indent:0;"><strong>Comarca:</strong> ${min.comarca}</p>` : ''}
              ${min.objeto ? `<p style="margin:0; text-indent:0;"><strong>Objeto:</strong> ${min.objeto}</p>` : ''}
              ${min.pedido ? `<p style="margin:0; text-indent:0;"><strong>Pedido/Valor:</strong> ${min.pedido}</p>` : ''}
            </div>
            `
                : ''
            }
            ${min.content}
          </body>
        </html>
      `)

      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
        printWindow.close()
      }, 500)
    } catch (err: any) {
      toast({ title: 'Erro ao gerar PDF', description: err.message, variant: 'destructive' })
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
    setContent(template)
    localStorage.setItem('lexcontrol_gerador_draft', template)
    toast({
      title: 'Template Aplicado',
      description: 'Template corporativo de Relatório de Caso gerado com sucesso.',
    })
  }

  useEffect(() => {
    if (
      minuteType === 'Relatório de Caso' &&
      (content === defaultContent || content.trim() === '')
    ) {
      handleApplyTemplate()
    }
  }, [minuteType, selectedProcess])

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-6 animate-fade-in-up">
      <div className="flex-1 flex flex-col min-w-0 no-print">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">Gerador de Minutas</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-muted-foreground text-sm">
                Crie e edite suas peças com auxílio de Inteligência Artificial.
              </p>
              {minuteType && (
                <Badge
                  variant="outline"
                  className="text-xs bg-primary/5 text-primary border-primary/20"
                >
                  {minuteType}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {content !== defaultContent && content.trim() !== '' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <Download className="w-4 h-4 mr-2" /> Baixar Peça (PDF)
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => handleSave(content)}
              disabled={saving || content === defaultContent}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {saving ? 'Salvando...' : 'Salvar Minuta'}
            </Button>
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
            'flex-1 overflow-hidden rounded-lg border shadow-sm transition-all no-print',
            applying
              ? 'border-green-300 ring-2 ring-green-500/20'
              : 'border-border/50 bg-background',
          )}
        >
          <RichTextEditor value={content} onChange={handleContentChange} readOnly={applying} />
        </div>

        {/* Hidden printable area */}
        <div className="print-only hidden print:block text-black print-legal-doc">
          <div className="text-center mb-8">
            <h1 className="text-xl font-bold uppercase">{minuteType || 'Documento Jurídico'}</h1>
            {selectedProcess !== 'none' &&
              processes.find((p) => p.id === selectedProcess)?.case_number && (
                <h2 className="text-lg mt-2">
                  Processo Nº {processes.find((p) => p.id === selectedProcess)?.case_number}
                </h2>
              )}
          </div>
          {(clientName || comarca || objeto || pedido) && (
            <div className="mb-8 border-b-2 border-black pb-4 text-sm">
              {clientName && (
                <p className="mb-1">
                  <strong>Cliente:</strong> {clientName}
                </p>
              )}
              {comarca && (
                <p className="mb-1">
                  <strong>Comarca:</strong> {comarca}
                </p>
              )}
              {objeto && (
                <p className="mb-1">
                  <strong>Objeto:</strong> {objeto}
                </p>
              )}
              {pedido && (
                <p className="mb-1">
                  <strong>Pedido/Valor:</strong> {pedido}
                </p>
              )}
            </div>
          )}
          <div
            className="prose max-w-none text-justify leading-relaxed"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>
      </div>

      <div className="w-[380px] flex flex-col gap-4 no-print">
        <Card className="flex flex-col h-full border-border/50 shadow-sm">
          <CardHeader className="bg-muted/30 pb-4 border-b">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="w-5 h-5 text-primary" />
              Análise com IA
            </CardTitle>
            <CardDescription>
              Obtenha sugestões e correções para aprimorar sua peça.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-5 p-5 overflow-hidden">
            {suggestions.length > 0 && (
              <div className="flex flex-col gap-3 pb-4 border-b border-border animate-in fade-in slide-in-from-top-2 shrink-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
                  <Sparkles className="w-5 h-5" />
                  <span>{suggestions.length} sugestões da IA prontas</span>
                </div>
                <Button
                  onClick={() => handleApplySuggestions()}
                  disabled={applying || saving}
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
            <ScrollArea className="flex-1 -mx-5 px-5">
              <div className="flex flex-col gap-5 pb-2 pr-4">
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
                                  <span className="truncate font-medium">{p.case_number}</span>
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
                  <label className="text-sm font-semibold text-foreground">Tipo de Minuta</label>
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
                  <label className="text-sm font-semibold text-foreground">Agentes de IA</label>
                  <Popover open={agentOpen} onOpenChange={setAgentOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={agentOpen}
                        className="w-full justify-between font-normal"
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
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    selectedAgents.includes(a.id) ? 'opacity-100' : 'opacity-0',
                                  )}
                                />
                                {a.name}
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
                    <Upload className="w-4 h-4 text-muted-foreground" /> Anexar Documentos de Base
                  </label>
                  <div className="border-2 border-dashed border-border rounded-md p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors relative">
                    <input
                      type="file"
                      multiple
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={handleFileUpload}
                      disabled={uploading}
                      accept=".pdf,.txt,.doc,.docx"
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
                          Clique ou arraste arquivos para contexto da IA
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

                {suggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="flex flex-col gap-4 mt-2 pt-4 border-t border-border scroll-mt-4"
                  >
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" /> Sugestões Identificadas:
                    </h3>
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
                )}

                {suggestions.length === 0 && !loading && (
                  <div className="flex items-center justify-center text-center px-4 pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                      Anexe documentos e clique abaixo para o Agente analisar ou reescrever a peça.
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>

            <Button
              onClick={handleAnalyze}
              disabled={loading || applying || saving}
              className="w-full shrink-0 shadow-sm hover:shadow-md transition-shadow"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              {loading ? 'Processando Documento...' : 'Analisar com IA'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
