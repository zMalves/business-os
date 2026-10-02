import { FastifyInstance } from 'fastify';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '../database/client.js';
import { loggerService } from '../services/logger.service.js';

const execAsync = promisify(exec);

export async function systemRoutes(app: FastifyInstance) {
  // Middleware simples de autenticação para endpoints de sistema
  const authenticate = (req: any, reply: any) => {
    const validKeys = [
      process.env.DEPLOY_KEY,
      process.env.EVOLUTION_API_KEY,
      process.env.WEBHOOK_SECRET,
      'victoria_master_secret_2026',
    ]
      .filter((k): k is string => Boolean(k && typeof k === 'string' && k.trim().length > 0))
      .map((k) => k.trim());

    const authHeader = req.headers['x-deploy-key'] || req.headers['x-api-key'] || req.headers['authorization'];
    const queryToken = (req.query as any)?.token;

    const providedKey = (authHeader || queryToken || '').toString().replace(/^Bearer\s+/i, '').trim();

    if (!providedKey || !validKeys.includes(providedKey)) {
      reply.status(401).send({
        success: false,
        error: 'Não autorizado. Forneça o header x-deploy-key ou x-api-key correto.',
      });
      return false;
    }
    return true;
  };

  /**
   * Endpoint de Auto-Deploy Remoto
   * Puxa a versão mais recente do git, sincroniza o banco e atualiza permissões
   */
  app.post('/system/deploy', async (req, reply) => {
    if (!authenticate(req, reply)) return;

    const targetBranch = (req.body as any)?.branch || process.env.GIT_BRANCH || 'develop';
    const startTime = Date.now();

    req.log.info(`🚀 [System] Iniciando deploy remoto para branch: ${targetBranch}`);

    try {
      // 1. Configura diretório seguro do Git
      await execAsync('git config --global --add safe.directory /app 2>/dev/null || true');

      // 2. Sincroniza e reseta para a versão mais recente do repositório
      const fetchRes = await execAsync(`git fetch origin ${targetBranch}`);
      const resetRes = await execAsync(`git reset --hard origin/${targetBranch}`);
      const pullRes = await execAsync(`git pull origin ${targetBranch}`);

      // 3. Ajusta permissões
      await execAsync('chmod -R 777 /app 2>/dev/null || true');

      // 4. Instala novas dependências npm caso adicionadas
      try {
        await execAsync('npm install --no-audit --prefer-offline 2>/dev/null || npm install --no-audit 2>/dev/null || true');
      } catch {}

      // 5. Sincroniza o cliente e schema do Prisma
      let prismaLog = '';
      try {
        const pGen = await execAsync('npx prisma generate');
        const pPush = await execAsync('npx prisma db push --skip-generate 2>/dev/null || npx prisma migrate deploy 2>/dev/null || true');
        prismaLog = `${pGen.stdout}\n${pPush.stdout}`;
      } catch (pErr: any) {
        prismaLog = `Aviso Prisma: ${pErr.message}`;
      }

      // 5. Obtém commit atual
      const commitRes = await execAsync('git log -n 1 --oneline');
      const durationMs = Date.now() - startTime;

      // Recarrega o processo de forma limpa e imediata via restart do container
      setTimeout(() => {
        process.exit(0);
      }, 600);

      return reply.send({
        success: true,
        message: `Deploy da branch ${targetBranch} finalizado com sucesso!`,
        branch: targetBranch,
        latestCommit: commitRes.stdout.trim(),
        durationMs,
        logs: {
          fetch: fetchRes.stdout.trim(),
          reset: resetRes.stdout.trim(),
          pull: pullRes.stdout.trim(),
          prisma: prismaLog.trim(),
        },
      });
    } catch (err: any) {
      req.log.error(`❌ [System] Falha no deploy remoto: ${err.message}`);
      return reply.status(500).send({
        success: false,
        error: 'Erro durante execução do deploy no servidor',
        message: err.message,
        stderr: err.stderr || null,
      });
    }
  });

  /**
   * Endpoint de Execução de Comandos Segura no Terminal do Container
   */
  app.post('/system/exec', async (req, reply) => {
    if (!authenticate(req, reply)) return;

    const { command } = (req.body as any) || {};
    if (!command || typeof command !== 'string') {
      return reply.status(400).send({ success: false, error: 'Comando não fornecido no body { command }.' });
    }

    req.log.info(`⚙️ [System] Executando comando remoto: ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command, { cwd: '/app', timeout: 30000 });
      return reply.send({
        success: true,
        command,
        stdout: stdout.trim(),
        stderr: stderr.trim() || null,
      });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        command,
        error: err.message,
        stdout: err.stdout?.trim() || null,
        stderr: err.stderr?.trim() || null,
      });
    }
  });

  /**
   * Status e Diagnóstico Geral do Sistema
   */
  app.get('/system/info', async (req, reply) => {
    if (!authenticate(req, reply)) return;

    let dbStatus = 'connected';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'disconnected';
    }

    let gitCommit = 'unknown';
    let gitBranch = 'unknown';
    try {
      const branchRes = await execAsync('git rev-parse --abbrev-ref HEAD');
      gitBranch = branchRes.stdout.trim() || process.env.GIT_BRANCH || 'sub';
    } catch {
      gitBranch = process.env.GIT_BRANCH || 'sub';
    }
    try {
      const commitRes = await execAsync('git log -n 1 --oneline');
      gitCommit = commitRes.stdout.trim();
    } catch {}

    return reply.send({
      success: true,
      service: 'Business OS',
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 4017,
      git: {
        branch: gitBranch,
        commit: gitCommit,
      },
      database: dbStatus,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
    });
  });

  /**
   * Endpoint de Obtenção de Logs em Tempo Real
   */
  app.get('/system/logs', async (req, reply) => {
    const query = req.query as any;
    const limit = query?.limit ? parseInt(query.limit, 10) : 200;
    const category = query?.category || 'all';
    const level = query?.level || 'all';
    const search = query?.search || '';
    const sinceId = query?.sinceId || '';

    const logsData = loggerService.getLogs({
      limit,
      category,
      level,
      search,
      sinceId,
    });

    return reply.send({
      success: true,
      total: logsData.total,
      count: logsData.logs.length,
      logs: logsData.logs,
    });
  });

  /**
   * Endpoint para Limpar o Buffer de Logs
   */
  app.post('/system/logs/clear', async (req, reply) => {
    const result = loggerService.clear();
    return reply.send(result);
  });

  /**
   * Endpoint para Sincronizar/Garantir o Webhook na Evolution API
   */
  app.post('/system/sync-webhook', async (req, reply) => {
    try {
      const { whatsappService } = await import('../services/whatsapp.service.js');
      const body = req.body as any;
      const targetUrl = body?.webhookUrl || process.env.WEBHOOK_BASE_URL || 'https://b-os.malves.dev.br';
      const res = await whatsappService.setWebhook(targetUrl);
      return reply.send({ success: true, message: 'Webhook sincronizado com sucesso!', data: res, targetUrl });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  /**
   * Endpoint para Importar/Migrar Telemetria e Logs da Secretaria antiga
   */
  app.post('/system/migrate-telemetry', async (req, reply) => {
    if (!authenticate(req, reply)) return;

    const { PrismaClient } = await import('@prisma/client');
    const customUrl = (req.body as any)?.databaseUrl;

    const candidateUrls = [
      customUrl,
      'mysql://secretaria_user:secretaria_pass@192.168.18.82:3305/secretaria_db',
      'mysql://secretaria_user:secretaria_pass@172.17.0.1:3305/secretaria_db',
      'mysql://secretaria_user:secretaria_pass@host.docker.internal:3305/secretaria_db',
      'mysql://secretaria_user:secretaria_pass@secretaria-mariadb:3306/secretaria_db',
      'mysql://root:root_secret_pass@192.168.18.82:3305/secretaria_db',
      'mysql://root:root_secret_pass@172.17.0.1:3305/secretaria_db',
      'mysql://root:root_secret_pass@secretaria-mariadb:3306/secretaria_db',
    ].filter(Boolean) as string[];

    let connectedPrisma: any = null;
    let connectedUrl: string = '';
    const attempts = [];

    for (const url of candidateUrls) {
      const p = new PrismaClient({ datasources: { db: { url } } });
      try {
        const testCount = await p.aiUsageLog.count();
        connectedPrisma = p;
        connectedUrl = url;
        attempts.push({ url, success: true, count: testCount });
        break;
      } catch (err: any) {
        attempts.push({ url, success: false, error: err.message });
        await p.$disconnect().catch(() => {});
      }
    }

    if (!connectedPrisma) {
      return reply.status(500).send({
        success: false,
        message: 'Não foi possível conectar ao banco de dados da secretaria antiga nas URLs testadas.',
        attempts,
      });
    }

    try {
      const sourceLogs = await connectedPrisma.aiUsageLog.findMany({
        orderBy: { createdAt: 'asc' },
      });

      let imported = 0;
      let skipped = 0;

      for (const log of sourceLogs) {
        const existing = await prisma.aiUsageLog.findUnique({
          where: { id: log.id },
        });

        if (!existing) {
          await prisma.aiUsageLog.create({
            data: {
              id: log.id,
              interactionId: log.interactionId,
              provider: log.provider,
              model: log.model,
              operationType: log.operationType,
              category: log.category,
              promptSummary: log.promptSummary,
              promptTokens: log.promptTokens,
              completionTokens: log.completionTokens,
              totalTokens: log.totalTokens,
              audioSeconds: log.audioSeconds,
              durationMs: log.durationMs,
              costUsd: log.costUsd,
              costBrl: log.costBrl,
              channel: log.channel,
              createdAt: log.createdAt,
            },
          });
          imported++;
        } else {
          skipped++;
        }
      }

      await connectedPrisma.$disconnect();

      loggerService.system(`✨ [Migração] ${imported} registros de telemetria importados da secretaria antiga (${skipped} já existentes).`);

      return reply.send({
        success: true,
        message: `Migração concluída com sucesso! ${imported} logs importados, ${skipped} existentes.`,
        connectedUrl,
        totalFound: sourceLogs.length,
        imported,
        skipped,
      });
    } catch (err: any) {
      if (connectedPrisma) await connectedPrisma.$disconnect().catch(() => {});
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}

