import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Clock, Plus, Check, Pencil, Trash2, RotateCcw, Calculator, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import HelpButton from '@/components/HelpButton'
import { useToast } from '@/hooks/use-toast'
import { calcularPrazo, TIPOS_PRAZO } from '@/lib/prazo'

type Prazo = {
  id: string
  titulo: string
  descricao: string | null
  due_date: string
  status: string
  process_id: string | null
  processes?: { case_number: string | null; client_name: string | null } | null
}
type Proc = { id: string; case_number: string | null; client_name: string | null }

const emptyForm = { titulo: '', descricao: '', due_date: '', process_id: '' }
const emptyCalc = { intimacao: '', tipoKey: 'contestacao', diasCustom: 15, corridosCustom: false, emDobro: false }

function diffDays(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

function urgencia(p: Prazo): { label: string; cls: string } {
  if (p.status === 'cumprido') return { label: 'Cumprido', cls: 'bg-emerald-100 text-emerald-700 border-transparent' }
  const n = diffDays(p.due_date)
  if (n < 0) return { label: `Vencido há ${Math.abs(n)} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`, cls: 'bg-red-600 text-white border-transparent' }
  if (n === 0) return { label: 'Vence hoje', cls: 'bg-red-600 text-white border-transparent' }
  if (n <= 3) return { label: `Faltam ${n} ${n === 1 ? 'dia' : 'dias'}`, cls: 'bg-amber-100 text-amber-800 border-amber-300' }
  if (n <= 7) return { label: `Faltam ${n} dias`, cls: 'bg-[#c9a35a]/20 text-[#8a6d2f] border-[#c9a35a]/40' }
  return { label: `Faltam ${n} dias`, cls: 'bg-slate-100 text-slate-600 border-transparent' }
}

const fmtData = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('pt-BR')

export default function Prazos() {
  const { toast } = useToast()
  const [prazos, setPrazos] = useState<Prazo[]>([])
  const [procs, setProcs] = useState<Proc[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'por_vencer' | 'todos' | 'cumpridos'>('por_vencer')
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [mode, setMode] = useState<'calcular' | 'manual'>('calcular')
  const [calc, setCalc] = useState(emptyCalc)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: pz }, { data: pr }] = await Promise.all([
      supabase.from('prazos').select('id, titulo, descricao, due_date, status, process_id, processes(case_number, client_name)').order('due_date', { ascending: true }),
      supabase.from('processes').select('id, case_number, client_name').order('created_at', { ascending: false }),
    ])
    setPrazos((pz as Prazo[]) ?? [])
    setProcs((pr as Proc[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const tipo = TIPOS_PRAZO.find((t) => t.key === calc.tipoKey) ?? TIPOS_PRAZO[0]
  const diasCalc = calc.tipoKey === 'custom' ? Number(calc.diasCustom) || 0 : tipo.dias
  const contagem = calc.tipoKey === 'custom' ? (calc.corridosCustom ? 'corridos' : 'uteis') : tipo.contagem
  const calcResult = useMemo(
    () => calcularPrazo({ intimacao: calc.intimacao, dias: diasCalc, contagem, emDobro: calc.emDobro }),
    [calc.intimacao, diasCalc, contagem, calc.emDobro],
  )

  // Quando calculando, a data fatal computada alimenta o due_date do formulário.
  useEffect(() => {
    if (mode === 'calcular' && calcResult.fatal) {
      setForm((f) => ({ ...f, due_date: calcResult.fatal as string }))
    }
  }, [mode, calcResult.fatal])

  const openNew = () => { setEditId(null); setForm(emptyForm); setCalc(emptyCalc); setMode('calcular'); setOpen(true) }
  const openEdit = (p: Prazo) => {
    setEditId(p.id)
    setForm({ titulo: p.titulo, descricao: p.descricao ?? '', due_date: p.due_date, process_id: p.process_id ?? '' })
    setMode('manual')
    setOpen(true)
  }

  const save = async () => {
    const due = mode === 'calcular' ? calcResult.fatal ?? '' : form.due_date
    const titulo = form.titulo.trim() || (mode === 'calcular' && calc.tipoKey !== 'custom' ? tipo.label : '')
    if (!titulo || !due) {
      toast({ title: 'Preencha o título e a data', description: mode === 'calcular' ? 'Informe a data da intimação para calcular a data fatal.' : undefined, variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload = {
      titulo,
      descricao: form.descricao.trim() || null,
      due_date: due,
      process_id: form.process_id || null,
    }
    const { error } = editId
      ? await supabase.from('prazos').update(payload).eq('id', editId)
      : await supabase.from('prazos').insert(payload)
    setSaving(false)
    if (error) { toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }); return }
    toast({ title: editId ? 'Prazo atualizado' : 'Prazo criado' })
    setOpen(false)
    load()
  }

  const toggleStatus = async (p: Prazo) => {
    const novo = p.status === 'cumprido' ? 'pendente' : 'cumprido'
    const { error } = await supabase.from('prazos').update({ status: novo }).eq('id', p.id)
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return }
    load()
  }

  const remove = async (p: Prazo) => {
    if (!window.confirm(`Excluir o prazo "${p.titulo}"?`)) return
    const { error } = await supabase.from('prazos').delete().eq('id', p.id)
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return }
    toast({ title: 'Prazo excluído' })
    load()
  }

  const filtrados = prazos.filter((p) =>
    tab === 'cumpridos' ? p.status === 'cumprido'
      : tab === 'por_vencer' ? p.status !== 'cumprido'
      : true,
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Clock className="h-6 w-6 text-primary" /> Prazos <HelpButton anchor="prazos" />
          </h1>
          <p className="text-sm text-muted-foreground">Controle de prazos e datas-limite dos seus processos.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Novo prazo</Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="por_vencer">Por vencer</TabsTrigger>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="cumpridos">Cumpridos</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 text-center text-muted-foreground">Carregando…</div>
          ) : filtrados.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Clock className="mx-auto mb-3 h-10 w-10 opacity-30" />
              Nenhum prazo {tab === 'cumpridos' ? 'cumprido' : tab === 'por_vencer' ? 'em aberto' : 'cadastrado'}.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Processo</TableHead>
                  <TableHead>Data-limite</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((p) => {
                  const u = urgencia(p)
                  return (
                    <TableRow key={p.id} className={p.status === 'cumprido' ? 'opacity-60' : ''}>
                      <TableCell>
                        <div className="font-medium">{p.titulo}</div>
                        {p.descricao && <div className="text-xs text-muted-foreground">{p.descricao}</div>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.processes?.case_number
                          ? <span>{p.processes.case_number}{p.processes.client_name ? ` · ${p.processes.client_name}` : ''}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">{fmtData(p.due_date)}</TableCell>
                      <TableCell><Badge className={u.cls} variant="outline">{u.label}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title={p.status === 'cumprido' ? 'Reabrir' : 'Marcar cumprido'} onClick={() => toggleStatus(p)}>
                            {p.status === 'cumprido' ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Excluir" onClick={() => remove(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar prazo' : 'Novo prazo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="titulo">Título{mode === 'manual' || calc.tipoKey === 'custom' ? ' *' : ''}</Label>
              <Input id="titulo" placeholder={mode === 'calcular' && calc.tipoKey !== 'custom' ? `Padrão: ${tipo.label}` : 'Ex.: Contestação'} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>

            {!editId && (
              <div className="flex gap-2 rounded-lg bg-muted p-1">
                <button type="button" onClick={() => setMode('calcular')} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === 'calcular' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
                  <Calculator className="h-4 w-4" /> Calcular do ato
                </button>
                <button type="button" onClick={() => setMode('manual')} className={`flex flex-1 items-center justify-center rounded-md py-1.5 text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
                  Informar data
                </button>
              </div>
            )}

            {mode === 'calcular' && !editId ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="intim">Data da intimação *</Label>
                    <Input id="intim" type="date" value={calc.intimacao} onChange={(e) => setCalc({ ...calc, intimacao: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de ato</Label>
                    <Select value={calc.tipoKey} onValueChange={(v) => setCalc({ ...calc, tipoKey: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPOS_PRAZO.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {calc.tipoKey === 'custom' && (
                  <div className="flex items-end gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="diasc">Nº de dias</Label>
                      <Input id="diasc" type="number" min={1} className="w-28" value={calc.diasCustom} onChange={(e) => setCalc({ ...calc, diasCustom: Number(e.target.value) })} />
                    </div>
                    <label className="flex items-center gap-2 pb-2 text-sm">
                      <Checkbox checked={calc.corridosCustom} onCheckedChange={(v) => setCalc({ ...calc, corridosCustom: !!v })} />
                      Contar em dias corridos
                    </label>
                  </div>
                )}

                <label className="flex items-start gap-2 text-sm">
                  <Checkbox className="mt-0.5" checked={calc.emDobro} onCheckedChange={(v) => setCalc({ ...calc, emDobro: !!v })} />
                  <span>Prazo em <strong>dobro</strong> — Fazenda Pública (CPC 183), Defensoria (CPC 186) ou litisconsortes com advogados distintos em autos físicos (CPC 229)</span>
                </label>

                {/* Resultado */}
                {calcResult.fatal ? (
                  <div className="rounded-lg border border-[#1e3a5f]/15 bg-[#1e3a5f]/[0.03] p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data fatal</span>
                      {calc.tipoKey !== 'custom' && tipo.base && <span className="text-xs text-muted-foreground">{tipo.base}</span>}
                    </div>
                    <p className="mt-1 font-serif text-2xl font-bold text-[#1e3a5f]">{fmtData(calcResult.fatal)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {diasCalc}{calc.emDobro ? '×2' : ''} dias {contagem === 'uteis' ? 'úteis' : 'corridos'}, início em {calcResult.inicio ? fmtData(calcResult.inicio) : '—'}.
                    </p>
                    {calcResult.avisos.map((a, i) => (
                      <div key={i} className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{a}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Informe a data da intimação para calcular a data fatal.</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="due">Data-limite *</Label>
                <Input id="due" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            )}

            <div className="space-y-2">
              <Label>Processo (opcional)</Label>
              <Select value={form.process_id || 'none'} onValueChange={(v) => setForm({ ...form, process_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Sem processo vinculado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem processo vinculado</SelectItem>
                  {procs.map((pr) => (
                    <SelectItem key={pr.id} value={pr.id}>
                      {pr.case_number || 'Sem número'}{pr.client_name ? ` · ${pr.client_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="desc">Observações (opcional)</Label>
              <Textarea id="desc" rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
