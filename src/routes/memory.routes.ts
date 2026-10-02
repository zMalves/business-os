import { FastifyInstance } from 'fastify';
import { prisma } from '../database/client.js';
import { z } from 'zod';

const memorySchema = z.object({
  key: z.string().min(1, 'A chave é obrigatória'),
  value: z.string().min(1, 'O valor é obrigatório'),
  category: z.string().optional(),
});

export async function memoryRoutes(app: FastifyInstance) {
  app.get('/memories', async (_req, reply) => {
    const memories = await prisma.memory.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return reply.send({ success: true, count: memories.length, memories });
  });

  app.post('/memories', async (req, reply) => {
    const parsed = memorySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, errors: parsed.error.format() });
    }

    const memory = await prisma.memory.upsert({
      where: { key: parsed.data.key },
      update: { value: parsed.data.value, category: parsed.data.category || null },
      create: { key: parsed.data.key, value: parsed.data.value, category: parsed.data.category || null },
    });

    return reply.status(201).send({ success: true, memory });
  });

  app.delete('/memories/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await prisma.memory.delete({ where: { id } });
      return reply.send({ success: true, message: 'Memória removida com sucesso' });
    } catch {
      return reply.status(404).send({ success: false, message: 'Memória não encontrada' });
    }
  });
}
