import { Users } from 'lucide-react'
import TeamSection from '@/components/TeamSection'
import HelpButton from '@/components/HelpButton'
import { useCurrentUser } from '@/hooks/use-current-user'

export default function Equipe() {
  const { isOwner } = useCurrentUser()

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
          <Users className="h-8 w-8" />
          Equipe <HelpButton anchor="config" />
        </h1>
        <p className="text-muted-foreground mt-1">
          Convide um membro para o seu escritório e gerencie papéis e acessos.
        </p>
      </div>

      {isOwner ? (
        <TeamSection />
      ) : (
        <p className="rounded-md border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Apenas o administrador do escritório pode gerenciar a equipe.
        </p>
      )}
    </div>
  )
}
