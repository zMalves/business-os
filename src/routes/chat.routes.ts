import { FastifyInstance } from 'fastify';
import { ChatService } from '../services/chat.service.js';
import { z } from 'zod';

const chatService = new ChatService();

const chatMessageSchema = z.object({
  message: z.string().min(1, 'A mensagem não pode estar vazia'),
  conversationId: z.string().optional(),
  externalId: z.string().optional(),
  channel: z.string().optional().default('web'),
});

export async function chatRoutes(app: FastifyInstance) {
  // Enviar mensagem para a secretária e receber resposta
  app.post('/chat', async (req, reply) => {
    const parsed = chatMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, errors: parsed.error.format() });
    }

    try {
      const result = await chatService.processIncomingMessage(parsed.data);
      return reply.send({
        success: true,
        conversationId: result.conversationId,
        response: result.message.content,
        toolCalls: result.toolCalls,
        createdAt: result.message.createdAt,
      });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({
        success: false,
        message: 'Erro interno ao processar mensagem com a IA',
        details: error.message,
      });
    }
  });

  // Histórico de mensagens de uma conversa específica
  app.get('/conversations/:id/history', async (req, reply) => {
    const { id } = req.params as { id: string };
    const conversation = await chatService.getConversationHistory(id);
    if (!conversation) {
      return reply.status(404).send({ success: false, message: 'Conversa não encontrada' });
    }
    return reply.send({ success: true, conversation });
  });

  // Listar todas as conversas recentes
  app.get('/conversations', async (req, reply) => {
    const { channel } = req.query as { channel?: string };
    const conversations = await chatService.listConversations(channel);
    return reply.send({ success: true, count: conversations.length, conversations });
  });
}
