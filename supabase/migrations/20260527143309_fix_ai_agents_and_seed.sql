DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- 1. Create seed user if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'erivan.raposo@gmail.com') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'erivan.raposo@gmail.com',
      crypt('Skip@Pass123!', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Erivan Raposo"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );
  END IF;

  -- 2. Upsert AI agents with correct official model identifiers
  INSERT INTO public.agentes (
    id, name, titulo, description, system_prompt, 
    model, is_active, max_tokens, thinking_mode, effort, tools, versao, categoria
  )
  VALUES 
    (
      gen_random_uuid(), 'revisor_senior', 'Revisor Sênior', 
      'Analisa a peça detalhadamente buscando erros e sugerindo melhorias com alta precisão.', 
      'Você é um advogado revisor sênior. Avalie a peça e forneça sugestões objetivas de melhoria em bullet points.', 
      'claude-3-7-sonnet-20250219', true, 4096, 'enabled', 'high', '[]'::jsonb, 1, 'Revisão'
    ),
    (
      gen_random_uuid(), 'revisor_rapido', 'Revisor Rápido', 
      'Revisão ortográfica e de coesão básica de forma acelerada.', 
      'Você é um revisor jurídico. Aponte rapidamente erros ortográficos e sugira correções em bullet points.', 
      'claude-3-5-haiku-20241022', true, 1024, 'disabled', 'low', '[]'::jsonb, 1, 'Revisão'
    )
  ON CONFLICT (name) DO UPDATE SET 
    model = EXCLUDED.model,
    thinking_mode = EXCLUDED.thinking_mode,
    max_tokens = EXCLUDED.max_tokens,
    effort = EXCLUDED.effort;

END $$;
