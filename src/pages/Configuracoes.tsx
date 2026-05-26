import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Settings } from 'lucide-react'

export default function Configuracoes() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
          <Settings className="h-8 w-8" />
          Configurações
        </h1>
        <p className="text-muted-foreground mt-1">Ajustes da conta e preferências do sistema.</p>
      </div>
      <Card className="border-border/50 shadow-sm p-12 text-center">
        <CardContent>
          <p className="text-muted-foreground">Módulo de configurações em desenvolvimento.</p>
        </CardContent>
      </Card>
    </div>
  )
}
