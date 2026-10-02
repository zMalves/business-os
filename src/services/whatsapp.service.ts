import { loggerService } from './logger.service.js';

export interface EvolutionInstanceConfig {
  instanceName: string;
  apiUrl: string;
  apiKey: string;
}

export interface SendMessageOptions {
  number: string;
  text: string;
  delay?: number;
}

export class WhatsAppService {
  private apiUrl: string;
  private apiKey: string;
  private defaultInstance: string;

  constructor() {
    this.apiUrl = (process.env.EVOLUTION_API_URL || 'http://192.168.18.82:8082').replace(/\/$/, '');
    this.apiKey = process.env.EVOLUTION_API_KEY || 'victoria_master_secret_2026';
    this.defaultInstance = process.env.EVOLUTION_INSTANCE_NAME || 'victoria';
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      apikey: this.apiKey,
    };
  }

  /**
   * Cria uma nova instância na Evolution API caso não exista
   */
  async createInstance(instanceName: string = this.defaultInstance) {
    try {
      const response = await fetch(`${this.apiUrl}/instance/create`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          reject_call: false,
          msg_call: '',
        }),
      });

      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error(`[WhatsAppService] Erro ao criar instância ${instanceName}:`, error.message);
      throw error;
    }
  }

  /**
   * Obtém o QR Code e status de conexão da instância
   */
  async getConnectInfo(instanceName: string = this.defaultInstance) {
    try {
      const response = await fetch(`${this.apiUrl}/instance/connect/${instanceName}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok && response.status === 404) {
        // Se a instância não existir, cria e tenta conectar novamente
        await this.createInstance(instanceName);
        const retryRes = await fetch(`${this.apiUrl}/instance/connect/${instanceName}`, {
          method: 'GET',
          headers: this.getHeaders(),
        });
        return await retryRes.json();
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error(`[WhatsAppService] Erro ao conectar instância ${instanceName}:`, error.message);
      throw error;
    }
  }

  /**
   * Retorna o estado atual da conexão (open, close, connecting)
   */
  async getConnectionStatus(instanceName: string = this.defaultInstance) {
    try {
      const response = await fetch(`${this.apiUrl}/instance/connectionState/${instanceName}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        return { instance: instanceName, state: 'close', error: response.statusText };
      }

      const data = (await response.json()) as any;
      return data?.instance || data;
    } catch (error: any) {
      return { instance: instanceName, state: 'close', error: error.message };
    }
  }

  /**
   * Configura o Webhook na Evolution API para encaminhar mensagens recebidas
   */
  async setWebhook(webhookUrl?: string, instanceName: string = this.defaultInstance) {
    const targetUrl = (
      webhookUrl ||
      process.env.WEBHOOK_BASE_URL ||
      'https://b-os.malves.dev.br'
    ).replace(/\/$/, '') + (webhookUrl?.includes('/api/whatsapp/webhook') ? '' : '/api/whatsapp/webhook');

    try {
      const response = await fetch(`${this.apiUrl}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: targetUrl,
            byEvents: false,
            base64: false,
            events: [
              'MESSAGES_UPSERT',
              'CONNECTION_UPDATE',
            ],
          },
        }),
      });

      const data = await response.json();
      loggerService.whatsapp(`🔗 Webhook da Evolution API configurado com sucesso para: ${targetUrl}`, { targetUrl, response: data }, 'success');
      return data;
    } catch (error: any) {
      loggerService.whatsapp(`❌ Erro ao configurar webhook na Evolution API: ${error.message}`, { targetUrl, error: error.message }, 'error');
      console.error(`[WhatsAppService] Erro ao configurar webhook:`, error.message);
      throw error;
    }
  }

  private botSentMessageIds: Set<string> = new Set();

  /**
   * Registra o ID de uma mensagem enviada pela própria Victoria
   */
  recordBotSentMessage(messageId?: string) {
    if (!messageId) return;
    this.botSentMessageIds.add(messageId);
    if (this.botSentMessageIds.size > 1000) {
      const firstKey = this.botSentMessageIds.values().next().value;
      if (firstKey) this.botSentMessageIds.delete(firstKey);
    }
  }

  /**
   * Verifica se o ID pertence a uma mensagem gerada pela Victoria
   */
  isBotSentMessage(messageId?: string): boolean {
    if (!messageId) return false;
    return this.botSentMessageIds.has(messageId);
  }

  /**
   * Sanitiza e formata o texto para exibição limpa no WhatsApp
   */
  formatTextForWhatsApp(text: string): string {
    if (!text) return '';
    let formatted = text;
    // Remove blocos de raciocínio e chamadas de ferramenta brutas (DSML / Think)
    formatted = formatted.replace(/<think>[\s\S]*?<\/think>/gi, '');
    formatted = formatted.replace(/<[｜|]*DSML[｜|]*\s+calls>[\s\S]*?<\/[｜|]*DSML[｜|]*\s+calls>/gi, '');
    formatted = formatted.replace(/<[｜|]*DSML[｜|]*[\s\S]*?>/gi, '');
    formatted = formatted.replace(/<\/[｜|]*DSML[｜|]*[\s\S]*?>/gi, '');
    formatted = formatted.replace(/<｜[^｜]+｜>/g, '');

    // Remove asteriscos redundantes no nome da Victoria
    formatted = formatted.replace(/\*+Victoria\*+/gi, 'Victoria');
    // Converte negrito markdown **texto** em negrito WhatsApp *texto*
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '*$1*');
    // Remove qualquer duplo asterisco remanescente
    formatted = formatted.replace(/\*\*/g, '');
    return formatted.trim();
  }

  /**
   * Envia uma mensagem de texto para um número do WhatsApp
   */
  async sendTextMessage(options: SendMessageOptions, instanceName: string = this.defaultInstance) {
    try {
      // Se for grupo (@g.us), preserva o JID. Se for número pessoal, limpa caracteres.
      const targetNumber = options.number.includes('@g.us')
        ? options.number.trim()
        : options.number.replace(/\D/g, '');

      const formattedText = this.formatTextForWhatsApp(options.text);

      const response = await fetch(`${this.apiUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          number: targetNumber,
          text: formattedText,
          delay: options.delay || 1200,
        }),
      });

      const data = (await response.json()) as any;
      const msgId = data?.key?.id || data?.message?.key?.id || data?.id;
      if (msgId) {
        this.recordBotSentMessage(msgId);
      }
      return data;
    } catch (error: any) {
      console.error(`[WhatsAppService] Erro ao enviar mensagem para ${options.number}:`, error.message);
      throw error;
    }
  }

  /**
   * Busca contatos no WhatsApp por nome ou número
   */
  async findContacts(query?: string, instanceName: string = this.defaultInstance) {
    try {
      const response = await fetch(`${this.apiUrl}/chat/findContacts/${instanceName}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ where: {} }),
      });

      if (!response.ok) return [];

      const contacts = (await response.json()) as any[];
      if (!query || query.trim().length === 0) {
        return contacts.slice(0, 30);
      }

      const q = query.toLowerCase().replace(/\D/g, ''); // versão numérica
      const qText = query.toLowerCase(); // versão texto

      return contacts.filter((c: any) => {
        const pushName = (c.pushName || '').toLowerCase();
        const jid = (c.remoteJid || '').toLowerCase();
        const phone = jid.replace(/\D/g, '');

        return (
          pushName.includes(qText) ||
          (q.length >= 4 && phone.includes(q)) ||
          jid.includes(qText)
        );
      }).slice(0, 20);
    } catch (error: any) {
      console.error(`[WhatsAppService] Erro ao buscar contatos:`, error.message);
      return [];
    }
  }

  /**
   * Busca perfil ou foto de um número
   */
  async fetchProfile(number: string, instanceName: string = this.defaultInstance) {
    try {
      const cleanNumber = number.replace(/\D/g, '');
      const response = await fetch(`${this.apiUrl}/chat/fetchProfile/${instanceName}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ number: cleanNumber }),
      });

      if (!response.ok) return null;
      return await response.json();
    } catch (error: any) {
      console.error(`[WhatsAppService] Erro ao buscar perfil ${number}:`, error.message);
      return null;
    }
  }

  /**
   * Obtém o conteúdo Base64 de uma mensagem de mídia (áudio, imagem, vídeo)
   */
  async getBase64FromMediaMessage(messagePayload: any, instanceName: string = this.defaultInstance) {
    try {
      // Garante que o payload enviado para a Evolution API tenha a estrutura esperada { message: { message: { ... } } } ou { message: data }
      let formattedMessage = messagePayload;
      if (messagePayload && !messagePayload.message && (messagePayload.audioMessage || messagePayload.imageMessage || messagePayload.videoMessage || messagePayload.documentMessage)) {
        formattedMessage = { message: messagePayload };
      }

      const response = await fetch(`${this.apiUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          message: formattedMessage,
          convertToMp4: false,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[WhatsAppService] Falha ao baixar mídia base64 (${response.status}):`, errText);
        return null;
      }

      const data = (await response.json()) as any;
      const base64 = data?.base64 || data?.data?.base64 || (typeof data === 'string' ? data : null);
      const mimetype = data?.mimetype || data?.data?.mimetype || 'audio/ogg';

      if (base64) {
        return { base64, mimetype };
      }
      return null;
    } catch (error: any) {
      console.error(`[WhatsAppService] Erro ao baixar mídia base64:`, error.message);
      return null;
    }
  }

  private groupCache: Map<string, { subject: string; cachedAt: number }> = new Map();

  /**
   * Obtém informações do grupo (com cache de 10 minutos e múltiplos fallbacks)
   */
  async getGroupInfo(groupJid: string, instanceName: string = this.defaultInstance) {
    const cached = this.groupCache.get(groupJid);
    const now = Date.now();
    if (cached && (now - cached.cachedAt) < 10 * 60 * 1000) {
      return cached;
    }

    try {
      // 1. Tenta findGroupInfos
      const response = await fetch(`${this.apiUrl}/group/findGroupInfos/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const subject = data?.subject || data?.[0]?.subject || data?.groupMetadata?.subject || data?.data?.subject || '';
        if (subject) {
          const res = { subject, raw: data, cachedAt: now };
          this.groupCache.set(groupJid, res);
          return res;
        }
      }

      // 2. Fallback: Tenta fetchAllGroups para encontrar o grupo correspondente
      try {
        const allRes = await fetch(`${this.apiUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`, {
          method: 'GET',
          headers: this.getHeaders(),
        });
        if (allRes.ok) {
          const allGroups = (await allRes.json()) as any[];
          if (Array.isArray(allGroups)) {
            for (const g of allGroups) {
              const gJid = g.id || g.jid || g.remoteJid;
              const gSub = g.subject || g.name || '';
              if (gJid && gSub) {
                this.groupCache.set(gJid, { subject: gSub, cachedAt: now });
              }
            }
            if (this.groupCache.has(groupJid)) {
              return this.groupCache.get(groupJid)!;
            }
          }
        }
      } catch {}

      return cached || null;
    } catch (error: any) {
      loggerService.whatsapp(`⚠️ Erro ao obter informações do grupo ${groupJid}: ${error.message}`, { error: error.message }, 'warn');
      return cached || null;
    }
  }

  /**
   * Desconecta (logout) da instância
   */
  async logout(instanceName: string = this.defaultInstance) {
    try {
      const response = await fetch(`${this.apiUrl}/instance/logout/${instanceName}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      return await response.json();
    } catch (error: any) {
      console.error(`[WhatsAppService] Erro ao desconectar:`, error.message);
      throw error;
    }
  }

  /**
   * Reinicia a instância
   */
  async restart(instanceName: string = this.defaultInstance) {
    try {
      const response = await fetch(`${this.apiUrl}/instance/restart/${instanceName}`, {
        method: 'POST',
        headers: this.getHeaders(),
      });

      return await response.json();
    } catch (error: any) {
      console.error(`[WhatsAppService] Erro ao reiniciar instância:`, error.message);
      throw error;
    }
  }
}

export const whatsappService = new WhatsAppService();
