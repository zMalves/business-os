import { prisma } from '../database/client.js';
import { loggerService } from './logger.service.js';

let googleModule: any = null;
async function getGoogle() {
  if (!googleModule) {
    try {
      const g = await import('googleapis');
      googleModule = g.google || g.default?.google || g.default || g;
    } catch (e: any) {
      loggerService.error('system', `Biblioteca googleapis ainda não instalada no container: ${e.message}`);
      return null;
    }
  }
  return googleModule;
}

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export interface CreateEventOptions {
  summary: string;
  description?: string;
  location?: string;
  startDateTime: string;
  endDateTime?: string;
  durationMinutes?: number;
  attendees?: string[];
  createMeetLink?: boolean;
}

export class GoogleService {
  private clientId: string;
  private clientSecret: string;
  private defaultRedirectUri: string;

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    this.defaultRedirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://b-os.malves.dev.br/api/auth/google/callback';
  }

  private async createOAuth2Client(redirectUri?: string) {
    const google = await getGoogle();
    if (!google) return null;
    const clientId = (process.env.GOOGLE_CLIENT_ID || this.clientId || '').replace(/^["']|["']$/g, '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || this.clientSecret || '').replace(/^["']|["']$/g, '').trim();
    const defaultUri = (process.env.GOOGLE_REDIRECT_URI || this.defaultRedirectUri || 'https://b-os.malves.dev.br/api/auth/google/callback').replace(/^["']|["']$/g, '').trim();

    if (!clientId) {
      throw new Error('GOOGLE_CLIENT_ID não encontrado no ambiente do servidor.');
    }

    return new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri || defaultUri
    );
  }

  /**
   * Gera a URL para autenticação e consentimento OAuth do Google
   */
  async getAuthUrl(redirectUri?: string): Promise<string> {
    const oauth2Client = await this.createOAuth2Client(redirectUri);
    if (!oauth2Client) {
      throw new Error('Módulo googleapis não inicializado.');
    }
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPES,
      include_granted_scopes: true,
    });
  }

  /**
   * Processa o código retornado pelo Google e persiste os tokens no banco
   */
  async handleCallback(code: string, redirectUri?: string) {
    try {
      const google = await getGoogle();
      const oauth2Client = await this.createOAuth2Client(redirectUri);
      if (!oauth2Client || !google) {
        throw new Error('Google OAuth Client não disponível.');
      }

      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      const email = userInfo.data.email || 'Conta Google Conectada';

      const expiryDate = tokens.expiry_date ? BigInt(tokens.expiry_date) : null;

      const saved = await prisma.googleAuth.upsert({
        where: { id: 'default' },
        update: {
          email,
          accessToken: tokens.access_token || '',
          refreshToken: tokens.refresh_token || undefined,
          tokenType: tokens.token_type || 'Bearer',
          scope: tokens.scope || GOOGLE_SCOPES.join(' '),
          expiryDate,
        },
        create: {
          id: 'default',
          email,
          accessToken: tokens.access_token || '',
          refreshToken: tokens.refresh_token || null,
          tokenType: tokens.token_type || 'Bearer',
          scope: tokens.scope || GOOGLE_SCOPES.join(' '),
          expiryDate,
        },
      });

      loggerService.system(`✅ Conta Google (${email}) conectada e autorizada com sucesso!`, { email });
      return { success: true, email, auth: saved };
    } catch (error: any) {
      loggerService.error('system', `❌ Falha ao autenticar com Google OAuth: ${error.message}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Retorna um cliente OAuth2 autenticado com renovação automática de tokens
   */
  async getAuthenticatedClient() {
    const authData = await prisma.googleAuth.findUnique({
      where: { id: 'default' },
    });

    if (!authData || !authData.accessToken) {
      return null;
    }

    const oauth2Client = await this.createOAuth2Client();
    if (!oauth2Client) return null;

    oauth2Client.setCredentials({
      access_token: authData.accessToken,
      refresh_token: authData.refreshToken || undefined,
      token_type: authData.tokenType || 'Bearer',
      scope: authData.scope || undefined,
      expiry_date: authData.expiryDate ? Number(authData.expiryDate) : undefined,
    });

    oauth2Client.on('tokens', async (newTokens: any) => {
      try {
        await prisma.googleAuth.update({
          where: { id: 'default' },
          data: {
            accessToken: newTokens.access_token || undefined,
            refreshToken: newTokens.refresh_token || undefined,
            expiryDate: newTokens.expiry_date ? BigInt(newTokens.expiry_date) : undefined,
          },
        });
        loggerService.system('🔄 Token de acesso do Google renovado automaticamente.');
      } catch (err: any) {
        loggerService.error('system', `Erro ao salvar token renovado: ${err.message}`);
      }
    });

    return oauth2Client;
  }

  /**
   * Status da conexão com a conta Google
   */
  async getStatus() {
    const authData = await prisma.googleAuth.findUnique({
      where: { id: 'default' },
    });

    if (!authData || !authData.accessToken) {
      return { connected: false };
    }

    return {
      connected: true,
      email: authData.email || 'Conectado',
      updatedAt: authData.updatedAt,
    };
  }

  /**
   * Desconecta a conta Google
   */
  async disconnect() {
    try {
      await prisma.googleAuth.deleteMany({
        where: { id: 'default' },
      });
      loggerService.system('Conta Google desconectada.');
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // GOOGLE CALENDAR
  // ==========================================

  async listCalendarEvents(options: { timeMin?: string; timeMax?: string; maxResults?: number; query?: string } = {}) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return {
        connected: false,
        error: 'Conta Google não conectada. Conecte sua conta Google no painel para acessar sua agenda.',
        events: [],
      };
    }

    try {
      const calendar = google.calendar({ version: 'v3', auth });
      const now = new Date();
      const timeMin = options.timeMin || now.toISOString();

      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax: options.timeMax,
        maxResults: options.maxResults || 15,
        singleEvents: true,
        orderBy: 'startTime',
        q: options.query,
      });

      const items = (res.data.items || []).map((e: any) => ({
        id: e.id,
        summary: e.summary || 'Sem título',
        description: e.description || null,
        location: e.location || null,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        hangoutLink: e.hangoutLink || e.conferenceData?.entryPoints?.[0]?.uri || null,
        htmlLink: e.htmlLink,
        status: e.status,
        attendees: (e.attendees || []).map((a: any) => ({ email: a.email, name: a.displayName, responseStatus: a.responseStatus })),
      }));

      return {
        connected: true,
        count: items.length,
        events: items,
      };
    } catch (error: any) {
      loggerService.error('agent', `Erro ao listar eventos do Google Calendar: ${error.message}`);
      return { connected: true, error: error.message, events: [] };
    }
  }

  async createCalendarEvent(options: CreateEventOptions) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return {
        connected: false,
        error: 'Conta Google não conectada. Conecte sua conta Google para criar compromissos na agenda.',
      };
    }

    try {
      const calendar = google.calendar({ version: 'v3', auth });
      const startDate = new Date(options.startDateTime);
      let endDate: Date;

      if (options.endDateTime) {
        endDate = new Date(options.endDateTime);
      } else {
        const duration = options.durationMinutes || 60;
        endDate = new Date(startDate.getTime() + duration * 60 * 1000);
      }

      const eventBody: any = {
        summary: options.summary,
        description: options.description || undefined,
        location: options.location || undefined,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: 'America/Sao_Paulo',
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'America/Sao_Paulo',
        },
      };

      if (options.attendees && options.attendees.length > 0) {
        eventBody.attendees = options.attendees.map((email) => ({ email: email.trim() }));
      }

      const shouldAddMeet = options.createMeetLink !== false;
      if (shouldAddMeet) {
        eventBody.conferenceData = {
          createRequest: {
            requestId: `meet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        };
      }

      const res = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: eventBody,
        conferenceDataVersion: shouldAddMeet ? 1 : 0,
        sendUpdates: options.attendees && options.attendees.length > 0 ? 'all' : 'none',
      });

      const created = res.data;
      const meetLink = created.hangoutLink || created.conferenceData?.entryPoints?.[0]?.uri || null;

      loggerService.agent(`📅 Evento criado no Google Calendar: "${options.summary}" para ${startDate.toLocaleString('pt-BR')}`, {
        summary: options.summary,
        meetLink,
        start: startDate.toISOString(),
      });

      return {
        success: true,
        eventId: created.id,
        summary: created.summary,
        description: created.description,
        start: created.start?.dateTime || created.start?.date,
        end: created.end?.dateTime || created.end?.date,
        location: created.location || null,
        meetLink,
        htmlLink: created.htmlLink,
        attendees: created.attendees || [],
      };
    } catch (error: any) {
      loggerService.error('agent', `Erro ao criar evento no Google Calendar: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async deleteCalendarEvent(eventId: string) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return { connected: false, error: 'Conta Google não conectada.' };
    }

    try {
      const calendar = google.calendar({ version: 'v3', auth });
      await calendar.events.delete({
        calendarId: 'primary',
        eventId,
      });

      return { success: true, message: 'Evento excluído do Google Calendar com sucesso.' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // GOOGLE CONTACTS
  // ==========================================

  async searchContacts(query: string) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return { connected: false, error: 'Conta Google não conectada.', contacts: [] };
    }

    try {
      const people = google.people({ version: 'v1', auth });
      const res = await people.people.searchContacts({
        query,
        readMask: 'names,emailAddresses,phoneNumbers,organizations',
      });

      const results = (res.data.results || []).map((r: any) => {
        const person = r.person;
        const name = person?.names?.[0]?.displayName || 'Sem nome';
        const emails = (person?.emailAddresses || []).map((e: any) => e.value || '').filter(Boolean);
        const phones = (person?.phoneNumbers || []).map((p: any) => p.value || '').filter(Boolean);
        const org = person?.organizations?.[0]?.name || null;

        return {
          name,
          emails,
          primaryEmail: emails[0] || null,
          phones,
          primaryPhone: phones[0] || null,
          organization: org,
        };
      });

      return {
        success: true,
        count: results.length,
        contacts: results,
      };
    } catch (error: any) {
      loggerService.error('agent', `Erro ao buscar contatos no Google: ${error.message}`);
      return { success: false, error: error.message, contacts: [] };
    }
  }

  // ==========================================
  // GOOGLE TASKS
  // ==========================================

  async listTasks(options?: { scope?: 'today' | 'next_7_days' | 'all' | 'overdue'; maxResults?: number }) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return { connected: false, error: 'Conta Google não conectada.', tasks: [] };
    }

    const scope = options?.scope || 'all';
    const maxResults = options?.maxResults || 100;

    try {
      const tasksApi = google.tasks({ version: 'v1', auth });
      const res = await tasksApi.tasks.list({
        tasklist: '@default',
        maxResults,
        showHidden: false,
      });

      // Data de referência no fuso de São Paulo
      const now = new Date();
      const nowSP = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const todayStr = `${nowSP.getFullYear()}-${String(nowSP.getMonth() + 1).padStart(2, '0')}-${String(nowSP.getDate()).padStart(2, '0')}`;
      
      const in7Days = new Date(nowSP.getTime() + 7 * 24 * 60 * 60 * 1000);
      const in7DaysStr = `${in7Days.getFullYear()}-${String(in7Days.getMonth() + 1).padStart(2, '0')}-${String(in7Days.getDate()).padStart(2, '0')}`;

      let items = (res.data.items || []).map((t: any) => {
        let dueFormatted: string | null = null;
        let dueRaw = t.due ? t.due.substring(0, 10) : null;
        if (dueRaw) {
          const [y, m, d] = dueRaw.split('-');
          dueFormatted = `${d}/${m}/${y}`;
        }
        return {
          id: t.id,
          title: t.title,
          notes: t.notes || null,
          due: t.due || null,
          dueDateStr: dueRaw, // "YYYY-MM-DD"
          dueFormatted,
          status: t.status,
          updated: t.updated || null,
        };
      });

      // Filtros por escopo
      if (scope === 'today') {
        items = items.filter((t: any) => {
          if (!t.dueDateStr) return false;
          return t.dueDateStr === todayStr;
        });
      } else if (scope === 'next_7_days') {
        items = items.filter((t: any) => {
          if (!t.dueDateStr) return true; // Tarefas sem data também aparecem como pendências gerais
          return t.dueDateStr >= todayStr && t.dueDateStr <= in7DaysStr;
        });
        // Ordena por data (hoje e próximas primeiro, depois as sem data)
        items.sort((a: any, b: any) => {
          if (!a.dueDateStr && !b.dueDateStr) return 0;
          if (!a.dueDateStr) return 1;
          if (!b.dueDateStr) return -1;
          return a.dueDateStr.localeCompare(b.dueDateStr);
        });
      } else if (scope === 'overdue') {
        items = items.filter((t: any) => t.dueDateStr && t.dueDateStr < todayStr && t.status !== 'completed');
      }

      return {
        success: true,
        scope,
        referenceDate: todayStr,
        count: items.length,
        tasks: items,
      };
    } catch (error: any) {
      return { success: false, error: error.message, tasks: [] };
    }
  }

  /**
   * Gera um resumo executivo formatado das tarefas sem gastar nenhum token de IA (Custo Zero)
   */
  async getFormattedTasksSummary(scope: 'today' | 'next_7_days'): Promise<string> {
    const listRes = await this.listTasks({ scope, maxResults: 100 });
    
    // Obter data de hoje por extenso no fuso de SP
    const now = new Date();
    const formatterSP = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
    });
    const todayLabel = formatterSP.format(now);
    const capitalizedToday = todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1);

    if (!listRes.success || !listRes.tasks) {
      // Se não conectou com o Google, tenta buscar tarefas locais do Prisma como fallback
      const localTasks = await prisma.task.findMany({
        where: { status: 'PENDING' },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 20,
      });

      if (localTasks.length === 0) {
        return scope === 'today'
          ? `📋 *Tarefas de Hoje (${capitalizedToday})*\n\nVocê não possui tarefas pendentes cadastradas para hoje! 🎉`
          : `📋 *Tarefas dos Próximos 7 Dias*\n\nVocê não possui tarefas pendentes cadastradas para os próximos 7 dias! 🎉`;
      }

      const tasksText = localTasks
        .map((t) => `• *${t.title}*${t.dueDate ? ` _(${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(t.dueDate))})_` : ''}`)
        .join('\n');
      return `📋 *Tarefas (${scope === 'today' ? 'Hoje' : 'Próximos 7 Dias'})*\n\n${tasksText}\n\n_Total: ${localTasks.length} pendência(s)._`;
    }

    const tasks = listRes.tasks;

    if (scope === 'today') {
      if (tasks.length === 0) {
        return `📋 *Tarefas de Hoje (${capitalizedToday})*\n\nVocê não possui tarefas pendentes agendadas para hoje! 🎉`;
      }

      const lines = tasks.map((t: any) => {
        const check = t.status === 'completed' ? '✅' : '•';
        const notes = t.notes ? ` _(${t.notes})_` : '';
        return `${check} *${t.title}*${notes}`;
      });

      return `📋 *Tarefas de Hoje (${capitalizedToday})*:\n\n${lines.join('\n')}\n\n_Total: ${tasks.length} tarefa(s) para hoje._`;
    } else {
      // scope === 'next_7_days'
      if (tasks.length === 0) {
        return `📋 *Tarefas dos Próximos 7 Dias*\n\nVocê não possui tarefas pendentes cadastradas para os próximos 7 dias! 🎉`;
      }

      const nowSP = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const todayStr = `${nowSP.getFullYear()}-${String(nowSP.getMonth() + 1).padStart(2, '0')}-${String(nowSP.getDate()).padStart(2, '0')}`;
      
      const tomorrowSP = new Date(nowSP.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStr = `${tomorrowSP.getFullYear()}-${String(tomorrowSP.getMonth() + 1).padStart(2, '0')}-${String(tomorrowSP.getDate()).padStart(2, '0')}`;

      const groups: Record<string, any[]> = {};
      const noDate: any[] = [];

      for (const t of tasks) {
        if (!t.dueDateStr) {
          noDate.push(t);
        } else {
          if (!groups[t.dueDateStr]) groups[t.dueDateStr] = [];
          groups[t.dueDateStr].push(t);
        }
      }

      const sections: string[] = [];
      const sortedDays = Object.keys(groups).sort();

      for (const day of sortedDays) {
        let header = '';
        if (day === todayStr) {
          header = `📌 *Hoje (${capitalizedToday})*:`;
        } else if (day === tomorrowStr) {
          header = `📌 *Amanhã*:`;
        } else {
          const [y, m, d] = day.split('-').map(Number);
          const dateObj = new Date(y, m - 1, d, 12, 0, 0);
          const dayName = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(dateObj);
          const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
          header = `📌 *${capDay}*:`;
        }

        const itemsText = groups[day]
          .map((t: any) => {
            const check = t.status === 'completed' ? '✅' : '•';
            const notes = t.notes ? ` _(${t.notes})_` : '';
            return `  ${check} ${t.title}${notes}`;
          })
          .join('\n');

        sections.push(`${header}\n${itemsText}`);
      }

      if (noDate.length > 0) {
        const itemsText = noDate
          .map((t: any) => `  • ${t.title}${t.notes ? ` _(${t.notes})_` : ''}`)
          .join('\n');
        sections.push(`📌 *Pendências Gerais (Sem data fixa)*:\n${itemsText}`);
      }

      return `📋 *Tarefas dos Próximos 7 Dias*:\n\n${sections.join('\n\n')}\n\n_Total: ${tasks.length} tarefa(s) listada(s)._`;
    }
  }

  /**
   * Normaliza a data de vencimento para o formato exato esperado pela Google Tasks API (YYYY-MM-DDT00:00:00.000Z no fuso de Brasília)
   */
  private formatGoogleTasksDue(dueDateInput?: string | null): string | undefined {
    if (!dueDateInput) return undefined;

    // 1. Se já vier em formato YYYY-MM-DD (com ou sem horário)
    const dateMatch = dueDateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      return `${year}-${month}-${day}T00:00:00.000Z`;
    }

    // 2. Se vier em formato brasileiro DD/MM/YYYY
    const brMatch = dueDateInput.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (brMatch) {
      const [, day, month, year] = brMatch;
      return `${year}-${month}-${day}T00:00:00.000Z`;
    }

    // 3. Fallback: interpreta via Date convertendo para a data de São Paulo
    try {
      const d = new Date(dueDateInput);
      if (!isNaN(d.getTime())) {
        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        const datePart = formatter.format(d); // "YYYY-MM-DD"
        return `${datePart}T00:00:00.000Z`;
      }
    } catch {
      // ignore
    }

    return undefined;
  }

  async createTask(title: string, notes?: string, due?: string) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return { connected: false, error: 'Conta Google não conectada.' };
    }

    try {
      const tasksApi = google.tasks({ version: 'v1', auth });
      const formattedDue = this.formatGoogleTasksDue(due);

      const res = await tasksApi.tasks.insert({
        tasklist: '@default',
        requestBody: {
          title,
          notes: notes || undefined,
          due: formattedDue,
        },
      });

      return { success: true, task: res.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Atualiza uma tarefa existente no Google Tasks pelo ID ou nome aproximado
   */
  async updateTask(taskId: string, updates: { title?: string; notes?: string; due?: string; status?: 'needsAction' | 'completed' }) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return { connected: false, error: 'Conta Google não conectada.' };
    }

    try {
      const tasksApi = google.tasks({ version: 'v1', auth });
      let targetId = taskId;
      if (!taskId.match(/^[A-Za-z0-9_-]{10,}$/)) {
        const list = await tasksApi.tasks.list({ tasklist: '@default', maxResults: 100 });
        const found = (list.data.items || []).find((t: any) =>
          (t.title || '').toLowerCase().includes(taskId.toLowerCase()) || t.id === taskId
        );
        if (found && found.id) {
          targetId = found.id;
        }
      }

      const existing = await tasksApi.tasks.get({ tasklist: '@default', task: targetId });
      let formattedDue = existing.data.due;
      if (updates.due !== undefined) {
        formattedDue = updates.due === null ? null : this.formatGoogleTasksDue(updates.due);
      }

      const res = await tasksApi.tasks.patch({
        tasklist: '@default',
        task: targetId,
        requestBody: {
          title: updates.title !== undefined ? updates.title : existing.data.title,
          notes: updates.notes !== undefined ? updates.notes : existing.data.notes,
          due: formattedDue,
          status: updates.status || existing.data.status,
        },
      });

      return { success: true, message: `Tarefa "${res.data.title}" atualizada com sucesso no Google Tasks.`, task: res.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Exclui uma tarefa do Google Tasks pelo ID ou nome aproximado
   */
  async deleteTask(taskId: string) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return { connected: false, error: 'Conta Google não conectada.' };
    }

    try {
      const tasksApi = google.tasks({ version: 'v1', auth });
      let targetId = taskId;
      let targetTitle = taskId;
      if (!taskId.match(/^[A-Za-z0-9_-]{10,}$/)) {
        const list = await tasksApi.tasks.list({ tasklist: '@default', maxResults: 100 });
        const found = (list.data.items || []).find((t: any) =>
          (t.title || '').toLowerCase().includes(taskId.toLowerCase()) || t.id === taskId
        );
        if (found && found.id) {
          targetId = found.id;
          targetTitle = found.title || targetId;
        }
      }

      await tasksApi.tasks.delete({
        tasklist: '@default',
        task: targetId,
      });

      return { success: true, message: `Tarefa "${targetTitle}" excluída com sucesso do Google Tasks.` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Limpa tarefas duplicadas mantendo apenas a versão mais recente
   */
  async cleanDuplicateTasks() {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return { connected: false, error: 'Conta Google não conectada.' };
    }

    try {
      const tasksApi = google.tasks({ version: 'v1', auth });
      const list = await tasksApi.tasks.list({ tasklist: '@default', maxResults: 100 });
      const items = list.data.items || [];

      // Agrupa tarefas pelo título normalizado
      const grouped: Record<string, any[]> = {};
      for (const item of items) {
        const norm = (item.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (!norm) continue;
        if (!grouped[norm]) grouped[norm] = [];
        grouped[norm].push(item);
      }

      const deleted: string[] = [];
      for (const normKey of Object.keys(grouped)) {
        const taskList = grouped[normKey];
        if (taskList.length > 1) {
          // Ordena decrescente pela data de atualização
          taskList.sort((a: any, b: any) => {
            const dateA = new Date(a.updated || 0).getTime();
            const dateB = new Date(b.updated || 0).getTime();
            return dateB - dateA;
          });

          // Mantém taskList[0] e exclui os demais
          for (let i = 1; i < taskList.length; i++) {
            const toDelete = taskList[i];
            try {
              await tasksApi.tasks.delete({ tasklist: '@default', task: toDelete.id });
              deleted.push(`"${toDelete.title}" (${toDelete.due ? toDelete.due.substring(0, 10) : 'sem data'})`);
            } catch (delErr: any) {
              console.error(`Erro ao deletar tarefa duplicada ${toDelete.id}:`, delErr.message);
            }
          }
        }
      }

      return {
        success: true,
        totalTasks: items.length,
        duplicatesRemoved: deleted.length,
        deletedTasks: deleted,
        message: deleted.length > 0
          ? `${deleted.length} tarefas duplicadas foram removidas com sucesso do Google Tasks!`
          : 'Nenhuma tarefa duplicada encontrada no Google Tasks.',
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // GMAIL (LEITURA & ENVIO)
  // ==========================================

  async listEmails(options: { maxResults?: number; query?: string; unreadOnly?: boolean } = {}) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return { connected: false, error: 'Conta Google não conectada.', emails: [] };
    }

    try {
      const gmail = google.gmail({ version: 'v1', auth });
      let q = options.query || '';
      if (options.unreadOnly) {
        q = (q ? `${q} ` : '') + 'is:unread';
      }

      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: q || undefined,
        maxResults: options.maxResults || 8,
      });

      const messages = listRes.data.messages || [];
      if (messages.length === 0) {
        return { success: true, count: 0, emails: [], message: 'Nenhum e-mail encontrado.' };
      }

      const emailDetails = await Promise.all(
        messages.slice(0, 8).map(async (msg: any) => {
          try {
            const detail = await gmail.users.messages.get({
              userId: 'me',
              id: msg.id,
              format: 'metadata',
              metadataHeaders: ['Subject', 'From', 'Date', 'To'],
            });

            const headers = detail.data.payload?.headers || [];
            const getHeader = (name: string) => headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

            return {
              id: msg.id,
              threadId: msg.threadId,
              subject: getHeader('Subject') || '(Sem assunto)',
              from: getHeader('From'),
              to: getHeader('To'),
              date: getHeader('Date'),
              snippet: detail.data.snippet || '',
            };
          } catch {
            return null;
          }
        })
      );

      const validEmails = emailDetails.filter(Boolean);
      return { success: true, count: validEmails.length, emails: validEmails };
    } catch (error: any) {
      loggerService.error('agent', `Erro ao listar e-mails no Gmail: ${error.message}`);
      return { success: false, error: error.message, emails: [] };
    }
  }

  async readEmail(messageId: string) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return { connected: false, error: 'Conta Google não conectada.' };
    }

    try {
      const gmail = google.gmail({ version: 'v1', auth });
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const headers = detail.data.payload?.headers || [];
      const getHeader = (name: string) => headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      let bodyText = '';
      const payload = detail.data.payload;

      const decodeBase64 = (str: string) => {
        try {
          return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
        } catch {
          return '';
        }
      };

      if (payload?.body?.data) {
        bodyText = decodeBase64(payload.body.data);
      } else if (payload?.parts && payload.parts.length > 0) {
        const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain') || payload.parts[0];
        if (textPart?.body?.data) {
          bodyText = decodeBase64(textPart.body.data);
        }
      }

      return {
        success: true,
        email: {
          id: messageId,
          subject: getHeader('Subject') || '(Sem assunto)',
          from: getHeader('From'),
          to: getHeader('To'),
          date: getHeader('Date'),
          snippet: detail.data.snippet || '',
          body: bodyText.slice(0, 3000) || detail.data.snippet || '',
        },
      };
    } catch (error: any) {
      loggerService.error('agent', `Erro ao ler e-mail ${messageId} no Gmail: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async sendEmail(options: { to: string; subject: string; body: string; cc?: string }) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return { connected: false, error: 'Conta Google não conectada.' };
    }

    try {
      const gmail = google.gmail({ version: 'v1', auth });

      const utf8Subject = `=?utf-8?B?${Buffer.from(options.subject).toString('base64')}?=`;
      const emailLines = [
        `To: ${options.to}`,
        options.cc ? `Cc: ${options.cc}` : '',
        `Subject: ${utf8Subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        options.body,
      ].filter(Boolean);

      const rawEmail = emailLines.join('\r\n');
      const base64EncodedEmail = Buffer.from(rawEmail)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: base64EncodedEmail,
        },
      });

      return {
        success: true,
        message: `E-mail enviado com sucesso para ${options.to}!`,
        messageId: res.data.id,
      };
    } catch (error: any) {
      loggerService.error('agent', `Erro ao enviar e-mail pelo Gmail: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // GOOGLE TASKS API (Sempre Integrado)
  // ==========================================

  /**
   * Lista todas as tarefas do Google Tasks na lista principal (@default)
   */
  async listGoogleTasks(options: { tasklistId?: string; showCompleted?: boolean; showHidden?: boolean; maxResults?: number } = {}) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return {
        connected: false,
        error: 'Conta Google não conectada. Conecte sua conta Google para sincronizar suas tarefas.',
        tasks: [],
      };
    }

    try {
      const tasksClient = google.tasks({ version: 'v1', auth });
      const tasklist = options.tasklistId || '@default';

      const res = await tasksClient.tasks.list({
        tasklist,
        showCompleted: options.showCompleted ?? true,
        showHidden: options.showHidden ?? true,
        maxResults: options.maxResults || 100,
      });

      const rawItems = res.data.items || [];
      const tasks = rawItems.map((t: any) => {
        const isCompleted = t.status === 'completed';
        return {
          id: t.id,
          googleTaskId: t.id,
          title: t.title || 'Sem título',
          description: t.notes || null,
          dueDate: t.due ? new Date(t.due) : null,
          status: isCompleted ? 'COMPLETED' : 'PENDING',
          priority: 'MEDIUM',
          category: 'Google Tasks',
          updatedAt: t.updated ? new Date(t.updated) : new Date(),
          completedAt: t.completed ? new Date(t.completed) : null,
          isGoogleTask: true,
        };
      });

      return {
        connected: true,
        count: tasks.length,
        tasks,
      };
    } catch (error: any) {
      loggerService.error('system', `Erro ao listar tarefas do Google Tasks: ${error.message}`);
      return { connected: true, error: error.message, tasks: [] };
    }
  }

  /**
   * Cria uma nova tarefa diretamente no Google Tasks
   */
  async createGoogleTask(options: { title: string; description?: string; dueDate?: Date | string; tasklistId?: string }) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return {
        connected: false,
        error: 'Conta Google não conectada.',
      };
    }

    try {
      const tasksClient = google.tasks({ version: 'v1', auth });
      const tasklist = options.tasklistId || '@default';

      let dueFormatted: string | undefined;
      if (options.dueDate) {
        const d = new Date(options.dueDate);
        if (!isNaN(d.getTime())) {
          dueFormatted = d.toISOString();
        }
      }

      const res = await tasksClient.tasks.insert({
        tasklist,
        requestBody: {
          title: options.title,
          notes: options.description || undefined,
          due: dueFormatted,
        },
      });

      const t = res.data;
      const isCompleted = t.status === 'completed';

      return {
        success: true,
        task: {
          id: t.id,
          googleTaskId: t.id,
          title: t.title || options.title,
          description: t.notes || options.description || null,
          dueDate: t.due ? new Date(t.due) : options.dueDate ? new Date(options.dueDate) : null,
          status: isCompleted ? 'COMPLETED' : 'PENDING',
          priority: 'MEDIUM',
          category: 'Google Tasks',
          updatedAt: t.updated ? new Date(t.updated) : new Date(),
          isGoogleTask: true,
        },
      };
    } catch (error: any) {
      loggerService.error('system', `Erro ao criar tarefa no Google Tasks: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Atualiza ou marca como concluída uma tarefa no Google Tasks
   */
  async updateGoogleTask(taskId: string, options: { title?: string; description?: string; dueDate?: Date | string | null; status?: 'PENDING' | 'COMPLETED'; tasklistId?: string }) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return {
        connected: false,
        error: 'Conta Google não conectada.',
      };
    }

    try {
      const tasksClient = google.tasks({ version: 'v1', auth });
      const tasklist = options.tasklistId || '@default';

      const requestBody: any = {};
      if (options.title !== undefined) requestBody.title = options.title;
      if (options.description !== undefined) requestBody.notes = options.description;
      if (options.status !== undefined) {
        requestBody.status = options.status === 'COMPLETED' ? 'completed' : 'needsAction';
        if (options.status === 'PENDING') {
          requestBody.completed = null;
        }
      }
      if (options.dueDate !== undefined) {
        if (options.dueDate === null) {
          requestBody.due = null;
        } else {
          const d = new Date(options.dueDate);
          if (!isNaN(d.getTime())) requestBody.due = d.toISOString();
        }
      }

      const res = await tasksClient.tasks.patch({
        tasklist,
        task: taskId,
        requestBody,
      });

      const t = res.data;
      const isCompleted = t.status === 'completed';

      return {
        success: true,
        task: {
          id: t.id,
          googleTaskId: t.id,
          title: t.title || options.title || 'Tarefa',
          description: t.notes || options.description || null,
          dueDate: t.due ? new Date(t.due) : null,
          status: isCompleted ? 'COMPLETED' : 'PENDING',
          priority: 'MEDIUM',
          category: 'Google Tasks',
          updatedAt: t.updated ? new Date(t.updated) : new Date(),
          isGoogleTask: true,
        },
      };
    } catch (error: any) {
      loggerService.error('system', `Erro ao atualizar tarefa no Google Tasks: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Deleta uma tarefa no Google Tasks
   */
  async deleteGoogleTask(taskId: string, tasklistId?: string) {
    const auth = await this.getAuthenticatedClient();
    const google = await getGoogle();
    if (!auth || !google) {
      return {
        connected: false,
        error: 'Conta Google não conectada.',
      };
    }

    try {
      const tasksClient = google.tasks({ version: 'v1', auth });
      const tasklist = tasklistId || '@default';

      await tasksClient.tasks.delete({
        tasklist,
        task: taskId,
      });

      return { success: true };
    } catch (error: any) {
      loggerService.error('system', `Erro ao deletar tarefa no Google Tasks: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

export const googleService = new GoogleService();
