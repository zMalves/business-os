# 🚀 Guia de Atualização do Servidor & Deploy Automatizado
### **Victoria Copilot — Business OS (Executive AI Workspace)**

Este guia detalha o funcionamento e os métodos de atualização do **Business OS** em produção, as rotinas de **Auto-Deploy Remoto**, e as boas práticas de operação dos containers Docker.

---

## 📌 Sumário Rápido

1. [Os 3 Métodos de Atualização](#-1-os-3-métodos-de-atualização)
2. [Método 1: Auto-Deploy Remoto via API (Zero Terminal)](#-2-método-1-auto-deploy-remoto-via-api-zero-terminal)
3. [Método 2: GitHub Webhook (CI/CD Automático)](#-3-método-2-github-webhook-cicd-automático)
4. [Método 3: Atualização Manual via SSH / Git](#-4-método-3-atualização-manual-via-ssh--git)
5. [Resolução de Problemas Comuns (Dubious Ownership / Merge Conflito)](#-5-resolução-de-problemas-comuns)
6. [Regras de Reinício do Docker](#-6-regras-de-reinício-do-docker)
7. [Comandos Úteis de Diagnóstico & Health Check](#-7-comandos-úteis-de-diagnóstico--health-check)

---

## 🧭 1. Os 3 Métodos de Atualização

| Método | Como Funciona | Quem Dispara | Requer SSH? |
| :--- | :--- | :---: | :---: |
| **Auto-Deploy via API** *(Recomendado)* | Dispara uma requisição HTTP autenticada na API do Business OS | O Assistente de IA (Antigravity) ou Scripts | **Não** |
| **GitHub Webhook** | O GitHub notifica o servidor automaticamente após cada `git push` | GitHub Actions / Webhooks | **Não** |
| **Git Manual via SSH** | Acessa o terminal do servidor e roda `git pull` / `git reset` | Administrador (Manutenção) | **Sim** |

---

## ⚡ 2. Método 1: Auto-Deploy Remoto via API (Zero Terminal)

O Business OS possui um endpoint interno de deploy que executa de forma segura e atômica:
1. `git config --global --add safe.directory /app`
2. `git fetch origin main`
3. `git reset --hard origin/main`
4. `git pull origin main`
5. `npx prisma generate && npx prisma db push`
6. Recarga da aplicação em tempo de execução via *Hot-Reload*.

### **Especificações do Endpoint:**
- **URL:** `POST https://b-os.malves.dev.br/api/system/deploy`
- **Token / Chave Master:** `victoria_master_secret_2026`
- **Headers Aceitos:**
  - `x-deploy-key: victoria_master_secret_2026`
  - `x-api-key: victoria_master_secret_2026`
  - `Authorization: Bearer victoria_master_secret_2026`
  - Ou via URL: `?token=victoria_master_secret_2026`

### **Exemplos Prontos de Execução:**

#### A. Via Node.js (Usado pelo Assistente Antigravity):
```javascript
fetch('https://b-os.malves.dev.br/api/system/deploy?token=victoria_master_secret_2026', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ branch: 'main' })
})
.then(res => res.json())
.then(console.log);
```

#### B. Via cURL (Linux / macOS):
```bash
curl -X POST "https://b-os.malves.dev.br/api/system/deploy" \
  -H "Content-Type: application/json" \
  -H "x-deploy-key: victoria_master_secret_2026" \
  -d '{"branch":"main"}'
```

#### C. Via PowerShell (Windows):
```powershell
Invoke-RestMethod -Uri "https://b-os.malves.dev.br/api/system/deploy" `
  -Method Post `
  -Headers @{ "x-deploy-key" = "victoria_master_secret_2026" } `
  -ContentType "application/json" `
  -Body '{"branch":"main"}'
```

#### Resposta de Sucesso:
```json
{
  "success": true,
  "message": "Deploy da branch main finalizado com sucesso!",
  "branch": "main",
  "latestCommit": "6b8cf54 fix(deploy): allow multiple valid deploy keys and query token in system deploy auth",
  "durationMs": 5186
}
```

---

## 🔗 3. Método 2: GitHub Webhook (CI/CD Automático)

Para que o GitHub atualize o servidor automaticamente a cada commit enviado para a branch `main`:

1. No repositório GitHub (`https://github.com/zMalves/business-os`), acesse: **Settings** > **Webhooks** > **Add webhook**.
2. **Payload URL:** `https://b-os.malves.dev.br/api/webhook/github`
3. **Content type:** `application/json`
4. **Secret:** Deixe em branco ou configure o mesmo valor da variável `WEBHOOK_SECRET`.
5. **Events:** Selecione *"Just the push event"*.
6. Clique em **Add webhook**.

---

## 🖥️ 4. Método 3: Atualização Manual via SSH / Git

Se precisar atualizar diretamente pelo terminal do servidor:

### Informações do Ambiente:
- **IP do Servidor Local:** `192.168.18.82`
- **Usuário SSH:** `malves`
- **Diretório do Business OS:** `/mnt/hd2tb/apps/systems/node-apps/business-os`
- **Container Docker:** `business-os-app` (Porta `4017`)
- **Container Banco:** `business-os-mariadb` (Porta `3317`, Banco `business_os_db`)

### Comandos de Atualização Recomendados:
```bash
# 1. Acesse o diretório
cd /mnt/hd2tb/apps/systems/node-apps/business-os

# 2. Busque os commits mais recentes e alinhe com o GitHub
git fetch origin main && git reset --hard origin/main

# 3. Garanta permissões de leitura e escrita
sudo chmod -R 777 .
```

---

## 🛠️ 5. Resolução de Problemas Comuns

### 1. `fatal: detected dubious ownership in repository`
- **Causa:** Arquivos criados ou modificados dentro do container Docker pertencem ao usuário `root`.
- **Solução:**
```bash
git config --global --add safe.directory /mnt/hd2tb/apps/systems/node-apps/business-os
sudo chmod -R 777 /mnt/hd2tb/apps/systems/node-apps/business-os
```

### 2. `error: Your local changes would be overwritten by merge`
- **Causa:** Arquivos de lock, permissões ou schemas foram tocados pelo container.
- **Solução (Alinhamento Limpo):**
```bash
git fetch origin main
git reset --hard origin/main
```
*(Seu arquivo `.env` não é apagado pois está protegido no `.gitignore`).*

---

## 🔄 6. Regras de Reinício do Docker

Como a aplicação roda em modo `tsx watch` (Hot-Reloading), **95% das alterações não exigem reiniciar o container**.

### 🟢 NÃO Precisa Reiniciar:
- Alterações em TypeScript/JavaScript (`src/`).
- Atualizações em arquivos estáticos e telas (`public/`).
- Novos prompts, skills ou fluxos da Victoria.
- Deploys executados via API (`/api/system/deploy`).

### 🔴 QUANDO Reiniciar (`sudo docker restart business-os-app`):
1. **Alteração no `.env`**: Novas variáveis ou chaves de API.
2. **Novas bibliotecas npm**: Se o `package.json` ganhou pacotes novos.
3. **Mudanças de Infraestrutura**: Alterações no `docker-compose.yml` ou `Dockerfile`.

---

## 🩺 7. Comandos Úteis de Diagnóstico & Health Check

### Testar Saúde da Aplicação:
```bash
curl http://localhost:4017/api/health
```

### Acompanhar Logs em Tempo Real:
```bash
sudo docker logs -f --tail 50 business-os-app
```
*(Pressione `Ctrl + C` para sair dos logs).*

### Reiniciar Serviços:
```bash
sudo docker restart business-os-app
```
