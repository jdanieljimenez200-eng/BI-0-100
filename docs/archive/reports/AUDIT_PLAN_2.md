# AUDIT PLAN 2 — BI 0 A 100
**Fecha:** 2026-05-27 | **Agentes:** Seguridad · Lógica · Frontend · Base de datos

---

## BLOQUE 1 — CRÍTICO (fix inmediato)

### C1 — JWT en query param en SSE endpoint (token en logs)
- **Archivo:** `backend/src/routes/events.ts`
- **Problema:** `?token=<jwt>` en URL → queda en logs de Railway/proxies para siempre
- **Fix:** Leer de `req.cookies?.access_token` (ya es HttpOnly+SameSite, se envía automáticamente)

### C2 — Upload MIME validado por header del cliente, no magic bytes
- **Archivo:** `backend/src/middleware/upload.ts`
- **Problema:** `file.mimetype` viene del cliente → se puede subir `.php` con `Content-Type: image/jpeg`
- **Fix:** `fileTypeFromBuffer()` (paquete `file-type`) para verificar bytes reales

### C3 — Extensión de archivo tomada de `originalname` del usuario
- **Archivo:** `backend/src/services/StorageService.ts`
- **Problema:** `path.extname(originalname)` → atacante sube `shell.php.jpg` con ext `.jpg`
- **Fix:** Derivar extensión del MIME detectado en C2, nunca de `originalname`

### C4 — S3 `ACL: 'public-read'` — todos los uploads permanentemente públicos
- **Archivo:** `backend/src/services/StorageService.ts`
- **Problema:** Sin control de acceso; imágenes de productos eliminados siguen accesibles
- **Fix:** Remover `ACL: 'public-read'`, usar pre-signed URLs con TTL

---

## BLOQUE 2 — ALTO

### H1 — Cookie access_token en `/refresh` tiene maxAge 24h en vez de 15m
- **Archivo:** `backend/src/routes/auth.ts` línea 209
- **Fix:** Cambiar `86400 * 1000` → `15 * 60 * 1000`

### H2 — `req.body` sin validar guardado directo en DB (overrides_data)
- **Archivo:** `backend/src/routes/finanzas.ts` líneas 104-117
- **Fix:** Schema Zod antes de `repo.update`

### H3 — Sin plan gate en bulk import de contabilidad
- **Archivo:** `backend/src/routes/contabilidad.ts` línea 113
- **Fix:** Agregar middleware `requireProPlan` en la ruta

### H4 — Prompt injection en endpoint IA de marca
- **Archivo:** `backend/src/routes/marca.ts` líneas 83-120
- **Fix:** Zod schema con `max(200)` en `slogan_hint`, `estilo_visual`, `colores_preferidos`

### H5 — Race condition: número de ticket POS sin advisory lock
- **Archivo:** `backend/src/routes/pos.ts` líneas 209-210
- **Problema:** Dos requests simultáneos generan el mismo `numero_ticket`
- **Fix:** Mover count dentro de transacción + `pg_advisory_xact_lock` (igual que cotizaciones)

### H6 — DELETE venta POS no es transaccional (3 operaciones separadas)
- **Archivo:** `backend/src/routes/pos.ts` líneas 311-325
- **Fix:** Envolver en `AppDataSource.transaction`

### H7 — DELETE pago nómina no es transaccional
- **Archivo:** `backend/src/routes/nomina.ts` líneas 151-159
- **Fix:** Envolver en `AppDataSource.transaction`

### H8 — Reset-password: token Redis eliminado DESPUÉS del update DB
- **Archivo:** `backend/src/routes/auth.ts` líneas 265-270
- **Problema:** Crash entre DB update y Redis del → token reutilizable
- **Fix:** Eliminar Redis key PRIMERO, luego actualizar password

### H9 — `@ManyToOne` faltante en producto_id / negocio_id (sin FK en BD)
- **Archivos:** `Cliente.ts`, `Cita.ts`, `Empleado.ts`, `Cotizacion.ts`
- **Problema:** Columnas UUID sin FK constraint → sin integridad referencial
- **Fix:** Agregar `@ManyToOne(() => Producto, { onDelete: 'SET NULL', nullable: true })` + `@JoinColumn`

### H10 — `PagoNomina.movimiento_id` y `MovimientoContable.parent_movimiento_id` sin relación
- **Archivos:** `PagoNomina.ts`, `MovimientoContable.ts`
- **Fix:** Agregar `@ManyToOne` con `onDelete: 'SET NULL'` y `@Index`

### H11 — `negocio_id` tipado como `varchar` en vez de `uuid` (3 modelos)
- **Archivos:** `Cita.ts`, `Empleado.ts`, `Cotizacion.ts`
- **Fix:** Cambiar `type: 'varchar'` → `type: 'uuid'`

### H12 — XSS en ventana de impresión de cotizaciones (innerHTML sin sanitizar)
- **Archivo:** `frontend/app/dashboard/herramientas/cotizaciones/page.tsx` líneas 104-147
- **Fix:** Escapar campos de usuario antes de inyectar en `document.write`

### H13 — Stale closure: toast siempre muestra "creado" aunque sea edición
- **Archivos:** `calendario/page.tsx:431`, `clientes/page.tsx:578`
- **Fix:** Pasar flag `isEdit` a `handleSaved` en lugar de leer `editando` desde closure

---

## BLOQUE 3 — MEDIO

### M1 — Sin validación de inputs en rutas: clientes, calendario, POS catálogo
- Añadir Zod schema a `POST /clientes`, `POST /calendario`, `POST /pos/catalogo`

### M2 — Sin ownership check en `contabilidad/:productoId` (import + POST individual)
- Verificar que `productoId` pertenece al usuario antes de operar

### M3 — `imagen_url` acepta URLs arbitrarias en POS (javascript: / data:)
- Validar con `z.string().url()` y whitelist de protocolos

### M4 — Array `lineas` en POS sin límite de tamaño (DoS)
- Agregar `max(500)` al validar el carrito

### M5 — SSE sin límite de conexiones por usuario (DoS)
- Reemplazar conexión anterior al abrir nueva (un SSE por userId)

### M6 — Breakeven divide entre cero cuando margen ≤ 0
- **Archivo:** `backend/src/services/finanzas/breakevenService.ts` líneas 57-84
- **Fix:** Guard `if (margen_contribucion_unitario <= 0) return null` en escenarios

### M7 — `localStorage.getItem('usuario')` sin try/catch en dashboard
- **Fix:** Envolver `JSON.parse` en try/catch

### M8 — Auth guard no re-evalúa al expirar token mid-session
- Las páginas de herramientas sólo comprueban auth en mount

### M9 — `Cotizacion.impuesto_tasa` decimal(5,2) vs `Venta` decimal(5,4)
- **Fix:** Unificar a `decimal(5,4)`

### M10 — Índices faltantes: `Venta(usuario_id, estado)`, `Producto(usuario_id, status)`
- Agregar `@Index` class-level en ambos modelos

### M11 — `handleArchivar` en dashboard no muestra toast de error
- **Fix:** Envolver en try/catch + `setToast`

### M12 — `guardarItem` (POS) y `guardarInsumo` (inventario) sin manejo de errores
- **Fix:** Agregar try/catch + toast en ambas funciones

### M13 — `key={i}` (índice array) en filas de items (cotizaciones) y carrito (POS)
- **Fix:** Usar `item.id` o `uuidv4()` generado en `emptyItem()`

### M14 — Botones de guardar fuera del `<form>` con cast inseguro
- `onClick={handleSubmit as unknown as React.MouseEventHandler}` en 4 modales
- **Fix:** Mover botón dentro del `<form>` como `<button type="submit">`

### M15 — `AnalisisMarketing/Proveedores.analisis_mercado_id` sin FK ni índice
- **Fix:** Cambiar a `@ManyToOne` + `@Index`

### M16 — Redis sin reconnect strategy ni timeout de conexión inicial
- **Fix:** Configurar `socket.reconnectStrategy` y `connectTimeout: 5000`

---

## BLOQUE 4 — BAJO / TÉCNICO

- `Usuario.nombre` nullable en BD pero tipado como `string` (no `string | null`)
- `Marca` sin `@UpdateDateColumn`
- `VentaItem` sin timestamps
- `Empleado`, `Cliente`, `ItemPOS` sin `deletedAt` para auditoría
- `MovimientoContable.parent_movimiento_id` sin `@Index`
- `console.log` de paths internos en `StorageService` (exponer en logs de prod)
- `userPlan` en `AuthRequest` nunca se setea — eliminar o documentar
- `confirm()` nativo en herramientas vs modal custom en dashboard (inconsistencia)
- Botones de sólo icono sin `aria-label`
- `CustomSelect` labels no asociadas con `htmlFor`
- UUID params sin validación de formato en múltiples rutas → 500 en vez de 400
- `change-password` usa bcrypt cost 10 vs 12 del signup

---

## Resumen de Criticidad

| Bloque | Ítems | Prioridad |
|--------|-------|-----------|
| Crítico | 4 | Esta semana |
| Alto | 13 | Esta semana |
| Medio | 16 | Próxima semana |
| Bajo | 12 | Backlog |
