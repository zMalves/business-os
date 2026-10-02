#!/bin/bash
set -e

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
echo "🔄 [Business OS] Puxando atualizações do Git (branch: $BRANCH)..."
git pull origin "$BRANCH"

echo "🛡️ [Business OS] Aplicando permissões 777..."
chmod -R 777 . 2>/dev/null || true

echo "📦 [Business OS] Instalando novas dependências npm no container..."
docker exec -i business-os-app npm install 2>/dev/null || docker compose exec -i business-os-app npm install 2>/dev/null || true

echo "🗄️ [Business OS] Sincronizando schema do banco (Prisma db push)..."
docker exec -i business-os-app npx prisma db push 2>/dev/null || docker compose exec -i business-os-app npx prisma db push 2>/dev/null || true

echo "🔄 [Business OS] Reiniciando container para carregar novas alterações..."
docker compose restart business-os-app 2>/dev/null || docker restart business-os-app 2>/dev/null || true

echo "🚀 [Business OS] Atualização concluída com sucesso no caminho /mnt/hd2tb/apps/systems/node-apps/business-os!"
