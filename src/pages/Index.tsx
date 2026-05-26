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
import { Briefcase, CalendarClock, FileEdit, Gavel, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const kpiData = [
  { title: 'Processos Ativos', value: '142', icon: Briefcase, trend: '+4 esta semana' },
  {
    title: 'Prazos da Semana',
    value: '12',
    icon: CalendarClock,
    trend: '3 urgentes',
    urgent: true,
  },
  { title: 'Minutas em Rascunho', value: '5', icon: FileEdit, trend: '2 prontas para revisão' },
  { title: 'Audiências Próximas', value: '3', icon: Gavel, trend: 'Próxima em 2 dias' },
]

const recentActivity = [
  {
    id: 1,
    action: 'Novo Acórdão anexado',
    process: '0012345-67.2023.8.26.0000',
    type: 'Penal',
    date: 'Hoje, 10:30',
  },
  {
    id: 2,
    action: 'Minuta de Habeas Corpus gerada',
    process: '0089765-43.2023.8.26.0000',
    type: 'Penal',
    date: 'Hoje, 09:15',
  },
  {
    id: 3,
    action: 'Petição Inicial protocolada',
    process: '1023456-89.2023.8.26.0100',
    type: 'Cível',
    date: 'Ontem, 16:45',
  },
  {
    id: 4,
    action: 'Prazo fatal alertado (Contestação)',
    process: '1098765-12.2022.8.26.0100',
    type: 'Cível',
    date: 'Ontem, 14:20',
  },
  { id: 5, action: 'Nova Jurisprudência salva', process: '-', type: 'Geral', date: 'Ontem, 11:00' },
]

const chartData = [
  { name: 'Direito Penal', value: 65, color: 'var(--color-penal)' },
  { name: 'Direito Cível', value: 77, color: 'var(--color-civel)' },
]

const chartConfig = {
  penal: { label: 'Penal', color: 'hsl(var(--chart-2))' },
  civel: { label: 'Cível', color: 'hsl(var(--chart-3))' },
}

export default function Index() {
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Visão Geral</h1>
          <p className="text-muted-foreground mt-1">
            Bem-vindo de volta, Dr. Alberto. Aqui está o resumo do seu escritório.
          </p>
        </div>
        <Button className="hidden md:flex gap-2">
          <FileEdit className="h-4 w-4" /> Nova Minuta
        </Button>
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
              <CardTitle>Atividade Recente</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Últimas atualizações no sistema.</p>
            </div>
            <Button variant="ghost" size="sm" className="gap-1">
              Ver tudo <ArrowRight className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ação</TableHead>
                  <TableHead>Processo</TableHead>
                  <TableHead>Área</TableHead>
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
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          item.type === 'Penal'
                            ? 'border-red-200 text-red-700 bg-red-50'
                            : item.type === 'Cível'
                              ? 'border-blue-200 text-blue-700 bg-blue-50'
                              : 'bg-slate-50'
                        }
                      >
                        {item.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {item.date}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/50 shadow-sm border-l-4 border-l-red-600">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center gap-2">
              <CalendarClock className="h-5 w-5" /> Prazos Fatais Penais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-col gap-1 border-b pb-4">
                <span className="font-semibold text-sm">
                  Resposta à Acusação - Processo 0089765-43.2023.8.26.0000
                </span>
                <span className="text-xs text-red-600 font-medium">Vence amanhã, às 23:59</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-sm">
                  Apelação Criminal - Processo 0012345-67.2023.8.26.0000
                </span>
                <span className="text-xs text-muted-foreground">Vence em 3 dias</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm border-l-4 border-l-blue-600">
          <CardHeader>
            <CardTitle className="text-blue-800 flex items-center gap-2">
              <CalendarClock className="h-5 w-5" /> Prazos Cíveis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-col gap-1 border-b pb-4">
                <span className="font-semibold text-sm">
                  Contestação - Processo 1023456-89.2023.8.26.0100
                </span>
                <span className="text-xs text-muted-foreground">Vence em 2 dias</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-sm">
                  Recurso de Apelação - Processo 1098765-12.2022.8.26.0100
                </span>
                <span className="text-xs text-muted-foreground">Vence em 5 dias</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
