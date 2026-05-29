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

  -- Update agent models to standardize on latest Claude 4 versions
  UPDATE public.agentes
  SET model = 'claude-opus-4-7'
  WHERE model LIKE 'claude-3-opus%' OR model LIKE 'claude-2%';

  UPDATE public.agentes
  SET model = 'claude-sonnet-4-6'
  WHERE model LIKE 'claude-3-sonnet%' OR model LIKE 'claude-3-5-sonnet%';

  UPDATE public.agentes
  SET model = 'claude-haiku-4-5'
  WHERE model LIKE 'claude-3-haiku%' OR model LIKE 'claude-3-5-haiku%' OR model LIKE 'claude-instant%';

END $$;
