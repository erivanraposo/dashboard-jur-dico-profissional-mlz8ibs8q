import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
import { useToast } from '@/hooks/use-toast'
import { useCurrentUser } from '@/hooks/use-current-user'
import { supabase } from '@/lib/supabase/client'
import AdvogadosSection from '@/components/AdvogadosSection'
import {
  Settings,
  Upload,
  Trash2,
  Save,
  RefreshCcw,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react'
import HelpButton from '@/components/HelpButton'

const DEFAULT_BRANDING = {
  nome_escritorio: '',
  cabecalho_extra: '',
  endereco_logradouro: '',
  endereco_cidade: '',
  endereco_uf: '',
  endereco_cep: '',
  telefone: '',
  email: '',
  website: '',
  oab_responsavel_nome: '',
  oab_responsavel_numero: '',
  oab_responsavel_uf: '',
  cor_primaria: '#1a3a5e',
  cor_secundaria: '#666666',
  rodape_confidencialidade: 'Confidencial — uso restrito ao destinatário',
  logo_path: '',
}

export default function Configuracoes() {
  const { user, isOwner } = useCurrentUser()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [formData, setFormData] = useState(DEFAULT_BRANDING)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<any[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user) {
      loadData()
    }
  }, [user])

  const loadData = async () => {
    try {
      setLoading(true)

      if (!user?.workspace_id) {
        throw new Error('Workspace não encontrado.')
      }

      setWorkspaceId(user.workspace_id)

      const { data: branding, error: brandingError } = await supabase
        .from('workspace_branding')
        .select('*')
        .eq('workspace_id', user.workspace_id)
        .maybeSingle()

      if (brandingError && brandingError.code !== 'PGRST116') {
        console.error('Branding fetch error:', brandingError)
      }

      if (branding) {
        setFormData((prev) => ({ ...prev, ...branding }))

        if (branding.logo_path) {
          await fetchLogoUrl(branding.logo_path)
        }
      }

      if (isOwner) {
        const { data: members } = await supabase
          .from('profiles')
          .select('*')
          .eq('workspace_id', user.workspace_id)
          .order('created_at', { ascending: true })
        if (members) setTeamMembers(members)
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar',
        description: error.message || 'Não foi possível carregar as configurações.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchLogoUrl = async (path: string) => {
    const { data, error } = await supabase.storage
      .from('workspace-branding')
      .createSignedUrl(path, 3600)

    if (data?.signedUrl) {
      setLogoUrl(data.signedUrl)
    } else if (error) {
      console.error('Error fetching logo URL:', error)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !workspaceId) return

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O tamanho máximo é 2MB.',
        variant: 'destructive',
      })
      return
    }

    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      toast({
        title: 'Formato inválido',
        description: 'Apenas PNG e JPG são permitidos.',
        variant: 'destructive',
      })
      return
    }

    try {
      setUploading(true)
      const ext = file.name.split('.').pop()
      const path = `${workspaceId}/logo.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('workspace-branding')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      setFormData((prev) => ({ ...prev, logo_path: path }))
      await fetchLogoUrl(path)

      toast({ title: 'Sucesso', description: 'Logo atualizado com sucesso.' })
    } catch (error: any) {
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveLogo = async () => {
    if (!formData.logo_path || !workspaceId) return
    try {
      setUploading(true)
      await supabase.storage.from('workspace-branding').remove([formData.logo_path])
      setFormData((prev) => ({ ...prev, logo_path: '' }))
      setLogoUrl(null)
      toast({ title: 'Sucesso', description: 'Logo removido.' })
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível remover o logo.',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!workspaceId) return
    try {
      setSaving(true)
      const dataToSave = {
        ...formData,
        workspace_id: workspaceId,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('workspace_branding').upsert(dataToSave)

      if (error) throw error

      toast({ title: 'Sucesso', description: 'Configurações salvas com sucesso.' })
    } catch (error: any) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!workspaceId) return
    if (
      !window.confirm(
        'Tem certeza que deseja limpar todas as configurações? Esta ação não pode ser desfeita.',
      )
    )
      return

    try {
      setSaving(true)

      if (formData.logo_path) {
        await supabase.storage.from('workspace-branding').remove([formData.logo_path])
      }

      const { error } = await supabase
        .from('workspace_branding')
        .delete()
        .eq('workspace_id', workspaceId)
      if (error) throw error

      setFormData(DEFAULT_BRANDING)
      setLogoUrl(null)

      toast({ title: 'Limpo', description: 'Todas as configurações foram redefinidas.' })
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível limpar as configurações.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleRoleChange = async (memberId: string, newRole: string) => {
    try {
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', memberId)
      if (error) throw error
      setTeamMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)))
      toast({ title: 'Sucesso', description: 'Papel atualizado com sucesso.' })
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o papel.',
        variant: 'destructive',
      })
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
          <Settings className="h-8 w-8" />
          Identidade e Configurações <HelpButton anchor="config" />
        </h1>
        <p className="text-muted-foreground mt-1">
          Gerencie a equipe e a identidade visual do escritório.
        </p>
      </div>

      {isOwner && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Gestão de Equipe</CardTitle>
            <CardDescription>Gerencie os membros do seu workspace e seus papéis.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Membro desde</TableHead>
                    <TableHead>Papel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.full_name}</TableCell>
                      <TableCell>
                        {new Date(member.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={member.role || 'associado'}
                          onValueChange={(val) => handleRoleChange(member.id, val)}
                          disabled={member.role === 'owner'}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="socio">Sócio</SelectItem>
                            <SelectItem value="associado">Associado</SelectItem>
                            <SelectItem value="estagiario">Estagiário</SelectItem>
                            <SelectItem value="financeiro">Financeiro</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {isOwner && <AdvogadosSection />}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Identificação do Escritório</CardTitle>
              <CardDescription>
                Informações principais que aparecerão nos cabeçalhos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome_escritorio">Nome do Escritório</Label>
                <Input
                  id="nome_escritorio"
                  name="nome_escritorio"
                  value={formData.nome_escritorio}
                  onChange={handleInputChange}
                  placeholder="Ex: Advocacia & Associados"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cabecalho_extra">Informação Extra (Ex: CNPJ)</Label>
                <Input
                  id="cabecalho_extra"
                  name="cabecalho_extra"
                  value={formData.cabecalho_extra}
                  onChange={handleInputChange}
                  placeholder="Ex: CNPJ: 00.000.000/0001-00"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contato e Endereço</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail Principal</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="contato@escritorio.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input
                    id="telefone"
                    name="telefone"
                    value={formData.telefone}
                    onChange={handleInputChange}
                    placeholder="(00) 0000-0000"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    name="website"
                    value={formData.website}
                    onChange={handleInputChange}
                    placeholder="www.escritorio.com.br"
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="endereco_logradouro">Logradouro</Label>
                <Input
                  id="endereco_logradouro"
                  name="endereco_logradouro"
                  value={formData.endereco_logradouro}
                  onChange={handleInputChange}
                  placeholder="Av. Principal, 1000 - Sala 12"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="endereco_cidade">Cidade</Label>
                  <Input
                    id="endereco_cidade"
                    name="endereco_cidade"
                    value={formData.endereco_cidade}
                    onChange={handleInputChange}
                    placeholder="São Paulo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endereco_uf">UF</Label>
                  <Input
                    id="endereco_uf"
                    name="endereco_uf"
                    value={formData.endereco_uf}
                    onChange={handleInputChange}
                    maxLength={2}
                    className="uppercase"
                    placeholder="SP"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endereco_cep">CEP</Label>
                  <Input
                    id="endereco_cep"
                    name="endereco_cep"
                    value={formData.endereco_cep}
                    onChange={handleInputChange}
                    placeholder="00000-000"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Responsabilidade Legal</CardTitle>
              <CardDescription>Advogado responsável pelo escritório.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="oab_responsavel_nome">Nome do Responsável</Label>
                <Input
                  id="oab_responsavel_nome"
                  name="oab_responsavel_nome"
                  value={formData.oab_responsavel_nome}
                  onChange={handleInputChange}
                  placeholder="Dr. Nome Sobrenome"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="oab_responsavel_numero">Número OAB</Label>
                  <Input
                    id="oab_responsavel_numero"
                    name="oab_responsavel_numero"
                    value={formData.oab_responsavel_numero}
                    onChange={handleInputChange}
                    placeholder="123456"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oab_responsavel_uf">UF OAB</Label>
                  <Input
                    id="oab_responsavel_uf"
                    name="oab_responsavel_uf"
                    value={formData.oab_responsavel_uf}
                    onChange={handleInputChange}
                    maxLength={2}
                    className="uppercase"
                    placeholder="SP"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Logotipo</CardTitle>
              <CardDescription>Imagem que aparecerá nos documentos (Máx. 2MB).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <div className="h-32 w-full border-2 border-dashed border-muted-foreground/25 rounded-lg flex items-center justify-center bg-muted/20 overflow-hidden relative group">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo Preview"
                    className="max-h-full max-w-full object-contain p-2"
                  />
                ) : (
                  <div className="flex flex-col items-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
                    <span className="text-sm">Sem logotipo</span>
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
              </div>

              <div className="flex gap-2 w-full">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/png, image/jpeg, image/jpg"
                  className="hidden"
                />
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
                {formData.logo_path && (
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={handleRemoveLogo}
                    disabled={uploading}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cores e Visual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="cor_primaria" className="flex-1">
                  Cor Primária
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono">
                    {formData.cor_primaria}
                  </span>
                  <input
                    type="color"
                    id="cor_primaria"
                    name="cor_primaria"
                    value={formData.cor_primaria}
                    onChange={handleInputChange}
                    className="h-8 w-12 rounded cursor-pointer border-0 p-0"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="cor_secundaria" className="flex-1">
                  Cor Secundária
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono">
                    {formData.cor_secundaria}
                  </span>
                  <input
                    type="color"
                    id="cor_secundaria"
                    name="cor_secundaria"
                    value={formData.cor_secundaria}
                    onChange={handleInputChange}
                    className="h-8 w-12 rounded cursor-pointer border-0 p-0"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="rodape_confidencialidade">Rodapé (Confidencialidade)</Label>
                <Textarea
                  id="rodape_confidencialidade"
                  name="rodape_confidencialidade"
                  value={formData.rodape_confidencialidade}
                  onChange={handleInputChange}
                  rows={3}
                  className="resize-none"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-between items-center bg-card border shadow-sm rounded-xl p-4 mt-6">
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleClear}
          disabled={saving}
        >
          <RefreshCcw className="h-4 w-4 mr-2" />
          Limpar Dados
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configurações
        </Button>
      </div>
    </div>
  )
}
