import { prisma } from '../database/client.js';
import { TaskStatus, TaskPriority } from '@prisma/client';

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
  async getAllTasks(filter?: { status?: TaskStatus; category?: string }) {
    const where: any = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.category) where.category = filter.category;

    return prisma.task.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getTaskById(id: string) {
    return prisma.task.findUnique({ where: { id } });
  }

  async createTask(data: CreateTaskDTO) {
    return prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        priority: data.priority || TaskPriority.MEDIUM,
        category: data.category,
        status: TaskStatus.PENDING,
      },
    });
  }

  async updateTask(id: string, data: UpdateTaskDTO) {
    return prisma.task.update({
      where: { id },
      data: {
        ...data,
        dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
      },
    });
  }

  async deleteTask(id: string) {
    return prisma.task.delete({ where: { id } });
  }
}
