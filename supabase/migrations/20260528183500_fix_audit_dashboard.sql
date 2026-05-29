DO $$
BEGIN
  ALTER TABLE public.custos ALTER COLUMN estimated_cost TYPE numeric USING estimated_cost::numeric;
EXCEPTION
  WHEN others THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.get_agent_ranking(start_date timestamp with time zone, end_date timestamp with time zone)
 RETURNS TABLE(agent_id uuid, agent_name text, invocations_count bigint, total_tokens bigint, total_cost numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.name,
    COUNT(i.id)::bigint AS invocations_count,
    COALESCE(SUM(i.input_tokens + i.output_tokens), 0)::bigint AS total_tokens,
    COALESCE(SUM(c.estimated_cost), 0.0)::numeric AS total_cost
  FROM public.invocacoes i
  JOIN public.agentes a ON a.id = i.agent_id
  LEFT JOIN public.custos c ON c.invocation_id = i.id
  WHERE i.created_at >= start_date AND i.created_at <= end_date
  GROUP BY a.id, a.name
  ORDER BY total_cost DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_consumption(start_date timestamp with time zone, end_date timestamp with time zone)
 RETURNS TABLE(date text, cost numeric, invocations bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    TO_CHAR(date_trunc('day', i.created_at), 'YYYY-MM-DD') AS date,
    COALESCE(SUM(c.estimated_cost), 0.0)::numeric AS cost,
    COUNT(i.id)::bigint AS invocations
  FROM public.invocacoes i
  LEFT JOIN public.custos c ON c.invocation_id = i.id
  WHERE i.created_at >= start_date AND i.created_at <= end_date
  GROUP BY date_trunc('day', i.created_at)
  ORDER BY date_trunc('day', i.created_at) ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_ranking(start_date timestamp with time zone, end_date timestamp with time zone)
 RETURNS TABLE(user_id uuid, full_name text, invocations_count bigint, total_cost numeric, last_activity timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    COUNT(i.id)::bigint AS invocations_count,
    COALESCE(SUM(c.estimated_cost), 0.0)::numeric AS total_cost,
    MAX(i.created_at) AS last_activity
  FROM public.invocacoes i
  JOIN public.profiles p ON p.id = i.user_id
  LEFT JOIN public.custos c ON c.invocation_id = i.id
  WHERE i.created_at >= start_date AND i.created_at <= end_date
  GROUP BY p.id, p.full_name
  ORDER BY total_cost DESC;
END;
$$;

-- Fix permissions for the view
ALTER VIEW public.vw_recent_invocations SET (security_invoker = true);
GRANT SELECT ON public.vw_recent_invocations TO authenticated;
GRANT SELECT ON public.vw_recent_invocations TO anon;

-- Fix RLS policy on custos
DROP POLICY IF EXISTS "authenticated_select_custos" ON public.custos;
CREATE POLICY "authenticated_select_custos" ON public.custos
  FOR SELECT TO authenticated USING (true);
