import OpenAI, { toFile } from 'openai';
import { usageService } from './usage.service.js';

export class TranscriptionService {
  private openai: OpenAI | null = null;

  constructor() {
    this.initClient();
  }

  private initClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && apiKey.trim().length > 0) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Transcreve um áudio a partir de um buffer
   */
  async transcribeAudio(audioBuffer: Buffer, mimeType: string = 'audio/ogg', channel: string = 'whatsapp_group'): Promise<string> {
    if (!this.openai) {
      this.initClient();
    }

    if (!this.openai) {
      throw new Error('OPENAI_API_KEY não configurada para transcrição de áudio.');
    }

    const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a' : 'ogg';
    const file = await toFile(audioBuffer, `audio.${ext}`, { type: mimeType });

    const startTime = Date.now();
    const transcription = await this.openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'pt',
    });
    const durationMs = Date.now() - startTime;

    // Estima a duração do áudio em segundos com base no tamanho do buffer (aprox 3.5 KB/s para OGG/Opus do WhatsApp)
    const estimatedSeconds = Math.max(3, Number((audioBuffer.length / 3500).toFixed(1)));

    // Registra métrica de custo e uso
    await usageService.recordAudioUsage({
      provider: 'openai',
      model: 'whisper-1',
      audioSeconds: estimatedSeconds,
      durationMs,
      channel,
    });

    return transcription.text;
  }

  /**
   * Transcreve um áudio codificado em Base64
   */
  async transcribeBase64(base64Data: string, mimeType: string = 'audio/ogg', channel: string = 'whatsapp_group'): Promise<string> {
    // Remove cabeçalho data:audio/...;base64, se houver
    const cleanBase64 = base64Data.replace(/^data:audio\/[a-zA-Z0-9]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    return this.transcribeAudio(buffer, mimeType, channel);
  }
}

export const transcriptionService = new TranscriptionService();
