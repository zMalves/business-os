import { prisma } from '../database/client.js';
import { loggerService } from './logger.service.js';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export const META_SCOPES = [
  'ads_read',
  'ads_management',
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_manage_insights',
  'public_profile',
  'email',
];

export interface CreateMetaClientInput {
  profileId?: string;
  name: string;
  slug?: string;
  description?: string;
  connectedAssets?: string[]; // ['ad_account', 'instagram', 'facebook']
  bmId?: string;
  bmName?: string;
  adAccountId?: string;
  adAccountName?: string;
  facebookPageId?: string;
  facebookPageName?: string;
  facebookPageToken?: string;
  instagramAccountId?: string;
  instagramUsername?: string;
  currency?: string;
  targetCpa?: number;
  dailyBudgetLimit?: number;
}

export class MetaService {
  private appId: string;
  private appSecret: string;
  private defaultRedirectUri: string;

  constructor() {
    this.appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || '';
    this.appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '';

    if (!this.appId || !this.appSecret) {
      loggerService.system('⚠️ [MetaService] META_APP_ID ou META_APP_SECRET não definidos no .env. Funcionalidades da Meta ficarão desabilitadas até serem preenchidas.');
    }

    const envRedirect = process.env.META_REDIRECT_URI;
    this.defaultRedirectUri =
      envRedirect && !envRedirect.includes('secretary.malves.dev.br')
        ? envRedirect
        : `${(process.env.WEBHOOK_BASE_URL || 'https://b-os.malves.dev.br').replace(/\/$/, '')}/api/auth/meta/callback`;
  }

  private ensureConfigured(): void {
    const appId = this.appId || process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
    const appSecret = this.appSecret || process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error(
        '[MetaService] META_APP_ID e META_APP_SECRET são obrigatórios. ' +
        'Defina-os no arquivo .env do servidor.'
      );
    }
    this.appId = appId;
    this.appSecret = appSecret;
  }


  /**
   * Helper para formatar o ID da conta de anúncios (garante 'act_')
   */
  private formatAdAccountId(adAccountId?: string | null): string | undefined {
    if (!adAccountId) return undefined;
    const clean = adAccountId.trim().replace(/^act_/, '');
    return `act_${clean}`;
  }

  /**
   * Helper para gerar slug único
   */
  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Helper para formatar mensagens de erro detalhadas da Meta Graph API
   */
  private formatMetaError(err: any): string {
    if (!err) return 'Erro desconhecido na Meta Graph API.';
    const detail = err.error_user_msg || err.error_user_title || err.message || JSON.stringify(err);
    const subcode = err.error_subcode ? ` (Subcode: ${err.error_subcode})` : '';
    const code = err.code ? ` [#${err.code}]` : '';
    const blame = err.blame_field_specs ? ` [Campos: ${JSON.stringify(err.blame_field_specs)}]` : '';
    return `${detail}${subcode}${code}${blame}`;
  }

  /**
   * Helper para extrair métricas de conversão e resultados (Leads, Mensagens/WhatsApp, Compras, Contatos)
   * sem perdas de conversões de campanhas de Mensagens/WhatsApp nem contagem duplicada.
   */
  private parseMetaActions(actions?: any[]) {
    let messaging = 0;
    let formLeads = 0;
    let contactLeads = 0;
    let completeReg = 0;
    let purchases = 0;

    if (Array.isArray(actions)) {
      for (const act of actions) {
        const type = act.action_type || '';
        const val = parseInt(act.value, 10) || 0;

        // 1. Mensagens / Conversas de WhatsApp / Direct / Messenger iniciadas
        if (
          [
            'onsite_conversion.messaging_conversation_started_7d',
            'onsite_conversion.total_messaging_connection',
            'onsite_conversion.messaging_first_reply',
            'onsite_conversion.messaging_user_initiated',
            'messaging_conversation_started_7d',
          ].includes(type)
        ) {
          if (val > messaging) {
            messaging = val;
          }
        }

        // 2. Leads de Formulário Instantâneo / Cadastros Nativos / Pixel Lead
        if (
          [
            'lead',
            'leadgen_grouped',
            'onsite_conversion.lead_grouped',
            'onsite_conversion.lead',
            'offsite_conversion.fb_pixel_lead',
          ].includes(type)
        ) {
          if (val > formLeads) {
            formLeads = val;
          }
        }

        // 3. Contatos totais
        if (
          [
            'contact',
            'contact_total',
            'onsite_conversion.contact_total',
            'offsite_conversion.fb_pixel_contact',
          ].includes(type)
        ) {
          if (val > contactLeads) {
            contactLeads = val;
          }
        }

        // 4. Cadastros Completos
        if (
          [
            'complete_registration',
            'omni_complete_registration',
            'onsite_conversion.complete_registration',
            'offsite_conversion.fb_pixel_complete_registration',
          ].includes(type)
        ) {
          if (val > completeReg) {
            completeReg = val;
          }
        }

        // 5. Compras / Conversões de E-commerce
        if (
          [
            'purchase',
            'omni_purchase',
            'onsite_conversion.purchase',
            'offsite_conversion.fb_pixel_purchase',
          ].includes(type)
        ) {
          if (val > purchases) {
            purchases = val;
          }
        }
      }
    }

    // Calcula o total de resultados/leads:
    // Se a campanha for de mensagens (WhatsApp), messaging é o resultado principal.
    // Se não houver mensagens mas houver formLeads ou contactLeads, usa formLeads / contactLeads.
    let totalLeads = 0;
    if (messaging > 0) {
      totalLeads = messaging;
      if (formLeads > 0 && formLeads !== messaging) {
        totalLeads += formLeads;
      }
    } else if (formLeads > 0) {
      totalLeads = formLeads;
    } else if (contactLeads > 0) {
      totalLeads = contactLeads;
    } else if (completeReg > 0) {
      totalLeads = completeReg;
    }

    return {
      leads: totalLeads,
      messaging,
      formLeads,
      contactLeads,
      completeReg,
      purchases,
    };
  }

  // =========================================================================
  // 1. OAUTH 2.0 AUTOMÁTICO (META / FACEBOOK LOGIN)
  // =========================================================================

  getMetaAuthUrl(redirectUri?: string, state?: string): string {
    this.ensureConfigured();
    const targetRedirect = redirectUri || this.defaultRedirectUri;
    const scopeStr = encodeURIComponent(META_SCOPES.join(','));
    let url = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?client_id=${this.appId}&redirect_uri=${encodeURIComponent(targetRedirect)}&scope=${scopeStr}&response_type=code`;
    if (state) {
      url += `&state=${encodeURIComponent(state)}`;
    }
    return url;
  }

  getInstagramAuthUrl(redirectUri?: string, state?: string): string {
    this.ensureConfigured();
    const targetRedirect = redirectUri || this.defaultRedirectUri;
    // Instagram Graph API via Meta OAuth com escopos focados em Instagram
    const scopes = ['instagram_basic', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement', 'public_profile', 'email'];
    let url = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?client_id=${this.appId}&redirect_uri=${encodeURIComponent(targetRedirect)}&scope=${encodeURIComponent(scopes.join(','))}&response_type=code`;
    if (state) {
      url += `&state=${encodeURIComponent(state)}`;
    }
    return url;
  }

  async handleMetaCallback(code: string, redirectUri?: string, provider = 'meta') {
    this.ensureConfigured();
    const targetRedirect = redirectUri || this.defaultRedirectUri;

    try {
      // 1. Troca o código temporário pelo Short-Lived Access Token
      const tokenUrl = `${GRAPH_API_BASE}/oauth/access_token?client_id=${this.appId}&client_secret=${this.appSecret}&redirect_uri=${encodeURIComponent(targetRedirect)}&code=${code}`;
      const tokenRes = await fetch(tokenUrl);
      const tokenData: any = await tokenRes.json();

      if (tokenData.error) {
        throw new Error(`Erro ao obter token da Meta: ${tokenData.error.message}`);
      }

      const shortToken = tokenData.access_token;

      // 2. Troca o Short-Lived Token por um Long-Lived Access Token (60 dias)
      let finalToken = shortToken;
      let tokenExpiresAt: Date | null = null;

      try {
        const longTokenUrl = `${GRAPH_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${this.appId}&client_secret=${this.appSecret}&fb_exchange_token=${shortToken}`;
        const longRes = await fetch(longTokenUrl);
        const longData: any = await longRes.json();

        if (longData.access_token) {
          finalToken = longData.access_token;
          if (longData.expires_in) {
            tokenExpiresAt = new Date(Date.now() + Number(longData.expires_in) * 1000);
          }
        }
      } catch (err: any) {
        loggerService.error('system', `Aviso ao obter long-lived token: ${err.message}`);
      }

      // 3. Obtém dados do usuário logado na Meta
      const meUrl = `${GRAPH_API_BASE}/me?fields=id,name,email,picture.type(large)&access_token=${finalToken}`;
      const meRes = await fetch(meUrl);
      const meData: any = await meRes.json();

      if (meData.error) {
        throw new Error(`Erro ao obter dados do perfil: ${meData.error.message}`);
      }

      const externalUserId = meData.id;
      const name = meData.name || 'Perfil Meta Conectado';
      const email = meData.email || null;
      const avatarUrl = meData.picture?.data?.url || null;

      // 4. Salva ou atualiza o perfil no banco MariaDB
      const existingProfile = await prisma.metaProfile.findFirst({
        where: { externalUserId, provider },
      });

      let profile;
      if (existingProfile) {
        profile = await prisma.metaProfile.update({
          where: { id: existingProfile.id },
          data: {
            name,
            email,
            avatarUrl,
            accessToken: finalToken,
            tokenExpiresAt,
            isActive: true,
          },
        });
      } else {
        profile = await prisma.metaProfile.create({
          data: {
            provider,
            externalUserId,
            name,
            email,
            avatarUrl,
            accessToken: finalToken,
            tokenExpiresAt,
            isActive: true,
          },
        });
      }

      loggerService.system(`✅ Perfil ${provider.toUpperCase()} conectado com sucesso: ${profile.name} (${profile.email || profile.id})`, { id: profile.id });
      return { success: true, profile };
    } catch (error: any) {
      loggerService.error('system', `❌ Falha no OAuth da Meta: ${error.message}`);
      throw error;
    }
  }

  // =========================================================================
  // 2. PERFIS E DESCOBERTA AUTOMÁTICA DE ATIVOS (ASSETS DISCOVERY)
  // =========================================================================

  async listProfiles() {
    const profiles = await prisma.metaProfile.findMany({
      include: {
        _count: {
          select: { clients: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return profiles.map((p) => ({
      id: p.id,
      provider: p.provider,
      externalUserId: p.externalUserId,
      name: p.name,
      email: p.email,
      avatarUrl: p.avatarUrl,
      isActive: p.isActive,
      tokenExpiresAt: p.tokenExpiresAt,
      clientsCount: p._count.clients,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      hasToken: Boolean(p.accessToken && p.accessToken.length > 10),
    }));
  }

  async deleteProfile(id: string) {
    await prisma.metaProfile.delete({ where: { id } });
    loggerService.system(`🗑️ Perfil Meta removido: ${id}`);
    return { success: true };
  }

  /**
   * Consulta a Meta Graph API e mapeia instantaneamente BMs, Contas de Anúncio, Páginas e Perfis do Instagram
   */
  async discoverProfileAssets(profileId: string) {
    const profile = await prisma.metaProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile || !profile.accessToken) {
      return { success: false, error: 'Perfil não encontrado ou sem token de acesso válido.' };
    }

    const token = profile.accessToken;

    try {
      // 1. Busca BMs (Business Managers)
      const bmPromise = fetch(`${GRAPH_API_BASE}/me/businesses?fields=id,name,created_time,profile_picture_uri&limit=50&access_token=${token}`)
        .then((r) => r.json())
        .catch(() => ({ data: [] }));

      // 2. Busca Contas de Anúncios (Ad Accounts)
      const adPromise = fetch(`${GRAPH_API_BASE}/me/adaccounts?fields=id,account_id,name,currency,account_status,business{id,name}&limit=100&access_token=${token}`)
        .then((r) => r.json())
        .catch(() => ({ data: [] }));

      // 3. Busca Páginas do Facebook e Contas de Instagram vinculadas
      const pagesPromise = fetch(`${GRAPH_API_BASE}/me/accounts?fields=id,name,category,access_token,instagram_business_account{id,username,name,profile_picture_url}&limit=100&access_token=${token}`)
        .then((r) => r.json())
        .catch(() => ({ data: [] }));

      const [bmRes, adRes, pagesRes]: [any, any, any] = await Promise.all([bmPromise, adPromise, pagesPromise]);

      const businesses = (bmRes.data || []).map((b: any) => ({
        id: b.id,
        name: b.name,
      }));

      const adAccounts = (adRes.data || []).map((ad: any) => ({
        id: ad.id, // "act_123456789"
        accountId: ad.account_id,
        name: ad.name || `Conta ${ad.account_id}`,
        currency: ad.currency || 'BRL',
        status: ad.account_status === 1 ? 'ACTIVE' : 'INACTIVE',
        bm: ad.business ? { id: ad.business.id, name: ad.business.name } : null,
      }));

      const pages: any[] = [];
      const instagramAccounts: any[] = [];
      const seenIg = new Set<string>();

      for (const p of pagesRes.data || []) {
        pages.push({
          id: p.id,
          name: p.name,
          category: p.category,
          token: p.access_token,
          hasInstagram: Boolean(p.instagram_business_account),
        });

        if (p.instagram_business_account && !seenIg.has(p.instagram_business_account.id)) {
          seenIg.add(p.instagram_business_account.id);
          instagramAccounts.push({
            id: p.instagram_business_account.id,
            username: `@${p.instagram_business_account.username || ''}`,
            name: p.instagram_business_account.name || p.name,
            profilePictureUrl: p.instagram_business_account.profile_picture_url || null,
            connectedPage: { id: p.id, name: p.name },
          });
        }
      }

      return {
        success: true,
        profile: {
          id: profile.id,
          name: profile.name,
          email: profile.email,
        },
        assets: {
          businesses,
          adAccounts,
          pages,
          instagramAccounts,
        },
      };
    } catch (err: any) {
      loggerService.error('system', `Erro ao descobrir ativos da Meta: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // =========================================================================
  // 3. GERENCIAMENTO DE CLIENTES
  // =========================================================================

  async createClient(data: CreateMetaClientInput) {
    try {
      const slug = data.slug || this.slugify(data.name);
      const formattedAdId = this.formatAdAccountId(data.adAccountId);

      // Determina quais ativos estão ativos
      const connectedAssets: string[] = [];
      if (formattedAdId) connectedAssets.push('ad_account');
      if (data.instagramAccountId || data.instagramUsername) connectedAssets.push('instagram');
      if (data.facebookPageId) connectedAssets.push('facebook');

      const client = await prisma.metaClient.create({
        data: {
          profileId: data.profileId,
          name: data.name,
          slug,
          description: data.description || null,
          connectedAssets: data.connectedAssets || connectedAssets,
          bmId: data.bmId || null,
          bmName: data.bmName || null,
          adAccountId: formattedAdId || null,
          adAccountName: data.adAccountName || null,
          facebookPageId: data.facebookPageId || null,
          facebookPageName: data.facebookPageName || null,
          facebookPageToken: data.facebookPageToken || null,
          instagramAccountId: data.instagramAccountId || null,
          instagramUsername: data.instagramUsername || null,
          currency: data.currency || 'BRL',
          targetCpa: data.targetCpa || null,
          dailyBudgetLimit: data.dailyBudgetLimit || null,
          isActive: true,
        },
        include: {
          profile: {
            select: { id: true, name: true, email: true, provider: true },
          },
        },
      });

      loggerService.system(`✅ Cliente Meta cadastrado: ${client.name} (Ativos: ${((client.connectedAssets as string[]) || []).join(', ')})`);
      return { success: true, client };
    } catch (error: any) {
      loggerService.error('system', `Erro ao cadastrar cliente Meta: ${error.message}`);
      throw error;
    }
  }

  async listClients(includeInactive = false) {
    return prisma.metaClient.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        profile: {
          select: { id: true, name: true, email: true, provider: true, isActive: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getClientByIdentifier(identifier: string) {
    const cleanId = identifier.trim();

    // 1. Tenta por ID exato
    let client = await prisma.metaClient.findUnique({
      where: { id: cleanId },
      include: { profile: true },
    });

    if (client) return client;

    // 2. Tenta por Slug
    const slug = this.slugify(cleanId);
    client = await prisma.metaClient.findUnique({
      where: { slug },
      include: { profile: true },
    });

    if (client) return client;

    // 3. Tenta por Conta de Anúncios
    const formattedAdId = this.formatAdAccountId(cleanId);
    if (formattedAdId) {
      client = await prisma.metaClient.findFirst({
        where: { adAccountId: formattedAdId },
        include: { profile: true },
      });
      if (client) return client;
    }

    // 4. Busca parcial por Nome ou Instagram (Case-insensitive)
    const allClients = await prisma.metaClient.findMany({
      where: { isActive: true },
      include: { profile: true },
    });

    const normalizedQuery = cleanId.toLowerCase();
    const found = allClients.find((c) =>
      c.name.toLowerCase().includes(normalizedQuery) ||
      (c.instagramUsername && c.instagramUsername.toLowerCase().includes(normalizedQuery)) ||
      (c.adAccountName && c.adAccountName.toLowerCase().includes(normalizedQuery))
    );

    return found || null;
  }

  async updateClient(id: string, data: Partial<CreateMetaClientInput>) {
    const updateData: any = { ...data };
    if (data.adAccountId !== undefined) {
      updateData.adAccountId = this.formatAdAccountId(data.adAccountId);
    }
    if (data.name && !data.slug) {
      updateData.slug = this.slugify(data.name);
    }

    const updated = await prisma.metaClient.update({
      where: { id },
      data: updateData,
      include: { profile: { select: { id: true, name: true } } },
    });

    return { success: true, client: updated };
  }

  async deleteClient(id: string) {
    await prisma.metaClient.delete({ where: { id } });
    return { success: true };
  }

  // =========================================================================
  // 4. GERENCIADOR DE ANÚNCIOS (MARKETING API)
  // =========================================================================

  async getAdAccountInsights(
    clientIdentifier: string,
    options: {
      datePreset?: 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' | 'this_month' | 'last_month';
      timeRange?: { since: string; until: string };
    } = {}
  ) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client) {
      return { success: false, error: `Cliente "${clientIdentifier}" não encontrado.` };
    }

    if (!client.adAccountId) {
      return { success: false, error: `O cliente ${client.name} não possui conta de anúncios vinculada.` };
    }

    if (!client.profile || !client.profile.accessToken) {
      return { success: false, error: `O perfil do cliente ${client.name} não possui token de acesso válido.` };
    }

    const token = client.profile.accessToken;
    const adAccountId = client.adAccountId;
    const datePreset = options.datePreset || 'today';

    let url = `${GRAPH_API_BASE}/${adAccountId}/insights?fields=spend,impressions,clicks,cpc,cpm,ctr,reach,conversions,cost_per_conversion,actions,action_values,purchase_roas&access_token=${encodeURIComponent(token)}`;

    if (options.timeRange) {
      url += `&time_range=${encodeURIComponent(JSON.stringify(options.timeRange))}`;
    } else {
      url += `&date_preset=${datePreset}`;
    }

    try {
      const response = await fetch(url);
      const data: any = await response.json();

      if (data.error) {
        loggerService.error('system', `Erro na Graph API Meta (${client.name}): ${data.error.message}`, { error: data.error });
        return {
          success: false,
          client: { id: client.id, name: client.name, adAccountId: client.adAccountId },
          error: data.error.message,
        };
      }

      const insight = data.data && data.data.length > 0 ? data.data[0] : null;

      if (!insight) {
        return {
          success: true,
          client: { id: client.id, name: client.name, adAccountId: client.adAccountId, currency: client.currency },
          period: options.timeRange ? `${options.timeRange.since} até ${options.timeRange.until}` : datePreset,
          summary: 'Nenhum dado ou gasto registrado para o período selecionado.',
          metrics: {
            spend: 0,
            impressions: 0,
            clicks: 0,
            cpc: 0,
            cpm: 0,
            ctr: 0,
            reach: 0,
            leads: 0,
            costPerLead: 0,
            purchases: 0,
            roas: 0,
          },
        };
      }

      const parsedActions = this.parseMetaActions(insight.actions);
      const leads = parsedActions.leads;
      const purchases = parsedActions.purchases;

      const spend = parseFloat(insight.spend || '0');
      const clicks = parseInt(insight.clicks || '0', 10);
      const impressions = parseInt(insight.impressions || '0', 10);
      const reach = parseInt(insight.reach || '0', 10);
      const cpc = parseFloat(insight.cpc || '0');
      const cpm = parseFloat(insight.cpm || '0');
      const ctr = parseFloat(insight.ctr || '0');
      const costPerLead = leads > 0 ? Number((spend / leads).toFixed(2)) : 0;
      const roas = Array.isArray(insight.purchase_roas) && insight.purchase_roas.length > 0
        ? parseFloat(insight.purchase_roas[0].value)
        : 0;

      return {
        success: true,
        client: {
          id: client.id,
          name: client.name,
          adAccountId: client.adAccountId,
          currency: client.currency,
          targetCpa: client.targetCpa,
        },
        period: options.timeRange ? `${options.timeRange.since} até ${options.timeRange.until}` : datePreset,
        metrics: {
          spendFormatted: `${client.currency} ${spend.toFixed(2)}`,
          spend,
          impressions,
          reach,
          clicks,
          cpc: Number(cpc.toFixed(2)),
          cpm: Number(cpm.toFixed(2)),
          ctr: Number(ctr.toFixed(2)),
          leads,
          costPerLeadFormatted: leads > 0 ? `${client.currency} ${costPerLead.toFixed(2)}` : 'N/A',
          costPerLead,
          purchases,
          roas: Number(roas.toFixed(2)),
        },
        targetCpaAlert: client.targetCpa && costPerLead > client.targetCpa
          ? `⚠️ CPA Atual (${client.currency} ${costPerLead}) acima da meta (${client.currency} ${client.targetCpa})`
          : null,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async listCampaigns(
    clientIdentifier: string,
    options: { status?: 'ACTIVE' | 'PAUSED' | 'ALL'; limit?: number } = {}
  ) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client || !client.adAccountId || !client.profile?.accessToken) {
      return { success: false, error: 'Conta de anúncios não configurada ou sem token.' };
    }

    const token = client.profile.accessToken;
    const adAccountId = client.adAccountId;
    const limit = options.limit || 25;

    let filterStr = '';
    if (options.status && options.status !== 'ALL') {
      const filtering = [{ field: 'effective_status', operator: 'IN', value: [options.status] }];
      filterStr = `&filtering=${encodeURIComponent(JSON.stringify(filtering))}`;
    }

    const url = `${GRAPH_API_BASE}/${adAccountId}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,insights.date_preset(today){spend,clicks,actions}&limit=${limit}&access_token=${encodeURIComponent(token)}${filterStr}`;

    try {
      const response = await fetch(url);
      const data: any = await response.json();

      if (data.error) {
        return { success: false, error: data.error.message };
      }

      const campaigns = (data.data || []).map((c: any) => {
        const todayInsight = c.insights?.data?.[0];
        let todaySpend = 0;
        let todayLeads = 0;

        if (todayInsight) {
          todaySpend = parseFloat(todayInsight.spend || '0');
          const parsed = this.parseMetaActions(todayInsight.actions);
          todayLeads = parsed.leads;
        }

        const dailyBudget = c.daily_budget ? parseFloat(c.daily_budget) / 100 : null;

        return {
          id: c.id,
          name: c.name,
          status: c.status,
          effectiveStatus: c.effective_status,
          objective: c.objective,
          dailyBudget: dailyBudget ? `${client.currency} ${dailyBudget.toFixed(2)}` : 'Não definido',
          dailyBudgetRaw: dailyBudget,
          todaySpend: `${client.currency} ${todaySpend.toFixed(2)}`,
          todayLeads,
        };
      });

      return {
        success: true,
        client: { id: client.id, name: client.name, adAccountId: client.adAccountId },
        totalCampaigns: campaigns.length,
        campaigns,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async updateCampaignStatus(clientIdentifier: string, campaignId: string, status: 'ACTIVE' | 'PAUSED') {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client || !client.profile?.accessToken) {
      return { success: false, error: `Cliente ou conexão não encontrados.` };
    }

    const token = client.profile.accessToken;
    const url = `${GRAPH_API_BASE}/${campaignId}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          access_token: token,
        }),
      });
      const data: any = await res.json();

      if (data.error) {
        return { success: false, error: data.error.message };
      }

      loggerService.system(`Campanha ${campaignId} atualizada para ${status} no cliente ${client.name}`);
      return {
        success: true,
        message: `Campanha atualizada com sucesso para "${status}" (${client.name}).`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async updateCampaignBudget(clientIdentifier: string, campaignId: string, dailyBudget: number) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client || !client.profile?.accessToken) {
      return { success: false, error: `Cliente ou conexão não encontrados.` };
    }

    const token = client.profile.accessToken;
    const url = `${GRAPH_API_BASE}/${campaignId}`;
    const budgetInCents = Math.round(dailyBudget * 100);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daily_budget: budgetInCents,
          access_token: token,
        }),
      });
      const data: any = await res.json();

      if (data.error) {
        return { success: false, error: data.error.message };
      }

      loggerService.system(`Orçamento da campanha ${campaignId} ajustado para ${dailyBudget} (${client.name})`);
      return {
        success: true,
        message: `Orçamento diário da campanha ajustado para ${client.currency} ${dailyBudget.toFixed(2)} (${client.name}).`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Histórico detalhado por Campanha com filtros de período e identificação de CBO/ABO com orçamentos
   */
  async getCampaignInsights(
    clientIdentifier: string,
    options: {
      datePreset?: string;
      timeRange?: { since: string; until: string };
      status?: string;
      limit?: number;
    } = {}
  ) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client || !client.adAccountId || !client.profile?.accessToken) {
      return { success: false, error: 'Conta de anúncios não configurada ou sem token.' };
    }

    const token = client.profile.accessToken;
    const adAccountId = client.adAccountId;
    const datePreset = options.datePreset || 'last_7d';
    const limit = options.limit || 50;

    let timeParam = `&date_preset=${datePreset}`;
    if (options.timeRange) {
      timeParam = `&time_range=${encodeURIComponent(JSON.stringify(options.timeRange))}`;
    }

    try {
      // 1. Busca campanhas, adsets e métricas de campanhas em paralelo
      const campaignsUrl = `${GRAPH_API_BASE}/${adAccountId}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time&limit=${limit}&access_token=${encodeURIComponent(token)}`;
      const adsetsUrl = `${GRAPH_API_BASE}/${adAccountId}/adsets?fields=id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget&limit=100&access_token=${encodeURIComponent(token)}`;
      const insightsUrl = `${GRAPH_API_BASE}/${adAccountId}/insights?level=campaign&fields=campaign_id,campaign_name,objective,spend,impressions,clicks,cpc,cpm,ctr,reach,actions,action_values,cost_per_action_type,purchase_roas&limit=${limit}&access_token=${encodeURIComponent(token)}${timeParam}`;

      const [campRes, adsetsRes, insRes] = await Promise.all([
        fetch(campaignsUrl).then((r) => r.json()).catch(() => ({ data: [] })),
        fetch(adsetsUrl).then((r) => r.json()).catch(() => ({ data: [] })),
        fetch(insightsUrl).then((r) => r.json()).catch(() => ({ data: [] })),
      ]);

      // Mapeia adsets por campaign_id
      const adsetsByCamp = new Map<string, any[]>();
      (adsetsRes.data || []).forEach((adset: any) => {
        const list = adsetsByCamp.get(adset.campaign_id) || [];
        list.push(adset);
        adsetsByCamp.set(adset.campaign_id, list);
      });

      const campaignsMap = new Map<string, any>();
      (campRes.data || []).forEach((c: any) => {
        campaignsMap.set(c.id, c);
      });

      const insightsList = insRes.data || [];
      const results: any[] = [];

      // Mapeia todas as campanhas que tiveram métricas
      for (const ins of insightsList) {
        const campInfo = campaignsMap.get(ins.campaign_id) || {};
        const campAdsets = adsetsByCamp.get(ins.campaign_id) || [];

        const parsedActions = this.parseMetaActions(ins.actions);
        const leads = parsedActions.leads;
        const purchases = parsedActions.purchases;

        const spend = parseFloat(ins.spend || '0');
        const clicks = parseInt(ins.clicks || '0', 10);
        const impressions = parseInt(ins.impressions || '0', 10);
        const reach = parseInt(ins.reach || '0', 10);
        const cpc = parseFloat(ins.cpc || '0');
        const cpm = parseFloat(ins.cpm || '0');
        const ctr = parseFloat(ins.ctr || '0');
        const costPerLead = leads > 0 ? Number((spend / leads).toFixed(2)) : 0;
        const roas = Array.isArray(ins.purchase_roas) && ins.purchase_roas.length > 0
          ? parseFloat(ins.purchase_roas[0].value)
          : 0;

        let dailyBudget = campInfo.daily_budget ? parseFloat(campInfo.daily_budget) / 100 : null;
        let budgetType = dailyBudget ? 'CBO (Campanha)' : 'ABO (Conjuntos)';
        
        // Se for ABO (sem orçamento na campanha), soma o orçamento diário dos conjuntos ativos
        let totalAdsetDailyBudget = 0;
        const formattedAdsets = campAdsets.map(a => {
          const aBudget = a.daily_budget ? parseFloat(a.daily_budget) / 100 : null;
          if (a.status === 'ACTIVE' && aBudget) {
            totalAdsetDailyBudget += aBudget;
          }
          return {
            id: a.id,
            name: a.name,
            status: a.status,
            dailyBudget: aBudget ? `${client.currency} ${aBudget.toFixed(2)}/dia` : null,
            dailyBudgetRaw: aBudget,
          };
        });

        const displayDailyBudget = dailyBudget
          ? `${client.currency} ${dailyBudget.toFixed(2)}`
          : (totalAdsetDailyBudget > 0 ? `${client.currency} ${totalAdsetDailyBudget.toFixed(2)} (Soma Conjuntos)` : 'Orçamento por Conjunto');

        results.push({
          campaignId: ins.campaign_id,
          name: ins.campaign_name || campInfo.name || 'Sem Nome',
          status: campInfo.status || 'UNKNOWN',
          effectiveStatus: campInfo.effective_status || campInfo.status || 'UNKNOWN',
          objective: ins.objective || campInfo.objective || 'N/A',
          budgetType,
          dailyBudget: displayDailyBudget,
          dailyBudgetRaw: dailyBudget || totalAdsetDailyBudget || null,
          adsets: formattedAdsets,
          spend,
          spendFormatted: `${client.currency} ${spend.toFixed(2)}`,
          leads,
          costPerLead,
          costPerLeadFormatted: leads > 0 ? `${client.currency} ${costPerLead.toFixed(2)}` : 'N/A',
          clicks,
          ctr: Number(ctr.toFixed(2)),
          cpc: Number(cpc.toFixed(2)),
          cpm: Number(cpm.toFixed(2)),
          reach,
          impressions,
          purchases,
          roas: Number(roas.toFixed(2)),
          targetCpaAlert: client.targetCpa && costPerLead > client.targetCpa ? true : false,
        });

        campaignsMap.delete(ins.campaign_id);
      }

      // Adiciona campanhas ativas que não tiveram gasto no período selecionado
      for (const [, camp] of campaignsMap.entries()) {
        const campAdsets = adsetsByCamp.get(camp.id) || [];
        let dailyBudget = camp.daily_budget ? parseFloat(camp.daily_budget) / 100 : null;
        let totalAdsetDailyBudget = 0;
        const formattedAdsets = campAdsets.map(a => {
          const aBudget = a.daily_budget ? parseFloat(a.daily_budget) / 100 : null;
          if (a.status === 'ACTIVE' && aBudget) {
            totalAdsetDailyBudget += aBudget;
          }
          return {
            id: a.id,
            name: a.name,
            status: a.status,
            dailyBudget: aBudget ? `${client.currency} ${aBudget.toFixed(2)}/dia` : null,
            dailyBudgetRaw: aBudget,
          };
        });

        const displayDailyBudget = dailyBudget
          ? `${client.currency} ${dailyBudget.toFixed(2)}`
          : (totalAdsetDailyBudget > 0 ? `${client.currency} ${totalAdsetDailyBudget.toFixed(2)} (Soma Conjuntos)` : 'Orçamento por Conjunto');

        results.push({
          campaignId: camp.id,
          name: camp.name,
          status: camp.status || 'UNKNOWN',
          effectiveStatus: camp.effective_status || camp.status || 'UNKNOWN',
          objective: camp.objective || 'N/A',
          budgetType: dailyBudget ? 'CBO (Campanha)' : 'ABO (Conjuntos)',
          dailyBudget: displayDailyBudget,
          dailyBudgetRaw: dailyBudget || totalAdsetDailyBudget || null,
          adsets: formattedAdsets,
          spend: 0,
          spendFormatted: `${client.currency} 0.00`,
          leads: 0,
          costPerLead: 0,
          costPerLeadFormatted: 'N/A',
          clicks: 0,
          ctr: 0,
          cpc: 0,
          cpm: 0,
          reach: 0,
          impressions: 0,
          purchases: 0,
          roas: 0,
          targetCpaAlert: false,
        });
      }

      // Ordena por gasto decrescente
      results.sort((a, b) => b.spend - a.spend);

      return {
        success: true,
        client: {
          id: client.id,
          name: client.name,
          adAccountId: client.adAccountId,
          currency: client.currency,
          targetCpa: client.targetCpa,
        },
        period: options.timeRange ? `${options.timeRange.since} até ${options.timeRange.until}` : datePreset,
        totalCampaigns: results.length,
        campaigns: results,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Histórico detalhado por Conjunto de Anúncios (AdSet), incluindo o orçamento diário configurado no ABO
   */
  async getAdSetInsights(
    clientIdentifier: string,
    options: {
      datePreset?: string;
      timeRange?: { since: string; until: string };
      campaignId?: string;
      limit?: number;
    } = {}
  ) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client || !client.adAccountId || !client.profile?.accessToken) {
      return { success: false, error: 'Conta de anúncios não configurada ou sem token.' };
    }

    const token = client.profile.accessToken;
    const adAccountId = client.adAccountId;
    const datePreset = options.datePreset || 'last_7d';
    const limit = options.limit || 50;

    let timeParam = `&date_preset=${datePreset}`;
    if (options.timeRange) {
      timeParam = `&time_range=${encodeURIComponent(JSON.stringify(options.timeRange))}`;
    }

    try {
      const adsetsUrl = `${GRAPH_API_BASE}/${adAccountId}/adsets?fields=id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal,bid_strategy,start_time,end_time&limit=${limit}&access_token=${encodeURIComponent(token)}`;
      const insightsUrl = `${GRAPH_API_BASE}/${adAccountId}/insights?level=adset&fields=adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,cpc,cpm,ctr,reach,actions,action_values,cost_per_action_type,purchase_roas&limit=${limit}&access_token=${encodeURIComponent(token)}${timeParam}`;

      const [adsetsRes, insRes] = await Promise.all([
        fetch(adsetsUrl).then((r) => r.json()).catch(() => ({ data: [] })),
        fetch(insightsUrl).then((r) => r.json()).catch(() => ({ data: [] })),
      ]);

      const adsetsMap = new Map<string, any>();
      (adsetsRes.data || []).forEach((a: any) => {
        adsetsMap.set(a.id, a);
      });

      const insightsList = insRes.data || [];
      const results: any[] = [];

      for (const ins of insightsList) {
        if (options.campaignId && ins.campaign_id !== options.campaignId) {
          continue;
        }

        const adsetInfo = adsetsMap.get(ins.adset_id) || {};
        const parsedActions = this.parseMetaActions(ins.actions);
        const leads = parsedActions.leads;
        const purchases = parsedActions.purchases;

        const spend = parseFloat(ins.spend || '0');
        const clicks = parseInt(ins.clicks || '0', 10);
        const impressions = parseInt(ins.impressions || '0', 10);
        const reach = parseInt(ins.reach || '0', 10);
        const cpc = parseFloat(ins.cpc || '0');
        const cpm = parseFloat(ins.cpm || '0');
        const ctr = parseFloat(ins.ctr || '0');
        const costPerLead = leads > 0 ? Number((spend / leads).toFixed(2)) : 0;
        const roas = Array.isArray(ins.purchase_roas) && ins.purchase_roas.length > 0
          ? parseFloat(ins.purchase_roas[0].value)
          : 0;

        const dailyBudget = adsetInfo.daily_budget ? parseFloat(adsetInfo.daily_budget) / 100 : null;
        const lifetimeBudget = adsetInfo.lifetime_budget ? parseFloat(adsetInfo.lifetime_budget) / 100 : null;

        results.push({
          adsetId: ins.adset_id,
          name: ins.adset_name || adsetInfo.name || 'Conjunto sem Nome',
          campaignId: ins.campaign_id,
          campaignName: ins.campaign_name || 'N/A',
          status: adsetInfo.status || 'UNKNOWN',
          effectiveStatus: adsetInfo.effective_status || adsetInfo.status || 'UNKNOWN',
          optimizationGoal: adsetInfo.optimization_goal || 'N/A',
          // Orçamento configurado no Conjunto (ABO)
          dailyBudget: dailyBudget ? `${client.currency} ${dailyBudget.toFixed(2)}/dia` : (lifetimeBudget ? `${client.currency} ${lifetimeBudget.toFixed(2)} (Total)` : 'CBO / Campanha'),
          dailyBudgetRaw: dailyBudget,
          lifetimeBudgetRaw: lifetimeBudget,
          spend,
          spendFormatted: `${client.currency} ${spend.toFixed(2)}`,
          leads,
          costPerLead,
          costPerLeadFormatted: leads > 0 ? `${client.currency} ${costPerLead.toFixed(2)}` : 'N/A',
          clicks,
          ctr: Number(ctr.toFixed(2)),
          cpc: Number(cpc.toFixed(2)),
          cpm: Number(cpm.toFixed(2)),
          reach,
          impressions,
          purchases,
          roas: Number(roas.toFixed(2)),
          targetCpaAlert: client.targetCpa && costPerLead > client.targetCpa ? true : false,
        });

        adsetsMap.delete(ins.adset_id);
      }

      // Adiciona conjuntos que não tiveram gasto no período
      for (const [, a] of adsetsMap.entries()) {
        if (options.campaignId && a.campaign_id !== options.campaignId) {
          continue;
        }

        const dailyBudget = a.daily_budget ? parseFloat(a.daily_budget) / 100 : null;
        const lifetimeBudget = a.lifetime_budget ? parseFloat(a.lifetime_budget) / 100 : null;

        results.push({
          adsetId: a.id,
          name: a.name,
          campaignId: a.campaign_id,
          campaignName: 'N/A',
          status: a.status || 'UNKNOWN',
          effectiveStatus: a.effective_status || a.status || 'UNKNOWN',
          optimizationGoal: a.optimization_goal || 'N/A',
          dailyBudget: dailyBudget ? `${client.currency} ${dailyBudget.toFixed(2)}/dia` : (lifetimeBudget ? `${client.currency} ${lifetimeBudget.toFixed(2)} (Total)` : 'CBO / Campanha'),
          dailyBudgetRaw: dailyBudget,
          lifetimeBudgetRaw: lifetimeBudget,
          spend: 0,
          spendFormatted: `${client.currency} 0.00`,
          leads: 0,
          costPerLead: 0,
          costPerLeadFormatted: 'N/A',
          clicks: 0,
          ctr: 0,
          cpc: 0,
          cpm: 0,
          reach: 0,
          impressions: 0,
          purchases: 0,
          roas: 0,
          targetCpaAlert: false,
        });
      }

      results.sort((a, b) => b.spend - a.spend);

      return {
        success: true,
        client: {
          id: client.id,
          name: client.name,
          adAccountId: client.adAccountId,
          currency: client.currency,
          targetCpa: client.targetCpa,
        },
        period: options.timeRange ? `${options.timeRange.since} até ${options.timeRange.until}` : datePreset,
        totalAdSets: results.length,
        adsets: results,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Altera status de um Conjunto de Anúncios (AdSet) - Ativar / Pausar
   */
  async updateAdSetStatus(clientIdentifier: string, adsetId: string, status: 'ACTIVE' | 'PAUSED') {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client || !client.profile?.accessToken) {
      return { success: false, error: `Cliente ou conexão não encontrados.` };
    }

    const token = client.profile.accessToken;
    const url = `${GRAPH_API_BASE}/${adsetId}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          access_token: token,
        }),
      });
      const data: any = await res.json();

      if (data.error) {
        return { success: false, error: data.error.message };
      }

      loggerService.system(`Conjunto de anúncios ${adsetId} atualizado para ${status} no cliente ${client.name}`);
      return {
        success: true,
        message: `Conjunto de anúncios atualizado para "${status}" (${client.name}).`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Altera orçamento diário de um Conjunto de Anúncios (AdSet - Orçamento ABO)
   */
  async updateAdSetBudget(clientIdentifier: string, adsetId: string, dailyBudget: number) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client || !client.profile?.accessToken) {
      return { success: false, error: `Cliente ou conexão não encontrados.` };
    }

    const token = client.profile.accessToken;
    const url = `${GRAPH_API_BASE}/${adsetId}`;
    const budgetInCents = Math.round(dailyBudget * 100);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daily_budget: budgetInCents,
          access_token: token,
        }),
      });
      const data: any = await res.json();

      if (data.error) {
        return { success: false, error: data.error.message };
      }

      loggerService.system(`Orçamento do conjunto ${adsetId} ajustado para R$ ${dailyBudget.toFixed(2)} (${client.name})`);
      return {
        success: true,
        message: `Orçamento diário do conjunto ajustado para ${client.currency} ${dailyBudget.toFixed(2)}/dia (${client.name}).`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Histórico e Análise detalhada por Criativo / Anúncio (Copy, Thumbnail, Leads, CPA, CTR, ROAS)
   */
  async getCreativeInsights(
    clientIdentifier: string,
    options: {
      datePreset?: string;
      timeRange?: { since: string; until: string };
      campaignId?: string;
      limit?: number;
    } = {}
  ) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client || !client.adAccountId || !client.profile?.accessToken) {
      return { success: false, error: 'Conta de anúncios não configurada ou sem token.' };
    }

    const token = client.profile.accessToken;
    const adAccountId = client.adAccountId;
    const datePreset = options.datePreset || 'last_7d';
    const limit = options.limit || 50;

    let timeParam = `&date_preset=${datePreset}`;
    if (options.timeRange) {
      timeParam = `&time_range=${encodeURIComponent(JSON.stringify(options.timeRange))}`;
    }

    try {
      // 1. Busca criativos e anúncios com imagens/textos
      const adsUrl = `${GRAPH_API_BASE}/${adAccountId}/ads?fields=id,name,status,effective_status,adset_id,campaign_id,creative{id,name,title,body,image_url,thumbnail_url,video_id,instagram_permalink_url}&limit=${limit}&access_token=${encodeURIComponent(token)}`;
      // 2. Busca métricas agrupadas por anúncio
      const insightsUrl = `${GRAPH_API_BASE}/${adAccountId}/insights?level=ad&fields=ad_id,ad_name,adset_name,campaign_id,campaign_name,spend,impressions,clicks,cpc,cpm,ctr,reach,actions,action_values,cost_per_action_type,purchase_roas&limit=${limit}&access_token=${encodeURIComponent(token)}${timeParam}`;

      const [adsRes, insRes] = await Promise.all([
        fetch(adsUrl).then((r) => r.json()).catch(() => ({ data: [] })),
        fetch(insightsUrl).then((r) => r.json()).catch(() => ({ data: [] })),
      ]);

      const adsMap = new Map<string, any>();
      (adsRes.data || []).forEach((a: any) => {
        adsMap.set(a.id, a);
      });

      const insightsList = insRes.data || [];
      const results: any[] = [];

      for (const ins of insightsList) {
        if (options.campaignId && ins.campaign_id !== options.campaignId) {
          continue;
        }

        const adInfo = adsMap.get(ins.ad_id) || {};
        const creative = adInfo.creative || {};

        const parsedActions = this.parseMetaActions(ins.actions);
        const leads = parsedActions.leads;
        const purchases = parsedActions.purchases;

        const spend = parseFloat(ins.spend || '0');
        const clicks = parseInt(ins.clicks || '0', 10);
        const impressions = parseInt(ins.impressions || '0', 10);
        const reach = parseInt(ins.reach || '0', 10);
        const cpc = parseFloat(ins.cpc || '0');
        const cpm = parseFloat(ins.cpm || '0');
        const ctr = parseFloat(ins.ctr || '0');
        const costPerLead = leads > 0 ? Number((spend / leads).toFixed(2)) : 0;
        const roas = Array.isArray(ins.purchase_roas) && ins.purchase_roas.length > 0
          ? parseFloat(ins.purchase_roas[0].value)
          : 0;

        results.push({
          adId: ins.ad_id,
          name: ins.ad_name || adInfo.name || 'Criativo sem Nome',
          campaignId: ins.campaign_id,
          campaignName: ins.campaign_name || 'N/A',
          adsetName: ins.adset_name || 'N/A',
          status: adInfo.status || 'UNKNOWN',
          effectiveStatus: adInfo.effective_status || adInfo.status || 'UNKNOWN',
          // Dados visuais e copy do Criativo
          headline: creative.title || null,
          bodyText: creative.body || null,
          thumbnailUrl: creative.thumbnail_url || creative.image_url || null,
          imageUrl: creative.image_url || creative.thumbnail_url || null,
          instagramLink: creative.instagram_permalink_url || null,
          // Métricas de performance
          spend,
          spendFormatted: `${client.currency} ${spend.toFixed(2)}`,
          leads,
          costPerLead,
          costPerLeadFormatted: leads > 0 ? `${client.currency} ${costPerLead.toFixed(2)}` : 'N/A',
          clicks,
          ctr: Number(ctr.toFixed(2)),
          cpc: Number(cpc.toFixed(2)),
          cpm: Number(cpm.toFixed(2)),
          reach,
          impressions,
          purchases,
          roas: Number(roas.toFixed(2)),
          targetCpaAlert: client.targetCpa && costPerLead > client.targetCpa ? true : false,
        });

        adsMap.delete(ins.ad_id);
      }

      // Adiciona criativos ativos que não tiveram impressões no período
      for (const [, ad] of adsMap.entries()) {
        if (options.campaignId && ad.campaign_id !== options.campaignId) {
          continue;
        }

        const creative = ad.creative || {};
        results.push({
          adId: ad.id,
          name: ad.name,
          campaignId: ad.campaign_id,
          campaignName: 'N/A',
          adsetName: 'N/A',
          status: ad.status || 'UNKNOWN',
          effectiveStatus: ad.effective_status || ad.status || 'UNKNOWN',
          headline: creative.title || null,
          bodyText: creative.body || null,
          thumbnailUrl: creative.thumbnail_url || creative.image_url || null,
          imageUrl: creative.image_url || creative.thumbnail_url || null,
          instagramLink: creative.instagram_permalink_url || null,
          spend: 0,
          spendFormatted: `${client.currency} 0.00`,
          leads: 0,
          costPerLead: 0,
          costPerLeadFormatted: 'N/A',
          clicks: 0,
          ctr: 0,
          cpc: 0,
          cpm: 0,
          reach: 0,
          impressions: 0,
          purchases: 0,
          roas: 0,
          targetCpaAlert: false,
        });
      }

      // Ordena por gasto decrescente
      results.sort((a, b) => b.spend - a.spend);

      return {
        success: true,
        client: {
          id: client.id,
          name: client.name,
          adAccountId: client.adAccountId,
          currency: client.currency,
          targetCpa: client.targetCpa,
        },
        period: options.timeRange ? `${options.timeRange.since} até ${options.timeRange.until}` : datePreset,
        totalCreatives: results.length,
        creatives: results,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // =========================================================================
  // 6. CRIAÇÃO DE CAMPANHAS, CONJUNTOS, ANÚNCIOS E UPLOAD DE CRIATIVOS (4 MÉTODOS)
  // =========================================================================

  /**
   * Método 1 e 4: Upload de Imagem para a Biblioteca do Meta Ads (Buffer, Base64 ou URL Externa)
   */
  async uploadAdImage(
    clientIdentifier: string,
    source: {
      buffer?: Buffer;
      base64?: string;
      url?: string;
      filename?: string;
    }
  ) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client || !client.adAccountId || !client.profile?.accessToken) {
      return { success: false, error: 'Conta de anúncios não configurada ou sem token.' };
    }

    const token = client.profile.accessToken;
    const adAccountId = client.adAccountId;
    const filename = source.filename || `creative_${Date.now()}.jpg`;

    let imageBuffer: Buffer | null = null;

    try {
      if (source.buffer) {
        imageBuffer = source.buffer;
      } else if (source.base64) {
        const cleanBase64 = source.base64.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(cleanBase64, 'base64');
      } else if (source.url) {
        const res = await fetch(source.url);
        if (!res.ok) {
          return { success: false, error: `Falha ao baixar imagem da URL: HTTP ${res.status}` };
        }
        const arrayBuf = await res.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuf);
      }

      if (!imageBuffer || imageBuffer.length === 0) {
        return { success: false, error: 'Nenhum arquivo ou buffer de imagem válido foi fornecido.' };
      }

      const formData = new FormData();
      const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
      formData.append('filename', blob, filename);
      formData.append('access_token', token);

      const uploadRes = await fetch(`${GRAPH_API_BASE}/${adAccountId}/adimages`, {
        method: 'POST',
        body: formData,
      });

      const data: any = await uploadRes.json();
      if (data.error) {
        return { success: false, error: data.error.message };
      }

      const imagesObj = data.images || {};
      const firstKey = Object.keys(imagesObj)[0];
      const imageInfo = firstKey ? imagesObj[firstKey] : null;

      if (!imageInfo || !imageInfo.hash) {
        return { success: false, error: 'A Meta não retornou o hash da imagem.', raw: data };
      }

      loggerService.system(`Imagem ${filename} enviada para o Meta Ads (${client.name}). Hash: ${imageInfo.hash}`);

      return {
        success: true,
        hash: imageInfo.hash,
        url: imageInfo.url,
        filename,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Método 3: Lista Imagens e Criativos já salvos na Biblioteca da Conta de Anúncios
   */
  async listLibraryImages(clientIdentifier: string, limit: number = 30) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client || !client.adAccountId || !client.profile?.accessToken) {
      return { success: false, error: 'Conta de anúncios não configurada ou sem token.' };
    }

    const token = client.profile.accessToken;
    const adAccountId = client.adAccountId;

    try {
      const url = `${GRAPH_API_BASE}/${adAccountId}/adimages?fields=id,hash,name,original_width,original_height,url,permalink_url,created_time&limit=${limit}&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      const data: any = await res.json();

      if (data.error) {
        return { success: false, error: data.error.message };
      }

      const images = (data.data || []).map((img: any) => ({
        id: img.id,
        hash: img.hash,
        name: img.name || 'Imagem da Biblioteca',
        url: img.url || img.permalink_url,
        width: img.original_width,
        height: img.original_height,
        createdTime: img.created_time,
      }));

      return {
        success: true,
        total: images.length,
        images,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Consulta e retorna os números de WhatsApp conectados à Página do Facebook ou à WABA do cliente
   */
  async getWhatsAppPhoneNumbers(clientIdentifier: string) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client || !client.profile?.accessToken) {
      return { success: false, error: 'Cliente não encontrado ou sem token de acesso.' };
    }

    const token = client.profile.accessToken;
    const pageId = client.facebookPageId;
    const adAccountId = client.adAccountId;

    const phoneNumbers: Array<{
      id?: string;
      displayPhoneNumber: string;
      verifiedName?: string;
      source: 'PAGE' | 'WABA' | 'AD_ACCOUNT' | 'CLIENT_PROFILE';
    }> = [];
    const seen = new Set<string>();

    const addPhone = (num: string, id?: string, name?: string, source: 'PAGE' | 'WABA' | 'AD_ACCOUNT' | 'CLIENT_PROFILE' = 'PAGE') => {
      const clean = num.replace(/\D/g, '');
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        phoneNumbers.push({
          id,
          displayPhoneNumber: num,
          verifiedName: name || client.name,
          source,
        });
      }
    };

    try {
      // 1. Consulta Página do Facebook
      if (pageId) {
        try {
          const pageRes = await fetch(
            `${GRAPH_API_BASE}/${pageId}?fields=id,name,whatsapp_number,whatsapp_business_account{id,name,phone_numbers{id,display_phone_number,verified_name}}&access_token=${encodeURIComponent(token)}`
          );
          const pageData: any = await pageRes.json();

          if (pageData.whatsapp_number) {
            addPhone(pageData.whatsapp_number, undefined, pageData.name, 'PAGE');
          }

          const wabaNumbers = pageData.whatsapp_business_account?.phone_numbers?.data || [];
          for (const pn of wabaNumbers) {
            if (pn.display_phone_number) {
              addPhone(pn.display_phone_number, pn.id, pn.verified_name || pageData.name, 'WABA');
            }
          }
        } catch (e: any) {
          loggerService.error('system', `Aviso ao buscar WhatsApp da Página: ${e.message}`);
        }

        try {
          const wabaPageRes = await fetch(
            `${GRAPH_API_BASE}/${pageId}/whatsapp_phone_numbers?fields=id,display_phone_number,verified_name&access_token=${encodeURIComponent(token)}`
          );
          const wabaPageData: any = await wabaPageRes.json();
          for (const pn of wabaPageData.data || []) {
            if (pn.display_phone_number) {
              addPhone(pn.display_phone_number, pn.id, pn.verified_name, 'WABA');
            }
          }
        } catch {
          // ignore
        }
      }

      // 2. Consulta Ad Account WABAs
      if (adAccountId) {
        try {
          const adAccRes = await fetch(
            `${GRAPH_API_BASE}/${adAccountId}?fields=whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}&access_token=${encodeURIComponent(token)}`
          );
          const adAccData: any = await adAccRes.json();
          const wabas = adAccData.whatsapp_business_accounts?.data || [];
          for (const waba of wabas) {
            for (const pn of waba.phone_numbers?.data || []) {
              if (pn.display_phone_number) {
                addPhone(pn.display_phone_number, pn.id, pn.verified_name || waba.name, 'AD_ACCOUNT');
              }
            }
          }
        } catch (e: any) {
          loggerService.error('system', `Aviso ao buscar WABAs da conta: ${e.message}`);
        }
      }

      return {
        success: true,
        client: { id: client.id, name: client.name, pageId: client.facebookPageId },
        total: phoneNumbers.length,
        phoneNumbers,
        defaultNumber: phoneNumbers[0] || null,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Guia de Referência Completo de Objetivos e Destinos do Meta Ads (ODAX - Outcome-Driven Ad Experiences)
   */
  getCampaignObjectivesGuide() {
    return {
      success: true,
      title: 'Guia Oficial de Objetivos e Tipos de Campanhas do Meta Ads (ODAX)',
      objectives: [
        {
          id: 'OUTCOME_ENGAGEMENT',
          name: 'Engajamento',
          description: 'Aumente o número de mensagens no WhatsApp/Direct, compras por mensagens, visualizações de vídeos, engajamento com posts ou curtidas.',
          compatibleDestinations: [
            { id: 'WHATSAPP', name: 'Mensagens no WhatsApp', description: 'Direciona pessoas para iniciar conversa no WhatsApp da empresa (melhor para vendas consultivas e agendamentos).' },
            { id: 'INSTAGRAM_DIRECT', name: 'Mensagens no Instagram Direct', description: 'Inicia conversas diretamente pelo Direct do Instagram.' },
            { id: 'MESSENGER', name: 'Messenger do Facebook', description: 'Conversas no chat do Facebook.' },
            { id: 'ON_AD', name: 'Engajamento na Publicação / Vídeo', description: 'Mais curtidas, comentários, compartilhamentos ou visualizações de vídeo (ThruPlay).' },
            { id: 'WEBSITE', name: 'Conversões no Site', description: 'Engajamento ou eventos de conversão no site.' },
          ],
          defaultOptimizationGoal: 'CONVERSATIONS',
        },
        {
          id: 'OUTCOME_LEADS',
          name: 'Cadastros / Leads',
          description: 'Obtenha leads qualificados para o seu negócio por WhatsApp, formulários instantâneos ou site.',
          compatibleDestinations: [
            { id: 'WHATSAPP', name: 'WhatsApp', description: 'Geração de contatos e leads qualificados direto no WhatsApp.' },
            { id: 'ON_AD', name: 'Formulários Instantâneos (Lead Ads)', description: 'Formulário nativo dentro do Facebook/Instagram pré-preenchido com os dados do usuário.' },
            { id: 'WEBSITE', name: 'Site (Página de Captura / Landing Page)', description: 'Pixel de Lead / Cadastro no seu site externo.' },
            { id: 'MESSENGER', name: 'Messenger', description: 'Qualificação automatizada de leads via chat.' },
            { id: 'CALLS', name: 'Ligações', description: 'Incentiva pessoas a ligarem para o seu telefone comercial.' },
          ],
          defaultOptimizationGoal: 'LEAD_GENERATION',
        },
        {
          id: 'OUTCOME_TRAFFIC',
          name: 'Tráfego',
          description: 'Direcione pessoas para um destino específico, como seu site, loja virtual, aplicativo ou WhatsApp.',
          compatibleDestinations: [
            { id: 'WEBSITE', name: 'Site / Landing Page', description: 'Maximizar cliques no link ou visualizações da página de destino.' },
            { id: 'WHATSAPP', name: 'WhatsApp', description: 'Envio de tráfego direto para conversa no WhatsApp.' },
            { id: 'INSTAGRAM_DIRECT', name: 'Instagram Direct', description: 'Tráfego direcionado para o Direct.' },
            { id: 'APP', name: 'Aplicativo', description: 'Direciona para abrir ou usar o app.' },
            { id: 'CALLS', name: 'Ligações Telefônicas', description: 'Cliques para ligar.' },
          ],
          defaultOptimizationGoal: 'LINK_CLICKS',
        },
        {
          id: 'OUTCOME_SALES',
          name: 'Vendas',
          description: 'Encontre pessoas com alta probabilidade de comprar produtos ou serviços no seu site, catálogo ou WhatsApp.',
          compatibleDestinations: [
            { id: 'WEBSITE', name: 'Site / Loja Virtual (Pixel Purchase)', description: 'Otimizado para compras e ROAS no e-commerce.' },
            { id: 'WHATSAPP', name: 'WhatsApp', description: 'Fechamento de vendas diretas pelo WhatsApp.' },
            { id: 'CATALOG', name: 'Catálogo de Produtos', description: 'Anúncios dinâmicos de catálogo.' },
          ],
          defaultOptimizationGoal: 'OFFSITE_CONVERSIONS',
        },
        {
          id: 'OUTCOME_AWARENESS',
          name: 'Reconhecimento',
          description: 'Alcance o maior número de pessoas com probabilidade de lembrar da sua marca.',
          compatibleDestinations: [
            { id: 'ON_AD', name: 'No Anúncio (Alcance e Impressões)', description: 'Maximizar alcance único diário ou impressões.' },
            { id: 'VIDEO_VIEWS', name: 'Visualizações de Vídeo (ThruPlay)', description: 'Entrega para quem assiste vídeos por mais de 15 segundos.' },
          ],
          defaultOptimizationGoal: 'REACH',
        },
        {
          id: 'OUTCOME_APP_PROMOTION',
          name: 'Promoção do App',
          description: 'Encontre novas pessoas para instalar e utilizar o seu aplicativo.',
          compatibleDestinations: [
            { id: 'APP', name: 'Loja de Apps (Google Play / App Store)', description: 'Instalações e eventos dentro do aplicativo.' },
          ],
          defaultOptimizationGoal: 'APP_INSTALLS',
        },
      ],
    };
  }

  /**
   * Criação de Campanha no Meta Ads (Padrão: PAUSED / Rascunho)
   */
  async createCampaign(
    clientIdentifier: string,
    data: {
      name: string;
      objective?: 'OUTCOME_LEADS' | 'OUTCOME_TRAFFIC' | 'OUTCOME_SALES' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_AWARENESS' | 'OUTCOME_APP_PROMOTION';
      status?: 'ACTIVE' | 'PAUSED';
      dailyBudget?: number; // Se informado, vira CBO
      specialAdCategories?: string[];
    }
  ) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client || !client.adAccountId || !client.profile?.accessToken) {
      return { success: false, error: 'Conta de anúncios não configurada ou sem token.' };
    }

    const token = client.profile.accessToken;
    const adAccountId = client.adAccountId;

    const isBudgetSharing = Boolean(data.dailyBudget && data.dailyBudget > 0);
    const payload: any = {
      name: data.name,
      objective: data.objective || 'OUTCOME_ENGAGEMENT',
      status: data.status || 'PAUSED', // Segurança: sempre nasce PAUSED por padrão
      special_ad_categories: data.specialAdCategories || [],
      is_adset_budget_sharing_enabled: isBudgetSharing,
      access_token: token,
    };

    if (isBudgetSharing) {
      payload.daily_budget = Math.round(data.dailyBudget! * 100);
    }

    try {
      const res = await fetch(`${GRAPH_API_BASE}/${adAccountId}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData: any = await res.json();
      if (resData.error) {
        return { success: false, error: this.formatMetaError(resData.error) };
      }

      loggerService.system(`Campanha "${data.name}" criada no Meta Ads (${client.name}) com ID: ${resData.id} [Status: ${payload.status}]`);

      return {
        success: true,
        campaignId: resData.id,
        name: data.name,
        status: payload.status,
        objective: payload.objective,
        budgetType: data.dailyBudget ? 'CBO (Campanha)' : 'ABO (Conjuntos)',
        dailyBudget: data.dailyBudget ? `${client.currency} ${data.dailyBudget.toFixed(2)}/dia` : 'Orçamento por Conjunto (ABO)',
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Criação de Conjunto de Anúncios (AdSet - Orçamento ABO)
   */
  async createAdSet(
    clientIdentifier: string,
    data: {
      campaignId: string;
      name: string;
      dailyBudget: number; // Orçamento diário em BRL
      status?: 'ACTIVE' | 'PAUSED';
      optimizationGoal?: string; // 'LEAD_GENERATION', 'CONVERSATIONS', 'LINK_CLICKS', 'OFFSITE_CONVERSIONS', 'REACH'
      billingEvent?: string; // 'IMPRESSIONS'
      destinationType?: 'WHATSAPP' | 'INSTAGRAM_DIRECT' | 'MESSENGER' | 'WEBSITE' | 'ON_AD' | 'APP' | 'CALLS';
      whatsappPhoneNumber?: string;
      targeting?: any;
    }
  ) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client || !client.adAccountId || !client.profile?.accessToken) {
      return { success: false, error: 'Conta de anúncios não configurada ou sem token.' };
    }

    const token = client.profile.accessToken;
    const adAccountId = client.adAccountId;

    const defaultTargeting = data.targeting || {
      geo_locations: {
        countries: ['BR'],
      },
      age_min: 18,
      age_max: 65,
    };

    const budgetInCents = Math.round(data.dailyBudget * 100);
    const destType = data.destinationType || 'WHATSAPP';

    let optGoal = data.optimizationGoal;
    if (!optGoal) {
      if (destType === 'WHATSAPP' || destType === 'INSTAGRAM_DIRECT' || destType === 'MESSENGER') {
        optGoal = 'CONVERSATIONS';
      } else if (destType === 'WEBSITE') {
        optGoal = 'LINK_CLICKS';
      } else if (destType === 'ON_AD') {
        optGoal = 'LEAD_GENERATION';
      } else {
        optGoal = 'IMPRESSIONS';
      }
    }

    const payload: any = {
      campaign_id: data.campaignId,
      name: data.name,
      status: data.status || 'PAUSED',
      daily_budget: budgetInCents,
      billing_event: data.billingEvent || 'IMPRESSIONS',
      optimization_goal: optGoal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: defaultTargeting,
      access_token: token,
    };

    if (destType === 'WHATSAPP' && client.facebookPageId) {
      payload.promoted_object = {
        page_id: client.facebookPageId,
        ...(data.whatsappPhoneNumber ? { whatsapp_phone_number: data.whatsappPhoneNumber } : {}),
      };
      payload.destination_type = 'WHATSAPP';
    } else if (destType === 'MESSENGER' && client.facebookPageId) {
      payload.promoted_object = { page_id: client.facebookPageId };
      payload.destination_type = 'MESSENGER';
    } else if (destType === 'INSTAGRAM_DIRECT' && client.facebookPageId) {
      payload.promoted_object = { page_id: client.facebookPageId };
      payload.destination_type = 'INSTAGRAM_DIRECT';
    } else if (destType === 'WEBSITE') {
      payload.destination_type = 'WEBSITE';
    }

    try {
      const res = await fetch(`${GRAPH_API_BASE}/${adAccountId}/adsets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData: any = await res.json();
      if (resData.error) {
        return { success: false, error: this.formatMetaError(resData.error) };
      }

      loggerService.system(`Conjunto "${data.name}" criado no Meta Ads (${client.name}) com ID: ${resData.id} [Orçamento: R$ ${data.dailyBudget}/dia]`);

      return {
        success: true,
        adsetId: resData.id,
        campaignId: data.campaignId,
        name: data.name,
        status: payload.status,
        destinationType: destType,
        dailyBudget: `${client.currency} ${data.dailyBudget.toFixed(2)}/dia`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Criação de Criativo e Anúncio (Suporta Imagem Uploaded, Imagem da Biblioteca ou Post do Instagram)
   */
  async createAdCreativeAndAd(
    clientIdentifier: string,
    data: {
      adsetId: string;
      name: string;
      headline: string;
      bodyText: string;
      imageHash?: string;
      imageUrl?: string;
      instagramMediaId?: string; // Método 2: ID ou Link de Post do Instagram
      callToActionType?: 'WHATSAPP_MESSAGE' | 'CONTACT_US' | 'LEARN_MORE' | 'ORDER_NOW';
      websiteUrl?: string;
      status?: 'ACTIVE' | 'PAUSED';
    }
  ) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client || !client.adAccountId || !client.profile?.accessToken) {
      return { success: false, error: 'Conta de anúncios não configurada ou sem token.' };
    }

    const token = client.profile.accessToken;
    const adAccountId = client.adAccountId;

    try {
      // 1. Se foi passada uma URL de imagem mas não o hash, faz o upload automático (Método 4)
      let finalImageHash = data.imageHash;
      if (!finalImageHash && data.imageUrl && !data.instagramMediaId) {
        const uploadRes = await this.uploadAdImage(clientIdentifier, { url: data.imageUrl });
        if (uploadRes.success && uploadRes.hash) {
          finalImageHash = uploadRes.hash;
        } else {
          return { success: false, error: `Falha ao fazer upload da imagem: ${uploadRes.error}` };
        }
      }

      // 2. Monta o AdCreative
      const creativePayload: any = {
        name: `Criativo - ${data.name}`,
        access_token: token,
      };

      if (data.instagramMediaId) {
        // Método 2: Post do Instagram (Dark Post / Orgânico)
        creativePayload.source_instagram_media_id = data.instagramMediaId;
      } else {
        // Método 1, 3 ou 4: Link Data com Imagem, Headline e Copy
        const pageId = client.facebookPageId;
        if (!pageId) {
          return { success: false, error: 'Página do Facebook não configurada no cadastro do cliente (necessária para veicular anúncios).' };
        }

        const linkUrl = data.websiteUrl || `https://facebook.com/${pageId}`;
        const ctaType = data.callToActionType || 'WHATSAPP_MESSAGE';
        const ctaValue: any = { link: linkUrl };
        if (ctaType === 'WHATSAPP_MESSAGE') {
          ctaValue.app_destination = 'WHATSAPP';
        }

        creativePayload.object_story_spec = {
          page_id: pageId,
          ...(client.instagramAccountId ? { instagram_user_id: client.instagramAccountId } : {}),
          link_data: {
            link: linkUrl,
            message: data.bodyText,
            name: data.headline,
            ...(finalImageHash ? { image_hash: finalImageHash } : {}),
            call_to_action: {
              type: ctaType,
              value: ctaValue,
            },
          },
        };
      }

      const creativeRes = await fetch(`${GRAPH_API_BASE}/${adAccountId}/adcreatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creativePayload),
      });

      const creativeData: any = await creativeRes.json();
      if (creativeData.error) {
        return { success: false, error: `Erro ao criar criativo: ${this.formatMetaError(creativeData.error)}` };
      }

      const creativeId = creativeData.id;

      // 3. Cria o Anúncio (Ad) associando o AdSet e o AdCreative
      const adPayload = {
        name: data.name,
        adset_id: data.adsetId,
        creative: { creative_id: creativeId },
        status: data.status || 'PAUSED', // Sempre nasce PAUSED por segurança
        access_token: token,
      };

      const adRes = await fetch(`${GRAPH_API_BASE}/${adAccountId}/ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adPayload),
      });

      const adData: any = await adRes.json();
      if (adData.error) {
        return { success: false, error: `Erro ao criar anúncio: ${this.formatMetaError(adData.error)}` };
      }

      loggerService.system(`Anúncio "${data.name}" criado no Meta Ads (${client.name}) com ID: ${adData.id} [Status: ${adPayload.status}]`);

      return {
        success: true,
        adId: adData.id,
        creativeId,
        name: data.name,
        adsetId: data.adsetId,
        headline: data.headline,
        bodyText: data.bodyText,
        status: adPayload.status,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Criação Completa de Campanha, Conjunto e Anúncio em 1 Passo (Modo Rascunho / PAUSED)
   */
  async createCompleteDraftCampaign(
    clientIdentifier: string,
    input: {
      campaignName: string;
      objective?: 'OUTCOME_LEADS' | 'OUTCOME_TRAFFIC' | 'OUTCOME_SALES' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_AWARENESS' | 'OUTCOME_APP_PROMOTION';
      adsetName?: string;
      adName?: string;
      dailyBudget: number; // Orçamento diário do conjunto em BRL
      headline: string;
      bodyText: string;
      imageHash?: string;
      imageUrl?: string;
      imageBase64?: string;
      instagramMediaId?: string;
      targetAudienceDescription?: string;
      destinationType?: 'WHATSAPP' | 'WEBSITE' | 'INSTAGRAM_DIRECT' | 'MESSENGER' | 'ON_AD' | 'APP' | 'CALLS';
      whatsappPhoneNumber?: string;
      websiteUrl?: string;
    }
  ) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client) {
      return { success: false, error: `Cliente "${clientIdentifier}" não encontrado.` };
    }

    try {
      // 1. Se foi enviado base64 de imagem (ex: foto enviada no WhatsApp), faz o upload
      let finalHash = input.imageHash;
      if (!finalHash && input.imageBase64) {
        const uploadRes = await this.uploadAdImage(clientIdentifier, {
          base64: input.imageBase64,
          filename: `whatsapp_${Date.now()}.jpg`,
        });
        if (uploadRes.success && uploadRes.hash) {
          finalHash = uploadRes.hash;
        } else {
          return { success: false, error: `Falha ao processar foto enviada: ${uploadRes.error}` };
        }
      }

      // 2. Cria Campanha (PAUSED)
      const objective = input.objective || 'OUTCOME_ENGAGEMENT';
      const campRes = await this.createCampaign(clientIdentifier, {
        name: input.campaignName,
        objective,
        status: 'PAUSED',
      });
      if (!campRes.success || !campRes.campaignId) {
        return { success: false, error: `Falha ao criar Campanha: ${campRes.error}` };
      }

      // 3. Cria Conjunto de Anúncios (PAUSED com orçamento ABO)
      const adsetName = input.adsetName || `CJ - ${input.targetAudienceDescription || 'Público Geral'}`;
      const destType = input.destinationType || 'WHATSAPP';
      const adsetRes = await this.createAdSet(clientIdentifier, {
        campaignId: campRes.campaignId,
        name: adsetName,
        dailyBudget: input.dailyBudget,
        status: 'PAUSED',
        destinationType: destType,
        whatsappPhoneNumber: input.whatsappPhoneNumber,
      });
      if (!adsetRes.success || !adsetRes.adsetId) {
        return { success: false, error: `Falha ao criar Conjunto: ${adsetRes.error}` };
      }

      // 4. Cria Criativo e Anúncio (PAUSED)
      const adName = input.adName || `AD - ${input.headline.slice(0, 30)}`;
      const ctaType = destType === 'WHATSAPP' ? 'WHATSAPP_MESSAGE' : (destType === 'WEBSITE' ? 'LEARN_MORE' : 'CONTACT_US');
      const adRes = await this.createAdCreativeAndAd(clientIdentifier, {
        adsetId: adsetRes.adsetId,
        name: adName,
        headline: input.headline,
        bodyText: input.bodyText,
        imageHash: finalHash,
        imageUrl: input.imageUrl,
        instagramMediaId: input.instagramMediaId,
        callToActionType: ctaType as any,
        websiteUrl: input.websiteUrl,
        status: 'PAUSED',
      });
      if (!adRes.success || !adRes.adId) {
        return { success: false, error: `Falha ao criar Anúncio: ${adRes.error}` };
      }

      const objectiveNameMap: Record<string, string> = {
        OUTCOME_ENGAGEMENT: 'Engajamento (Mensagens / Conversas)',
        OUTCOME_LEADS: 'Cadastros / Leads',
        OUTCOME_TRAFFIC: 'Tráfego',
        OUTCOME_SALES: 'Vendas',
        OUTCOME_AWARENESS: 'Reconhecimento de Marca',
        OUTCOME_APP_PROMOTION: 'Promoção do App',
      };

      const destNameMap: Record<string, string> = {
        WHATSAPP: `WhatsApp ${input.whatsappPhoneNumber ? `(${input.whatsappPhoneNumber})` : ''}`,
        INSTAGRAM_DIRECT: 'Instagram Direct',
        MESSENGER: 'Facebook Messenger',
        WEBSITE: 'Site / Landing Page Externa',
        ON_AD: 'Formulário Nativo / No Anúncio',
        APP: 'Aplicativo',
        CALLS: 'Ligações',
      };

      return {
        success: true,
        client: { id: client.id, name: client.name },
        campaign: { id: campRes.campaignId, name: input.campaignName, objective, status: 'PAUSED' },
        adset: { id: adsetRes.adsetId, name: adsetName, dailyBudget: `${client.currency} ${input.dailyBudget.toFixed(2)}/dia`, destination: destType, status: 'PAUSED' },
        ad: { id: adRes.adId, name: adName, headline: input.headline, bodyText: input.bodyText, status: 'PAUSED' },
        approvalCard: `📋 *Rascunho de Campanha Criado com Sucesso!*
🏢 *Cliente:* ${client.name}
🏷️ *Campanha:* ${input.campaignName}
🎯 *Objetivo:* ${objectiveNameMap[objective] || objective}
📍 *Destino:* ${destNameMap[destType] || destType}
👥 *Conjunto:* ${adsetName} (${client.currency} ${input.dailyBudget.toFixed(2)}/dia)
📝 *Headline:* "${input.headline}"
📄 *Copy:* "${input.bodyText.length > 120 ? input.bodyText.slice(0, 117) + '...' : input.bodyText}"
⏸️ *Status:* PAUSADA (Rascunho aguardando aprovação)

👉 *Deseja que eu ative essa campanha agora ou quer alterar algum detalhe?*`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // =========================================================================
  // 9. INSTAGRAM & FACEBOOK ORGANIC INSIGHTS (GRAPH API v21+)
  // =========================================================================

  /**
   * Helper para obter o Page Access Token (necessário para certas métricas da Página)
   */
  private async getPageAccessToken(client: any): Promise<string> {
    if (client.facebookPageToken) {
      return client.facebookPageToken;
    }
    const userToken = client.profile?.accessToken;
    if (!userToken || !client.facebookPageId) {
      return userToken || '';
    }

    try {
      const res = await fetch(`${GRAPH_API_BASE}/me/accounts?access_token=${encodeURIComponent(userToken)}`);
      const data: any = await res.json();
      const page = (data.data || []).find((p: any) => p.id === client.facebookPageId);
      if (page && page.access_token) {
        // Atualiza no banco para cache
        await prisma.metaClient.update({
          where: { id: client.id },
          data: { facebookPageToken: page.access_token },
        }).catch(() => {});
        return page.access_token;
      }
    } catch {
      // ignore
    }
    return userToken;
  }

  /**
   * Helper para descobrir / auto-vincular o Instagram Business ID se não estiver preenchido
   */
  private async resolveInstagramAccountId(client: any): Promise<string | null> {
    if (client.instagramAccountId) {
      return client.instagramAccountId;
    }
    const token = client.profile?.accessToken;
    if (!token || !client.facebookPageId) return null;

    try {
      const res = await fetch(`${GRAPH_API_BASE}/${client.facebookPageId}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`);
      const data: any = await res.json();
      if (data.instagram_business_account?.id) {
        const igId = data.instagram_business_account.id;
        const igUsername = data.instagram_business_account.username;
        await prisma.metaClient.update({
          where: { id: client.id },
          data: {
            instagramAccountId: igId,
            instagramUsername: igUsername ? `@${igUsername}` : client.instagramUsername,
          },
        }).catch(() => {});
        return igId;
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Insights Orgânicos do Instagram (Seguidores, Alcance, Visualizações, Engajamento e Melhores Reels/Posts)
   */
  async getInstagramInsights(
    clientIdentifier: string,
    options: {
      days?: number; // Padrão: 30 dias
      limitPosts?: number; // Padrão: 5 posts
    } = {}
  ) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client) {
      return { success: false, error: `Cliente "${clientIdentifier}" não encontrado.` };
    }

    const token = client.profile?.accessToken;
    if (!token) {
      return { success: false, error: `O cliente ${client.name} não possui token Meta conectado.` };
    }

    const igId = await this.resolveInstagramAccountId(client);
    if (!igId) {
      return {
        success: false,
        error: `Nenhuma conta comercial do Instagram vinculada ao cliente ${client.name}. Conecte a conta do Instagram à Página do Facebook no Meta Business Suite.`,
      };
    }

    const days = options.days || 30;
    const limitPosts = options.limitPosts || 6;
    const nowSec = Math.floor(Date.now() / 1000);
    const sinceSec = nowSec - days * 86400;

    try {
      // 1. Dados do Perfil do Instagram
      const profilePromise = fetch(
        `${GRAPH_API_BASE}/${igId}?fields=id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count,website&access_token=${encodeURIComponent(token)}`
      ).then((r) => r.json());

      // 2. Métricas Agregadas do Período (Graph API v21+)
      const metricsList = 'reach,accounts_engaged,total_interactions,likes,comments,shares,saves,views,profile_views';
      const insightsPromise = fetch(
        `${GRAPH_API_BASE}/${igId}/insights?metric=${metricsList}&period=day&since=${sinceSec}&until=${nowSec}&metric_type=total_value&access_token=${encodeURIComponent(token)}`
      ).then((r) => r.json());

      // 3. Posts / Reels Recentes
      const mediaPromise = fetch(
        `${GRAPH_API_BASE}/${igId}/media?fields=id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url,media_url,like_count,comments_count&limit=${limitPosts}&access_token=${encodeURIComponent(token)}`
      ).then((r) => r.json());

      const [profileData, insightsData, mediaData] = await Promise.all([
        profilePromise,
        insightsPromise,
        mediaPromise,
      ]);

      if (profileData.error) {
        return { success: false, error: `Erro ao consultar perfil do Instagram: ${profileData.error.message}` };
      }

      // Processa métricas agregadas
      const metricsMap: Record<string, number> = {};
      if (Array.isArray(insightsData.data)) {
        for (const item of insightsData.data) {
          const val = item.total_value?.value || (Array.isArray(item.values) && item.values.length > 0 ? item.values[0].value : 0);
          metricsMap[item.name] = typeof val === 'number' ? val : parseInt(val || '0', 10);
        }
      }

      // Processa posts e busca insights individuais
      const rawPosts = mediaData.data || [];
      const posts: any[] = [];

      for (const p of rawPosts) {
        let postInsights: any = {};
        try {
          const postInsRes = await fetch(
            `${GRAPH_API_BASE}/${p.id}/insights?metric=reach,total_interactions,saved,shares,likes,comments,views&access_token=${encodeURIComponent(token)}`
          );
          const postInsJson: any = await postInsRes.json();
          if (Array.isArray(postInsJson.data)) {
            for (const m of postInsJson.data) {
              const val = Array.isArray(m.values) && m.values.length > 0 ? m.values[0].value : 0;
              postInsights[m.name] = typeof val === 'number' ? val : parseInt(val || '0', 10);
            }
          }
        } catch {
          // ignore individual post error
        }

        const likes = postInsights.likes ?? p.like_count ?? 0;
        const comments = postInsights.comments ?? p.comments_count ?? 0;
        const shares = postInsights.shares ?? 0;
        const saves = postInsights.saved ?? 0;
        const reach = postInsights.reach ?? 0;
        const views = postInsights.views ?? 0;
        const interactions = postInsights.total_interactions ?? (likes + comments + shares + saves);

        posts.push({
          id: p.id,
          caption: p.caption || '',
          captionPreview: p.caption ? (p.caption.length > 80 ? p.caption.slice(0, 77) + '...' : p.caption) : '(Sem legenda)',
          mediaType: p.media_product_type === 'REELS' ? 'REELS' : p.media_type,
          permalink: p.permalink,
          thumbnailUrl: p.thumbnail_url || p.media_url || null,
          timestamp: p.timestamp,
          likes,
          comments,
          shares,
          saves,
          reach,
          views,
          totalInteractions: interactions,
        });
      }

      // Ordena posts por engajamento/interações decrescente
      posts.sort((a, b) => b.totalInteractions - a.totalInteractions);

      const reach = metricsMap.reach || 0;
      const views = metricsMap.views || 0;
      const totalInteractions = metricsMap.total_interactions || 0;
      const accountsEngaged = metricsMap.accounts_engaged || 0;
      const likes = metricsMap.likes || 0;
      const comments = metricsMap.comments || 0;
      const shares = metricsMap.shares || 0;
      const saves = metricsMap.saves || 0;
      const profileVisits = metricsMap.profile_views || 0;
      const followers = profileData.followers_count || 0;

      const engagementRate = reach > 0 ? ((totalInteractions / reach) * 100).toFixed(2) : '0.00';

      const fmt = (n: number) => n.toLocaleString('pt-BR');

      let topPostsSummary = '';
      if (posts.length > 0) {
        topPostsSummary = posts.slice(0, 3).map((p, idx) => {
          const typeEmoji = p.mediaType === 'REELS' ? '🎬 [Reels]' : p.mediaType === 'VIDEO' ? '🎥 [Vídeo]' : '📸 [Post]';
          return `${idx + 1}️⃣ ${typeEmoji} *${p.captionPreview}*\n   ❤️ ${fmt(p.likes)} curtidas · 💬 ${fmt(p.comments)} comentários · 🔄 ${fmt(p.shares)} envios · 👁️ ${fmt(p.views || p.reach)} visualizações\n   🔗 ${p.permalink}`;
        }).join('\n\n');
      } else {
        topPostsSummary = '_Nenhum post publicado recentemente._';
      }

      const summaryCard = `📊 *Insights Orgânicos do Instagram — @${profileData.username}*
🗓️ *Período:* Últimos ${days} dias (${client.name})

👥 *Perfil & Audiência:*
• *Seguidores:* ${fmt(followers)}
• *Seguindo:* ${fmt(profileData.follows_count || 0)}
• *Total de Publicações:* ${fmt(profileData.media_count || 0)}
• *Visitas ao Perfil:* ${fmt(profileVisits)}

📈 *Alcance & Desempenho:*
• *Contas Alcançadas:* ${fmt(reach)}
• *Visualizações Totais:* ${fmt(views)}
• *Contas com Engajamento:* ${fmt(accountsEngaged)}
• *Taxa de Engajamento/Alcance:* ${engagementRate}%

💬 *Interações Totais (${fmt(totalInteractions)}):*
• ❤️ *Curtidas:* ${fmt(likes)}
• 💬 *Comentários:* ${fmt(comments)}
• 🔄 *Compartilhamentos / Envios:* ${fmt(shares)}
• 🔖 *Salvamentos:* ${fmt(saves)}

🏆 *Publicações / Reels em Destaque:*
${topPostsSummary}`;

      return {
        success: true,
        client: {
          id: client.id,
          name: client.name,
          instagramUsername: `@${profileData.username}`,
        },
        profile: {
          id: profileData.id,
          username: profileData.username,
          name: profileData.name,
          biography: profileData.biography,
          profilePictureUrl: profileData.profile_picture_url,
          followersCount: followers,
          followsCount: profileData.follows_count || 0,
          mediaCount: profileData.media_count || 0,
          website: profileData.website || null,
        },
        period: {
          days,
          since: new Date(sinceSec * 1000).toISOString().split('T')[0],
          until: new Date(nowSec * 1000).toISOString().split('T')[0],
        },
        metrics: {
          reach,
          views,
          accountsEngaged,
          totalInteractions,
          likes,
          comments,
          shares,
          saves,
          profileVisits,
          engagementRate: Number(engagementRate),
        },
        topPosts: posts,
        summaryCard,
      };
    } catch (err: any) {
      loggerService.error('system', `Erro ao puxar Instagram Insights (${client.name}): ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Insights Orgânicos da Página do Facebook (Fãs, Seguidores, Engajamento e Posts Recentes)
   */
  async getFacebookPageInsights(
    clientIdentifier: string,
    options: {
      limitPosts?: number; // Padrão: 5 posts
    } = {}
  ) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client) {
      return { success: false, error: `Cliente "${clientIdentifier}" não encontrado.` };
    }

    if (!client.facebookPageId) {
      return {
        success: false,
        error: `Nenhuma Página do Facebook vinculada ao cliente ${client.name}.`,
      };
    }

    const pageToken = await this.getPageAccessToken(client);
    const pageId = client.facebookPageId;
    const limitPosts = options.limitPosts || 5;

    try {
      // 1. Detalhes da Página e Feed
      const pageUrl = `${GRAPH_API_BASE}/${pageId}?fields=id,name,fan_count,followers_count,talking_about_count,category,link,about,posts.limit(${limitPosts}){id,message,story,created_time,full_picture,permalink_url,shares,reactions.summary(total_count),comments.summary(total_count)}&access_token=${encodeURIComponent(pageToken)}`;
      const pageRes = await fetch(pageUrl);
      const pageData: any = await pageRes.json();

      if (pageData.error) {
        return { success: false, error: `Erro na Página do Facebook: ${pageData.error.message}` };
      }

      const followers = pageData.followers_count || pageData.fan_count || 0;
      const fans = pageData.fan_count || 0;
      const talkingAbout = pageData.talking_about_count || 0;

      const rawPosts = pageData.posts?.data || [];
      const posts: any[] = [];
      let totalPostReactions = 0;
      let totalPostComments = 0;
      let totalPostShares = 0;

      for (const p of rawPosts) {
        const reactions = p.reactions?.summary?.total_count || 0;
        const comments = p.comments?.summary?.total_count || 0;
        const shares = p.shares?.count || 0;
        const interactions = reactions + comments + shares;

        totalPostReactions += reactions;
        totalPostComments += comments;
        totalPostShares += shares;

        posts.push({
          id: p.id,
          message: p.message || p.story || '(Publicação sem texto)',
          messagePreview: (p.message || p.story || '').slice(0, 80),
          createdTime: p.created_time,
          permalinkUrl: p.permalink_url,
          fullPicture: p.full_picture || null,
          reactions,
          comments,
          shares,
          totalInteractions: interactions,
        });
      }

      const fmt = (n: number) => n.toLocaleString('pt-BR');

      let postsSummary = '';
      if (posts.length > 0) {
        postsSummary = posts.slice(0, 3).map((p, idx) => {
          return `${idx + 1}️⃣ *${p.messagePreview || 'Post'}*\n   👍 ${fmt(p.reactions)} reações · 💬 ${fmt(p.comments)} comentários · 🔄 ${fmt(p.shares)} compartilhamentos\n   🔗 ${p.permalinkUrl || `https://facebook.com/${p.id}`}`;
        }).join('\n\n');
      } else {
        postsSummary = '_Nenhuma publicação recente no feed da Página._';
      }

      const summaryCard = `📘 *Insights da Página do Facebook — ${pageData.name}*
🏢 *Cliente:* ${client.name}

👥 *Audiência da Página:*
• *Seguidores:* ${fmt(followers)}
• *Curtidas na Página (Fãs):* ${fmt(fans)}
• *Pessoas Falando Sobre:* ${fmt(talkingAbout)}
• *Categoria:* ${pageData.category || 'Empresa / Negócio'}

📝 *Engajamento nas Últimas Publicações:*
• 👍 *Reações:* ${fmt(totalPostReactions)}
• 💬 *Comentários:* ${fmt(totalPostComments)}
• 🔄 *Compartilhamentos:* ${fmt(totalPostShares)}

🏆 *Publicações Recentes no Facebook:*
${postsSummary}`;

      return {
        success: true,
        client: { id: client.id, name: client.name, facebookPageName: pageData.name },
        page: {
          id: pageData.id,
          name: pageData.name,
          category: pageData.category,
          link: pageData.link,
          followersCount: followers,
          fanCount: fans,
          talkingAboutCount: talkingAbout,
        },
        recentPosts: posts,
        summaryCard,
      };
    } catch (err: any) {
      loggerService.error('system', `Erro ao puxar Facebook Insights (${client.name}): ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Visão Geral 360º de Redes Sociais & Tráfego Pago (Instagram + Facebook + Meta Ads)
   */
  async getSocialMediaOverview(clientIdentifier: string) {
    const client = await this.getClientByIdentifier(clientIdentifier);
    if (!client) {
      return { success: false, error: `Cliente "${clientIdentifier}" não encontrado.` };
    }

    const [igRes, fbRes, adsRes] = await Promise.all([
      this.getInstagramInsights(clientIdentifier, { days: 30, limitPosts: 3 }).catch((e) => ({ success: false, error: e.message })),
      this.getFacebookPageInsights(clientIdentifier, { limitPosts: 3 }).catch((e) => ({ success: false, error: e.message })),
      this.getAdAccountInsights(clientIdentifier, { datePreset: 'last_30d' }).catch((e) => ({ success: false, error: e.message })),
    ]);

    let card = `🌐 *Visão Geral 360º de Redes Sociais & Anúncios*\n🏢 *Cliente:* ${client.name}\n\n`;

    if (igRes.success && (igRes as any).metrics) {
      const ig = igRes as any;
      card += `📸 *Instagram (@${ig.profile?.username}) — 30 Dias:*\n`;
      card += `• 👥 Seguidores: ${ig.profile?.followersCount?.toLocaleString('pt-BR') || 0}\n`;
      card += `• 📈 Alcance: ${ig.metrics?.reach?.toLocaleString('pt-BR') || 0} contas\n`;
      card += `• 👁️ Visualizações: ${ig.metrics?.views?.toLocaleString('pt-BR') || 0}\n`;
      card += `• 💬 Interações: ${ig.metrics?.totalInteractions?.toLocaleString('pt-BR') || 0} (❤️ ${ig.metrics?.likes?.toLocaleString('pt-BR')} curtidas, 🔄 ${ig.metrics?.shares?.toLocaleString('pt-BR')} envios)\n\n`;
    }

    if (fbRes.success && (fbRes as any).page) {
      const fb = fbRes as any;
      card += `📘 *Facebook (${fb.page?.name}):*\n`;
      card += `• 👥 Seguidores: ${fb.page?.followersCount?.toLocaleString('pt-BR') || 0}\n`;
      card += `• 👍 Curtidas na Página: ${fb.page?.fanCount?.toLocaleString('pt-BR') || 0}\n\n`;
    }

    if (adsRes.success && (adsRes as any).metrics) {
      const ads = adsRes as any;
      card += `🎯 *Meta Ads (Tráfego Pago — 30 Dias):*\n`;
      card += `• 💰 Investimento: ${ads.metrics?.spendFormatted || 'R$ 0,00'}\n`;
      card += `• 🎯 Leads / Conversões: ${ads.metrics?.leads || 0}\n`;
      card += `• 🏷️ CPL Médio: ${ads.metrics?.costPerLeadFormatted || 'N/A'}\n`;
      card += `• 👆 Cliques: ${ads.metrics?.clicks?.toLocaleString('pt-BR') || 0} (CTR: ${ads.metrics?.ctr}%)\n`;
    }

    return {
      success: true,
      client: { id: client.id, name: client.name },
      instagram: igRes.success ? igRes : null,
      facebook: fbRes.success ? fbRes : null,
      metaAds: adsRes.success ? adsRes : null,
      summaryCard: card,
    };
  }
}

export const metaService = new MetaService();


