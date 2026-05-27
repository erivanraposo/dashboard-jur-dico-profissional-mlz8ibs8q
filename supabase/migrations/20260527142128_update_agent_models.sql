DO $$
BEGIN
  -- 1. Targeted Updates for specific agents
  UPDATE public.agentes SET model = 'claude-3-7-sonnet-20250219' WHERE name = 'parecer-juridico';
  UPDATE public.agentes SET model = 'claude-3-5-sonnet-20241022' WHERE name = 'peticao-inicial-civel';
  UPDATE public.agentes SET model = 'claude-3-5-sonnet-20241022' WHERE name = 'contestacao-civel';
  UPDATE public.agentes SET model = 'claude-3-5-sonnet-20241022' WHERE name = 'revisao-clausula';
  UPDATE public.agentes SET model = 'claude-3-5-sonnet-20241022' WHERE name = 'resumo-processo';
  UPDATE public.agentes SET model = 'claude-3-5-haiku-20241022' WHERE name = 'triagem-novo-caso';
  UPDATE public.agentes SET model = 'claude-3-5-sonnet-20241022' WHERE name = 'calculo-judicial-atualizacao';
  UPDATE public.agentes SET model = 'claude-3-7-sonnet-20250219' WHERE name = 'jurisprudencia-stj-stf';

  -- 2. Fallback Mapping for any remaining custom agents with invalid placeholder models
  UPDATE public.agentes SET model = 'claude-3-7-sonnet-20250219' WHERE model = 'claude-opus-4-7';
  UPDATE public.agentes SET model = 'claude-3-5-sonnet-20241022' WHERE model = 'claude-sonnet-4-6';
  UPDATE public.agentes SET model = 'claude-3-5-haiku-20241022' WHERE model = 'claude-haiku-4-5';
END $$;
