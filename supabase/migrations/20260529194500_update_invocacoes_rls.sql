DO $$
BEGIN
  -- RLS for invocacoes
  DROP POLICY IF EXISTS "authenticated_all_invocacoes" ON public.invocacoes;
  CREATE POLICY "authenticated_all_invocacoes" ON public.invocacoes
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- RLS for custos
  DROP POLICY IF EXISTS "authenticated_all_custos" ON public.custos;
  CREATE POLICY "authenticated_all_custos" ON public.custos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- Ensure diagnostic_log exists in invocacoes
  ALTER TABLE public.invocacoes ADD COLUMN IF NOT EXISTS diagnostic_log TEXT;
END $$;
