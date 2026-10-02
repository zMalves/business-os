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
      const [klima, armor] = await Promise.all([
        klimaPartsService.getStoreOverview(1, days),
        klimaPartsService.getStoreOverview(2, days),
      ]);

      const kRev = klima.metrics?.total_revenue || 0;
      const kOrd = klima.metrics?.total_orders || 0;
      const aRev = armor.metrics?.total_revenue || 0;
      const aOrd = armor.metrics?.total_orders || 0;

      return reply.send({
        success: true,
        days,
        data: {
          total_amount: kRev + aRev,
          total_orders: kOrd + aOrd,
          klimaparts: {
            total_amount: kRev,
            total_orders: kOrd,
            metrics: klima.metrics || {},
            topSkus: klima.top_selling_skus || [],
          },
          armorcar: {
            total_amount: aRev,
            total_orders: aOrd,
            metrics: armor.metrics || {},
            topSkus: armor.top_selling_skus || [],
          },
        },
      });
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
      const data = await klimaPartsService.listPendingOrders(undefined, days);
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
      const [klimaQ, armorQ] = await Promise.all([
        klimaPartsService.getUnansweredQuestions(1),
        klimaPartsService.getUnansweredQuestions(2),
      ]);
      const questions = [
        ...(Array.isArray(klimaQ?.questions) ? klimaQ.questions.map((q: any) => ({ ...q, store: 'KlimaParts' })) : []),
        ...(Array.isArray(armorQ?.questions) ? armorQ.questions.map((q: any) => ({ ...q, store: 'ArmorCar' })) : []),
      ];
      return reply.send({ success: true, data: { total: questions.length, questions } });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
