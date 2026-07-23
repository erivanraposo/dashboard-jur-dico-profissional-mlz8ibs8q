import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, ArrowRight, X } from 'lucide-react'

/**
 * Dica de primeiros passos na tela inicial. Ataca o feedback nº 1 do beta:
 * "onde eu analiso um processo?" não é intuitivo. Dispensável (localStorage).
 */
const KEY = 'lexaxis_hide_getting_started'

export default function GettingStarted() {
  const [hidden, setHidden] = useState(() => localStorage.getItem(KEY) === '1')
  if (hidden) return null

  const dismiss = () => {
    localStorage.setItem(KEY, '1')
    setHidden(true)
  }

  return (
    <Card className="relative border-[#1e3a5f]/20 bg-[#1e3a5f]/[0.03]">
      <CardContent className="p-5">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 h-7 w-7 text-muted-foreground"
          title="Não mostrar novamente"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1e3a5f]/[0.08]">
            <Sparkles className="h-5 w-5 text-[#c9a35a]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-primary">Primeiros passos</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              O LexAxis não é um chat — ele usa <strong>agentes de IA especializados</strong>. Para
              analisar um processo: abra o <strong>Gerador de Minutas</strong>, escolha o tipo{' '}
              <strong>"Relatório de Caso"</strong>, anexe os autos, selecione um ou mais agentes e
              clique em <strong>Analisar</strong>.
            </p>
            <a
              href="/ajuda"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              Ver o guia completo <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
