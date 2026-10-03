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
   * Sincroniza todas as tarefas do Google Tasks diretamente para a tabela tasks no MariaDB
   */
  async syncGoogleTasksToDatabase() {
    const startTime = Date.now();
    try {
      const gRes = await googleService.listGoogleTasks({
        showCompleted: true,
        showHidden: true,
        maxResults: 100,
      });

      if (!gRes.connected || !Array.isArray(gRes.tasks)) {
        return { success: false, error: gRes.error || 'Conta Google não conectada' };
      }

      let syncedCount = 0;
      for (const t of gRes.tasks) {
        const isCompleted = t.status === 'COMPLETED' || (t as any).isCompleted;
        const statusEnum = isCompleted ? TaskStatus.COMPLETED : TaskStatus.PENDING;

        const existing = await prisma.task.findFirst({
          where: {
            OR: [
              { googleTaskId: t.id },
              { id: t.id },
            ],
          },
        });

        if (existing) {
          await prisma.task.update({
            where: { id: existing.id },
            data: {
              googleTaskId: t.id,
              title: t.title || 'Sem título',
              description: t.description || null,
              dueDate: t.dueDate ? new Date(t.dueDate) : null,
              status: statusEnum,
              isGoogleTask: true,
              completedAt: t.completedAt ? new Date(t.completedAt) : isCompleted ? new Date() : null,
            },
          });
        } else {
          await prisma.task.create({
            data: {
              googleTaskId: t.id,
              title: t.title || 'Sem título',
              description: t.description || null,
              dueDate: t.dueDate ? new Date(t.dueDate) : null,
              status: statusEnum,
              priority: TaskPriority.MEDIUM,
              category: 'Google Tasks',
              isGoogleTask: true,
              completedAt: t.completedAt ? new Date(t.completedAt) : isCompleted ? new Date() : null,
            },
          });
        }
        syncedCount++;
      }

      const durationMs = Date.now() - startTime;
      loggerService.system(`📋 [Google Tasks Sync] ${syncedCount} tarefas sincronizadas no MariaDB em ${durationMs}ms.`);
      return { success: true, count: syncedCount, durationMs };
    } catch (err: any) {
      loggerService.error('system', `Erro ao sincronizar tarefas no MariaDB: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Lista todas as tarefas persistidas no MariaDB (Resposta instantânea <2ms)
   */
  async getAllTasks(filter?: { status?: TaskStatus; category?: string }) {
    try {
      const count = await prisma.task.count();
      // Se a tabela estiver vazia, tenta uma sincronização inicial imediata
      if (count === 0) {
        await this.syncGoogleTasksToDatabase().catch(() => {});
      }

      const where: any = {};
      if (filter?.status) {
        where.status = filter.status;
      }
      if (filter?.category && filter.category !== 'ALL') {
        where.category = filter.category;
      }

      const tasks = await prisma.task.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      });

      return tasks.map((t) => ({
        id: t.id,
        googleTaskId: t.googleTaskId || t.id,
        title: t.title,
        description: t.description,
        dueDate: t.dueDate,
        status: t.status,
        priority: t.priority,
        category: t.category || 'Google Tasks',
        isGoogleTask: t.isGoogleTask,
        completedAt: t.completedAt,
        updatedAt: t.updatedAt,
      }));
    } catch (err: any) {
      loggerService.error('system', `Erro ao listar tarefas do banco de dados: ${err.message}`);
      return [];
    }
  }

  /**
   * Busca uma tarefa por ID (ou por googleTaskId)
   */
  async getTaskById(id: string) {
    const task = await prisma.task.findFirst({
      where: {
        OR: [{ id }, { googleTaskId: id }],
      },
    });

    if (task) {
      return {
        id: task.id,
        googleTaskId: task.googleTaskId || task.id,
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        status: task.status,
        priority: task.priority,
        category: task.category || 'Google Tasks',
        isGoogleTask: task.isGoogleTask,
        completedAt: task.completedAt,
        updatedAt: task.updatedAt,
      };
    }
    return null;
  }

  /**
   * Cria uma tarefa salvando no MariaDB e enviando para o Google Tasks
   */
  async createTask(data: CreateTaskDTO) {
    // 1. Cria primeiro no banco MariaDB local
    const local = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        priority: data.priority || TaskPriority.MEDIUM,
        category: data.category || 'Google Tasks',
        status: TaskStatus.PENDING,
        isGoogleTask: true,
      },
    });

    // 2. Tenta sincronizar com o Google Tasks
    try {
      const gRes = await googleService.createGoogleTask({
        title: data.title,
        description: data.description,
        dueDate: data.dueDate,
      });

      if (gRes.success && gRes.task?.id) {
        await prisma.task.update({
          where: { id: local.id },
          data: { googleTaskId: gRes.task.id },
        });
        loggerService.system(`✅ Tarefa criada no Google Tasks e salva no MariaDB: "${data.title}" (ID: ${gRes.task.id})`);
        return { ...local, googleTaskId: gRes.task.id };
      }
    } catch (err: any) {
      loggerService.error('system', `Aviso: Salvo no banco MariaDB, mas falhou ao enviar para Google Tasks: ${err.message}`);
    }

    return local;
  }

  /**
   * Atualiza ou marca como concluída no MariaDB e no Google Tasks
   */
  async updateTask(id: string, data: UpdateTaskDTO) {
    const existing = await prisma.task.findFirst({
      where: {
        OR: [{ id }, { googleTaskId: id }],
      },
    });

    if (!existing) {
      throw new Error(`Tarefa "${id}" não encontrada no banco de dados.`);
    }

    const updated = await prisma.task.update({
      where: { id: existing.id },
      data: {
        ...data,
        dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
        completedAt: data.status === TaskStatus.COMPLETED ? new Date() : data.status === TaskStatus.PENDING ? null : undefined,
      },
    });

    // Sincroniza alteração no Google Tasks
    const googleId = existing.googleTaskId || existing.id;
    try {
      await googleService.updateGoogleTask(googleId, {
        title: data.title,
        description: data.description,
        dueDate: data.dueDate,
        status: data.status,
      });
      loggerService.system(`🔄 Tarefa atualizada no MariaDB e no Google Tasks: "${updated.title}"`);
    } catch (err: any) {
      loggerService.error('system', `Aviso: Atualizada no MariaDB, mas falhou sincronização Google Tasks: ${err.message}`);
    }

    return updated;
  }

  /**
   * Deleta do MariaDB e do Google Tasks
   */
  async deleteTask(id: string) {
    const existing = await prisma.task.findFirst({
      where: {
        OR: [{ id }, { googleTaskId: id }],
      },
    });

    const googleId = existing?.googleTaskId || id;

    if (existing) {
      try {
        await prisma.task.delete({ where: { id: existing.id } });
      } catch {}
    }

    try {
      await googleService.deleteGoogleTask(googleId);
      loggerService.system(`🗑️ Tarefa removida do MariaDB e do Google Tasks: ${id}`);
    } catch (err: any) {
      loggerService.error('system', `Aviso: Erro ao remover do Google Tasks: ${err.message}`);
    }

    return { success: true };
  }
}

export const taskService = new TaskService();
