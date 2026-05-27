DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Seed the initial user erivan.raposo@gmail.com and ensure they are an owner
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
      crypt('Skip@Pass123', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Erivan Raposo"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, full_name, role)
    VALUES (new_user_id, 'Erivan Raposo', 'owner')
    ON CONFLICT (id) DO UPDATE SET role = 'owner';
  ELSE
    SELECT id INTO new_user_id FROM auth.users WHERE email = 'erivan.raposo@gmail.com' LIMIT 1;
    
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (new_user_id, 'Erivan Raposo', 'owner')
    ON CONFLICT (id) DO UPDATE SET role = 'owner';
  END IF;
END $$;

-- Ensure the view is created with security_invoker = true to reliably enforce RLS based on the executing user
CREATE OR REPLACE VIEW public.vw_recent_invocations WITH (security_invoker = true) AS
SELECT 
  i.id,
  i.created_at,
  i.input_tokens,
  i.output_tokens,
  i.user_id,
  i.agent_id,
  i.process_id,
  c.estimated_cost,
  c.currency,
  a.name AS agent_name,
  a.model AS agent_model,
  p.full_name AS user_name
FROM public.invocacoes i
LEFT JOIN public.custos c ON c.invocation_id = i.id
LEFT JOIN public.agentes a ON a.id = i.agent_id
LEFT JOIN public.profiles p ON p.id = i.user_id;
