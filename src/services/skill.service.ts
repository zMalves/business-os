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
  async dryRunSkill(skillData: DynamicSkillInput, sampleArgs: Record<string, any> = {}) {
    const startTime = Date.now();
    const workflow = skillData.workflow || [];
    const executionContext: { input: Record<string, any>; steps: Record<string, any> } = {
      input: { ...sampleArgs },
      steps: {},
    };

    for (const step of workflow) {
      const stepId = step.id || `step_${Object.keys(executionContext.steps).length + 1}`;
      if (step.type === 'tool_call' && step.toolName) {
        const resolvedArgs = interpolateVariables(step.args || {}, executionContext);
        const toolResult = await executeTool(step.toolName, resolvedArgs);
        executionContext.steps[step.outputKey || stepId] = toolResult;
      } else if (step.type === 'format_template') {
        const resolvedText = interpolateVariables(step.template || '', executionContext);
        executionContext.steps[step.outputKey || stepId] = resolvedText;
      }
    }

    const durationMs = Date.now() - startTime;
    return {
      success: true,
      dryRun: true,
      skillName: skillData.name,
      displayName: skillData.displayName,
      durationMs,
      steps: executionContext.steps,
    };
  }

  /**
   * Alterna status de ativação da skill
   */
  async toggleSkillStatus(id: string, isActive?: boolean) {
    const skill = await prisma.dynamicSkill.findUnique({ where: { id } });
    if (!skill) throw new Error(`Skill ${id} não encontrada.`);

    const newStatus = isActive !== undefined ? isActive : !skill.isActive;
    return prisma.dynamicSkill.update({
      where: { id },
      data: { isActive: newStatus, isDraft: false },
    });
  }

  /**
   * Remove uma skill do catálogo
   */
  async deleteSkill(id: string) {
    return prisma.dynamicSkill.delete({
      where: { id },
    });
  }
}

export const skillService = new SkillService();
