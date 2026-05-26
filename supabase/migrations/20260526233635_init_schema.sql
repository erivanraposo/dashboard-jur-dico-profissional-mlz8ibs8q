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
      '', '', '', '', '', NULL, '', '', ''
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.lawyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  oab_number TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  area TEXT NOT NULL,
  status TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.minutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID REFERENCES public.processes(id),
  lawyer_id UUID REFERENCES public.lawyers(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.jurisprudence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court TEXT NOT NULL,
  summary TEXT NOT NULL,
  full_text TEXT,
  link TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.clipped_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  jurisprudence_id UUID REFERENCES public.jurisprudence(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, jurisprudence_id)
);

-- Seeds
INSERT INTO public.lawyers (id, full_name, oab_number) VALUES
  ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'::uuid, 'LUIZ MOREIRA GOMES JUNIOR', 'OAB/MG 247.000'),
  ('f1e2d3c4-b5a6-4f5e-8d9c-0b1a2f3e4d5c'::uuid, 'Sanders Barão', 'OAB/MG 112.898')
ON CONFLICT DO NOTHING;

INSERT INTO public.processes (id, case_number, client_name, area, status, description) VALUES
  (gen_random_uuid(), '0012345-67.2023.8.26.0000', 'João da Silva', 'Penal', 'Ativo', 'Apelação Criminal'),
  (gen_random_uuid(), '0089765-43.2023.8.26.0000', 'Maria Souza', 'Penal', 'Ativo', 'Habeas Corpus'),
  (gen_random_uuid(), '1023456-89.2023.8.26.0100', 'Empresa XYZ', 'Cível', 'Ativo', 'Petição Inicial'),
  (gen_random_uuid(), '1098765-12.2022.8.26.0100', 'José Santos', 'Cível', 'Prazo Fatal', 'Contestação')
ON CONFLICT DO NOTHING;

INSERT INTO public.jurisprudence (id, court, summary, full_text, tags) VALUES
  (gen_random_uuid(), 'STJ', 'HABEAS CORPUS. TRÁFICO DE DROGAS. PRISÃO PREVENTIVA. FUNDAMENTAÇÃO INIDÔNEA.', 'O EXMO. SR. MINISTRO REYNALDO SOARES DA FONSECA (Relator): Trata-se de habeas corpus... A prisão preventiva exige fundamentação concreta.', ARRAY['Penal', 'Habeas Corpus']),
  (gen_random_uuid(), 'TJSP', 'APELAÇÃO CÍVEL. AÇÃO DE INDENIZAÇÃO POR DANOS MORAIS. INSCRIÇÃO INDEVIDA.', 'AÇÃO DECLARATÓRIA DE INEXIGIBILIDADE DE DÉBITO. Inscrição indevida do nome... Dano moral in re ipsa.', ARRAY['Cível', 'Indenização']),
  (gen_random_uuid(), 'STF', 'AGRAVO REGIMENTAL EM HABEAS CORPUS. ROUBO MAJORADO. RECONHECIMENTO FOTOGRÁFICO.', 'O reconhecimento de pessoa, presencial ou por fotografia... A inobservância das referidas formalidades acarreta a nulidade.', ARRAY['Penal', 'Nulidade'])
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE public.lawyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jurisprudence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clipped_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_lawyers" ON public.lawyers;
CREATE POLICY "authenticated_select_lawyers" ON public.lawyers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_all_processes" ON public.processes;
CREATE POLICY "authenticated_all_processes" ON public.processes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_minutes" ON public.minutes;
CREATE POLICY "authenticated_all_minutes" ON public.minutes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_jurisprudence" ON public.jurisprudence;
CREATE POLICY "authenticated_all_jurisprudence" ON public.jurisprudence FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_clipped_cases" ON public.clipped_cases;
CREATE POLICY "authenticated_all_clipped_cases" ON public.clipped_cases FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
