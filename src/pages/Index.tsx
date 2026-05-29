import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import { Briefcase, Bot, DollarSign, Activity, FileEdit, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { format, subDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function Index() {
  const [stats, setStats] = useState({
    processes: 0,
    agents: 0,
    invocations: 0,
    cost: 0,
  })
  const [dailyData, setDailyData] = useState<any[]>([])
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [agentsRanking, setAgentsRanking] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    if (authLoading) return

    const loadData = async () => {
      try {
        const endDate = new Date().toISOString()
        const startDate = subDays(new Date(), 30).toISOString()

        const [
          { count: processesCount },
          { count: agentsCount },
          { count: invocationsCount },
          { data: custosData },
          { data: dailyConsumption },
          { data: recentInvocations },
          { data: agentRanking },
          { data: profileData },
        ] = await Promise.all([
          supabase.from('processes').select('*', { count: 'exact', head: true }),
          supabase
            .from('agentes')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true),
          supabase.from('invocacoes').select('*', { count: 'exact', head: true }),
          supabase.from('custos').select('estimated_cost'),
          supabase.rpc('get_daily_consumption', { start_date: startDate, end_date: endDate }),
          supabase
            .from('vw_recent_invocations')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(6),
          supabase.rpc('get_agent_ranking', { start_date: startDate, end_date: endDate }),
          user
            ? supabase.from('profiles').select('*').eq('id', user.id).single()
            : Promise.resolve({ data: null }),
        ])

        if (profileData) {
          setProfile(profileData)
        }

        const totalCost =
          custosData?.reduce((acc, curr) => acc + (curr.estimated_cost || 0), 0) || 0

        setStats({
          processes: processesCount || 0,
          agents: agentsCount || 0,
          invocations: invocationsCount || 0,
          cost: totalCost,
        })

        if (dailyConsumption) {
          const formattedDaily = dailyConsumption.map((d) => ({
            ...d,
            displayDate: format(parseISO(d.date), 'dd/MM', { locale: ptBR }),
          }))
          setDailyData(formattedDaily)
        }

        if (recentInvocations) {
          setRecentActivity(recentInvocations)
        }

        if (agentRanking) {
          setAgentsRanking(agentRanking.slice(0, 5))
        }
      } catch (err) {
        console.error('Error loading dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user, authLoading])

  const chartConfig = {
    invocations: {
      label: 'Invocações',
      color: 'hsl(var(--primary))',
    },
  }

  if (loading || authLoading) {
    return (
      <div className="space-y-8 max-w-7xl mx-auto p-4 md:p-8">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-8 w-[250px]" />
            <Skeleton className="h-4 w-[350px]" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-[140px]" />
            <Skeleton className="h-10 w-[140px]" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[120px] w-full rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-7">
          <Skeleton className="md:col-span-4 h-[400px] rounded-xl" />
          <Skeleton className="md:col-span-3 h-[400px] rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4 md:p-8 animate-fade-in-up">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard Geral</h1>
          <p className="text-muted-foreground mt-1">
            Visão completa das suas atividades, processos e consumo de IA.
            {profile?.workspace_id && <span className="ml-1 opacity-50">(Workspace Ativo)</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" asChild className="hidden sm:flex gap-2">
            <Link to="/processos">
              <Briefcase className="h-4 w-4" /> Ver Processos
            </Link>
          </Button>
          <Button asChild className="flex gap-2 shadow-sm">
            <Link to="/gerador">
              <FileEdit className="h-4 w-4" /> Nova Minuta
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Processos Cadastrados
            </CardTitle>
            <Briefcase className="h-4 w-4 text-primary/70" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.processes}</div>
            <p className="text-xs text-muted-foreground mt-1">Total na base de dados</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Agentes Ativos
            </CardTitle>
            <Bot className="h-4 w-4 text-primary/70" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.agents}</div>
            <p className="text-xs text-muted-foreground mt-1">Modelos de IA disponíveis</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Invocações (Total)
            </CardTitle>
            <Activity className="h-4 w-4 text-primary/70" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.invocations}</div>
            <p className="text-xs text-muted-foreground mt-1">Requisições à IA geradas</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Custo Estimado (Total)
            </CardTitle>
            <DollarSign className="h-4 w-4 text-primary/70" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                stats.cost,
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Gasto total acumulado</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4 border-border/50 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle>Consumo Diário (Últimos 30 Dias)</CardTitle>
            <CardDescription>
              Quantidade de invocações feitas aos agentes de IA por dia.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-4">
            {dailyData.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="displayDate"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={10}
                      fontSize={12}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={10}
                      fontSize={12}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      cursor={{ fill: 'hsl(var(--muted))' }}
                    />
                    <Bar
                      dataKey="invocations"
                      fill="var(--color-invocations)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex flex-col items-center justify-center text-center text-muted-foreground space-y-3">
                <Activity className="h-10 w-10 opacity-20" />
                <p>Nenhuma atividade registrada nos últimos 30 dias.</p>
                <Button variant="outline" asChild size="sm">
                  <Link to="/gerador">Criar primeira minuta</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-3 border-border/50 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle>Top Agentes (30 Dias)</CardTitle>
            <CardDescription>Os modelos de IA mais utilizados e seus custos.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {agentsRanking.length > 0 ? (
              <div className="space-y-5">
                {agentsRanking.map((agent, i) => (
                  <div key={agent?.agent_id || i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                        #{i + 1}
                      </div>
                      <div className="truncate">
                        <p className="text-sm font-medium leading-none truncate">
                          {agent?.agent_name || 'Agente Desconhecido'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {agent?.invocations_count || 0} invocações
                        </p>
                      </div>
                    </div>
                    <div className="font-medium text-sm text-right shrink-0">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      }).format(agent?.total_cost || 0)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center text-muted-foreground space-y-3">
                <Bot className="h-10 w-10 opacity-20" />
                <p className="text-sm">Nenhum agente utilizado ainda.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-7 border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Atividades Recentes</CardTitle>
            <CardDescription>Últimas interações da sua equipe com as IAs.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Agente Utilizado</TableHead>
                    <TableHead>Data e Hora</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentActivity.map((act) => (
                    <TableRow key={act?.id || crypto.randomUUID()}>
                      <TableCell className="font-medium">
                        {act?.user_name || 'Desconhecido'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Bot className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{act?.agent_name || 'Agente Genérico'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {act?.created_at
                          ? format(new Date(act.created_at), 'dd/MM/yyyy HH:mm')
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD',
                        }).format(act?.estimated_cost || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center text-muted-foreground space-y-3 border-t border-dashed mt-2">
                <AlertCircle className="h-8 w-8 opacity-20" />
                <p>Nenhuma atividade encontrada no sistema.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
