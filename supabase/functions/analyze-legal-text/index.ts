import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      content,
      agent_id,
      system_prompt: req_system_prompt,
      model: req_model,
      action,
      suggestions: req_suggestions,
    } = await req.json()

    if (!content || !agent_id) {
      throw new Error('Missing content or agent_id')
    }

    const authHeader = req.headers.get('Authorization')
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
    let revised_content = ''
    let inputTokens = 0
    let outputTokens = 0
    let cachedTokens = 0

    let finalModel = req_model || agent.model || 'claude-sonnet-4-6'
    // Ensure no older claude-3-* or date-suffixed IDs are used
    if (finalModel.includes('sonnet') && finalModel !== 'claude-sonnet-4-6')
      finalModel = 'claude-sonnet-4-6'
    if (finalModel.includes('haiku') && finalModel !== 'claude-haiku-4-5')
      finalModel = 'claude-haiku-4-5'
    if (finalModel.includes('opus') && finalModel !== 'claude-opus-4-7')
      finalModel = 'claude-opus-4-7'

    const finalSystemPrompt = req_system_prompt || agent.system_prompt
    const isHaiku = finalModel.includes('haiku')
    const maxTokens = agent.max_tokens || 4096

    if (anthropicKey) {
      let userMessage = `Por favor, forneça sugestões objetivas de melhoria em formato de lista (bullet points) para a seguinte peça jurídica:\n\n${content}`
      if (action === 'apply' && req_suggestions && req_suggestions.length > 0) {
        userMessage = `Aqui está uma peça jurídica (em formato HTML):\n\n${content}\n\nPor favor, reescreva a peça jurídica aplicando as seguintes sugestões de melhoria. Mantenha a formatação HTML original, ajustando apenas o texto onde necessário:\n\n${req_suggestions.map((s: string) => `- ${s}`).join('\n')}\n\nRetorne APENAS o código HTML da peça revisada, sem nenhuma explicação ou texto adicional antes ou depois do HTML.`
      }

      const payload: any = {
        model: finalModel,
        max_tokens: maxTokens,
        system: [
          {
            type: 'text',
            text: finalSystemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      }

      if (!isHaiku) {
        const isSonnet = finalModel.includes('sonnet')
        if (isSonnet && agent.thinking_mode === 'enabled') {
          payload.thinking = {
            type: 'enabled',
            budget_tokens: Math.max(1024, Math.floor(maxTokens * 0.8)),
          }
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
        console.error('Anthropic error response:', anthropicRes.status, err)
        let parsedErr = err
        try {
          const jsonErr = JSON.parse(err)
          if (jsonErr.error && jsonErr.error.message) {
            parsedErr = jsonErr.error.message
          }
        } catch (e) {
          // ignore parsing error
        }
        throw new Error(parsedErr)
      }

      const aiData = await anthropicRes.json()
      inputTokens = aiData.usage?.input_tokens || 0
      outputTokens = aiData.usage?.output_tokens || 0
      cachedTokens =
        aiData.usage?.cache_creation_input_tokens || aiData.usage?.cache_read_input_tokens || 0

      const aiText = aiData.content?.[0]?.text || ''

      if (action === 'apply') {
        revised_content = aiText.trim()
        if (revised_content.startsWith('```html')) {
          revised_content = revised_content.replace(/^```html\n?/, '').replace(/\n?```$/, '')
        } else if (revised_content.startsWith('```')) {
          revised_content = revised_content.replace(/^```\n?/, '').replace(/\n?```$/, '')
        }
      } else {
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
      }
    } else {
      // Simulate Anthropic API if key is not provided (Fallback mode)
      await new Promise((r) => setTimeout(r, 1500))
      if (action === 'apply') {
        revised_content =
          content +
          `<br/><br/><div style="color: blue; padding: 10px; border: 1px dashed blue;"><em>[Simulação: Modificações baseadas em IA aplicadas à peça]</em></div>`
        inputTokens = Math.floor(content.length / 4)
        outputTokens = 200
        cachedTokens = 0
      } else {
        suggestions = [
          `Considere adicionar fundamentação baseada no Princípio da Proporcionalidade (Sugestão gerada pelo agente: ${agent.titulo || agent.name}).`,
          `Modelo utilizado: ${finalModel}`,
          'A jurisprudência recente do STJ tem pacificado entendimento favorável a este pleito quando ausente violência ou grave ameaça.',
          'Sugerimos revisar a estruturação dos fatos para destacar mais a ausência de indícios de autoria.',
        ]
        inputTokens = Math.floor(content.length / 4)
        outputTokens = 150
        cachedTokens = 0
      }
    }

    // Cost Calculation for standardization aliases
    let costInput = 0
    let costOutput = 0
    if (finalModel === 'claude-opus-4-7') {
      costInput = (inputTokens / 1000000) * 15.0
      costOutput = (outputTokens / 1000000) * 75.0
    } else if (finalModel === 'claude-haiku-4-5') {
      costInput = (inputTokens / 1000000) * 0.25
      costOutput = (outputTokens / 1000000) * 1.25
    } else {
      // claude-sonnet-4-6 and defaults
      costInput = (inputTokens / 1000000) * 3.0
      costOutput = (outputTokens / 1000000) * 15.0
    }
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
      const { error: costError } = await supabase.from('custos').insert({
        invocation_id: invocation.id,
        estimated_cost: estimatedCost,
        currency: 'USD',
        cached_tokens: cachedTokens,
      })
      if (costError) {
        console.error('Error logging costs:', costError)
      }
    }

    if (action === 'apply') {
      return new Response(JSON.stringify({ revised_content }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
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
