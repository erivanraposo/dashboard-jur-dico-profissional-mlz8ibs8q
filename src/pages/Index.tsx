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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts'
import { Briefcase, CalendarClock, FileEdit, Gavel, ArrowRight, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { Link } from 'react-router-dom'

export default function Index() {
  const [stats, setStats] = useState({ active: 0, drafts: 0, civil: 0, penal: 0, deadlines: 0 })
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [
          { count: activeCount },
          { count: draftCount },
          { data: procs },
          { data: deadlines },
          { data: minutesData },
        ] = await Promise.all([
          supabase
            .from('processes')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'Ativo'),
          supabase
            .from('minutes')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'Draft'),
          supabase.from('processes').select('area'),
          supabase.from('processes').select('*', { count: 'exact' }).eq('status', 'Prazo Fatal'),
          supabase
            .from('minutes')
            .select('id, title, status, created_at, process_id')
            .order('created_at', { ascending: false })
            .limit(5),
        ])

        const penal = procs?.filter((p) => p.area === 'Penal').length || 0
        const civil = procs?.filter((p) => p.area === 'Cível').length || 0

        setStats({
          active: activeCount || 0,
          drafts: draftCount || 0,
          civil,
          penal,
          deadlines: deadlines?.length || 0,
        })

        if (minutesData) {
          setRecentActivity(
            minutesData.map((m) => ({
              id: m.id,
              action: `Minuta criada: ${m.title}`,
              process: m.process_id ? 'Vinculada' : 'Avulsa',
              type: 'Geral',
              date: new Date(m.created_at).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              }),
            })),
          )
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const kpiData = [
    {
      title: 'Processos Ativos',
      value: stats.active.toString(),
      icon: Briefcase,
      trend: 'Sincronizado',
    },
    {
      title: 'Prazos Fatais',
      value: stats.deadlines.toString(),
      icon: CalendarClock,
      trend: stats.deadlines > 0 ? 'Atenção necessária' : 'Tudo em dia',
      urgent: stats.deadlines > 0,
    },
    {
      title: 'Minutas em Rascunho',
      value: stats.drafts.toString(),
      icon: FileEdit,
      trend: 'Aguardando revisão',
    },
    { title: 'Jurisprudências Salvas', value: '3', icon: Gavel, trend: 'Base de conhecimento' },
  ]

  const chartData = [
    { name: 'Direito Penal', value: stats.penal || 1, color: 'var(--color-penal)' },
    { name: 'Direito Cível', value: stats.civil || 1, color: 'var(--color-civel)' },
  ]

  const chartConfig = {
    penal: { label: 'Penal', color: 'hsl(var(--chart-2))' },
    civel: { label: 'Cível', color: 'hsl(var(--chart-3))' },
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="animate-spin text-primary mr-2" /> Carregando dashboard...
      </div>
    )

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary uppercase">
            LexControl Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Resumo em tempo real dos seus processos e atividades.
          </p>
        </div>
        <div className="flex flex-col md:items-end gap-3">
          <Button className="hidden md:flex gap-2 w-fit" asChild>
            <Link to="/gerador">
              <FileEdit className="h-4 w-4" /> Nova Minuta
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiData.map((kpi, i) => (
          <Card key={i} className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.urgent ? 'text-red-600' : 'text-primary/60'}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <p
                className={`text-xs mt-1 ${kpi.urgent ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}
              >
                {kpi.trend}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4 border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Atividade Recente (Minutas)</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Últimos documentos criados ou editados.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhuma atividade recente.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ação</TableHead>
                    <TableHead>Processo</TableHead>
                    <TableHead className="text-right">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentActivity.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium text-sm">{item.action}</TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {item.process}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {item.date}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-3 border-border/50 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle>Distribuição de Processos</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Ativos por ramo do direito.</p>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center pb-8">
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
