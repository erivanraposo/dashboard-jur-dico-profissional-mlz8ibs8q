import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

type P = {
  id: string
  titulo: string
  due_date: string
  processes?: { case_number: string | null; client_name: string | null } | null
}

function diffDays(s: string) {
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((new Date(s + 'T00:00:00').getTime() - t.getTime()) / 86_400_000)
}
function badge(s: string): { label: string; cls: string } {
  const n = diffDays(s)
  if (n < 0) return { label: `Vencido há ${Math.abs(n)}d`, cls: 'bg-red-600 text-white border-transparent' }
  if (n === 0) return { label: 'Hoje', cls: 'bg-red-600 text-white border-transparent' }
  if (n <= 3) return { label: `${n}d`, cls: 'bg-amber-100 text-amber-800 border-amber-300' }
  if (n <= 7) return { label: `${n}d`, cls: 'bg-[#c9a35a]/20 text-[#8a6d2f] border-[#c9a35a]/40' }
  return { label: `${n}d`, cls: 'bg-slate-100 text-slate-600 border-transparent' }
}
const fmt = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('pt-BR')

export default function PrazosProximos() {
  const [prazos, setPrazos] = useState<P[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('prazos')
      .select('id, titulo, due_date, processes(case_number, client_name)')
      .eq('status', 'pendente')
      .order('due_date', { ascending: true })
      .limit(5)
      .then(({ data }) => { setPrazos((data as P[]) ?? []); setLoading(false) })
  }, [])

  if (loading || prazos.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-5 w-5 text-primary" /> Prazos próximos
        </CardTitle>
        <Link to="/prazos" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          Ver todos <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-1">
        {prazos.map((p) => {
          const b = badge(p.due_date)
          return (
            <Link key={p.id} to="/prazos" className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{p.titulo}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.processes?.case_number ? `${p.processes.case_number}` : 'Sem processo'} · {fmt(p.due_date)}
                </div>
              </div>
              <Badge className={b.cls} variant="outline">{b.label}</Badge>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}
