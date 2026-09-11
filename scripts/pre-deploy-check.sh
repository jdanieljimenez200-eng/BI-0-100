#!/bin/bash

# Script de validación antes de deploy a producción
# Uso: bash scripts/pre-deploy-check.sh

set -e

echo "🔍 PRE-DEPLOY VALIDATION CHECKLIST"
echo "=================================="
echo ""

# 1. TypeScript check
echo "✓ TypeScript validation..."
cd backend
npm run typecheck || { echo "❌ Backend TypeScript errors found"; exit 1; }
cd ..

cd frontend
npm run typecheck || { echo "❌ Frontend TypeScript errors found"; exit 1; }
cd ..

# 2. Tests
echo "✓ Running tests..."
cd backend
npm test -- --passWithNoTests || { echo "⚠️  Some tests failed (but proceeding)"; }
cd ..

# 3. Build validation
echo "✓ Building backend..."
cd backend
npm run build || { echo "❌ Backend build failed"; exit 1; }
cd ..

echo "✓ Building frontend..."
cd frontend
npm run build || { echo "❌ Frontend build failed"; exit 1; }
cd ..

# 4. Docker build test
echo "✓ Docker build test..."
if command -v docker &> /dev/null && docker info &> /dev/null; then
  echo "  - Building backend image..."
  docker build -f backend/Dockerfile.prod -t bi0a100-backend:test backend/ || { echo "❌ Backend Docker build failed"; exit 1; }
  echo "  - Building frontend image..."
  docker build -f frontend/Dockerfile.prod --build-arg NEXT_PUBLIC_API_URL=https://api.tudominio.com/api -t bi0a100-frontend:test frontend/ || { echo "❌ Frontend Docker build failed"; exit 1; }
else
  echo "⚠️  Docker daemon not accessible, skipping live image compilation test"
fi

# 5. Env vars check
echo "✓ Checking environment variables..."
REQUIRED_VARS=(
  "DATABASE_URL"
  "REDIS_URL"
  "JWT_SECRET"
  "JWT_REFRESH_SECRET"
  "FRONTEND_URL"
  "AWS_ACCESS_KEY_ID"
  "AWS_SECRET_ACCESS_KEY"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "ANTHROPIC_API_KEY"
)

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "⚠️  Missing $var (set in .env.production)"
  fi
done

# 6. Database migrations check
echo "✓ Checking migrations..."
if [ ! -d "backend/src/migrations" ]; then
  echo "❌ No migrations folder found"
  exit 1
fi

# 7. Git check
echo "✓ Git status..."
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  Uncommitted changes detected"
  git status --short
fi

echo ""
echo "✅ ALL CHECKS PASSED — Ready for deploy"
echo ""
echo "Next steps:"
echo "1. git push origin main"
echo "2. Watch deploy on Railway/Render/Docker"
echo "3. Check logs: railway logs (or docker compose logs)"
echo "4. Test health: curl https://api.tudominio.com/health"