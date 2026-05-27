DO $$
BEGIN
  -- Fix model names in agentes (specifically correcting typos like 'claude-3-5-sonnet-2024620')
  UPDATE public.agentes 
  SET model = 'claude-3-5-sonnet-20240620'
  WHERE model = 'claude-3-5-sonnet-2024620';

  -- Ensure the latest models are available: claude-3-7-sonnet-20250219 and claude-3-5-haiku-20241022
  INSERT INTO public.agentes (id, name, titulo, descricao, model, system_prompt, is_active, max_tokens, thinking_mode, effort, categoria, versao)
  VALUES 
    (gen_random_uuid(), 'Revisor Avançado 3.7', 'Revisor 3.7 Sonnet', 'Revisor Jurídico Avançado com capacidade de raciocínio profundo.', 'claude-3-7-sonnet-20250219', 'Você é um revisor jurídico sênior altamente detalhista. Por favor, analise a peça com o máximo rigor.', true, 4096, 'enabled', 'high', 'Revisão', 1),
    (gen_random_uuid(), 'Revisor Rápido Haiku', 'Revisor 3.5 Haiku', 'Revisor Jurídico Ágil e Direto.', 'claude-3-5-haiku-20241022', 'Você é um assistente jurídico ágil. Identifique melhorias de forma direta e concisa.', true, 4096, 'disabled', 'low', 'Revisão', 1)
  ON CONFLICT (name) DO UPDATE SET 
    model = EXCLUDED.model,
    thinking_mode = EXCLUDED.thinking_mode;
END $$;

-- Ensure we have RLS policies for telemetry insertion (invocacoes and custos)
DROP POLICY IF EXISTS "authenticated_insert_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_insert_invocacoes" ON public.invocacoes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "authenticated_select_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_select_invocacoes" ON public.invocacoes
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "authenticated_insert_custos" ON public.custos;
CREATE POLICY "authenticated_insert_custos" ON public.custos
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invocacoes i 
      WHERE i.id = invocation_id AND i.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "authenticated_select_custos" ON public.custos;
CREATE POLICY "authenticated_select_custos" ON public.custos
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.invocacoes i 
      WHERE i.id = invocation_id AND (
        i.user_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.profiles 
          WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'owner')
        )
      )
    )
  );
