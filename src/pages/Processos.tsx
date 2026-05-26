import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Briefcase } from 'lucide-react'

export default function Processos() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
          <Briefcase className="h-8 w-8" />
          Processos
        </h1>
        <p className="text-muted-foreground mt-1">
          Gestão centralizada de casos ativos e arquivados.
        </p>
      </div>
      <Card className="border-border/50 shadow-sm p-12 text-center">
        <CardContent>
          <p className="text-muted-foreground">
            Módulo de processos em desenvolvimento. Utilize a Busca de Jurisprudência ou o Gerador
            de Minutas por enquanto.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
