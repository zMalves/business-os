import { prisma } from '../database/client.js';
import { loggerService } from './logger.service.js';

export interface PredefinedRole {
  id: string;
  name: string;
  badgeClass: string;
  icon: string;
  description: string;
  permissions: string[];
}

export const PREDEFINED_ROLES: PredefinedRole[] = [
  {
    id: 'ADMIN',
    name: 'Administrador (Dono)',
    badgeClass: 'badge-cyprus',
    icon: 'fa-solid fa-crown',
    description: 'Acesso total irrestrito: finanças, métricas, tarefas, skills, comandos do sistema e controle de acessos.',
    permissions: ['all', 'system', 'finance', 'operations', 'marketing', 'tasks', 'admin'],
  },
  {
    id: 'MANAGER',
    name: 'Gestor / Gerente',
    badgeClass: 'badge-mint',
    icon: 'fa-solid fa-briefcase',
    description: 'Acesso a relatórios de vendas, estoque, reuniões, criação de tarefas e briefing operacional.',
    permissions: ['operations', 'marketing_view', 'tasks', 'calendar', 'reports'],
  },
  {
    id: 'OPERATOR',
    name: 'Operacional / Equipe',
    badgeClass: 'badge-amber',
    icon: 'fa-solid fa-screwdriver-wrench',
    description: 'Consultas sobre produtos, pedidos, procedimentos e agendamento de compromissos.',
    permissions: ['operations_basic', 'tasks_own', 'calendar_view'],
  },
  {
    id: 'VIP_CLIENT',
    name: 'Cliente VIP',
    badgeClass: 'badge-coral',
    icon: 'fa-solid fa-star',
    description: 'Atendimento executivo exclusivo, status de pedidos e suporte prioritário personalizado.',
    permissions: ['vip_support', 'order_status'],
  },
  {
    id: 'VIEWER',
    name: 'Visualizador (Consulta)',
    badgeClass: 'badge-sand',
    icon: 'fa-solid fa-eye',
    description: 'Apenas tira dúvidas informativas gerais com a IA sem executar ações operacionais.',
    permissions: ['info_only'],
  },
];

/**
 * Gera variantes comuns de telefones brasileiros (com/sem 55, com/sem o 9º dígito)
 */
export function getPhoneVariants(phoneOrJid: string): string[] {
  let clean = phoneOrJid.replace(/@.*$/, '').replace(/\D/g, '');
  if (!clean) return [];

  const variants = new Set<string>();
  variants.add(clean);

  if (clean.startsWith('55')) {
    const withoutCountry = clean.slice(2);
    variants.add(withoutCountry);

    // DDD + 9 dígitos (ex: 41 9 95852423 -> 11 dígitos)
    if (withoutCountry.length === 11 && withoutCountry[2] === '9') {
      const withoutNine = `${withoutCountry.slice(0, 2)}${withoutCountry.slice(3)}`;
      variants.add(withoutNine);
      variants.add(`55${withoutNine}`);
    } else if (withoutCountry.length === 10) {
      // DDD + 8 dígitos (ex: 41 95852423 -> 10 dígitos)
      const withNine = `${withoutCountry.slice(0, 2)}9${withoutCountry.slice(2)}`;
      variants.add(withNine);
      variants.add(`55${withNine}`);
    }
  } else {
    // Sem DDI 55 inicial
    variants.add(`55${clean}`);
    if (clean.length === 11 && clean[2] === '9') {
      const withoutNine = `${clean.slice(0, 2)}${clean.slice(3)}`;
      variants.add(withoutNine);
      variants.add(`55${withoutNine}`);
    } else if (clean.length === 10) {
      const withNine = `${clean.slice(0, 2)}9${clean.slice(2)}`;
      variants.add(withNine);
      variants.add(`55${withNine}`);
    }
  }

  return Array.from(variants);
}

/**
 * Normaliza número para armazenamento padrão no banco (apenas dígitos, com 55)
 */
export function normalizePhoneNumber(rawPhone: string): string {
  let digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';

  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  return digits;
}

export class ContactService {
  /**
   * Garante que os números padrões do .env existam no banco caso esteja vazio
   */
  async ensureSeedContacts(): Promise<void> {
    try {
      const count = await prisma.authorizedContact.count();
      if (count > 0) return;

      const allowedRaw = process.env.WHATSAPP_ALLOWED_NUMBERS || '5541995852423';
      const numbers = allowedRaw
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);

      for (let i = 0; i < numbers.length; i++) {
        const rawNum = numbers[i];
        const normalized = normalizePhoneNumber(rawNum);
        if (!normalized) continue;

        const exists = await prisma.authorizedContact.findUnique({
          where: { phone: normalized },
        });

        if (!exists) {
          const isFirst = i === 0;
          await prisma.authorizedContact.create({
            data: {
              name: isFirst ? 'Maychel Alves' : `Contato Autorizado ${i + 1}`,
              phone: normalized,
              role: isFirst ? 'ADMIN' : 'MANAGER',
              isActive: true,
              notes: isFirst ? 'Administrador Principal (Configurado via .env)' : 'Importado do .env inicial',
            },
          });
        }
      }
      loggerService.system('📱 Contatos autorizados iniciais sincronizados com sucesso.');
    } catch (err: any) {
      loggerService.error('system', `Aviso ao inicializar contatos: ${err.message}`);
    }
  }

  /**
   * Lista todos os contatos autorizados
   */
  async listContacts() {
    await this.ensureSeedContacts();
    return prisma.authorizedContact.findMany({
      orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Busca um contato autorizado por JID ou número de WhatsApp (considerando todas as variantes de 9º dígito e DDI)
   */
  async findAuthorizedContact(senderJidOrNumber: string) {
    if (!senderJidOrNumber) return null;

    try {
      const variants = getPhoneVariants(senderJidOrNumber);
      if (variants.length === 0) return null;

      // 1. Busca primeiro no banco de dados
      const allActive = await prisma.authorizedContact.findMany({
        where: { isActive: true },
      });

      if (allActive.length > 0) {
        for (const contact of allActive) {
          const contactVariants = getPhoneVariants(contact.phone);
          const isMatch = variants.some((v) => contactVariants.includes(v));
          if (isMatch) {
            return contact;
          }
        }
        return null;
      }

      // 2. Fallback caso a tabela esteja vazia (usando WHATSAPP_ALLOWED_NUMBERS do .env)
      const allowedRaw = process.env.WHATSAPP_ALLOWED_NUMBERS || '5541995852423';
      const allowedList = allowedRaw.split(',').map((n) => n.trim()).filter(Boolean);

      for (const allowed of allowedList) {
        const allowedVariants = getPhoneVariants(allowed);
        const isMatch = variants.some((v) => allowedVariants.includes(v));
        if (isMatch) {
          return {
            id: 'env_fallback',
            name: 'Maychel Alves',
            phone: normalizePhoneNumber(allowed),
            role: 'ADMIN',
            isActive: true,
            notes: 'Autorizado via .env fallback',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
      }

      return null;
    } catch (err: any) {
      loggerService.error('whatsapp', `Erro ao verificar contato autorizado: ${err.message}`);
      return null;
    }
  }

  /**
   * Cadastra novo contato autorizado
   */
  async createContact(data: {
    name: string;
    phone: string;
    role?: string;
    isActive?: boolean;
    briefing?: string;
    notes?: string;
  }) {
    const normalized = normalizePhoneNumber(data.phone);
    if (!normalized) {
      throw new Error('Número de telefone inválido.');
    }

    const existing = await prisma.authorizedContact.findUnique({
      where: { phone: normalized },
    });

    if (existing) {
      throw new Error(`Este número (${normalized}) já está cadastrado para "${existing.name}".`);
    }

    const validRole = PREDEFINED_ROLES.some((r) => r.id === data.role) ? data.role! : 'OPERATOR';

    return prisma.authorizedContact.create({
      data: {
        name: data.name.trim(),
        phone: normalized,
        role: validRole,
        isActive: data.isActive !== undefined ? data.isActive : true,
        briefing: data.briefing?.trim() || null,
        notes: data.notes?.trim() || null,
      },
    });
  }

  /**
   * Atualiza dados de um contato
   */
  async updateContact(
    id: string,
    data: {
      name?: string;
      phone?: string;
      role?: string;
      isActive?: boolean;
      briefing?: string | null;
      notes?: string | null;
    }
  ) {
    const contact = await prisma.authorizedContact.findUnique({ where: { id } });
    if (!contact) {
      throw new Error('Contato não encontrado.');
    }

    let normalizedPhone = contact.phone;
    if (data.phone) {
      normalizedPhone = normalizePhoneNumber(data.phone);
      if (!normalizedPhone) throw new Error('Número de telefone inválido.');

      if (normalizedPhone !== contact.phone) {
        const dup = await prisma.authorizedContact.findUnique({
          where: { phone: normalizedPhone },
        });
        if (dup && dup.id !== id) {
          throw new Error(`O número ${normalizedPhone} já pertence a outro contato (${dup.name}).`);
        }
      }
    }

    const role = data.role && PREDEFINED_ROLES.some((r) => r.id === data.role) ? data.role : contact.role;

    return prisma.authorizedContact.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name.trim() : contact.name,
        phone: normalizedPhone,
        role,
        isActive: data.isActive !== undefined ? data.isActive : contact.isActive,
        briefing: data.briefing !== undefined ? (data.briefing ? data.briefing.trim() : null) : contact.briefing,
        notes: data.notes !== undefined ? (data.notes ? data.notes.trim() : null) : contact.notes,
      },
    });
  }

  /**
   * Alterna status ativo/bloqueado
   */
  async toggleActive(id: string) {
    const contact = await prisma.authorizedContact.findUnique({ where: { id } });
    if (!contact) throw new Error('Contato não encontrado.');

    return prisma.authorizedContact.update({
      where: { id },
      data: { isActive: !contact.isActive },
    });
  }

  /**
   * Remove contato
   */
  async deleteContact(id: string) {
    return prisma.authorizedContact.delete({
      where: { id },
    });
  }

  /**
   * Retorna lista de cargos disponíveis
   */
  getRoles() {
    return PREDEFINED_ROLES;
  }
}

export const contactService = new ContactService();
