#!/bin/bash

# Script de validación antes de deploy a producción
# Uso: bash scripts/pre-deploy-check.sh

set -e

echo "🔍 PRE-DEPLOY VALIDATION CHECKLIST"
echo "=================================="
echo ""

# Variables de producción: se toman de .env.production si existe (sin pisar las
# que ya estén exportadas en la terminal o en el CI).
if [ -f .env.production ]; then
  echo "✓ Cargando .env.production"
  while IFS= read -r linea || [ -n "$linea" ]; do
    case "$linea" in ''|\#*) continue ;; esac
    nombre="${linea%%=*}"
    if [ -z "${!nombre+x}" ]; then export "$linea"; fi
  done < .env.production
fi

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
npm test -- --passWithNoTests || { echo "❌ Backend tests failed"; exit 1; }
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
# Antes solo avisaba (⚠️) y el script terminaba en "ALL CHECKS PASSED" aunque
# faltaran variables de las que dependen pagos, subidas y el panel de admin.
REQUIRED_VARS=(
  "DATABASE_URL"
  "REDIS_URL"
  "FRONTEND_URL"
  "ANTHROPIC_API_KEY"
  "NEXT_PUBLIC_API_URL"
)
FALTAN=0
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ Falta $var (defínela en .env.production o en el entorno)"
    FALTAN=1
  fi
done
[ "$FALTAN" -eq 0 ] || exit 1

# El resto del contrato (JWT y admin, almacenamiento, Stripe por plan, correo,
# métricas) lo comprueba el mismo código que usa el backend al arrancar.
(cd backend && NODE_ENV=production npx ts-node --transpile-only -e \
  "require('./src/config/entorno').verificarEntornoProduccion()") \
  || { echo "❌ Variables de producción incompletas (ver arriba)"; exit 1; }

# 5b. Secretos: ninguna clave real en el repo, en variables públicas ni en el bundle
echo "✓ Checking secrets..."
# Claves reales (las plantillas usan xxxx y no coinciden: exigen al menos 20 caracteres alfanuméricos seguidos).
PATRON_SECRETOS='sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|(sk|rk)_live_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}'
if git --no-pager grep -nIE "$PATRON_SECRETOS" -- . ':!**/node_modules/**' ':!**/*.test.ts' | grep -v 'xxxx'; then
  echo "❌ Posible clave real en archivos del repositorio"; exit 1
fi
# Una variable NEXT_PUBLIC_* se incrusta en el JavaScript que descarga el navegador.
if env | grep -E '^NEXT_PUBLIC_[A-Z_]*=' | grep -iE 'ANTHROPIC|OPENAI|STRIPE_SECRET|sk-ant-|sk_live_'; then
  echo "❌ Una variable NEXT_PUBLIC_ contiene una clave secreta"; exit 1
fi
if [ -d frontend/.next/static ] && grep -rEl "$PATRON_SECRETOS" frontend/.next/static >/dev/null 2>&1; then
  echo "❌ El bundle del frontend contiene una clave secreta"; exit 1
fi
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --no-banner --redact || { echo "❌ gitleaks encontró secretos"; exit 1; }
else
  echo "⚠️  gitleaks no instalado: solo se aplicó el escaneo básico"
fi

# 6. Database migrations check
echo "✓ Checking migrations..."
if [ ! -d "backend/src/migrations" ]; then
  echo "❌ No migrations folder found"
  exit 1
fi

# 7. Git check — lo que se despliega es lo commiteado; un árbol sucio significa
# que lo verificado aquí no es lo que llegará a producción.
echo "✓ Git status..."
if [ -n "$(git --no-pager status --porcelain)" ]; then
  git --no-pager status --short
  if [ "${ALLOW_DIRTY:-}" = "1" ]; then
    echo "⚠️  Cambios sin commitear (ALLOW_DIRTY=1: se continúa)"
  else
    echo "❌ Hay cambios sin commitear. Haz commit, o ALLOW_DIRTY=1 para una verificación local."
    exit 1
  fi
fi

echo ""
echo "✅ ALL CHECKS PASSED — Ready for deploy"
echo ""
echo "Next steps:"
echo "1. git push origin main (el deploy se dispara desde main tras CI en verde)"
echo "2. Watch deploy on Railway/Render/Docker"
echo "3. Check logs: railway logs (or docker compose logs)"
echo "4. Test health: curl https://api.tudominio.com/health"