import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Scale, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

/**
 * Cadastro dos advogados do escritório (tabela `lawyers`, isolada por workspace).
 * Alimenta o dropdown "Advogado Responsável" do Gerador de Minutas — que só
 * aparece quando há ao menos um advogado cadastrado.
 * workspace_id é preenchido automaticamente pelo trigger no INSERT.
 */
type Lawyer = { id: string; full_name: string; oab_number: string | null }

export default function AdvogadosSection() {
  const { toast } = useToast()
  const [lawyers, setLawyers] = useState<Lawyer[]>([])
  const [nome, setNome] = useState('')
  const [oab, setOab] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('lawyers').select('id, full_name, oab_number').order('full_name')
    setLawyers((data as Lawyer[]) ?? [])
  }
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!nome.trim()) { toast({ title: 'Informe o nome do advogado', variant: 'destructive' }); return }
    setSaving(true)
    const { error } = await supabase.from('lawyers').insert({ full_name: nome.trim(), oab_number: oab.trim() || null })
    setSaving(false)
    if (error) { toast({ title: 'Erro ao adicionar', description: error.message, variant: 'destructive' }); return }
    setNome(''); setOab(''); toast({ title: 'Advogado adicionado' }); load()
  }

  const remove = async (l: Lawyer) => {
    if (!window.confirm(`Remover ${l.full_name} da lista de advogados?`)) return
    const { error } = await supabase.from('lawyers').delete().eq('id', l.id)
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return }
    toast({ title: 'Advogado removido' }); load()
  }

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" /> Advogados do escritório
        </CardTitle>
        <CardDescription>
          Cadastre os advogados que poderão ser selecionados como responsáveis nas minutas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="adv-nome">Nome *</Label>
            <Input id="adv-nome" placeholder="Nome completo do advogado" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="w-full space-y-1.5 sm:w-56">
            <Label htmlFor="adv-oab">OAB</Label>
            <Input id="adv-oab" placeholder="Ex.: OAB/DF 12.345" value={oab} onChange={(e) => setOab(e.target.value)} />
          </div>
          <Button onClick={add} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar
          </Button>
        </div>

        {lawyers.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>OAB</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lawyers.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.full_name}</TableCell>
                    <TableCell>{l.oab_number || '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" title="Remover" onClick={() => remove(l)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum advogado cadastrado ainda. Adicione ao menos um para poder selecioná-lo como responsável nas minutas.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
