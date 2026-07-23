import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarFooter,
} from '@/components/ui/sidebar'
import {
  FileText,
  Search,
  Briefcase,
  Settings,
  Bell,
  LayoutDashboard,
  LogOut,
  Activity,
  FolderOpen,
  Clock,
  HelpCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/use-auth'

const navigation = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Processos', path: '/processos', icon: Briefcase },
  { name: 'Jurisprudência', path: '/jurisprudencia', icon: Search },
  { name: 'Gerador de Minutas', path: '/gerador-minutas', icon: FileText },
  { name: 'Minutas', path: '/minutas', icon: FolderOpen },
  { name: 'Prazos', path: '/prazos', icon: Clock },
  { name: 'Auditoria', path: '/auditoria', icon: Activity },
  { name: 'Configurações', path: '/configuracoes', icon: Settings },
]

export default function Layout() {
  const location = useLocation()
  const { signOut, user } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar variant="sidebar" collapsible="icon" className="no-print">
          <SidebarHeader className="h-16 flex items-center justify-center border-b px-4">
            <div className="flex items-center gap-2 font-bold tracking-tight text-primary w-full overflow-hidden group-data-[collapsible=icon]:justify-center">
              <img src="/brand/logo-symbol-128.png" alt="LexAxis" className="h-7 w-7 shrink-0 object-contain" />
              <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm uppercase">LexAxis</span>
                <span className="text-xs font-normal text-muted-foreground">Sistema Jurídico</span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent className="py-4">
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.path}
                    tooltip={item.name}
                  >
                    <Link to={item.path}>
                      <item.icon className="h-5 w-5" />
                      <span>{item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Ajuda">
                  <a href="/ajuda" target="_blank" rel="noopener noreferrer">
                    <HelpCircle className="h-5 w-5" />
                    <span>Ajuda</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="border-t p-4 space-y-3">
            <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={`https://img.usecurling.com/ppl/thumbnail?gender=male&seed=${user?.email}`}
                  />
                  <AvatarFallback>AD</AvatarFallback>
                </Avatar>
                <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
                  <span className="text-sm font-medium truncate">{user?.email}</span>
                  <span className="text-xs text-muted-foreground truncate">Advogado(a)</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="group-data-[collapsible=icon]:hidden text-muted-foreground hover:text-red-600"
                onClick={handleLogout}
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex flex-col flex-1 overflow-hidden">
          <header className="no-print h-16 flex-shrink-0 flex items-center justify-between px-6 border-b bg-white/80 backdrop-blur-md sticky top-0 z-10">
            <div className="flex items-center gap-4 flex-1">
              <SidebarTrigger />
              <div className="relative w-full max-w-md hidden md:flex">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Busca rápida por processo, cliente ou OAB..."
                  className="w-full pl-9 bg-muted/50 border-none focus-visible:ring-1 focus-visible:bg-white transition-colors"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <span className="absolute top-2 right-2.5 h-2 w-2 rounded-full bg-red-600 border border-white"></span>
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-6 md:p-8 animate-fade-in print:p-0 print:overflow-visible">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
