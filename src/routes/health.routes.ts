import { FastifyInstance } from 'fastify';
import { prisma } from '../database/client.js';
import { transcriptionService } from '../services/transcription.service.js';
import { usageService } from '../services/usage.service.js';

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_req, reply) => {
    let dbStatus = 'disconnected';
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'error';
    }

    let gitBranch = process.env.GIT_BRANCH || '';
    let gitCommit = '';
    let gitCommitHash = '';

    try {
      if (!gitBranch) {
        const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD');
        gitBranch = stdout.trim();
      }
    } catch {
      if (!gitBranch) gitBranch = 'sub';
    }

    try {
      const { stdout: commitOut } = await execAsync('git log -n 1 --pretty=format:"%h - %s"');
      gitCommit = commitOut.trim();
      const { stdout: hashOut } = await execAsync('git rev-parse --short HEAD');
      gitCommitHash = hashOut.trim();
    } catch {}

    return reply.status(200).send({
      status: 'ok',
      service: 'secretaria-ia',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: dbStatus,
      aiProvider: process.env.AI_PROVIDER || 'deepseek',
      branch: gitBranch,
      commit: gitCommit || gitCommitHash || 'unknown',
      commitHash: gitCommitHash || '',
      nodeEnv: process.env.NODE_ENV || 'development',
    });
  });

  /**
   * Status e métricas de todos os modelos de IA
   */
  app.get('/ai/status', async (_req, reply) => {
    const hasDeepSeek = !!(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim().length > 0);
    const hasOpenAI = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);
    const hasGemini = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);

    return reply.send({
      success: true,
      data: {
        models: [
          {
            id: 'deepseek-v4-flash',
            name: 'DeepSeek V4 Flash',
            provider: 'DeepSeek',
            role: 'Cérebro Principal / Raciocínio & Ferramentas',
            status: hasDeepSeek ? 'active' : 'inactive',
            apiKeyConfigured: hasDeepSeek,
            endpoint: 'https://api.deepseek.com/v1',
            type: 'LLM (Reasoning / Tool Calling)',
          },
          {
            id: 'whisper-1',
            name: 'OpenAI Whisper-1',
            provider: 'OpenAI',
            role: 'Transcrição de Áudio (Speech-to-Text)',
            status: hasOpenAI ? 'active' : 'inactive',
            apiKeyConfigured: hasOpenAI,
            endpoint: 'https://api.openai.com/v1/audio/transcriptions',
            type: 'Speech-to-Text (Áudio → Texto)',
          },
          {
            id: 'gemini-2.5-flash',
            name: 'Google Gemini 2.5 Flash',
            provider: 'Google AI',
            role: 'Provedor Alternativo / Multimodal',
            status: hasGemini ? 'active' : 'standby',
            apiKeyConfigured: hasGemini,
            endpoint: 'Google AI Studio',
            type: 'Multimodal LLM',
          },
        ],
      },
    });
  });

  /**
   * Estatísticas de uso, tokens e custos em tempo real
   */
  app.get('/ai/usage-stats', async (_req, reply) => {
    try {
      const stats = await usageService.getStats();
      return reply.send({ success: true, data: stats });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Endpoint de teste de transcrição direta
   */
  app.post('/ai/transcribe', async (req, reply) => {
    try {
      const { base64, mimeType } = req.body as any;
      if (!base64) {
        return reply.status(400).send({ success: false, error: 'Campo base64 é obrigatório.' });
      }

      const text = await transcriptionService.transcribeBase64(base64, mimeType || 'audio/ogg');
      return reply.send({ success: true, text });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
