# 🔍 AUDITORÍA FINAL: Coexistencia Proveedores ↔ Ventas

**Fecha:** 2026-08-17  
**Estado:** Migración COMPLETADA en Backend, PENDIENTE en Frontend  
**Riesgo:** MEDIO → Inconsistencia de UX (algunos módulos dicen "Proveedores", otros "Ventas")

---

## 📊 ESTADO ACTUAL (CORRECCIÓN)

### Backend: ✅ ESTADO ÓPTIMO
✅ Ventas completamente implementado:
- `backend/src/routes/ventas.ts` — 124 líneas (COMPLETO)
- `backend/src/schemas/ventas.schema.ts` — 95 líneas (COMPLETO)
- `backend/src/services/ventas/ventasOrchestrator.ts` — 90 líneas (COMPLETO)
- `backend/src/services/ventas/ventasService.ts` — 299 líneas (COMPLETO)
- `backend/src/models/AnalisisVentas.ts` — 55 líneas (COMPLETO)
- Worker encolado en `analysisWorker.ts` (COMPLETO)

✅ Ambos módulos vivos y funcionales:
- `/api/proveedores/*` — Funciona
- `/api/ventas/*` — Funciona (copia/alias de proveedores mejorado)

### Frontend: ⚠️ ESTADO INCONSISTENTE
- 41 referencias a "Proveedores" en 19 archivos
- Rutas: `/dashboard/proveedores/[productoId]/*` (VIVA)
- NO EXISTE: `/dashboard/ventas/[productoId]/*` (FALTANTE)
- Email labels: Menciona "Proveedores" (ANTIGUO)
- Tailwind: `bg-proveedores`, `gradient-proveedores` (HISTÓRICO)

### Plan Service: ⚠️ PARCIALMENTE INCONSISTENTE
typescript
// ✅ CORRECTO — Ambos presentes:
ventas_analisis: boolean;        // NUEVO (presente en todos los planes)
proveedores_analisis: undefined  // NO existe en PLAN_LIMITES