-- Fix RLS for minutes
DROP POLICY IF EXISTS "authenticated_all_minutes" ON public.minutes;
CREATE POLICY "authenticated_all_minutes" ON public.minutes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fix RLS for invocacoes
DROP POLICY IF EXISTS "authenticated_all_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_all_invocacoes" ON public.invocacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed user and workspace
DO $$
DECLARE
  new_workspace_id uuid;
  new_user_id uuid;
BEGIN
  -- Insert Workspace
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE name = 'LexControl Principal') THEN
    new_workspace_id := gen_random_uuid();
    INSERT INTO public.workspaces (id, name, budget_mensal_usd)
    VALUES (new_workspace_id, 'LexControl Principal', 100.00);
  ELSE
    SELECT id INTO new_workspace_id FROM public.workspaces WHERE name = 'LexControl Principal' LIMIT 1;
  END IF;

  -- Seed User: erivan.raposo@gmail.com
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
      crypt('Skip@Pass123!', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Erivan Raposo"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, full_name, role, workspace_id)
    VALUES (new_user_id, 'Erivan Raposo', 'owner', new_workspace_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
