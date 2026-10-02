import { FastifyInstance } from 'fastify';
import { cronService } from '../services/cron.service.js';

export async function cronRoutes(app: FastifyInstance) {
  /**
   * Listar todos os jobs agendados
   */
  app.get('/cron/jobs', async (req, reply) => {
    try {
      const jobs = await cronService.listJobs();
      return reply.send({ success: true, count: jobs.length, jobs });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Criar um novo agendamento
   */
  app.post('/cron/jobs', async (req, reply) => {
    try {
      const body = req.body as any;
      if (!body.title || !body.cronExpr) {
        return reply.status(400).send({ success: false, error: 'Título (title) e horário/expressão (cronExpr) são obrigatórios.' });
      }

      const job = await cronService.createJob(body);
      return reply.send({ success: true, job });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Executar um job imediatamente para teste
   */
  app.post('/cron/jobs/:id/run', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const res = await cronService.executeJob(id, true);
      return reply.send(res);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Alternar ativação (pausar/retomar)
   */
  app.patch('/cron/jobs/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const body = req.body as any;
      const job = await cronService.toggleJob(id, body?.active);
      return reply.send({ success: true, job });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Excluir um agendamento
   */
  app.delete('/cron/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await cronService.deleteJob(id);
      return reply.send({ success: true, message: 'Agendamento excluído com sucesso.' });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
