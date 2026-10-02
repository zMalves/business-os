# 🚀 Guia de Integração e Documentação: DeepSeek-V4-Flash

Este documento detalha o funcionamento, especificações técnicas, parâmetros e boas práticas para utilizar o modelo **`deepseek-v4-flash`** na **Secretaria IA**.

---

## 📌 1. Visão Geral do Modelo

O **DeepSeek-V4-Flash** é um modelo de linguagem baseado na arquitetura **Mixture-of-Experts (MoE)**, otimizado para velocidade, custo-benefício e tarefas autônomas de agentes (*agentic workflows*).

- **Identificador de API:** `deepseek-v4-flash`
- **Total de Parâmetros:** 284 Bilhões (MoE)
- **Parâmetros Ativados por Token:** 13 Bilhões
- **Janela de Contexto:** 1.000.000 tokens (1M)
- **Suporte Nativo:** Chamadas de ferramentas (*Tool/Function Calling*) e Modo de Raciocínio (*Thinking / Chain-of-Thought*).

---

## 🔌 2. Configurações de Conexão

| Configuração | Valor |
| :--- | :--- |
| **Protocolo / SDK** | OpenAI Compatible SDK |
| **Base URL** | `https://api.deepseek.com/v1` |
| **Endpoint** | `POST https://api.deepseek.com/v1/chat/completions` |
| **Header de Autenticação** | `Authorization: Bearer <DEEPSEEK_API_KEY>` |

---

## ⚙️ 3. Parâmetros da API

### A. Estrutura Padrão de Requisição

```json
{
  "model": "deepseek-v4-flash",
  "messages": [
    {
      "role": "system",
      "content": "Instruções do sistema para a Secretária IA..."
    },
    {
      "role": "user",
      "content": "Agende uma reunião amanhã às 10h."
    }
  ],
  "tools": [...],
  "tool_choice": "auto",
  "stream": false
}
```

### B. Modo de Raciocínio (Thinking Mode) e `reasoning_content`
O modelo pode produzir um raciocínio passo a passo antes de formular a resposta final.
- **Raciocínio interno:** retornado em `message.reasoning_content`.
- **Resposta ao usuário:** retornada em `message.content`.

### C. Calibração de Esforço de Raciocínio (`reasoning_effort`)
- `"low"`: Raciocínio rápido (padrão recomendado para assistentes interativos em tempo real).
- `"high"`: Raciocínio detalhado para planejamento e análise.
- `"max"`: Raciocínio extensivo para problemas de alta complexidade.

---

## 🛠️ 4. Exemplo de Tool Calling no Projeto

No arquivo `src/agents/tools/taskTools.ts`, as ferramentas expostas ao DeepSeek seguem o padrão JSON Schema:

```typescript
export const agentTools = [
  {
    name: 'create_task',
    description: 'Cria uma nova tarefa ou compromisso na agenda da secretária.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título da tarefa' },
        dueDate: { type: 'string', description: 'Data/hora ISO 8601' },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
        category: { type: 'string', description: 'Categoria da tarefa' }
      },
      required: ['title']
    }
  }
];
```

O `SecretaryAgent` ([src/agents/agent.ts](file:///c:/Users/Maychel/OneDrive%20-%20Seconds/Documentos/Sistemas/secretaria/src/agents/agent.ts)) intercepta a resposta `tool_calls`, executa a função no MariaDB e devolve o resultado com role `tool` para o DeepSeek fechar a resposta.

---

## 🧪 5. Teste Rápido via Script

Para testar a conectividade direta da chave com o modelo:

```bash
node -e "
import('dotenv/config').then(async () => {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL
  });
  const res = await client.chat.completions.create({
    model: 'deepseek-v4-flash',
    messages: [{ role: 'user', content: 'Teste de conexão com DeepSeek-V4-Flash' }]
  });
  console.log('Resposta:', res.choices[0].message.content);
});
"
```
