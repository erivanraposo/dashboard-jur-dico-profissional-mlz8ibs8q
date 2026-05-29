DO $$
DECLARE
  new_user_id uuid;
  new_workspace_id uuid;
BEGIN
  -- Check and insert seed user
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'erivan.raposo@gmail.com') THEN
    new_user_id := gen_random_uuid();
    new_workspace_id := gen_random_uuid();

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

    INSERT INTO public.workspaces (id, name, budget_mensal_usd)
    VALUES (new_workspace_id, 'Meu Workspace', 100.0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, full_name, role, workspace_id)
    VALUES (new_user_id, 'Erivan Raposo', 'owner', new_workspace_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
