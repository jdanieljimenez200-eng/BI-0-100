# 🧹 Limpieza Manual del Módulo Proveedores

## Paso 1: Eliminar Archivos del Backend

bash
cd backend
bash REMOVE_PROVEEDORES.sh
cd ..

Este script elimina:
- src/routes/proveedores.ts
- src/services/proveedores/ (carpeta)
- src/models/AnalisisProveedores.ts
- src/schemas/proveedores.schema.ts
- src/__tests__/services/proveedoresServices.test.ts
- Migraciones antiguas innecesarias

## Paso 2: Eliminar Carpeta de Proveedores del Frontend

bash
rm -rf frontend/app/dashboard/proveedores

## Paso 3: Verificar Tipado Backend

bash
cd backend && npm run typecheck && cd ..

**Esperado:** Sin errores (o solo pre-existentes)

## Paso 4: Verificar Tipado Frontend

bash
cd frontend && npx tsc --noEmit && cd ..

**Esperado:** Sin errores nuevos

## Paso 5: Ejecutar Tests Backend

bash
cd backend && npm test -- --runInBand && cd ..

**Esperado:** Tests pasan

## Paso 6: Reiniciar Servicios Docker (Aplica Migración con Backup)

bash
docker compose down
docker compose up -d

**Esperar 8-10 segundos** para que los servicios inicien

**ℹ️ Nota:** La migración `2026-08-17-archive-proveedores-module.ts` hace un backup automático:
1. Crea tabla `analisis_proveedores_archived`
2. Copia TODOS los datos al archivo
3. Dropea tabla original (datos salvos)
4. Rollback disponible si lo necesitas

## Paso 7: Verificar BD

bash
docker compose logs -f backend

**Esperado:** Sin errores, migración ejecutada, backend listo

### Verificar tabla eliminada:

bash
docker compose exec postgres psql -U postgres -d bi0a100 -c "\dt analisis_*"

**Esperado:** Tabla `analisis_proveedores` NO aparece

## Paso 8: Prueba Visual

1. Abrir http://localhost:3000 en navegador
2. Dashboard → Nuevo Análisis
3. **Verificar:**
   - ❌ "Proveedores" NO aparece
   - ✅ "Ventas" SÍ aparece

## ✅ ¡Completado!

El módulo Proveedores está completamente eliminado del sistema.

## 🔍 Búsqueda de Residuos

bash
# Backend
grep -r "proveedores" backend/src --include="*.ts" 2>/dev/null | grep -v node_modules | head -20

# Frontend
grep -r "proveedores" frontend/app --include="*.tsx" 2>/dev/null | grep -v node_modules | head -20

**Esperado:** Solo coincidencias en comentarios o contexto
