import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import { format, subDays, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { DollarSign, Activity, Users, Bot, Zap, Info, Clock, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface DailyStats {
  date: string
  cost: number
  invocations: number
}
interface AgentStats {
  agent_id: string
  agent_name: string
  invocations_count: number
  total_tokens: number
  total_cost: number
}
interface UserStats {
  user_id: string
  full_name: string
  invocations_count: number
  total_cost: number
  last_activity: string
}
interface RecentInvocation {
  id: string
  created_at: string
  input_tokens: number
  output_tokens: number
  estimated_cost: number
  currency: string
  agent_name: string
  agent_model: string
  user_name: string
}

export default function Auditoria() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [budget, setBudget] = useState(0)
  const [role, setRole] = useState('member')
  const [workspaceName, setWorkspaceName] = useState('Workspace')

  const [dailyData, setDailyData] = useState<DailyStats[]>([])
  const [agentRanking, setAgentRanking] = useState<AgentStats[]>([])
  const [userRanking, setUserRanking] = useState<UserStats[]>([])
  const [recent, setRecent] = useState<RecentInvocation[]>([])

  const [selectedInvocation, setSelectedInvocation] = useState<RecentInvocation | null>(null)

  useEffect(() => {
    async function loadData() {
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('workspace_id, role')
        .eq('id', user.id)
        .single()
      if (profile) {
        setRole(profile.role)
        if (profile.workspace_id) {
          const { data: workspace } = await supabase
            .from('workspaces')
            .select('name, budget_mensal_usd')
            .eq('id', profile.workspace_id)
            .single()
          if (workspace) {
            setBudget(workspace.budget_mensal_usd)
            setWorkspaceName(workspace.name)
          }
        }
      }

      const now = new Date()
      const currentMonthStart = startOfMonth(now)
      const start30 = subDays(now, 30)
      const fetchStart =
        currentMonthStart < start30 ? currentMonthStart.toISOString() : start30.toISOString()
      const end = now.toISOString()

      const [dailyRes, agentRes, userRes, recentRes] = await Promise.all([
        supabase.rpc('get_daily_consumption', { start_date: fetchStart, end_date: end }),
        supabase.rpc('get_agent_ranking', { start_date: fetchStart, end_date: end }),
        supabase.rpc('get_user_ranking', { start_date: fetchStart, end_date: end }),
        supabase
          .from('vw_recent_invocations')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      setDailyData(dailyRes.data || [])
      setAgentRanking(agentRes.data || [])
      setUserRanking(userRes.data || [])
      setRecent(recentRes.data || [])
      setLoading(false)
    }
    loadData()
  }, [user])

  const formatUSD = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
  const formatDate = (dateStr: string) =>
    format(new Date(dateStr), 'dd MMM yyyy, HH:mm', { locale: ptBR })

  const currentMonthData = dailyData.filter((d) => {
    const dDate = new Date(d.date + 'T12:00:00')
    const now = new Date()
    return dDate.getMonth() === now.getMonth() && dDate.getFullYear() === now.getFullYear()
  })

  const monthlySpend = currentMonthData.reduce((acc, curr) => acc + Number(curr.cost), 0)
  const monthlyInvocations = currentMonthData.reduce(
    (acc, curr) => acc + Number(curr.invocations),
    0,
  )
  const budgetPercentage = budget > 0 ? (monthlySpend / budget) * 100 : 0

  const getProgressColor = (pct: number) => {
    if (pct < 50) return 'bg-green-500'
    if (pct <= 80) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const chartData = dailyData
    .filter((d) => new Date(d.date + 'T12:00:00') >= subDays(new Date(), 30))
    .map((d) => ({
      ...d,
      dateFormatted: format(new Date(d.date + 'T12:00:00'), 'dd/MM'),
      cost: Number(d.cost),
      invocations: Number(d.invocations),
    }))

  const chartConfig = {
    cost: { label: 'Custo (USD)', color: 'hsl(var(--primary))' },
    invocations: { label: 'Invocações', color: 'hsl(var(--destructive))' },
  }

  const totalWorkspaceCost = agentRanking.reduce((acc, curr) => acc + Number(curr.total_cost), 0)

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  const isAdmin = role === 'admin' || role === 'owner'

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard de Auditoria</h1>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            Visualizando dados de <strong>{isAdmin ? workspaceName : 'seu consumo pessoal'}</strong>
            <Badge variant={isAdmin ? 'default' : 'secondary'}>{role.toUpperCase()}</Badge>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gasto Mensal</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatUSD(monthlySpend)}</div>
            <p className="text-xs text-muted-foreground">Mês atual</p>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Orçamento Mensal</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatUSD(budget)}</div>
              <p className="text-xs text-muted-foreground">Definido para o workspace</p>
            </CardContent>
          </Card>
        )}

        <Card className={!isAdmin ? 'lg:col-span-2' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consumo do Orçamento</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{budgetPercentage.toFixed(1)}%</div>
            <Progress
              value={Math.min(budgetPercentage, 100)}
              indicatorClassName={getProgressColor(budgetPercentage)}
              className="mt-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Invocações</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{monthlyInvocations}</div>
            <p className="text-xs text-muted-foreground">Mês atual</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Consumo Diário (Últimos 30 Dias)</CardTitle>
          <CardDescription>Comparativo de custo vs invocações diárias</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="dateFormatted" />
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  stroke="var(--color-cost)"
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis yAxisId="right" orientation="right" stroke="var(--color-invocations)" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="cost"
                  stroke="var(--color-cost)"
                  strokeWidth={2}
                  activeDot={{ r: 6 }}
                  name="Custo (USD)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="invocations"
                  stroke="var(--color-invocations)"
                  strokeWidth={2}
                  name="Invocações"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" /> Top Agentes
            </CardTitle>
            <CardDescription>Agentes com maior consumo no período</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agente</TableHead>
                    <TableHead className="text-right">Invocações</TableHead>
                    <TableHead className="text-right">Tokens Totais</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    {isAdmin && <TableHead className="text-right">%</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentRanking.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Sem dados.
                      </TableCell>
                    </TableRow>
                  )}
                  {agentRanking.map((agent) => (
                    <TableRow key={agent.agent_id}>
                      <TableCell className="font-medium">{agent.agent_name}</TableCell>
                      <TableCell className="text-right">{agent.invocations_count}</TableCell>
                      <TableCell className="text-right">
                        {agent.total_tokens.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatUSD(agent.total_cost)}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right text-muted-foreground">
                          {totalWorkspaceCost > 0
                            ? ((agent.total_cost / totalWorkspaceCost) * 100).toFixed(1)
                            : 0}
                          %
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" /> Top Usuários
              </CardTitle>
              <CardDescription>Usuários com maior geração de custos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead className="text-right">Invocações</TableHead>
                      <TableHead className="text-right">Custo Total</TableHead>
                      <TableHead className="text-right">Última Atividade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userRanking.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          Sem dados.
                        </TableCell>
                      </TableRow>
                    )}
                    {userRanking.map((userStats) => (
                      <TableRow key={userStats.user_id}>
                        <TableCell className="font-medium">{userStats.full_name}</TableCell>
                        <TableCell className="text-right">{userStats.invocations_count}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatUSD(userStats.total_cost)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {userStats.last_activity
                            ? format(new Date(userStats.last_activity), 'dd/MM/yyyy HH:mm')
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Últimas Invocações
          </CardTitle>
          <CardDescription>Feed das últimas interações com os agentes de IA</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  {isAdmin && <TableHead>Usuário</TableHead>}
                  <TableHead>Agente</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Nenhuma invocação recente.
                    </TableCell>
                  </TableRow>
                )}
                {recent.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedInvocation(item)}
                  >
                    <TableCell className="whitespace-nowrap">
                      {formatDate(item.created_at)}
                    </TableCell>
                    {isAdmin && <TableCell>{item.user_name || 'Desconhecido'}</TableCell>}
                    <TableCell>{item.agent_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.agent_model}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {(item.input_tokens + item.output_tokens).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatUSD(item.estimated_cost || 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={item.output_tokens > 0 ? 'default' : 'destructive'}
                        className={item.output_tokens > 0 ? 'bg-green-500 hover:bg-green-600' : ''}
                      >
                        {item.output_tokens > 0 ? 'Sucesso' : 'Falha'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!selectedInvocation}
        onOpenChange={(open) => !open && setSelectedInvocation(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes da Invocação</DialogTitle>
            <DialogDescription>ID: {selectedInvocation?.id}</DialogDescription>
          </DialogHeader>
          {selectedInvocation && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Data/Hora</p>
                  <p>{formatDate(selectedInvocation.created_at)}</p>
                </div>
                {isAdmin && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Usuário</p>
                    <p>{selectedInvocation.user_name || 'Desconhecido'}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Agente</p>
                  <p>{selectedInvocation.agent_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Modelo</p>
                  <p>{selectedInvocation.agent_model}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tokens de Entrada</p>
                  <p>{selectedInvocation.input_tokens.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tokens de Saída</p>
                  <p>{selectedInvocation.output_tokens.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Custo Estimado</p>
                  <p className="font-semibold text-primary">
                    {formatUSD(selectedInvocation.estimated_cost || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <Badge
                    variant={selectedInvocation.output_tokens > 0 ? 'default' : 'destructive'}
                    className={selectedInvocation.output_tokens > 0 ? 'bg-green-500' : ''}
                  >
                    {selectedInvocation.output_tokens > 0 ? 'Sucesso' : 'Falha'}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
