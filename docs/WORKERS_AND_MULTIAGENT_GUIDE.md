# 🏛️ Guia de Arquitetura Multi-Worker & Memória Corporativa

Este documento define as diretrizes estratégicas e a arquitetura técnica para a expansão da **Victoria** como **Chief of Staff / Orquestradora Central** de múltiplos workers e agentes especializados.

---

## 1. Visão Geral da Arquitetura Hub-and-Spoke

Na arquitetura da Secretaria IA, o usuário (**Maychel**) interage centralmente com a **Victoria** (via WhatsApp ou Dashboard). A Victoria atua como a camada de inteligência executiva, despachando comandos e recebendo eventos de workers especializados.

```
                         ┌─────────────────────────────────┐
                         │    Maychel (WhatsApp / Web)     │
                         └────────────────┬────────────────┘
                                          │
                                          ▼
                         ┌─────────────────────────────────┐
                         │   VICTORIA (CHIEF OF STAFF)     │
                         │  - Triagem Executiva            │
                         │  - Contexto & Memória de Negócio│
                         │  - Aprovação Humana (WhatsApp)  │
                         └───────┬────────┬────────┬───────┘
                                 │        │        │
          ┌──────────────────────┘        │        └──────────────────────┐
          ▼                               ▼                               ▼
┌──────────────────┐            ┌──────────────────┐            ┌──────────────────┐
│  Worker Vendas   │            │ Worker Financeiro│            │ Worker Dev/Infra │
│ (SDR, Propostas, │            │ (Auditoria, DRE, │            │ (Scrapers, Logs, │
│  Qualificação)   │            │  Faturas, Boletos│            │  Healthcheck)    │
└──────────────────┘            └──────────────────┘            └──────────────────┘
```

---

## 2. Padrões de Comunicação entre Victoria e Workers

### A. Comunicação Determinística via JSON (Custo Zero de Tokens)
* **Regra Fundamental**: Workers e serviços em background **nunca** conversam entre si por LLM.
* A comunicação é feita via HTTP REST / Webhook ou fila Redis/RabbitMQ com payloads JSON estritos e enxutos:
  ```json
  {
    "worker": "auditoria_financeira",
    "status": "completed",
    "timestamp": "2026-09-11T05:30:00Z",
    "data": {
      "empresa": "Seconds",
      "faturas_auditadas": 84,
      "divergencias_encontradas": 0,
      "valor_total": 45200.00
    }
  }
  ```
* **Papel da Victoria**: Ela recebe esse JSON no webhook `/api/workers/webhook` e usa a LLM apenas para formular a mensagem final elegante para o WhatsApp do Maychel.

### B. Human-in-the-Loop (Aprovações no WhatsApp)
Para ações de alto risco ou impacto financeiro/comercial:
1. O worker gera o artefato (ex: rascunho de e-mail de proposta, cancelamento de serviço, pagamento).
2. O worker envia o pedido de aprovação para a Victoria.
3. A Victoria envia no WhatsApp:
   > *"Maychel, o Worker SDR gerou a proposta de R$ 15.000 para a Empresa X. Posso disparar o e-mail oficial?"*
4. O Maychel responde *"Sim"* no WhatsApp.
5. A Victoria destrava o webhook do worker e autoriza a execução imediata.

---

## 3. Gestão de Conhecimento & Memória das Empresas

A Victoria mantém uma base de dados relacional e contextual sobre todos os negócios e empresas do ecossistema Maychel.

### A. Estrutura de Memória (`prisma.memory`)
Cada empresa ou projeto possui chaves organizadas:
* `empresa_[nome]_visao_geral`: Atuação, nicho de mercado e diferenciais.
* `empresa_[nome]_socios`: Quadro societário, papéis e contatos-chave.
* `empresa_[nome]_servicos`: Portfólio de serviços, preços base e escopos.
* `empresa_[nome]_clientes_vip`: Principais clientes e particularidades.
* `empresa_[nome]_regras_negocio`: Horários de atendimento, políticas de faturamento e canais.

### B. Ingestão de Conhecimento
O conhecimento pode ser alimentado de 3 formas:
1. **Pelo WhatsApp**: Falando naturalmente com a Victoria (*"Victoria, memorize que a empresa X agora atende também o segmento Y"*).
2. **Pelo Painel Web**: Na aba de Configurações/Memórias da aplicação.
3. **Por Ingestão de Documentos**: Envio de PDFs de contratos sociais, briefings ou manuais de marca.

---

## 4. Diretrizes para Criação de Novos Workers

Ao desenvolver um novo worker (Python, Node.js, n8n, etc.):
1. **Isolamento de Responsabilidade**: Cada worker deve resolver um único domínio (ex: apenas faturas, apenas scraping, apenas qualificação de leads).
2. **Execução Local/Containerizada**: Rodar como microserviço no Docker ou servidor de background.
3. **Webhooks Padrão**:
   - `POST /api/workers/events`: Envia notificações ou relatórios consolidados para a Victoria.
   - `POST /api/workers/ask-approval`: Solicita confirmação do Maychel antes de agir.
4. **Respeito ao Orçamento de Tokens**:
   - Faça 95% do trabalho em código tradicional (regex, parsing, SQL, requests HTTP).
   - Use LLM apenas na sumarização ou compreensão semântica profunda.
