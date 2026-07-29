-- Ramificação de rito na Petição Inicial (Peticionador Cível):
-- rito comum (CPC) × Juizado Especial Cível (Lei 9.099/95) × Juizado
-- Especial Federal (Lei 10.259/2001). O usuário indica o rito no campo
-- de instruções; sem indicação, assume-se o rito comum com registro da
-- premissa. Decisão de arquitetura: UM tipo/UM agente com ramificação
-- (precedente: agente Contrarrazões, migration 20260724130000).
-- Spec: Trabalho/Dashboard-Juridico/lexaxis_peticao_inicial_rito_juizados_spec_2026-07-29.md

UPDATE agentes SET system_prompt = system_prompt || '

## Ramificação por rito (identifique pelo campo de instruções do usuário e pelos documentos)
- **Rito comum (CPC)**: requisitos do art. 319 na íntegra; pedidos certos e determinados (arts. 322-324); tutela provisória quando cabível (arts. 300/311); valor da causa conforme arts. 291-292.
- **Juizado Especial Cível (Lei 9.099/95)**: verifique CABIMENTO — valor até 40 salários mínimos (art. 3º, I) e matérias não vedadas (art. 3º, § 2º: família, sucessões, falência, fiscal, acidentes de trabalho, estado e capacidade); PARTES — autor pessoa física capaz, ME/EPP (art. 8º; incapaz, preso e massa falida não podem ser autores); pedido em FORMA SIMPLES (art. 14, §§ 1º-3º — admitida inclusive a apresentação oral reduzida a termo/atermação), linguagem acessível (princípios do art. 2º: oralidade, simplicidade, informalidade, economia processual e celeridade); ESTILO DA PEÇA: mais curta, direta e objetiva — evite excesso de termos técnicos e transcrições longas de doutrina/jurisprudência; a fundamentação essencial, verificada, basta; estrutura orientada à CONCILIAÇÃO imediata (arts. 21-22) — suprima a opção formal de audiência de conciliação do CPC (a sessão é etapa automática do rito, arts. 16 e 21-22); até 20 SM dispensa advogado (art. 9º) — acima, obrigatório; SEM custas nem honorários em 1º grau, salvo litigância de má-fé (arts. 54-55); INCOMPATÍVEL com perícia complexa — se os fatos a exigirem, sugira o rito comum; tutela de urgência não vedada, mas fundamentar com parcimônia.
- **Juizado Especial Federal (Lei 10.259/2001)**: teto de 60 salários mínimos (art. 3º); vedações do art. 3º, § 1º; réu = União, autarquias, fundações e empresas públicas federais (art. 6º, II); sem prazo diferenciado para a Fazenda (art. 9º) e sem reexame necessário (art. 13).
- Se o rito indicado for incompatível com o valor, a matéria ou as partes constantes dos documentos, ALERTE em sugestão própria [CABIMENTO] antes de prosseguir.
- Sem indicação de rito nas instruções: assuma o rito comum e registre a premissa em sugestão própria.
', versao = versao + 1
WHERE is_active AND name = 'Peticionador Cível'
  AND system_prompt NOT LIKE '%Ramificação por rito%';

-- Validação
SELECT name, versao, length(system_prompt) AS chars,
  (system_prompt LIKE '%Ramificação por rito%') AS rito_ok
FROM agentes WHERE name = 'Peticionador Cível';
