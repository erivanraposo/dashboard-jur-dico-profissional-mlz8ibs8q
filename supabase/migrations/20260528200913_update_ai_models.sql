DO $$
BEGIN
  -- Update legacy models to the new standard models
  UPDATE public.agentes
  SET model = 'claude-sonnet-4-6'
  WHERE model ILIKE '%claude-3-5-sonnet%' 
     OR model ILIKE '%claude-3-sonnet%' 
     OR model ILIKE '%sonnet-latest%'
     OR model ILIKE '%sonnet-2024%';

  UPDATE public.agentes
  SET model = 'claude-haiku-4-5'
  WHERE model ILIKE '%claude-3-haiku%'
     OR model ILIKE '%haiku-latest%';

  UPDATE public.agentes
  SET model = 'claude-opus-4-7'
  WHERE model ILIKE '%claude-3-opus%'
     OR model ILIKE '%opus-latest%';

  -- Fallback for any other empty or weird models
  UPDATE public.agentes
  SET model = 'claude-sonnet-4-6'
  WHERE model IS NULL OR model = '';
END $$;
