import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserPlus, X, Trash2, Loader2, ShieldCheck } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useCurrentUser } from '@/hooks/use-current-user'
import { supabase } from '@/lib/supabase/client'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  socio: 'Sócio',
  associado: 'Associado',
  estagiario: 'Estagiário',
  financeiro: 'Financeiro',
}

/**
 * Gestão de Equipe do workspace (só para owner): convidar 1 membro (beta),
 * revogar convite pendente, trocar papel e remover membro. As operações do
 * owner sobre OUTROS membros passam por RPCs SECURITY DEFINER (o RLS de
 * profiles só permite auto-update) e pela Edge Function invite-member.
 */
export default function TeamSection() {
  const { user, isOwner } = useCurrentUser()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [invitations, setInvitations] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('estagiario')
  const [inviting, setInviting] = useState(false)

  const nonOwnerMembers = teamMembers.filter((m) => m.role !== 'owner').length
  const atMemberLimit = nonOwnerMembers + invitations.length >= 1

  const loadTeam = async () => {
    if (!user?.workspace_id || !isOwner) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: members } = await supabase
      .from('profiles')
      .select('*')
      .eq('workspace_id', user.workspace_id)
      .order('created_at', { ascending: true })
    if (members) setTeamMembers(members)

    const { data: invites } = await supabase
      .from('workspace_invitations')
      .select('id, email, role, created_at')
      .eq('workspace_id', user.workspace_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setInvitations(invites || [])
    setLoading(false)
  }

  useEffect(() => {
    if (user) loadTeam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const handleRoleChange = async (memberId: string, newRole: string) => {
    try {
      const { error } = await supabase.rpc('admin_set_member_role', {
        p_member: memberId,
        p_role: newRole,
      })
      if (error) throw error
      setTeamMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)))
      toast({ title: 'Sucesso', description: 'Papel atualizado com sucesso.' })
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error?.message || 'Não foi possível atualizar o papel.',
        variant: 'destructive',
      })
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    try {
      setInviting(true)
      const { data, error } = await supabase.functions.invoke('invite-member', {
        body: { email, role: inviteRole },
      })
      if (error) throw error
      if (data?.status !== 'ok') {
        throw new Error(data?.message || 'Não foi possível enviar o convite.')
      }
      toast({
        title: 'Convite enviado',
        description: `Enviamos um e-mail para ${email} definir a senha e acessar o workspace.`,
      })
      setInviteEmail('')
      setInviteRole('estagiario')
      await loadTeam()
    } catch (error: any) {
      toast({
        title: 'Não foi possível convidar',
        description: error?.message || 'Erro ao enviar o convite.',
        variant: 'destructive',
      })
    } finally {
      setInviting(false)
    }
  }

  const handleRevoke = async (inviteId: string) => {
    try {
      const { error } = await supabase
        .from('workspace_invitations')
        .update({ status: 'revoked' })
        .eq('id', inviteId)
      if (error) throw error
      setInvitations((prev) => prev.filter((i) => i.id !== inviteId))
      toast({ title: 'Convite revogado', description: 'O convite pendente foi cancelado.' })
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível revogar o convite.',
        variant: 'destructive',
      })
    }
  }

  const handlePromote = async (memberId: string, memberName: string) => {
    if (
      !window.confirm(
        `Tornar ${memberName} administrador(a) do escritório?\n\nEle passará a gerenciar a equipe (convidar/remover membros) e as configurações — os mesmos poderes que você tem. Use apenas para sócios de confiança.`,
      )
    )
      return
    try {
      const { error } = await supabase.rpc('admin_set_member_role', {
        p_member: memberId,
        p_role: 'owner',
      })
      if (error) throw error
      toast({ title: 'Administrador definido', description: `${memberName} agora administra o escritório.` })
      await loadTeam()
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error?.message || 'Não foi possível tornar administrador.',
        variant: 'destructive',
      })
    }
  }

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (
      !window.confirm(
        `Remover ${memberName} da equipe?\n\nEle perde o acesso aos casos do escritório (a conta e o trabalho já feito são preservados). Isso libera a vaga de membro.`,
      )
    )
      return
    try {
      const { error } = await supabase.rpc('admin_remove_member', { p_member: memberId })
      if (error) throw error
      toast({ title: 'Membro removido', description: `${memberName} não faz mais parte da equipe.` })
      await loadTeam()
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error?.message || 'Não foi possível remover o membro.',
        variant: 'destructive',
      })
    }
  }

  if (!isOwner) return null

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle>Gestão de Equipe</CardTitle>
        <CardDescription>Gerencie os membros do seu workspace e seus papéis.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Membro desde</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.full_name}</TableCell>
                      <TableCell>{new Date(member.created_at).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>
                        {member.role === 'owner' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                            <ShieldCheck className="h-3.5 w-3.5" /> Administrador
                          </span>
                        ) : (
                          <Select
                            value={member.role || 'associado'}
                            onValueChange={(val) => handleRoleChange(member.id, val)}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="socio">Sócio</SelectItem>
                              <SelectItem value="associado">Associado</SelectItem>
                              <SelectItem value="estagiario">Estagiário</SelectItem>
                              <SelectItem value="financeiro">Financeiro</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {member.role !== 'owner' && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs text-muted-foreground hover:text-primary"
                              onClick={() => handlePromote(member.id, member.full_name)}
                            >
                              <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Tornar admin
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveMember(member.id, member.full_name)}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Separator className="my-6" />

            {invitations.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">Convites pendentes</p>
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{inv.email}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {ROLE_LABELS[inv.role] || inv.role}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => handleRevoke(inv.id)}
                    >
                      <X className="mr-1 h-3.5 w-3.5" /> Revogar
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {atMemberLimit ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Durante os testes na versão beta, cada workspace do LexAxis pode ter apenas{' '}
                <strong>1 membro convidado</strong>. Para trocar o membro convidado pelo administrador
                do escritório, revogue o convite pendente ou remova o membro atual.
              </p>
            ) : (
              <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="invite-email">Convidar membro por e-mail</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="estagiario@escritorio.com.br"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Papel</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className="w-full sm:w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="estagiario">Estagiário</SelectItem>
                      <SelectItem value="associado">Associado</SelectItem>
                      <SelectItem value="socio">Sócio</SelectItem>
                      <SelectItem value="financeiro">Financeiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={inviting}>
                  {inviting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" />
                  )}
                  Convidar
                </Button>
              </form>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
