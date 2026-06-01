import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let activeInvocationId: string | null = null;
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  let authHeader = req.headers.get('Authorization');

  try {
    const payload = await req.json();
    const { 
      invocation_id, minute_id, content_so_far, editor_text, content, agent_ids, agent_id, 
      process_context, process_id, system_prompt: req_system_prompt, 
      action, suggestions: req_suggestions, 
      minute_type, attachments, attachment_paths, metadata, model: req_model
    } = payload;

    activeInvocationId = invocation_id || crypto.randomUUID();
    const finalContent = editor_text || content;
    const finalAttachments = attachments || attachment_paths;

    const targetAgentIds = (agent_ids && Array.isArray(agent_ids) && agent_ids.length > 0) 
      ? agent_ids 
      : (agent_id ? [agent_id] : []);

    if (!finalContent || targetAgentIds.length === 0) {
      throw new Error("Missing content or agent_ids");
    }

    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: any) => {
          try {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch (e) {
            // Stream closed or broken connection
          }
        };

        const pingInterval = setInterval(() => {
          sendEvent({ type: 'ping', timestamp: Date.now() });
        }, 5000);

        try {
          sendEvent({ status: 'Preparando contexto...' });

          let additionalContext = "";
          if (metadata) {
            additionalContext += `\n\n--- Metadados da Minuta ---\n`;
            if (metadata.client) additionalContext += `Cliente: ${metadata.client}\n`;
            if (metadata.comarca) additionalContext += `Comarca: ${metadata.comarca}\n`;
            if (metadata.objeto) additionalContext += `Objeto: ${metadata.objeto}\n`;
            if (metadata.pedido) additionalContext += `Pedido: ${metadata.pedido}\n`;
          }

          if (finalAttachments && Array.isArray(finalAttachments) && finalAttachments.length > 0) {
            sendEvent({ status: 'Lendo arquivos anexos e processando documentos...' });
            const extPromises = finalAttachments.map(async (path: string) => {
              const { data: extData, error: extError } = await supabase.functions.invoke('extract-document', {
                body: { file_path: path }
              });
              if (!extError && extData?.text) {
                return `\n\n--- Documento Anexo (${path}) ---\n${extData.text}\n`;
              }
              return '';
            });
            const results = await Promise.all(extPromises);
            additionalContext += results.join('');
          }

          sendEvent({ status: 'Obtendo agentes de IA...' });
          const { data: agents, error: agentsError } = await supabase
            .from('agentes')
            .select('*')
            .in('id', targetAgentIds);

          if (agentsError || !agents || agents.length === 0) {
            throw new Error("Agentes não encontrados ou indisponíveis.");
          }

          const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
          const documentType = minute_type ? `Tipo de Minuta: ${minute_type}\n\n` : '';
          const processInfo = process_context ? `Contexto do Processo:\n${process_context}\n\n` : '';
          const fullContext = `${documentType}${processInfo}Conteúdo Principal (Editor):\n${finalContent}${additionalContext}`;

          // Register the invocation immediately
          const firstAgent = agents[0];
          const initialInvocationPayload: any = {
            id: activeInvocationId, user_id: user.id, agent_id: firstAgent.id, input_tokens: 0, output_tokens: 0,
          };
          if (process_id) initialInvocationPayload.process_id = process_id;
          
          console.log(`Attempting initial DB Save for Invocation ID: ${activeInvocationId}`);
          const { error: initDbErr } = await supabase.from('invocacoes').upsert(initialInvocationPayload, { onConflict: 'id', ignoreDuplicates: true });
          if (initDbErr) {
            console.error(`Initial DB Save Failed for Invocation ID: ${activeInvocationId} - ${initDbErr.message}`, initDbErr.details);
          } else {
            console.log(`Initial DB Save Successful for Invocation ID: ${activeInvocationId}`);
          }

          // --- ACTION: APPLY ---
          if (action === 'apply') {
              const agent = firstAgent;
              
              // Standardize the model ID strictly without date suffixes
              let finalModel = req_model || agent.model || 'claude-sonnet-4-6';
              if (finalModel.includes('sonnet')) finalModel = 'claude-sonnet-4-6';
              else if (finalModel.includes('opus')) finalModel = 'claude-opus-4-7';
              else if (finalModel.includes('haiku')) finalModel = 'claude-haiku-4-5';

              const finalSystemPrompt = req_system_prompt || agent.system_prompt;
              const maxTokens = agent.max_tokens && agent.max_tokens > 8192 ? agent.max_tokens : 16384;

              let activeMinuteId = minute_id;
              
              // Ensure minute exists before processing
              if (!activeMinuteId) {
                  const title = minute_type ? `${minute_type} - ${new Date().toLocaleDateString()}` : `Nova Minuta - ${new Date().toLocaleDateString()}`;
                  const { data: newMin } = await supabase.from('minutes').insert({
                      title,
                      content: content_so_far || finalContent || '',
                      status: 'Draft',
                      process_id: process_id || null,
                      client_name: metadata?.client || null,
                      comarca: metadata?.comarca || null,
                      objeto: metadata?.objeto || null,
                      pedido: metadata?.pedido || null,
                      updated_at: new Date().toISOString(),
                      invocation_id: activeInvocationId
                  }).select('id').single();
                  
                  if (newMin) {
                      activeMinuteId = newMin.id;
                      sendEvent({ type: 'minute_created', minute_id: activeMinuteId });
                  }
              } else {
                  await supabase.from('minutes').update({ invocation_id: activeInvocationId }).eq('id', activeMinuteId);
              }

              const userMessage = `Aqui está o contexto e o documento atual (em formato HTML):\n\n${fullContext}\n\nPor favor, reescreva o Conteúdo Principal (Editor) aplicando as seguintes sugestões de melhoria. Mantenha a formatação HTML original, ajustando apenas o texto onde necessário:\n\n${(req_suggestions || []).map((s: string) => `- ${s}`).join('\n')}\n\nCRÍTICO: Retorne o documento COMPLETO, até a sua conclusão natural. NÃO TRUNQUE o texto (ex: não pare no meio de um parágrafo ou seção). Se o texto for longo, certifique-se de terminar todo o conteúdo sem interrupções. Inclua no final do documento a tag <!-- END_OF_DOCUMENT --> para confirmar que você terminou de gerar todo o texto.\n\nRetorne APENAS o código HTML do Conteúdo Principal revisado, sem nenhuma explicação ou texto adicional antes ou depois do HTML.`;

              sendEvent({ status: 'Gerando texto (Streaming ativado)...' });

              if (anthropicKey) {
                  const messages: any[] = [ { role: "user", content: userMessage } ];
                  
                  if (content_so_far) {
                      messages.push({ role: "assistant", content: content_so_far });
                  }

                  const payloadParams: any = {
                      model: finalModel,
                      max_tokens: maxTokens,
                      stream: true,
                      system: [ { type: "text", text: finalSystemPrompt, cache_control: { type: "ephemeral" } } ],
                      messages
                  };
                  // Ensure thinking mode is strictly disabled for rewriting and applying
                  delete payloadParams.thinking;

                  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'x-api-key': anthropicKey,
                          'anthropic-version': '2023-06-01',
                          'anthropic-beta': 'prompt-caching-2024-07-31'
                      },
                      body: JSON.stringify(payloadParams)
                  });

                  if (!anthropicRes.ok) {
                      const errText = await anthropicRes.text();
                      throw new Error(`Anthropic API Error: ${errText}`);
                  }

                  let inputTokens = 0;
                  let outputTokens = 0;
                  let cachedTokens = 0;
                  let fullText = content_so_far || '';
                  let charCountSinceLastSave = 0;
                  let stopReason = null;
                  let receivedAnyContent = false;

                  const reader = anthropicRes.body?.getReader();
                  const decoder = new TextDecoder();
                  let buffer = '';

                  while (reader) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      buffer += decoder.decode(value, { stream: true });
                      
                      const lines = buffer.split('\n\n');
                      buffer = lines.pop() || '';
                      
                      for (const line of lines) {
                          if (line.startsWith('data: ')) {
                              const dataStr = line.slice(6).trim();
                              if (dataStr === '[DONE]') continue;
                              try {
                                  const data = JSON.parse(dataStr);
                                  if (data.type === 'message_start') {
                                      inputTokens = data.message?.usage?.input_tokens || 0;
                                      cachedTokens = data.message?.usage?.cache_creation_input_tokens || data.message?.usage?.cache_read_input_tokens || 0;
                                  } else if (data.type === 'content_block_delta') {
                                      if (data.delta?.type === 'text_delta') {
                                          const text = data.delta?.text || '';
                                          if (text) {
                                              receivedAnyContent = true;
                                          }
                                          fullText += text;
                                          charCountSinceLastSave += text.length;
                                          sendEvent({ text });
                                    
                                          if (activeMinuteId && charCountSinceLastSave > 500) {
                                              charCountSinceLastSave = 0;
                                              supabase.from('minutes').update({ 
                                                  content: fullText, 
                                                  updated_at: new Date().toISOString() 
                                              }).eq('id', activeMinuteId).then();
                                          }
                                      } else if (data.delta?.type === 'thinking_delta' || data.delta?.type === 'signature_delta') {
                                          // explicitly ignore thinking and reasoning deltas
                                      }
                                  } else if (data.type === 'message_delta') {                                      outputTokens = data.usage?.output_tokens || 0;
                                      stopReason = data.delta?.stop_reason || null;
                                  }
                              } catch(e) {}
                          }
                      }
                  }
                  
                  if (activeMinuteId && charCountSinceLastSave > 0) {
                      await supabase.from('minutes').update({ 
                          content: fullText, 
                          updated_at: new Date().toISOString() 
                      }).eq('id', activeMinuteId);
                  }
                  
                  // Final safety save directly in Edge Function to ensure database persistence
                  if (activeMinuteId && (charCountSinceLastSave > 0 || receivedAnyContent)) {
                      await supabase.from('minutes').update({ 
                          content: fullText, 
                          updated_at: new Date().toISOString() 
                      }).eq('id', activeMinuteId);
                  }

                  if (!receivedAnyContent && (!content_so_far || content_so_far.length === 0)) {
                      throw new Error(JSON.stringify({ error: "Erro: A resposta da IA estava vazia ou malformada.", code: "EMPTY_RESPONSE", invocation_id: activeInvocationId }));
                  }

                  if (stopReason === 'max_tokens' || (!fullText.includes('<!-- END_OF_DOCUMENT -->') && stopReason !== 'end_turn')) {
                      sendEvent({ type: 'continue_required' });
                  }

                  let costInputPerM = 3.0;
                  let costOutputPerM = 15.0;
                  if (finalModel === 'claude-opus-4-7') { costInputPerM = 5.0; costOutputPerM = 25.0; }
                  else if (finalModel === 'claude-haiku-4-5') { costInputPerM = 1.0; costOutputPerM = 5.0; }
                  const costInput = (inputTokens / 1000000) * costInputPerM;
                  const costOutput = (outputTokens / 1000000) * costOutputPerM;
                  const estimatedCost = costInput + costOutput;

                  console.log(`Attempting DB Save for Invocation ID: ${activeInvocationId} (Token/Cost Update)`);
                  const { error: invErr } = await supabase.from('invocacoes').update({ input_tokens: inputTokens, output_tokens: outputTokens }).eq('id', activeInvocationId);
                  if (invErr) console.error(`DB Save Failed for invocacoes (ID: ${activeInvocationId}):`, invErr.message);
                  else console.log(`DB Save Successful for invocacoes (ID: ${activeInvocationId})`);
                  
                  const { error: costErr } = await supabase.from('custos').upsert({ 
                    invocation_id: activeInvocationId, 
                    estimated_cost: estimatedCost, 
                    currency: 'USD', 
                    cached_tokens: cachedTokens 
                  }, { onConflict: 'invocation_id', ignoreDuplicates: false });
                  if (costErr) console.error(`DB Save Failed for custos (ID: ${activeInvocationId}):`, costErr.message);
                  else console.log(`DB Save Successful for custos (ID: ${activeInvocationId})`);

              } else {
                  // Fallback Mock
                  const mockText = finalContent + `<br/><br/><div style="color: blue; padding: 10px; border: 1px dashed blue;"><em>[Simulação: Modificações aplicadas]</em></div><!-- END_OF_DOCUMENT -->`;
                  if (activeMinuteId) {
                      await supabase.from('minutes').update({ content: mockText }).eq('id', activeMinuteId);
                  }
                  const chunks = mockText.match(/.{1,50}/g) || [];
                  for (const chunk of chunks) {
                      sendEvent({ text: chunk });
                      await new Promise(r => setTimeout(r, 20));
                  }
              }
          } 
          // --- ACTION: ANALYZE / BRAINSTORM / EXTRACT ---
          else {
              sendEvent({ status: 'Analisando documento e gerando insights...' });
              let finalSuggestions: string[] = [];
              const agentsToProcess = (action === 'brainstorm' || action === 'extract_report_fields') ? [agents[0]] : agents;

              let totalInputTokens = 0;
              let totalOutputTokens = 0;
              let totalCachedTokens = 0;
              let totalEstimatedCost = 0;
              let successCount = 0;

              for (const agent of agentsToProcess) {
                  try {
                      let agentSuggestions: string[] = [];
                      
                      let finalModel = req_model || agent.model || 'claude-sonnet-4-6';
                      if (finalModel.includes('sonnet')) finalModel = 'claude-sonnet-4-6';
                      else if (finalModel.includes('opus')) finalModel = 'claude-opus-4-7';
                      else if (finalModel.includes('haiku')) finalModel = 'claude-haiku-4-5';

                      if (action === 'extract_report_fields') {
                        finalModel = 'claude-haiku-4-5';
                      }
                      
                      const finalSystemPrompt = req_system_prompt || agent.system_prompt;
                      const maxTokens = agent.max_tokens && agent.max_tokens > 8192 ? agent.max_tokens : 16384;

                      let inputTokens = 0;
                      let outputTokens = 0;
                      let cachedTokens = 0;

                      if (anthropicKey) {
                          let userMessage = `Por favor, forneça sugestões objetivas de melhoria em formato de lista (bullet points) para o seguinte contexto jurídico:\n\n${fullContext}`;
                          
                          if (action === 'brainstorm') {
                            userMessage = `Analise o contexto a seguir e retorne um JSON estrito (sem crases ou marcação markdown) com duas chaves: "sugerir_secoes" (array de strings) e "perguntas_chave" (array de strings). NÃO INCLUA nenhum texto conversacional ou de preenchimento antes ou depois do JSON.\nContexto:\n${fullContext}\nRetorne APENAS o JSON válido.`;
                          } else if (action === 'extract_report_fields') {
                            userMessage = `Analise o contexto a seguir e extraia as informações para um Relatório de Caso. Retorne um JSON estrito (sem crases ou marcação markdown) com as chaves: "situacao", "problemas", "solucoes", "proximos_passos". O conteúdo de cada chave deve ser um texto resumido e profissional focado em relatório jurídico. NÃO INCLUA nenhum texto conversacional ou de preenchimento antes ou depois do JSON.\nContexto:\n${fullContext}\nRetorne APENAS o JSON válido.`;
                          }

                          const payloadParams: any = {
                            model: finalModel,
                            max_tokens: maxTokens,
                            system: [ { type: "text", text: finalSystemPrompt, cache_control: { type: "ephemeral" } } ],
                            messages: [ { role: "user", content: userMessage } ]
                          };

                          const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'x-api-key': anthropicKey,
                              'anthropic-version': '2023-06-01',
                              'anthropic-beta': 'prompt-caching-2024-07-31'
                            },
                            body: JSON.stringify(payloadParams)
                          });

                          if (!anthropicRes.ok) {
                              const errText = await anthropicRes.text();
                              throw new Error(`Anthropic API Error: ${errText}`);
                          }

                          const aiData = await anthropicRes.json();
                          
                          // Server-side logging of raw AI content blocks for diagnostics
                          console.log("Raw AI Content Array:", JSON.stringify(aiData.content));
                    
                          if (!aiData.content || !Array.isArray(aiData.content) || aiData.content.length === 0) {
                            throw new Error(JSON.stringify({ error: "Erro: A resposta da IA estava vazia ou malformada.", code: "EMPTY_RESPONSE", agent_name: agent.name }));
                          }
                    
                          const textBlocks = aiData.content.filter((c: any) => c.type === 'text' && typeof c.text === 'string');
                          if (textBlocks.length === 0) {
                            console.log("Raw AI Content Array (Empty Text Blocks):", JSON.stringify(aiData.content));
                            throw new Error(JSON.stringify({ error: "Erro: A resposta da IA não continha blocos de texto (apenas thinking).", code: "EMPTY_RESPONSE", agent_name: agent.name }));
                          }
                    
                          inputTokens = aiData.usage?.input_tokens || 0;
                          outputTokens = aiData.usage?.output_tokens || 0;
                          cachedTokens = aiData.usage?.cache_creation_input_tokens || aiData.usage?.cache_read_input_tokens || 0;
                    
                          const aiText = textBlocks.map((c: any) => c.text).join('\n').trim();
                          if (!aiText || aiText.length === 0) {
                            console.log("Raw AI Content Array (Empty after join):", JSON.stringify(aiData.content));
                            throw new Error(JSON.stringify({ error: "Erro: A resposta da IA estava vazia após extração.", code: "EMPTY_RESPONSE", agent_name: agent.name }));
                          }                      
                          if (action === 'brainstorm' || action === 'extract_report_fields') {
                            let jsonStr = aiText.trim();
                            if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
                            else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');
                            try {
                              finalSuggestions = JSON.parse(jsonStr);
                            } catch(e) {
                              console.error("JSON parsing failed, falling back to raw text:", jsonStr);
                              // Fallback: If structured parsing fails, return the raw text to prevent blocking the UI
                              if (action === 'extract_report_fields') {
                                finalSuggestions = {
                                  situacao: "Conteúdo não estruturado retornado pela IA:",
                                  problemas: jsonStr.substring(0, 500) + (jsonStr.length > 500 ? "..." : ""),
                                  solucoes: "Consulte o texto bruto.",
                                  proximos_passos: "Tente novamente."
                                } as any;
                              } else {
                                finalSuggestions = {
                                  sugerir_secoes: ["Conteúdo não estruturado retornado pela IA:"],
                                  perguntas_chave: [jsonStr.substring(0, 500) + (jsonStr.length > 500 ? "..." : "")]
                                } as any;
                              }
                            }
                          } else {
                            agentSuggestions = aiText
                              .split('\n')
                              .map((l: string) => l.trim())
                              .filter((l: string) => l.length > 0 && (l.startsWith('-') || l.startsWith('*') || l.match(/^\d+\./)))
                              .map((l: string) => l.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim());
                            
                            if (agentSuggestions.length === 0 && aiText) agentSuggestions = [aiText];
                            if (agentsToProcess.length > 1) agentSuggestions = agentSuggestions.map((s: string) => `[${agent.name}] ${s}`);
                            finalSuggestions = finalSuggestions.concat(agentSuggestions);
                          }
                      } else {
                          await new Promise(r => setTimeout(r, 1500));
                          if (action === 'brainstorm') {
                            finalSuggestions = { sugerir_secoes: ["1. Dos Fatos"], perguntas_chave: ["Quais os danos?"] } as any;
                          } else if (action === 'extract_report_fields') {
                            finalSuggestions = { situacao: "O cliente...", problemas: "Riscos...", solucoes: "Ações...", proximos_passos: "Protocolar..." } as any;
                          } else {
                            finalSuggestions.push(`[${agent.name}] Adicione fundamentação.`);
                          }
                      }

                      let costInputPerM = 3.0;
                      let costOutputPerM = 15.0;
                      if (finalModel === 'claude-opus-4-7') { costInputPerM = 5.0; costOutputPerM = 25.0; }
                      else if (finalModel === 'claude-haiku-4-5') { costInputPerM = 1.0; costOutputPerM = 5.0; }
                      const costInput = (inputTokens / 1000000) * costInputPerM;
                      const costOutput = (outputTokens / 1000000) * costOutputPerM;
                      const estimatedCost = costInput + costOutput;
                      
                      totalInputTokens += inputTokens;
                      totalOutputTokens += outputTokens;
                      totalCachedTokens += cachedTokens;
                      totalEstimatedCost += estimatedCost;
                      successCount++;

                  } catch (agentErr: any) {
                      console.error(`Error processing agent ${agent.name}:`, agentErr.message);
                      const errorDetail = agentErr.message || "Erro desconhecido";
                      if (action === 'brainstorm' || action === 'extract_report_fields') {
                          // Se for apenas um agente e falhar, o throw propaga pra cima
                          throw agentErr;
                      } else {
                          finalSuggestions.push(`[${agent.name}] Falha na análise: ${errorDetail}`);
                      }
                  }
              }

              if (action !== 'brainstorm' && action !== 'extract_report_fields' && successCount === 0 && agentsToProcess.length > 0) {
                 throw new Error(JSON.stringify({ error: "Todos os agentes falharam na análise.", code: "ALL_AGENTS_FAILED", invocation_id: activeInvocationId }));
              }

              console.log(`Attempting DB Save for Invocation ID: ${activeInvocationId} (Token/Cost Update)`);
              const { error: invErr } = await supabase.from('invocacoes').update({ input_tokens: totalInputTokens, output_tokens: totalOutputTokens }).eq('id', activeInvocationId);
              if (invErr) console.error(`DB Save Failed for invocacoes (ID: ${activeInvocationId}):`, invErr.message);
              else console.log(`DB Save Successful for invocacoes (ID: ${activeInvocationId})`);
              
              const { error: costErr } = await supabase.from('custos').upsert({ invocation_id: activeInvocationId, estimated_cost: totalEstimatedCost, currency: 'USD', cached_tokens: totalCachedTokens }, { onConflict: 'invocation_id', ignoreDuplicates: false });
              if (costErr) console.error(`DB Save Failed for custos (ID: ${activeInvocationId}):`, costErr.message);
              else console.log(`DB Save Successful for custos (ID: ${activeInvocationId})`);

              if (action === 'brainstorm' || action === 'extract_report_fields') {
                  sendEvent({ type: 'suggestions', data: finalSuggestions });
              } else {
                  sendEvent({ type: 'suggestions', data: { suggestions: finalSuggestions } });
              }
          }

          sendEvent({ done: true });
        } catch (err: any) {
          console.error(`Stream processing error (Invocation ID: ${activeInvocationId}):`, err.message);
          if (activeInvocationId && authHeader) {
              const safeClient = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });
              const { error: diagErr } = await safeClient.from('invocacoes').update({ diagnostic_log: err.message }).eq('id', activeInvocationId);
              if (diagErr) {
                 console.error(`Failed to save diagnostic_log for Invocation ID ${activeInvocationId}:`, diagErr.message);
              }
          }
          
          let errorMessage = err.message;
          try {
            const parsed = JSON.parse(errorMessage);
            if (!parsed.invocation_id) parsed.invocation_id = activeInvocationId;
            errorMessage = JSON.stringify(parsed);
          } catch (e) {
            errorMessage = JSON.stringify({ message: errorMessage, invocation_id: activeInvocationId });
          }

          sendEvent({ error: errorMessage });
        } finally {
          clearInterval(pingInterval);
          try { controller.close(); } catch(e) {}
        }
      }
    });

    return new Response(stream, { 
      headers: { 
        'Content-Type': 'text/event-stream', 
        'Cache-Control': 'no-cache', 
        'Connection': 'keep-alive', 
        ...corsHeaders 
      } 
    });

  } catch (error: any) {
    if (activeInvocationId && authHeader) {
        const safeClient = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });
        const { error: diagErr } = await safeClient.from('invocacoes').update({ diagnostic_log: error.message }).eq('id', activeInvocationId);
        if (diagErr) {
           console.error(`Failed to save diagnostic_log for Invocation ID ${activeInvocationId}:`, diagErr.message);
        }
    }
    
    let status = 400;
    let errorBody: any = { error: error.message };
    
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.code === 'EMPTY_RESPONSE' || parsed.code === 'ALL_AGENTS_FAILED') {
        status = 500;
        errorBody = parsed;
      }
    } catch(e) {}

    errorBody.invocation_id = activeInvocationId;
    errorBody.diagnostic_log = error.message;

    return new Response(JSON.stringify(errorBody), { 
      status, 
      headers: { 'Content-Type': 'application/json', ...corsHeaders } 
    });
  }
});
