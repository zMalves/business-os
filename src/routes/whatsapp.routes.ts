import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { whatsappService } from '../services/whatsapp.service.js';
import { ChatService } from '../services/chat.service.js';
import { transcriptionService } from '../services/transcription.service.js';
import { loggerService } from '../services/logger.service.js';

const chatService = new ChatService();

/**
 * Normaliza um número de telefone gerando variações (com e sem o 9º dígito para telefones BR)
 */
function getPhoneVariants(phoneOrJid: string): string[] {
  if (!phoneOrJid) return [];
  const clean = phoneOrJid.split('@')[0].replace(/\D/g, '');
  if (!clean) return [];

  const variants = new Set<string>();
  variants.add(clean);

  // Formato brasileiro com DDI 55: Ex: 55 + DDD(2) + 9 dígitos (13 dígitos) vs 12 dígitos
  if (clean.startsWith('55') && clean.length === 13) {
    const ddd = clean.slice(2, 4);
    const ninth = clean[4];
    if (ninth === '9') {
      variants.add(`55${ddd}${clean.slice(5)}`);
    }
  } else if (clean.startsWith('55') && clean.length === 12) {
    const ddd = clean.slice(2, 4);
    variants.add(`55${ddd}9${clean.slice(4)}`);
  }

  // Se não tiver DDI 55
  if (!clean.startsWith('55')) {
    variants.add(`55${clean}`);
    if (clean.length === 11 && clean[2] === '9') {
      variants.add(`55${clean.slice(0, 2)}${clean.slice(3)}`);
    } else if (clean.length === 10) {
      variants.add(`55${clean.slice(0, 2)}9${clean.slice(2)}`);
    }
  }

  return Array.from(variants);
}

/**
 * Verifica se um remetente está na lista de números autorizados
 */
function isSenderAuthorized(senderJidOrNumber: string): boolean {
  const allowedRaw = process.env.WHATSAPP_ALLOWED_NUMBERS || '5541995852423,554195852423,+5541995852423';
  const allowedList = allowedRaw
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

  const senderVariants = getPhoneVariants(senderJidOrNumber);

  for (const allowed of allowedList) {
    const allowedVariants = getPhoneVariants(allowed);
    const isMatch = senderVariants.some((sv) => allowedVariants.includes(sv));
    if (isMatch) return true;
  }
  return false;
}

export async function whatsappRoutes(app: FastifyInstance) {
  /**
   * Status da conexão com o WhatsApp
   */
  app.get('/whatsapp/status', async (req, reply) => {
    try {
      const status = await whatsappService.getConnectionStatus();
      return reply.send({ success: true, data: status });
    } catch (error: any) {
      loggerService.whatsapp(`Erro ao verificar status da conexão: ${error.message}`, null, 'error');
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Conectar e obter QR Code
   */
  const handleConnect = async (req: any, reply: any) => {
    try {
      const connectData = await whatsappService.getConnectInfo();
      return reply.send({ success: true, data: connectData });
    } catch (error: any) {
      loggerService.whatsapp(`Erro ao obter QR Code: ${error.message}`, null, 'error');
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  app.get('/whatsapp/connect', handleConnect);
  app.post('/whatsapp/connect', handleConnect);

  /**
   * Configurar Webhook automaticamente
   */
  app.post('/whatsapp/set-webhook', async (req, reply) => {
    try {
      const body = req.body as any;
      const baseUrl = body?.webhookUrl || process.env.WEBHOOK_BASE_URL || 'https://secretary.malves.dev.br';
      const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/whatsapp/webhook`;

      const result = await whatsappService.setWebhook(webhookUrl);
      loggerService.whatsapp(`Webhook configurado com sucesso para ${webhookUrl}`, { result }, 'success');
      return reply.send({ success: true, data: result, webhookUrl });
    } catch (error: any) {
      loggerService.whatsapp(`Falha ao configurar webhook: ${error.message}`, null, 'error');
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Desconectar do WhatsApp
   */
  app.post('/whatsapp/disconnect', async (req, reply) => {
    try {
      const result = await whatsappService.logout();
      loggerService.whatsapp('Instância do WhatsApp desconectada.', { result }, 'warn');
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Webhook que recebe as mensagens do WhatsApp via Evolution API
   */
  app.post('/whatsapp/webhook', async (req, reply) => {
    const payload = req.body as any;
    const event = payload?.event || payload?.type;

    // Responde 200 imediatamente para a Evolution API não retransmitir
    reply.status(200).send({ received: true });

    try {
      const data = payload?.data;
      if (!data) return;

      // Evento de status de conexão
      if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
        const state = data?.state || data?.status;
        loggerService.whatsapp(`🔄 Status do WhatsApp atualizado: ${state}`, { state, data });
        return;
      }

      // Evento de nova mensagem
      if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
        const key = data.key;
        if (!key) return;

        const remoteJid = key.remoteJid || '';

        // Ignora status/broadcasts
        if (remoteJid === 'status@broadcast') {
          return;
        }

        // Se a mensagem foi gerada e enviada pela própria Victoria, ignora para evitar loop infinito
        if (whatsappService.isBotSentMessage(key.id)) {
          loggerService.whatsapp(`🔁 Mensagem ignorada (enviada pela própria Victoria, ID: ${key.id})`);
          return;
        }

        const isGroup = remoteJid.endsWith('@g.us');
        // Identifica o remetente real (direto ou membro do grupo)
        const senderJid = isGroup ? (key.participant || data.participant || data.key?.participantJid || '') : remoteJid;

        // REGRA DE AUTORIZAÇÃO: Apenas mensagens do número configurado (ex: +5541995852423)
        if (!isSenderAuthorized(senderJid)) {
          loggerService.whatsapp(`🚫 Mensagem de ${senderJid || remoteJid} ignorada (número não autorizado).`, {
            remoteJid,
            senderJid,
            pushName: data.pushName,
            allowedNumbers: process.env.WHATSAPP_ALLOWED_NUMBERS || '5541995852423',
          });
          return;
        }

        const pushName = data.pushName || (key.fromMe ? 'Administrador' : 'Maychel');

        loggerService.whatsapp(`📩 Mensagem autorizada recebida de [${pushName}] (${senderJid})`, {
          remoteJid,
          senderJid,
          isGroup,
          pushName,
          fromMe: key.fromMe,
          messageId: key.id,
        });

        // Extrai o texto da mensagem recebida
        const messageObj = data.message;
        if (!messageObj) return;

        let text =
          messageObj.conversation ||
          messageObj.extendedTextMessage?.text ||
          messageObj.imageMessage?.caption ||
          messageObj.videoMessage?.caption ||
          messageObj.documentMessage?.caption ||
          '';

        // Se for mensagem de voz/áudio, faz a transcrição com Whisper
        const isAudio = !!(
          messageObj.audioMessage ||
          messageObj.pttMessage ||
          data.messageType === 'audioMessage' ||
          data.messageType === 'pttMessage'
        );

        // Se for foto/imagem enviada no WhatsApp
        const isImage = !!(
          messageObj.imageMessage ||
          data.messageType === 'imageMessage'
        );

        let imageUrl: string | null = null;
        let imageBase64: string | null = null;

        if (isImage) {
          loggerService.whatsapp(`📸 Foto/Imagem detectada de [${pushName}]. Baixando mídia...`);
          try {
            let base64 = data.base64 || messageObj.imageMessage?.base64 || data.media?.base64;
            if (!base64) {
              const mediaData = await whatsappService.getBase64FromMediaMessage(data);
              if (mediaData?.base64) {
                base64 = mediaData.base64;
              }
            }

            if (base64) {
              imageBase64 = base64;
              try {
                const uploadsDir = path.resolve(process.cwd(), 'public/uploads');
                if (!fs.existsSync(uploadsDir)) {
                  fs.mkdirSync(uploadsDir, { recursive: true });
                }
                const filename = `wa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
                const filePath = path.join(uploadsDir, filename);
                const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
                fs.writeFileSync(filePath, Buffer.from(cleanBase64, 'base64'));
                const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://secretary.malves.dev.br';
                imageUrl = `${baseUrl.replace(/\/$/, '')}/uploads/${filename}`;
                loggerService.whatsapp(`✅ Foto salva com sucesso para anúncios/análise: ${imageUrl}`);
              } catch (saveErr: any) {
                loggerService.whatsapp(`Aviso ao salvar arquivo estático: ${saveErr.message}`);
              }
            }
          } catch (imgErr: any) {
            loggerService.whatsapp(`❌ Erro ao baixar foto do WhatsApp: ${imgErr.message}`);
          }
        }

        if (isAudio) {
          loggerService.whatsapp(`🎙️ Áudio de voz detectado de [${pushName}]. Baixando mídia...`);
          try {
            let base64 = data.base64 || messageObj.audioMessage?.base64 || messageObj.pttMessage?.base64 || data.media?.base64;
            let mimetype = messageObj.audioMessage?.mimetype || messageObj.pttMessage?.mimetype || 'audio/ogg; codecs=opus';

            if (!base64) {
              const mediaData = await whatsappService.getBase64FromMediaMessage(data);
              if (mediaData?.base64) {
                base64 = mediaData.base64;
                if (mediaData.mimetype) mimetype = mediaData.mimetype;
              }
            }

            if (base64) {
              loggerService.whatsapp(`🎙️ Enviando áudio de [${pushName}] para transcrição com OpenAI Whisper...`);
              const transcribed = await transcriptionService.transcribeBase64(
                base64,
                mimetype,
                isGroup ? 'whatsapp_group' : 'whatsapp'
              );
              if (transcribed && transcribed.trim().length > 0) {
                text = transcribed.trim();
                loggerService.whatsapp(`✅ Áudio transcrito: "${text}"`, { pushName, transcribedText: text }, 'success');
              } else {
                loggerService.whatsapp(`⚠️ Whisper retornou transcrição vazia para o áudio de [${pushName}]`, null, 'warn');
              }
            } else {
              loggerService.whatsapp(`❌ Falha ao obter base64 do áudio enviado por [${pushName}]`, null, 'error');
            }
          } catch (transcribeErr: any) {
            loggerService.whatsapp(`❌ Erro ao transcrever áudio: ${transcribeErr.message}`, null, 'error');
          }

          if (!text || text.trim().length === 0) {
            loggerService.whatsapp(`⚠️ Áudio não pôde ser transcrito. Enviando aviso.`);
            await whatsappService.sendTextMessage({
              number: remoteJid,
              text: `Olá ${pushName}, recebi seu áudio mas não foi possível transcrevê-lo no momento. Poderia repetir ou enviar em texto?`,
            });
            return;
          }
        }

        if (!text && !isImage) {
          return;
        }

        loggerService.agent(`🤖 Processando mensagem com a Victoria: "${text || '(Foto sem legenda)'}" (de ${pushName})`);

        let promptWithSender = `[${pushName}]: ${text}`;
        if (isAudio) {
          promptWithSender = `[${pushName} (Áudio de Voz Transcrito)]: ${text}`;
        } else if (isImage) {
          promptWithSender = `[${pushName} enviou uma Foto/Imagem no WhatsApp] (Legenda/Texto: "${text || 'Sem legenda'}"). URL da imagem: ${imageUrl || 'N/A'}`;
        }

        const channelType = isGroup ? 'whatsapp_group' : 'whatsapp';

        const result = await chatService.processIncomingMessage({
          externalId: remoteJid,
          channel: channelType,
          message: promptWithSender,
        });

        const assistantReply = result.message.content;

        // Envia a resposta da Victoria de volta para o remetente no WhatsApp
        if (assistantReply && assistantReply.trim().length > 0) {
          loggerService.whatsapp(`📤 Enviando resposta da Victoria para ${remoteJid}...`, {
            replyPreview: assistantReply.slice(0, 100),
          });
          await whatsappService.sendTextMessage({
            number: remoteJid,
            text: assistantReply,
          });
          loggerService.whatsapp(`✅ Resposta entregue no WhatsApp com sucesso!`, null, 'success');
        }
      }
    } catch (err: any) {
      loggerService.whatsapp(`❌ Erro geral ao processar webhook do WhatsApp: ${err.message}`, { stack: err.stack }, 'error');
      req.log.error(`Erro ao processar mensagem do webhook WhatsApp: ${err.message}`);
    }
  });
}
