DO $$
DECLARE
  new_user_id uuid;
  new_workspace_id uuid;
BEGIN
  -- Insert Workspace
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE name = 'LexControl Workspace') THEN
    new_workspace_id := gen_random_uuid();
    INSERT INTO public.workspaces (id, name, budget_mensal_usd)
    VALUES (new_workspace_id, 'LexControl Workspace', 500.00);
  ELSE
    SELECT id INTO new_workspace_id FROM public.workspaces WHERE name = 'LexControl Workspace' LIMIT 1;
  END IF;

  -- Seed the test user
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

    INSERT INTO public.profiles (id, full_name, role, workspace_id)
    VALUES (new_user_id, 'Erivan Raposo', 'admin', new_workspace_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Update RLS policies for profiles to guarantee full functionality for logged users
DROP POLICY IF EXISTS "authenticated_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_update_profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_insert_profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_delete_profiles" ON public.profiles;

CREATE POLICY "authenticated_select_profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_profiles" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "authenticated_update_profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Update RLS policies for workspaces to guarantee functionality and prevent recursion
DROP POLICY IF EXISTS "authenticated_all_workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "authenticated_select_workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "authenticated_insert_workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "authenticated_update_workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "authenticated_delete_workspaces" ON public.workspaces;

CREATE POLICY "authenticated_select_workspaces" ON public.workspaces
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_workspaces" ON public.workspaces
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update_workspaces" ON public.workspaces
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_delete_workspaces" ON public.workspaces
  FOR DELETE TO authenticated USING (true);
