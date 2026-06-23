import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { FolderOpen, FileEdit, Trash2, Search as SearchIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

const MINUTE_TYPES = [
  'Todos',
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

export default function Minutas() {
  const [minutes, setMinutes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('Todos')
  const { toast } = useToast()
  const navigate = useNavigate()

  const loadMinutes = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('minutes')
      .select('*, processes(case_number)')
      .order('updated_at', { ascending: false })

    if (error) {
      toast({
        title: 'Erro ao carregar minutas',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      setMinutes(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadMinutes()
  }, [])

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('minutes').delete().eq('id', id)
    if (error) {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Sucesso',
        description: 'Minuta excluída com sucesso.',
      })
      setMinutes((prev) => prev.filter((m) => m.id !== id))
    }
  }

  const filteredMinutes = useMemo(() => {
    const term = searchTerm.toLowerCase()
    return minutes.filter((m) => {
      const matchesSearch =
        (m.title || '').toLowerCase().includes(term) ||
        (m.client_name || '').toLowerCase().includes(term) ||
        (m.comarca || '').toLowerCase().includes(term) ||
        ((m as any).objeto || '').toLowerCase().includes(term) ||
        ((m as any).pedido || '').toLowerCase().includes(term) ||
        (m.content || '').toLowerCase().includes(term) ||
        (m.processes?.case_number || '').toLowerCase().includes(term)
      const matchesType = selectedType === 'Todos' || (m as any).minute_type === selectedType
      return matchesSearch && matchesType
    })
  }, [minutes, searchTerm, selectedType])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
          <FolderOpen className="h-8 w-8" /> Minutas Salvas
        </h1>
        <p className="text-muted-foreground mt-1">
          Gerencie e acesse seus rascunhos e peças geradas.
        </p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
          <CardTitle className="text-lg">Acervo de Documentos</CardTitle>
          <div className="flex items-center gap-3">
            <div className="relative w-full md:w-64">
              <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, cliente, processo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo de Minuta" />
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
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Processo</TableHead>
                <TableHead>Atualizada em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Carregando minutas...
                  </TableCell>
                </TableRow>
              ) : filteredMinutes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhuma minuta encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMinutes.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium max-w-[200px] truncate" title={m.title}>
                      {m.title}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        {(m as any).minute_type ? (
                          <Badge variant="outline" className="whitespace-nowrap">
                            {(m as any).minute_type}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                        <Badge
                          variant={
                            m.approval_status === 'aprovada'
                              ? 'default'
                              : m.approval_status === 'em_revisao'
                                ? 'secondary'
                                : 'outline'
                          }
                          className={cn(
                            'text-[10px] px-1.5 py-0',
                            m.approval_status === 'aprovada' &&
                              'bg-green-100 text-green-800 border-green-200',
                            m.approval_status === 'em_revisao' &&
                              'bg-yellow-100 text-yellow-800 border-yellow-200',
                          )}
                        >
                          {m.approval_status === 'aprovada'
                            ? 'Aprovada'
                            : m.approval_status === 'em_revisao'
                              ? 'Em revisão'
                              : 'Rascunho'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate" title={m.client_name}>
                      {m.client_name || <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {m.processes?.case_number ? (
                        <button
                          onClick={() => navigate(`/processos?focus=${m.process_id}`)}
                          className="text-blue-600 hover:underline cursor-pointer"
                          title="Ir para o processo"
                        >
                          {m.processes.case_number}
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(m.updated_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/gerador-minutas?id=${m.id}`)}
                          title="Editar"
                        >
                          <FileEdit className="h-4 w-4 text-blue-600" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="Excluir">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir minuta?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. A minuta "{m.title}" será removida
                                permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(m.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
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
