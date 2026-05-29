DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Seed initial user (idempotent: skip if email already exists)
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

    -- Insert into dependent profiles using the same new_user_id
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (new_user_id, 'Erivan Raposo', 'admin')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Ensure RLS policies on minutes, process_attachments, and invocacoes allow ALL for authenticated users
DROP POLICY IF EXISTS "authenticated_all_minutes" ON public.minutes;
CREATE POLICY "authenticated_all_minutes" ON public.minutes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_process_attachments" ON public.process_attachments;
CREATE POLICY "authenticated_all_process_attachments" ON public.process_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_all_invocacoes" ON public.invocacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
