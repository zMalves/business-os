import { prisma } from '../database/client.js';
import { SecretaryAgent } from '../agents/agent.js';
import { MessageRole } from '@prisma/client';

export interface SendMessageDTO {
  conversationId?: string;
  externalId?: string;
  channel?: string;
  message: string;
}

export class ChatService {
  private agent: SecretaryAgent;

  constructor() {
    this.agent = new SecretaryAgent();
  }

  async processIncomingMessage(dto: SendMessageDTO) {
    let conversation;

    // Localizar ou criar conversa existente
    if (dto.conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: dto.conversationId },
      });
    } else if (dto.externalId) {
      conversation = await prisma.conversation.findFirst({
        where: {
          externalId: dto.externalId,
          channel: dto.channel || 'web',
        },
      });
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          externalId: dto.externalId || null,
          channel: dto.channel || 'web',
          title: dto.message.slice(0, 50),
        },
      });
    }

    // Salvar a mensagem do usuário
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: dto.message,
      },
    });

    // Executar agente de IA
    const agentOutput = await this.agent.processMessage(dto.message, {
      conversationId: conversation.id,
      externalId: dto.externalId,
      channel: dto.channel || 'web',
    });

    // Salvar a resposta da secretária no banco
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: agentOutput.response,
        metadata: agentOutput.toolCallsExecuted.length > 0 ? (agentOutput.toolCallsExecuted as any) : undefined,
      },
    });

    return {
      conversationId: conversation.id,
      message: assistantMessage,
      toolCalls: agentOutput.toolCallsExecuted,
    };
  }

  async getConversationHistory(conversationId: string) {
    return prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async listConversations(channel?: string) {
    return prisma.conversation.findMany({
      where: channel ? { channel } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }
}
