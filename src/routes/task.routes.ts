import { FastifyInstance } from 'fastify';
import { TaskService } from '../services/task.service.js';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { z } from 'zod';

const taskService = new TaskService();

const createTaskSchema = z.object({
  title: z.string().min(1, 'O título é obrigatório'),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  category: z.string().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  category: z.string().optional(),
});

export async function taskRoutes(app: FastifyInstance) {
  app.get('/tasks', async (req, reply) => {
    const query = req.query as { status?: TaskStatus; category?: string };
    const tasks = await taskService.getAllTasks(query);
    return reply.send({ success: true, count: tasks.length, tasks });
  });

  app.get('/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await taskService.getTaskById(id);
    if (!task) {
      return reply.status(404).send({ success: false, message: 'Tarefa não encontrada' });
    }
    return reply.send({ success: true, task });
  });

  app.post('/tasks', async (req, reply) => {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, errors: parsed.error.format() });
    }
    const task = await taskService.createTask(parsed.data);
    return reply.status(201).send({ success: true, task });
  });

  app.patch('/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, errors: parsed.error.format() });
    }
    try {
      const task = await taskService.updateTask(id, parsed.data);
      return reply.send({ success: true, task });
    } catch {
      return reply.status(404).send({ success: false, message: 'Tarefa não encontrada para atualização' });
    }
  });

  app.delete('/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await taskService.deleteTask(id);
      return reply.send({ success: true, message: 'Tarefa removida com sucesso' });
    } catch {
      return reply.status(404).send({ success: false, message: 'Tarefa não encontrada para remoção' });
    }
  });
}
