import { FastifyInstance } from 'fastify';
import { skillService } from '../services/skill.service.js';

export async function skillRoutes(app: FastifyInstance) {
  /**
   * Listar todas as skills cadastradas
   */
  app.get('/skills', async (req, reply) => {
    try {
      let skills = await skillService.listAllSkills();
      if (skills.length < 17) {
        await skillService.seedDefaultSkills();
        skills = await skillService.listAllSkills();
      }
      return reply.send({ success: true, count: skills.length, skills });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Semear / atualizar catálogo de skills padrão
   */
  app.post('/skills/seed', async (req, reply) => {
    try {
      await skillService.seedDefaultSkills();
      const skills = await skillService.listAllSkills();
      return reply.send({ success: true, count: skills.length, skills });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Criar ou atualizar uma nova skill
   */
  app.post('/skills', async (req, reply) => {
    try {
      const body = req.body as any;
      if (!body.name || !body.displayName || !body.workflow) {
        return reply.status(400).send({
          success: false,
          error: 'Campos obrigatórios: name, displayName e workflow (array de passos).',
        });
      }

      const skill = await skillService.saveSkill(body);
      return reply.status(201).send({ success: true, skill });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Buscar uma skill específica com detalhes
   */
  app.get('/skills/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const skill = await skillService.getSkill(id);
      if (!skill) {
        return reply.status(404).send({ success: false, error: `Skill "${id}" não encontrada.` });
      }
      return reply.send({ success: true, skill });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Executar teste simulado (Dry-run) de uma skill
   */
  const handleDryRun = async (req: any, reply: any) => {
    const { id } = req.params as { id: string };
    try {
      const skill = await skillService.getSkill(id);
      if (!skill) {
        return reply.status(404).send({ success: false, error: `Skill "${id}" não encontrada.` });
      }

      const body = (req.body as any) || {};
      const result = await skillService.dryRunSkill(
        {
          name: skill.name,
          displayName: skill.displayName,
          description: skill.description,
          workflow: skill.workflow as any,
          parametersSchema: skill.parametersSchema as any,
        },
        body.sampleArgs || {},
        skill.id
      );

      return reply.send({ success: true, result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  app.post('/skills/:id/test', handleDryRun);
  app.post('/skills/:id/dry-run', handleDryRun);

  /**
   * Executar uma skill em produção
   */
  app.post('/skills/:id/run', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const body = (req.body as any) || {};
      const result = await skillService.executeSkill(id, body.inputArgs || {});
      return reply.send({ success: true, result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Alternar ativação da skill
   */
  app.patch('/skills/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const body = req.body as any;
      const skill = await skillService.toggleSkillStatus(id, body?.isActive);
      return reply.send({ success: true, skill });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Excluir uma skill
   */
  app.delete('/skills/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await skillService.deleteSkill(id);
      return reply.send({ success: true, message: `Skill ${id} removida com sucesso.` });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
