DO $$
BEGIN
  UPDATE public.agentes 
  SET model = 'claude-sonnet-4-6' 
  WHERE model LIKE 'claude-3-5-sonnet%';
END $$;
