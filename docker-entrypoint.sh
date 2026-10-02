#!/bin/sh
set -e

# Garante permissões totais no diretório da aplicação
chmod -R 777 /app 2>/dev/null || true
git config --global --add safe.directory /app 2>/dev/null || true

echo "📦 [Secretaria IA] Verificando dependências npm..."
npm install --no-audit --prefer-offline 2>/dev/null || npm install --no-audit

echo "🚀 [Secretaria IA] Gerando cliente Prisma..."
npx prisma generate

echo "📦 [Secretaria IA] Aplicando sincronização do banco de dados..."
npx prisma db push --skip-generate 2>/dev/null || npx prisma migrate deploy 2>/dev/null || true

echo "🔥 [Secretaria IA] Iniciando servidor em modo live-reload (tsx watch)..."
exec "$@"
