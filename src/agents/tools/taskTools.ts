import { prisma } from '../../database/client.js';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { whatsappService } from '../../services/whatsapp.service.js';
import { webService } from '../../services/web.service.js';
import { youtubeService } from '../../services/youtube.service.js';
import { googleService } from '../../services/google.service.js';
import { cronService } from '../../services/cron.service.js';
import { klimaPartsService } from '../../services/klimaparts.service.js';
import { metaService } from '../../services/meta.service.js';
import { skillAgentTools, executeSkillTool } from './skillTools.js';
import { skillService } from '../../services/skill.service.js';
import { taskService } from '../../services/task.service.js';

export const agentTools = [
  ...skillAgentTools,
  {
    name: 'get_current_time',
    description: 'Retorna a data e o horário atual exato em tempo real no fuso oficial de Brasília/São Paulo (America/Sao_Paulo - UTC-3), incluindo dia da semana, ano, mês, dia e hora.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'meta_list_clients',
    description: 'Lista todos os clientes cadastrados no Meta Business / Gerenciador de Anúncios com suas respectivas contas de anúncio, BMs vinculadas e metas de CPA.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'meta_get_ads_performance',
    description: 'Consulta as métricas e desempenho de anúncios do Meta Ads (investimento total, leads/compras geradas, cliques, CTR, CPC, CPA/CPL e ROAS) de um cliente específico.',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado (ex: "Clínica Sorriso", "clinica-sorriso", "E-commerce Alpha").',
        },
        datePreset: {
          type: 'string',
          enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month'],
          description: 'Período dos dados de anúncio. Padrão: "today" (hoje). Use "yesterday" para ontem, "last_7d" para últimos 7 dias, "this_month" para este mês.',
        },
      },
      required: ['clientNameOrId'],
    },
  },
  {
    name: 'meta_list_campaigns',
    description: 'Lista as campanhas de um cliente no Meta Ads, exibindo status (ACTIVE/PAUSED), objetivo, orçamento diário, investimento e leads do dia.',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado.',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'PAUSED', 'ALL'],
          description: 'Filtrar por status da campanha. Padrão: "ACTIVE". Use "ALL" para listar todas.',
        },
      },
      required: ['clientNameOrId'],
    },
  },
  {
    name: 'meta_get_campaign_insights',
    description: 'Consulta o histórico detalhado e análise de performance por CAMPANHA de um cliente no Meta Ads (Investimento, Leads, CPA/CPL comparado com a Meta de CPA, Clicks, CTR, CPC, CPM, ROAS e status do orçamento). Permite múltiplos períodos como hoje, ontem, últimos 7 ou 30 dias, este mês, mês passado ou vitalício.',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado.',
        },
        datePreset: {
          type: 'string',
          enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month', 'maximum'],
          description: 'Período histórico de análise. Padrão: "last_7d". Use "today", "yesterday", "last_30d", "this_month", "last_month" ou "maximum".',
        },
        since: {
          type: 'string',
          description: 'Data de início personalizada (formato YYYY-MM-DD). Ex: "2026-09-01".',
        },
        until: {
          type: 'string',
          description: 'Data de término personalizada (formato YYYY-MM-DD). Ex: "2026-09-20".',
        },
        limit: {
          type: 'number',
          description: 'Quantidade máxima de campanhas a retornar. Padrão: 50.',
        },
      },
      required: ['clientNameOrId'],
    },
  },
  {
    name: 'meta_get_creative_insights',
    description: 'Consulta o histórico e métricas detalhadas por CRIATIVO / ANÚNCIO de um cliente no Meta Ads. Retorna texto da copy (bodyText), título/headline, imagem/thumbnail, link do Instagram, investimento, leads, CPA individual, cliques, CTR, CPC, CPM e alerta de fadiga/CPA alto.',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado.',
        },
        datePreset: {
          type: 'string',
          enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month', 'maximum'],
          description: 'Período histórico de análise. Padrão: "last_7d". Use "today", "yesterday", "last_30d", "this_month", "last_month" ou "maximum".',
        },
        since: {
          type: 'string',
          description: 'Data de início personalizada (formato YYYY-MM-DD).',
        },
        until: {
          type: 'string',
          description: 'Data de término personalizada (formato YYYY-MM-DD).',
        },
        campaignId: {
          type: 'string',
          description: 'Opcional: ID da campanha para filtrar apenas os criativos pertencentes a ela.',
        },
        limit: {
          type: 'number',
          description: 'Quantidade máxima de criativos a retornar. Padrão: 50.',
        },
      },
      required: ['clientNameOrId'],
    },
  },
  {
    name: 'meta_get_adset_insights',
    description: 'Consulta o histórico detalhado, métricas de performance e o ORÇAMENTO DIÁRIO CONFIGURADO (ABO) de cada CONJUNTO DE ANÚNCIOS (AdSet) de um cliente. Permite ver o valor exato do orçamento diário configurado em cada conjunto (ex: R$ 37.79/dia, R$ 16.23/dia), gasto, leads, CPL e status (ACTIVE/PAUSED).',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado.',
        },
        datePreset: {
          type: 'string',
          enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month', 'maximum'],
          description: 'Período histórico de análise. Padrão: "last_7d". Use "last_30d" para últimos 30 dias.',
        },
        campaignId: {
          type: 'string',
          description: 'Opcional: ID da campanha para filtrar apenas os conjuntos pertencentes a ela.',
        },
        limit: {
          type: 'number',
          description: 'Quantidade máxima de conjuntos a retornar. Padrão: 50.',
        },
      },
      required: ['clientNameOrId'],
    },
  },
  {
    name: 'meta_update_adset',
    description: 'Pausa ou ativa um CONJUNTO DE ANÚNCIOS (AdSet) específico de um cliente ou ajusta o valor do seu ORÇAMENTO DIÁRIO (ABO).',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado.',
        },
        adsetId: {
          type: 'string',
          description: 'ID numérico do Conjunto de Anúncios (AdSet) no Meta Ads.',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'PAUSED'],
          description: 'Novo status do conjunto ("ACTIVE" para ativar, "PAUSED" para pausar).',
        },
        dailyBudget: {
          type: 'number',
          description: 'Novo valor do orçamento diário em Reais (BRL). Ex: 35.00 para R$ 35/dia.',
        },
      },
      required: ['clientNameOrId', 'adsetId'],
    },
  },
  {
    name: 'meta_update_campaign',
    description: 'Pausa ou ativa uma campanha específica de um cliente no Meta Ads ou ajusta o valor do seu orçamento diário (CBO).',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado.',
        },
        campaignId: {
          type: 'string',
          description: 'ID numérico da campanha no Meta Ads.',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'PAUSED'],
          description: 'Novo status da campanha ("ACTIVE" para ativar, "PAUSED" para pausar).',
        },
        dailyBudget: {
          type: 'number',
          description: 'Novo valor do orçamento diário em Reais (BRL). Ex: 50.00 para R$ 50/dia.',
        },
      },
      required: ['clientNameOrId', 'campaignId'],
    },
  },
  {
    name: 'meta_upload_ad_image',
    description: 'Faz o upload de uma imagem externa (via URL da web ou base64) para a Biblioteca de Criativos do Meta Ads do cliente, retornando o image_hash pronto para uso em anúncios.',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado.',
        },
        url: {
          type: 'string',
          description: 'URL pública da imagem para download e upload no Meta Ads (Método 4).',
        },
        base64: {
          type: 'string',
          description: 'String Base64 da imagem (Método 1 - foto enviada no WhatsApp ou Chat).',
        },
        filename: {
          type: 'string',
          description: 'Nome do arquivo de imagem (opcional, ex: "promo_setembro.jpg").',
        },
      },
      required: ['clientNameOrId'],
    },
  },
  {
    name: 'meta_list_library_media',
    description: 'Lista as imagens e criativos já existentes na biblioteca da conta de anúncios do cliente (Método 3), retornando hash, URL e dimensões de cada imagem disponível.',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado.',
        },
        limit: {
          type: 'number',
          description: 'Quantidade máxima de imagens a listar (padrão: 30).',
        },
      },
      required: ['clientNameOrId'],
    },
  },
  {
    name: 'meta_get_whatsapp_numbers',
    description: 'Consulta e lista os números de WhatsApp conectados à Página do Facebook ou à conta de anúncios (WABA) do cliente, permitindo escolher qual número receberá as mensagens da campanha.',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado (ex: "Rapidus", "KlimaParts").',
        },
      },
      required: ['clientNameOrId'],
    },
  },
  {
    name: 'meta_get_campaign_objectives_guide',
    description: 'Retorna o Guia Oficial com TODOS os tipos e objetivos de campanha do Meta Ads (Engajamento, Cadastros/Leads, Tráfego, Vendas, Reconhecimento, Promoção do App), explicando as melhores práticas e destinos compatíveis (WhatsApp, Direct, Messenger, Formulário Instantâneo, Site, Ligações).',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'meta_create_campaign',
    description: 'Cria uma nova campanha no Meta Ads no modo RASCUNHO (status PAUSED por segurança), configurando objetivo (Engajamento, Leads, Tráfego, Vendas, etc.) e orçamento CBO opcional.',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado.',
        },
        name: {
          type: 'string',
          description: 'Nome da campanha (ex: "[ENGAJAMENTO][WHATSAPP] - Campanha Primavera 2026").',
        },
        objective: {
          type: 'string',
          enum: ['OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_TRAFFIC', 'OUTCOME_SALES', 'OUTCOME_AWARENESS', 'OUTCOME_APP_PROMOTION'],
          description: 'Objetivo oficial da campanha (ODAX). Padrão: "OUTCOME_ENGAGEMENT" (ideal para WhatsApp). Use "OUTCOME_LEADS" para cadastros, "OUTCOME_TRAFFIC" para tráfego, "OUTCOME_SALES" para e-commerce.',
        },
        dailyBudget: {
          type: 'number',
          description: 'Orçamento diário em Reais no nível da campanha (CBO). Se não informado, o orçamento será definido por conjunto (ABO).',
        },
      },
      required: ['clientNameOrId', 'name'],
    },
  },
  {
    name: 'meta_create_adset',
    description: 'Cria um novo Conjunto de Anúncios (AdSet) com orçamento diário ABO, direcionamento para WhatsApp ou Website e segmentação de público (sempre em modo PAUSED).',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado.',
        },
        campaignId: {
          type: 'string',
          description: 'ID da campanha onde o conjunto será inserido.',
        },
        name: {
          type: 'string',
          description: 'Nome do conjunto (ex: "CJ - [CID1] [INTERESSES] [18-45]").',
        },
        dailyBudget: {
          type: 'number',
          description: 'Orçamento diário do conjunto em Reais (BRL). Ex: 30.00 para R$ 30,00/dia.',
        },
        destinationType: {
          type: 'string',
          enum: ['WHATSAPP', 'INSTAGRAM_DIRECT', 'MESSENGER', 'WEBSITE', 'ON_AD', 'APP', 'CALLS'],
          description: 'Destino do tráfego ou conversão. Padrão: "WHATSAPP".',
        },
        whatsappPhoneNumber: {
          type: 'string',
          description: 'Número de telefone do WhatsApp vinculado para receber as mensagens (opcional se houver apenas um na página).',
        },
      },
      required: ['clientNameOrId', 'campaignId', 'name', 'dailyBudget'],
    },
  },
  {
    name: 'meta_create_ad',
    description: 'Cria o Criativo e o Anúncio (Ad) no Meta Ads em modo PAUSED, suportando os 4 métodos de criativo: 1. Imagem enviada via WhatsApp (base64/hash), 2. Post existente do Instagram (dark post / reel via instagramMediaId), 3. Imagem da Biblioteca (imageHash), 4. Imagem via Link/URL da internet (imageUrl).',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado.',
        },
        adsetId: {
          type: 'string',
          description: 'ID do Conjunto de Anúncios (AdSet) onde o anúncio será veiculado.',
        },
        name: {
          type: 'string',
          description: 'Nome do anúncio (ex: "AD 01 - Oferta Especial").',
        },
        headline: {
          type: 'string',
          description: 'Título/Headline exibido no anúncio (ex: "Peças com Frete Grátis | Fale Conosco").',
        },
        bodyText: {
          type: 'string',
          description: 'Texto principal da copy do anúncio.',
        },
        imageHash: {
          type: 'string',
          description: 'Hash da imagem na biblioteca da Meta (Método 1 ou 3).',
        },
        imageUrl: {
          type: 'string',
          description: 'URL de imagem da internet para download automático e upload no Meta Ads (Método 4).',
        },
        instagramMediaId: {
          type: 'string',
          description: 'ID do post existente no Instagram para impulsionar como Dark Post ou anúncio nativo (Método 2).',
        },
        websiteUrl: {
          type: 'string',
          description: 'URL de destino ou link da página (opcional se destino for WhatsApp).',
        },
      },
      required: ['clientNameOrId', 'adsetId', 'name', 'headline', 'bodyText'],
    },
  },
  {
    name: 'meta_create_complete_draft_campaign',
    description: 'Cria a estrutura completa de Campanha + Conjunto (ABO) + Criativo/Anúncio em 1 único passo no modo RASCUNHO (status PAUSED por segurança) e gera o Card Executivo de Aprovação para confirmação do usuário antes de colocar a campanha no ar. Suporta todos os objetivos (Engajamento, Leads, Tráfego, etc.), seleção de número WhatsApp e os 4 métodos de criativos.',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado (ex: "Rapidus", "KlimaParts").',
        },
        campaignName: {
          type: 'string',
          description: 'Nome da campanha (ex: "[ENGAJAMENTO][WHATSAPP] - Captação Outubro").',
        },
        objective: {
          type: 'string',
          enum: ['OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_TRAFFIC', 'OUTCOME_SALES', 'OUTCOME_AWARENESS', 'OUTCOME_APP_PROMOTION'],
          description: 'Objetivo da campanha. Padrão: "OUTCOME_ENGAGEMENT" (mensagens WhatsApp) ou "OUTCOME_LEADS".',
        },
        destinationType: {
          type: 'string',
          enum: ['WHATSAPP', 'INSTAGRAM_DIRECT', 'MESSENGER', 'WEBSITE', 'ON_AD', 'APP', 'CALLS'],
          description: 'Destino dos leads ou conversas (padrão: "WHATSAPP").',
        },
        whatsappPhoneNumber: {
          type: 'string',
          description: 'Número de WhatsApp vinculado da empresa que receberá as mensagens (ex: "+554199999999").',
        },
        adsetName: {
          type: 'string',
          description: 'Nome do conjunto de anúncios (ex: "CJ - [CID1] [INTERESSES AUTOMOTIVOS] [18-55]").',
        },
        adName: {
          type: 'string',
          description: 'Nome do anúncio (ex: "AD 01 - Imagem Peças").',
        },
        dailyBudget: {
          type: 'number',
          description: 'Orçamento diário do conjunto em Reais (BRL). Ex: 30.00 para R$ 30,00/dia.',
        },
        headline: {
          type: 'string',
          description: 'Título curto / Headline do anúncio.',
        },
        bodyText: {
          type: 'string',
          description: 'Texto persuasivo / copy do anúncio.',
        },
        imageHash: {
          type: 'string',
          description: 'Hash da imagem já salva na biblioteca (Método 3).',
        },
        imageUrl: {
          type: 'string',
          description: 'URL pública de imagem da web para upload automático (Método 4).',
        },
        imageBase64: {
          type: 'string',
          description: 'Base64 da imagem enviada pelo usuário no WhatsApp ou chat (Método 1).',
        },
        instagramMediaId: {
          type: 'string',
          description: 'ID de post existente no Instagram (Método 2).',
        },
        targetAudienceDescription: {
          type: 'string',
          description: 'Descrição do público-alvo para nomenclatura do conjunto (ex: "Carros / Empresários").',
        },
        websiteUrl: {
          type: 'string',
          description: 'Link do site (se o destino for WEBSITE).',
        },
      },
      required: ['clientNameOrId', 'campaignName', 'dailyBudget', 'headline', 'bodyText'],
    },
  },
  {
    name: 'meta_get_instagram_insights',
    description: 'Consulta métricas e insights orgânicos do Instagram de um cliente (Seguidores, Alcance, Visualizações de Vídeos/Reels, Engajamento total, Curtidas, Comentários, Salvamentos, Visitas ao Perfil e Top Posts/Reels com links e estatísticas detalhadas).',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado (ex: "Rapidus", "KlimaParts", "@comercial_rapidus").',
        },
        days: {
          type: 'number',
          description: 'Quantidade de dias do período de análise orgânica (padrão: 30 dias). Ex: 7, 14, 30.',
        },
        limitPosts: {
          type: 'number',
          description: 'Quantidade máxima de publicações/reels recentes para analisar (padrão: 6).',
        },
      },
      required: ['clientNameOrId'],
    },
  },
  {
    name: 'meta_get_facebook_page_insights',
    description: 'Consulta métricas e estatísticas da Página do Facebook do cliente (Seguidores, Curtidas na página/Fãs, Pessoas falando sobre, Categoria e últimas publicações do Feed com reações, comentários e compartilhamentos).',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado (ex: "Rapidus", "KlimaParts").',
        },
        limitPosts: {
          type: 'number',
          description: 'Quantidade máxima de publicações da Página a retornar (padrão: 5).',
        },
      },
      required: ['clientNameOrId'],
    },
  },
  {
    name: 'meta_get_social_overview',
    description: 'Consulta uma visão geral consolidada 360º de Redes Sociais e Anúncios do cliente, reunindo em um único relatório executivo: Instagram Orgânico (seguidores, alcance, visualizações), Facebook (fãs e seguidores) e Meta Ads (investimento, leads, CPL e cliques dos últimos 30 dias).',
    parameters: {
      type: 'object',
      properties: {
        clientNameOrId: {
          type: 'string',
          description: 'Nome, slug ou ID do cliente cadastrado.',
        },
      },
      required: ['clientNameOrId'],
    },
  },
  {
    name: 'create_scheduled_job',
    description: 'Cria uma rotina ou mensagem automática recorrente (Cron) para envio no WhatsApp (ex: "todo dia às 08:00 me mande um resumo", "todo dia útil às 18h me envie X", "todo sábado às 10h me lembre de Y").',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Nome ou finalidade da rotina agendada (ex: "Resumo Matinal", "Lembrete Fechamento Financeiro").',
        },
        cronExpr: {
          type: 'string',
          description: 'Horário diário (ex: "08:00", "18:30", "09:00") ou expressão cron padrão de 5 campos (ex: "0 8 * * *" ou "0 8 * * 1-5" para dias úteis) calculada no fuso de São Paulo (UTC-3).',
        },
        actionType: {
          type: 'string',
          enum: ['daily_briefing', 'evening_pending_tasks', 'custom_prompt'],
          description: '"daily_briefing" para o resumo executivo matinal (Google Calendar + Tarefas); "evening_pending_tasks" para o fechamento diário das 18h com as tarefas do Google Tasks ainda pendentes (0 tokens de IA); ou "custom_prompt" para qualquer outra mensagem/instrução personalizada.',
        },
        prompt: {
          type: 'string',
          description: 'Instrução ou mensagem específica que a Victoria deve formular e enviar quando o horário disparar.',
        },
      },
      required: ['title', 'cronExpr'],
    },
  },
  {
    name: 'list_scheduled_jobs',
    description: 'Lista todas as rotinas, crons e automações periódicas ativas no Business OS.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'delete_scheduled_job',
    description: 'Cancela e exclui uma rotina agendada pelo ID ou nome aproximado.',
    parameters: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'ID ou nome da rotina agendada a ser cancelada.',
        },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'trigger_daily_briefing_now',
    description: 'Dispara e envia imediatamente o Resumo Matinal Executivo completo (Google Calendar + Tarefas) para o WhatsApp do Maychel agora mesmo.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'google_calendar_create_event',
    description: 'Cria um evento, reunião ou compromisso oficial no Google Calendar (Google Agenda) do usuário, gerando opcionalmente link do Google Meet e disparando convites por e-mail para participantes.',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Título ou assunto principal da reunião / compromisso.',
        },
        startDateTime: {
          type: 'string',
          description: 'Data e hora de início no formato ISO 8601 (ex: "2026-09-11T14:00:00.000Z") calculada a partir do fuso horário de São Paulo / Brasília (America/Sao_Paulo UTC-3).',
        },
        endDateTime: {
          type: 'string',
          description: 'Data e hora de término no formato ISO 8601 (opcional; se omitido, calcula com base na duração).',
        },
        durationMinutes: {
          type: 'number',
          description: 'Duração estimada em minutos (padrão: 60 minutos).',
        },
        description: {
          type: 'string',
          description: 'Pauta, descrição ou detalhes da reunião.',
        },
        location: {
          type: 'string',
          description: 'Local físico ou observação de local.',
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de endereços de e-mail dos convidados para enviar convite no Google Calendar.',
        },
        createMeetLink: {
          type: 'boolean',
          description: 'Se true (padrão), gera automaticamente uma sala do Google Meet com link para a chamada de vídeo.',
        },
      },
      required: ['summary', 'startDateTime'],
    },
  },
  {
    name: 'google_calendar_list_events',
    description: 'Consulta os eventos e reuniões agendados no Google Calendar do usuário em um intervalo de tempo.',
    parameters: {
      type: 'object',
      properties: {
        timeMin: {
          type: 'string',
          description: 'Data/hora inicial em ISO 8601 (padrão: momento atual).',
        },
        timeMax: {
          type: 'string',
          description: 'Data/hora final em ISO 8601 (opcional, para limitar busca até um dia específico).',
        },
        query: {
          type: 'string',
          description: 'Palavra-chave para filtrar eventos por título ou descrição (opcional).',
        },
      },
    },
  },
  {
    name: 'google_calendar_delete_event',
    description: 'Exclui ou cancela um evento do Google Calendar pelo ID do evento.',
    parameters: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: 'ID do evento no Google Calendar a ser excluído.',
        },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'google_contacts_search',
    description: 'Pesquisa contatos salvos na conta do Google do usuário (obtém nomes, e-mails, telefones e empresas).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Nome, e-mail ou termo a pesquisar nos contatos do Google.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'google_tasks_create',
    description: 'Cria uma nova tarefa no Google Tasks do usuário.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Título da tarefa no Google Tasks.',
        },
        notes: {
          type: 'string',
          description: 'Anotações adicionais da tarefa.',
        },
        due: {
          type: 'string',
          description: 'Data de vencimento em ISO 8601 (opcional).',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'google_tasks_update',
    description: 'Atualiza o título, data de vencimento (due), notas ou status de uma tarefa existente no Google Tasks. Use para remarcar uma tarefa em vez de criar uma duplicata.',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'ID da tarefa no Google Tasks ou título aproximado para busca.',
        },
        title: {
          type: 'string',
          description: 'Novo título da tarefa (opcional).',
        },
        notes: {
          type: 'string',
          description: 'Novas anotações (opcional).',
        },
        due: {
          type: 'string',
          description: 'Nova data de vencimento no formato ISO 8601 calculada no fuso de São Paulo (America/Sao_Paulo UTC-3).',
        },
        status: {
          type: 'string',
          enum: ['needsAction', 'completed'],
          description: '"completed" para marcar como concluída, "needsAction" para pendente.',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'google_tasks_delete',
    description: 'Exclui permanentemente uma tarefa do Google Tasks pelo ID ou nome aproximado.',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'ID da tarefa ou título aproximado da tarefa a ser excluída.',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'google_tasks_clean_duplicates',
    description: 'Faz uma varredura automática no Google Tasks e exclui tarefas duplicadas e versões obsoletas com o mesmo título, preservando apenas a versão mais recente.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'google_tasks_list',
    description: 'Lista as tarefas ativas cadastradas no Google Tasks. Padrão: se o usuário pedir "Tarefas", traga dos próximos 7 dias (scope="next_7_days"); se pedir "Tarefas de Hoje", traga só as de hoje (scope="today").',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['next_7_days', 'today', 'all', 'overdue'],
          description: 'Escopo de busca: "next_7_days" para os próximos 7 dias (padrão ao pedir "Tarefas"), "today" para apenas as de hoje (ao pedir "Tarefas de Hoje"), "overdue" para atrasadas ou "all".',
        },
      },
    },
  },
  {
    name: 'google_gmail_list_emails',
    description: 'Lista os e-mails recentes da caixa de entrada do Gmail do usuário (com busca por remetente, assunto ou filtro de não lidos).',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Quantidade máxima de e-mails a retornar (padrão: 8).',
        },
        query: {
          type: 'string',
          description: 'Termo de busca no Gmail (ex: "from:juliano", "subject:contrato", "financeiro").',
        },
        unreadOnly: {
          type: 'boolean',
          description: 'Se true, lista apenas e-mails não lidos.',
        },
      },
    },
  },
  {
    name: 'google_gmail_read_email',
    description: 'Lê o conteúdo completo, assunto, remetente e corpo de um e-mail específico pelo ID.',
    parameters: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description: 'ID da mensagem no Gmail.',
        },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'google_gmail_send_email',
    description: 'Envia um e-mail pelo Gmail em nome do usuário.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Endereço de e-mail do destinatário.',
        },
        subject: {
          type: 'string',
          description: 'Assunto do e-mail.',
        },
        body: {
          type: 'string',
          description: 'Texto/corpo da mensagem.',
        },
        cc: {
          type: 'string',
          description: 'Destinatário em cópia (opcional).',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'whatsapp_send_message',
    description: 'Envia uma mensagem de texto no WhatsApp para um contato específico, fornecedor ou grupo (ex: grupo de pedidos da KlimaParts: 120363411122445690@g.us).',
    parameters: {
      type: 'object',
      properties: {
        number: {
          type: 'string',
          description: 'Número de telefone do destinatário (com DDI+DDD, ex: "5541999999999") ou ID do grupo (ex: "120363411122445690@g.us"). Se for o grupo de pedidos da KlimaParts, use o ID 120363411122445690@g.us.',
        },
        message: {
          type: 'string',
          description: 'Texto da mensagem formatado para envio no WhatsApp.',
        },
      },
      required: ['number', 'message'],
    },
  },
  {
    name: 'klimaparts_list_pending_orders',
    description: 'Consulta os pedidos recentes e envios pendentes da KlimaParts / ArmorCar no Mercado Livre e Magalu.',
    parameters: {
      type: 'object',
      properties: {
        storeId: {
          type: 'number',
          description: 'ID da loja (1 para KlimaParts, 2 para ArmorCar). Padrão: 1.',
        },
        days: {
          type: 'number',
          description: 'Janela de dias para consulta (padrão: 7).',
        },
      },
    },
  },
  {
    name: 'klimaparts_store_overview',
    description: 'Obtém a visão geral executiva, faturamento, lucratividade, total de pedidos e produtos mais vendidos da loja KlimaParts ou ArmorCar. Use days=1 para hoje / últimas 24h, days=7 para última semana, days=30 para mês.',
    parameters: {
      type: 'object',
      properties: {
        storeId: {
          type: 'number',
          description: 'ID da loja (1 = KlimaParts, 2 = ArmorCar). Padrão: 1.',
        },
        days: {
          type: 'number',
          description: 'Quantidade de dias de histórico (ex: 1 para hoje / últimas 24h, 7 para semana, 30 para últimos 30 dias). Padrão: 30.',
        },
      },
    },
  },
  {
    name: 'klimaparts_get_questions',
    description: 'Consulta perguntas de compradores pendentes de resposta no Mercado Livre da KlimaParts.',
    parameters: {
      type: 'object',
      properties: {
        storeId: {
          type: 'number',
          description: 'ID da loja (padrão: 1).',
        },
      },
    },
  },
  {
    name: 'klimaparts_search_ads',
    description: 'Pesquisa produtos, estoque, códigos originais e preços no catálogo de autopeças da KlimaParts.',
    parameters: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Termo de busca (SKU, modelo do carro ou nome da peça, ex: "Compressor Creta", "KP-AT8303S").',
        },
        storeId: {
          type: 'number',
          description: 'ID da loja (padrão: 1).',
        },
      },
      required: ['searchTerm'],
    },
  },
  {
    name: 'klimaparts_send_purchase_order',
    description: 'Monta e dispara uma ordem de compra para o fornecedor ou para o grupo de pedidos no WhatsApp (ex: grupo KlimaParts Teste: 120363411122445690@g.us).',
    parameters: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description: 'Código ou SKU da peça.',
        },
        productTitle: {
          type: 'string',
          description: 'Nome completo da peça / produto.',
        },
        quantity: {
          type: 'number',
          description: 'Quantidade de peças (padrão: 1).',
        },
        carModel: {
          type: 'string',
          description: 'Aplicação veicular / modelo do carro (opcional).',
        },
        orderId: {
          type: 'string',
          description: 'ID do pedido de venda relacionado (opcional).',
        },
        targetNumber: {
          type: 'string',
          description: 'Número de WhatsApp do fornecedor ou ID do grupo (padrão: 120363411122445690@g.us para o grupo de pedidos da KlimaParts).',
        },
      },
      required: ['sku'],
    },
  },
  {
    name: 'create_task',
    description: 'Cria uma nova tarefa, compromisso ou lembrete na agenda do Business OS.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Título curto e claro da tarefa ou compromisso.',
        },
        description: {
          type: 'string',
          description: 'Detalhes adicionais, notas ou instruções da tarefa.',
        },
        dueDate: {
          type: 'string',
          description: 'Data e hora limite ou agendada no formato ISO 8601 (ex: "2026-09-10T17:00:00.000Z") calculada rigorosamente a partir do fuso horário de São Paulo / Brasília (UTC-3). Se o usuário disser "amanhã às 14h", calcule 14h no horário de São Paulo e converta para ISO.',
        },
        priority: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
          description: 'Nível de prioridade da tarefa.',
        },
        category: {
          type: 'string',
          description: 'Categoria da tarefa (ex: "Reunião", "Financeiro", "Lembrete", "Pessoal").',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_tasks',
    description: 'Lista as tarefas cadastradas no sistema com filtros opcionais.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
          description: 'Filtrar por status. O padrão é retornar PENDING se não informado.',
        },
        category: {
          type: 'string',
          description: 'Filtrar por categoria.',
        },
      },
    },
  },
  {
    name: 'complete_task',
    description: 'Marca uma tarefa existente como concluída.',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'ID único da tarefa a ser concluída.',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'save_memory',
    description: 'Salva ou atualiza uma preferência, informação, contato ou fato importante sobre o usuário na memória de longo prazo.',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Identificador único da informação (ex: "user_name", "contato_fulano", "horario_preferido_reuniao", "endereco_casa").',
        },
        value: {
          type: 'string',
          description: 'Valor ou detalhe a ser memorizado.',
        },
        category: {
          type: 'string',
          description: 'Categoria do fato (ex: "preferencia", "contato", "empresa", "pessoal", "rotina").',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'delete_memory',
    description: 'Remove, apaga ou esquece uma memória/preferência do banco de dados quando ela estiver desatualizada, incorreta, em conflito com informações novas ou quando o usuário pedir para esquecer.',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Chave exata ou termo principal da memória a ser removida (ex: "endereco_antigo", "preferencia_cafe", "contato_fulano").',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'list_memories',
    description: 'Lista todas as memórias e preferências ativas salvas na memória de longo prazo.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filtrar por categoria específica (opcional).',
        },
      },
    },
  },
  {
    name: 'search_memory',
    description: 'Busca fatos, contatos e preferências registrados na memória de longo prazo.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Termo para pesquisar nas chaves ou no conteúdo das memórias.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_whatsapp_contacts',
    description: 'Pesquisa e identifica contatos na agenda e conversas do WhatsApp por nome, apelido ou número de telefone.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Nome, apelido ou número de telefone para pesquisar (ex: "Juliano", "41 8763-0752", "Amor").',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'send_whatsapp_message',
    description: 'Envia uma mensagem de texto pelo WhatsApp para um contato ou número informado.',
    parameters: {
      type: 'object',
      properties: {
        number: {
          type: 'string',
          description: 'Número de telefone do destinatário (com DDD, ex: "41987630752" ou "554187630752").',
        },
        text: {
          type: 'string',
          description: 'Texto da mensagem a ser enviada no WhatsApp.',
        },
      },
      required: ['number', 'text'],
    },
  },
  {
    name: 'read_webpage',
    description: 'Lê e extrai o conteúdo completo de um link/URL da internet (artigos, notícias, páginas web ou transcrições de vídeos do YouTube).',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL completa da página ou vídeo do YouTube (ex: "https://g1.globo.com/..." ou "https://youtube.com/watch?v=...").',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'search_web',
    description: 'Pesquisa informações ao vivo na internet para responder dúvidas, checar fatos, endereços, horários ou notícias.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Termo de pesquisa na internet (ex: "previsão do tempo Curitiba", "horário de funcionamento cartório Pinhais").',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_youtube',
    description: 'Pesquisa vídeos, Shorts, canais e conteúdos diretamente no YouTube, retornando títulos, URLs diretas, contagem real de visualizações (views), canais e data exata de postagem / tempo relativo (ex: "há 2 horas", "há 3 dias", "2026-09-09").',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Termo de pesquisa no YouTube (ex: "curiosity facts shorts english", "fatos bizarros", "noticias tecnologia").',
        },
        type: {
          type: 'string',
          enum: ['all', 'shorts', 'video'],
          description: 'Filtrar por formato: "shorts" (vídeos curtos verticais < 60s), "video" (vídeos convencionais) ou "all".',
        },
        sortBy: {
          type: 'string',
          enum: ['relevance', 'views', 'recent'],
          description: 'Ordenação: "views" (mais visualizados / virais), "recent" (mais recentes) ou "relevance".',
        },
        uploadDate: {
          type: 'string',
          enum: ['all', 'hour', 'today', 'week', 'month', 'year'],
          description: 'Filtrar vídeos postados em período recente: "today" (últimas 24h), "week" (esta semana), "month" (este mês), "year" (este ano) ou "all".',
        },
        maxResults: {
          type: 'number',
          description: 'Quantidade máxima de resultados a retornar (padrão: 5).',
        },
      },
      required: ['query'],
    },
  },
];

export async function executeTool(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'create_task': {
      const task = await taskService.createTask({
        title: args.title,
        description: args.description || undefined,
        dueDate: args.dueDate || undefined,
        priority: (args.priority as TaskPriority) || TaskPriority.MEDIUM,
        category: args.category || 'Google Tasks',
      });
      return { success: true, message: 'Tarefa criada com sucesso no Google Tasks', task };
    }

    case 'list_tasks': {
      const tasks = await taskService.getAllTasks({
        status: args.status ? (args.status as TaskStatus) : undefined,
        category: args.category,
      });
      return { count: tasks.length, tasks };
    }

    case 'complete_task': {
      const task = await taskService.updateTask(args.taskId, {
        status: TaskStatus.COMPLETED,
      });
      return { success: true, message: 'Tarefa concluída com sucesso no Google Tasks', task };
    }

    case 'save_memory': {
      const memory = await prisma.memory.upsert({
        where: { key: args.key },
        update: { value: args.value, category: args.category || null },
        create: { key: args.key, value: args.value, category: args.category || null },
      });
      return { success: true, message: 'Informação memorizada com sucesso', memory };
    }

    case 'delete_memory': {
      const keyQuery = (args.key || '').trim();
      const existing = await prisma.memory.findFirst({
        where: {
          OR: [
            { key: keyQuery },
            { key: { contains: keyQuery } },
            { value: { contains: keyQuery } },
          ],
        },
      });

      if (!existing) {
        return {
          success: false,
          message: `Nenhuma memória encontrada correspondente a "${keyQuery}".`,
        };
      }

      await prisma.memory.delete({
        where: { id: existing.id },
      });

      return {
        success: true,
        message: `Memória "${existing.key}" excluída com sucesso.`,
        deletedMemory: existing,
      };
    }

    case 'list_memories': {
      const where: any = {};
      if (args.category) {
        where.category = args.category;
      }
      const memories = await prisma.memory.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 30,
      });
      return { count: memories.length, memories };
    }

    case 'search_memory': {
      const q = (args.query || '').toLowerCase();
      const memories = await prisma.memory.findMany({
        where: {
          OR: [
            { key: { contains: q } },
            { value: { contains: q } },
            { category: { contains: q } },
          ],
        },
        take: 10,
      });
      return { count: memories.length, memories };
    }

    case 'search_whatsapp_contacts': {
      const contacts = await whatsappService.findContacts(args.query);
      if (!contacts || contacts.length === 0) {
        return {
          found: false,
          message: `Nenhum contato encontrado para "${args.query}" no WhatsApp.`,
          contacts: [],
        };
      }
      const formatted = contacts.map((c: any) => ({
        name: c.pushName || c.name || 'Sem nome salvo',
        phone: (c.remoteJid || '').replace('@s.whatsapp.net', '').replace('@c.us', ''),
        remoteJid: c.remoteJid,
      }));
      return {
        found: true,
        count: formatted.length,
        contacts: formatted,
      };
    }

    case 'send_whatsapp_message': {
      const res = await whatsappService.sendTextMessage({
        number: args.number,
        text: args.text,
      });
      return { success: true, message: `Mensagem enviada com sucesso para ${args.number}`, data: res };
    }

    case 'read_webpage': {
      const res = await webService.readWebpage(args.url);
      return res;
    }

    case 'search_web': {
      const res = await webService.searchWeb(args.query);
      return res;
    }

    case 'search_youtube': {
      const res = await youtubeService.search(args.query, {
        type: args.type,
        sortBy: args.sortBy,
        uploadDate: args.uploadDate,
        maxResults: args.maxResults || 5,
      });
      return res;
    }

    case 'google_calendar_create_event': {
      const res = await googleService.createCalendarEvent({
        summary: args.summary,
        description: args.description,
        location: args.location,
        startDateTime: args.startDateTime,
        endDateTime: args.endDateTime,
        durationMinutes: args.durationMinutes,
        attendees: args.attendees,
        createMeetLink: args.createMeetLink,
      });
      return res;
    }

    case 'google_calendar_list_events': {
      const res = await googleService.listCalendarEvents({
        timeMin: args.timeMin,
        timeMax: args.timeMax,
        query: args.query,
      });
      return res;
    }

    case 'google_calendar_delete_event': {
      const res = await googleService.deleteCalendarEvent(args.eventId);
      return res;
    }

    case 'google_contacts_search': {
      const res = await googleService.searchContacts(args.query);
      return res;
    }

    case 'google_tasks_create': {
      const res = await googleService.createTask(args.title, args.notes, args.due);
      return res;
    }

    case 'google_tasks_list': {
      const res = await googleService.listTasks({ scope: args.scope || 'next_7_days' });
      return res;
    }

    case 'google_tasks_update': {
      const res = await googleService.updateTask(args.taskId, {
        title: args.title,
        notes: args.notes,
        due: args.due,
        status: args.status,
      });
      return res;
    }

    case 'google_tasks_delete': {
      const res = await googleService.deleteTask(args.taskId);
      return res;
    }

    case 'google_tasks_clean_duplicates': {
      const res = await googleService.cleanDuplicateTasks();
      return res;
    }

    case 'google_gmail_list_emails': {
      const res = await googleService.listEmails({
        maxResults: args.maxResults,
        query: args.query,
        unreadOnly: args.unreadOnly,
      });
      return res;
    }

    case 'google_gmail_read_email': {
      const res = await googleService.readEmail(args.messageId);
      return res;
    }

    case 'google_gmail_send_email': {
      const res = await googleService.sendEmail({
        to: args.to,
        subject: args.subject,
        body: args.body,
        cc: args.cc,
      });
      return res;
    }

    case 'whatsapp_send_message': {
      const targetNumber = args.number || '120363411122445690@g.us';
      const res = await whatsappService.sendTextMessage({
        number: targetNumber,
        text: args.message,
      });
      return { success: true, message: `Mensagem enviada com sucesso no WhatsApp para ${targetNumber}!`, details: res };
    }

    case 'klimaparts_list_pending_orders': {
      const res = await klimaPartsService.listPendingOrders(args.storeId, args.days);
      return res;
    }

    case 'klimaparts_store_overview': {
      const res = await klimaPartsService.getStoreOverview(args.storeId, args.days || 30);
      return res;
    }

    case 'klimaparts_get_questions': {
      const res = await klimaPartsService.getUnansweredQuestions(args.storeId);
      return res;
    }

    case 'klimaparts_search_ads': {
      const res = await klimaPartsService.searchAds(args.searchTerm, args.storeId);
      return res;
    }

    case 'klimaparts_send_purchase_order': {
      const targetNumber = args.targetNumber || '120363411122445690@g.us';
      const formattedMessage = klimaPartsService.formatPurchaseOrder({
        sku: args.sku,
        productTitle: args.productTitle,
        quantity: args.quantity || 1,
        carModel: args.carModel,
        orderId: args.orderId,
      });

      const res = await whatsappService.sendTextMessage({
        number: targetNumber,
        text: formattedMessage,
      });

      return {
        success: true,
        message: `Pedido de compra enviado com sucesso para ${targetNumber}!`,
        orderSent: formattedMessage,
        details: res,
      };
    }

    case 'create_scheduled_job': {
      const job = await cronService.createJob({
        title: args.title,
        cronExpr: args.cronExpr,
        actionType: args.actionType || 'daily_briefing',
        prompt: args.prompt,
      });
      return { success: true, message: `Rotina agendada "${job.title}" criada com sucesso para ${job.cronExpr}!`, job };
    }

    case 'list_scheduled_jobs': {
      const jobs = await cronService.listJobs();
      return { count: jobs.length, jobs };
    }

    case 'delete_scheduled_job': {
      const query = (args.jobId || '').trim();
      const all = await cronService.listJobs();
      const found = all.find((j: any) => j.id === query || j.title.toLowerCase().includes(query.toLowerCase()));
      if (!found) {
        return { success: false, message: `Nenhuma rotina agendada encontrada para "${query}".` };
      }
      await cronService.deleteJob(found.id);
      return { success: true, message: `Rotina "${found.title}" cancelada e excluída com sucesso.` };
    }

    case 'trigger_daily_briefing_now': {
      const all = await cronService.listJobs();
      const briefingJob = all.find((j: any) => j.actionType === 'daily_briefing') || all[0];
      if (briefingJob) {
        const res = await cronService.executeJob(briefingJob.id, true);
        return { success: true, message: 'Resumo Matinal disparado e enviado para o seu WhatsApp agora!', details: res };
      } else {
        const tempJob = await cronService.createJob({
          title: 'Resumo Matinal',
          cronExpr: '0 8 * * *',
          actionType: 'daily_briefing',
        });
        const res = await cronService.executeJob(tempJob.id, true);
        return { success: true, message: 'Resumo Matinal gerado e enviado para o seu WhatsApp agora!', details: res };
      }
    }

    case 'meta_list_clients': {
      const clients = await metaService.listClients();
      return {
        total: clients.length,
        clients: clients.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description,
          connectedAssets: c.connectedAssets,
          adAccountId: c.adAccountId,
          adAccountName: c.adAccountName,
          currency: c.currency,
          bmName: c.bmName || c.profile?.name,
          profileName: c.profile?.name,
          instagramUsername: c.instagramUsername,
          facebookPageName: c.facebookPageName,
          targetCpa: c.targetCpa,
        })),
      };
    }

    case 'meta_get_ads_performance': {
      return await metaService.getAdAccountInsights(args.clientNameOrId, {
        datePreset: args.datePreset || 'today',
      });
    }

    case 'meta_list_campaigns': {
      return await metaService.listCampaigns(args.clientNameOrId, {
        status: args.status || 'ACTIVE',
      });
    }

    case 'meta_get_campaign_insights': {
      return await metaService.getCampaignInsights(args.clientNameOrId, {
        datePreset: args.datePreset || 'last_7d',
        timeRange: args.since && args.until ? { since: args.since, until: args.until } : undefined,
        limit: args.limit,
      });
    }

    case 'meta_get_creative_insights': {
      return await metaService.getCreativeInsights(args.clientNameOrId, {
        datePreset: args.datePreset || 'last_7d',
        timeRange: args.since && args.until ? { since: args.since, until: args.until } : undefined,
        campaignId: args.campaignId,
        limit: args.limit,
      });
    }

    case 'meta_get_adset_insights': {
      return await metaService.getAdSetInsights(args.clientNameOrId, {
        datePreset: args.datePreset || 'last_7d',
        timeRange: args.since && args.until ? { since: args.since, until: args.until } : undefined,
        campaignId: args.campaignId,
        limit: args.limit,
      });
    }

    case 'meta_update_adset': {
      if (args.status) {
        return await metaService.updateAdSetStatus(args.clientNameOrId, args.adsetId, args.status);
      }
      if (args.dailyBudget) {
        return await metaService.updateAdSetBudget(args.clientNameOrId, args.adsetId, args.dailyBudget);
      }
      return { success: false, error: 'Informe "status" (ACTIVE/PAUSED) ou "dailyBudget" numérico.' };
    }

    case 'meta_update_campaign': {
      if (args.status) {
        return await metaService.updateCampaignStatus(args.clientNameOrId, args.campaignId, args.status);
      }
      if (args.dailyBudget) {
        return await metaService.updateCampaignBudget(args.clientNameOrId, args.campaignId, args.dailyBudget);
      }
      return { success: false, error: 'Informe "status" (ACTIVE/PAUSED) ou "dailyBudget" numérico.' };
    }

    case 'meta_get_whatsapp_numbers': {
      return await metaService.getWhatsAppPhoneNumbers(args.clientNameOrId);
    }

    case 'meta_get_campaign_objectives_guide': {
      return metaService.getCampaignObjectivesGuide();
    }

    case 'meta_upload_ad_image': {
      return await metaService.uploadAdImage(args.clientNameOrId, {
        url: args.url,
        base64: args.base64,
        filename: args.filename,
      });
    }

    case 'meta_list_library_media': {
      return await metaService.listLibraryImages(args.clientNameOrId, args.limit || 30);
    }

    case 'meta_create_campaign': {
      return await metaService.createCampaign(args.clientNameOrId, {
        name: args.name,
        objective: args.objective,
        dailyBudget: args.dailyBudget,
      });
    }

    case 'meta_create_adset': {
      return await metaService.createAdSet(args.clientNameOrId, {
        campaignId: args.campaignId,
        name: args.name,
        dailyBudget: args.dailyBudget,
        destinationType: args.destinationType,
        whatsappPhoneNumber: args.whatsappPhoneNumber,
      });
    }

    case 'meta_create_ad': {
      return await metaService.createAdCreativeAndAd(args.clientNameOrId, {
        adsetId: args.adsetId,
        name: args.name,
        headline: args.headline,
        bodyText: args.bodyText,
        imageHash: args.imageHash,
        imageUrl: args.imageUrl,
        instagramMediaId: args.instagramMediaId,
        websiteUrl: args.websiteUrl,
      });
    }

    case 'meta_create_complete_draft_campaign': {
      return await metaService.createCompleteDraftCampaign(args.clientNameOrId, {
        campaignName: args.campaignName,
        objective: args.objective,
        adsetName: args.adsetName,
        adName: args.adName,
        dailyBudget: args.dailyBudget,
        headline: args.headline,
        bodyText: args.bodyText,
        imageHash: args.imageHash,
        imageUrl: args.imageUrl,
        imageBase64: args.imageBase64,
        instagramMediaId: args.instagramMediaId,
        targetAudienceDescription: args.targetAudienceDescription,
        destinationType: args.destinationType,
        whatsappPhoneNumber: args.whatsappPhoneNumber,
        websiteUrl: args.websiteUrl,
      });
    }

    case 'meta_get_instagram_insights': {
      return await metaService.getInstagramInsights(args.clientNameOrId, {
        days: args.days,
        limitPosts: args.limitPosts,
      });
    }

    case 'meta_get_facebook_page_insights': {
      return await metaService.getFacebookPageInsights(args.clientNameOrId, {
        limitPosts: args.limitPosts,
      });
    }

    case 'meta_get_social_overview': {
      return await metaService.getSocialMediaOverview(args.clientNameOrId);
    }

    case 'get_current_time': {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'full',
        timeStyle: 'medium',
      });
      const dayOfWeekFormatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'long',
      });
      const dateOnlyFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const timeOnlyFormatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      return {
        success: true,
        fullFormatted: formatter.format(now),
        dayOfWeek: dayOfWeekFormatter.format(now),
        currentDate: dateOnlyFormatter.format(now), // "YYYY-MM-DD"
        currentTime: timeOnlyFormatter.format(now), // "HH:MM:SS"
        timezone: 'America/Sao_Paulo (UTC-3)',
        timestampMs: now.getTime(),
      };
    }

    default: {
      if (name.startsWith('skill_')) {
        return await executeSkillTool(name, args);
      }
      if (name.startsWith('dyn_skill_')) {
        const skillSlug = name.replace('dyn_skill_', '');
        return await skillService.executeSkill(skillSlug, args);
      }
      throw new Error(`Ferramenta desconhecida: ${name}`);
    }
  }
}
