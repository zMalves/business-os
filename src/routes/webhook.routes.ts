import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { exec } from 'child_process';
import { promisify } from 'util';
import { whatsappService } from '../services/whatsapp.service.js';
import { loggerService } from '../services/logger.service.js';
import { AIProviderFactory } from '../ai/provider.js';

const execAsync = promisify(exec);

export async function webhookRoutes(app: FastifyInstance) {
  /**
   * 1. Webhook do GitHub (Auto-Deploy em Push)
   */
  app.post('/webhook/github', async (req, reply) => {
    const payload = req.body as any;
    const branch = payload?.ref;
    const targetBranch = process.env.GIT_BRANCH || 'develop';
    const expectedRef = `refs/heads/${targetBranch}`;

    if (!branch || branch === expectedRef) {
      req.log.info(`📦 Recebido webhook do GitHub (push na ${targetBranch}). Executando auto-pull...`);

      try {
        await execAsync('git config --global --add safe.directory /app 2>/dev/null || true');
        const { stdout, stderr } = await execAsync(`git pull origin ${targetBranch}`);
        req.log.info(`Git pull output: ${stdout}`);

        await execAsync('chmod -R 777 /app 2>/dev/null || true');

        execAsync('npx prisma generate && npx prisma db push --skip-generate 2>/dev/null || npx prisma migrate deploy 2>/dev/null || true').catch((err) =>
          req.log.error(`Erro ao rodar prisma no webhook: ${err.message}`)
        );

        return reply.status(200).send({
          success: true,
          message: `Atualização automática da branch ${targetBranch} concluída com sucesso!`,
          output: stdout,
          stderr: stderr || null,
        });
      } catch (error: any) {
        req.log.error(`Erro ao executar git pull: ${error.message}`);
        return reply.status(500).send({
          success: false,
          message: 'Falha ao executar git pull automático',
          error: error.message,
        });
      }
    }

    return reply.status(200).send({
      success: true,
      message: `Ignorado push na branch ${branch} (este ambiente escuta a branch ${targetBranch})`,
    });
  });

  /**
   * 2. Webhook de Notificação Externa para a Secretária (WhatsApp)
   * Recebe mensagens, dados e alertas de outros apps (n8n, ERP, CRM, etc.)
   * e entrega formatado diretamente no WhatsApp do Maychel.
   */
  async function handleNotificationWebhook(req: FastifyRequest, reply: FastifyReply) {
    const defaultSecret =
      process.env.NOTIFY_WEBHOOK_SECRET ||
      process.env.WEBHOOK_SECRET ||
      process.env.EVOLUTION_API_KEY ||
      'victoria_master_secret_2026';

    const headerToken =
      req.headers['x-webhook-token'] ||
      req.headers['x-api-key'] ||
      req.headers['authorization'];
    const queryToken = (req.query as any)?.token || (req.query as any)?.apiKey;
    const bodyToken =
      typeof req.body === 'object' && req.body !== null
        ? (req.body as any).token || (req.body as any).apiKey || (req.body as any).secret
        : undefined;

    const providedToken = (headerToken || queryToken || bodyToken || '')
      .toString()
      .replace(/^Bearer\s+/i, '')
      .trim();

    const requireToken = process.env.NOTIFY_REQUIRE_TOKEN !== 'false';
    if (requireToken && providedToken !== defaultSecret) {
      return reply.status(401).send({
        success: false,
        error: 'Acesso não autorizado ao webhook de notificação.',
        hint: "Forneça o token via header 'x-webhook-token', 'x-api-key', Authorization: Bearer <token>, query '?token=...' ou no corpo JSON.",
      });
    }

    // Normaliza payload tanto para JSON quanto para Query (GET) ou String
    let payload: Record<string, any> = {};
    if (typeof req.body === 'string') {
      try {
        payload = JSON.parse(req.body);
      } catch {
        payload = { message: req.body };
      }
    } else if (typeof req.body === 'object' && req.body !== null) {
      payload = req.body as Record<string, any>;
    } else if (typeof req.query === 'object' && req.query !== null) {
      payload = req.query as Record<string, any>;
    }

    // Extração de parâmetros
    const rawMessage =
      payload.message ||
      payload.text ||
      payload.msg ||
      payload.mensagem ||
      payload.content;
    const title = payload.title || payload.titulo || payload.subject || payload.topic;
    const source = payload.source || payload.origem || payload.app || payload.system || payload.sender;
    const priority = (payload.priority || payload.prioridade || payload.level || payload.urgency || 'normal')
      .toString()
      .toLowerCase();
    const explicitData = payload.data || payload.dados || payload.payload || payload.details || payload.detalhes;
    const useAi = Boolean(
      payload.ai ||
      payload.useAi ||
      payload.formatWithAi ||
      payload.interpret ||
      payload.summarize ||
      payload.prompt
    );
    const customPrompt = payload.prompt;

    // Se o cliente postou um JSON de dados livres sem as chaves padrão
    let finalData = explicitData;
    if (!rawMessage && !finalData && typeof payload === 'object') {
      const cleanPayload = { ...payload };
      delete cleanPayload.token;
      delete cleanPayload.apiKey;
      delete cleanPayload.secret;
      delete cleanPayload.to;
      delete cleanPayload.number;
      delete cleanPayload.targetNumber;
      delete cleanPayload.numero;
      delete cleanPayload.ai;
      delete cleanPayload.useAi;
      delete cleanPayload.prompt;
      if (Object.keys(cleanPayload).length > 0) {
        finalData = cleanPayload;
      }
    }

    // Validação mínima de dados
    if (!rawMessage && !finalData && !title && !customPrompt) {
      return reply.status(400).send({
        success: false,
        error: 'Nenhum conteúdo ou dado fornecido. Envie ao menos um campo "message", "text", "title" ou "data".',
        examples: {
          mensagemDireta: {
            message: 'O lead Carlos aprovou o orçamento!',
          },
          notificacaoEstruturada: {
            title: 'Novo Lead',
            source: 'Meta Forms',
            priority: 'alta',
            message: 'Contato: Carlos Silva',
            data: {
              telefone: '(41) 99999-8888',
              veiculo: 'Corolla 2022',
            },
          },
          sinteseComIA: {
            ai: true,
            source: 'CRM Hubspot',
            data: {
              deal: 'Empresa ABC',
              valor: 'R$ 48.000,00',
              status: 'Fechamento',
            },
          },
        },
      });
    }

    // Destinatário (Padrão: número do Maychel no .env)
    const rawTarget =
      payload.to ||
      payload.number ||
      payload.targetNumber ||
      payload.numero ||
      (req.query as any)?.to ||
      (req.query as any)?.number;
    const defaultTarget = (process.env.WHATSAPP_ALLOWED_NUMBERS || '5541995852423').split(',')[0].trim();
    const targetNumber = rawTarget ? String(rawTarget).trim() : defaultTarget;

    let finalText = '';
    let mode: 'direct_raw' | 'direct_formatted' | 'ai_synthesized' = 'direct_formatted';

    // Opção A: Síntese inteligente com IA da Victoria
    if (useAi) {
      try {
        const aiProvider = AIProviderFactory.getProviderType();
        let promptText = '';

        if (customPrompt) {
          promptText = `${customPrompt}\n\nDados da Notificação:\n${JSON.stringify({ title, source, priority, message: rawMessage, data: finalData }, null, 2)}`;
        } else {
          promptText = `Você é a Victoria, secretária executiva de alta performance do Maychel Alves.
Você acabou de receber dados/informações via Webhook de uma integração externa (Origem: ${source || 'Sistema Externo'}).
Sua tarefa é analisar essas informações e redigir uma notificação executiva, clara, direta e objetiva para enviar no WhatsApp do Maychel.
Diretrizes:
- Use formatação própria do WhatsApp (*negrito*, listas com marcadores •).
- Destaque o que é mais importante (valores, nomes, status, prazos ou ações necessárias).
- Seja profissional, elegante e concisa. Não invente dados ausentes.
- Não inclua blocos <think> nem saudações prolixas. Comece diretamente com a notificação executiva.

Dados recebidos:
${JSON.stringify({ title, source, priority, message: rawMessage, data: finalData }, null, 2)}`;
        }

        let aiGenerated = '';
        if (aiProvider === 'deepseek') {
          const client = AIProviderFactory.getDeepSeekClient();
          const res = await client.chat.completions.create({
            model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
            messages: [{ role: 'user', content: promptText }],
            temperature: 0.3,
            max_tokens: 800,
          });
          aiGenerated = res.choices[0]?.message?.content || '';
        } else if (aiProvider === 'openai') {
          const client = AIProviderFactory.getOpenAIClient();
          const res = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: promptText }],
            temperature: 0.3,
          });
          aiGenerated = res.choices[0]?.message?.content || '';
        } else {
          const client = AIProviderFactory.getGeminiClient();
          const res = await client.models.generateContent({
            model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
            contents: promptText,
          });
          aiGenerated = res.text || '';
        }

        if (aiGenerated && aiGenerated.trim().length > 0) {
          finalText = whatsappService.formatTextForWhatsApp(aiGenerated);
          mode = 'ai_synthesized';
        }
      } catch (aiErr: any) {
        loggerService.system(
          `[Webhook Notify] Aviso: Falha ao gerar síntese com IA (${aiErr.message}). Utilizando formatação estruturada padrão.`,
          { error: aiErr.message },
          'warn'
        );
      }
    }

    // Opção B: Formatação Estruturada Executiva (Custo Zero / 0 Tokens)
    if (!finalText) {
      if (!title && !source && !finalData && rawMessage) {
        finalText = String(rawMessage).trim();
        mode = 'direct_raw';
      } else {
        let priorityEmoji = '🔔';
        let priorityLabel = '';
        if (['alta', 'high', 'urgente', 'urgent', 'critica', 'critical'].includes(priority)) {
          priorityEmoji = '🚨';
          priorityLabel = ' *[URGENTE]*';
        } else if (['baixa', 'low', 'info'].includes(priority)) {
          priorityEmoji = '💡';
        }

        const parts: string[] = [];

        // 1. Cabeçalho de Título
        const headerTitle = title ? String(title).trim() : 'Notificação Executiva';
        parts.push(`${priorityEmoji} *${headerTitle}*${priorityLabel}`);

        // 2. Metadados (Origem e Horário)
        const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const metaLine: string[] = [];
        if (source) metaLine.push(`🏢 *Origem:* ${source}`);
        metaLine.push(`🕒 _${now}_`);
        parts.push(metaLine.join(' • '));

        // 3. Mensagem Principal
        if (rawMessage && String(rawMessage).trim().length > 0) {
          parts.push(`\n${String(rawMessage).trim()}`);
        }

        // 4. Detalhes / Dados estruturados
        if (finalData) {
          parts.push('\n📋 *Detalhes:*');
          if (typeof finalData === 'object' && finalData !== null) {
            if (Array.isArray(finalData)) {
              finalData.forEach((item, idx) => {
                if (typeof item === 'object') {
                  parts.push(`• *Item ${idx + 1}:* ${JSON.stringify(item)}`);
                } else {
                  parts.push(`• ${item}`);
                }
              });
            } else {
              Object.entries(finalData).forEach(([key, val]) => {
                const formattedKey = key
                  .replace(/_/g, ' ')
                  .replace(/([A-Z])/g, ' $1')
                  .replace(/\b\w/g, (c) => c.toUpperCase())
                  .trim();
                const formattedVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                parts.push(`• *${formattedKey}:* ${formattedVal}`);
              });
            }
          } else {
            parts.push(`• ${String(finalData)}`);
          }
        }

        finalText = parts.join('\n');
        mode = 'direct_formatted';
      }
    }

    // Envio pelo WhatsApp Service
    try {
      const sendResult = await whatsappService.sendTextMessage({
        number: targetNumber,
        text: finalText,
      });

      loggerService.whatsapp(
        `🔔 [Webhook Notify] Mensagem externa entregue no WhatsApp (${targetNumber})`,
        {
          targetNumber,
          source: source || 'Webhook',
          title: title || 'Notificação',
          mode,
          messagePreview: finalText.slice(0, 100),
        },
        'success'
      );

      return reply.status(200).send({
        success: true,
        message: 'Notificação enviada com sucesso para o WhatsApp.',
        targetNumber,
        mode,
        sentText: finalText,
        whatsappResult: sendResult,
      });
    } catch (sendError: any) {
      loggerService.error(
        'whatsapp',
        `❌ [Webhook Notify] Erro ao enviar mensagem no WhatsApp para ${targetNumber}: ${sendError.message}`,
        { error: sendError.message, targetNumber }
      );

      return reply.status(502).send({
        success: false,
        error: 'Falha ao despachar a notificação no WhatsApp.',
        details: sendError.message,
        targetNumber,
      });
    }
  }

  // Registra rota principal e aliases úteis
  app.post('/webhook/notify', handleNotificationWebhook);
  app.get('/webhook/notify', handleNotificationWebhook);
  app.post('/webhook/message', handleNotificationWebhook);
  app.post('/webhook/send', handleNotificationWebhook);
}
