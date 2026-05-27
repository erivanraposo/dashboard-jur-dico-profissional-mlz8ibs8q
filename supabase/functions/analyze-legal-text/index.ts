import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { content, agent_id } = await req.json()

    if (!content || !agent_id) {
      throw new Error('Missing content or agent_id')
    }

    const authHeader = req.headers.get('Authorization')!
    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const { data: agent, error: agentError } = await supabase
      .from('agentes')
      .select('*')
      .eq('id', agent_id)
      .single()

    if (agentError || !agent) {
      throw new Error('Agent not found')
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    let suggestions: string[] = []
    let inputTokens = 0
    let outputTokens = 0
    let cachedTokens = 0

    if (anthropicKey) {
      const isHaiku = agent.model.includes('haiku')
      const maxTokens = agent.max_tokens || 1024

      const payload: any = {
        model: agent.model,
        max_tokens: maxTokens,
        system: [
          {
            type: 'text',
            text: agent.system_prompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Por favor, forneça sugestões objetivas de melhoria em formato de lista (bullet points) para a seguinte peça jurídica:\n\n${content}`,
          },
        ],
      }

      if (!isHaiku) {
        if (agent.thinking_mode === 'enabled') {
          payload.thinking = {
            type: 'enabled',
            budget_tokens: Math.max(1024, Math.floor(maxTokens * 0.8)),
          }
        }
        if (agent.effort) {
          payload.output_config = { effort: agent.effort }
        }
      }

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
        },
        body: JSON.stringify(payload),
      })

      if (!anthropicRes.ok) {
        const err = await anthropicRes.text()
        console.error('Anthropic error', err)
        throw new Error('AI API Error')
      }

      const aiData = await anthropicRes.json()
      inputTokens = aiData.usage?.input_tokens || 0
      outputTokens = aiData.usage?.output_tokens || 0
      cachedTokens =
        aiData.usage?.cache_creation_input_tokens || aiData.usage?.cache_read_input_tokens || 0

      const aiText = aiData.content?.[0]?.text || ''
      suggestions = aiText
        .split('\n')
        .map((l: string) => l.trim())
        .filter(
          (l: string) =>
            l.length > 0 && (l.startsWith('-') || l.startsWith('*') || l.match(/^\d+\./)),
        )
        .map((l: string) =>
          l
            .replace(/^[-*]\s*/, '')
            .replace(/^\d+\.\s*/, '')
            .trim(),
        )

      if (suggestions.length === 0 && aiText) {
        suggestions = [aiText]
      }
    } else {
      // Simulate Anthropic API if key is not provided (Fallback mode for prototype)
      await new Promise((r) => setTimeout(r, 1500))
      suggestions = [
        `Considere adicionar fundamentação baseada no Princípio da Proporcionalidade (Sugestão gerada pelo agente: ${agent.titulo || agent.name}).`,
        'A jurisprudência recente do STJ tem pacificado entendimento favorável a este pleito quando ausente violência ou grave ameaça.',
        'Sugerimos revisar a estruturação dos fatos para destacar mais a ausência de indícios de autoria.',
      ]
      inputTokens = Math.floor(content.length / 4)
      outputTokens = 150
      cachedTokens = 0
    }

    // Cost Calculation for logging (Claude 3.5 Sonnet approximation)
    const costInput = (inputTokens / 1000000) * 3.0
    const costOutput = (outputTokens / 1000000) * 15.0
    const estimatedCost = costInput + costOutput

    const { data: invocation, error: invError } = await supabase
      .from('invocacoes')
      .insert({
        user_id: user.id,
        agent_id: agent.id,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      })
      .select('id')
      .single()

    if (invError) {
      console.error('Error logging invocation:', invError)
    } else if (invocation) {
      await supabase.from('custos').insert({
        invocation_id: invocation.id,
        estimated_cost: estimatedCost,
        currency: 'USD',
        cached_tokens: cachedTokens,
      })
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
