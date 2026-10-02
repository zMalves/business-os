# 🚀 Guia de Atualização do Servidor & Gerenciamento Docker
### **Victoria Copilot — Business OS (Executive AI Workspace)**

Este guia detalha como atualizar o Business OS em produção, como acionar deploys automáticos via **HTTP** ou **Git**, e as regras claras sobre **quando e como reiniciar os containers Docker**.

---

## 📌 Sumário Rápido

1. [Os 3 Métodos de Atualização](#-1-os-3-métodos-de-atualização)
2. [Método 1: Atualização via HTTP (Auto-Deploy Remoto)](#-2-método-1-atualização-via-http-auto-deploy-remoto)
3. [Método 2: Atualização via Webhook do GitHub](#-3-método-2-atualização-via-webhook-do-github)
4. [Método 3: Atualização Manual via Git (SSH no Servidor)](#-4-método-3-atualização-manual-via-git-ssh-no-servidor)
5. [Quando Precisa e Quando NÃO Precisa Reiniciar o Docker?](#-5-quando-precisa-e-quando-não-precisa-reiniciar-o-docker)
6. [Como Reiniciar o Container Docker](#-6-como-reiniciar-o-container-docker)
7. [Diagnóstico de Falhas & Solução de Problemas (Troubleshooting)](#-7-diagnóstico-de-falhas--solução-de-problemas-troubleshooting)

---

## 🧭 1. Os 3 Métodos de Atualização

| Método | Como Funciona | Quando Usar | Requer SSH? |
| :--- | :--- | :--- | :---: |
| **HTTP Deploy** | Dispara uma requisição POST na API do próprio servidor | Atualizações rápidas do dia a dia a partir de qualquer lugar | **Não** |
| **GitHub Webhook** | O GitHub avisa o servidor automaticamente após um `git push` | Integração contínua (CI/CD) automática | **Não** |
| **Git via SSH** | Acessa o terminal do servidor e roda `git pull` | Manutenções manuais, ajustes de infraestrutura ou recuperação | **Sim** |

---

## ⚡ 2. Método 1: Atualização via HTTP (Auto-Deploy Remoto)

O sistema possui um endpoint dedicado que puxa a versão mais recente do Git, ajusta permissões, sincroniza o banco (Prisma) e recarrega a aplicação em tempo de execução sem derrubar a porta.

### **Endpoint:**
- **URL:** `POST https://b-os.malves.dev.br/api/system/deploy`
- **Chave de Autenticação:** `victoria_master_secret_2026`

### **Onde enviar a chave:**
- No Header: `x-deploy-key: victoria_master_secret_2026` (ou `x-api-key`)
- Na URL: `?token=victoria_master_secret_2026`
- No Header Authorization: `Authorization: Bearer victoria_master_secret_2026`

### **Payload (JSON):**
```json
{
  "branch": "main",
  "runPrisma": true,
  "npmInstall": false
}
```

---

## 🔗 3. Método 2: Atualização via Webhook do GitHub

Você pode configurar o GitHub para atualizar o servidor automaticamente a cada commit:

1. No seu repositório no GitHub, acesse: **Settings** > **Webhooks** > **Add webhook**.
2. **Payload URL:** `https://b-os.malves.dev.br/api/webhook/github`
3. **Content type:** `application/json`
4. **Events:** Selecione apenas *"Just the push event"*.
5. Salve o webhook.

> **Como funciona:** Sempre que um novo commit entrar na branch monitorada (ex: `main`), o GitHub notifica este endpoint e o servidor roda automaticamente o pull e a atualização do Prisma.

---

## 🖥️ 4. Método 3: Atualização Manual via Git (SSH no Servidor)

Quando estiver conectado ao servidor local ou via SSH:

### Informações do Servidor:
- **Host Local:** `192.168.18.82` (Porta SSH: 22)
- **Usuário SSH:** `malves`
- **Diretório do Projeto no Host:** `/mnt/hd2tb/apps/systems/node-apps/business-os`
- **Nome do Container Docker:** `business-os-app`
- **Porta:** `4017`

### Comandos de Atualização:
```bash
# 1. Acesse a pasta do projeto
cd /mnt/hd2tb/apps/systems/node-apps/business-os

# 2. Atualize o código do repositório
git pull origin main

# 3. Garanta permissões de execução e leitura
chmod -R 777 .
```

---

## ❓ 5. Quando Precisa e Quando NÃO Precisa Reiniciar o Docker?

Como o container roda internamente com **`tsx watch src/server.ts`** (monitoramento em tempo real), na grande maioria das vezes **não é necessário reiniciar o Docker**.

### 🟢 NÃO Precisa Reiniciar o Container (Hot-Reload Automático):
- Alterações em arquivos TypeScript/JavaScript (`src/services/`, `src/routes/`, `src/agents/`, etc.).
- Modificações em prompts da IA, regras de negócio ou comandos da Victoria.
- Alterações em páginas HTML/CSS/JS estáticas da pasta `public/`.
- Deploys executados via `POST /api/system/deploy`.

---

### 🔴 QUANDO É OBRIGATÓRIO Reiniciar o Container Docker:
Você **deve reiniciar** o container nos seguintes 4 cenários:

1. **Novas bibliotecas npm adicionadas:**
   Se uma nova biblioteca foi adicionada ao `package.json`, o Node precisa carregar o novo pacote.
   ```bash
   sudo docker restart business-os-app
   ```
2. **Alteração de variáveis de ambiente (`.env`):**
   Novas chaves de API, senhas, portas ou URLs alteradas no `.env` só são lidas no início do processo do container.
3. **Erro 502 Bad Gateway / Processo Travado:**
   Se o container sofreu crash de memória ou exceção não capturada.
4. **Alterações estruturais de infraestrutura:**
   Modificações no `Dockerfile` ou no `docker-compose.yml`.

---

## 🔄 6. Como Reiniciar o Container Docker

### Pelo Terminal / Linha de Comando (SSH)
```bash
# Reinício rápido do container principal
sudo docker restart business-os-app

# Se estiver na pasta do projeto:
cd /mnt/hd2tb/apps/systems/node-apps/business-os
sudo docker compose restart business-os-app
```

---

### Como Acompanhar os Logs em Tempo Real:
Para ver se o container subiu corretamente, conectou ao banco e registrou os webhooks:

```bash
sudo docker logs -f --tail 50 business-os-app
```

*(Pressione `Ctrl + C` para sair da visualização de logs).*

---

## 🩺 7. Diagnóstico de Falhas & Solução de Problemas (Troubleshooting)

### Problema: Cloudflare exibindo "502 Bad Gateway"
- **Causa:** O container `business-os-app` parou de escutar na porta `4017`.
- **Solução:**
  1. Veja o log do erro: `sudo docker logs --tail 30 business-os-app`
  2. Verifique se há algum conflito de git:
     ```bash
     cd /mnt/hd2tb/apps/systems/node-apps/business-os
     git status
     git pull origin main
     ```
  3. Reinicie o container: `sudo docker restart business-os-app`

---

### Como Testar se a Aplicação Está Viva:
Abra no terminal:
```bash
curl http://localhost:4017/api/health
```

A resposta deve conter:
```json
{
  "status": "ok",
  "service": "business-os",
  "database": "connected",
  "branch": "main",
  "commit": "..."
}
```
