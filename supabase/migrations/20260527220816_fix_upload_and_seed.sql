DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Seed initial admin user if not exists
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
      crypt('Skip@Pass123', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Erivan Raposo"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, full_name, role)
    VALUES (new_user_id, 'Erivan Raposo', 'admin')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Create storage bucket for process attachments
  INSERT INTO storage.buckets (id, name, public) 
  VALUES ('process-attachments', 'process-attachments', false) 
  ON CONFLICT (id) DO NOTHING;
END $$;

-- RLS Policies for the storage bucket
DROP POLICY IF EXISTS "Authenticated users can upload process-attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload process-attachments" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'process-attachments');

DROP POLICY IF EXISTS "Authenticated users can read process-attachments" ON storage.objects;
CREATE POLICY "Authenticated users can read process-attachments" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'process-attachments');

DROP POLICY IF EXISTS "Authenticated users can delete process-attachments" ON storage.objects;
CREATE POLICY "Authenticated users can delete process-attachments" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'process-attachments');
