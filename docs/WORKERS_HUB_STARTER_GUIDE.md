# 🚀 Blueprint & Guia Inicial: Hub de Workers

Este documento é o guia definitivo passo a passo para inicializar o novo repositório do **Hub de Workers**, replicando a arquitetura comprovada, ágil e resiliente da **Victoria**.

---

## 1. 🏗️ Arquitetura do Hub de Workers

O Hub de Workers é projetado para executar tarefas pesadas em segundo plano (Node.js/TypeScript ou Python), expondo uma API leve e comunicando-se com a Victoria via Webhooks.

```
┌────────────────────────────────────────────────────────┐
│                   HUB DE WORKERS                       │
│                                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────┐ │
│  │ Worker Financeiro│  │  Worker Vendas   │  │ ...   │ │
│  │  (Faturas/PDFs)  │  │   (SDR/Leads)    │  │       │ │
│  └────────┬─────────┘  └────────┬─────────┘  └───┬───┘ │
│           │                     │                │     │
│           └──────────────┬──────┴────────────────┘     │
│                          ▼                             │
│                  [ DISPATCHER API ]                    │
│             Fastify / Express / FastAPI                │
└──────────────────────────┬─────────────────────────────┘
                           │  HTTP POST (JSON)
                           ▼  Header: x-worker-key
┌────────────────────────────────────────────────────────┐
│            VICTORIA COPILOT (BUSINESS OS)              │
│       Recebe eventos e notifica no WhatsApp / Web      │
└────────────────────────────────────────────────────────┘
```

---

## 2. 📁 Estrutura de Pastas Recomendada

```plaintext
workers-hub/
├── src/
│   ├── workers/             # Cada worker isolado em seu próprio módulo
│   │   ├── financeWorker.ts # Auditorias, faturas, extratos bancários
│   │   ├── salesWorker.ts   # Prospecção, enriquecimento de leads, SDR
│   │   └── scraperWorker.ts # Automações web, downloads de relatórios
│   ├── services/
│   │   ├── victoria.service.ts # Dispara notificações/aprovações para a Victoria
│   │   └── queue.service.ts    # Gerenciador de filas assíncronas (BullMQ/Redis ou Memória)
│   ├── routes/              # Endpoints para disparar workers manualmente ou via Victoria
│   │   ├── worker.routes.ts
│   │   └── system.routes.ts # Endpoint /api/system/deploy
│   └── server.ts            # Inicialização da API Fastify
├── prisma/
│   └── schema.prisma        # Logs de execuções de workers e jobs
├── deploy.sh                # Script de atualização automática no servidor
├── docker-compose.yml       # Orquestração do app + banco
├── Dockerfile.dev           # Ambiente de desenvolvimento ágil com Live-Reload
├── .env.example             # Variáveis de ambiente modelo
├── package.json
└── tsconfig.json
```

---

## 3. 🐳 Docker & Ambiente de Produção

### A. `Dockerfile.dev`
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Ferramentas do sistema e dependências nativas
RUN apk add --no-cache bash git curl python3 make g++

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 4000

CMD ["npm", "run", "dev"]
```

### B. `docker-compose.yml`
```yaml
services:
  workers-app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: ${CONTAINER_NAME:-workers-hub-app}
    restart: unless-stopped
    user: "0:0" # Permissões de root (evita erros 777 no Linux)
    ports:
      - "${PORT:-4000}:${PORT:-4000}"
    volumes:
      # Sincronização em tempo real do código (Live-Reload)
      - .:/app
      # Protege os binários Linux compilados dentro do container
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - PORT=${PORT:-4000}
      - HOST=0.0.0.0
      - DATABASE_URL=${DATABASE_URL:-mysql://workers_user:workers_pass@mariadb:3306/workers_db}
      - VICTORIA_WEBHOOK_URL=${VICTORIA_WEBHOOK_URL:-https://secretary.malves.dev.br/api/workers/events}
      - VICTORIA_SECRET_KEY=${VICTORIA_SECRET_KEY:-victoria_master_secret_2026}
      - DEPLOY_KEY=${DEPLOY_KEY:-workers_master_secret_2026}
    networks:
      - workers-net
    depends_on:
      - workers-mariadb

  workers-mariadb:
    image: mariadb:11.4
    container_name: ${MARIADB_CONTAINER_NAME:-workers-mariadb}
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-root_secret_pass}
      MYSQL_DATABASE: workers_db
      MYSQL_USER: workers_user
      MYSQL_PASSWORD: workers_pass
    ports:
      - "${MARIADB_PORT:-3307}:3306"
    volumes:
      - workers_mariadb_data:/var/lib/mysql
    networks:
      - workers-net

volumes:
  workers_mariadb_data:
    driver: local

networks:
  workers-net:
    driver: bridge
```

---

## 4. 🔄 Script de Deploy Automático (`deploy.sh`)

Crie o arquivo `deploy.sh` na raiz do novo projeto com permissão de execução:

```bash
#!/bin/bash
set -e

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "sub")
echo "🔄 [Workers Hub] Puxando atualizações do Git (branch: $BRANCH)..."
git pull origin "$BRANCH"

echo "🛡️ [Workers Hub] Aplicando permissões 777..."
chmod -R 777 . 2>/dev/null || true

echo "📦 [Workers Hub] Instalando dependências no container..."
docker exec -i workers-hub-app npm install 2>/dev/null || docker compose exec -i workers-app npm install 2>/dev/null || true

echo "🗄️ [Workers Hub] Sincronizando schema do banco (Prisma db push)..."
docker exec -i workers-hub-app npx prisma db push 2>/dev/null || docker compose exec -i workers-app npx prisma db push 2>/dev/null || true

echo "🔄 [Workers Hub] Reiniciando container..."
docker compose restart workers-app 2>/dev/null || docker restart workers-hub-app 2>/dev/null || true

echo "🚀 [Workers Hub] Atualização concluída com sucesso!"
```

---

## 5. 🌐 Rota de Deploy Remoto (`src/routes/system.routes.ts`)

Permite acionar o deploy via HTTP direto do seu terminal ou webhook do GitHub:

```typescript
import { FastifyInstance } from 'fastify';
import { exec } from 'child_process';
import path from 'path';

export async function systemRoutes(app: FastifyInstance) {
  app.post('/system/deploy', async (req, reply) => {
    const deployKey = req.headers['x-deploy-key'] || (req.query as any)?.key;
    const expectedKey = process.env.DEPLOY_KEY || 'workers_master_secret_2026';

    if (deployKey !== expectedKey) {
      return reply.status(401).send({ error: 'Unauthorized deploy key' });
    }

    const scriptPath = path.resolve(process.cwd(), 'deploy.sh');

    // Executa em background para não travar o socket durante o restart
    exec(`bash "${scriptPath}"`, (error, stdout, stderr) => {
      if (error) console.error('[Deploy Error]:', stderr);
      else console.log('[Deploy Success]:', stdout);
    });

    return reply.send({
      success: true,
      message: 'Deploy iniciado com sucesso em segundo plano.',
    });
  });
}
```

---

## 6. 🌿 Estratégia de Git (Fluxo `sub` & `develop`)

Seguindo o mesmo fluxo seguro e sem atritos da Victoria:
1. **Branch de Trabalho Ativo**: `sub` (onde os desenvolvimentos e testes acontecem).
2. **Branch de Produção do Servidor**: `develop` ou `sub`.
3. **Comando de Push Unificado**:
   ```bash
   git add -A; git commit -m "feat(worker): novo worker adicionado"; git push origin sub; git checkout develop; git merge sub; git push origin develop; git checkout sub
   ```
4. **Disparo do Deploy**:
   ```powershell
   $headers = @{ "x-deploy-key" = "workers_master_secret_2026" }
   Invoke-RestMethod -Uri "https://workers.malves.dev.br/api/system/deploy" -Method Post -Headers $headers
   ```

---

## 7. ✉️ Serviço de Integração com a Victoria (`src/services/victoria.service.ts`)

```typescript
export class VictoriaService {
  private webhookUrl = process.env.VICTORIA_WEBHOOK_URL || 'https://secretary.malves.dev.br/api/workers/events';
  private secretKey = process.env.VICTORIA_SECRET_KEY || 'victoria_master_secret_2026';

  async notifyEvent(data: { worker: string; title: string; message: string; payload?: any }) {
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-worker-key': this.secretKey,
        },
        body: JSON.stringify(data),
      });
    } catch (err: any) {
      console.error('[VictoriaService] Erro ao notificar Victoria:', err.message);
    }
  }
}

export const victoriaService = new VictoriaService();
```
