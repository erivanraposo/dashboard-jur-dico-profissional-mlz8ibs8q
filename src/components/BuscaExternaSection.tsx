import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Globe, ShieldCheck, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

/**
 * BUSCA EXTERNA — interruptor por escritório.
 *
 * O Nível 2 do Verificador usa a ferramenta de busca da Anthropic quando as dez
 * bases canônicas não resolvem a citação. Essa busca é executada por
 * SUBPROCESSADORES da Anthropic (Brave Search e TurboPuffer, EUA, conforme lista
 * colhida em 13/08/2026), e o texto da consulta chega a eles.
 *
 * POR QUE RESTRINGIR DOMÍNIO NÃO BASTA: o `allowed_domains`, que já usamos,
 * filtra o que VOLTA — não o que SAI. A consulta é enviada de qualquer modo.
 * E a lista de subprocessadores pode mudar com aviso de 30 dias, de forma que
 * só NÃO BUSCAR é robusto a mudança de cadeia.
 *
 * A decisão fica com quem responde pelo sigilo. É o mesmo princípio de
 * supervisão humana que a Resolução CNJ 615/2025 exige: quem assina decide.
 */
export default function BuscaExternaSection() {
  const { toast } = useToast()
  const [ligada, setLigada] = useState(true)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: perfil } = await supabase
        .from('profiles')
        .select('workspace_id')
        .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle()
      if (!perfil?.workspace_id) {
        setCarregando(false)
        return
      }
      const { data } = await supabase
        .from('workspaces')
        .select('busca_externa')
        .eq('id', perfil.workspace_id)
        .maybeSingle()
      // Ausência de preferência mantém o comportamento atual: só o valor
      // explícito `false` desliga.
      setLigada((data as any)?.busca_externa !== false)
      setCarregando(false)
    })()
  }, [])

  const alterna = async (valor: boolean) => {
    setSalvando(true)
    const { data: perfil } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
      .maybeSingle()
    const { error } = await supabase
      .from('workspaces')
      .update({ busca_externa: valor })
      .eq('id', perfil?.workspace_id ?? '')
    setSalvando(false)
    if (error) {
      toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' })
      return
    }
    setLigada(valor)
    toast({
      title: valor ? 'Busca externa ativada' : 'Busca externa desativada',
      description: valor
        ? 'Citações fora das bases oficiais voltam a ser conferidas por busca nos portais dos tribunais.'
        : 'Nenhuma consulta sairá do sistema. Citações fora das bases serão marcadas para conferência manual.',
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {ligada ? (
            <Globe className="h-5 w-5 text-blue-600" />
          ) : (
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          )}
          Busca externa na verificação
        </CardTitle>
        <CardDescription>
          Define se o Verificador de Precedentes pode consultar os portais dos tribunais quando uma
          citação não é resolvida pelas bases oficiais que mantemos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-4">
          <div className="space-y-1 pr-4">
            <Label htmlFor="busca-externa" className="text-sm font-medium">
              Permitir busca nos portais oficiais
            </Label>
            <p className="text-xs text-muted-foreground">
              {ligada
                ? 'Ativada. Citações fora das nossas bases são conferidas por busca restrita aos domínios oficiais.'
                : 'Desativada. Nenhuma consulta sai do sistema.'}
            </p>
          </div>
          {carregando ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              id="busca-externa"
              checked={ligada}
              disabled={salvando}
              onCheckedChange={alterna}
            />
          )}
        </div>

        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          <p className="font-semibold">O que muda ao desativar</p>
          <p className="mt-1">
            A busca é feita por prestadores contratados pela Anthropic, nos Estados Unidos, e o texto
            da consulta chega a eles. Restringir os domínios pesquisados — o que já fazemos — filtra
            o que <strong>volta</strong>, não o que <strong>sai</strong>. Desativando, a consulta
            sequer é formulada.
          </p>
          <p className="mt-2">
            Em troca, perde-se cobertura: acórdão que não esteja nas nossas dez bases oficiais deixa
            de ser conferido e passa a ser <strong>marcado para conferência manual</strong>, com
            indicação do portal. Súmulas, temas repetitivos, precedentes do TST, TSE e CARF continuam
            sendo conferidos normalmente — eles não dependem de busca.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
