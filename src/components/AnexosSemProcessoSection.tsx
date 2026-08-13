import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileWarning, Trash2, Download, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

/**
 * ANEXOS SEM PROCESSO — o que estava invisível.
 *
 * Achado da auditoria de 12/08/2026: 457 dos 488 anexos (94%) tinham
 * `process_id` nulo, somando 813 MB. Vêm do fluxo de análise avulsa, em que o
 * código grava `process_id: null` quando nenhum processo é selecionado.
 *
 * O problema não era o acúmulo — era a INVISIBILIDADE. Esses arquivos não
 * apareciam em processo nenhum, não sumiam quando um processo era apagado, e
 * nenhuma eliminação orientada por processo os alcançava. Na prática, o Cliente
 * não tinha como exercer o direito de eliminação (LGPD, art. 18, VI) sobre um
 * arquivo que não conseguia ver.
 *
 * Esta tela não apaga nada por conta própria e não impõe prazo: apenas mostra o
 * que existe e devolve o controle a quem é dono. É a menos arriscada das três
 * saídas desenhadas — a expiração automática, que fecha o acúmulo de vez, vem
 * depois e exige aviso prévio ao usuário.
 *
 * ORDEM DA REMOÇÃO: arquivo primeiro, linha depois. Se falhar no meio, sobra
 * linha sem arquivo — visível e corrigível. O inverso produziria um órfão, que é
 * exatamente o resíduo que esta tela existe para evitar.
 */
type Anexo = {
  id: string
  file_name: string
  file_path: string
  file_size: number | null
  created_at: string
}

const tamanho = (b: number | null) => {
  if (!b) return '—'
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

// PRAZO DE RETENÇÃO — 45 dias para anexo SEM processo.
//
// Anexo vinculado a processo não tem prazo: vive e morre com o processo, que é o
// comportamento esperado num escritório. O prazo existe só para o que não tem
// dono — que foi como 813 MB se acumularam sem que ninguém soubesse.
//
// 45 dias e não 15 ou 30: prazo processual comum é de 15 dias ÚTEIS, cerca de
// três semanas corridas. Quem anexa os autos no início do prazo e volta ao fim
// dele não pode perder o material. 45 cobrem o prazo inteiro com folga.
//
// E o prazo só é legítimo se aparecer ANTES — por isso a contagem fica visível
// desde o primeiro dia, não apenas quando falta pouco.
const PRAZO_DIAS = 45
const AVISO_DIAS = 7

const diasDeVida = (criadoEm: string) =>
  Math.floor((Date.now() - new Date(criadoEm).getTime()) / 86400000)

export default function AnexosSemProcessoSection() {
  const { toast } = useToast()
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [removendo, setRemovendo] = useState<string | null>(null)

  const carregar = async () => {
    setCarregando(true)
    const { data, error } = await supabase
      .from('process_attachments')
      .select('id, file_name, file_path, file_size, created_at')
      .is('process_id', null)
      .order('created_at', { ascending: false })
    setCarregando(false)
    if (error) {
      toast({ title: 'Erro ao listar anexos', description: error.message, variant: 'destructive' })
      return
    }
    setAnexos((data as Anexo[]) || [])
  }

  useEffect(() => {
    carregar()
  }, [])

  const baixar = async (a: Anexo) => {
    const { data, error } = await supabase.storage
      .from('process-attachments')
      .createSignedUrl(a.file_path, 300)
    if (error || !data?.signedUrl) {
      toast({ title: 'Não foi possível abrir', description: error?.message, variant: 'destructive' })
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  const remover = async (a: Anexo) => {
    if (
      !window.confirm(
        `Remover "${a.file_name}"?\n\nO arquivo será excluído do sistema e não poderá ser recuperado. ` +
          `Este anexo não pertence a nenhum processo.`,
      )
    )
      return
    setRemovendo(a.id)
    try {
      // Arquivo primeiro: falha aqui deixa a linha, que continua visível nesta
      // mesma tela. O contrário deixaria um arquivo que ninguém mais enxerga.
      const { error: eArq } = await supabase.storage
        .from('process-attachments')
        .remove([a.file_path])
      if (eArq) throw eArq
      const { error: eLinha } = await supabase.from('process_attachments').delete().eq('id', a.id)
      if (eLinha) throw eLinha
      setAnexos((prev) => prev.filter((x) => x.id !== a.id))
      toast({ title: 'Anexo removido' })
    } catch (e: any) {
      toast({ title: 'Erro ao remover', description: e?.message, variant: 'destructive' })
    } finally {
      setRemovendo(null)
    }
  }

  const total = anexos.reduce((s, a) => s + (a.file_size || 0), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-amber-600" />
          Anexos sem processo
          {anexos.length > 0 && (
            <Badge variant="secondary">
              {anexos.length} · {tamanho(total)}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Arquivos enviados para análise sem que um processo fosse selecionado. Não aparecem em
          processo nenhum e são <strong>eliminados {PRAZO_DIAS} dias após o envio</strong>. Para
          guardar em definitivo, vincule o arquivo a um processo — aí ele passa a acompanhar o
          processo e não expira.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : anexos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum anexo solto. Todos os arquivos enviados pertencem a algum processo.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead className="w-28">Enviado em</TableHead>
                <TableHead className="w-32">Prazo</TableHead>
                <TableHead className="w-24">Tamanho</TableHead>
                <TableHead className="w-28 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {anexos.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium break-all">{a.file_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(() => {
                      const restam = PRAZO_DIAS - diasDeVida(a.created_at)
                      if (restam <= 0)
                        return <span className="text-destructive font-medium">expirado</span>
                      if (restam <= AVISO_DIAS)
                        return (
                          <span className="text-destructive font-medium">
                            {restam} {restam === 1 ? 'dia' : 'dias'}
                          </span>
                        )
                      return <span className="text-muted-foreground">{restam} dias</span>
                    })()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tamanho(a.file_size)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => baixar(a)} title="Abrir">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remover(a)}
                      disabled={removendo === a.id}
                      title="Remover"
                    >
                      {removendo === a.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
