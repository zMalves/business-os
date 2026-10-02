# 📉 Guia de Otimização Extrema de Tokens & Custos de IA

Este documento reúne todas as técnicas arquiteturais, práticas de engenharia de prompt e diretrizes de governança aplicadas na **Secretaria IA (Victoria)** para manter os custos operacionais em centavos de real por mês.

---

## 1. Os 4 Pilares de Otimização Implementados

### 🟢 Pilar 1: DeepSeek Native Prompt Caching (~90% de Desconto)
* **Como funciona**: O DeepSeek oferece desconto de ~90% nos tokens de entrada que correspondem ao prefixo comum já processado em requisições anteriores.
* **Implementação Técnica**:
  - O `SECRETARY_SYSTEM_PROMPT` é mantido **100% estático e imutável** em `messages[0]`.
  - Nenhuma variável dinâmica (como relógio, data ou IDs) é inserida no prompt do sistema.
  - A marcação temporal (`[Horário oficial de São Paulo: ...]`) é injetada **exclusivamente na mensagem do turno do usuário**, preservando o cache intacto.

### 🟡 Pilar 2: Tool Gating Contextual Inteligente
* **Problema**: Enviar a definição de 15 ferramentas em todas as mensagens simples gasta ~1.000 tokens por requisição apenas em esquemas JSON.
* **Solução**: A função `selectToolsForMessage(userMessage, recentMessages)` avalia a intenção e o histórico recente:
  - Mensagens sociais simples (*"Bom dia"*, *"Obrigado"*): Carregam apenas ferramentas mínimas essenciais.
  - Mensagens sobre E-mail/Agenda/Tarefas: Injetam apenas ferramentas do domínio Google.
  - Respostas curtas de confirmação (*"Sim"*, *"Pode enviar"*): Herdam o contexto das últimas 3 mensagens da conversa.

### 🔵 Pilar 3: Janela Deslizante de Contexto & Memória Relacional
* **Histórico Enxuto**: A API carrega apenas as últimas **6 mensagens** (`take: 6`) da conversa ativa.
* **Memória Compacta**: Em vez de carregar históricos de semanas, as preferências e fatos importantes são persistidos na tabela `Memory` e injetados em formato condensado (`- key: value`).

### 🟣 Pilar 4: Código Determinístico vs Chamada de LLM
* **Regra de Ouro**: Tarefas que podem ser resolvidas com código puro (Node.js, Express, regex, SQL, APIs REST) nunca devem consumir chamadas de IA.
* **Exemplos de Custo Zero**:
  - Filtro de mensagens autorizadas por número de WhatsApp.
  - Agendamento de Crons e verificação de horários.
  - Leitura direta de payloads JSON e webhooks.

---

## 2. Comparativo de Custos por Provedor & Modelo

| Provedor | Modelo | Tokens de Entrada (Cache Hit) | Tokens de Saída | Custo p/ 1 Milhão Tokens (BRL) |
| :--- | :--- | :--- | :--- | :--- |
| **DeepSeek** *(Padrão)* | `deepseek-chat` / `deepseek-v4-flash` | ~$0.07 / 1M | ~$0.28 / 1M | **~R$ 0,40 a R$ 1,60** |
| **Google** | `gemini-2.5-flash` | Gratuito / Fração | Baixo | **~R$ 0,00 a R$ 0,50** |
| **OpenAI** | `gpt-4o-mini` | ~$0.15 / 1M | ~$0.60 / 1M | **~R$ 0,90 a R$ 3,50** |

---

## 3. Estimativa de Custos Operacionais Reais

```
30 interações diárias (WhatsApp + E-mails)
x 30 dias = 900 requisições/mês
Tokens médios por requisição com Cache Hit = ~350 tokens novos
Total mensal = ~315.000 tokens
Custo mensal estimado = R$ 0,80 a R$ 2,50 / MÊS
```

---

## 4. Checklist para Novas Ferramentas & Prompts
Ao adicionar novas funcionalidades à Victoria:
- [ ] O prompt do sistema permanece estático sem data/hora dinâmica?
- [ ] A nova ferramenta foi mapeada nos filtros do `selectToolsForMessage`?
- [ ] As descrições dos parâmetros JSON Schema estão concisas e diretas?
- [ ] Tarefas repetitivas de backend estão rodando em código nativo antes de chamar a IA?
