# 🏛️ Business OS — Executive AI Workspace & Multi-Agent Copilot

**Business OS** é a plataforma operacional executiva completa que centraliza a inteligência, operações de e-commerce, tráfego pago (Meta Ads), Google Workspace, automações de skills e orquestração de agentes especializados, conectada à **Victoria (Copilot & Chief of Staff)** via WhatsApp e Web.

---

## 🎯 Arquitetura do Sistema

```
┌────────────────────────────────────────────────────────────────────────┐
│                   BUSINESS OS (EXECUTIVE WORKSPACE)                    │
│                                                                        │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌────────────┐ │
│  │   META ADS    │ │  E-COMMERCE   │ │    GOOGLE     │ │   SKILLS   │ │
│  │   & GROWTH    │ │ & EXPEDIÇÃO   │ │   WORKSPACE   │ │ & ROTINAS  │ │
│  │ (Campanhas,   │ │ (KlimaParts,  │ │ (Meet, Agenda,│ │ (Workflows,│ │
│  │  Criativos)   │ │  Armor, ML)   │ │  Gmail, Tasks)│ │  Dry-run)  │ │
│  └───────┬───────┘ └───────┬───────┘ └───────┬───────┘ └─────┬──────┘ │
│          │                 │                 │               │        │
│          └─────────────┬───┴─────────────┬───┴───────────────┘        │
│                        │                 │                            │
│                        ▼                 ▼                            │
│          ┌──────────────────────────────────────────────┐             │
│          │         VICTORIA (CHIEF OF STAFF / IA)       │             │
│          │  - Camada de Inteligência e Orquestração     │             │
│          │  - Presente no WhatsApp (bolso/rua)          │             │
│          │  - Presente no Drawer Global do Workspace    │             │
│          │  - Despacho de Webhooks e Aprovação Humana   │             │
│          └──────────────────────────────────────────────┘             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Módulos Integrados

1. **Growth & Meta Ads Manager:** Gestão de múltiplos clientes/BMs, campanhas, orçamentos de AdSets (ABO), criativos, alerta de fadiga de anúncio e ROAS.
2. **Operações E-Commerce & Lojas:** KlimaParts, ArmorCar, pedidos pendentes, expedição e monitoramento de perguntas no Mercado Livre com **0 tokens de IA**.
3. **Google Workspace Executivo:** Google Calendar com links automáticos do Meet, Gmail com leitura/disparo RFC 2822, Google Contacts e Tasks com limpeza de duplicatas.
4. **Dynamic Skills Engine:** Criação visual ou conversacional de rotinas, simulação em tempo de execução (*Dry-Run*), aprovação humana no WhatsApp e histórico de execuções.
5. **Universal Webhooks & Multi-Workers:** Endpoints receptores para n8n, ERPs, CRMs e scripts, entregando alertas formatados no WhatsApp do Maychel.
6. **Telemetria de Custos de IA:** Rastreamento granular de tokens (DeepSeek, OpenAI, Gemini), áudios Whisper e precificação em BRL na tabela `ai_usage_logs`.

---

## 🛠️ Stack Tecnológica

- **Runtime & Framework:** Node.js 20+ (TypeScript) & Fastify 5
- **ORM & Banco de Dados:** Prisma ORM 6.4 com MariaDB 11.4 dedicado (`business_os_db`)
- **Provedores de IA:** DeepSeek (`deepseek-v4-flash`), OpenAI (`gpt-4o-mini`, `whisper-1`) e Google Gemini (`gemini-2.5-flash`)
- **Mensageria WhatsApp:** Evolution API / Baileys
- **Design System:** Cyprus & Sand (`#004643` & `#F0EDE5` - Tokens em `DESIGN.md`)
- **Porta Padrão:** `4017`
- **Domínio de Produção:** `https://b-os.malves.dev.br`

---

## 🐳 Deploy no Servidor

- **Caminho no Host:** `/mnt/hd2tb/apps/systems/node-apps/business-os`
- **Container do App:** `business-os-app` (Porta: `4017`)
- **Container do Banco:** `business-os-mariadb` (Porta: `3317`, Banco: `business_os_db`)
- **Comando de Deploy:**
  ```bash
  ./deploy.sh
  ```
