ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS titulo text;
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS max_tokens integer DEFAULT 4096;
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS thinking_mode text DEFAULT 'disabled';
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS effort text DEFAULT 'low';
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS tools jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS versao integer DEFAULT 1;

DO $$
BEGIN
  INSERT INTO public.agentes (
    name, titulo, descricao, description, categoria, model, max_tokens, 
    thinking_mode, effort, tools, system_prompt, is_active, versao
  )
  VALUES
  (
    'parecer-juridico', 'Parecer Jurídico Consultivo', 
    'Especialista em elaboração de pareceres jurídicos fundamentados.', 
    'Especialista em elaboração de pareceres jurídicos fundamentados.', 
    'consultivo', 'claude-3-7-sonnet-20250219', 8192, 'enabled', 'high', '[]'::jsonb, 
    $sys$Você é um jurista sênior especialista em pareceres jurídicos. Sua missão é fornecer análises aprofundadas, considerando doutrina, jurisprudência recente e impactos práticos.$sys$, 
    true, 1
  ),
  (
    'peticao-inicial', 'Petição Inicial Cível (Rito Comum)', 
    'Agente focado em redação de petições iniciais precisas.', 
    'Agente focado em redação de petições iniciais precisas.', 
    'contencioso', 'claude-3-7-sonnet-20250219', 8192, 'enabled', 'high', '[]'::jsonb, 
    $sys$Você é um advogado contencioso especialista em peças exordiais. Estruture a petição inicial com fatos claros, fundamentos jurídicos irrefutáveis e pedidos precisos.$sys$, 
    true, 1
  ),
  (
    'contestacao', 'Contestação Cível', 
    'Especialista em apresentar defesas e preliminares processuais.', 
    'Especialista em apresentar defesas e preliminares processuais.', 
    'contencioso', 'claude-3-7-sonnet-20250219', 8192, 'enabled', 'high', '[]'::jsonb, 
    $sys$Você é um advogado de defesa cível especializado. Seu objetivo é desconstruir a narrativa da inicial, arguir preliminares e impugnar especificamente cada pedido.$sys$, 
    true, 1
  ),
  (
    'revisao-contrato', 'Revisão de Cláusula', 
    'Auditor de contratos focado em mitigar riscos legais.', 
    'Auditor de contratos focado em mitigar riscos legais.', 
    'contratual', 'claude-3-7-sonnet-20250219', 4096, 'disabled', 'medium', '[]'::jsonb, 
    $sys$Você é um especialista em direito contratual e auditoria legal. Revise cláusulas buscando ambiguidades, desequilíbrio contratual e proteção máxima ao cliente.$sys$, 
    true, 1
  ),
  (
    'resumo-processo', 'Resumo de Processo', 
    'Sintetizador de andamentos processuais e despachos.', 
    'Sintetizador de andamentos processuais e despachos.', 
    'transversal', 'claude-haiku-4-5', 2048, 'disabled', 'low', '[]'::jsonb, 
    $sys$Você é um assistente paralegal rápido. Resuma andamentos processuais de forma cronológica, objetiva e destacando apenas decisões ou despachos relevantes.$sys$, 
    true, 1
  ),
  (
    'triagem', 'Triagem de Novos Casos', 
    'Assistente para análise inicial de probabilidade de êxito.', 
    'Assistente para análise inicial de probabilidade de êxito.', 
    'atendimento', 'claude-haiku-4-5', 2048, 'disabled', 'low', '[]'::jsonb, 
    $sys$Você é um especialista em intake e triagem jurídica. Analise fatos relatados pelo cliente e aponte viabilidade, prescrição, decadência e próximos passos imediatos.$sys$, 
    true, 1
  ),
  (
    'calculo', 'Cálculo Judicial', 
    'Agente para estimativas e conferência de cálculos.', 
    'Agente para estimativas e conferência de cálculos.', 
    'calculo', 'claude-3-7-sonnet-20250219', 8192, 'enabled', 'high', '[]'::jsonb, 
    $sys$Você é um perito calculista judicial. Auxilie na estruturação de cálculos, apontando índices de correção monetária, juros aplicáveis e metodologia de liquidação.$sys$, 
    true, 1
  ),
  (
    'pesquisa-stj-stf', 'Pesquisa de Jurisprudência Superior', 
    'Pesquisador focado em teses do STJ e STF.', 
    'Pesquisador focado em teses do STJ e STF.', 
    'pesquisa', 'claude-3-7-sonnet-20250219', 4096, 'enabled', 'medium', '[]'::jsonb, 
    $sys$Você é um analista de jurisprudência dos Tribunais Superiores. Foque em súmulas, teses de repercussão geral e repetitivos aplicáveis ao caso concreto.$sys$, 
    true, 1
  )
  ON CONFLICT (name) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    descricao = EXCLUDED.descricao,
    description = EXCLUDED.description,
    categoria = EXCLUDED.categoria,
    model = EXCLUDED.model,
    max_tokens = EXCLUDED.max_tokens,
    thinking_mode = EXCLUDED.thinking_mode,
    effort = EXCLUDED.effort,
    tools = EXCLUDED.tools,
    system_prompt = EXCLUDED.system_prompt,
    is_active = EXCLUDED.is_active,
    versao = EXCLUDED.versao;
END $$;
