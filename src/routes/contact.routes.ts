import { FastifyInstance } from 'fastify';
import { contactService, PREDEFINED_ROLES } from '../services/contact.service.js';
import { loggerService } from '../services/logger.service.js';

export async function contactRoutes(app: FastifyInstance) {
  /**
   * Lista todos os cargos pré-definidos e suas permissões
   */
  app.get('/contacts/roles', async (req, reply) => {
    return reply.send({ success: true, data: PREDEFINED_ROLES });
  });

  /**
   * Lista todos os contatos autorizados
   */
  app.get('/contacts', async (req, reply) => {
    try {
      const contacts = await contactService.listContacts();
      return reply.send({ success: true, data: contacts });
    } catch (error: any) {
      loggerService.error('whatsapp', `Erro ao listar contatos: ${error.message}`);
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Cadastra um novo contato autorizado
   */
  app.post('/contacts', async (req, reply) => {
    try {
      const body = req.body as any;
      if (!body || !body.name || !body.phone) {
        return reply.status(400).send({
          success: false,
          error: 'Nome e Telefone são campos obrigatórios.',
        });
      }

      const contact = await contactService.createContact({
        name: body.name,
        phone: body.phone,
        role: body.role,
        isActive: body.isActive,
        briefing: body.briefing,
        notes: body.notes,
      });

      loggerService.whatsapp(`👤 Novo contato autorizado cadastrado: ${contact.name} (${contact.phone}) - Cargo: ${contact.role}`, null, 'success');
      return reply.status(201).send({ success: true, data: contact });
    } catch (error: any) {
      loggerService.error('whatsapp', `Erro ao criar contato: ${error.message}`);
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  /**
   * Atualiza dados de um contato autorizado
   */
  app.put('/contacts/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as any;

      const updated = await contactService.updateContact(id, body);
      loggerService.whatsapp(`✏️ Contato autorizado atualizado: ${updated.name} (${updated.phone}) - Cargo: ${updated.role}`, null, 'info');
      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      loggerService.error('whatsapp', `Erro ao atualizar contato: ${error.message}`);
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  /**
   * Alterna status ativo/bloqueado
   */
  app.patch('/contacts/:id/toggle', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const updated = await contactService.toggleActive(id);
      loggerService.whatsapp(`🔄 Status do contato ${updated.name} alterado para: ${updated.isActive ? 'ATIVO' : 'BLOQUEADO'}`, null, 'info');
      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      loggerService.error('whatsapp', `Erro ao alternar status do contato: ${error.message}`);
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  /**
   * Remove contato autorizado
   */
  app.delete('/contacts/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      await contactService.deleteContact(id);
      loggerService.whatsapp(`🗑️ Contato autorizado ID ${id} removido`, null, 'warn');
      return reply.send({ success: true, message: 'Contato removido com sucesso.' });
    } catch (error: any) {
      loggerService.error('whatsapp', `Erro ao remover contato: ${error.message}`);
      return reply.status(400).send({ success: false, error: error.message });
    }
  });
}
