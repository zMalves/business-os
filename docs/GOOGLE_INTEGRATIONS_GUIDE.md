# 🌐 Guia de Integrações Google Workspace da Victoria

Este documento descreve todas as capacidades, ferramentas e fluxos de trabalho do ecossistema **Google Workspace** conectados à secretária executiva **Victoria**.

---

## 1. Mapeamento de Integrações & Ferramentas

### 📅 A. Google Calendar (Google Agenda) & Google Meet
* **`google_calendar_create_event`**: Cria eventos com título, pauta, início/fim (fuso `America/Sao_Paulo`), convidados por e-mail e gera link de sala do **Google Meet**.
* **`google_calendar_list_events`**: Consulta a grade de compromissos por período ou palavra-chave.
* **`google_calendar_delete_event`**: Cancela e remove eventos pelo ID.

### ✉️ B. Gmail (E-mails)
* **`google_gmail_list_emails`**: Lista e busca e-mails na caixa de entrada (suporta queries avançadas como `from:`, `subject:`, `is:unread`, `has:attachment`).
* **`google_gmail_read_email`**: Extrai o conteúdo textual limpo e metadados de uma mensagem específica para gerar sínteses executivas.
* **`google_gmail_send_email`**: Dispara e-mails formatados em RFC 2822 autenticados pelo endereço do usuário, com suporte a `to`, `subject`, `body` e `cc`.

### 👥 C. Google Contacts (Contatos do Google)
* **`google_contacts_search`**: Busca nomes, telefones, empresas e e-mails salvos na agenda do Google para resolver destinatários automaticamente em convites e e-mails.

### ✅ D. Google Tasks (Tarefas)
* **`google_tasks_create`**: Adiciona pendências com data de vencimento e notas na lista padrão do Google Tasks.
* **`google_tasks_list`**: Lista pendências abertas no Google Tasks.

### ☀️ E. Resumo Matinal Executivo (Daily Briefing)
* **`trigger_daily_briefing_now`** / Rotina Cron: Cruza a agenda do Calendar do dia + pendências do Tasks e dispara um briefing estruturado no WhatsApp às 08:00 (ou horário programado).

---

## 2. Exemplos de Comandos via WhatsApp

| Ação Desejada | Exemplo de Mensagem para a Victoria |
| :--- | :--- |
| **Marcar Reunião com Meet** | *"Marque uma reunião com o Carlos (carlos@cliente.com) amanhã às 15h sobre o contrato da Alpha com link do Meet."* |
| **Consultar Agenda** | *"Como está minha agenda para esta tarde?"* |
| **Verificar E-mails Importantes** | *"Veja se recebi algum e-mail não lido sobre faturas ou contratos hoje."* |
| **Enviar E-mail Rápido** | *"Envie um e-mail para financeiro@empresa.com avisando que o comprovante foi anexado."* |
| **Criar Tarefa no Google Tasks** | *"Crie uma tarefa no Google Tasks para revisar a proposta da Beta até sexta às 17h."* |
| **Disparar Briefing Agora** | *"Victoria, me envie o resumo matinal agora."* |
