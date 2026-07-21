import { Link } from 'react-router-dom'

/**
 * Casca comum das páginas públicas (Como verificamos fontes, Ajuda).
 * Header + footer no mesmo estilo da landing. Paleta: navy #1e3a5f, dourado #c9a35a.
 */
export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#faf8f3] font-sans text-[#1a2230] antialiased">
      <header className="sticky top-0 z-30 border-b border-[#1e3a5f]/10 bg-[#faf8f3]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/brand/logo-symbol-128.png" alt="" className="h-8 w-8 object-contain" />
            <span className="font-serif text-xl font-bold tracking-tight text-[#1e3a5f]">LexAxis</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-[#475569] md:flex">
            <Link to="/como-verificamos" className="transition-colors hover:text-[#1e3a5f]">Como verificamos</Link>
            <Link to="/ajuda" className="transition-colors hover:text-[#1e3a5f]">Ajuda</Link>
          </nav>
          <Link
            to="/login"
            className="rounded-md border border-[#1e3a5f]/25 px-4 py-2 text-sm font-semibold text-[#1e3a5f] transition-colors hover:bg-[#1e3a5f] hover:text-white"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-[#1e3a5f]/10 bg-[#faf8f3]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 px-6 py-10 md:flex-row">
          <div className="flex items-center gap-2.5">
            <img src="/brand/logo-symbol-128.png" alt="" className="h-7 w-7 object-contain" />
            <div>
              <p className="font-serif text-base font-bold text-[#1e3a5f]">LexAxis</p>
              <p className="text-xs text-[#475569]">O eixo da sua gestão jurídica.</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm text-[#475569]">
            <Link to="/como-verificamos" className="transition-colors hover:text-[#1e3a5f]">Como verificamos</Link>
            <Link to="/ajuda" className="transition-colors hover:text-[#1e3a5f]">Ajuda</Link>
            <Link to="/login" className="transition-colors hover:text-[#1e3a5f]">Entrar</Link>
          </div>
          <p className="text-xs text-[#475569]">© {new Date().getFullYear()} LexAxis</p>
        </div>
      </footer>
    </div>
  )
}
