import { useEffect, useState } from 'react'
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
import { Briefcase } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

export default function Processos() {
  const [processes, setProcesses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('processes')
      .select('*')
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : processes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
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
