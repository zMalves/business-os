import { prisma } from '../database/client.js';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { googleService } from './google.service.js';
import { loggerService } from './logger.service.js';

export interface CreateTaskDTO {
  title: string;
  description?: string;
  dueDate?: Date | string;
  priority?: TaskPriority;
  category?: string;
}

export interface UpdateTaskDTO {
  title?: string;
  description?: string;
  dueDate?: Date | string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  category?: string;
}

export class TaskService {
  /**
   * Lista todas as tarefas do Google Tasks (com sincronização em tempo real)
   */
  async getAllTasks(filter?: { status?: TaskStatus; category?: string }) {
    try {
      // 1. Tenta buscar direto do Google Tasks
      const gRes = await googleService.listGoogleTasks();
      if (gRes.connected && Array.isArray(gRes.tasks)) {
        let tasks = gRes.tasks;
        if (filter?.status) {
          tasks = tasks.filter((t) => t.status === filter.status);
        }
        if (filter?.category && filter.category !== 'ALL') {
          tasks = tasks.filter((t) => t.category === filter.category);
        }
        return tasks;
      }
    } catch (err: any) {
      loggerService.error('system', `Aviso: Falha ao buscar Google Tasks direto da API: ${err.message}`);
    }

    // 2. Fallback caso a conta Google não esteja conectada ou dê timeout
    const where: any = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.category) where.category = filter.category;

    const localTasks = await prisma.task.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    return localTasks.map((t) => ({
      id: t.id,
      googleTaskId: t.id,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate,
      status: t.status,
      priority: t.priority,
      category: t.category || 'Google Tasks',
      updatedAt: t.updatedAt,
      isGoogleTask: false,
    }));
  }

  /**
   * Busca uma tarefa por ID
   */
  async getTaskById(id: string) {
    const all = await this.getAllTasks();
    const found = all.find((t) => t.id === id || (t as any).googleTaskId === id);
    if (found) return found;
    return prisma.task.findUnique({ where: { id } });
  }

  /**
   * Cria uma tarefa diretamente no Google Tasks
   */
  async createTask(data: CreateTaskDTO) {
    // 1. Tenta criar no Google Tasks
    try {
      const gRes = await googleService.createGoogleTask({
        title: data.title,
        description: data.description,
        dueDate: data.dueDate,
      });

      if (gRes.success && gRes.task) {
        loggerService.system(`✅ Tarefa criada no Google Tasks: "${data.title}" (ID: ${gRes.task.id})`);
        return gRes.task;
      }
    } catch (err: any) {
      loggerService.error('system', `Erro ao criar no Google Tasks: ${err.message}`);
    }

    // 2. Fallback para banco local se Google não estiver disponível
    const local = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        priority: data.priority || TaskPriority.MEDIUM,
        category: data.category || 'Google Tasks',
        status: TaskStatus.PENDING,
      },
    });

    return {
      id: local.id,
      googleTaskId: local.id,
      title: local.title,
      description: local.description,
      dueDate: local.dueDate,
      status: local.status,
      priority: local.priority,
      category: local.category,
      updatedAt: local.updatedAt,
      isGoogleTask: false,
    };
  }

  /**
   * Atualiza ou marca como concluída no Google Tasks
   */
  async updateTask(id: string, data: UpdateTaskDTO) {
    try {
      const gRes = await googleService.updateGoogleTask(id, {
        title: data.title,
        description: data.description,
        dueDate: data.dueDate,
        status: data.status,
      });

      if (gRes.success && gRes.task) {
        loggerService.system(`🔄 Tarefa atualizada no Google Tasks: "${gRes.task.title}" (${data.status || 'atualizada'})`);
        return gRes.task;
      }
    } catch (err: any) {
      loggerService.error('system', `Erro ao atualizar no Google Tasks: ${err.message}`);
    }

    // Fallback local
    return prisma.task.update({
      where: { id },
      data: {
        ...data,
        dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
      },
    });
  }

  /**
   * Deleta do Google Tasks
   */
  async deleteTask(id: string) {
    try {
      const gRes = await googleService.deleteGoogleTask(id);
      if (gRes.success) {
        loggerService.system(`🗑️ Tarefa removida do Google Tasks: ${id}`);
        return { success: true };
      }
    } catch (err: any) {
      loggerService.error('system', `Erro ao deletar do Google Tasks: ${err.message}`);
    }

    try {
      await prisma.task.delete({ where: { id } });
    } catch {
      // ignore
    }

    return { success: true };
  }
}

export const taskService = new TaskService();

