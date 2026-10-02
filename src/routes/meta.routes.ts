import { FastifyInstance } from 'fastify';
import { metaService } from '../services/meta.service.js';
import { loggerService } from '../services/logger.service.js';

function getMetaRedirectUri(req: any): string {
  if (process.env.META_REDIRECT_URI && process.env.META_REDIRECT_URI.trim().length > 0) {
    return process.env.META_REDIRECT_URI.trim();
  }
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers['host'];
  const proto = (forwardedProto || req.protocol || 'https').toString().split(',')[0].trim();
  const host = (forwardedHost || 'b-os.malves.dev.br').toString().split(',')[0].trim();
  return `${proto}://${host}/api/auth/meta/callback`;
}

export async function metaRoutes(app: FastifyInstance) {
  // ==========================================
  // 1. OAUTH 2.0 AUTOMÁTICO (META / FACEBOOK & INSTAGRAM)
  // ==========================================

  app.get('/auth/meta', async (req, reply) => {
    try {
      const query = req.query as any;
      const clientId = query?.clientId;
      const stateObj: any = {};
      if (clientId) stateObj.clientId = clientId;
      const state = Object.keys(stateObj).length > 0 ? Buffer.from(JSON.stringify(stateObj)).toString('base64') : undefined;

      const redirectUri = getMetaRedirectUri(req);
      const url = metaService.getMetaAuthUrl(redirectUri, state);
      return reply.redirect(url);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/auth/meta/url', async (req, reply) => {
    try {
      const query = req.query as any;
      const clientId = query?.clientId;
      const stateObj: any = {};
      if (clientId) stateObj.clientId = clientId;
      const state = Object.keys(stateObj).length > 0 ? Buffer.from(JSON.stringify(stateObj)).toString('base64') : undefined;

      const redirectUri = getMetaRedirectUri(req);
      const url = metaService.getMetaAuthUrl(redirectUri, state);
      return reply.send({ success: true, url });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/auth/meta/callback', async (req, reply) => {
    const query = req.query as any;
    const code = query?.code;
    const error = query?.error;
    const rawState = query?.state;

    let clientId: string | undefined;
    if (rawState) {
      try {
        const parsed = JSON.parse(Buffer.from(rawState, 'base64').toString('utf8'));
        clientId = parsed.clientId;
      } catch {
        // ignore
      }
    }

    if (error) {
      loggerService.error('system', `Erro retornado pelo Meta OAuth: ${error}`);
      return reply.redirect('/?tab=meta-business&meta=error&error=' + encodeURIComponent(error));
    }

    if (!code) {
      return reply.redirect('/?tab=meta-business&meta=missing_code');
    }

    try {
      const redirectUri = getMetaRedirectUri(req);
      const result = await metaService.handleMetaCallback(code, redirectUri);
      let redirectUrl = `/?tab=meta-business&meta=connected&profileId=${encodeURIComponent(result.profile.id)}&profile=${encodeURIComponent(result.profile.name)}`;
      if (clientId) {
        redirectUrl += `&clientId=${encodeURIComponent(clientId)}`;
      }
      return reply.redirect(redirectUrl);
    } catch (err: any) {
      loggerService.error('system', `Falha no callback da Meta: ${err.message}`);
      return reply.redirect('/?tab=meta-business&meta=failed&error=' + encodeURIComponent(err.message));
    }
  });

  app.get('/auth/instagram', async (req, reply) => {
    try {
      const query = req.query as any;
      const clientId = query?.clientId;
      const stateObj: any = {};
      if (clientId) stateObj.clientId = clientId;
      const state = Object.keys(stateObj).length > 0 ? Buffer.from(JSON.stringify(stateObj)).toString('base64') : undefined;

      const redirectUri = getMetaRedirectUri(req);
      const url = metaService.getInstagramAuthUrl(redirectUri, state);
      return reply.redirect(url);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/auth/instagram/callback', async (req, reply) => {
    const query = req.query as any;
    const code = query?.code;
    const error = query?.error;
    const rawState = query?.state;

    let clientId: string | undefined;
    if (rawState) {
      try {
        const parsed = JSON.parse(Buffer.from(rawState, 'base64').toString('utf8'));
        clientId = parsed.clientId;
      } catch {
        // ignore
      }
    }

    if (error) {
      return reply.redirect('/?tab=meta-business&meta=error&error=' + encodeURIComponent(error));
    }

    if (!code) {
      return reply.redirect('/?tab=meta-business&meta=missing_code');
    }

    try {
      const redirectUri = getMetaRedirectUri(req);
      const result = await metaService.handleMetaCallback(code, redirectUri, 'instagram');
      let redirectUrl = `/?tab=meta-business&meta=connected&provider=instagram&profileId=${encodeURIComponent(result.profile.id)}&profile=${encodeURIComponent(result.profile.name)}`;
      if (clientId) {
        redirectUrl += `&clientId=${encodeURIComponent(clientId)}`;
      }
      return reply.redirect(redirectUrl);
    } catch (err: any) {
      return reply.redirect('/?tab=meta-business&meta=failed&error=' + encodeURIComponent(err.message));
    }
  });

  // ==========================================
  // 2. PERFIS E DESCOBERTA DE ATIVOS
  // ==========================================

  app.get('/meta/profiles', async (_req, reply) => {
    try {
      const profiles = await metaService.listProfiles();
      return reply.send({ success: true, data: profiles });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.delete('/meta/profiles/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const result = await metaService.deleteProfile(id);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/meta/profiles/:id/assets', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const result = await metaService.discoverProfileAssets(id);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // ==========================================
  // 3. CLIENTES & ASSOCIAÇÃO DE ATIVOS
  // ==========================================

  app.get('/meta/clients', async (_req, reply) => {
    try {
      const clients = await metaService.listClients(true);
      return reply.send({ success: true, data: clients });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.post('/meta/clients', async (req, reply) => {
    try {
      const body = req.body as any;
      if (!body.profileId || !body.name) {
        return reply.status(400).send({
          success: false,
          error: 'Campos "profileId" e "name" são obrigatórios.',
        });
      }

      const result = await metaService.createClient({
        profileId: body.profileId,
        name: body.name,
        slug: body.slug,
        description: body.description,
        connectedAssets: body.connectedAssets,
        bmId: body.bmId,
        bmName: body.bmName,
        adAccountId: body.adAccountId,
        adAccountName: body.adAccountName,
        facebookPageId: body.facebookPageId,
        facebookPageName: body.facebookPageName,
        facebookPageToken: body.facebookPageToken,
        instagramAccountId: body.instagramAccountId,
        instagramUsername: body.instagramUsername,
        currency: body.currency,
        targetCpa: body.targetCpa ? parseFloat(body.targetCpa) : undefined,
        dailyBudgetLimit: body.dailyBudgetLimit ? parseFloat(body.dailyBudgetLimit) : undefined,
      });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.put('/meta/clients/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as any;
      const result = await metaService.updateClient(id, body);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.delete('/meta/clients/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const result = await metaService.deleteClient(id);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // ==========================================
  // 4. INSIGHTS E CAMPANHAS DO CLIENTE
  // ==========================================

  app.get('/meta/clients/:id/insights', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const query = req.query as any;
      const result = await metaService.getAdAccountInsights(id, {
        datePreset: query?.datePreset,
        timeRange: query?.since && query?.until ? { since: query.since, until: query.until } : undefined,
      });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/meta/clients/:id/campaign-insights', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const query = req.query as any;
      const result = await metaService.getCampaignInsights(id, {
        datePreset: query?.datePreset,
        timeRange: query?.since && query?.until ? { since: query.since, until: query.until } : undefined,
        limit: query?.limit ? parseInt(query.limit, 10) : 50,
      });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/meta/clients/:id/creative-insights', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const query = req.query as any;
      const result = await metaService.getCreativeInsights(id, {
        datePreset: query?.datePreset,
        timeRange: query?.since && query?.until ? { since: query.since, until: query.until } : undefined,
        campaignId: query?.campaignId,
        limit: query?.limit ? parseInt(query.limit, 10) : 50,
      });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/meta/clients/:id/campaigns', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const query = req.query as any;
      const result = await metaService.listCampaigns(id, {
        status: query?.status,
        limit: query?.limit ? parseInt(query.limit, 10) : 25,
      });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.post('/meta/clients/:id/campaigns/:campaignId/status', async (req, reply) => {
    try {
      const { id, campaignId } = req.params as { id: string; campaignId: string };
      const body = req.body as any;
      if (!body.status || !['ACTIVE', 'PAUSED'].includes(body.status)) {
        return reply.status(400).send({ success: false, error: 'Status deve ser "ACTIVE" ou "PAUSED".' });
      }
      const result = await metaService.updateCampaignStatus(id, campaignId, body.status);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.post('/meta/clients/:id/campaigns/:campaignId/budget', async (req, reply) => {
    try {
      const { id, campaignId } = req.params as { id: string; campaignId: string };
      const body = req.body as any;
      if (!body.dailyBudget || isNaN(parseFloat(body.dailyBudget))) {
        return reply.status(400).send({ success: false, error: 'Campo "dailyBudget" numérico é obrigatório.' });
      }
      const result = await metaService.updateCampaignBudget(id, campaignId, parseFloat(body.dailyBudget));
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/meta/clients/:id/adset-insights', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const query = req.query as any;
      const result = await metaService.getAdSetInsights(id, {
        datePreset: query?.datePreset,
        timeRange: query?.since && query?.until ? { since: query.since, until: query.until } : undefined,
        campaignId: query?.campaignId,
        limit: query?.limit ? parseInt(query.limit, 10) : 50,
      });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.post('/meta/clients/:id/adsets/:adsetId/status', async (req, reply) => {
    try {
      const { id, adsetId } = req.params as { id: string; adsetId: string };
      const body = req.body as any;
      if (!body.status || !['ACTIVE', 'PAUSED'].includes(body.status)) {
        return reply.status(400).send({ success: false, error: 'Status deve ser "ACTIVE" ou "PAUSED".' });
      }
      const result = await metaService.updateAdSetStatus(id, adsetId, body.status);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.post('/meta/clients/:id/adsets/:adsetId/budget', async (req, reply) => {
    try {
      const { id, adsetId } = req.params as { id: string; adsetId: string };
      const body = req.body as any;
      if (!body.dailyBudget || isNaN(parseFloat(body.dailyBudget))) {
        return reply.status(400).send({ success: false, error: 'Campo "dailyBudget" numérico é obrigatório.' });
      }
      const result = await metaService.updateAdSetBudget(id, adsetId, parseFloat(body.dailyBudget));
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // ==========================================
  // 5. CRIAÇÃO DE ANÚNCIOS, CONJUNTOS, CAMPANHAS E GESTÃO DE CRIATIVOS
  // ==========================================

  app.post('/meta/clients/:id/images', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as any;
      const result = await metaService.uploadAdImage(id, {
        url: body.url,
        base64: body.base64,
        filename: body.filename,
      });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/meta/clients/:id/images', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const query = req.query as any;
      const limit = query?.limit ? parseInt(query.limit, 10) : 30;
      const result = await metaService.listLibraryImages(id, limit);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.post('/meta/clients/:id/campaigns', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as any;
      if (!body.name) {
        return reply.status(400).send({ success: false, error: 'Campo "name" é obrigatório.' });
      }
      const result = await metaService.createCampaign(id, {
        name: body.name,
        objective: body.objective,
        status: body.status || 'PAUSED',
        dailyBudget: body.dailyBudget ? parseFloat(body.dailyBudget) : undefined,
        specialAdCategories: body.specialAdCategories,
      });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.post('/meta/clients/:id/adsets', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as any;
      if (!body.campaignId || !body.name || !body.dailyBudget) {
        return reply.status(400).send({
          success: false,
          error: 'Campos "campaignId", "name" e "dailyBudget" são obrigatórios.',
        });
      }
      const result = await metaService.createAdSet(id, {
        campaignId: body.campaignId,
        name: body.name,
        dailyBudget: parseFloat(body.dailyBudget),
        status: body.status || 'PAUSED',
        optimizationGoal: body.optimizationGoal,
        billingEvent: body.billingEvent,
        destinationType: body.destinationType,
        whatsappPhoneNumber: body.whatsappPhoneNumber,
        targeting: body.targeting,
      });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.post('/meta/clients/:id/ads', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as any;
      if (!body.adsetId || !body.name || !body.headline || !body.bodyText) {
        return reply.status(400).send({
          success: false,
          error: 'Campos "adsetId", "name", "headline" e "bodyText" são obrigatórios.',
        });
      }
      const result = await metaService.createAdCreativeAndAd(id, {
        adsetId: body.adsetId,
        name: body.name,
        headline: body.headline,
        bodyText: body.bodyText,
        imageHash: body.imageHash,
        imageUrl: body.imageUrl,
        instagramMediaId: body.instagramMediaId,
        callToActionType: body.callToActionType,
        websiteUrl: body.websiteUrl,
        status: body.status || 'PAUSED',
      });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.post('/meta/clients/:id/draft-campaign', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as any;
      if (!body.campaignName || !body.dailyBudget || !body.headline || !body.bodyText) {
        return reply.status(400).send({
          success: false,
          error: 'Campos "campaignName", "dailyBudget", "headline" e "bodyText" são obrigatórios.',
        });
      }
      const result = await metaService.createCompleteDraftCampaign(id, {
        campaignName: body.campaignName,
        objective: body.objective,
        adsetName: body.adsetName,
        adName: body.adName,
        dailyBudget: parseFloat(body.dailyBudget),
        headline: body.headline,
        bodyText: body.bodyText,
        imageHash: body.imageHash,
        imageUrl: body.imageUrl,
        imageBase64: body.imageBase64,
        instagramMediaId: body.instagramMediaId,
        targetAudienceDescription: body.targetAudienceDescription,
        destinationType: body.destinationType,
        whatsappPhoneNumber: body.whatsappPhoneNumber,
        websiteUrl: body.websiteUrl,
      });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/meta/clients/:id/whatsapp-numbers', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const result = await metaService.getWhatsAppPhoneNumbers(id);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/meta/clients/:id/diagnose', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const result = await metaService.diagnoseClient(id);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/meta/campaign-objectives-guide', async (_req, reply) => {
    try {
      const result = metaService.getCampaignObjectivesGuide();
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/meta/clients/:id/instagram-insights', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const query = req.query as any;
      const days = query?.days ? parseInt(query.days, 10) : undefined;
      const limitPosts = query?.limitPosts ? parseInt(query.limitPosts, 10) : undefined;
      const result = await metaService.getInstagramInsights(id, { days, limitPosts });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/meta/clients/:id/facebook-insights', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const query = req.query as any;
      const limitPosts = query?.limitPosts ? parseInt(query.limitPosts, 10) : undefined;
      const result = await metaService.getFacebookPageInsights(id, { limitPosts });
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  app.get('/meta/clients/:id/social-overview', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const result = await metaService.getSocialMediaOverview(id);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}


