# Auditoría BI 0 A 100 — Plan de Mitigación
**Fecha**: 2026-05-26  
**Agentes ejecutados**: Backend Routes, Frontend Logic, DB Schema, Auth/Security

---

## BLOQUE 1 — CRÍTICO (antes de producción)

### C1 · Transacciones en operaciones financieras
**Archivos**: `nomina.ts:112-138`, `pos.ts:213-285`, `inventario.ts:183-213`  
**Riesgo**: Crash entre saves deja libros contables corruptos (pago sin movimiento, venta sin items, stock incorrecto).  
**Fix**: Envolver cada operación multi-save en `AppDataSource.transaction(async manager => { ... })`.

### C2 · Bypass de plan freemium
**Archivo**: `backend/src/middleware/requirePlan.ts:54`  
**Riesgo**: `producto_id` viene del body sin verificar ownership. Un usuario freemium envía el `productoId` de otro usuario (con 0 análisis) y corre análisis ilimitados.  
**Fix**:
```typescript
const producto = await AppDataSource.getRepository(Producto).findOne({
  where: { id: productoId, usuario_id: req.userId! },
});
if (!producto) return res.status(403).json({ error: 'Producto no encontrado' });
```

### C3 · Contraseña cambiada no cierra sesiones activas
**Archivos**: `auth.ts:284-318` (change-password), `auth.ts:238-252` (reset-password)  
**Riesgo**: Si un atacante tiene el refresh token, retiene acceso aún después de que la víctima cambia su contraseña.  
**Fix**: Al actualizar `password_hash`, también setear `refresh_token_hash: null` y limpiar las cookies.

### C4 · Interfaz `Cita` sin campo `producto_id` — filtro de Calendario roto
**Archivo**: `frontend/app/dashboard/herramientas/calendario/page.tsx:10-23`  
**Riesgo**: `filterBySelected` accede a `c.producto_id` pero el tipo `Cita` no lo declara. TypeScript produce `undefined ?? ''` para toda cita → **el filtro por producto nunca funciona en Calendario**.  
**Fix**: Agregar `producto_id: string | null` a la interfaz `Cita`.

---

## BLOQUE 2 — ALTO (dentro de los próximos 2 sprints)

### H1 · Items de cotización sin validación server-side — ✅ RESUELTO (2026-06-28)
**Archivo**: `cotizaciones.ts:17-27` (`validateItems`)  
**Riesgo**: Cliente puede enviar `subtotal: -99999` o `subtotal: Infinity`. Totales son confiados del cliente, no recalculados.  
**Fix aplicado**: `validateItems` recalcula `subtotal = cantidad * precio_unitario` server-side (l.24), rechaza `cantidad <= 0` (l.21) y `precio_unitario < 0` (l.22), y valida `isFinite`. Se invoca en POST (l.119) y PATCH (l.180).

### H2 · Búsqueda de clientes pierde filtros activos — ✅ RESUELTO (2026-06-28)
**Archivo**: `clientes.ts:41-44`  
**Riesgo**: Cuando se envía `?q=jose&producto_id=X`, la búsqueda textual ignora `producto_id` y devuelve clientes de todos los productos.  
**Fix aplicado**: el path del `createQueryBuilder` (búsqueda textual) añade con `andWhere` los filtros `estado` (l.41), `categoria` (l.42), `negocio_id` (l.43) y `producto_id` (l.44), aplicándolos junto al término de búsqueda.

### H3 · No hay try/catch en ningún route handler
**Afecta**: Todos los archivos de rutas.  
**Riesgo**: Cualquier error de DB (conexión perdida, UUID inválido en params) genera unhandled rejection — la request queda colgada en Express 4.  
**Fix**: Agregar un wrapper global o envolver cada handler:
```typescript
const wrap = (fn: Function) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);
```
Y registrar un error middleware final en `app.ts`.

### H4 · `producto_id` nuevo sin índice ni FK en 4 modelos — ✅ RESUELTO (2026-06-28)
**Archivos**: `Cliente.ts:18`, `Cita.ts:17`, `Empleado.ts:10`, `Cotizacion.ts:23`  
**Riesgo**: Full table scan en cada operación de filtrado. Sin integridad referencial (productos borrados dejan `producto_id` huérfano).  
**Fix aplicado**: los 4 modelos tienen índice compuesto `@Index(['usuario_id', 'producto_id'])` y la columna `producto_id` está normalizada a `type: 'uuid'`. (Cliente y Cotización además declaran la relación `@ManyToOne` con `onDelete: 'SET NULL'`; Cita y Empleado mantienen `producto_id` como columna uuid sin FK.)

### H5 · Pago de monto cero aceptado — ✅ RESUELTO (2026-06-28)
**Archivo**: `nomina.ts:114-117`  
**Riesgo**: `monto: 0` pasa la validación por `??` y crea un movimiento contable de $0.  
**Fix aplicado**: `montoFinal = monto ?? Number(emp.salario)` (l.112) y luego `if (montoFinal <= 0) { res.status(400).json({ error: 'monto debe ser mayor a 0' }); return; }` (l.114-117), antes de abrir la transacción que crea movimiento contable + pago de nómina.

### H6 · Sin endpoint plan gate en importación masiva contabilidad
**Archivo**: `contabilidad.ts:111`  
**Riesgo**: Usuarios freemium pueden importar 5,000 movimientos por llamada sin límite.  
**Fix**: Aplicar `requireCanRunAnalisis` o un límite de registros por plan al `/import` endpoint.

### H7 · Token de acceso válido tras el logout — ✅ RESUELTO (2026-06-28)
**Archivo**: `auth.ts:458-467` (logout), `middleware/auth.ts:29-30` (verificación)  
**Riesgo**: Token robado (XSS, logs) seguía siendo válido tras logout.  
**Fix aplicado**: el access token incluye `jti` (`auth.ts:42-44`) y dura **15m** (l.46). El logout hace `SET deny:{jti} 1 EX <ttl>` en Redis (l.467) y `authenticate` consulta esa denylist en cada request (`middleware/auth.ts:29-30`).

---

## BLOQUE 3 — MEDIO (backlog priorizado)

| ID | Archivo | Descripción |
|----|---------|-------------|
| M1 | `pos.ts:208`, `cotizaciones.ts:27` | Race condition en numeración de tickets/cotizaciones bajo concurrencia |
| M2 | `calendario.ts:15` | `year`/`month` sin validación de rango (mes 99 → query absurda) |
| M3 | `auth.ts:189` | Race condition en rotación de refresh token (dos requests simultáneos) |
| M4 | `personal/page.tsx:447` | Filtro de pagos falla si empleado está inactivo (join en memoria incompleto) |
| M5 | `personal/page.tsx:533` | `setTimeout` para capturar estado `soloActivos` — reemplazar por `useEffect` |
| M6 | `calendario/page.tsx:366` | Re-fetch innecesario al backend en cada toggle de producto (filtrar solo client-side) |
| M7 | `contabilidad.ts:96` | PATCH permite `descripcion: ""` (vacío), POST lo rechaza — inconsistencia |
| M8 | `herramientas/*/page.tsx` | Al crear con múltiples productos seleccionados, modal asigna solo `selectedIds[0]` sin aviso al usuario |
| M9 | `Marca.ts:19` | Falta `@Index()` en `usuario_id` — full scan en queries de marca |
| M10 | `MovimientoContable` | Falta `@Index(['batch_id'])` y `@Index(['fuente'])` — DELETE de lotes es full scan |

---

## BLOQUE 4 — BAJO (deuda técnica)

- `auth.ts:71`: bcrypt cost factor 10 → subir a 12
- `auth.ts:143`: cast `undefined as unknown as Date` → usar `null` correcto
- `app.ts:130`: Campo `env` en health endpoint expone modo dev/prod
- `PagoNomina.ts:53`: `movimiento_id` como `varchar` en lugar de `type: 'uuid'`
- `Cotizacion.ts:55`: default `'[]'` como string en jsonb — usar `[]` nativo
- `Usuario.ts:24`: `nombre!: string` pero columna es nullable → `nombre?: string | null`
- `api.ts`: CLAUDE.md dice que usa localStorage para tokens pero el código real usa cookies HttpOnly — actualizar documentación
- `PILL_COLORS` badge index: color basado en posición en array (inestable tras re-fetch) → hashear `producto_id` para color estable

---

## Orden de ejecución recomendado

```
Sprint actual (bloqueantes):
  1. C4 — Fix tipo Cita (5 min, 1 línea)
  2. C1 — Transacciones DB (nomina + pos + inventario)
  3. C2 — Ownership check en requirePlan
  4. C3 — Invalidar sesión al cambiar contraseña
  5. H3 — Async error handler global (protege TODAS las rutas)

Próximo sprint:
  6. H1 — Validar items cotización server-side          [✅ hecho]
  7. H2 — Búsqueda + filtros simultáneos en clientes     [✅ hecho]
  8. H4 — Índices en producto_id (4 modelos)             [✅ hecho]
  9. H5 — Rechazar monto cero en nómina                  [✅ hecho]
  10. H7 — JWT denylist en logout                        [✅ hecho]

Backlog:
  M1-M10, L1-L8
```
