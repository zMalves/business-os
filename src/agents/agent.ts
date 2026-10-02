import { AIProviderFactory } from '../ai/provider.js';
import { SECRETARY_SYSTEM_PROMPT } from '../ai/prompts.js';
import { agentTools, executeTool } from './tools/taskTools.js';
import { prisma } from '../database/client.js';
import { usageService } from '../services/usage.service.js';
import { googleService } from '../services/google.service.js';
import { klimaPartsService } from '../services/klimaparts.service.js';
import { skillService } from '../services/skill.service.js';

export interface AgentContext {
  conversationId: string;
  externalId?: string;
  channel?: string;
}

export interface AgentOutput {
  response: string;
  toolCallsExecuted: Array<{ name: string; args: any; result: any }>;
}

interface DeterministicKlimaCommand {
  storeId: number;
  days: number;
  storeName: string;
}

/**
 * Sanitiza e normaliza o texto do usuário para detecção determinística de comandos.
 * Remove prefixos de remetente (ex: "[Maychel Alves]: "), acentos e caracteres especiais.
 */
function sanitizeUserCommand(userMessage: string): string {
  let clean = (userMessage || '').trim();

  // Remove prefixos injetados pelo WhatsApp ou sistemas (ex: "[Maychel Alves]: ", "[Contato]: ")
  clean = clean.replace(/^\[.*?\]\s*:?\s*/gi, '');

  return clean
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[?!.,;:_]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Detecta comandos determinísticos de consulta de tarefas para responder em milissegundos com Custo Zero de tokens (0 LLM Tokens).
 */
function detectDeterministicTaskCommand(userMessage: string): 'today' | 'next_7_days' | null {
  const norm = sanitizeUserCommand(userMessage);

  // 1. Tarefas de hoje
  if (
    /^(tarefas? (de )?hoje|tarefas? pra hoje|tarefas? para hoje|tarefas? do dia|minhas tarefas? (de )?hoje|o que tenho (pra|para|de) tarefas? hoje|minhas tarefas? pra hoje)$/i.test(
      norm
    )
  ) {
    return 'today';
  }

  // 2. Tarefas gerais (próximos 7 dias)
  if (
    /^(tarefas?|minhas tarefas?|ver tarefas?|listar tarefas?|quais (as|minhas)? tarefas?|tarefas? da semana|proximas tarefas?|agenda de tarefas?|ver minhas tarefas?)$/i.test(
      norm
    )
  ) {
    return 'next_7_days';
  }

  return null;
}

/**
 * Detecta comandos determinísticos de consulta de faturamento/vendas da KlimaParts / ArmorCar (0 LLM Tokens).
 * Ex: klimaparts30, klimaparts 30, klimaparts7, klimaparts, klima30, armor30, armorcar30
 */
function detectDeterministicKlimaCommand(userMessage: string): DeterministicKlimaCommand | null {
  const norm = sanitizeUserCommand(userMessage);

  // 1. Recorte de Hoje / 1 dia
  if (
    /^(klimaparts?|klima|clima ?parts?)\s*(hoje|1|1 dia)?$/i.test(norm) && /hoje|1/i.test(norm) ||
    /^(vendas? (da? )?)?(klimaparts?|klima|clima ?parts?)\s+hoje$/i.test(norm)
  ) {
    return { storeId: 1, days: 1, storeName: 'KlimaParts' };
  }
  if (
    /^(armor|armorcar|armor car)\s*(hoje|1|1 dia)?$/i.test(norm) && /hoje|1/i.test(norm) ||
    /^(vendas? (da? )?)?(armor|armorcar|armor car)\s+hoje$/i.test(norm)
  ) {
    return { storeId: 2, days: 1, storeName: 'ArmorCar' };
  }

  // 2. Por quantidade de dias ou padrão 30
  const klimaMatch =
    /^(klimaparts?|klima|clima ?parts?)(\s*(\d+))?$/i.exec(norm) ||
    /^(resumo\s+)?(klimaparts?|klima|clima ?parts?)(\s+(\d+)\s*(dias?)?)?$/i.exec(norm);
  if (klimaMatch) {
    const daysStr = klimaMatch[3] || klimaMatch[4] || '30';
    const days = parseInt(daysStr.replace(/\D/g, ''), 10) || 30;
    return { storeId: 1, days, storeName: 'KlimaParts' };
  }

  // Match ArmorCar (Store 2): armor30, armor 30, armorcar30, armorcar 30, armor, etc.
  const armorMatch =
    /^(armor|armorcar|armor car)(\s*(\d+))?$/i.exec(norm) ||
    /^(resumo\s+)?(armor|armorcar|armor car)(\s+(\d+)\s*(dias?)?)?$/i.exec(norm);
  if (armorMatch) {
    const daysStr = armorMatch[3] || armorMatch[4] || '30';
    const days = parseInt(daysStr.replace(/\D/g, ''), 10) || 30;
    return { storeId: 2, days, storeName: 'ArmorCar' };
  }

  return null;
}

/**
 * Detecta comandos determinísticos de consulta CONSOLIDADA das 2 lojas (KlimaParts + ArmorCar) (0 LLM Tokens).
 * Ex: lojas, lojas hoje, lojas30, lojas7, vendas, vendas hoje, resumo lojas, duas lojas
 */
function detectDeterministicCombinedStoresCommand(userMessage: string): number | null {
  const norm = sanitizeUserCommand(userMessage);

  // 1. Recorte de Hoje
  if (
    /^(lojas?|vendas?|resumo (das? )?(duas?|2)?\s*lojas?)\s*(hoje|1|1 dia)$/i.test(norm) ||
    /^(vendas?|faturamento|resumo)\s+hoje$/i.test(norm) ||
    /^(lojas1|vendas1)$/i.test(norm)
  ) {
    return 1;
  }

  // 2. Recorte de 7 dias
  if (
    /^(lojas?|vendas?|resumo (das? )?(duas?|2)?\s*lojas?)\s*(7|7 dias?|semana)$/i.test(norm) ||
    /^(lojas7|vendas7)$/i.test(norm)
  ) {
    return 7;
  }

  // 3. Recorte geral / 30 dias ou dias customizados
  const match =
    /^(lojas?|vendas?|resumo (das? )?(duas?|2)?\s*lojas?|duas? lojas?|2 lojas?|consolidado lojas?)(\s*(\d+))?$/i.exec(norm) ||
    /^(lojas30|vendas30)$/i.exec(norm);
  if (match) {
    const daysStr = match[4] || '30';
    return parseInt(daysStr.replace(/\D/g, ''), 10) || 30;
  }

  return null;
}

/**
 * Detecta comandos determinísticos de consulta de perguntas/mensagens pendentes do Mercado Livre (0 LLM Tokens).
 * Ex: perguntas, perguntas pendentes, mensagens, mensagens pendentes, duvidas, perguntas ml
 */
function detectDeterministicQuestionsCommand(userMessage: string): boolean {
  const norm = sanitizeUserCommand(userMessage);

  return /^(perguntas?|mensagens?|duvidas?|perguntas? pendentes?|mensagens? pendentes?|duvidas? pendentes?|perguntas? (do )?(ml|mercado livre)|mensagens? (do )?(ml|mercado livre)|ver perguntas?|ver mensagens?|tem perguntas?\??|tem mensagens?\??)$/i.test(
    norm
  );
}

/**
 * Detecta comandos determinísticos de consulta de envios/pedidos pendentes (0 LLM Tokens).
 * Ex: envios, envios hoje, pedidos pendentes, envios pendentes, tenho envio hoje, o que tenho pra enviar
 */
function detectDeterministicShipmentsCommand(userMessage: string): number | null {
  const norm = sanitizeUserCommand(userMessage);

  // 1. Envios de hoje
  if (
    /^(envios?|pedidos?|expedi[cç][aã]o|despacho|o que tenho (pra|para) enviar|tenho envios?|tenho pedidos?|ver envios?|ver pedidos?|quais (os )?envios?|quais (os )?pedidos?|envios? (de )?hoje|pedidos? (de )?hoje|envios? pendentes?|pedidos? pendentes?|tem envios?\??|tem pedidos?\??|envio hoje\??|envio pendente\??|envios hoje\??|envios pendentes\??|tenho envio(s)? pendente(s)? (para|pra)? hoje\??|tem envio(s)? pendente(s)? (para|pra)? hoje\??)$/i.test(
      norm
    ) ||
    /^(oi,?\s*)?(voc[eê]\s+consegue\s+ver\s+se\s+)?(eu\s+)?tenho\s+envios?\s+pendentes?\s+(para|pra)?\s*hoje\??$/i.test(norm)
  ) {
    return 1;
  }

  // 2. Envios dos últimos 7 dias
  if (
    /^(envios?|pedidos?)\s*(7|7 dias?|semana)$/i.test(norm) ||
    /^(envios?|pedidos?)\s+da\s+semana$/i.test(norm)
  ) {
    return 7;
  }

  return null;
}

/**
 * Detecta comando de disparo de Briefing Matinal pré-definido (0 LLM Tokens).
 * Ex: briefing, resumo matinal
 */
function detectDeterministicBriefingCommand(userMessage: string): boolean {
  const norm = sanitizeUserCommand(userMessage);

  return /^(briefing|resumo matinal|meu briefing|mandar briefing|enviar briefing|briefing de hoje)$/i.test(norm);
}

/**
 * Detecta comando de ajuda / manual de códigos (0 LLM Tokens).
 */
function detectHelpCommand(userMessage: string): boolean {
  const norm = sanitizeUserCommand(userMessage);

  return /^(help|\/help|ajuda|\/ajuda|comandos|\/comandos|codigos|\/codigos|atalhos|\/atalhos|menu|\/menu|help me|quais comandos|ver comandos|lista de comandos|comandos sem ia)$/i.test(norm);
}

function getFormattedHelpMenu(): string {
  return `⚡ *COMANDOS LÓGICOS DIRETOS (0 TOKENS / SEM IA)*

Estes comandos consultam os dados diretamente sem passar pela IA:

☀️ *Rotina & Briefing:*
• \`briefing\` ➔ Resumo matinal de agenda e tarefas do dia

🏬 *2 Lojas Juntas (Consolidado):*
• \`lojas hoje\` (ou \`vendas hoje\`) ➔ Faturamento e pedidos de hoje (2 lojas)
• \`lojas30\` (ou \`lojas\`) ➔ Resumo consolidado de 30 dias
• \`lojas7\` ➔ Resumo consolidado dos últimos 7 dias

📦 *KlimaParts (Loja 1):*
• \`klimaparts hoje\` ➔ Faturamento e pedidos de hoje
• \`klimaparts30\` ➔ Resumo de 30 dias
• \`klimaparts7\` ➔ Resumo de 7 dias

🛡️ *ArmorCar (Loja 2):*
• \`armor hoje\` ➔ Faturamento e pedidos de hoje
• \`armor30\` ➔ Resumo de 30 dias
• \`armor7\` ➔ Resumo de 7 dias

💬 *Mercado Livre & Envios:*
• \`envios\` (ou \`envios hoje\`) ➔ Pedidos e envios pendentes de despacho
• \`perguntas\` (ou \`mensagens\`) ➔ Perguntas e dúvidas pendentes nas 2 lojas

📋 *Tarefas & Agenda:*
• \`tarefas\` ➔ Todas as tarefas dos próximos 7 dias
• \`tarefas de hoje\` ➔ Apenas as tarefas agendadas para hoje

💡 *Como usar:* Digite exatamente o código acima (ex: *briefing*, *lojas hoje*, *envios*, *klimaparts30*, *perguntas*, *tarefas*).`;
}

/**
 * Seleciona apenas as ferramentas relevantes para a mensagem do usuário (Tool Gating inteligente com contexto).
 * Considera o histórico recente para que respostas curtas ("Sim", "Pode enviar", "Faça isso") herdem as ferramentas ativas.
 */
async function selectToolsForMessage(userMessage: string, recentMessages: any[] = []) {
  const recentContext = recentMessages
    .slice(-3)
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join(' ');
  const combined = `${userMessage} ${recentContext}`.toLowerCase().trim();
  const lowerUser = (userMessage || '').toLowerCase().trim();

  const isShortConfirmation = /^(sim|s|pode|pode ser|claro|confirmo|confirmar|faça isso|faca isso|manda|mande|envie|envia|vai|bora|ok|show|beleza|perfeito|isso|exato|com certeza|positivo)$/i.test(lowerUser);

  const isWebIntent = /http|www\.|youtube|vídeo|video|link|notícia|noticia|pesquis|busqu|artigo|site|google\.com/i.test(combined);
  const isGoogleIntent = /reuni|meet|agenda|calendar|google|contato|tasks|tarefa|pendencia|pendência|compromisso|evento|horário|horario|calendário|email|e-mail|gmail|inbox|caixa de entrada|@|enviar|envie|dispar|mensagem/i.test(combined);
  const isKlimaIntent = /klima|armor|venda|pedido|compra|fornecedor|distribuidor|estoque|peça|peca|envio|expedi|mercado livre|magalu|anúncio|anuncio|sku|compressor|condensador|catalogo|catálogo/i.test(combined);
  const isCronIntent = /rotina|cron|agend|briefing|diári|diari|todo dia|recorrent|lembre-me todo/i.test(combined);
  const isSkillIntent = /skill|habilidade|aprend|ensinar|fluxo|dry.?run|testar skill|criar skill|listar skills|automatiz/i.test(combined);
  const isSmallTalk = !isShortConfirmation && /^(oi|olá|ola|bom dia|boa tarde|boa noite|obrigad[oa]|valeu|quem é você\??|td bem\??|tudo bem\??|e aí\??|e ai\??)$/i.test(lowerUser);

  // Se for apenas saudação simples sem histórico recente de ação, mantemos o essencial
  if (isSmallTalk && !recentContext.trim()) {
    return agentTools.filter((t) => ['create_task', 'list_tasks', 'save_memory', 'list_memories'].includes(t.name));
  }

  // Filtragem dinâmica por domínios considerando o contexto combinado
  const filteredBaseTools = agentTools.filter((t) => {
    const name = t.name;
    if (name.startsWith('skill_')) return isSkillIntent || isCronIntent;
    if (name.startsWith('google_')) return isGoogleIntent;
    if (name.startsWith('klimaparts_')) return isKlimaIntent;
    if (name.includes('scheduled_job') || name.includes('briefing')) return isCronIntent || isGoogleIntent || isKlimaIntent;
    if (name.includes('web') || name.includes('youtube')) return isWebIntent;
    return true;
  });

  // Injeção de Skills Dinâmicas ativas registradas no MariaDB
  try {
    const activeSkills = await skillService.listActiveSkills();
    const matchingSkills = activeSkills.filter((s) => {
      if (isSkillIntent) return true;
      const triggers = Array.isArray(s.triggerExamples) ? (s.triggerExamples as string[]) : [];
      const matchesTrigger = triggers.some((tr) => combined.includes(String(tr).toLowerCase()));
      const matchesName =
        combined.includes(s.name.replace(/_/g, ' ')) || combined.includes(s.displayName.toLowerCase());
      return matchesTrigger || matchesName;
    });

    const dynamicSkillTools = matchingSkills.map((s) => ({
      name: `dyn_skill_${s.name}`,
      description: `[Skill Dinâmica: ${s.displayName}] ${s.description}`,
      parameters: (s.parametersSchema as any) || { type: 'object', properties: {} },
    }));

    return [...filteredBaseTools, ...dynamicSkillTools];
  } catch {
    return filteredBaseTools;
  }
}

/**
 * Parser de contingência para saídas DSML do DeepSeek (caso gere tags no corpo da resposta)
 */
function parseDsmlToolCalls(content: string): Array<{ name: string; args: any }> {
  if (!content) return [];
  const calls: Array<{ name: string; args: any }> = [];

  const dsmlRegex = /<tool_call>\s*<function\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/function>\s*<\/tool_call>/gi;
  let match;
  while ((match = dsmlRegex.exec(content)) !== null) {
    const name = match[1];
    let argsStr = match[2].trim();
    let args = {};
    try {
      if (argsStr.startsWith('<arguments>')) {
        argsStr = argsStr.replace(/<\/?arguments>/gi, '').trim();
      }
      args = JSON.parse(argsStr);
    } catch {
      args = {};
    }
    calls.push({ name, args });
  }

  const legacyRegex = /<tool_call>\s*\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}\s*<\/tool_call>/gi;
  while ((match = legacyRegex.exec(content)) !== null) {
    const name = match[1];
    try {
      const args = JSON.parse(match[2]);
      if (!calls.some((c) => c.name === name)) {
        calls.push({ name, args });
      }
    } catch {}
  }

  return calls;
}

export class SecretaryAgent {
  /**
   * Processa a mensagem do usuário executando o loop de raciocínio e ferramentas (Tool Calling).
   */
  async processMessage(
    userMessage: string,
    context: AgentContext
  ): Promise<AgentOutput> {
    // ⚡ FAST-PATH DETERMINÍSTICO DE AJUDA / HELP (0 TOKENS DE IA)
    if (detectHelpCommand(userMessage)) {
      return {
        response: getFormattedHelpMenu(),
        toolCallsExecuted: [
          {
            name: 'system_help',
            args: { command: userMessage, fastPath: true },
            result: { success: true, message: 'Menu de ajuda e comandos rápidos retornado (0 tokens).' },
          },
        ],
      };
    }

    // ⚡ FAST-PATH DETERMINÍSTICO DE TAREFAS (0 TOKENS DE IA)
    const fastTaskScope = detectDeterministicTaskCommand(userMessage);
    if (fastTaskScope) {
      const fastResponse = await googleService.getFormattedTasksSummary(fastTaskScope);
      return {
        response: fastResponse,
        toolCallsExecuted: [
          {
            name: 'google_tasks_list',
            args: { scope: fastTaskScope, fastPath: true },
            result: { success: true, scope: fastTaskScope, message: 'Processado via lógica determinística (0 tokens).' },
          },
        ],
      };
    }

    // ⚡ FAST-PATH DETERMINÍSTICO CONSOLIDADO DAS 2 LOJAS (0 TOKENS DE IA)
    const fastCombinedDays = detectDeterministicCombinedStoresCommand(userMessage);
    if (fastCombinedDays !== null) {
      const fastCombinedResponse = await klimaPartsService.getFormattedCombinedStoresSummary(fastCombinedDays);
      return {
        response: fastCombinedResponse,
        toolCallsExecuted: [
          {
            name: 'klimaparts_combined_stores_overview',
            args: { days: fastCombinedDays, fastPath: true },
            result: { success: true, days: fastCombinedDays, message: 'Processado via lógica determinística consolidada (0 tokens).' },
          },
        ],
      };
    }

    // ⚡ FAST-PATH DETERMINÍSTICO DE VENDAS KLIMAPARTS / ARMORCAR INDIVIDUAL (0 TOKENS DE IA)
    const fastKlima = detectDeterministicKlimaCommand(userMessage);
    if (fastKlima) {
      const fastKlimaResponse = await klimaPartsService.getFormattedStoreSummary(fastKlima.storeId, fastKlima.days);
      return {
        response: fastKlimaResponse,
        toolCallsExecuted: [
          {
            name: 'klimaparts_store_overview',
            args: { storeId: fastKlima.storeId, days: fastKlima.days, fastPath: true },
            result: { success: true, storeId: fastKlima.storeId, days: fastKlima.days, message: 'Processado via lógica determinística (0 tokens).' },
          },
        ],
      };
    }

    // ⚡ FAST-PATH DETERMINÍSTICO DE PERGUNTAS PENDENTES DO MERCADO LIVRE (0 TOKENS DE IA)
    if (detectDeterministicQuestionsCommand(userMessage)) {
      const fastQuestionsResponse = await klimaPartsService.getFormattedQuestionsSummary();
      return {
        response: fastQuestionsResponse,
        toolCallsExecuted: [
          {
            name: 'klimaparts_unanswered_questions',
            args: { fastPath: true },
            result: { success: true, message: 'Processado via lógica determinística de perguntas (0 tokens).' },
          },
        ],
      };
    }

    // ⚡ FAST-PATH DETERMINÍSTICO DE ENVIOS E PEDIDOS PENDENTES (0 TOKENS DE IA)
    const fastShipmentsDays = detectDeterministicShipmentsCommand(userMessage);
    if (fastShipmentsDays !== null) {
      const fastShipmentsResponse = await klimaPartsService.getFormattedShipmentsSummary(fastShipmentsDays);
      return {
        response: fastShipmentsResponse,
        toolCallsExecuted: [
          {
            name: 'klimaparts_list_pending_orders',
            args: { days: fastShipmentsDays, fastPath: true },
            result: { success: true, days: fastShipmentsDays, message: 'Processado via lógica determinística de envios (0 tokens).' },
          },
        ],
      };
    }

    // ⚡ FAST-PATH DETERMINÍSTICO DE BRIEFING MATINAL (0 TOKENS DE IA)
    if (detectDeterministicBriefingCommand(userMessage)) {
      const { cronService } = await import('../services/cron.service.js');
      const fastBriefingResponse = await cronService.generateDailyBriefing();
      return {
        response: fastBriefingResponse,
        toolCallsExecuted: [
          {
            name: 'scheduled_job_briefing',
            args: { fastPath: true },
            result: { success: true, message: 'Resumo matinal gerado via template pré-definido (0 tokens).' },
          },
        ],
      };
    }

    const provider = AIProviderFactory.getProviderType();

    // Carregar memórias ativas em formato compacto
    const memories = await prisma.memory.findMany({ take: 20 });
    const memoryContext = memories.length > 0
      ? `[MEMÓRIA & PREFERÊNCIAS]:\n` +
        memories.map((m: { key: string; value: string }) => `- ${m.key}: ${m.value}`).join('\n')
      : '';

    const now = new Date();
    const saoPauloDateStr = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'full',
      timeStyle: 'medium',
    }).format(now);

    // Buscar histórico recente da conversa (janela deslizante de 6 mensagens para economia máxima)
    const rawRecent = await prisma.message.findMany({
      where: { conversationId: context.conversationId },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
    const recentMessages = rawRecent.reverse();

    const interactionId = `int_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (provider === 'gemini') {
      return this.runWithGemini(userMessage, memoryContext, saoPauloDateStr, recentMessages, context, interactionId);
    } else {
      return this.runWithOpenAICompatible(userMessage, memoryContext, saoPauloDateStr, recentMessages, provider, context, interactionId);
    }
  }

  private async runWithGemini(
    userMessage: string,
    memoryContext: string,
    saoPauloDateStr: string,
    recentMessages: any[],
    context?: AgentContext,
    interactionId?: string
  ): Promise<AgentOutput> {
    const ai = AIProviderFactory.getGeminiClient();
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const systemInstruction = memoryContext
      ? `${SECRETARY_SYSTEM_PROMPT}\n\n${memoryContext}`
      : SECRETARY_SYSTEM_PROMPT;

    // Tool Gating inteligente com contexto
    const selectedTools = await selectToolsForMessage(userMessage, recentMessages);
    const functionDeclarations = selectedTools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    // Montar histórico de conteúdos
    const contents: any[] = [];

    for (const msg of recentMessages) {
      contents.push({
        role: msg.role === 'ASSISTANT' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    const enrichedUserMessage = `[Horário oficial de São Paulo: ${saoPauloDateStr}]\n${userMessage}`;
    const lastContent = contents[contents.length - 1];
    if (!lastContent || lastContent.role !== 'user' || lastContent.parts[0]?.text !== enrichedUserMessage) {
      contents.push({
        role: 'user',
        parts: [{ text: enrichedUserMessage }],
      });
    }

    const toolCallsExecuted: Array<{ name: string; args: any; result: any }> = [];
    let detectedCategory = 'general_chat';

    let maxSteps = 5;
    let finalResponseText = '';

    while (maxSteps > 0) {
      maxSteps--;

      const startTime = Date.now();
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          tools: functionDeclarations.length > 0 ? [{ functionDeclarations: functionDeclarations as any }] : undefined,
        },
      });
      const durationMs = Date.now() - startTime;

      if (response.usageMetadata) {
        await usageService.recordChatUsage({
          interactionId,
          provider: 'gemini',
          model,
          category: detectedCategory,
          promptSummary: userMessage,
          promptTokens: response.usageMetadata.promptTokenCount || 0,
          completionTokens: response.usageMetadata.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata.totalTokenCount || 0,
          durationMs,
          channel: context?.channel || 'web',
        });
      }

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      let functionCallFound = false;

      for (const part of parts) {
        if (part.functionCall && part.functionCall.name) {
          functionCallFound = true;
          const name = part.functionCall.name;
          const args = part.functionCall.args || {};

          if (name.includes('youtube')) detectedCategory = 'youtube_search';
          else if (name.includes('search_web')) detectedCategory = 'web_search';
          else if (name.includes('read_webpage')) detectedCategory = 'web_read';
          else if (name.includes('task') || name.includes('calendar')) detectedCategory = 'tasks_agenda';
          else if (name.includes('gmail')) detectedCategory = 'google_workspace';
          else if (name.includes('whatsapp')) detectedCategory = 'whatsapp_tools';

          const toolResult = await executeTool(name, (args as Record<string, any>));
          
          toolCallsExecuted.push({
            name,
            args,
            result: toolResult,
          });

          contents.push({
            role: 'model',
            parts: [{ functionCall: part.functionCall }],
          });

          contents.push({
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name,
                  response: { result: toolResult },
                },
              },
            ],
          });
        } else if (part.text) {
          finalResponseText = part.text;
        }
      }

      if (!functionCallFound) {
        break;
      }
    }

    if (!finalResponseText && toolCallsExecuted.length > 0) {
      try {
        const finalRes = await ai.models.generateContent({
          model,
          contents,
          config: { systemInstruction },
        });
        finalResponseText = finalRes.text || '';
      } catch (err: any) {
        console.error('[SecretaryAgent] Erro na síntese final Gemini:', err.message);
      }
    }

    return {
      response: finalResponseText || 'Entendido e processado.',
      toolCallsExecuted,
    };
  }

  private async runWithOpenAICompatible(
    userMessage: string,
    memoryContext: string,
    saoPauloDateStr: string,
    recentMessages: any[],
    provider: 'deepseek' | 'openai',
    context?: AgentContext,
    interactionId?: string
  ): Promise<AgentOutput> {
    const client = provider === 'deepseek'
      ? AIProviderFactory.getDeepSeekClient()
      : AIProviderFactory.getOpenAIClient();

    const model = provider === 'deepseek'
      ? (process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash')
      : (process.env.OPENAI_MODEL || 'gpt-4o-mini');

    // Tool Gating inteligente com contexto
    const selectedTools = await selectToolsForMessage(userMessage, recentMessages);
    const openAITools = selectedTools.length > 0
      ? selectedTools.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }))
      : undefined;

    // Prefixo do sistema estático para garantir DeepSeek Prompt Cache Hit
    const messages: any[] = [
      { role: 'system', content: SECRETARY_SYSTEM_PROMPT },
    ];

    if (memoryContext) {
      messages.push({ role: 'system', content: memoryContext });
    }

    for (const m of recentMessages) {
      const isAssistant = m.role.toLowerCase() === 'assistant';
      const msgObj: any = {
        role: isAssistant ? 'assistant' : 'user',
        content: m.content || '',
      };
      if (isAssistant && provider === 'deepseek') {
        msgObj.reasoning_content = (m as any).reasoning_content || 'Raciocínio anterior concluído.';
      }
      messages.push(msgObj);
    }

    // Contexto temporal injetado exclusivamente na mensagem do usuário
    const enrichedUserMessage = `[Horário oficial de São Paulo: ${saoPauloDateStr}]\n${userMessage}`;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== enrichedUserMessage) {
      messages.push({ role: 'user', content: enrichedUserMessage });
    }

    const toolCallsExecuted: Array<{ name: string; args: any; result: any }> = [];
    let detectedCategory = 'general_chat';
    let maxSteps = 5;
    let finalResponseText = '';

    while (maxSteps > 0) {
      maxSteps--;

      const startTime = Date.now();
      const completion = await client.chat.completions.create({
        model,
        messages,
        tools: openAITools,
        tool_choice: 'auto',
      });
      const durationMs = Date.now() - startTime;

      if (completion.usage) {
        await usageService.recordChatUsage({
          interactionId,
          provider,
          model,
          category: detectedCategory,
          promptSummary: userMessage,
          promptTokens: completion.usage.prompt_tokens || 0,
          completionTokens: completion.usage.completion_tokens || 0,
          totalTokens: completion.usage.total_tokens || 0,
          durationMs,
          channel: context?.channel || 'web',
        });
      }

      const message = completion.choices[0]?.message;

      if (!message) {
        break;
      }

      const rawContent = message.content || '';
      const dsmlTools = parseDsmlToolCalls(rawContent);

      if (message.tool_calls && message.tool_calls.length > 0) {
        const assistantMsg: any = {
          role: 'assistant',
          content: message.content || null,
          tool_calls: message.tool_calls,
        };
        if (provider === 'deepseek') {
          assistantMsg.reasoning_content = (message as any).reasoning_content || 'Pensando sobre as ferramentas a executar.';
        }
        messages.push(assistantMsg);

        for (const toolCall of message.tool_calls) {
          const fnName = toolCall.function.name;
          const fnArgs = JSON.parse(toolCall.function.arguments || '{}');

          if (fnName.includes('youtube')) detectedCategory = 'youtube_search';
          else if (fnName.includes('search_web')) detectedCategory = 'web_search';
          else if (fnName.includes('read_webpage')) detectedCategory = 'web_read';
          else if (fnName.includes('task') || fnName.includes('calendar')) detectedCategory = 'tasks_agenda';
          else if (fnName.includes('gmail')) detectedCategory = 'google_workspace';
          else if (fnName.includes('whatsapp')) detectedCategory = 'whatsapp_tools';

          const result = await executeTool(fnName, fnArgs);

          toolCallsExecuted.push({
            name: fnName,
            args: fnArgs,
            result,
          });

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
      } else if (dsmlTools.length > 0) {
        const assistantMsg: any = {
          role: 'assistant',
          content: rawContent,
        };
        if (provider === 'deepseek') {
          assistantMsg.reasoning_content = (message as any).reasoning_content || 'Pensando sobre as ferramentas a executar.';
        }
        messages.push(assistantMsg);

        for (const toolCall of dsmlTools) {
          const fnName = toolCall.name;
          const fnArgs = toolCall.args;

          if (fnName.includes('youtube')) detectedCategory = 'youtube_search';
          else if (fnName.includes('search_web')) detectedCategory = 'web_search';
          else if (fnName.includes('read_webpage')) detectedCategory = 'web_read';
          else if (fnName.includes('task') || fnName.includes('calendar')) detectedCategory = 'tasks_agenda';
          else if (fnName.includes('gmail')) detectedCategory = 'google_workspace';
          else if (fnName.includes('whatsapp')) detectedCategory = 'whatsapp_tools';

          const result = await executeTool(fnName, fnArgs);

          toolCallsExecuted.push({
            name: fnName,
            args: fnArgs,
            result,
          });

          messages.push({
            role: 'user',
            content: `[RESULTADO DA FERRAMENTA ${fnName}]:\n${JSON.stringify(result)}`,
          });
        }
      } else {
        finalResponseText = rawContent;
        break;
      }
    }

    if (!finalResponseText && toolCallsExecuted.length > 0) {
      try {
        const finalPromptMsg = {
          role: 'user' as const,
          content: 'Com base nas ferramentas executadas acima, forneça a resposta final objetiva e elegante.',
        };
        const finalCompletion = await client.chat.completions.create({
          model,
          messages: [...messages, finalPromptMsg],
        });
        finalResponseText = finalCompletion.choices[0]?.message?.content || '';
      } catch (err: any) {
        console.error('[SecretaryAgent] Erro na síntese final OpenAI:', err.message);
      }
    }

    return {
      response: finalResponseText || 'Entendido e processado com sucesso.',
      toolCallsExecuted,
    };
  }
}

export const secretaryAgent = new SecretaryAgent();
