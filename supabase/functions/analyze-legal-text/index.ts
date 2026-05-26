import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { content } = await req.json()

    // Mock AI analysis for prototype since we don't have OPENAI_API_KEY
    const suggestions = [
      'Considere adicionar fundamentação baseada no Princípio da Proporcionalidade, especialmente no que tange às medidas cautelares diversas da prisão.',
      'A jurisprudência recente do STJ tem pacificado entendimento favorável a este pleito quando ausente violência ou grave ameaça.',
      'Sugerimos revisar a estruturação dos fatos para destacar mais a ausência de indícios de autoria, alinhando com o art. 312 do CPP.',
    ]

    // Simulate delay
    await new Promise((r) => setTimeout(r, 1500))

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
