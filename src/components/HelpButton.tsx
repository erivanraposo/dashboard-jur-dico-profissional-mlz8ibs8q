import { HelpCircle } from 'lucide-react'

/**
 * Botão "?" contextual — abre a seção certa do manual (/ajuda#âncora) em nova aba.
 * As âncoras existem em src/pages/Ajuda.tsx (o-que-e, processos, minutas, analisar,
 * agentes, prazos, config, exportar, confianca, faq).
 */
export default function HelpButton({ anchor, label = 'Ajuda desta área' }: { anchor: string; label?: string }) {
  return (
    <a
      href={`/ajuda#${anchor}`}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
    >
      <HelpCircle className="h-4 w-4" />
    </a>
  )
}
