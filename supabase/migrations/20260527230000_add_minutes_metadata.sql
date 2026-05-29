DO $$
BEGIN
  ALTER TABLE public.minutes ADD COLUMN IF NOT EXISTS client_name TEXT;
  ALTER TABLE public.minutes ADD COLUMN IF NOT EXISTS comarca TEXT;
  ALTER TABLE public.minutes ADD COLUMN IF NOT EXISTS objeto TEXT;
  ALTER TABLE public.minutes ADD COLUMN IF NOT EXISTS pedido TEXT;
END $$;
