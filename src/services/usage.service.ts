import { prisma } from '../database/client.js';

export interface RecordChatUsageOptions {
  interactionId?: string;
  provider: string;
  model: string;
  operationType?: string;
  category?: string;
  promptSummary?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  channel?: string;
}

export interface RecordAudioUsageOptions {
  interactionId?: string;
  provider?: string;
  model?: string;
  promptSummary?: string;
  audioSeconds: number;
  durationMs: number;
  channel?: string;
}

export class UsageService {
  private usdBrlRate: number;

  constructor() {
    this.usdBrlRate = parseFloat(process.env.USD_BRL_RATE || '5.75');
  }

  /**
   * Calcula o custo estimado em USD com base no provedor, modelo e tokens
   */
  calculateChatCost(provider: string, model: string, promptTokens: number, completionTokens: number): number {
    const prov = provider.toLowerCase();
    const mdl = model.toLowerCase();

    // DeepSeek V4 / V3
    if (prov === 'deepseek' || mdl.includes('deepseek')) {
      const promptCost = (promptTokens / 1_000_000) * 0.14;
      const completionCost = (completionTokens / 1_000_000) * 0.28;
      return promptCost + completionCost;
    }

    // OpenAI GPT-4o-mini
    if (mdl.includes('gpt-4o-mini')) {
      const promptCost = (promptTokens / 1_000_000) * 0.15;
      const completionCost = (completionTokens / 1_000_000) * 0.60;
      return promptCost + completionCost;
    }

    // OpenAI GPT-4o
    if (mdl.includes('gpt-4o')) {
      const promptCost = (promptTokens / 1_000_000) * 2.50;
      const completionCost = (completionTokens / 1_000_000) * 10.00;
      return promptCost + completionCost;
    }

    // Google Gemini 2.5 Flash / 1.5 Flash
    if (prov === 'gemini' || mdl.includes('gemini')) {
      const promptCost = (promptTokens / 1_000_000) * 0.075;
      const completionCost = (completionTokens / 1_000_000) * 0.30;
      return promptCost + completionCost;
    }

    // Padrão genérico de baixo custo
    return ((promptTokens + completionTokens) / 1_000_000) * 0.20;
  }

  /**
   * Calcula o custo de transcrição com OpenAI Whisper ($0.006 / minuto)
   */
  calculateAudioCost(audioSeconds: number): number {
    const minutes = Math.max(audioSeconds, 1) / 60;
    return minutes * 0.006;
  }

  /**
   * Registra o consumo de uma chamada de LLM
   */
  async recordChatUsage(options: RecordChatUsageOptions) {
    try {
      const costUsd = this.calculateChatCost(
        options.provider,
        options.model,
        options.promptTokens,
        options.completionTokens
      );
      const costBrl = costUsd * this.usdBrlRate;

      return await prisma.aiUsageLog.create({
        data: {
          interactionId: options.interactionId,
          provider: options.provider,
          model: options.model,
          operationType: options.operationType || 'chat',
          category: options.category || 'general_chat',
          promptSummary: options.promptSummary ? options.promptSummary.slice(0, 250) : undefined,
          promptTokens: options.promptTokens,
          completionTokens: options.completionTokens,
          totalTokens: options.totalTokens || (options.promptTokens + options.completionTokens),
          durationMs: options.durationMs,
          costUsd,
          costBrl,
          channel: options.channel || 'web',
        },
      });
    } catch (err: any) {
      console.error('[UsageService] Erro ao registrar consumo de chat:', err.message);
      return null;
    }
  }

  /**
   * Registra o consumo de transcrição de áudio (Whisper)
   */
  async recordAudioUsage(options: RecordAudioUsageOptions) {
    try {
      const costUsd = this.calculateAudioCost(options.audioSeconds);
      const costBrl = costUsd * this.usdBrlRate;

      return await prisma.aiUsageLog.create({
        data: {
          interactionId: options.interactionId,
          provider: options.provider || 'openai',
          model: options.model || 'whisper-1',
          operationType: 'transcription',
          category: 'audio_transcription',
          promptSummary: options.promptSummary || 'Áudio do WhatsApp',
          audioSeconds: options.audioSeconds,
          durationMs: options.durationMs,
          costUsd,
          costBrl,
          channel: options.channel || 'whatsapp_group',
        },
      });
    } catch (err: any) {
      console.error('[UsageService] Erro ao registrar consumo de áudio:', err.message);
      return null;
    }
  }

  /**
   * Obtém estatísticas consolidadas de consumo, gastos e agrupamentos
   */
  async getStats() {
    try {
      const logs = await prisma.aiUsageLog.findMany({
        orderBy: { createdAt: 'desc' },
      });

      let totalTokens = 0;
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      let totalCostUsd = 0;
      let totalCostBrl = 0;
      let totalAudioSeconds = 0;
      let totalChatCalls = 0;
      let totalAudioCalls = 0;

      const modelStatsMap: Record<string, {
        provider: string;
        model: string;
        calls: number;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        audioSeconds: number;
        costUsd: number;
        costBrl: number;
      }> = {};

      const categoryLabels: Record<string, { label: string; icon: string; color: string }> = {
        youtube_search: { label: 'Busca de Vídeos (YouTube)', icon: 'fa-play', color: '#EF4444' },
        web_search: { label: 'Pesquisas na Web', icon: 'fa-globe', color: '#818CF8' },
        web_read: { label: 'Leitura de Links & Páginas', icon: 'fa-link', color: '#38BDF8' },
        audio_transcription: { label: 'Transcrições de Áudio', icon: 'fa-microphone', color: '#34D399' },
        tasks_agenda: { label: 'Agenda & Gerenciamento', icon: 'fa-calendar-check', color: '#FBBF24' },
        whatsapp_tools: { label: 'Contatos & WhatsApp', icon: 'fa-address-book', color: '#25D366' },
        general_chat: { label: 'Chat & Raciocínio Geral', icon: 'fa-comments', color: '#C084FC' },
      };

      const categoryStatsMap: Record<string, {
        categoryKey: string;
        label: string;
        icon: string;
        color: string;
        calls: number;
        totalTokens: number;
        audioSeconds: number;
        costBrl: number;
        costUsd: number;
      }> = {};

      const interactionMap: Record<string, {
        interactionId: string;
        promptSummary: string;
        category: string;
        categoryLabel: string;
        channel: string;
        provider: string;
        model: string;
        stepsCount: number;
        totalTokens: number;
        audioSeconds: number;
        totalCostBrl: number;
        totalCostUsd: number;
        totalDurationMs: number;
        createdAt: Date;
      }> = {};

      for (const log of logs) {
        totalTokens += log.totalTokens;
        totalPromptTokens += log.promptTokens;
        totalCompletionTokens += log.completionTokens;
        totalCostUsd += log.costUsd;
        totalCostBrl += log.costBrl;
        totalAudioSeconds += log.audioSeconds;

        if (log.operationType === 'transcription') {
          totalAudioCalls++;
        } else {
          totalChatCalls++;
        }

        // Agrupamento por Modelo
        const mKey = `${log.provider}:${log.model}`;
        if (!modelStatsMap[mKey]) {
          modelStatsMap[mKey] = {
            provider: log.provider,
            model: log.model,
            calls: 0,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            audioSeconds: 0,
            costUsd: 0,
            costBrl: 0,
          };
        }
        const st = modelStatsMap[mKey];
        st.calls++;
        st.promptTokens += log.promptTokens;
        st.completionTokens += log.completionTokens;
        st.totalTokens += log.totalTokens;
        st.audioSeconds += log.audioSeconds;
        st.costUsd += log.costUsd;
        st.costBrl += log.costBrl;

        // Agrupamento por Categoria de Uso
        const catKey = log.category || (log.operationType === 'transcription' ? 'audio_transcription' : 'general_chat');
        if (!categoryStatsMap[catKey]) {
          const meta = categoryLabels[catKey] || { label: catKey, icon: 'fa-layer-group', color: '#94A3B8' };
          categoryStatsMap[catKey] = {
            categoryKey: catKey,
            label: meta.label,
            icon: meta.icon,
            color: meta.color,
            calls: 0,
            totalTokens: 0,
            audioSeconds: 0,
            costBrl: 0,
            costUsd: 0,
          };
        }
        const catSt = categoryStatsMap[catKey];
        catSt.calls++;
        catSt.totalTokens += log.totalTokens;
        catSt.audioSeconds += log.audioSeconds;
        catSt.costBrl += log.costBrl;
        catSt.costUsd += log.costUsd;

        // Agrupamento por Interação (Pergunta / Ordem)
        const intId = log.interactionId || log.id;
        if (!interactionMap[intId]) {
          const catMeta = categoryLabels[catKey] || { label: catKey, icon: 'fa-layer-group', color: '#94A3B8' };
          interactionMap[intId] = {
            interactionId: intId,
            promptSummary: log.promptSummary || (log.operationType === 'transcription' ? 'Transcrição de áudio WhatsApp' : 'Pergunta sem título'),
            category: catKey,
            categoryLabel: catMeta.label,
            channel: log.channel || 'web',
            provider: log.provider,
            model: log.model,
            stepsCount: 0,
            totalTokens: 0,
            audioSeconds: 0,
            totalCostBrl: 0,
            totalCostUsd: 0,
            totalDurationMs: 0,
            createdAt: log.createdAt,
          };
        }
        const intObj = interactionMap[intId];
        intObj.stepsCount++;
        intObj.totalTokens += log.totalTokens;
        intObj.audioSeconds += log.audioSeconds;
        intObj.totalCostBrl += log.costBrl;
        intObj.totalCostUsd += log.costUsd;
        intObj.totalDurationMs += log.durationMs;
        if (log.promptSummary && (!intObj.promptSummary || intObj.promptSummary === 'Pergunta sem título')) {
          intObj.promptSummary = log.promptSummary;
        }
      }

      // Calcula porcentagem por categoria com base em USD
      const categories = Object.values(categoryStatsMap).map(c => ({
        ...c,
        percentage: totalCostUsd > 0 ? Number(((c.costUsd / totalCostUsd) * 100).toFixed(1)) : 0,
      })).sort((a, b) => b.costUsd - a.costUsd);

      // Top Interações mais caras em USD
      const topInteractions = Object.values(interactionMap)
        .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
        .slice(0, 15);

      const recentLogs = logs.slice(0, 40).map((l: any) => ({
        id: l.id,
        interactionId: l.interactionId,
        provider: l.provider,
        model: l.model,
        operationType: l.operationType,
        category: l.category || 'general_chat',
        promptSummary: l.promptSummary,
        totalTokens: l.totalTokens,
        promptTokens: l.promptTokens,
        completionTokens: l.completionTokens,
        audioSeconds: l.audioSeconds,
        durationMs: l.durationMs,
        costUsd: l.costUsd,
        costBrl: l.costBrl,
        channel: l.channel,
        createdAt: l.createdAt,
      }));

      return {
        summary: {
          totalRequests: logs.length,
          totalChatCalls,
          totalAudioCalls,
          totalTokens,
          totalPromptTokens,
          totalCompletionTokens,
          totalAudioMinutes: Number((totalAudioSeconds / 60).toFixed(2)),
          totalCostUsd: Number(totalCostUsd.toFixed(6)),
          totalCostBrl: Number(totalCostBrl.toFixed(4)),
          usdBrlRate: this.usdBrlRate,
        },
        models: Object.values(modelStatsMap),
        categories,
        topInteractions,
        recentLogs,
      };
    } catch (err: any) {
      console.error('[UsageService] Erro ao calcular estatísticas de uso:', err.message);
      return {
        summary: {
          totalRequests: 0,
          totalChatCalls: 0,
          totalAudioCalls: 0,
          totalTokens: 0,
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalAudioMinutes: 0,
          totalCostUsd: 0,
          totalCostBrl: 0,
          usdBrlRate: this.usdBrlRate,
        },
        models: [],
        categories: [],
        topInteractions: [],
        recentLogs: [],
      };
    }
  }
}

export const usageService = new UsageService();

