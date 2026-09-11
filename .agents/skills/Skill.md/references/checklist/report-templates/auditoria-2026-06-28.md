# Informe de Auditoría — BI 0 A 100
Fecha: 2026-06-28 · Auditor: code-auditor

## 1. Resumen ejecutivo
- Estado general: ámbar
- Hallazgos: 1 críticos · 3 altos · 4 medios · 3 bajos
- Riesgo principal: el webhook de Stripe no es idempotente ni resiste eventos fuera de orden, y no hay degradación automática de planes vencidos — combinados, permiten estados de suscripción incorrectos (acceso de pago perpetuo o reactivación de planes cancelados).

> Alcance revisado en esta pasada: `backend/src/middleware/{auth,requirePlan,idempotency}.ts`, `backend/src/services/billing/{planService,stripeService}.ts`, `backend/src/routes/{productos,billing}.ts`, `backend/src/app.ts` (montaje del raw body) y `frontend/lib/api.ts`. No se revisaron aún los orchestrators de análisis, workers BullMQ, ni el resto de routers de herramientas (pos/inventario/contabilidad/nómina). Los hallazgos sobre esas áreas quedan pendientes de una segunda pasada.

## 2. Hallazgos

| ID  | Severidad | Categoría      | Ubicación | Descripción | Esfuerzo |
|-----|-----------|----------------|-----------|-------------|----------|
| F1  | Crítica   | Seguridad      | `backend/src/routes/billing.ts:165` | `handleStripeEvent` no es idempotente ni ordena por tiempo. Stripe entrega *at-least-once* y sin orden garantizado. Un `customer.subscription.updated` reenviado/retrasado tras un `customer.subscription.deleted` reactiva un plan cancelado; un reenvío de `checkout.session.completed` reprocesa sin control. No hay tabla de eventos procesados (`event.id`) ni comparación de `current_period_end`/timestamp. | M |
| F2  | Alta      | Seguridad      | `backend/src/middleware/auth.ts:18` + `frontend/lib/api.ts:5` | La autenticación usa cookies (`withCredentials: true`, `req.cookies.access_token`) pero no se observa protección CSRF (token CSRF ni verificación de origen) en rutas POST/DELETE que mutan estado. Si la cookie no es `SameSite=Strict/Lax` + no hay anti-CSRF, queda expuesto a CSRF. **Verificar** dónde y con qué flags se emite la cookie antes de cerrar. | M |
| F3  | Alta      | Flujo/Negocio  | `backend/src/middleware/requirePlan.ts:15` (`getPlanFromDB`) | El plan se lee directo de la columna `plan`; `plan_expires_at` nunca se evalúa. Si el webhook `subscription.deleted` se pierde (F1) o no hay cron de expiración, un usuario conserva Pro/Business indefinidamente tras vencer/cancelar. No existe job de degradación de planes vencidos. | M |
| F4  | Alta      | Implementación | `backend/src/routes/billing.ts:184-205` | No se manejan `invoice.payment_failed` ni `invoice.payment_succeeded`. Un pago fallido no degrada al usuario hasta que (si acaso) llegue un `subscription.updated` con estado no activo. Riesgo de acceso de pago sin cobro efectivo. | S |
| F5  | Media     | Flujo          | `backend/src/middleware/idempotency.ts:30` | El lock se construye con `req.userId`, pero `requireAnalisisLock` corre antes de resolver `cuentaEfectivaId`. Dos trabajadores distintos sobre el mismo producto del mismo owner usan claves de lock distintas → pueden lanzar análisis en paralelo y burlar el límite efectivo del owner (el conteo final sí es por owner, pero el lock anti-doble-clic no). | S |
| F6  | Media     | Seguridad      | `backend/src/routes/billing.ts:155-160` | Si `handleStripeEvent` lanza, se responde `500`. Stripe reintentará (bien), pero combinado con F1 (sin idempotencia) cada reintento reejecuta efectos parciales. La respuesta `500` debe reservarse a fallos transitorios; errores de datos no recuperables deberían `200`-ackear tras loguear para no entrar en bucle de reintentos. | S |
| F7  | Media     | Flujo          | `frontend/lib/api.ts:22-25` | En fallo de refresh solo se borra `localStorage.removeItem('usuario')`; los tokens viven en cookies httpOnly que no se limpian aquí (correcto que no se toquen), pero no hay llamada a un endpoint de logout que invalide la cookie/`jti`. El usuario queda "deslogueado" en UI con sesión potencialmente viva en backend. | S |
| F8  | Media     | Implementación | `backend/src/services/billing/stripeService.ts:6` | `apiVersion: '2023-10-16'` está fijada y desactualizada. En versiones recientes `current_period_end` se movió a nivel de *item* de suscripción; al actualizar la API, `sub['current_period_end']` (billing.ts:192) devolverá `undefined` y `plan_expires_at` quedará inválido. Deuda de mantenimiento con efecto silencioso. | S |
| F9  | Baja      | Calidad        | `backend/src/routes/billing.ts:169-216` | `event.data.object as unknown as StripeObj` descarta el tipado de Stripe en todo el handler; cualquier cambio de forma del payload pasa desapercibido. Usar los tipos `Stripe.Checkout.Session` / `Stripe.Subscription` recupera verificación en compilación. | M |
| F10 | Baja      | Calidad        | `backend/src/routes/billing.ts:61,105,130` | Bloques `catch` que colapsan a `'Error interno'`/devuelven `err.message` al cliente. Devolver `err.message` crudo (checkout/portal) puede filtrar detalles internos de Stripe; centralizar en un handler de errores y loguear con contexto. | S |
| F11 | Baja      | Implementación | `backend/src/routes/productos.ts:104-121` | `GET /productos/:id` hace `findOneBy({ id })` sin `status` y luego filtra en memoria; menor, pero permite distinguir "existe pero archivado" vs "no existe" por temporización. Cosmético. | S |

## 3. Plan de mitigación por fases

### Fase 0 — Contención (inmediato)
- Objetivo: garantizar que el estado de suscripción no pueda corromperse por reentregas/orden de Stripe.
- Tareas:
  - **F1**: añadir tabla `stripe_event` (PK = `event.id`) e insertar dentro de la misma transacción que el `update`; si el id ya existe, ackear `200` y salir. Para `subscription.*`, aplicar solo si el `current_period_end`/`created` del evento es ≥ al último persistido (descarta eventos viejos).
  - **F6**: en `handleStripeEvent`, separar errores transitorios (DB caída → `500` para reintento) de errores de datos (→ loguear + `200`).
- Criterio de hecho: reenviar el mismo evento dos veces (Stripe CLI `stripe events resend`) deja el plan idéntico; un `updated` antiguo tras `deleted` no reactiva el plan. Test de integración del handler con eventos duplicados/desordenados.
- Riesgo si no se aborda: usuarios con plan de pago activo sin suscripción válida, o cancelados que recuperan acceso → pérdida de ingresos y datos de facturación inconsistentes.

### Fase 1 — Seguridad y flujos
- Objetivo: cerrar CSRF, expiración de planes y pagos fallidos.
- Tareas:
  - **F2**: confirmar flags de la cookie de sesión (`SameSite`, `Secure`, `httpOnly`); si la app depende de cookies cross-site, añadir token anti-CSRF o verificación de `Origin`/`Referer` en mutaciones.
  - **F3**: cron/worker diario que degrade a `freemium` los usuarios con `plan_expires_at < now()` y sin suscripción activa; o evaluar `plan_expires_at` en `getPlanFromDB`.
  - **F4**: manejar `invoice.payment_failed` (marcar `past_due`/degradar tras N intentos) e `invoice.paid`.
  - **F5**: mover `requireAnalisisLock` después de `resolveCuentaEfectiva` y construir la clave con `cuentaEfectivaId` + `productoId`.
  - **F7**: endpoint de logout que añada `jti` a `deny:` e invalide la cookie; llamarlo en el fallo de refresh.
- Criterio de hecho: petición CSRF simulada falla; usuario con `plan_expires_at` vencido pierde acceso al siguiente request; pago fallido degrada; dos trabajadores no lanzan análisis simultáneos.
- Riesgo si no se aborda: acceso indebido, abuso de límites de plan y sesiones no revocables.

### Fase 2 — Limpieza (huérfanos / código muerto)
- Objetivo: confirmar que no hay exports/dependencias sin uso.
- Tareas: pendiente de segunda pasada — ejecutar `ts-prune`/`depcheck` en `backend/` y `frontend/` y revisar orchestrators/workers no cubiertos aquí.
- Criterio de hecho: `depcheck` sin dependencias declaradas-no-usadas; `ts-prune` sin exports muertos relevantes.
- Riesgo si no se aborda: superficie de mantenimiento mayor (bajo).

### Fase 3 — Optimización
- Objetivo: reducir deuda de tipado y consultas.
- Tareas:
  - **F8**: planificar subida de `apiVersion` de Stripe con ajuste de `current_period_end`.
  - **F9**: tipar el handler con los tipos oficiales de Stripe.
  - Revisar (segunda pasada) los `count()` de `billing.ts:36-42` (5 consultas en paralelo, aceptable) frente a una agregación única como ya se hace en `dashboard`.
- Criterio de hecho: `tsc --noEmit` sin `as unknown` en billing; subida de API probada en staging.
- Riesgo si no se aborda: roturas silenciosas al actualizar Stripe (medio).

### Fase 4 — Robustez (tests, docs, observabilidad)
- Objetivo: cubrir los caminos críticos no testeados.
- Tareas:
  - Tests del handler de webhook (idempotencia, orden, pagos fallidos) — hoy excluidos por requerir DB; extraer la lógica de decisión a una función pura testeable.
  - **F10**: handler de errores centralizado que no filtre `err.message` de Stripe al cliente.
  - **F11**: ajustar `GET /productos/:id` a `findOne` con `status` en el `where`.
  - Alertas/observabilidad sobre fallos de webhook (ya hay patrón Sentry condicional).
- Criterio de hecho: cobertura del handler de billing > 0 con casos de duplicado/desorden; respuestas de error sin detalles internos.
- Riesgo si no se aborda: regresiones en facturación difíciles de detectar (medio).

## 4. Recomendaciones a futuro
- Extraer la lógica de decisión de `handleStripeEvent` a una función pura (`resolveSubscriptionState(event, current)`) en `services/billing/` para que entre en la suite Jest de servicios puros, igual que el resto de módulos.
- Considerar persistir un `webhook_log` aunque sea mínimo, como fuente de verdad para reconciliación con Stripe.
- Verificar en una segunda pasada los routers de herramientas sensibles (`nomina`, `contabilidad`, `finanzas`) contra `requireToolCapability` y la unión de permisos de `computePermisosEfectivos`, que es la pieza de autorización más delicada del sistema.
