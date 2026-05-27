-- Seed Auth User
DO $$
DECLARE
  new_user_id uuid;
BEGIN
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
  END IF;
END $$;

-- Seed Lawyers (as required for the signature block)
INSERT INTO public.lawyers (id, full_name, oab_number)
VALUES 
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Dr. Luiz Moreira Gomes Junior', 'OAB/SP 123456'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Dr. Sanders Barão', 'OAB/SP 654321')
ON CONFLICT (id) DO NOTHING;

-- Create process_attachments table
CREATE TABLE IF NOT EXISTS public.process_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID REFERENCES public.processes(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.process_attachments ENABLE ROW LEVEL SECURITY;

-- Policies for process_attachments
DROP POLICY IF EXISTS "authenticated_all_process_attachments" ON public.process_attachments;
CREATE POLICY "authenticated_all_process_attachments" ON public.process_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Ensure the storage bucket exists with 10MB limit (10485760 bytes)
INSERT INTO storage.buckets (id, name, public, file_size_limit) 
VALUES ('legal_documents', 'legal_documents', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

-- Enable authenticated users to manage files in this bucket
DROP POLICY IF EXISTS "authenticated_manage_legal_documents" ON storage.objects;
CREATE POLICY "authenticated_manage_legal_documents" ON storage.objects
  FOR ALL TO authenticated 
  USING (bucket_id = 'legal_documents') 
  WITH CHECK (bucket_id = 'legal_documents');
