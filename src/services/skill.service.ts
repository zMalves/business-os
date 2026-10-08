import { prisma } from '../database/client.js';
import { executeTool } from '../agents/tools/taskTools.js';
import { loggerService } from './logger.service.js';

export interface SkillWorkflowStep {
  id: string;
  type: 'tool_call' | 'format_template' | 'condition';
  title?: string;
  toolName?: string;
  args?: Record<string, any>;
  template?: string;
  outputKey?: string;
}

export interface DynamicSkillInput {
  name: string;
  displayName: string;
  description: string;
  triggerExamples?: string[];
  parametersSchema?: Record<string, any>;
  workflow: SkillWorkflowStep[];
  isActive?: boolean;
  isDraft?: boolean;
}

/**
 * Realiza interpolação profunda de variáveis em objetos e strings usando {{input.var}} ou {{steps.step_id.prop}}
 */
function interpolateVariables(target: any, context: { input: Record<string, any>; steps: Record<string, any> }): any {
  if (typeof target === 'string') {
    return target.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
      const parts = path.split('.');
      let current: any = context;
      for (const part of parts) {
        if (current === undefined || current === null) return '';
        current = current[part];
      }
      return current !== undefined && current !== null ? String(current) : '';
    });
  }

  if (Array.isArray(target)) {
    return target.map((item) => interpolateVariables(item, context));
  }

  if (target !== null && typeof target === 'object') {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(target)) {
      result[key] = interpolateVariables(val, context);
    }
    return result;
  }

  return target;
}

export class SkillService {
  /**
   * Lista todas as skills ativas para injeção no Tool Gating
   */
  async listActiveSkills() {
    return prisma.dynamicSkill.findMany({
      where: {
        isActive: true,
        isDraft: false,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Lista todas as skills cadastradas (ativas, rascunhos ou inativas)
   */
  async listAllSkills() {
    return prisma.dynamicSkill.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { executions: true },
        },
      },
    });
  }

  /**
   * Obtém uma skill por nome slug ou ID
   */
  async getSkill(nameOrId: string) {
    return prisma.dynamicSkill.findFirst({
      where: {
        OR: [{ id: nameOrId }, { name: nameOrId }],
      },
    });
  }

  /**
   * Salva ou atualiza uma skill no banco
   */
  async saveSkill(data: DynamicSkillInput) {
    const cleanName = data.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, '_');

    return prisma.dynamicSkill.upsert({
      where: { name: cleanName },
      update: {
        displayName: data.displayName,
        description: data.description,
        triggerExamples: data.triggerExamples || [],
        parametersSchema: data.parametersSchema || { type: 'object', properties: {} },
        workflow: data.workflow as any,
        isActive: data.isActive !== undefined ? data.isActive : true,
        isDraft: data.isDraft !== undefined ? data.isDraft : false,
      },
      create: {
        name: cleanName,
        displayName: data.displayName,
        description: data.description,
        triggerExamples: data.triggerExamples || [],
        parametersSchema: data.parametersSchema || { type: 'object', properties: {} },
        workflow: data.workflow as any,
        isActive: data.isActive !== undefined ? data.isActive : true,
        isDraft: data.isDraft !== undefined ? data.isDraft : false,
      },
    });
  }

  /**
   * Atualiza parcialmente uma skill existente pelo nome ou ID
   */
  async updateSkill(nameOrId: string, data: Partial<DynamicSkillInput>) {
    const existing = await this.getSkill(nameOrId);
    if (!existing) {
      throw new Error(`Skill "${nameOrId}" não foi encontrada para atualização.`);
    }

    const updateData: any = {};
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.triggerExamples !== undefined) updateData.triggerExamples = data.triggerExamples;
    if (data.parametersSchema !== undefined) updateData.parametersSchema = data.parametersSchema;
    if (data.workflow !== undefined) updateData.workflow = data.workflow;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.isDraft !== undefined) updateData.isDraft = data.isDraft;

    return prisma.dynamicSkill.update({
      where: { id: existing.id },
      data: updateData,
    });
  }

  /**
   * Executa uma skill de forma sequencial com captura de dados e telemetria
   */
  async executeSkill(nameOrId: string, inputArgs: Record<string, any> = {}) {
    const startTime = Date.now();
    const skill = await this.getSkill(nameOrId);

    if (!skill) {
      throw new Error(`Skill "${nameOrId}" não foi encontrada no catálogo.`);
    }

    const workflow = (skill.workflow as unknown as SkillWorkflowStep[]) || [];
    const executionContext: { input: Record<string, any>; steps: Record<string, any> } = {
      input: { ...inputArgs },
      steps: {},
    };

    loggerService.info('system', `[SkillService] Iniciando execução da skill "${skill.name}" (${skill.displayName})`, {
      inputArgs,
    });

    try {
      for (const step of workflow) {
        const stepId = step.id || `step_${Object.keys(executionContext.steps).length + 1}`;

        if (step.type === 'tool_call') {
          if (!step.toolName) {
            throw new Error(`Passo "${stepId}" é do tipo 'tool_call', mas nenhum 'toolName' foi especificado.`);
          }

          // Interpola variáveis nos argumentos da ferramenta
          const resolvedArgs = interpolateVariables(step.args || {}, executionContext);
          loggerService.info('system', `[SkillService] Executando passo "${stepId}" -> Ferramenta: ${step.toolName}`, resolvedArgs);

          const toolResult = await executeTool(step.toolName, resolvedArgs);
          const outputKey = step.outputKey || stepId;
          executionContext.steps[outputKey] = toolResult;
        } else if (step.type === 'format_template') {
          const resolvedText = interpolateVariables(step.template || '', executionContext);
          const outputKey = step.outputKey || stepId;
          executionContext.steps[outputKey] = resolvedText;
        }
      }

      const durationMs = Date.now() - startTime;
      const finalResult = {
        success: true,
        skillName: skill.name,
        displayName: skill.displayName,
        durationMs,
        steps: executionContext.steps,
      };

      // Registra no histórico de execuções
      await prisma.dynamicSkillExecution.create({
        data: {
          skillId: skill.id,
          inputArgs: inputArgs as any,
          outputResult: finalResult as any,
          status: 'SUCCESS',
          durationMs,
        },
      });

      return finalResult;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      loggerService.error('system', `[SkillService] Erro ao executar skill "${skill.name}": ${error.message || error}`, error);

      await prisma.dynamicSkillExecution.create({
        data: {
          skillId: skill.id,
          inputArgs: inputArgs as any,
          status: 'FAILED',
          error: error.message || String(error),
          durationMs,
        },
      });

      throw error;
    }
  }

  /**
   * Executa um Dry-Run (teste simulado) de uma skill sem ativá-la em produção
   */
  async dryRunSkill(skillData: DynamicSkillInput, sampleArgs: Record<string, any> = {}, skillId?: string) {
    const startTime = Date.now();
    const workflow = skillData.workflow || [];
    const executionContext: { input: Record<string, any>; steps: Record<string, any> } = {
      input: { ...sampleArgs },
      steps: {},
    };
    const stepLogs: Array<{
      stepId: string;
      title?: string;
      type: string;
      toolName?: string;
      success: boolean;
      output?: any;
      error?: string;
    }> = [];

    let overallSuccess = true;
    let errorMessage: string | undefined = undefined;

    for (const step of workflow) {
      const stepId = step.id || `step_${Object.keys(executionContext.steps).length + 1}`;
      try {
        if (step.type === 'tool_call' && step.toolName) {
          const resolvedArgs = interpolateVariables(step.args || {}, executionContext);
          let toolResult: any;

          // Se for ferramenta externa com efeito colateral em mensageria, simula o envio no Dry-Run
          if (step.toolName === 'send_whatsapp_message' || step.toolName === 'whatsapp_send_message') {
            toolResult = {
              simulated: true,
              message: `[DRY-RUN SIMULADO] Mensagem para ${resolvedArgs.phone || 'destinatário'}: "${resolvedArgs.message || resolvedArgs.text || ''}"`,
            };
          } else {
            toolResult = await executeTool(step.toolName, resolvedArgs);
          }

          executionContext.steps[step.outputKey || stepId] = toolResult;
          stepLogs.push({
            stepId,
            title: step.title || step.toolName,
            type: step.type,
            toolName: step.toolName,
            success: true,
            output: toolResult,
          });
        } else if (step.type === 'format_template') {
          const resolvedText = interpolateVariables(step.template || '', executionContext);
          executionContext.steps[step.outputKey || stepId] = resolvedText;
          stepLogs.push({
            stepId,
            title: step.title || 'Formatação de Template',
            type: step.type,
            success: true,
            output: resolvedText,
          });
        }
      } catch (err: any) {
        overallSuccess = false;
        errorMessage = err.message || 'Erro durante execução da etapa';
        stepLogs.push({
          stepId,
          title: step.title || step.toolName,
          type: step.type,
          toolName: step.toolName,
          success: false,
          error: errorMessage,
        });
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    const result = {
      success: overallSuccess,
      dryRun: true,
      skillName: skillData.name,
      displayName: skillData.displayName,
      durationMs,
      steps: executionContext.steps,
      logs: stepLogs,
      error: errorMessage,
    };

    if (skillId) {
      try {
        await prisma.dynamicSkill.update({
          where: { id: skillId },
          data: { testResult: result as any },
        });
      } catch (err: any) {
        loggerService.warn('system', `[SkillService] Falha ao persistir testResult na skill ${skillId}: ${err?.message || err}`);
      }
    }

    return result;
  }

  /**
   * Alterna status de ativação da skill
   */
  async toggleSkillStatus(nameOrId: string, isActive?: boolean) {
    const skill = await this.getSkill(nameOrId);
    if (!skill) throw new Error(`Skill "${nameOrId}" não encontrada.`);

    const newStatus = isActive !== undefined ? isActive : !skill.isActive;
    return prisma.dynamicSkill.update({
      where: { id: skill.id },
      data: { isActive: newStatus, isDraft: false },
    });
  }

  /**
   * Remove uma skill do catálogo
   */
  async deleteSkill(nameOrId: string) {
    const skill = await this.getSkill(nameOrId);
    if (!skill) throw new Error(`Skill "${nameOrId}" não encontrada.`);

    return prisma.dynamicSkill.delete({
      where: { id: skill.id },
    });
  }

  /**
   * Inicializa e atualiza o catálogo completo de skills padrão e de tráfego pago
   */
  async seedDefaultSkills() {
    try {
      const defaultSkills: DynamicSkillInput[] = [
        // 1. Operacionais e Loja
        {
          name: 'resumo_operacional_lojas',
          displayName: 'Resumo de Vendas (KlimaParts & ArmorCar)',
          description: 'Consulta o faturamento, ticket médio e pedidos consolidados do Mercado Livre e ERP das lojas.',
          triggerExamples: ['resumo das lojas', 'como estao as vendas hoje', 'faturamento klimaparts e armorcar'],
          parametersSchema: {
            type: 'object',
            properties: {
              days: { type: 'number', description: 'Janela em dias (1 para hoje, 7, 30)' },
            },
          },
          workflow: [
            {
              id: 'passo_lojas',
              type: 'tool_call',
              title: 'Consultar Faturamento Consolidado',
              toolName: 'klimaparts_store_overview',
              args: { days: 1 },
              outputKey: 'lojas',
            },
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Formatar Relatório',
              template: '{{steps.lojas}}',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'auditoria_meta_ads',
          displayName: 'Auditoria de Performance Meta Ads',
          description: 'Audita métricas de tráfego, CPL, ROAS, investimento diário e alertas de campanhas ativas.',
          triggerExamples: ['auditar meta ads', 'relatorio de trafego', 'como estao os anuncios'],
          parametersSchema: {
            type: 'object',
            properties: {
              datePreset: { type: 'string', description: 'today, yesterday, last_7d, last_30d' },
            },
          },
          workflow: [
            {
              id: 'passo_meta',
              type: 'tool_call',
              title: 'Consultar Métricas Meta Ads',
              toolName: 'meta_get_ads_performance',
              args: { datePreset: 'today' },
              outputKey: 'performance',
            },
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Formatar Relatório',
              template: '{{steps.performance}}',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'briefing_tarefas_agenda',
          displayName: 'Briefing Executivo & Agenda do Dia',
          description: 'Varre o Google Tasks e Google Calendar para listar compromissos e tarefas prioritárias.',
          triggerExamples: ['briefing do dia', 'o que tenho pra hoje', 'agenda e tarefas'],
          parametersSchema: {
            type: 'object',
            properties: {},
          },
          workflow: [
            {
              id: 'passo_tarefas',
              type: 'tool_call',
              title: 'Buscar Google Tasks',
              toolName: 'google_tasks_list',
              args: { showCompleted: false },
              outputKey: 'tarefas',
            },
            {
              id: 'passo_agenda',
              type: 'tool_call',
              title: 'Buscar Google Calendar',
              toolName: 'google_calendar_list_events',
              args: { maxResults: 10 },
              outputKey: 'agenda',
            },
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Consolidar Briefing',
              template: '📋 *BRIEFING EXECUTIVO*:\n\n📅 *Agenda*:\n{{steps.agenda}}\n\n✅ *Tarefas Prioritárias*:\n{{steps.tarefas}}',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'triagem_expedicao_pedidos',
          displayName: 'Triagem & Fila de Expedição E-commerce',
          description: 'Lista todos os pedidos que precisam ser despachados no dia para garantir SLA de envio.',
          triggerExamples: ['pedidos para despachar', 'envios pendentes', 'fila de expedicao'],
          parametersSchema: {
            type: 'object',
            properties: {
              days: { type: 'number', description: 'Janela em dias' },
            },
          },
          workflow: [
            {
              id: 'passo_envios',
              type: 'tool_call',
              title: 'Listar Pedidos Pendentes',
              toolName: 'klimaparts_list_pending_orders',
              args: { days: 1 },
              outputKey: 'envios',
            },
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Formatar Lista de Despacho',
              template: '{{steps.envios}}',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'limpeza_duplicadas_google_tasks',
          displayName: 'Organização & Deduplicação Google Tasks',
          description: 'Analisa todas as tarefas da conta Google e remove títulos repetidos mantendo a lista limpa.',
          triggerExamples: ['limpar tarefas duplicadas', 'organizar tarefas', 'deduplicar tarefas'],
          parametersSchema: {
            type: 'object',
            properties: {},
          },
          workflow: [
            {
              id: 'passo_limpeza',
              type: 'tool_call',
              title: 'Deduplicar Tarefas',
              toolName: 'google_tasks_clean_duplicates',
              args: {},
              outputKey: 'limpeza',
            },
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Resultado da Limpeza',
              template: '{{steps.limpeza}}',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },

        // 2. Hub de 12 Skills Especializadas de Tráfego Pago & Performance
        {
          name: 'auditoria_dados',
          displayName: 'Auditoria de Dados & Diagnóstico de Desempenho',
          description: 'Auditoria analítica de tráfego pago. Diagnostica gargalos no funil (CPM, CTR, Taxa de Conexão, CPA/CPL) e plano de ação corretivo.',
          triggerExamples: ['auditar conta de trafego', 'por que meu cpa subiu', 'diagnostico de campanha', 'auditoria de dados'],
          parametersSchema: {
            type: 'object',
            properties: {
              clientNameOrId: { type: 'string', description: 'Nome ou ID do cliente no Meta Ads' },
              datePreset: { type: 'string', description: 'today, yesterday, last_7d, last_14d, last_30d' },
            },
          },
          workflow: [
            {
              id: 'passo_perf',
              type: 'tool_call',
              title: 'Métricas Consolidadas de Anúncios',
              toolName: 'meta_get_ads_performance',
              args: { clientNameOrId: '{{input.clientNameOrId}}', datePreset: '{{input.datePreset}}' },
              outputKey: 'performance',
            },
            {
              id: 'passo_campanhas',
              type: 'tool_call',
              title: 'Listar Campanhas Ativas',
              toolName: 'meta_list_campaigns',
              args: { clientNameOrId: '{{input.clientNameOrId}}', status: 'ACTIVE' },
              outputKey: 'campanhas',
            },
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Relatório de Auditoria e Diagnóstico',
              template: '📊 *AUDITORIA DE DADOS & DIAGNÓSTICO*:\n\n*Performance Geral*:\n{{steps.performance}}\n\n*Campanhas Ativas Avaliadas*:\n{{steps.campanhas}}\n\n*Checklist Operacional*: Verificar CPM > R$35, CTR < 1.5% e Taxa de Conexão da LP.',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'estrategia_criativos',
          displayName: 'Estratégia de Criativos de Alta Conversão',
          description: 'Engenharia de criativos: análise de Hook Rate (>30%), Hold Rate (>15%), ângulos psicológicos e framework H-P-S-A (Hook, Problema, Solução, Ação).',
          triggerExamples: ['roteiro de criativo', 'como melhorar hook rate', 'analisar criativos', 'estrategia de criativos'],
          parametersSchema: {
            type: 'object',
            properties: {
              clientNameOrId: { type: 'string', description: 'Cliente no Meta Ads' },
            },
          },
          workflow: [
            {
              id: 'passo_criativos',
              type: 'tool_call',
              title: 'Buscar Desempenho dos Criativos',
              toolName: 'meta_get_creative_insights',
              args: { clientNameOrId: '{{input.clientNameOrId}}', datePreset: 'last_7d' },
              outputKey: 'criativos',
            },
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Matriz de Criativos & Ganchos',
              template: '🎨 *ANÁLISE DE CRIATIVOS & PERFORMANCE*:\n\n{{steps.criativos}}\n\n*Framework H-P-S-A*: 1) Hook (0-3s), 2) Dor/Problema (3-15s), 3) Solução/Oferta (15-45s), 4) CTA/Ação Clara.',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'estrategia_campanha',
          displayName: 'Arquitetura & Estratégia de Campanhas',
          description: 'Arquitetura de contas de tráfego pago: validação piloto (1-1-4 em CBO), escala em ABO, esteira de aprendizado de máquina e naming conventions.',
          triggerExamples: ['estrutura de campanha', 'cbo ou abo', 'arquitetura 1-1-4', 'organizar campanhas'],
          parametersSchema: {
            type: 'object',
            properties: {
              clientNameOrId: { type: 'string', description: 'Cliente' },
            },
          },
          workflow: [
            {
              id: 'passo_campanhas',
              type: 'tool_call',
              title: 'Listar Estrutura de Campanhas',
              toolName: 'meta_list_campaigns',
              args: { clientNameOrId: '{{input.clientNameOrId}}', status: 'ALL' },
              outputKey: 'campanhas',
            },
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Diretrizes de Arquitetura',
              template: '🏗️ *ARQUITETURA DE CAMPANHAS*:\n\n{{steps.campanhas}}\n\n*Padrão Recomendado*: 1 Campanha Validação (CBO 1-1-4) + 1 Campanha Escala + 1 Remarketing.',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'estrategia_publico',
          displayName: 'Estratégia de Públicos & Segmentação',
          description: 'Segmentação inteligente: Broad (aberto), Lookalike de alto valor (LTV e compradores), públicos personalizados e exclusões mútuas para evitar sobreposição.',
          triggerExamples: ['estrategia de publicos', 'publico broad ou lookalike', 'exclusoes de publico', 'segmentacao meta ads'],
          parametersSchema: {
            type: 'object',
            properties: {
              clientNameOrId: { type: 'string', description: 'Cliente' },
            },
          },
          workflow: [
            {
              id: 'passo_adsets',
              type: 'tool_call',
              title: 'Consultar Conjuntos de Anúncios',
              toolName: 'meta_get_adset_insights',
              args: { clientNameOrId: '{{input.clientNameOrId}}' },
              outputKey: 'conjuntos',
            },
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Plano de Segmentação e Exclusões',
              template: '🧭 *ESTRATÉGIA DE PÚBLICOS & SEGMENTAÇÃO*:\n\n{{steps.conjuntos}}\n\n*Diretriz*: Manter Topo (Frio com exclusão de quentes), Meio (Engajamento 30d) e Fundo (Visitantes/Leads 7-14d).',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'conversao_whatsapp',
          displayName: 'Conversão para WhatsApp & Atendimento Ágil',
          description: 'Tráfego direto para WhatsApp: anúncios de mensagem com pré-qualificação, mensagens de saudação contextuais e SLA de resposta comercial < 5 minutos.',
          triggerExamples: ['anuncios para whatsapp', 'leads desqualificados no whatsapp', 'sla de atendimento', 'campanha de mensagem whatsapp'],
          parametersSchema: {
            type: 'object',
            properties: {
              clientNameOrId: { type: 'string', description: 'Cliente' },
            },
          },
          workflow: [
            {
              id: 'passo_wa',
              type: 'tool_call',
              title: 'Consultar Contas e WhatsApp Vinculados',
              toolName: 'meta_get_whatsapp_numbers',
              args: { clientNameOrId: '{{input.clientNameOrId}}' },
              outputKey: 'whatsapp_info',
            },
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Protocolo de Conversão WhatsApp',
              template: '💬 *CONVERSÃO PARA WHATSAPP*:\n\n*Números/Contas Conectadas*:\n{{steps.whatsapp_info}}\n\n*Regras de Sucesso*: Mensagem de início pré-qualificadora (ex: "Vi o anúncio e quero orçamento para...") e atendimento comercial em até 5 minutos.',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'escala_orcamento',
          displayName: 'Escala & Alocação de Orçamento',
          description: 'Metodologia de escala segura: vertical (+15% a 20% a cada 48h-72h em conjuntos vencedores), horizontal (novos públicos/ângulos) e por criativos sem desestabilizar o CPA.',
          triggerExamples: ['como escalar orcamento', 'aumentar verba da campanha', 'escala vertical ou horizontal', 'escala segura sem inflar cpa'],
          parametersSchema: {
            type: 'object',
            properties: {
              clientNameOrId: { type: 'string', description: 'Cliente' },
            },
          },
          workflow: [
            {
              id: 'passo_perf',
              type: 'tool_call',
              title: 'Avaliar Performance Atual',
              toolName: 'meta_get_ads_performance',
              args: { clientNameOrId: '{{input.clientNameOrId}}', datePreset: 'last_7d' },
              outputKey: 'performance',
            },
            {
              id: 'passo_campanhas',
              type: 'tool_call',
              title: 'Listar Campanhas Elegíveis para Escala',
              toolName: 'meta_list_campaigns',
              args: { clientNameOrId: '{{input.clientNameOrId}}', status: 'ACTIVE' },
              outputKey: 'campanhas',
            },
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Plano de Escala e Alocação',
              template: '📈 *PLANO DE ESCALA & ALOCAÇÃO DE VERBA*:\n\n*Métricas dos Últimos 7 Dias*:\n{{steps.performance}}\n\n*Campanhas em Avaliação*:\n{{steps.campanhas}}\n\n*Regra de Ouro*: Subir +15-20% apenas se CPA estiver $\\ge 20\\%$ abaixo do alvo nos últimos 7 dias.',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'trafego_local',
          displayName: 'Tráfego Local & Geomarketing de Alta Precisão',
          description: 'Tráfego para negócios físicos: raios de atuação (3 a 7km), criativos com marcos regionais/sotaque, anúncios ligados apenas no horário comercial e foco em WhatsApp/ligações.',
          triggerExamples: ['trafego para negocio local', 'anuncio por raio de km', 'trafego para clinica ou loja fisica', 'geomarketing'],
          parametersSchema: {
            type: 'object',
            properties: {
              clientNameOrId: { type: 'string', description: 'Cliente' },
            },
          },
          workflow: [
            {
              id: 'passo_campanhas',
              type: 'tool_call',
              title: 'Campanhas Locais Ativas',
              toolName: 'meta_list_campaigns',
              args: { clientNameOrId: '{{input.clientNameOrId}}', status: 'ACTIVE' },
              outputKey: 'campanhas',
            },
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Estratégia de Geomarketing',
              template: '📍 *TRÁFEGO LOCAL & GEOMARKETING*:\n\n*Campanhas Ativas*:\n{{steps.campanhas}}\n\n*Checklist*: 1) Raio de 3-7km em torno da empresa, 2) Programação apenas nos horários com atendente disponível, 3) Copy citando bairro e cidade.',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'prevencao_fadiga',
          displayName: 'Prevenção de Fadiga & Creative Refresh',
          description: 'Diagnóstico precoce de saturação de criativos (frequência alta + CTR caindo + CPA subindo), micro-iterações (troca de gancho/headline) e esteira contínua de testes 80/20.',
          triggerExamples: ['anuncio parou de vender', 'fadiga de criativo', 'como renovar anuncios', 'saturacao de publico'],
          parametersSchema: {
            type: 'object',
            properties: {
              clientNameOrId: { type: 'string', description: 'Cliente' },
            },
          },
          workflow: [
            {
              id: 'passo_criativos',
              type: 'tool_call',
              title: 'Buscar Criativos Ativos',
              toolName: 'meta_get_creative_insights',
              args: { clientNameOrId: '{{input.clientNameOrId}}', datePreset: 'last_7d' },
              outputKey: 'criativos',
            },
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Diagnóstico de Fadiga & Refresh',
              template: '🛡️ *PREVENÇÃO DE FADIGA & CREATIVE REFRESH*:\n\n*Análise dos Criativos Ativos*:\n{{steps.criativos}}\n\n*Ação Recomendada*: Para anúncios saturados, aplique micro-iteração: mantenha o corpo do vídeo e alterne os primeiros 3 segundos e a headline.',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'rastreamento_utms',
          displayName: 'Rastreamento Avançado, UTMs & CAPI',
          description: 'Padronização canônica de UTMs dinâmicas (utm_source=meta, utm_campaign={{campaign.name}}, utm_content={{ad.name}}, utm_term={{adset.name}}), saúde do CAPI e deduplicação de eventos.',
          triggerExamples: ['padrao de utms', 'como rastrear vendas de anuncios', 'configurar capi meta', 'qualidade do pixel'],
          parametersSchema: {
            type: 'object',
            properties: {
              urlDestino: { type: 'string', description: 'URL da página de destino' },
            },
          },
          workflow: [
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Gerador Canônico de UTMs e Protocolo CAPI',
              template: '🌐 *RASTREAMENTO AVANÇADO & UTMs CANÔNICAS*:\n\n*URL Parametrizada Padrão Meta Ads*:\n{{input.urlDestino}}?utm_source=meta&utm_medium=paid_traffic&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}\n\n*Checklist CAPI*: Event Match Quality $\\ge 7.5$, eventos deduplicados por event_id e fbc/fbp capturados.',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'cro_landing_page',
          displayName: 'CRO & Alinhamento de Landing Page (Message Match)',
          description: 'Otimização de páginas de conversão: Message Match (H1 da página idêntica à promessa do anúncio), velocidade mobile (<2.5s), CTA na primeira dobra e redução de atritos.',
          triggerExamples: ['melhorar conversao da pagina', 'message match', 'taxa de conexao baixa', 'cro para landing page'],
          parametersSchema: {
            type: 'object',
            properties: {
              pageUrl: { type: 'string', description: 'URL da página' },
            },
          },
          workflow: [
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Auditoria de CRO & Alinhamento de Página',
              template: '🎯 *CRO & ALINHAMENTO DE LANDING PAGE*:\n\n*Página Avaliada*: {{input.pageUrl}}\n\n*Checklist de Alta Conversão*:\n1. [ ] *Message Match*: O título da página repete a promessa exata do anúncio?\n2. [ ] *Velocidade*: Tempo de carregamento mobile abaixo de 2.5s?\n3. [ ] *Primeira Dobra*: Proposta de valor clara e CTA visível sem scroll?\n4. [ ] *Taxa de Conexão*: Page Views / Cliques no link superior a 75%?',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'remarketing_recuperacao',
          displayName: 'Remarketing Dinâmico & Recuperação de Leads',
          description: 'Régua temporal de remarketing: janelas quentes 0-7 dias (provas sociais e depoimentos), 8-15 dias (oferta especial/bônus) e 16-30 dias (novo ângulo/reengajamento).',
          triggerExamples: ['campanha de remarketing', 'recuperar leads que nao compraram', 'janela de remarketing', 'remarketing meta ads'],
          parametersSchema: {
            type: 'object',
            properties: {
              clientNameOrId: { type: 'string', description: 'Cliente' },
            },
          },
          workflow: [
            {
              id: 'passo_campanhas',
              type: 'tool_call',
              title: 'Verificar Campanhas de Remarketing Existentes',
              toolName: 'meta_list_campaigns',
              args: { clientNameOrId: '{{input.clientNameOrId}}', status: 'ALL' },
              outputKey: 'campanhas',
            },
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Régua Temporal de Remarketing',
              template: '🔄 *REMARKETING DINÂMICO & RECUPERAÇÃO DE LEADS*:\n\n*Campanhas Cadastradas*:\n{{steps.campanhas}}\n\n*Régua Temporal Recomendada*:\n- *0 a 7 dias*: Depoimentos, cases e quebra de objeções (Frequência 3 a 5).\n- *8 a 15 dias*: Bônus exclusivo ou incentivo por escassez.\n- *16 a 30 dias*: Mudança de ângulo de oferta e quebra de preconceito.',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
        {
          name: 'inteligencia_competitiva',
          displayName: 'Inteligência Competitiva & Espionagem Ética',
          description: 'Auditoria na Biblioteca de Anúncios do Meta (Facebook Ad Library): identificar criativos ativos há mais de 30 dias dos concorrentes, desconstruir ofertas vencedoras e identificar diferenciais.',
          triggerExamples: ['espionar concorrentes', 'biblioteca de anuncios meta', 'como ver anuncios da concorrencia', 'analise de oferta'],
          parametersSchema: {
            type: 'object',
            properties: {
              nicho: { type: 'string', description: 'Nicho de mercado' },
              concorrente: { type: 'string', description: 'Nome do concorrente' },
            },
          },
          workflow: [
            {
              id: 'passo_formata',
              type: 'format_template',
              title: 'Protocolo de Inteligência Competitiva',
              template: '🕵️ *INTELIGÊNCIA COMPETITIVA & ESPIONAGEM ÉTICA*:\n\n*Alvo*: {{input.concorrente}} (Nicho: {{input.nicho}})\n\n*Protocolo da Biblioteca de Anúncios (facebook.com/ads/library)*:\n1. Filtrar pelo concorrente e ordenar por data.\n2. *Anúncios ativos há > 30 dias*: São os que estão dando lucro real para eles.\n3. *Desconstrução da Oferta*: Qual promessa, mecanismo único e garantia oferecem?\n4. *Contra-ataque*: Desenvolver gancho atacando o ponto fraco da promessa deles.',
              outputKey: 'resultado',
            },
          ],
          isActive: true,
          isDraft: false,
        },
      ];

      for (const skill of defaultSkills) {
        await this.saveSkill(skill);
      }
      loggerService.system(`✨ [SkillService] ${defaultSkills.length} Dynamic Skills padrão semeadas no catálogo com sucesso.`);
    } catch (err: any) {
      loggerService.system(`⚠️ Falha ao semear skills padrão: ${err.message}`, null, 'warn');
    }
  }
}

export const skillService = new SkillService();
