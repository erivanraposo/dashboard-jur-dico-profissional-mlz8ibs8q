import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Gauge } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

/**
 * Medidor de créditos de análise do mês.
 *
 * Cumpre a promessa da página /planos: "o medidor está no seu painel, análise
 * por análise". 1 crédito = 1 ciclo completo sobre um caso; a aplicação na
 * minuta e o gate de aderência fazem parte do mesmo ciclo e não consomem
 * crédito próprio, e a verificação de precedentes tem teto próprio.
 *
 * Silencioso por desenho: se a RPC não existir (migration não aplicada) ou
 * falhar, o card simplesmente não aparece — medidor quebrado não pode derrubar
 * o dashboard.
 */
type Consumo = { plano: string; usados: number; limite: number; renova_em: string }

const NOME_PLANO: Record<string, string> = {
  beta: 'Beta',
  essencial: 'Essencial',
  escritorio: 'Escritório',
  performance: 'Performance',
  enterprise: 'Enterprise',
}

export default function MedidorCreditos() {
  const [c, setC] = useState<Consumo | null>(null)

  useEffect(() => {
    let vivo = true
    supabase
      .rpc('creditos_do_mes')
      .then(({ data, error }) => {
        if (!vivo || error || !data) return
        setC(data as Consumo)
      })
      .catch(() => {
        /* medidor é acessório: falhar em silêncio */
      })
    return () => {
      vivo = false
    }
  }, [])

  if (!c) return null

  const pct = c.limite > 0 ? Math.min(100, Math.round((c.usados / c.limite) * 100)) : 0
  const restam = Math.max(0, c.limite - c.usados)
  const apertado = restam <= 2
  const atencao = pct >= 80

  return (
    <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Créditos de análise
        </CardTitle>
        <Gauge className="h-4 w-4 text-primary/70" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {c.usados}
          <span className="text-base font-normal text-muted-foreground"> de {c.limite}</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${
              apertado ? 'bg-red-500' : atencao ? 'bg-[#c9a35a]' : 'bg-primary'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {restam === 0
            ? 'Cota do mês esgotada — adicione um pacote ou aguarde a renovação.'
            : apertado
              ? `Restam ${restam} ${restam === 1 ? 'crédito' : 'créditos'} este mês.`
              : `${NOME_PLANO[c.plano] ? `Plano ${NOME_PLANO[c.plano]} · ` : ''}renova em ${new Date(
                  c.renova_em + 'T00:00:00',
                ).toLocaleDateString('pt-BR')}`}
        </p>
      </CardContent>
    </Card>
  )
}
