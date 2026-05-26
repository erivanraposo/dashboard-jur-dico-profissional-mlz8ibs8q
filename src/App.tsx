import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LegalStoreProvider } from '@/stores/use-legal-store'

import Layout from './components/Layout'
import Index from './pages/Index'
import Jurisprudencia from './pages/Jurisprudencia'
import GeradorMinutas from './pages/GeradorMinutas'
import Processos from './pages/Processos'
import Configuracoes from './pages/Configuracoes'
import NotFound from './pages/NotFound'

const App = () => (
  <BrowserRouter future={{ v7_startTransition: false, v7_relativeSplatPath: false }}>
    <TooltipProvider>
      <LegalStoreProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Index />} />
            <Route path="/jurisprudencia" element={<Jurisprudencia />} />
            <Route path="/gerador" element={<GeradorMinutas />} />
            <Route path="/processos" element={<Processos />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </LegalStoreProvider>
    </TooltipProvider>
  </BrowserRouter>
)

export default App
