import { FastifyInstance } from 'fastify';
import { googleService } from '../services/google.service.js';
import { loggerService } from '../services/logger.service.js';

function getGoogleRedirectUri(req: any): string {
  if (process.env.GOOGLE_REDIRECT_URI && process.env.GOOGLE_REDIRECT_URI.trim().length > 0) {
    return process.env.GOOGLE_REDIRECT_URI.trim();
  }
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers['host'];
  const proto = (forwardedProto || req.protocol || 'https').toString().split(',')[0].trim();
  const host = (forwardedHost || 'b-os.malves.dev.br').toString().split(',')[0].trim();
  return `${proto}://${host}/api/auth/google/callback`;
}

export async function googleRoutes(app: FastifyInstance) {
  /**
   * Retorna a URL de autorização OAuth do Google
   */
  app.get('/auth/google/url', async (req, reply) => {
    try {
      const redirectUri = getGoogleRedirectUri(req);
      const url = await googleService.getAuthUrl(redirectUri);
      return reply.send({ success: true, url });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Redireciona o navegador diretamente para o consentimento do Google
   */
  app.get('/auth/google', async (req, reply) => {
    try {
      const redirectUri = getGoogleRedirectUri(req);
      const url = await googleService.getAuthUrl(redirectUri);
      return reply.redirect(url);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Callback OAuth chamado pelo Google após o consentimento
   */
  app.get('/auth/google/callback', async (req, reply) => {
    const query = req.query as any;
    const code = query?.code;
    const error = query?.error;

    if (error) {
      loggerService.error('system', `Erro retornado pelo Google OAuth: ${error}`);
      return reply.redirect('/?google=error&error=' + encodeURIComponent(error));
    }

    if (!code) {
      return reply.redirect('/?google=missing_code');
    }

    try {
      const redirectUri = getGoogleRedirectUri(req);
      const result = await googleService.handleCallback(code, redirectUri);
      loggerService.system(`Conta Google conectada com sucesso: ${result.email}`, { email: result.email });
      return reply.redirect('/?google=connected&email=' + encodeURIComponent(result.email));
    } catch (err: any) {
      loggerService.error('system', `Falha no callback do Google: ${err.message}`);
      return reply.redirect('/?google=failed&error=' + encodeURIComponent(err.message));
    }
  });

  /**
   * Status da conexão com o Google
   */
  app.get('/auth/google/status', async (req, reply) => {
    try {
      const status = await googleService.getStatus();
      return reply.send({ success: true, data: status });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Desconectar Conta Google
   */
  app.post('/auth/google/disconnect', async (req, reply) => {
    try {
      const res = await googleService.disconnect();
      return reply.send(res);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Listar eventos do Google Calendar
   */
  app.get('/google/calendar/events', async (req, reply) => {
    const query = req.query as any;
    try {
      const events = await googleService.listCalendarEvents({
        timeMin: query?.timeMin,
        timeMax: query?.timeMax,
        maxResults: query?.limit ? parseInt(query.limit, 10) : 15,
        query: query?.q,
      });
      return reply.send(events);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Criar evento no Google Calendar
   */
  app.post('/google/calendar/events', async (req, reply) => {
    try {
      const body = req.body as any;
      const res = await googleService.createCalendarEvent(body);
      return reply.send(res);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
