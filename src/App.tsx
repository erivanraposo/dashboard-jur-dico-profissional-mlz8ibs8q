import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LegalStoreProvider } from '@/stores/use-legal-store'
import { Component, ErrorInfo, ReactNode } from 'react'
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import { AlertCircle } from 'lucide-react'
import './print.css'

import Layout from './components/Layout'
import Index from './pages/Index'
import Precedentes from './pages/Precedentes'
import Planos from './pages/Planos'
// Jurisprudência: rota desativada em 30/07/2026. A página era scaffolding do SKIP
// (3 seeds de demonstração, busca ilike na própria tabela, relator/ano fixos no
// código, "Clipar" sem destino). Será substituída pelo Verificador de Precedentes,
// construído sobre a máquina de proveniência da analyze-legal-text.
// Arquivo mantido em src/pages/Jurisprudencia.tsx apenas como referência.
import GeradorMinutas from './pages/GeradorMinutas'
import Processos from './pages/Processos'
import Minutas from './pages/Minutas'
import Prazos from './pages/Prazos'
import Auditoria from './pages/Auditoria'
import Equipe from './pages/Equipe'
import Configuracoes from './pages/Configuracoes'
import NotFound from './pages/NotFound'
import Auth from './pages/Auth'
import Landing from './pages/Landing'
import ResetPassword from './pages/ResetPassword'
import ComoVerificamos from './pages/ComoVerificamos'
import Ajuda from './pages/Ajuda'

class GlobalErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Global Application Error:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8 text-center space-y-4">
          <div className="p-4 bg-destructive/10 rounded-full">
            <AlertCircle className="h-12 w-12 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Erro Crítico no Sistema</h2>
          <p className="text-muted-foreground max-w-md">
            Desculpe, ocorreu um erro inesperado ao carregar a interface. Tente recarregar a página.
          </p>
          <div className="mt-4 p-4 bg-muted text-left text-sm rounded-md w-full max-w-2xl overflow-auto text-destructive border border-destructive/20 font-mono">
            {this.state.error?.message || 'Erro Desconhecido'}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Recarregar Sistema
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground animate-pulse font-medium">Carregando sistema...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/landing" replace />
  }

  return <>{children}</>
}

const AppContent = () => (
  <Routes>
    <Route path="/login" element={<Auth />} />
    <Route path="/landing" element={<Landing />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/como-verificamos" element={<ComoVerificamos />} />
    <Route path="/planos" element={<Planos />} />
    <Route path="/ajuda" element={<Ajuda />} />
    <Route
      element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }
    >
      <Route path="/" element={<Index />} />
      <Route path="/gerador-minutas" element={<GeradorMinutas />} />
      <Route path="/processos" element={<Processos />} />
      <Route path="/minutas" element={<Minutas />} />
      <Route path="/prazos" element={<Prazos />} />
      <Route path="/precedentes" element={<Precedentes />} />
      <Route path="/auditoria" element={<Auditoria />} />
      <Route path="/equipe" element={<Equipe />} />
      <Route path="/configuracoes" element={<Configuracoes />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
)

const App = () => (
  <GlobalErrorBoundary>
    <BrowserRouter future={{ v7_startTransition: false, v7_relativeSplatPath: false }}>
      <AuthProvider>
        <TooltipProvider>
          <LegalStoreProvider>
            <Toaster />
            <Sonner />
            <AppContent />
          </LegalStoreProvider>
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  </GlobalErrorBoundary>
)

export default App
