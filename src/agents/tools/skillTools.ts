import { skillService, DynamicSkillInput } from '../../services/skill.service.js';

export const skillAgentTools = [
  {
    name: 'skill_create_draft',
    description: 'Formula e salva um rascunho de nova habilidade/skill dinâmica para a Victoria Copilot aprender um fluxo de trabalho personalizado no Business OS (ex: cruzar relatórios, disparar rotinas ou encadear ferramentas existentes).',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Identificador único em formato slug (ex: "fechamento_semanal_vendas", "resumo_klima_e_agenda").',
        },
        displayName: {
          type: 'string',
          description: 'Nome amigável da habilidade (ex: "Relatório Consolidado de Vendas e Agenda").',
        },
        description: {
          type: 'string',
          description: 'Descrição clara de quando e como essa habilidade deve ser executada.',
        },
        triggerExamples: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exemplos de frases que o usuário pode falar para ativar esta skill.',
        },
        parametersSchema: {
          type: 'object',
          description: 'JSON Schema dos parâmetros aceitos pela skill (opcional).',
        },
        workflow: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['tool_call', 'format_template'] },
              title: { type: 'string' },
              toolName: { type: 'string' },
              args: { type: 'object' },
              template: { type: 'string' },
              outputKey: { type: 'string' },
            },
            required: ['id', 'type'],
          },
          description: 'Lista ordenada de passos que a skill executará.',
        },
        autoActivate: {
          type: 'boolean',
          description: 'Se true, já ativa imediatamente sem precisar de confirmação extra (padrão: false).',
        },
      },
      required: ['name', 'displayName', 'description', 'workflow'],
    },
  },
  {
    name: 'skill_test_dry_run',
    description: 'Executa um teste simulado (dry-run) de uma habilidade/skill para verificar se os passos funcionam antes de aprová-la para o dia a dia.',
    parameters: {
      type: 'object',
      properties: {
        nameOrId: {
          type: 'string',
          description: 'Nome ou ID da skill a ser testada.',
        },
        sampleArgs: {
          type: 'object',
          description: 'Parâmetros de teste (ex: { days: 7 }).',
        },
      },
      required: ['nameOrId'],
    },
  },
  {
    name: 'skill_update',
    description: 'Atualiza ou edita uma habilidade/skill dinâmica existente no catálogo (passos do workflow, templates, gatilhos de ativação, descrição ou nome amigável).',
    parameters: {
      type: 'object',
      properties: {
        nameOrId: {
          type: 'string',
          description: 'Nome slug ou ID da skill a ser editada/atualizada (ex: "estrategia_copy_trafego_pago" ou "cmudjf3vp0036qvwsxvjj99js").',
        },
        displayName: {
          type: 'string',
          description: 'Novo nome amigável da skill (opcional).',
        },
        description: {
          type: 'string',
          description: 'Nova descrição do comportamento da skill (opcional).',
        },
        triggerExamples: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista atualizada de gatilhos e frases que ativam a skill (opcional).',
        },
        workflow: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['tool_call', 'format_template'] },
              title: { type: 'string' },
              toolName: { type: 'string' },
              args: { type: 'object' },
              template: { type: 'string' },
              outputKey: { type: 'string' },
            },
            required: ['id', 'type'],
          },
          description: 'Lista atualizada de passos do workflow (opcional).',
        },
        isActive: {
          type: 'boolean',
          description: 'Se true, mantém ou define como ativa (opcional).',
        },
      },
      required: ['nameOrId'],
    },
  },
  {
    name: 'skill_activate',
    description: 'Aprova e ativa oficialmente uma habilidade/skill criada para que fique disponível no catálogo diário do Business OS.',
    parameters: {
      type: 'object',
      properties: {
        nameOrId: {
          type: 'string',
          description: 'Nome slug ou ID da skill a ser ativada.',
        },
        isActive: {
          type: 'boolean',
          description: 'True para ativar, False para desativar.',
        },
      },
      required: ['nameOrId'],
    },
  },
  {
    name: 'skill_list',
    description: 'Lista todas as habilidades/skills dinâmicas cadastradas no sistema com seus status, gatilhos e histórico de uso.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'skill_delete',
    description: 'Remove uma habilidade/skill dinâmica do catálogo pelo nome ou ID.',
    parameters: {
      type: 'object',
      properties: {
        nameOrId: {
          type: 'string',
          description: 'Nome slug ou ID da skill a ser excluída.',
        },
      },
      required: ['nameOrId'],
    },
  },
];

export async function executeSkillTool(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'skill_create_draft': {
      const skill = await skillService.saveSkill({
        name: args.name,
        displayName: args.displayName,
        description: args.description,
        triggerExamples: args.triggerExamples || [],
        parametersSchema: args.parametersSchema || { type: 'object', properties: {} },
        workflow: args.workflow,
        isActive: args.autoActivate === true,
        isDraft: args.autoActivate !== true,
      });

      return {
        success: true,
        message: args.autoActivate
          ? `Skill "${skill.displayName}" criada e ativada com sucesso!`
          : `Rascunho da skill "${skill.displayName}" criado! Você pode testá-la com skill_test_dry_run antes de ativar.`,
        skill,
      };
    }

    case 'skill_update': {
      const updated = await skillService.updateSkill(args.nameOrId, {
        displayName: args.displayName,
        description: args.description,
        triggerExamples: args.triggerExamples,
        workflow: args.workflow,
        isActive: args.isActive,
      });

      return {
        success: true,
        message: `Skill "${updated.displayName}" atualizada com sucesso!`,
        skill: updated,
      };
    }

    case 'skill_test_dry_run': {
      const skill = await skillService.getSkill(args.nameOrId);
      if (!skill) {
        return { success: false, error: `Skill "${args.nameOrId}" não encontrada.` };
      }

      const result = await skillService.dryRunSkill(
        {
          name: skill.name,
          displayName: skill.displayName,
          description: skill.description,
          workflow: skill.workflow as any,
          parametersSchema: skill.parametersSchema as any,
        },
        args.sampleArgs || {}
      );

      return {
        success: true,
        message: `Teste dry-run da skill "${skill.displayName}" concluído com sucesso.`,
        result,
      };
    }

    case 'skill_activate': {
      const skill = await skillService.getSkill(args.nameOrId);
      if (!skill) {
        return { success: false, error: `Skill "${args.nameOrId}" não encontrada.` };
      }

      const updated = await skillService.toggleSkillStatus(
        skill.id,
        args.isActive !== undefined ? args.isActive : true
      );

      return {
        success: true,
        message: updated.isActive
          ? `Skill "${updated.displayName}" ativada e pronta para uso!`
          : `Skill "${updated.displayName}" desativada.`,
        skill: updated,
      };
    }

    case 'skill_list': {
      const skills = await skillService.listAllSkills();
      return {
        count: skills.length,
        skills: skills.map((s) => ({
          id: s.id,
          name: s.name,
          displayName: s.displayName,
          description: s.description,
          isActive: s.isActive,
          isDraft: s.isDraft,
          triggerExamples: s.triggerExamples,
          totalExecutions: s._count.executions,
          createdAt: s.createdAt,
        })),
      };
    }

    case 'skill_delete': {
      const skill = await skillService.getSkill(args.nameOrId);
      if (!skill) {
        return { success: false, error: `Skill "${args.nameOrId}" não encontrada.` };
      }

      await skillService.deleteSkill(skill.id);
      return {
        success: true,
        message: `Skill "${skill.displayName}" (${skill.name}) removida com sucesso.`,
      };
    }

    default:
      throw new Error(`Skill Tool "${name}" não reconhecida.`);
  }
}
