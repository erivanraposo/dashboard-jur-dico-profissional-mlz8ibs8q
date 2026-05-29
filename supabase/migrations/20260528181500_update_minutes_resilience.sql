-- 1. Ensure minutes table exists with correct structure
CREATE TABLE IF NOT EXISTS public.minutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID REFERENCES public.processes(id),
  lawyer_id UUID REFERENCES public.lawyers(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  client_name TEXT,
  comarca TEXT,
  objeto TEXT,
  pedido TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns if missing
ALTER TABLE public.minutes ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.minutes ADD COLUMN IF NOT EXISTS comarca TEXT;
ALTER TABLE public.minutes ADD COLUMN IF NOT EXISTS objeto TEXT;
ALTER TABLE public.minutes ADD COLUMN IF NOT EXISTS pedido TEXT;

-- 2. Update minutes RLS to ensure operations are authorized
DROP POLICY IF EXISTS "authenticated_all_minutes" ON public.minutes;
CREATE POLICY "authenticated_all_minutes" ON public.minutes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Update invocacoes RLS to ensure logs can be inserted properly
DROP POLICY IF EXISTS "authenticated_all_invocacoes" ON public.invocacoes;
CREATE POLICY "authenticated_all_invocacoes" ON public.invocacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Update custos RLS
DROP POLICY IF EXISTS "authenticated_all_custos" ON public.custos;
CREATE POLICY "authenticated_all_custos" ON public.custos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Create or Replace Triggers / Functions to keep updated_at in sync (idempotent)
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_minutes_updated_at ON public.minutes;
CREATE TRIGGER set_minutes_updated_at
  BEFORE UPDATE ON public.minutes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();
