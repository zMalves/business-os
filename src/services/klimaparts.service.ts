import { prisma } from '../database/client.js';
import { loggerService } from './logger.service.js';

export interface KlimaPartsOrder {
  order_id: string;
  date_created: string;
  status: string;
  dispatch_status?: string;
  shipping_id?: string;
  total_amount?: number;
  buyer_name?: string;
  buyer_nickname?: string;
  items: Array<{
    id?: string;
    sku: string;
    title: string;
    quantity: number;
    unit_price?: number;
  }>;
}

export class KlimaPartsService {
  private apiUrl: string;
  private patToken: string;
  private defaultStoreId: number;

  constructor() {
    this.apiUrl = (process.env.KLIMAPARTS_API_URL || 'https://api.malves.dev.br/klimaparts').replace(/\/$/, '');
    this.patToken = process.env.KLIMAPARTS_PAT_TOKEN || 'KP-PAT-PROD-234d97c3b74b6cff0bef74bd1d02a432a28c68ad32df62c6';
    this.defaultStoreId = parseInt(process.env.KLIMAPARTS_DEFAULT_STORE_ID || '1', 10);
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.patToken}`,
      'X-MCP-Token': this.patToken,
      'X-Agent-Name': 'Victoria-Business-OS',
    };
  }

  /**
   * Faz a requisição HTTP bruta para a API MCP da loja
   */
  async fetchStoreOverviewFromApi(storeId: number, days: number = 30) {
    try {
      const endpoint = `${this.apiUrl}/api/mcp/v1/sales.php?action=summary&store_id=${storeId}&days=${days}`;
      const response = await fetch(endpoint, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const json = (await response.json()) as any;
        return { success: true, store_id: storeId, ...json };
      }

      const errText = await response.text();
      return {
        success: false,
        store_id: storeId,
        error: `HTTP ${response.status}: ${errText}`,
        message: 'Não foi possível consultar a visão geral da loja no momento.',
      };
    } catch (error: any) {
      return {
        success: false,
        store_id: storeId,
        error: error.message,
        message: 'Não foi possível consultar a visão geral da loja no momento.',
      };
    }
  }

  /**
   * Sincroniza todas as informações das lojas do Mercado Livre (KlimaParts + ArmorCar)
   * direto no banco de dados MariaDB (tabela mercadolivre_store_cache)
   */
  async syncAllStoresDataToDatabase() {
    const startTime = Date.now();
    const stores = [
      { id: 1, name: 'KlimaParts' },
      { id: 2, name: 'ArmorCar' },
    ];
    const periods = [
      { days: 1, key: 'today' },
      { days: 7, key: '7' },
      { days: 30, key: '30' },
    ];

    let syncedCount = 0;
    const errors: string[] = [];

    for (const store of stores) {
      // 1. Busca perguntas pendentes para a loja
      let questionsRes: any = null;
      try {
        questionsRes = await this.fetchUnansweredQuestionsFromApi(store.id);
      } catch (qErr: any) {
        questionsRes = { count: 0, questions: [] };
      }

      // 2. Sincroniza cada período (Hoje, 7 dias, 30 dias)
      for (const p of periods) {
        try {
          const apiRes = await this.fetchStoreOverviewFromApi(store.id, p.days);
          if (apiRes.success) {
            const metrics = apiRes.metrics || {};
            const topSkus = apiRes.top_selling_skus || [];
            const pendingOrders = metrics.total_orders || 0;

            await prisma.mercadoLivreStoreCache.upsert({
              where: {
                storeId_period: {
                  storeId: store.id,
                  period: p.key,
                },
              },
              update: {
                storeName: store.name,
                totalRevenue: Number(metrics.total_revenue || 0),
                totalNetProfit: Number(metrics.total_net_profit || 0),
                averageMarginPerc: Number(metrics.average_margin_perc || 0),
                totalOrders: Number(metrics.total_orders || 0),
                averageTicket: Number(metrics.average_ticket || 0),
                topSellingSkus: topSkus as any,
                pendingOrdersCount: pendingOrders,
                pendingQuestionsCount: questionsRes?.count || 0,
                pendingQuestions: (questionsRes?.questions || []) as any,
                rawMetrics: apiRes as any,
                lastSyncAt: new Date(),
              },
              create: {
                storeId: store.id,
                storeName: store.name,
                period: p.key,
                totalRevenue: Number(metrics.total_revenue || 0),
                totalNetProfit: Number(metrics.total_net_profit || 0),
                averageMarginPerc: Number(metrics.average_margin_perc || 0),
                totalOrders: Number(metrics.total_orders || 0),
                averageTicket: Number(metrics.average_ticket || 0),
                topSellingSkus: topSkus as any,
                pendingOrdersCount: pendingOrders,
                pendingQuestionsCount: questionsRes?.count || 0,
                pendingQuestions: (questionsRes?.questions || []) as any,
                rawMetrics: apiRes as any,
                lastSyncAt: new Date(),
              },
            });
            syncedCount++;
          } else {
            errors.push(`${store.name} (${p.key}): ${apiRes.error || apiRes.message}`);
          }
        } catch (syncErr: any) {
          errors.push(`${store.name} (${p.key}): ${syncErr.message}`);
        }
      }
    }

    const durationMs = Date.now() - startTime;
    loggerService.system(
      `📦 [Mercado Livre Sync] Sincronização concluída em ${durationMs}ms: ${syncedCount} períodos/lojas salvos no MariaDB.`
    );

    return {
      success: errors.length === 0 || syncedCount > 0,
      syncedCount,
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Obtém a visão geral executiva e métricas de vendas da loja (KlimaParts = 1, ArmorCar = 2).
   * Lê diretamente do cache do banco de dados MariaDB em <2ms.
   */
  async getStoreOverview(storeId: number = this.defaultStoreId, days: number = 30, forceRefresh: boolean = false) {
    const periodKey = days === 1 ? 'today' : String(days);

    if (!forceRefresh) {
      try {
        const cached = await prisma.mercadoLivreStoreCache.findUnique({
          where: {
            storeId_period: {
              storeId,
              period: periodKey,
            },
          },
        });

        if (cached) {
          return {
            success: true,
            store_id: storeId,
            store_name: cached.storeName,
            metrics: {
              total_revenue: cached.totalRevenue,
              total_net_profit: cached.totalNetProfit,
              average_margin_perc: cached.averageMarginPerc,
              total_orders: cached.totalOrders,
              average_ticket: cached.averageTicket,
            },
            top_selling_skus: (cached.topSellingSkus as any) || [],
            cached: true,
            lastSyncAt: cached.lastSyncAt,
          };
        }
      } catch (dbErr: any) {
        loggerService.error('system', `[KlimaPartsService] Erro ao consultar cache local: ${dbErr.message}`);
      }
    }

    // Se não estiver no cache ou se forçar atualização, consulta a API e salva no banco
    const apiRes = await this.fetchStoreOverviewFromApi(storeId, days);
    if (apiRes.success) {
      const storeName = storeId === 2 ? 'ArmorCar' : 'KlimaParts';
      const metrics = apiRes.metrics || {};
      prisma.mercadoLivreStoreCache
        .upsert({
          where: {
            storeId_period: {
              storeId,
              period: periodKey,
            },
          },
          update: {
            storeName,
            totalRevenue: Number(metrics.total_revenue || 0),
            totalNetProfit: Number(metrics.total_net_profit || 0),
            averageMarginPerc: Number(metrics.average_margin_perc || 0),
            totalOrders: Number(metrics.total_orders || 0),
            averageTicket: Number(metrics.average_ticket || 0),
            topSellingSkus: (apiRes.top_selling_skus || []) as any,
            rawMetrics: apiRes as any,
            lastSyncAt: new Date(),
          },
          create: {
            storeId,
            storeName,
            period: periodKey,
            totalRevenue: Number(metrics.total_revenue || 0),
            totalNetProfit: Number(metrics.total_net_profit || 0),
            averageMarginPerc: Number(metrics.average_margin_perc || 0),
            totalOrders: Number(metrics.total_orders || 0),
            averageTicket: Number(metrics.average_ticket || 0),
            topSellingSkus: (apiRes.top_selling_skus || []) as any,
            rawMetrics: apiRes as any,
            lastSyncAt: new Date(),
          },
        })
        .catch(() => {});
    }
    return apiRes;
  }

  /**
   * Gera um resumo executivo formatado de vendas e métricas da loja sem gastar tokens de IA (Custo Zero)
   */
  async getFormattedStoreSummary(storeId: number = this.defaultStoreId, days: number = 30): Promise<string> {
    const data = await this.getStoreOverview(storeId, days);
    const storeName = storeId === 2 ? 'ARMORCAR' : 'KLIMAPARTS';

    if (!data.success) {
      return `⚠️ *${storeName} - Resumo (${days === 1 ? 'Hoje' : `${days} dias`})*\n\nNão foi possível obter os dados da loja no momento: ${data.error || data.message}`;
    }

    const metrics = data.metrics || {};
    const topSkus = data.top_selling_skus || [];

    const formatCurrency = (val: number = 0) =>
      Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const totalRevenue = formatCurrency(metrics.total_revenue || 0);
    const netProfit = formatCurrency(metrics.total_net_profit || 0);
    const avgMargin = Number(metrics.average_margin_perc || 0).toFixed(2).replace('.', ',');
    const totalOrders = metrics.total_orders || 0;
    const avgTicket = formatCurrency(metrics.average_ticket || 0);

    let skusSection = '';
    if (topSkus.length > 0) {
      const skuLines = topSkus.slice(0, 5).map((item: any) => {
        const title = item.title ? `\n  _${item.title.length > 45 ? item.title.slice(0, 42) + '...' : item.title}_` : '';
        return `• *${item.sku}* (${item.units_sold} un) — ${formatCurrency(item.gross_revenue)}${title}`;
      });
      skusSection = `\n\n🏆 *Top Produtos Mais Vendidos:*\n${skuLines.join('\n')}`;
    }

    const periodLabel = days === 1 ? 'HOJE' : `ÚLTIMOS ${days} DIAS`;

    return `📊 *RESUMO EXECUTIVO - ${storeName} (${periodLabel})*

💰 *Faturamento Bruto:* ${totalRevenue}
💵 *Lucro Líquido:* ${netProfit}
📈 *Margem Média:* ${avgMargin}%
📦 *Total de Pedidos:* ${totalOrders} pedido(s)
🎯 *Ticket Médio:* ${avgTicket}${skusSection}`;
  }

  /**
   * Gera um resumo executivo unificado das 2 lojas (KlimaParts + ArmorCar) sem gastar tokens de IA
   */
  async getFormattedCombinedStoresSummary(days: number = 30): Promise<string> {
    const [klimaRes, armorRes] = await Promise.all([
      this.getStoreOverview(1, days),
      this.getStoreOverview(2, days),
    ]);

    const formatCurrency = (val: number = 0) =>
      Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const kMetrics = klimaRes?.metrics || {};
    const aMetrics = armorRes?.metrics || {};

    const kRev = Number(kMetrics.total_revenue || 0);
    const kProfit = Number(kMetrics.total_net_profit || 0);
    const kOrders = Number(kMetrics.total_orders || 0);
    const kMargin = Number(kMetrics.average_margin_perc || 0).toFixed(2).replace('.', ',');
    const kTicket = formatCurrency(kMetrics.average_ticket || 0);

    const aRev = Number(aMetrics.total_revenue || 0);
    const aProfit = Number(aMetrics.total_net_profit || 0);
    const aOrders = Number(aMetrics.total_orders || 0);
    const aMargin = Number(aMetrics.average_margin_perc || 0).toFixed(2).replace('.', ',');
    const aTicket = formatCurrency(aMetrics.average_ticket || 0);

    const totalRev = kRev + aRev;
    const totalProfit = kProfit + aProfit;
    const totalOrders = kOrders + aOrders;
    const totalMargin = totalRev > 0 ? ((totalProfit / totalRev) * 100).toFixed(2).replace('.', ',') : '0,00';
    const totalTicket = totalOrders > 0 ? formatCurrency(totalRev / totalOrders) : formatCurrency(0);

    const periodLabel = days === 1 ? 'HOJE' : `ÚLTIMOS ${days} DIAS`;

    // Top SKUs de cada loja
    const kTop = (klimaRes?.top_selling_skus || []).slice(0, 3);
    const aTop = (armorRes?.top_selling_skus || []).slice(0, 3);

    let kSkusText = '';
    if (kTop.length > 0) {
      kSkusText = `\n  _Top: ${kTop.map((t: any) => `${t.sku} (${t.units_sold}un)`).join(', ')}_`;
    }

    let aSkusText = '';
    if (aTop.length > 0) {
      aSkusText = `\n  _Top: ${aTop.map((t: any) => `${t.sku} (${t.units_sold}un)`).join(', ')}_`;
    }

    return `📊 *RESUMO CONSOLIDADO - 2 LOJAS (${periodLabel})*

📦 *1. KLIMAPARTS:*
• *Faturamento:* ${formatCurrency(kRev)} | *Lucro:* ${formatCurrency(kProfit)} (${kMargin}%)
• *Pedidos:* ${kOrders} | *Ticket Médio:* ${kTicket}${kSkusText}

🛡️ *2. ARMORCAR:*
• *Faturamento:* ${formatCurrency(aRev)} | *Lucro:* ${formatCurrency(aProfit)} (${aMargin}%)
• *Pedidos:* ${aOrders} | *Ticket Médio:* ${aTicket}${aSkusText}

━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL COMBINADO (2 LOJAS):*
• *Faturamento Geral:* ${formatCurrency(totalRev)}
• *Lucro Líquido Geral:* ${formatCurrency(totalProfit)}
• *Margem Geral:* ${totalMargin}%
• *Total de Pedidos:* ${totalOrders} pedido(s)
• *Ticket Médio Geral:* ${totalTicket}`;
  }

  /**
   * Consulta e formata perguntas de clientes pendentes de resposta no Mercado Livre (0 Tokens)
   */
  async getFormattedQuestionsSummary(): Promise<string> {
    const [klimaQ, armorQ] = await Promise.all([
      this.getUnansweredQuestions(1),
      this.getUnansweredQuestions(2),
    ]);

    const klimaList: any[] = Array.isArray(klimaQ?.questions) ? klimaQ.questions : [];
    const armorList: any[] = Array.isArray(armorQ?.questions) ? armorQ.questions : [];

    const totalQuestions = klimaList.length + armorList.length;

    if (totalQuestions === 0 && (klimaQ.success || armorQ.success)) {
      return `💬 *PERGUNTAS PENDENTES - MERCADO LIVRE*\n\nNenhuma pergunta pendente no momento nas duas lojas! 🎉\nTodas as mensagens de clientes estão respondidas.`;
    }

    if (!klimaQ.success && !armorQ.success) {
      return `💬 *PERGUNTAS PENDENTES - MERCADO LIVRE*\n\n⚠️ O módulo de perguntas das lojas está temporariamente em manutenção ou sincronização com o Mercado Livre.\nAssim que o endpoint restabelecer a listagem completa, os dados serão exibidos aqui.`;
    }

    const lines: string[] = [];

    if (klimaList.length > 0) {
      lines.push(`📦 *KLIMAPARTS (${klimaList.length} pendente(s)):*`);
      klimaList.slice(0, 5).forEach((q: any, i: number) => {
        lines.push(`${i + 1}. *Item:* ${q.item_title || q.item_id || 'Anúncio'}\n   *Pergunta:* "${q.text || q.question || 'Sem texto'}"\n   *Comprador:* ${q.from_nickname || 'Cliente'}`);
      });
    } else {
      lines.push(`📦 *KLIMAPARTS:* Nenhuma pergunta pendente.`);
    }

    lines.push('');

    if (armorList.length > 0) {
      lines.push(`🛡️ *ARMORCAR (${armorList.length} pendente(s)):*`);
      armorList.slice(0, 5).forEach((q: any, i: number) => {
        lines.push(`${i + 1}. *Item:* ${q.item_title || q.item_id || 'Anúncio'}\n   *Pergunta:* "${q.text || q.question || 'Sem texto'}"\n   *Comprador:* ${q.from_nickname || 'Cliente'}`);
      });
    } else {
      lines.push(`🛡️ *ARMORCAR:* Nenhuma pergunta pendente.`);
    }

    return `💬 *PERGUNTAS PENDENTES - MERCADO LIVRE*\n\n${lines.join('\n')}`;
  }

  /**
   * Consulta e formata os envios e pedidos pendentes de expedição/despacho (0 Tokens)
   */
  async getFormattedShipmentsSummary(days: number = 1): Promise<string> {
    const [klimaRes, armorRes] = await Promise.all([
      this.getStoreOverview(1, days),
      this.getStoreOverview(2, days),
    ]);

    const formatCurrency = (val: number = 0) =>
      Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const kOrders = Number(klimaRes?.metrics?.total_orders || 0);
    const aOrders = Number(armorRes?.metrics?.total_orders || 0);
    const totalOrders = kOrders + aOrders;

    const periodLabel = days === 1 ? 'HOJE' : `ÚLTIMOS ${days} DIAS`;

    if (totalOrders === 0 && (klimaRes.success || armorRes.success)) {
      return `📦 *ENVIOS E PEDIDOS (${periodLabel})*\n\nNenhum novo pedido ou envio registrado no momento nas duas lojas (KlimaParts e ArmorCar). 🎉\nTudo em dia!`;
    }

    const lines: string[] = [`📦 *ENVIOS E PEDIDOS PENDENTES (${periodLabel})*`];

    if (kOrders > 0) {
      const kRev = formatCurrency(klimaRes.metrics?.total_revenue || 0);
      lines.push(`\n📦 *1. KLIMAPARTS (${kOrders} pedido(s) — Total: ${kRev}):*`);
      const skus = klimaRes.top_selling_skus || [];
      skus.forEach((item: any, i: number) => {
        lines.push(`  ${i + 1}. *SKU:* \`${item.sku}\` (${item.units_sold} un) — ${formatCurrency(item.gross_revenue)}${item.title ? `\n     _${item.title}_` : ''}`);
      });
    } else {
      lines.push(`\n📦 *1. KLIMAPARTS:* Nenhum pedido registrado.`);
    }

    if (aOrders > 0) {
      const aRev = formatCurrency(armorRes.metrics?.total_revenue || 0);
      lines.push(`\n🛡️ *2. ARMORCAR (${aOrders} pedido(s) — Total: ${aRev}):*`);
      const skus = armorRes.top_selling_skus || [];
      skus.forEach((item: any, i: number) => {
        lines.push(`  ${i + 1}. *SKU:* \`${item.sku}\` (${item.units_sold} un) — ${formatCurrency(item.gross_revenue)}${item.title ? `\n     _${item.title}_` : ''}`);
      });
    } else {
      lines.push(`\n🛡️ *2. ARMORCAR:* Nenhum pedido registrado.`);
    }

    lines.push(`\n━━━━━━━━━━━━━━━━━━━━\n🚚 *Total de Pedidos a Despachar:* ${totalOrders} pedido(s)`);

    return lines.join('\n');
  }

  /**
   * Lista pedidos pendentes de envio e expedição da loja
   */
  async listPendingOrders(storeId?: number, days: number = 1) {
    try {
      if (storeId && (storeId === 1 || storeId === 2)) {
        const res = await this.getStoreOverview(storeId, days);
        const storeName = storeId === 2 ? 'ArmorCar' : 'KlimaParts';
        const ordersCount = res.metrics?.total_orders || 0;
        return {
          success: true,
          storeId,
          storeName,
          days,
          count: ordersCount,
          totalRevenue: res.metrics?.total_revenue || 0,
          itemsToDispatch: res.top_selling_skus || [],
          message: `${ordersCount} pedido(s) registrado(s) na ${storeName} nos últimos ${days} dia(s).`,
        };
      }

      // Se storeId não for informado ou for 0, consulta ambas as lojas
      const [klimaRes, armorRes] = await Promise.all([
        this.getStoreOverview(1, days),
        this.getStoreOverview(2, days),
      ]);

      const kCount = klimaRes.metrics?.total_orders || 0;
      const aCount = armorRes.metrics?.total_orders || 0;
      const total = kCount + aCount;

      return {
        success: true,
        days,
        totalOrders: total,
        klimaParts: {
          count: kCount,
          totalRevenue: klimaRes.metrics?.total_revenue || 0,
          items: klimaRes.top_selling_skus || [],
        },
        armorCar: {
          count: aCount,
          totalRevenue: armorRes.metrics?.total_revenue || 0,
          items: armorRes.top_selling_skus || [],
        },
        summaryText: await this.getFormattedShipmentsSummary(days),
      };
    } catch (error: any) {
      loggerService.error('system', `Erro ao listar pedidos pendentes: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: 'Erro ao consultar pedidos pendentes das lojas.',
      };
    }
  }

  /**
   * Consulta perguntas de clientes pendentes de resposta no Mercado Livre
   */
  async fetchUnansweredQuestionsFromApi(storeId: number = this.defaultStoreId) {
    try {
      const endpoint = `${this.apiUrl}/api/mcp/v1/questions.php?action=unanswered&store_id=${storeId}`;
      const response = await fetch(endpoint, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const json = (await response.json()) as any;
        return {
          success: true,
          store_id: storeId,
          count: json.total_pending ?? json.questions?.length ?? 0,
          questions: json.questions || [],
        };
      }

      const errText = await response.text();
      return {
        success: false,
        store_id: storeId,
        error: `HTTP ${response.status}: ${errText}`,
        message: 'Não foi possível consultar as perguntas no momento.',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: 'Erro ao consultar perguntas pendentes da KlimaParts.',
      };
    }
  }

  /**
   * Consulta perguntas de clientes pendentes de resposta no Mercado Livre (lê do banco de dados)
   */
  async getUnansweredQuestions(storeId: number = this.defaultStoreId, forceRefresh: boolean = false) {
    if (!forceRefresh) {
      try {
        const cached = await prisma.mercadoLivreStoreCache.findUnique({
          where: {
            storeId_period: {
              storeId,
              period: 'today',
            },
          },
        });

        if (cached && Array.isArray(cached.pendingQuestions)) {
          return {
            success: true,
            store_id: storeId,
            count: cached.pendingQuestionsCount,
            questions: cached.pendingQuestions,
            cached: true,
            lastSyncAt: cached.lastSyncAt,
          };
        }
      } catch (err: any) {
        // fallback to api
      }
    }

    return this.fetchUnansweredQuestionsFromApi(storeId);
  }

  /**
   * Pesquisa anúncios no catálogo (preço, estoque, SKU, lucro, margem)
   */
  async searchAds(searchTerm: string, storeId: number = this.defaultStoreId) {
    try {
      const endpoint = `${this.apiUrl}/api/mcp/v1/ads.php?action=search&q=${encodeURIComponent(searchTerm)}&store_id=${storeId}`;
      const response = await fetch(endpoint, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const json = (await response.json()) as any;
        return {
          success: true,
          store_id: storeId,
          total_found: json.total_found ?? json.ads?.length ?? 0,
          ads: json.ads || [],
        };
      }

      const errText = await response.text();
      return {
        success: false,
        store_id: storeId,
        error: `HTTP ${response.status}: ${errText}`,
        message: `Erro ao pesquisar anúncios para "${searchTerm}".`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Erro ao pesquisar anúncios para "${searchTerm}".`,
      };
    }
  }

  /**
   * Formata uma mensagem executiva de pedido de compra para envio ao fornecedor via WhatsApp
   */
  formatPurchaseOrder(params: {
    sku: string;
    productTitle?: string;
    quantity: number;
    carModel?: string;
    supplierName?: string;
    orderId?: string;
  }): string {
    const qty = params.quantity || 1;
    return `📦 *PEDIDO DE COMPRA - KLIMAPARTS*

Olá! Segue pedido para faturamento e despacho:

• *Código / SKU:* ${params.sku}
• *Quantidade:* ${qty} unidade(s)${params.orderId ? `\n• *Ref. Pedido:* #${params.orderId}` : ''}

Por favor, confirmar disponibilidade e previsão de postagem.`;
  }
}

export const klimaPartsService = new KlimaPartsService();

