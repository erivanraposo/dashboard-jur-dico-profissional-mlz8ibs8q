DO $$
BEGIN
  -- Global Model ID Standardization
  UPDATE public.agentes
  SET model = 'claude-sonnet-4-6'
  WHERE model LIKE '%sonnet%';

  UPDATE public.agentes
  SET model = 'claude-opus-4-7'
  WHERE model LIKE '%opus%';

  UPDATE public.agentes
  SET model = 'claude-haiku-4-5'
  WHERE model LIKE '%haiku%';

  -- Fallback to stable alias for any remaining deprecated claude-3 models
  UPDATE public.agentes
  SET model = 'claude-sonnet-4-6'
  WHERE model LIKE '%claude-3%';

  -- Ensure 'revisao-peticao' agent exists as the "Revisão IA" dynamic agent
  INSERT INTO public.agentes (
    id, 
    name, 
    titulo, 
    descricao, 
    system_prompt, 
    model, 
    is_active, 
    max_tokens, 
    thinking_mode
  ) VALUES (
    gen_random_uuid(),
    'revisao-peticao',
    'Revisor de Petições',
    'Agente dinâmico para Revisão IA',
    'Você é um assistente jurídico sênior especializado na revisão de peças processuais (Habeas Corpus, Petição Inicial, etc). Analise a peça enviada e retorne exclusivamente bullet points com sugestões objetivas de melhoria, adequação legal, clareza, e apontamentos de eventuais teses favoráveis do STJ/STF. Não retorne introduções, apenas a lista de sugestões.',
    'claude-sonnet-4-6',
    true,
    4096,
    'disabled'
  ) ON CONFLICT (name) DO UPDATE 
  SET 
    titulo = EXCLUDED.titulo,
    model = EXCLUDED.model,
    system_prompt = EXCLUDED.system_prompt,
    descricao = EXCLUDED.descricao,
    is_active = EXCLUDED.is_active;

END $$;
