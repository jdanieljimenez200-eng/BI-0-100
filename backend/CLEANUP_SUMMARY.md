# 🧹 Elimación del Módulo Proveedores — Resumen Completo

## ✅ Cambios de Código Completados

### Backend (TypeScript)

1. **src/workers/analysisWorker.ts**
   - ✅ Eliminado type `'proveedores'` de `AnalysisTipo`
   - ✅ Eliminado case `'proveedores'` del switch de worker

2. **src/services/billing/planService.ts**
   - ✅ Eliminado `proveedores_analisis: true/false` de todos los planes (pro, pro_plus, business, enterprise)
   - Nota: `freemium` ya no tenía esa propiedad

3. **src/services/billing/redactAnalisis.ts**
   - ✅ Sin cambios necesarios (no tenía lógica de redacción específica de proveedores)

4. **src/scripts/complete-all-analyses.ts**
   - ✅ Eliminado INSERT de `analisis_proveedores`

5. **src/seeds/seed-demo-equipo.ts**
   - ✅ Cambiado `proveedores: true` → `ventas: true`

6. **src/seeds/seed-full-4weeks-demo.ts**
   - ✅ Eliminado INSERT de `analisis_proveedores`
   - ✅ Actualizado comentario (Mercado, Marketing, **Ventas**, Finanzas, Brief, Legal)

7. **src/__tests__/services/redactAnalisis.test.ts**
   - ✅ Eliminado `filaProveedores()`
   - ✅ Eliminado test describe de `redactAnalisisPayload — proveedores en gratuito`

8. **src/migrations/**
   - ✅ Creada nueva migración: `2026-08-17-remove-proveedores-module.ts`
   - Migración maneja: drop indexes, drop foreign keys, drop table con rollback support

### Frontend (Next.js)

1. **app/dashboard/(modules)/analisis/layout.tsx**
   - ✅ Eliminado item "Proveedores" de menú de módulos

2. **app/dashboard/(modules)/analisis/[modulo]/loading.tsx**
   - ✅ Eliminado item "Proveedores" de menú de módulos (skeleton)

3. **app/dashboard/(modules)/analisis/[modulo]/page.tsx**
   - ✅ Eliminado entry `proveedores` de MODULES
   - ✅ Eliminado case `'proveedores'` del switch de renders

4. **app/dashboard/(modules)/analisis/new/form.tsx**
   - ✅ Eliminado entry `proveedores` de MODULES

### Referencias Que NO Se Eliminaron (Contextuales)

- **backend/src/models/Cliente.ts:93** — "RFC para proveedores MX" (comentario, no código)
- **backend/src/schemas/mercado.schema.ts:94** — `proveedores: SemaforoColor` (parte del análisis DAFO de Mercado, no del módulo Proveedores)
- **backend/src/services/email/emailService.ts:85** — "negociación con proveedores" (descripción del módulo Ventas, contextualmente correcto)
- **backend/src/services/mercado/** — Referencias a "proveedores locales" (análisis de mercado, no módulo)

## 📁 Archivos a Eliminar Manualmente

Estos archivos no pueden eliminarse con herramientas automáticas. Ejecuta desde `backend/`:

bash
bash REMOVE_PROVEEDORES.sh


O manualmente:

bash
rm -f src/routes/proveedores.ts
rm -rf src/services/proveedores
rm -f src/models/AnalisisProveedores.ts
rm -f src/schemas/proveedores.schema.ts
rm -f src/__tests__/services/proveedoresServices.test.ts
rm -f src/migrations/2026-08-17-drop-proveedores-table.ts
rm -f src/migrations/2026-08-17-remove-proveedores.ts