-- Migration: AI Agents Management System

-- 1. Create Agentes Table
CREATE TABLE IF NOT EXISTS public.agentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agentes_name_key UNIQUE (name)
);

-- 2. Create Invocacoes Table
CREATE TABLE IF NOT EXISTS public.invocacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES public.agentes(id) ON DELETE CASCADE NOT NULL,
  process_id UUID REFERENCES public.processes(id) ON DELETE SET NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create Custos Table
CREATE TABLE IF NOT EXISTS public.custos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invocation_id UUID REFERENCES public.invocacoes(id) ON DELETE CASCADE NOT NULL,
  estimated_cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  cached_tokens INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Enable RLS
ALTER TABLE public.agentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invocacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custos ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "authenticated_select_agentes" ON public.agentes;
CREATE POLICY "authenticated_select_agentes" ON public.agentes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_insert_invocacoes" ON public.invocacoes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "authenticated_select_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_select_invocacoes" ON public.invocacoes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "authenticated_insert_custos" ON public.custos;
CREATE POLICY "authenticated_insert_custos" ON public.custos
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.invocacoes WHERE id = invocation_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "authenticated_select_custos" ON public.custos;
CREATE POLICY "authenticated_select_custos" ON public.custos
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.invocacoes WHERE id = invocation_id AND user_id = auth.uid())
  );

-- 6. Seed Auth User
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
      '{"name": "Admin Jurídico"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );
  END IF;
END $$;

-- 7. Seed Agentes
INSERT INTO public.agentes (id, name, description, system_prompt, model, is_active)
VALUES 
  ('1e4d3a01-0000-0000-0000-000000000001'::uuid, 'Peticionador Cível', 'Especialista em peças e recursos da área cível.', 'Você é um assistente jurídico experiente, especializado em direito civil brasileiro. Analise o caso e forneça sugestões de melhoria para a petição.', 'claude-3-5-sonnet-20240620', true),
  ('1e4d3a02-0000-0000-0000-000000000002'::uuid, 'Analista de Jurisprudência', 'Busca e alinha teses com precedentes qualificados.', 'Você é um pesquisador jurídico. Sua função é avaliar se os argumentos da peça estão alinhados com a jurisprudência dominante (STJ/STF).', 'claude-3-5-sonnet-20240620', true),
  ('1e4d3a03-0000-0000-0000-000000000003'::uuid, 'Revisor Penal', 'Especialista em defesas e garantias penais.', 'Você é um advogado criminalista com vasta experiência. Revise a peça para garantir que os princípios de ampla defesa e contraditório estejam bem fundamentados.', 'claude-3-5-sonnet-20240620', true)
ON CONFLICT (id) DO NOTHING;
