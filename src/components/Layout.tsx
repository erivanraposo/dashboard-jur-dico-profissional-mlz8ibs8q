import { Link, Outlet, useLocation } from 'react-router-dom'
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
import { Scale, FileText, Search, Briefcase, Settings, Bell, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const navigation = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Processos', path: '/processos', icon: Briefcase },
  { name: 'Jurisprudência', path: '/jurisprudencia', icon: Search },
  { name: 'Gerador de Minutas', path: '/gerador', icon: FileText },
  { name: 'Configurações', path: '/configuracoes', icon: Settings },
]

export default function Layout() {
  const location = useLocation()

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar variant="sidebar" collapsible="icon">
          <SidebarHeader className="h-16 flex items-center justify-center border-b px-4">
            <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-primary w-full overflow-hidden group-data-[collapsible=icon]:justify-center">
              <Scale className="h-6 w-6 shrink-0 text-primary" />
              <span className="truncate group-data-[collapsible=icon]:hidden">LexControl</span>
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
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="border-t p-4">
            <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
              <Avatar className="h-8 w-8">
                <AvatarImage src="https://img.usecurling.com/ppl/thumbnail?gender=male&seed=lawyer" />
                <AvatarFallback>AS</AvatarFallback>
              </Avatar>
              <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-medium truncate">Dr. Alberto Souza</span>
                <span className="text-xs text-muted-foreground truncate">OAB/SP 123.456</span>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex flex-col flex-1 overflow-hidden">
          <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b bg-white/80 backdrop-blur-md sticky top-0 z-10">
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

          <main className="flex-1 overflow-y-auto p-6 md:p-8 animate-fade-in">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
