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
      crypt('Skip@Pass123', gen_salt('bf')),
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
END $$;

-- Ensure RLS on minutes
DROP POLICY IF EXISTS "authenticated_all_minutes" ON public.minutes;
CREATE POLICY "authenticated_all_minutes" ON public.minutes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Ensure RLS on invocacoes
DROP POLICY IF EXISTS "authenticated_insert_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_insert_invocacoes" ON public.invocacoes
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_select_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_select_invocacoes" ON public.invocacoes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_update_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_update_invocacoes" ON public.invocacoes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Ensure RLS on custos
DROP POLICY IF EXISTS "authenticated_insert_custos" ON public.custos;
CREATE POLICY "authenticated_insert_custos" ON public.custos
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_select_custos" ON public.custos;
CREATE POLICY "authenticated_select_custos" ON public.custos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_update_custos" ON public.custos;
CREATE POLICY "authenticated_update_custos" ON public.custos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Define RPC functions with SECURITY DEFINER to bypass RLS limitations across tables
CREATE OR REPLACE FUNCTION public.get_agent_ranking(start_date timestamp with time zone, end_date timestamp with time zone)
 RETURNS TABLE(agent_id uuid, agent_name text, invocations_count bigint, total_tokens bigint, total_cost numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_daily_consumption(start_date timestamp with time zone, end_date timestamp with time zone)
 RETURNS TABLE(date text, cost numeric, invocations bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_user_ranking(start_date timestamp with time zone, end_date timestamp with time zone)
 RETURNS TABLE(user_id uuid, full_name text, invocations_count bigint, total_cost numeric, last_activity timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

-- Update the recent invocations view and grant permissions
DROP VIEW IF EXISTS public.vw_recent_invocations;
CREATE VIEW public.vw_recent_invocations AS
 SELECT i.id,
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
   FROM invocacoes i
     LEFT JOIN custos c ON c.invocation_id = i.id
     LEFT JOIN agentes a ON a.id = i.agent_id
     LEFT JOIN profiles p ON p.id = i.user_id;

GRANT SELECT ON public.vw_recent_invocations TO authenticated;
