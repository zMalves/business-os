# 📢 Documentação da API de Webhook de Notificações
### **Victoria — Copiloto Executiva & Chief of Staff (Business OS)**

Este documento descreve como qualquer aplicativo externo (n8n, Zapier, Make, ERPs, CRMs, Plataformas de E-commerce, Scripts em Python/PHP/Node.js ou Webhooks de Pagamento) pode enviar mensagens, dados e alertas diretamente para o **Business OS** e para o **WhatsApp do Maychel**.

---

## 🔑 1. Autenticação e Token

Para que suas requisições sejam aceitas, utilize o **Token de Segurança**:

> ### **Token Oficial:** `victoria_master_secret_2026`

Você pode enviar esse token de **qualquer uma das seguintes 4 maneiras** (escolha a mais fácil para o seu aplicativo):

| Método | Como Enviar | Exemplo |
| :--- | :--- | :--- |
| **No Corpo JSON** (Recomendado) | Campo `token` no JSON | `{"token": "victoria_master_secret_2026", ...}` |
| **Header HTTP Personalizado** | `x-webhook-token` ou `x-api-key` | `x-webhook-token: victoria_master_secret_2026` |
| **Header Authorization** | `Authorization: Bearer <token>` | `Authorization: Bearer victoria_master_secret_2026` |
| **Query Parameter (URL)** | Parâmetro `?token=` na URL | `https://b-os.malves.dev.br/api/webhook/notify?token=victoria_master_secret_2026` |

---

## 🌐 2. Endpoint e Métodos

- **URL Principal:** `https://b-os.malves.dev.br/api/webhook/notify`
- **Aliases Válidos:**
  - `https://b-os.malves.dev.br/api/webhook/message`
  - `https://b-os.malves.dev.br/api/webhook/send`
- **Métodos HTTP:** `POST` (Recomendado para envio de JSON) ou `GET` (para chamadas rápidas via link).
- **Content-Type:** `application/json`

---

## 📋 3. Campos da Requisição (Payload JSON)

| Campo | Tipo | Obrigatório | Descrição |
| :--- | :---: | :---: | :--- |
| `token` | `string` | Opcional* | Token de autenticação (*se não enviado via header ou URL). |
| `message` | `string` | Opcional** | Mensagem textual principal a ser entregue. |
| `title` | `string` | Opcional | Título em destaque no topo da notificação (ex: *"Novo Lead"*, *"Venda Aprovada"*). |
| `source` | `string` | Opcional | Nome do sistema ou aplicativo de origem (ex: *"Meta Forms"*, *"ERP KlimaParts"*, *"n8n"*). |
| `priority` | `string` | Opcional | Prioridade da notificação: `"alta"` / `"urgente"` 🚨, `"normal"` / `"media"` 🔔, ou `"baixa"` 💡. Padrão: `"normal"`. |
| `data` | `object` / `array` | Opcional | Objeto JSON com dados complementares. Cada chave/valor é automaticamente formatado como um marcador executivo (`•`). |
| `ai` | `boolean` | Opcional | Se `true`, a IA da Victoria analisa e redige uma síntese executiva inteligente com base nos dados. |
| `prompt` | `string` | Opcional | Instrução personalizada para a Victoria caso `ai: true` (ex: *"Avise sobre este erro e sugira uma ação imediata"*). |
| `to` | `string` | Opcional | Número de destino com DDI e DDD (ex: `"5541995852423"`). **Se omitido, envia automaticamente para o WhatsApp do Maychel.** |

> **Nota (\*\*):** É necessário enviar ao menos um dos seguintes campos: `message`, `data`, `title` ou `prompt`.

---

## 💡 4. Exemplos de Payloads

### Exemplo A: Mensagem Rápida e Direta (Custo Zero de IA / Instantâneo)
```json
{
  "token": "victoria_master_secret_2026",
  "message": "A sincronização de pedidos do Mercado Livre foi concluída com sucesso!"
}
```

---

### Exemplo B: Notificação Estruturada Executiva (Mais Utilizada)
Cria um card com visual limpo, título com emoji, horário, origem e lista de marcadores:

```json
{
  "token": "victoria_master_secret_2026",
  "title": "Novo Lead Qualificado",
  "source": "Meta Forms",
  "priority": "alta",
  "message": "O cliente solicitou orçamento urgente de compressor.",
  "data": {
    "cliente": "Carlos Eduardo Silva",
    "telefone": "(41) 99888-7766",
    "veiculo": "Toyota Corolla 2022",
    "peca_solicitada": "Compressor Denso 10P15C",
    "cidade": "Curitiba - PR"
  }
}
```

> **Resultado que chega no WhatsApp:**
> 🚨 *Novo Lead Qualificado* *[URGENTE]*  
> 🏢 *Origem:* Meta Forms • 🕒 _30/09/2026, 11:30_  
>   
> O cliente solicitou orçamento urgente de compressor.  
>   
> 📋 *Detalhes:*  
> • *Cliente:* Carlos Eduardo Silva  
> • *Telefone:* (41) 99888-7766  
> • *Veículo:* Toyota Corolla 2022  
> • *Peça Solicitada:* Compressor Denso 10P15C  
> • *Cidade:* Curitiba - PR  

---

### Exemplo C: Síntese Inteligente com IA (`ai: true`)
Envie qualquer objeto JSON cru (ex: webhook de loja virtual ou banco de dados) e a Victoria escreve um resumo executivo:

```json
{
  "token": "victoria_master_secret_2026",
  "ai": true,
  "source": "E-Commerce",
  "data": {
    "pedido_id": 84920,
    "valor_total": "R$ 4.890,00",
    "itens": ["2x Condensador Ford Ka", "1x Gás R134a 13.6kg"],
    "pagamento": "PIX Confirmado",
    "cliente": "Auto Mecânica Polar"
  }
}
```

---

## 🛠️ 5. Exemplos de Implementação em Código

### 1. n8n (Node HTTP Request)
1. Arraste um node **HTTP Request**.
2. **Method:** `POST`
3. **URL:** `https://secretary.malves.dev.br/api/webhook/notify`
4. **Authentication:** None
5. **Send Body:** Ativado (`JSON`)
6. **JSON Parameters:**
```json
{
  "token": "victoria_master_secret_2026",
  "title": "Alerta de Workflow n8n",
  "source": "n8n - Gestão de Pedidos",
  "priority": "alta",
  "message": "Novo evento disparado no workflow.",
  "data": {{ $json }}
}
```

---

### 2. cURL (Terminal / Bash / Linux)
```bash
curl -X POST https://secretary.malves.dev.br/api/webhook/notify \
  -H "Content-Type: application/json" \
  -d '{
    "token": "victoria_master_secret_2026",
    "title": "Aviso de Servidor",
    "source": "Backup Automático",
    "message": "Backup do banco de dados realizado com sucesso às 03:00."
  }'
```

---

### 3. JavaScript / TypeScript (Node.js ou Frontend)
```javascript
const response = await fetch('https://secretary.malves.dev.br/api/webhook/notify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    token: 'victoria_master_secret_2026',
    title: 'Nova Compra Aprovada',
    source: 'KlimaParts Loja',
    priority: 'alta',
    message: 'Pedido #45920 aprovado para despacho.',
    data: {
      valor: 'R$ 1.250,00',
      cliente: 'João da Silva',
      cidade: 'São Paulo - SP',
    },
  }),
});

const data = await response.json();
console.log('Status do envio:', data);
```

---

### 4. Python (Requests)
```python
import requests

url = "https://secretary.malves.dev.br/api/webhook/notify"
payload = {
    "token": "victoria_master_secret_2026",
    "title": "Alerta do Script Python",
    "source": "Automação ETL",
    "message": "Processamento diário finalizado.",
    "data": {
        "linhas_processadas": 1420,
        "tempo_execucao": "18.4s",
        "erros": 0
    }
}

response = requests.post(url, json=payload)
print(response.status_code, response.json())
```

---

### 5. PHP (cURL nativo)
```php
<?php
$ch = curl_init('https://secretary.malves.dev.br/api/webhook/notify');
$payload = [
    'token' => 'victoria_master_secret_2026',
    'title' => 'Notificação do Sistema PHP',
    'source' => 'ERP Interno',
    'message' => 'Status de pedido alterado para Faturado.',
    'data' => [
        'pedido' => '#9821',
        'cliente' => 'Oficina Mecânica Express',
        'valor' => 'R$ 820,00'
    ]
];

curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$result = curl_exec($ch);
curl_close($ch);

echo $result;
?>
```

---

## 📥 6. Estrutura de Respostas da API

### Resposta de Sucesso (HTTP 200 OK)
```json
{
  "success": true,
  "message": "Notificação enviada com sucesso para o WhatsApp.",
  "targetNumber": "5541995852423",
  "mode": "direct_formatted",
  "sentText": "🚨 *Novo Lead Qualificado* *[URGENTE]*\n...",
  "whatsappResult": {
    "key": {
      "remoteJid": "554195852423@s.whatsapp.net",
      "fromMe": true,
      "id": "3EB06C12C87AC3B1B8FC19"
    }
  }
}
```

### Resposta de Erro de Autenticação (HTTP 401 Unauthorized)
```json
{
  "success": false,
  "error": "Acesso não autorizado ao webhook de notificação.",
  "hint": "Forneça o token via header 'x-webhook-token', 'x-api-key', Authorization: Bearer <token>, query '?token=...' ou no corpo JSON."
}
```

### Resposta de Parâmetros Ausentes (HTTP 400 Bad Request)
```json
{
  "success": false,
  "error": "Nenhum conteúdo ou dado fornecido. Envie ao menos um campo \"message\", \"text\", \"title\" ou \"data\"."
}
```
