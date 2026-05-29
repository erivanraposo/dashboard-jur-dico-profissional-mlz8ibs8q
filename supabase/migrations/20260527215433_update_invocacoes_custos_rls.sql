-- invocacoes UPDATE policy
DROP POLICY IF EXISTS "authenticated_update_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_update_invocacoes" ON public.invocacoes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- custos UPDATE policy
DROP POLICY IF EXISTS "authenticated_update_custos" ON public.custos;
CREATE POLICY "authenticated_update_custos" ON public.custos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Remove duplicates and add unique constraint to custos
DELETE FROM public.custos a USING public.custos b
WHERE a.id > b.id AND a.invocation_id = b.invocation_id;

ALTER TABLE public.custos DROP CONSTRAINT IF EXISTS custos_invocation_id_key;
ALTER TABLE public.custos ADD CONSTRAINT custos_invocation_id_key UNIQUE (invocation_id);
