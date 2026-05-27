DO $$
BEGIN
    -- Update existing agents to new models
    UPDATE public.agentes
    SET model = 'claude-sonnet-4-6'
    WHERE model LIKE '%claude-3-5%' OR model LIKE '%claude-3-7%' OR model LIKE '%sonnet%' OR model LIKE '%claude-3-%';

    UPDATE public.agentes
    SET model = 'claude-haiku-4-5'
    WHERE model LIKE '%haiku%';

    UPDATE public.agentes
    SET model = 'claude-opus-4-7'
    WHERE model LIKE '%opus%';

    -- Insert revisao-peticao agent if it does not exist
    INSERT INTO public.agentes (id, name, titulo, model, is_active, system_prompt, categoria, description)
    VALUES (
        gen_random_uuid(),
        'revisao-peticao',
        'Revisão de Petição',
        'claude-sonnet-4-6',
        true,
        'Você é um assistente jurídico especializado em revisão de peças processuais. Analise o texto fornecido e retorne sugestões objetivas de melhoria em formato de lista (bullet points). Foque em clareza, embasamento legal e coesão.',
        'revisao',
        'Agente especializado em revisar e sugerir melhorias para petições e minutas.'
    )
    ON CONFLICT (name) DO UPDATE
    SET 
        model = 'claude-sonnet-4-6',
        is_active = true,
        system_prompt = 'Você é um assistente jurídico especializado em revisão de peças processuais. Analise o texto fornecido e retorne sugestões objetivas de melhoria em formato de lista (bullet points). Foque em clareza, embasamento legal e coesão.';
END $$;
