DO $$
DECLARE
  new_user_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Seed user (idempotent: skip if email already exists)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'erivan.raposo@gmail.com') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'erivan.raposo@gmail.com',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Erivan Raposo"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    -- Create a default workspace
    INSERT INTO public.workspaces (name, budget_mensal_usd)
    VALUES ('Workspace Principal', 100.00)
    RETURNING id INTO v_workspace_id;

    -- Create profile
    INSERT INTO public.profiles (id, full_name, role, workspace_id)
    VALUES (new_user_id, 'Erivan Raposo', 'owner', v_workspace_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Fix any nulls in auth.users tokens to avoid GoTrue crash
UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE
  confirmation_token IS NULL OR recovery_token IS NULL
  OR email_change_token_new IS NULL OR email_change IS NULL
  OR email_change_token_current IS NULL
  OR phone_change IS NULL OR phone_change_token IS NULL
  OR reauthentication_token IS NULL;

-- 1. Standardize Agent Models
UPDATE public.agentes
SET model = 'claude-opus-4-7'
WHERE model LIKE 'claude-3-opus%';

UPDATE public.agentes
SET model = 'claude-sonnet-4-6'
WHERE model LIKE 'claude-3-sonnet%' OR model LIKE 'claude-3-5-sonnet%' OR model LIKE 'claude-2.%' OR model = 'claude-3.5-sonnet';

UPDATE public.agentes
SET model = 'claude-haiku-4-5'
WHERE model LIKE 'claude-3-haiku%' OR model LIKE 'claude-3-5-haiku%' OR model LIKE 'claude-instant-%';

-- 2. Insert or Update revisao-peticao agent for the "Revisão IA" tool
INSERT INTO public.agentes (id, name, model, system_prompt, is_active, titulo, descricao, categoria)
VALUES (
  gen_random_uuid(),
  'revisao-peticao',
  'claude-sonnet-4-6',
  'Você é um assistente jurídico sênior especializado em revisão de peças processuais. Seu objetivo é analisar a minuta fornecida, identificar falhas de fundamentação, erros lógicos e sugerir melhorias objetivas em formato de bullet points. Foque na jurisprudência aplicável e clareza da argumentação.',
  true,
  'Revisor de Peças',
  'Analisa minutas e sugere melhorias baseadas em boas práticas jurídicas.',
  'Revisão'
)
ON CONFLICT (name) DO UPDATE
SET model = 'claude-sonnet-4-6',
    system_prompt = EXCLUDED.system_prompt,
    is_active = true;

-- 3. Ensure Robust RLS Policies
DROP POLICY IF EXISTS "authenticated_select_agentes" ON public.agentes;
CREATE POLICY "authenticated_select_agentes" ON public.agentes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_insert_invocacoes" ON public.invocacoes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "authenticated_select_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_select_invocacoes" ON public.invocacoes FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND role IN ('admin', 'owner'))
);

DROP POLICY IF EXISTS "authenticated_insert_custos" ON public.custos;
CREATE POLICY "authenticated_insert_custos" ON public.custos FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM invocacoes i WHERE i.id = custos.invocation_id AND i.user_id = auth.uid())
);

DROP POLICY IF EXISTS "authenticated_select_custos" ON public.custos;
CREATE POLICY "authenticated_select_custos" ON public.custos FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM invocacoes i WHERE i.id = custos.invocation_id AND (i.user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND role IN ('admin', 'owner'))))
);
