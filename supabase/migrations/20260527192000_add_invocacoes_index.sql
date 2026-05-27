CREATE INDEX IF NOT EXISTS idx_invocacoes_created_at ON public.invocacoes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custos_invocation_id ON public.custos (invocation_id);
