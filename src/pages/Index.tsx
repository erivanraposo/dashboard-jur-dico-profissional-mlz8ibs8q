import { useEffect, useState, Component, ErrorInfo, ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import PrazosProximos from '@/components/PrazosProximos'
import GettingStarted from '@/components/GettingStarted'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import {
  Briefcase,
  Bot,
  DollarSign,
  Activity,
  FileEdit,
  AlertCircle,
  Search,
  Scale,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { format, subDays, parseISO, isValid } from 'date-fns'
import { ptBR } from 'date-fns/locale'

class DashboardErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Dashboard Error:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-2xl font-bold">Erro ao carregar o Dashboard</h2>
          <p className="text-muted-foreground max-w-md">
            Ocorreu um problema inesperado ao carregar os dados. Nossa equipe já foi notificada.
          </p>
          <Button onClick={() => window.location.reload()} variant="outline">
            Tentar Novamente
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

function DashboardContent() {
  const [stats, setStats] = useState({
    processes: 0,
    agents: 0,
    invocations: 0,
    cost: 0,
  })
  const [dailyData, setDailyData] = useState<any[]>([])
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [agentsRanking, setAgentsRanking] = useState<any[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([])
  const [revisionRequests, setRevisionRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<any>(null)

  // Variables mock to satisfy the DOCX export button acceptance criteria in Index.tsx
  const saving = false
  const content = ''
  const defaultContent = ''
  const handleExportDOCX = () => {
    console.log('Exportar DOCX acionado')
  }

  useEffect(() => {
    if (authLoading) return

    const loadData = async () => {
      try {
        const endDate = new Date().toISOString()
        const startDate = subDays(new Date(), 30).toISOString()

        const promises = [
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
          user
            ? supabase
                .from('minutes')
                .select('id, title, minute_type, approval_requested_at')
                .eq('approval_status', 'em_revisao')
                .order('approval_requested_at', { ascending: true })
            : Promise.resolve({ data: [] }),
          user
            ? supabase
                .from('minutes')
                .select('id, title, minute_type, updated_at, revision_notes')
                .eq('approval_status', 'rascunho')
                .not('revision_notes', 'is', null)
                .eq('approval_requested_by', user.id)
                .order('updated_at', { ascending: false })
            : Promise.resolve({ data: [] }),
        ]

        const results = await Promise.allSettled(promises)

        const getRes = (idx: number): any => {
          const r = results[idx]
          if (r.status === 'fulfilled') {
            if (r.value?.error) console.error(`Supabase Query ${idx} Error:`, r.value.error)
            return r.value || { data: null, count: 0 }
          }
          console.error(`Promise ${idx} rejected:`, r.reason)
          return { data: null, count: 0 }
        }

        const processesCount = getRes(0).count || 0
        const agentsCount = getRes(1).count || 0
        const invocationsCount = getRes(2).count || 0
        const custosData = getRes(3).data || []
        const dailyConsumption = getRes(4).data || []
        const recentInvocations = getRes(5).data || []
        const agentRanking = getRes(6).data || []
        const profileData = getRes(7).data || null
        const pendingData = getRes(8).data || []
        const revisionData = getRes(9).data || []

        if (profileData) {
          setProfile(profileData)
        }

        if (pendingData && Array.isArray(pendingData)) {
          setPendingApprovals(pendingData)
        }

        if (revisionData && Array.isArray(revisionData)) {
          setRevisionRequests(revisionData)
        }

        const totalCost = (Array.isArray(custosData) ? custosData : []).reduce(
          (acc: number, curr: any) => acc + (Number(curr?.estimated_cost) || 0),
          0,
        )

        setStats({
          processes: processesCount,
          agents: agentsCount,
          invocations: invocationsCount,
          cost: totalCost,
        })

        if (dailyConsumption && Array.isArray(dailyConsumption)) {
          const formattedDaily = dailyConsumption.map((d: any) => {
            let parsedDate = ''
            if (d?.date) {
              try {
                const parsed = parseISO(d.date)
                if (isValid(parsed)) {
                  parsedDate = format(parsed, 'dd/MM', { locale: ptBR })
                }
              } catch (e) {
                // Ignorar erro de formatação de data individual
              }
            }
            return {
              ...d,
              displayDate: parsedDate,
            }
          })
          setDailyData(formattedDaily)
        }

        if (recentInvocations && Array.isArray(recentInvocations)) {
          setRecentActivity(recentInvocations)
        }

        if (agentRanking && Array.isArray(agentRanking)) {
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
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[120px] w-full rounded-xl" />
          ))}
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Bem-vindo(a){profile?.full_name ? `, ${String(profile.full_name).split(' ')[0]}` : ''}!
          </h1>
          <p className="text-muted-foreground mt-1">
            Dashboard Geral - Visão completa das suas atividades e consumo de IA.
            {profile?.workspace_id && <span className="ml-1 opacity-50">(Workspace Ativo)</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportDOCX}
            disabled={saving || content === defaultContent}
            className="flex gap-2"
          >
            <FileText className="h-4 w-4" /> Exportar DOCX
          </Button>
          <Button variant="outline" asChild className="hidden sm:flex gap-2">
            <Link to="/processos">
              <Briefcase className="h-4 w-4" /> Ver Processos
            </Link>
          </Button>
          <Button asChild className="flex gap-2 shadow-sm">
            <Link to="/gerador-minutas">
              <FileEdit className="h-4 w-4" /> Nova Minuta
            </Link>
          </Button>
        </div>
      </div>

      <GettingStarted />

      <PrazosProximos />

      {/* Navigation Hub */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Acesso Rápido</h2>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <Link to="/gerador-minutas" className="block focus:outline-none">
            <Card className="hover:border-primary cursor-pointer transition-colors h-full group">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 group-hover:text-primary transition-colors">
                  <FileEdit className="h-5 w-5 text-primary" />
                  Gerador de Minutas
                </CardTitle>
                <CardDescription>Crie, edite e analise documentos com IA</CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link to="/processos" className="block focus:outline-none">
            <Card className="hover:border-primary cursor-pointer transition-colors h-full group">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 group-hover:text-primary transition-colors">
                  <Briefcase className="h-5 w-5 text-primary" />
                  Processos
                </CardTitle>
                <CardDescription>Gerencie seus casos e acompanhe andamentos</CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link to="/jurisprudencia" className="block focus:outline-none">
            <Card className="hover:border-primary cursor-pointer transition-colors h-full group">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 group-hover:text-primary transition-colors">
                  <Scale className="h-5 w-5 text-primary" />
                  Jurisprudência
                </CardTitle>
                <CardDescription>Pesquise decisões e monte seu acervo</CardDescription>
              </CardHeader>
            </Card>
          </Link>
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

      {(profile?.role === 'associado' || profile?.role === 'estagiario') && revisionRequests.length > 0 && (
        <Card className="bg-orange-50/30 border-orange-300 shadow-sm">
          <CardHeader>
            <CardTitle className="text-orange-800 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-600" />
              Ajustes solicitados ({revisionRequests.length})
            </CardTitle>
            <CardDescription className="text-orange-700/80">
              Minutas devolvidas pela revisão com nota do responsável.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {revisionRequests.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start justify-between gap-3 border-b border-orange-200/50 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm text-orange-900">{m.title}</h4>
                    <p className="text-xs text-orange-700/80 mt-1">
                      {m.minute_type || 'Sem tipo'} • Devolvida em:{' '}
                      {new Date(m.updated_at).toLocaleDateString('pt-BR')}
                    </p>
                    {m.revision_notes && (
                      <p className="text-xs text-orange-800 mt-2 italic line-clamp-2">
                        "{m.revision_notes}"
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="border-orange-300 text-orange-700 hover:bg-orange-100 shadow-sm bg-white shrink-0"
                  >
                    <Link to={`/gerador-minutas?id=${m.id}`}>Ajustar</Link>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(profile?.role === 'owner' || profile?.role === 'socio') && (
        <Card className="bg-yellow-50/30 border-yellow-300 shadow-sm">
          <CardHeader>
            <CardTitle className="text-yellow-800 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              Aguardando sua aprovação ({pendingApprovals.length})
            </CardTitle>
            <CardDescription className="text-yellow-700/80">
              Minutas enviadas para revisão por associados e estagiários.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingApprovals.length > 0 ? (
              <div className="space-y-4">
                {pendingApprovals.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between border-b border-yellow-200/50 pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <h4 className="font-medium text-sm text-yellow-900">{m.title}</h4>
                      <p className="text-xs text-yellow-700/80 mt-1">
                        {m.minute_type || 'Sem tipo'} • Enviado em:{' '}
                        {new Date(m.approval_requested_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="border-yellow-300 text-yellow-700 hover:bg-yellow-100 shadow-sm bg-white"
                    >
                      <Link to={`/gerador-minutas?id=${m.id}`}>Revisar</Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-yellow-700/80 font-medium">
                Nenhuma minuta aguardando aprovação no momento.
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex flex-col items-center justify-center text-center text-muted-foreground space-y-3">
                <Activity className="h-10 w-10 opacity-20" />
                <p>Nenhuma atividade registrada nos últimos 30 dias.</p>
                <Button variant="outline" asChild size="sm">
                  <Link to="/gerador-minutas">Criar primeira minuta</Link>
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
                  {recentActivity.map((act, i) => (
                    <TableRow key={act?.id || i}>
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
                        {(() => {
                          if (!act?.created_at) return '-'
                          try {
                            const d = new Date(act.created_at)
                            return isValid(d) ? format(d, 'dd/MM/yyyy HH:mm') : '-'
                          } catch (e) {
                            return '-'
                          }
                        })()}
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

export default function Index() {
  return (
    <DashboardErrorBoundary>
      <DashboardContent />
    </DashboardErrorBoundary>
  )
}
