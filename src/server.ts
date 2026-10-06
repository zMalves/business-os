import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { healthRoutes } from './routes/health.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { taskRoutes } from './routes/task.routes.js';
import { memoryRoutes } from './routes/memory.routes.js';
import { webhookRoutes } from './routes/webhook.routes.js';
import { whatsappRoutes } from './routes/whatsapp.routes.js';
import { systemRoutes } from './routes/system.routes.js';
import { googleRoutes } from './routes/google.routes.js';
import { cronRoutes } from './routes/cron.routes.js';
import { skillRoutes } from './routes/skill.routes.js';
import { metaRoutes } from './routes/meta.routes.js';
import { ecommerceRoutes } from './routes/ecommerce.routes.js';
import { contactRoutes } from './routes/contact.routes.js';
import { loggerService } from './services/logger.service.js';
import { cronService } from './services/cron.service.js';
import { authService } from './services/auth.service.js';
import { contactService } from './services/contact.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

async function main() {
  // 1. CORS Seguro com Whitelist Estrita (Pontos 19 e 10)
  const allowedOrigins = [
    'https://b-os.malves.dev.br',
    'https://secretary.malves.dev.br',
    'https://malves.dev.br',
    'http://localhost:4017',
    'http://127.0.0.1:4017',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
  ];

  await app.register(cors, {
    origin: (origin, cb) => {
      // Permite requisições sem origin (como webhooks internos, cURL ou apps)
      if (!origin) return cb(null, true);
      const isAllowed = allowedOrigins.includes(origin) || origin.endsWith('.malves.dev.br');
      return cb(null, isAllowed);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'Cookie'],
  });

  // 2. Rate Limiting de Alta Performance em Memória (Ponto 15 - 100% Autocontido)
  interface RateLimitData {
    count: number;
    resetAt: number;
  }
  const rateLimitStore = new Map<string, RateLimitData>();
  const RATE_LIMIT_MAX = 150;
  const RATE_LIMIT_WINDOW = 60 * 1000;

  app.addHook('onRequest', async (req, reply) => {
    // Bloqueia qualquer tipo de indexação ou rastreamento por motores de busca (Google, Bing, etc)
    reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');

    // Isenta webhooks do WhatsApp, webhooks de notificação/integração e deploys com chave
    if (
      req.url.startsWith('/api/whatsapp/webhook') ||
      req.url.startsWith('/api/webhook') ||
      req.url.startsWith('/api/system/deploy')
    ) {
      return;
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || 'unknown';
    const now = Date.now();
    let record = rateLimitStore.get(ip);

    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + RATE_LIMIT_WINDOW };
    } else {
      record.count++;
    }

    rateLimitStore.set(ip, record);

    if (record.count > RATE_LIMIT_MAX) {
      const retrySecs = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      reply.header('Retry-After', retrySecs);
      return reply.status(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Taxa limite de requisições excedida. Aguarde ${retrySecs}s antes de tentar novamente.`,
      });
    }
  });

  // 3. Cookies com Secret
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'victoria_cookie_secret_2026',
  });

  await app.register(sensible);

  // Parser para texto puro (text/plain) caso serviços externos enviem strings brutas
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  // 4. Centralização e Sanitização de Erros Internos (Ponto 12)
  app.setErrorHandler((error: any, req, reply) => {
    loggerService.system(`[Erro Não Tratado] ${req.method} ${req.url}: ${error.message}`, {
      statusCode: error.statusCode,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    }, 'error');

    const statusCode = error.statusCode || 500;
    if (statusCode < 500) {
      return reply.status(statusCode).send({
        success: false,
        error: error.message || 'Requisição inválida.',
      });
    }

    return reply.status(500).send({
      success: false,
      error: 'Ocorreu um erro interno no servidor. Por favor, tente novamente.',
    });
  });

  // 5. Proteção de Autenticação para Endpoints de API Privados (Pontos 5 e 6)
  const publicApiPrefixes = [
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/me',
    '/api/health',
    '/api/system',
    '/api/whatsapp/webhook',
    '/api/webhook',
    '/api/auth/google/callback',
    '/api/auth/meta/callback',
  ];

  app.addHook('onRequest', async (req, reply) => {
    // Aplica apenas para rotas sob /api
    if (!req.url.startsWith('/api')) return;

    const pathWithoutQuery = req.url.split('?')[0];

    // Isenta rotas públicas essenciais
    const isPublic = publicApiPrefixes.some((prefix) => pathWithoutQuery === prefix || pathWithoutQuery.startsWith(prefix));
    if (isPublic) return;

    // Todas as outras rotas /api/* exigem token válido
    const cookieToken = req.cookies?.secretary_token;
    const headerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const token = cookieToken || headerToken;

    if (!token) {
      return reply.status(401).send({
        success: false,
        error: 'Acesso não autorizado. Faça login para continuar.',
      });
    }

    const decoded = authService.verifyToken(token);
    if (!decoded) {
      return reply.status(401).send({
        success: false,
        error: 'Sessão expirada ou token inválido. Por favor, faça login novamente.',
      });
    }

    // Injeta usuário autenticado na requisição para controle de contexto / IDOR
    (req as any).user = decoded;
  });

  // Registro de rotas de API com prefixo /api
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(chatRoutes, { prefix: '/api' });
  await app.register(taskRoutes, { prefix: '/api' });
  await app.register(memoryRoutes, { prefix: '/api' });
  await app.register(webhookRoutes, { prefix: '/api' });
  await app.register(whatsappRoutes, { prefix: '/api' });
  await app.register(systemRoutes, { prefix: '/api' });
  await app.register(googleRoutes, { prefix: '/api' });
  await app.register(cronRoutes, { prefix: '/api' });
  await app.register(skillRoutes, { prefix: '/api' });
  await app.register(metaRoutes, { prefix: '/api' });
  await app.register(ecommerceRoutes, { prefix: '/api' });
  await app.register(contactRoutes, { prefix: '/api' });

  // Servidor de arquivos estáticos nativo com proteção de autenticação no Painel
  const candidatePaths = [
    path.resolve(__dirname, '../public'),
    path.resolve(process.cwd(), 'public'),
    path.resolve(__dirname, 'public'),
  ];
  const staticRoot = candidatePaths.find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), 'public');

  app.get('/*', async (req, reply) => {
    // Não intercepta chamadas de API
    if (req.url.startsWith('/api')) {
      return reply.callNotFound();
    }

    const cleanPath = req.url.split('?')[0].replace(/^\/+/, '');
    const isRootOrDashboard = cleanPath === '' || cleanPath === 'index.html';
    const requestedFile = cleanPath === '' ? 'index.html' : cleanPath;
    let filePath = path.resolve(staticRoot, requestedFile);

    // Proteção contra Path Traversal
    if (!filePath.startsWith(staticRoot)) {
      return reply.status(403).send('Forbidden');
    }

    if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    }

    // Validação de Autenticação apenas para o painel principal (index.html)
    if (isRootOrDashboard) {
      const cookieToken = req.cookies?.secretary_token;
      const headerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
      const token = cookieToken || headerToken;

      const isValidUser = token ? authService.verifyToken(token) : null;
      if (!isValidUser) {
        return reply.redirect('/login');
      }
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const stream = fs.createReadStream(filePath);
      return reply
        .header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .type(contentType)
        .send(stream);
    }

    // Fallback para usuário não logado
    const cookieToken = req.cookies?.secretary_token;
    const headerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const token = cookieToken || headerToken;
    if (!token || !authService.verifyToken(token)) {
      return reply.redirect('/login');
    }

    // Fallback SPA (index.html) para autenticados
    const indexPath = path.resolve(staticRoot, 'index.html');
    if (fs.existsSync(indexPath)) {
      return reply
        .header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .type('text/html; charset=utf-8')
        .send(fs.createReadStream(indexPath));
    }

    return reply.status(404).send('Not Found');
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) {
      return reply.status(404).send({ success: false, error: `Endpoint não encontrado: ${req.url}` });
    }
    return reply.status(404).send('Not Found');
  });

  const port = Number(process.env.PORT) || 4017;
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    loggerService.system(`🏛️ Business OS inicializado com sucesso em http://${host}:${port}`, { port, host });
    app.log.info(`🏛️ Business OS inicializado com sucesso em http://${host}:${port}`);

    // Garante que o usuário administrador inicial exista no banco
    await authService.ensureDefaultUser();
    // Garante que os contatos autorizados iniciais existam no banco
    await contactService.ensureSeedContacts();

    // Inicializa motor de Crons e automações periódicas
    setTimeout(async () => {
      try {
        await cronService.init();
        const { skillService } = await import('./services/skill.service.js');
        await skillService.seedDefaultSkills();
      } catch (e: any) {
        loggerService.error('system', `Erro ao iniciar serviços (cron/skills): ${e.message}`);
      }
    }, 1000);

    // Garante sincronização do Webhook com a Evolution API em segundo plano
    setTimeout(async () => {
      try {
        const { whatsappService } = await import('./services/whatsapp.service.js');
        const webhookUrl = process.env.WEBHOOK_BASE_URL || 'https://b-os.malves.dev.br';
        await whatsappService.setWebhook(webhookUrl);
        loggerService.whatsapp(`✅ Webhook auto-registrado na inicialização: ${webhookUrl}/api/whatsapp/webhook`);
      } catch (e: any) {
        loggerService.whatsapp(`⚠️ Auto-registro do webhook falhou na inicialização: ${e.message}`, null, 'warn');
      }
    }, 2000);

    // Sincronização periódica do Meta Ads no Banco de Dados a cada 2 minutos
    setTimeout(async () => {
      try {
        const { metaService } = await import('./services/meta.service.js');
        await metaService.syncAllMetaAdsMetrics('today');
        loggerService.system('🔄 [Meta Ads] Primeira sincronização no banco de dados concluída.');
      } catch (e: any) {
        loggerService.system(`⚠️ Falha na sincronização inicial do Meta Ads: ${e.message}`, null, 'warn');
      }
    }, 5000);

    setInterval(async () => {
      try {
        const { metaService } = await import('./services/meta.service.js');
        await metaService.syncAllMetaAdsMetrics('today');
      } catch (e: any) {
        loggerService.error('system', `Erro no background sync do Meta Ads: ${e.message}`);
      }
    }, 2 * 60 * 1000);
  } catch (err: any) {
    loggerService.error('system', `Falha fatal ao iniciar servidor: ${err.message}`, { error: err });
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful Shutdown
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info(`Recebido sinal ${signal}, encerrando servidor graciosamente...`);
    await app.close();
    process.exit(0);
  });
}

main();
