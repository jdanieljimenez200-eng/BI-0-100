#!/bin/bash

set -e

echo "🧹 Limpieza Completa del Módulo Proveedores"
echo "=============================================="
echo ""

# 1. Backend
echo "📦 Backend: Eliminando archivos..."
cd backend
bash REMOVE_PROVEEDORES.sh
echo ""

# 2. Frontend
echo "🎨 Frontend: Eliminando carpeta de proveedores..."
rm -rf ../frontend/app/dashboard/proveedores
echo "✅ Carpeta frontend/app/dashboard/proveedores eliminada"
echo ""

# 3. Verificar tipado
echo "🔍 Verificando tipado TypeScript..."
npm run typecheck
echo "✅ Backend typecheck OK"

cd ../frontend
npx tsc --noEmit
echo "✅ Frontend typecheck OK"
cd ..
echo ""

# 4. Tests
echo "🧪 Ejecutando tests backend..."
cd backend
npm test -- --runInBand
echo "✅ Tests backend OK"
cd ..
echo ""

# 5. Docker
echo "🐳 Reiniciando servicios Docker..."
docker compose down
docker compose up -d
sleep 8

echo ""
echo "✅ LIMPIEZA COMPLETADA"
echo ""
echo "📋 Próximas verificaciones:"
echo "1. docker compose logs -f backend"
echo "2. Abrir http://localhost:3000"
echo "3. Dashboard → Nuevo Análisis (verificar que NO aparece Proveedores)"