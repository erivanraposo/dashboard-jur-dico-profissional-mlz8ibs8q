import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

/**
 * Tela de definição de senha.
 * Funciona em três cenários:
 *  - usuário logado (sessão normal) que quer trocar a senha;
 *  - link de recuperação do e-mail (o Supabase cria uma sessão de recovery ao abrir o link);
 *  - link de CONVITE de equipe (type=invite): o membro define a primeira senha e já entra
 *    no workspace do escritório para o qual foi convidado.
 * Em todos, chama supabase.auth.updateUser({ password }), que grava a senha da conta.
 */
export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  // Convite de equipe? O Supabase devolve type=invite no fragmento da URL.
  const isInvite =
    typeof window !== 'undefined' && /type=invite/.test(window.location.hash || '')

  const [hasSession, setHasSession] = useState<boolean | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session))
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      toast({ title: 'Senha muito curta', description: 'Use ao menos 8 caracteres.', variant: 'destructive' })
      return
    }
    if (password !== confirm) {
      toast({ title: 'As senhas não conferem', description: 'Digite a mesma senha nos dois campos.', variant: 'destructive' })
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      toast({ title: 'Não foi possível alterar', description: error.message, variant: 'destructive' })
    } else {
      toast({
        title: isInvite ? 'Bem-vindo(a) ao LexAxis' : 'Senha alterada com sucesso',
        description: isInvite
          ? 'Senha definida. Você já está no workspace do escritório.'
          : 'Use a nova senha nos próximos acessos.',
      })
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md shadow-lg border-border/50">
        <CardHeader className="text-center space-y-2 pb-6">
          <div className="flex justify-center mb-4">
            <img src="/brand/logo-symbol-256.png" alt="LexAxis" className="h-16 w-16 object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {isInvite ? 'Defina sua senha de acesso' : 'Definir nova senha'}
          </CardTitle>
          <CardDescription className="text-sm">
            {isInvite
              ? 'Você foi convidado(a) para um escritório no LexAxis. Escolha uma senha para entrar.'
              : 'Escolha uma senha forte — ela não fica salva em nenhum código.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasSession === false ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Este link expirou ou já foi usado. Abra o link mais recente do e-mail (de convite ou
                de recuperação), ou faça login e volte a esta página.
              </p>
              <Button className="w-full h-11" onClick={() => navigate('/login')}>
                Ir para o login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="password"
                placeholder="Nova senha (mín. 8 caracteres)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12"
                autoComplete="new-password"
              />
              <Input
                type="password"
                placeholder="Confirmar nova senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="h-12"
                autoComplete="new-password"
              />
              <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar nova senha'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
