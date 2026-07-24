import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ============================================================================
// INVITE-MEMBER — Feature "Equipe"
//
// O OWNER de um workspace convida UM membro (beta: teto de 1) para o MESMO
// workspace, com papel próprio. Fluxo:
//   1. valida o chamador (JWT) → precisa ser owner do próprio workspace;
//   2. aplica o teto (1 membro não-owner OU 1 convite pendente por workspace);
//   3. grava a linha em workspace_invitations (pending);
//   4. dispara admin.inviteUserByEmail → Supabase envia e-mail com link;
//   5. quando a conta é criada, o gatilho handle_new_user acha o convite
//      pendente e anexa o novo profile ao workspace (marcando accepted).
//
// Payload: { email: string, role?: 'socio'|'associado'|'estagiario'|'financeiro' }
// Retorno: { status: 'ok' } | { status:'error', code, message }
// ============================================================================

const ALLOWED_ROLES = new Set(['socio', 'associado', 'estagiario', 'financeiro'])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://lexaxis.com.br').replace(/\/$/, '')
  const authHeader = req.headers.get('Authorization')

  try {
    // ---- payload
    const payload = await req.json().catch(() => ({}))
    const email = String(payload?.email ?? '').trim().toLowerCase()
    const role = String(payload?.role ?? 'estagiario').trim()
    if (!EMAIL_RE.test(email)) {
      return json({ status: 'error', code: 'invalid_email', message: 'E-mail inválido.' }, 400)
    }
    if (!ALLOWED_ROLES.has(role)) {
      return json(
        { status: 'error', code: 'invalid_role', message: 'Papel não permitido para convite.' },
        400,
      )
    }
    if (!authHeader) {
      return json({ status: 'error', code: 'unauthorized', message: 'Não autenticado.' }, 401)
    }

    // ---- 1) identifica o chamador e confirma que é owner
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user: caller },
      error: authErr,
    } = await asCaller.auth.getUser()
    if (authErr || !caller) {
      return json({ status: 'error', code: 'unauthorized', message: 'Não autenticado.' }, 401)
    }

    const admin = createClient(url, serviceKey)

    const { data: callerProfile, error: profErr } = await admin
      .from('profiles')
      .select('id, workspace_id, role')
      .eq('id', caller.id)
      .maybeSingle()
    if (profErr || !callerProfile?.workspace_id) {
      return json(
        { status: 'error', code: 'no_profile', message: 'Perfil do usuário não encontrado.' },
        400,
      )
    }
    if (callerProfile.role !== 'owner') {
      return json(
        { status: 'error', code: 'forbidden', message: 'Apenas o owner pode convidar membros.' },
        403,
      )
    }
    const workspaceId = callerProfile.workspace_id

    // ---- 2) teto: 1 membro não-owner OU 1 convite pendente por workspace
    const { count: memberCount } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .neq('role', 'owner')
    const { count: pendingCount } = await admin
      .from('workspace_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
    if ((memberCount ?? 0) + (pendingCount ?? 0) >= 1) {
      return json(
        {
          status: 'error',
          code: 'limit_reached',
          message: 'Limite de 1 membro por workspace (beta). Revogue o convite atual para trocar.',
        },
        409,
      )
    }

    // ---- 3) grava o convite (pending). A unique index impede pendente duplicado.
    const { data: invite, error: invErr } = await admin
      .from('workspace_invitations')
      .insert({
        workspace_id: workspaceId,
        email,
        role,
        invited_by: caller.id,
        status: 'pending',
      })
      .select('id')
      .single()
    if (invErr || !invite) {
      // 23505 = unique_violation (já há convite pendente para este e-mail)
      const code = (invErr as any)?.code === '23505' ? 'duplicate' : 'db_error'
      return json(
        {
          status: 'error',
          code,
          message:
            code === 'duplicate'
              ? 'Já existe um convite pendente para este e-mail.'
              : 'Falha ao registrar o convite.',
        },
        409,
      )
    }

    // ---- 4) dispara o convite por e-mail (Supabase envia o link)
    const { error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
      data: { invited_workspace_id: workspaceId, invited_role: role },
    })
    if (mailErr) {
      // desfaz o convite para não travar o slot do teto
      await admin.from('workspace_invitations').delete().eq('id', invite.id)
      const already = /already been registered|already exists/i.test(mailErr.message || '')
      return json(
        {
          status: 'error',
          code: already ? 'already_registered' : 'invite_failed',
          message: already
            ? 'Este e-mail já possui conta no sistema.'
            : `Não foi possível enviar o convite: ${mailErr.message}`,
        },
        400,
      )
    }

    return json({ status: 'ok', email, role })
  } catch (e: any) {
    return json(
      { status: 'error', code: 'unexpected', message: e?.message ?? 'Erro inesperado.' },
      500,
    )
  }
})
