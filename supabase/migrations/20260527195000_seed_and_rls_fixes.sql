-- Re-apply policies to ensure they are fully present and correct
DROP POLICY IF EXISTS "authenticated_select_agentes" ON public.agentes;
CREATE POLICY "authenticated_select_agentes" ON public.agentes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_select_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_select_invocacoes" ON public.invocacoes
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "authenticated_insert_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_insert_invocacoes" ON public.invocacoes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "authenticated_select_custos" ON public.custos;
CREATE POLICY "authenticated_select_custos" ON public.custos
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM invocacoes i 
      WHERE i.id = custos.invocation_id AND (
        i.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'owner')
        )
      )
    )
  );

DROP POLICY IF EXISTS "authenticated_insert_custos" ON public.custos;
CREATE POLICY "authenticated_insert_custos" ON public.custos
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM invocacoes i 
      WHERE i.id = custos.invocation_id AND i.user_id = auth.uid()
    )
  );

-- Seed user and specialized agents
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Seed user
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

    INSERT INTO public.profiles (id, full_name, role)
    VALUES (new_user_id, 'Erivan Raposo', 'admin')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Seed specialized agents
  INSERT INTO public.agentes (name, titulo, description, system_prompt, model, is_active, max_tokens)
  VALUES 
    ('especialista-contratos', 'Especialista em Contratos', 'Agente especializado na revisão e análise de contratos.', 'Você é um assistente jurídico especializado em analisar, revisar e propor melhorias em contratos.', 'claude-sonnet-4-6', true, 4096),
    ('especialista-familia', 'Especialista em Direito de Família', 'Agente especializado em Direito de Família e Sucessões.', 'Você é um assistente jurídico especializado em peças e análise de casos de Direito de Família e Sucessões.', 'claude-sonnet-4-6', true, 4096),
    ('especialista-trabalhista', 'Especialista em Direito Trabalhista', 'Agente especializado na área trabalhista.', 'Você é um assistente jurídico especializado em direito e processo do trabalho.', 'claude-sonnet-4-6', true, 4096)
  ON CONFLICT (name) DO UPDATE SET 
    titulo = EXCLUDED.titulo,
    model = EXCLUDED.model,
    system_prompt = EXCLUDED.system_prompt;

END $$;

-- Ensure view is accessible
GRANT SELECT ON public.vw_recent_invocations TO authenticated;
GRANT SELECT ON public.vw_recent_invocations TO anon;
