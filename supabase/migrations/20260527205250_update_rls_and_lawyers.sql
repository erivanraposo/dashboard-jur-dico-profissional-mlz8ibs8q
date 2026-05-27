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
      NULL,
      '', '', ''
    );

    INSERT INTO public.profiles (id, full_name, role)
    VALUES (new_user_id, 'Erivan Raposo', 'admin')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Populate lawyers
  IF NOT EXISTS (SELECT 1 FROM public.lawyers WHERE oab_number = 'OAB/SP 123456') THEN
    INSERT INTO public.lawyers (id, full_name, oab_number)
    VALUES (gen_random_uuid(), 'Erivan Raposo', 'OAB/SP 123456');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.lawyers WHERE oab_number = 'OAB/SP 654321') THEN
    INSERT INTO public.lawyers (id, full_name, oab_number)
    VALUES (gen_random_uuid(), 'Sócio Administrador', 'OAB/SP 654321');
  END IF;
END $$;

-- Ensure RLS on invocacoes
DROP POLICY IF EXISTS "authenticated_insert_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_insert_invocacoes" ON public.invocacoes
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_select_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_select_invocacoes" ON public.invocacoes
  FOR SELECT TO authenticated USING (true);

-- Ensure RLS on custos
DROP POLICY IF EXISTS "authenticated_insert_custos" ON public.custos;
CREATE POLICY "authenticated_insert_custos" ON public.custos
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_select_custos" ON public.custos;
CREATE POLICY "authenticated_select_custos" ON public.custos
  FOR SELECT TO authenticated USING (true);

-- Ensure RLS on agentes
DROP POLICY IF EXISTS "authenticated_select_agentes" ON public.agentes;
CREATE POLICY "authenticated_select_agentes" ON public.agentes
  FOR SELECT TO authenticated USING (true);
