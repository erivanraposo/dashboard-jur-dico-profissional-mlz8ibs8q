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
      crypt('Skip@Pass123!', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Erivan Raposo"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, full_name, role)
    VALUES (new_user_id, 'Erivan Raposo', 'owner')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Fix models to valid Anthropic identifiers
UPDATE public.agentes SET model = 'claude-3-5-sonnet-latest' WHERE model IN ('claude-sonnet-4-6', 'claude-3-sonnet-20240229');
UPDATE public.agentes SET model = 'claude-3-5-haiku-latest' WHERE model IN ('claude-haiku-4-5', 'claude-3-haiku-20240307');
UPDATE public.agentes SET model = 'claude-3-opus-latest' WHERE model IN ('claude-opus-4-7', 'claude-3-opus-20240229');

-- Ensure indexes for performance
CREATE INDEX IF NOT EXISTS idx_invocacoes_created_at ON public.invocacoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custos_invocation_id ON public.custos(invocation_id);

-- Fix functions syntax and permissions (resolving 42601 syntax errors)
CREATE OR REPLACE FUNCTION public.get_daily_consumption(start_date timestamp with time zone, end_date timestamp with time zone)
RETURNS TABLE(date text, cost numeric, invocations bigint)
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT 
    TO_CHAR(date_trunc('day', i.created_at), 'YYYY-MM-DD') AS date,
    COALESCE(SUM(COALESCE(c.estimated_cost, 0.0)), 0.0)::numeric AS cost,
    COUNT(i.id)::bigint AS invocations
  FROM public.invocacoes i
  LEFT JOIN public.custos c ON c.invocation_id = i.id
  WHERE i.created_at >= start_date AND i.created_at <= end_date
  GROUP BY date_trunc('day', i.created_at)
  ORDER BY date_trunc('day', i.created_at) ASC;
$function$;

CREATE OR REPLACE FUNCTION public.get_agent_ranking(start_date timestamp with time zone, end_date timestamp with time zone)
RETURNS TABLE(agent_id uuid, agent_name text, invocations_count bigint, total_tokens bigint, total_cost numeric)
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT 
    a.id AS agent_id,
    a.name AS agent_name,
    COUNT(i.id)::bigint AS invocations_count,
    COALESCE(SUM(COALESCE(i.input_tokens, 0) + COALESCE(i.output_tokens, 0)), 0)::bigint AS total_tokens,
    COALESCE(SUM(COALESCE(c.estimated_cost, 0.0)), 0.0)::numeric AS total_cost
  FROM public.invocacoes i
  JOIN public.agentes a ON a.id = i.agent_id
  LEFT JOIN public.custos c ON c.invocation_id = i.id
  WHERE i.created_at >= start_date AND i.created_at <= end_date
  GROUP BY a.id, a.name
  ORDER BY total_cost DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_ranking(start_date timestamp with time zone, end_date timestamp with time zone)
RETURNS TABLE(user_id uuid, full_name text, invocations_count bigint, total_cost numeric, last_activity timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT 
    p.id AS user_id,
    COALESCE(p.full_name, 'Desconhecido') AS full_name,
    COUNT(i.id)::bigint AS invocations_count,
    COALESCE(SUM(COALESCE(c.estimated_cost, 0.0)), 0.0)::numeric AS total_cost,
    MAX(i.created_at) AS last_activity
  FROM public.invocacoes i
  JOIN public.profiles p ON p.id = i.user_id
  LEFT JOIN public.custos c ON c.invocation_id = i.id
  WHERE i.created_at >= start_date AND i.created_at <= end_date
  GROUP BY p.id, p.full_name
  ORDER BY total_cost DESC;
$function$;

-- Ensure RLS Policies
DROP POLICY IF EXISTS "authenticated_select_agentes" ON public.agentes;
CREATE POLICY "authenticated_select_agentes" ON public.agentes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_all_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_all_invocacoes" ON public.invocacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_custos" ON public.custos;
CREATE POLICY "authenticated_all_custos" ON public.custos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_select_profiles" ON public.profiles;
CREATE POLICY "authenticated_select_profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
