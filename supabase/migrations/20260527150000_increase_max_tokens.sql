-- Increase max_tokens for AI agents to support full document generation
DO $$
BEGIN
  UPDATE public.agentes
  SET max_tokens = 8192
  WHERE max_tokens < 8192;
END $$;
