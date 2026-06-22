import { useEffect, useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Briefcase, FileText, Upload, Download, Trash2, File as FileIcon, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useNavigate, useSearchParams } from 'react-router-dom'

const ProcessMinutas = ({ processId, caseNumber }: { processId: string; caseNumber: string }) => {
  const [minutes, setMinutes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const fetchMinutes = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('minutes')
        .select('id, title, minute_type, updated_at')
        .eq('process_id', processId)
        .order('updated_at', { ascending: false })

      if (data) setMinutes(data)
      setLoading(false)
    }
    fetchMinutes()
  }, [processId])

  return (
    <div className="space-y-4 pt-2">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Minutas Vinculadas</h3>
        <Button
          size="sm"
          onClick={() => navigate(`/gerador-minutas?process_id=${processId}`)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Nova Minuta para este Processo
        </Button>
      </div>

      <div className="border rounded-md divide-y max-h-[300px] overflow-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : minutes.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Nenhuma minuta vinculada a este processo.
          </div>
        ) : (
          minutes.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => navigate(`/gerador-minutas?id=${m.id}`)}
            >
              <div className="flex flex-col gap-1 overflow-hidden">
                <span className="text-sm font-medium truncate" title={m.title}>
                  {m.title}
                </span>
                <div className="flex items-center gap-2">
                  {m.minute_type && (
                    <Badge variant="outline" className="text-[10px] py-0 h-4">
                      {m.minute_type}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(m.updated_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const ProcessDocuments = ({
  processId,
  processName,
}: {
  processId: string
  processName: string
}) => {
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const loadDocuments = async () => {
    setLoading(true)
    const { data, error } = await (supabase as any)
      .from('process_attachments')
      .select('*')
      .eq('process_id', processId)
      .order('created_at', { ascending: false })

    if (data) setDocuments(data)
    setLoading(false)
  }

  useEffect(() => {
    loadDocuments()
  }, [processId])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'Erro',
        description: 'O arquivo não pode ter mais de 10MB.',
        variant: 'destructive',
      })
      return
    }

    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${processId}/${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('legal_documents')
      .upload(fileName, file)

    if (uploadError) {
      toast({ title: 'Erro no upload', description: uploadError.message, variant: 'destructive' })
      setUploading(false)
      return
    }

    const { error: dbError } = await (supabase as any).from('process_attachments').insert({
      process_id: processId,
      file_name: file.name,
      file_path: fileName,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
    })

    if (dbError) {
      toast({ title: 'Erro ao salvar', description: dbError.message, variant: 'destructive' })
    } else {
      toast({ title: 'Sucesso', description: 'Documento anexado com sucesso.' })
      loadDocuments()
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDownload = async (doc: any) => {
    const { data, error } = await supabase.storage.from('legal_documents').download(doc.file_path)

    if (error) {
      toast({ title: 'Erro no download', description: error.message, variant: 'destructive' })
      return
    }

    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = doc.file_name
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const handleDelete = async (doc: any) => {
    const { error: storageError } = await supabase.storage
      .from('legal_documents')
      .remove([doc.file_path])

    if (storageError) {
      toast({ title: 'Erro', description: storageError.message, variant: 'destructive' })
      return
    }

    const { error: dbError } = await (supabase as any)
      .from('process_attachments')
      .delete()
      .eq('id', doc.id)

    if (dbError) {
      toast({ title: 'Erro', description: dbError.message, variant: 'destructive' })
    } else {
      toast({ title: 'Sucesso', description: 'Documento removido.' })
      loadDocuments()
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Anexos</h3>
        <div>
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            size="sm"
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {uploading ? 'Enviando...' : 'Anexar'}
          </Button>
        </div>
      </div>

      <div className="border rounded-md divide-y">
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Carregando documentos...
          </div>
        ) : documents.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Nenhum documento anexado.
          </div>
        ) : (
          documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3 overflow-hidden">
                <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="truncate">
                  <p className="text-sm font-medium truncate">{doc.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(doc.created_at).toLocaleDateString()} •{' '}
                    {(doc.file_size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDownload(doc)}
                  title="Baixar"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(doc)}
                  title="Excluir"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function Processos() {
  const [processes, setProcesses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('focus')

  useEffect(() => {
    supabase
      .from('processes')
      .select('*, minutes(count)')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setProcesses(data)
        setLoading(false)
      })
  }, [])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
          <Briefcase className="h-8 w-8" /> Processos
        </h1>
        <p className="text-muted-foreground mt-1">
          Gestão centralizada de casos ativos e arquivados.
        </p>
      </div>
      <Card className="border-border/50 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Minutas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : processes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Nenhum processo encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                processes.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.case_number}</TableCell>
                    <TableCell className="font-medium">{p.client_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          p.area === 'Penal'
                            ? 'border-red-200 text-red-700 bg-red-50'
                            : 'border-blue-200 text-blue-700 bg-blue-50'
                        }
                      >
                        {p.area}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'Prazo Fatal' ? 'destructive' : 'secondary'}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{p.minutes?.[0]?.count || 0}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Dialog defaultOpen={focusId === p.id}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2">
                            <FileText className="h-4 w-4" />
                            Detalhes
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Detalhes do Processo</DialogTitle>
                          </DialogHeader>
                          <div className="text-sm text-muted-foreground mb-2">
                            Processo nº {p.case_number} - Cliente: {p.client_name}
                          </div>

                          <Tabs defaultValue="documentos" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="documentos">Documentos</TabsTrigger>
                              <TabsTrigger value="minutas">Minutas</TabsTrigger>
                            </TabsList>
                            <TabsContent value="documentos" className="mt-2">
                              <ProcessDocuments processId={p.id} processName={p.case_number} />
                            </TabsContent>
                            <TabsContent value="minutas" className="mt-2">
                              <ProcessMinutas processId={p.id} caseNumber={p.case_number} />
                            </TabsContent>
                          </Tabs>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
