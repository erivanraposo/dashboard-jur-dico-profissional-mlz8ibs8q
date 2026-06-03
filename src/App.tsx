import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LegalStoreProvider } from '@/stores/use-legal-store'
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import './print.css'

import Layout from './components/Layout'
import Index from './pages/Index'
import Jurisprudencia from './pages/Jurisprudencia'
import GeradorMinutas from './pages/GeradorMinutas'
import Processos from './pages/Processos'
import Auditoria from './pages/Auditoria'
import Configuracoes from './pages/Configuracoes'
import NotFound from './pages/NotFound'
import Auth from './pages/Auth'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        Carregando...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

const AppContent = () => (
  <Routes>
    <Route path="/login" element={<Auth />} />
    <Route
      element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }
    >
      <Route path="/" element={<Index />} />
      <Route path="/jurisprudencia" element={<Jurisprudencia />} />
      <Route path="/gerador-minutas" element={<GeradorMinutas />} />
      <Route path="/processos" element={<Processos />} />
      <Route path="/auditoria" element={<Auditoria />} />
      <Route path="/configuracoes" element={<Configuracoes />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
)

const App = () => (
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
)

export default App
