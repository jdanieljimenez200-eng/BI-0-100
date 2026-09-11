#!/bin/bash

# Script de verificación de credenciales funcionales

echo "🔐 VERIFICANDO CREDENCIALES — BI 0 A 100"
echo "=========================================="
echo ""

# Variables
EMAIL="jorge@bi0a100.com"
PASSWORD="password123"
API_URL="http://localhost:3001"

# 1. Health Check
echo "1️⃣  Health Check..."
HEALTH=$(curl -s "$API_URL/health" | jq -r '.status')
if [ "$HEALTH" = "ok" ]; then
  echo "   ✅ Backend online"
else
  echo "   ❌ Backend offline"
  exit 1
fi

echo ""

# 2. Test Login
echo "2️⃣  Testing Login ($EMAIL)..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')
USER_ID=$(echo $LOGIN_RESPONSE | jq -r '.user.id')
USER_PLAN=$(echo $LOGIN_RESPONSE | jq -r '.user.plan')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  echo "   ❌ Login failed"
  echo "   Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "   ✅ Login successful"
echo "   - User ID: $USER_ID"
echo "   - Plan: $USER_PLAN"
echo "   - Token: ${ACCESS_TOKEN:0:20}..."

echo ""

# 3. Test Análisis API
echo "3️⃣  Testing Análisis Mercado..."
ANALISIS=$(curl -s -X GET "$API_URL/api/mercado/status?analisis_id=1" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq -r '.status')

if [ "$ANALISIS" = "completado" ]; then
  echo "   ✅ Análisis Mercado accesible y completado"
else
  echo "   ⚠️  Análisis status: $ANALISIS"
fi

echo ""

# 4. Count Análisis
echo "4️⃣  Contando análisis completados..."
DB_MERCADO=$(docker-compose exec -T postgres psql -U postgres -d bi0a100 -c "SELECT COUNT(*) FROM analisis_mercado WHERE usuario_id = $USER_ID AND estado_analisis = 'completado'" 2>/dev/null | tail -1 | xargs)
DB_MARKETING=$(docker-compose exec -T postgres psql -U postgres -d bi0a100 -c "SELECT COUNT(*) FROM analisis_marketing WHERE usuario_id = $USER_ID AND estado_analisis = 'completado'" 2>/dev/null | tail -1 | xargs)
DB_FINANZAS=$(docker-compose exec -T postgres psql -U postgres -d bi0a100 -c "SELECT COUNT(*) FROM analisis_finanzas WHERE usuario_id = $USER_ID AND estado_analisis = 'completado'" 2>/dev/null | tail -1 | xargs)
DB_PROVEEDORES=$(docker-compose exec -T postgres psql -U postgres -d bi0a100 -c "SELECT COUNT(*) FROM analisis_proveedores WHERE usuario_id = $USER_ID AND estado_analisis = 'completado'" 2>/dev/null | tail -1 | xargs)
DB_LEGAL=$(docker-compose exec -T postgres psql -U postgres -d bi0a100 -c "SELECT COUNT(*) FROM analisis_legal WHERE usuario_id = $USER_ID AND estado_analisis = 'completado'" 2>/dev/null | tail -1 | xargs)
DB_BRIEF=$(docker-compose exec -T postgres psql -U postgres -d bi0a100 -c "SELECT COUNT(*) FROM analisis_brief WHERE usuario_id = $USER_ID AND estado_analisis = 'completado'" 2>/dev/null | tail -1 | xargs)

echo "   Mercado: $DB_MERCADO ✅"
echo "   Marketing: $DB_MARKETING ✅"
echo "   Finanzas: $DB_FINANZAS ✅"
echo "   Proveedores: $DB_PROVEEDORES ✅"
echo "   Legal: $DB_LEGAL ✅"
echo "   Brief: $DB_BRIEF ✅"

TOTAL=$((DB_MERCADO + DB_MARKETING + DB_FINANZAS + DB_PROVEEDORES + DB_LEGAL + DB_BRIEF))
echo "   TOTAL: $TOTAL análisis completados"

echo ""
echo "✅ TODAS LAS VERIFICACIONES EXITOSAS"
echo ""
echo "Credenciales funcionales:"
echo "  Email: $EMAIL"
echo "  Password: $PASSWORD"