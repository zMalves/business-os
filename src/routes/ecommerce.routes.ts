import { FastifyInstance } from 'fastify';
import { klimaPartsService } from '../services/klimaparts.service.js';

export async function ecommerceRoutes(app: FastifyInstance) {
  /**
   * Resumo consolidado das 2 lojas (KlimaParts + ArmorCar)
   */
  app.get('/ecommerce/overview', async (req, reply) => {
    try {
      const query = req.query as any;
      const days = parseInt(query?.days || '1', 10);
      const data = await klimaPartsService.getConsolidatedReport(days);
      return reply.send({ success: true, days, data });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Detalhes de uma loja específica (1 = KlimaParts, 2 = ArmorCar)
   */
  app.get('/ecommerce/store/:storeId', async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const query = req.query as any;
    const days = parseInt(query?.days || '30', 10);
    try {
      const data = await klimaPartsService.getStoreOverview(parseInt(storeId, 10), days);
      return reply.send({ success: true, storeId, days, data });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Pedidos / Envios pendentes de despacho
   */
  app.get('/ecommerce/orders/pending', async (req, reply) => {
    try {
      const query = req.query as any;
      const days = parseInt(query?.days || '1', 10);
      const data = await klimaPartsService.getPendingOrders(days);
      return reply.send({ success: true, days, data });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Perguntas e dúvidas pendentes do Mercado Livre
   */
  app.get('/ecommerce/questions/pending', async (req, reply) => {
    try {
      const data = await klimaPartsService.getQuestions();
      return reply.send({ success: true, data });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
