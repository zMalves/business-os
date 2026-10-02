import { prisma } from '../database/client.js';
import { loggerService } from './logger.service.js';
import { whatsappService } from './whatsapp.service.js';
import { googleService } from './google.service.js';
import { SecretaryAgent } from '../agents/agent.js';

let CronClass: any = null;
async function getCron() {
  if (!CronClass) {
    try {
      const mod: any = await import('croner');
      CronClass = mod.Cron || mod.default?.Cron || mod.default || mod;
    } catch (e: any) {
      loggerService.error('system', `Biblioteca croner ainda não instalada no container: ${e.message}`);
      return null;
    }
  }
  return CronClass;
}

export class CronService {
  private activeJobs: Map<string, any> = new Map();
  private isInitialized = false;

  /**
   * Converte formatos flexíveis de horário (ex: "08:00", "8h", "08:30", "todo dia as 8h") para expressão Cron padrão
   */
  normalizeCronExpression(expr: string): string {
    const clean = expr.trim().toLowerCase();

    // Se for formato HH:MM (ex: "08:30" ou "8:30") -> "30 8 * * *"
    const timeMatch = clean.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      const min = parseInt(timeMatch[2], 10);
      return `${min} ${hour} * * *`;
    }

    // Se for formato apenas hora (ex: "8h" ou "14h" ou "8") -> "0 8 * * *"
    const hourMatch = clean.match(/^(\d{1,2})h?$/);
    if (hourMatch) {
      const hour = parseInt(hourMatch[1], 10);
      return `0 ${hour} * * *`;
    }

    // Se for expressão cron com 5 ou 6 campos válida, retorna direto
    if (clean.split(/\s+/).length >= 5) {
      return clean;
    }

    // Padrão de fallback: 08:00 todo dia
    return '0 8 * * *';
  }

  /**
   * Inicializa o serviço de Crons e carrega os agendamentos do banco de dados
   */
  async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      // 1. Garante um job padrão de Resumo Matinal se o banco estiver vazio
      const count = await prisma.scheduledJob.count();
      if (count === 0) {
        const defaultTarget = (process.env.WHATSAPP_ALLOWED_NUMBERS || '5541995852423').split(',')[0].trim();
        await prisma.scheduledJob.create({
          data: {
            title: 'Resumo Matinal Executivo',
            cronExpr: '0 8 * * *',
            timezone: 'America/Sao_Paulo',
            targetNumber: defaultTarget,
            actionType: 'daily_briefing',
            prompt: 'Gere um resumo matinal executivo e agradável com os compromissos de hoje da agenda e tarefas pendentes.',
            isActive: true,
          },
        });
        loggerService.system('⏰ Job padrão de Resumo Matinal criado para as 08:00 (Fuso de SP).');
      }

      // 2. Garante o job de Fechamento Diário de Tarefas às 18:00 (Google Tasks / 0 tokens)
      const eveningJob = await prisma.scheduledJob.findFirst({
        where: {
          OR: [
            { actionType: 'evening_pending_tasks' },
            { title: { contains: 'Fechamento' } },
          ],
        },
      });
      if (!eveningJob) {
        const defaultTarget = (process.env.WHATSAPP_ALLOWED_NUMBERS || '5541995852423').split(',')[0].trim();
        await prisma.scheduledJob.create({
          data: {
            title: 'Fechamento Diário • Tarefas Pendentes (Google Tasks)',
            cronExpr: '0 18 * * *',
            timezone: 'America/Sao_Paulo',
            targetNumber: defaultTarget,
            actionType: 'evening_pending_tasks',
            prompt: 'Fechamento diário de tarefas pendentes do Google Tasks às 18:00 (0 tokens / Sem IA).',
            isActive: true,
          },
        });
        loggerService.system('⏰ Job padrão de Fechamento Diário criado para as 18:00 (Fuso de SP - Google Tasks / 0 Tokens).');
      }

      // 3. Carrega e ativa todos os jobs marcados como ativos
      await this.loadAllJobs();
      loggerService.system('⏰ Motor de Crons e Automações da Victoria ativo e sincronizado!');
    } catch (error: any) {
      loggerService.error('system', `Falha ao inicializar CronService: ${error.message}`);
    }
  }

  /**
   * Carrega todos os jobs ativos do banco e agenda no croner
   */
  async loadAllJobs() {
    // Cancela jobs existentes na memória
    for (const [id, cronInstance] of this.activeJobs.entries()) {
      cronInstance.stop();
    }
    this.activeJobs.clear();

    const jobs = await prisma.scheduledJob.findMany({
      where: { isActive: true },
    });

    for (const job of jobs) {
      this.registerCronJob(job);
    }
  }

  /**
   * Registra um job na memória
   */
  private async registerCronJob(job: any) {
    try {
      const Cron = await getCron();
      if (!Cron) {
        loggerService.system(`⚠️ Croner não carregado para o job "${job.title}". Será inicializado assim que as dependências forem concluídas.`);
        return;
      }

      const normalizedExpr = this.normalizeCronExpression(job.cronExpr);
      const timezone = job.timezone || 'America/Sao_Paulo';

      const cronInstance = new Cron(normalizedExpr, { timezone }, async () => {
        await this.executeJob(job.id);
      });

      this.activeJobs.set(job.id, cronInstance);

      const nextRun = cronInstance.nextRun();
      if (nextRun) {
        prisma.scheduledJob.update({
          where: { id: job.id },
          data: { nextRunAt: nextRun },
        }).catch(() => {});
      }

      loggerService.system(`⏰ Agendamento registrado: "${job.title}" [${normalizedExpr}] - Próxima execução: ${nextRun?.toLocaleString('pt-BR')}`);
    } catch (err: any) {
      loggerService.error('system', `Erro ao registrar cron job "${job.title}": ${err.message}`);
    }
  }

  /**
   * Executa um job específico pelo ID
   */
  async executeJob(jobId: string, isManual: boolean = false) {
    const job = await prisma.scheduledJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      loggerService.error('system', `Job com ID ${jobId} não encontrado para execução.`);
      return { success: false, error: 'Job não encontrado' };
    }

    const startTime = Date.now();
    loggerService.system(`🚀 Executando Job agendado: "${job.title}" (${job.actionType}) [Manual: ${isManual}]`);

    try {
      const targetNumber = job.targetNumber || (process.env.WHATSAPP_ALLOWED_NUMBERS || '5541995852423').split(',')[0].trim();
      let generatedMessage = '';

      if (job.actionType === 'daily_briefing') {
        generatedMessage = await this.generateDailyBriefing();
      } else if (job.actionType === 'evening_pending_tasks' || job.actionType === 'tasks_pending_review') {
        generatedMessage = await this.generateEveningPendingTasks();
      } else if (job.actionType === 'custom_prompt') {
        const agent = new SecretaryAgent();
        const prompt = job.prompt || 'Envie a mensagem programada de rotina.';
        const output = await agent.processMessage(prompt, {
          conversationId: `cron_${job.id}_${Date.now()}`,
          channel: 'cron_automation',
          externalId: targetNumber,
        });
        generatedMessage = output.response;
      } else {
        generatedMessage = job.prompt || `Lembrete agendado da Victoria: ${job.title}`;
      }

      // Envia a mensagem gerada para o WhatsApp do usuário
      if (generatedMessage && generatedMessage.trim().length > 0) {
        await whatsappService.sendTextMessage({
          number: targetNumber,
          text: generatedMessage,
        });
        loggerService.whatsapp(`✅ Mensagem agendada de "${job.title}" entregue no WhatsApp (${targetNumber})`, {
          jobId: job.id,
          title: job.title,
          targetNumber,
        }, 'success');
      }

      // Atualiza status e horários no banco
      const nextRun = this.activeJobs.get(job.id)?.nextRun();
      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: {
          lastRunAt: new Date(),
          nextRunAt: nextRun || null,
        },
      });

      const durationMs = Date.now() - startTime;
      return { success: true, message: generatedMessage, durationMs };
    } catch (error: any) {
      loggerService.error('system', `❌ Falha ao executar Job "${job.title}": ${error.message}`, { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Constrói o Resumo Matinal Executivo pré-definido consolidando Google Calendar e Tarefas (0 TOKENS / SEM IA)
   */
  async generateDailyBriefing(): Promise<string> {
    const now = new Date();
    // Início e fim do dia no horário de Brasília
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const fullDateStr = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(now);
    const capitalizedDate = fullDateStr.charAt(0).toUpperCase() + fullDateStr.slice(1);

    // 1. Google Calendar
    let eventsLines: string[] = [];
    try {
      const calendarRes = await googleService.listCalendarEvents({
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        maxResults: 10,
      });

      if (calendarRes.connected && calendarRes.events && calendarRes.events.length > 0) {
        eventsLines = calendarRes.events.map((e: any) => {
          const startTimeStr = e.start
            ? new Date(e.start).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/Sao_Paulo',
              })
            : 'Horário a definir';
          const meet = e.hangoutLink ? `\n  🔗 _Meet: ${e.hangoutLink}_` : '';
          return `• às ${startTimeStr}: *${e.summary}*${meet}`;
        });
      }
    } catch (e: any) {
      eventsLines = [`_Não foi possível consultar a agenda: ${e.message}_`];
    }

    const eventsSection =
      eventsLines.length > 0
        ? eventsLines.join('\n')
        : '_Nenhum compromisso agendado no Calendar para hoje._';

    // 2. Google Tasks & Tarefas Locais
    let taskLines: string[] = [];
    try {
      const tasksRes = await googleService.listTasks({ scope: 'today', maxResults: 15 });
      if (tasksRes.success && tasksRes.tasks && tasksRes.tasks.length > 0) {
        taskLines = tasksRes.tasks.map((t: any) => {
          const notes = t.notes ? ` _(${t.notes.length > 50 ? t.notes.slice(0, 47) + '...' : t.notes})_` : '';
          return `• *${t.title}*${notes}`;
        });
      } else {
        // Fallback local do Prisma
        const localTasks = await prisma.task.findMany({
          where: { status: 'PENDING' },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
          take: 6,
        });
        if (localTasks.length > 0) {
          taskLines = localTasks.map((t) => `• [${t.priority}] *${t.title}*`);
        }
      }
    } catch {}

    const tasksCount = taskLines.length;
    const tasksSection =
      taskLines.length > 0
        ? taskLines.join('\n')
        : '_Nenhuma tarefa pendente cadastrada para hoje! 🎉_';

    return `☀️ *BOM DIA, MAYCHEL!*
📅 _${capitalizedDate}_

━━━━━━━━━━━━━━━━━━━━
🗓️ *COMPROMISSOS DE HOJE:*
${eventsSection}

📋 *TAREFAS DE HOJE (${tasksCount}):*
${tasksSection}

━━━━━━━━━━━━━━━━━━━━
🚀 *Tenha um excelente e produtivo dia de trabalho!*
💡 _Comandos rápidos: "tarefas", "lojas hoje", "perguntas" ou "help"_`;
  }

  /**
   * Constrói o Fechamento do Dia das Tarefas Pendentes do Google Tasks (0 TOKENS / SEM IA)
   */
  async generateEveningPendingTasks(): Promise<string> {
    const now = new Date();
    const fullDateStr = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(now);
    const capitalizedDate = fullDateStr.charAt(0).toUpperCase() + fullDateStr.slice(1);

    let pendingTasks: any[] = [];
    try {
      const tasksRes = await googleService.listTasks({ scope: 'today', showCompleted: false, maxResults: 30 });
      if (tasksRes.success && Array.isArray(tasksRes.tasks)) {
        pendingTasks = tasksRes.tasks;
      } else {
        // Fallback local caso a autenticação do Google não esteja configurada
        const localTasks = await prisma.task.findMany({
          where: { status: 'PENDING' },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
          take: 15,
        });
        pendingTasks = localTasks.map((t) => ({
          title: t.title,
          notes: t.description,
          due: t.dueDate ? t.dueDate.toISOString() : undefined,
        }));
      }
    } catch (err: any) {
      loggerService.error('system', `Erro ao buscar tarefas para fechamento diário: ${err.message}`);
    }

    if (pendingTasks.length === 0) {
      return `📋 *FECHAMENTO DO DIA • GOOGLE TASKS*
📅 _${capitalizedDate}_

━━━━━━━━━━━━━━━━━━━━
🎉 *Parabéns, Maychel!*
Todas as suas tarefas programadas para hoje no *Google Tasks* foram finalizadas com sucesso!

Tenha uma ótima noite de descanso! ✨`;
    }

    const taskLines = pendingTasks.map((t, idx) => {
      const notesStr = t.notes ? `\n   📝 _${t.notes.length > 80 ? t.notes.slice(0, 77) + '...' : t.notes}_` : '';
      return `${idx + 1}. 🔴 *${t.title}*${notesStr}`;
    });

    return `📋 *FECHAMENTO DO DIA • GOOGLE TASKS*
📅 _${capitalizedDate}_

━━━━━━━━━━━━━━━━━━━━
Olá, Maychel! Segue o balanço das suas atividades do *Google Tasks* que ainda constam como *pendentes* para hoje:

${taskLines.join('\n\n')}

━━━━━━━━━━━━━━━━━━━━
📊 *Total de pendências:* ${pendingTasks.length} atividade(s)
💡 _Caso tenha concluído alguma ou queira reagendar para amanhã, é só me avisar aqui!_`;
  }

  /**
   * Cria um novo agendamento
   */
  async createJob(data: {
    title: string;
    cronExpr: string;
    targetNumber?: string;
    actionType?: string;
    prompt?: string;
    timezone?: string;
    isActive?: boolean;
  }) {
    const normalizedExpr = this.normalizeCronExpression(data.cronExpr);
    const target = data.targetNumber || (process.env.WHATSAPP_ALLOWED_NUMBERS || '5541995852423').split(',')[0].trim();

    const job = await prisma.scheduledJob.create({
      data: {
        title: data.title,
        cronExpr: normalizedExpr,
        timezone: data.timezone || 'America/Sao_Paulo',
        targetNumber: target,
        actionType: data.actionType || 'custom_prompt',
        prompt: data.prompt || null,
        isActive: data.isActive !== false,
      },
    });

    if (job.isActive) {
      this.registerCronJob(job);
    }

    return job;
  }

  /**
   * Lista todos os agendamentos cadastrados
   */
  async listJobs() {
    const jobs = await prisma.scheduledJob.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return jobs.map((j) => {
      const cronInstance = this.activeJobs.get(j.id);
      return {
        ...j,
        nextRun: cronInstance ? cronInstance.nextRun() : j.nextRunAt,
      };
    });
  }

  /**
   * Exclui um agendamento
   */
  async deleteJob(jobId: string) {
    const cronInstance = this.activeJobs.get(jobId);
    if (cronInstance) {
      cronInstance.stop();
      this.activeJobs.delete(jobId);
    }

    return await prisma.scheduledJob.delete({
      where: { id: jobId },
    });
  }

  /**
   * Ativa ou desativa um agendamento
   */
  async toggleJob(jobId: string, active?: boolean) {
    const current = await prisma.scheduledJob.findUnique({ where: { id: jobId } });
    if (!current) return null;

    const newActive = typeof active === 'boolean' ? active : !current.isActive;

    const updated = await prisma.scheduledJob.update({
      where: { id: jobId },
      data: { isActive: newActive },
    });

    if (newActive) {
      this.registerCronJob(updated);
    } else {
      const cronInstance = this.activeJobs.get(jobId);
      if (cronInstance) {
        cronInstance.stop();
        this.activeJobs.delete(jobId);
      }
    }

    return updated;
  }
}

export const cronService = new CronService();
