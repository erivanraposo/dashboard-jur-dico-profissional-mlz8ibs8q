CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  budget_mensal_usd NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'owner', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_select_workspaces" ON public.workspaces;
CREATE POLICY "authenticated_select_workspaces" ON public.workspaces
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.workspace_id = workspaces.id AND profiles.id = auth.uid()
    )
  );

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_select_profiles" ON public.profiles;
CREATE POLICY "authenticated_select_profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "authenticated_select_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_select_invocacoes" ON public.invocacoes
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "authenticated_select_custos" ON public.custos;
CREATE POLICY "authenticated_select_custos" ON public.custos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invocacoes
      WHERE invocacoes.id = custos.invocation_id AND (
        invocacoes.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.profiles 
          WHERE id = auth.uid() AND role IN ('admin', 'owner')
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.get_daily_consumption(start_date TIMESTAMPTZ, end_date TIMESTAMPTZ)
RETURNS TABLE (
  date TEXT,
  cost NUMERIC,
  invocations BIGINT
) AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    TO_CHAR(date_trunc('day', i.created_at), 'YYYY-MM-DD') AS date,
    COALESCE(SUM(c.estimated_cost), 0) AS cost,
    COUNT(i.id) AS invocations
  FROM public.invocacoes i
  LEFT JOIN public.custos c ON c.invocation_id = i.id
  WHERE i.created_at >= start_date AND i.created_at <= end_date
  GROUP BY date_trunc('day', i.created_at)
  ORDER BY date_trunc('day', i.created_at) ASC;
END;
$function$ LANGUAGE plpgsql SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.get_agent_ranking(start_date TIMESTAMPTZ, end_date TIMESTAMPTZ)
RETURNS TABLE (
  agent_id UUID,
  agent_name TEXT,
  invocations_count BIGINT,
  total_tokens BIGINT,
  total_cost NUMERIC
) AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.name,
    COUNT(i.id) AS invocations_count,
    COALESCE(SUM(i.input_tokens + i.output_tokens), 0) AS total_tokens,
    COALESCE(SUM(c.estimated_cost), 0) AS total_cost
  FROM public.invocacoes i
  JOIN public.agentes a ON a.id = i.agent_id
  LEFT JOIN public.custos c ON c.invocation_id = i.id
  WHERE i.created_at >= start_date AND i.created_at <= end_date
  GROUP BY a.id, a.name
  ORDER BY total_cost DESC;
END;
$function$ LANGUAGE plpgsql SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.get_user_ranking(start_date TIMESTAMPTZ, end_date TIMESTAMPTZ)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  invocations_count BIGINT,
  total_cost NUMERIC,
  last_activity TIMESTAMPTZ
) AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    COUNT(i.id) AS invocations_count,
    COALESCE(SUM(c.estimated_cost), 0) AS total_cost,
    MAX(i.created_at) AS last_activity
  FROM public.invocacoes i
  JOIN public.profiles p ON p.id = i.user_id
  LEFT JOIN public.custos c ON c.invocation_id = i.id
  WHERE i.created_at >= start_date AND i.created_at <= end_date
  GROUP BY p.id, p.full_name
  ORDER BY total_cost DESC;
END;
$function$ LANGUAGE plpgsql SECURITY INVOKER;

CREATE OR REPLACE VIEW public.vw_recent_invocations WITH (security_invoker = true) AS
SELECT 
  i.id,
  i.created_at,
  i.input_tokens,
  i.output_tokens,
  i.user_id,
  i.agent_id,
  i.process_id,
  c.estimated_cost,
  c.currency,
  a.name AS agent_name,
  a.model AS agent_model,
  p.full_name AS user_name
FROM public.invocacoes i
LEFT JOIN public.custos c ON c.invocation_id = i.id
LEFT JOIN public.agentes a ON a.id = i.agent_id
LEFT JOIN public.profiles p ON p.id = i.user_id;

DO $seed$
DECLARE
  v_workspace_id uuid;
  v_admin_id uuid;
  v_member_id uuid;
  v_agent_id uuid;
  v_invoc_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE name = 'LexControl Workspace') THEN
    v_workspace_id := gen_random_uuid();
    INSERT INTO public.workspaces (id, name, budget_mensal_usd)
    VALUES (v_workspace_id, 'LexControl Workspace', 500.00);
  ELSE
    SELECT id INTO v_workspace_id FROM public.workspaces WHERE name = 'LexControl Workspace' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'erivan.raposo@gmail.com') THEN
    v_admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_admin_id, '00000000-0000-0000-0000-000000000000', 'erivan.raposo@gmail.com',
      crypt('Skip@Pass123', gen_salt('bf')), NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}', '{"name": "Admin"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );
  ELSE
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'erivan.raposo@gmail.com' LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, workspace_id, full_name, role)
  VALUES (v_admin_id, v_workspace_id, 'Erivan Raposo (Admin)', 'admin')
  ON CONFLICT (id) DO UPDATE SET workspace_id = v_workspace_id, role = 'admin';

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'advogado@lexcontrol.com') THEN
    v_member_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_member_id, '00000000-0000-0000-0000-000000000000', 'advogado@lexcontrol.com',
      crypt('Skip@Pass123', gen_salt('bf')), NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}', '{"name": "Advogado"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );
  ELSE
    SELECT id INTO v_member_id FROM auth.users WHERE email = 'advogado@lexcontrol.com' LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, workspace_id, full_name, role)
  VALUES (v_member_id, v_workspace_id, 'Advogado Associado', 'member')
  ON CONFLICT (id) DO UPDATE SET workspace_id = v_workspace_id, role = 'member';

  IF NOT EXISTS (SELECT 1 FROM public.agentes LIMIT 1) THEN
    v_agent_id := gen_random_uuid();
    INSERT INTO public.agentes (id, name, system_prompt, model, titulo)
    VALUES (v_agent_id, 'agente-revisor', 'Você é um revisor.', 'claude-3-haiku-20240307', 'Revisor de Peças');
  ELSE
    SELECT id INTO v_agent_id FROM public.agentes LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.invocacoes LIMIT 1) THEN
    FOR i IN 1..15 LOOP
      v_invoc_id := gen_random_uuid();
      INSERT INTO public.invocacoes (id, user_id, agent_id, input_tokens, output_tokens, created_at)
      VALUES (v_invoc_id, v_admin_id, v_agent_id, 1000 + (i * 100), 200 + (i * 50), NOW() - (i || ' days')::interval);
      
      INSERT INTO public.custos (invocation_id, estimated_cost, currency)
      VALUES (v_invoc_id, (1000 + (i * 100)) * 0.000003 + (200 + (i * 50)) * 0.000015, 'USD');
      
      v_invoc_id := gen_random_uuid();
      INSERT INTO public.invocacoes (id, user_id, agent_id, input_tokens, output_tokens, created_at)
      VALUES (v_invoc_id, v_member_id, v_agent_id, 800 + (i * 50), 150 + (i * 20), NOW() - (i || ' days')::interval);
      
      INSERT INTO public.custos (invocation_id, estimated_cost, currency)
      VALUES (v_invoc_id, (800 + (i * 50)) * 0.000003 + (150 + (i * 20)) * 0.000015, 'USD');
    END LOOP;
  END IF;
END $seed$;
