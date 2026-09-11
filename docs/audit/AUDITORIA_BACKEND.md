# Auditoría Exhaustiva — Backend BI 0 A 100

> **Alcance:** `backend/src/**` (Express + TypeORM + PostgreSQL + Redis + BullMQ + Anthropic SDK)
> **Fecha:** 2026-04-23
> **Método:** 2 sub-agentes paralelos (Seguridad/API + Arquitectura/Datos/DevOps), consolidado.
> **Estado base:** refactor post-`AUDITORIA_ARQUITECTURA.md` aplicado (Zod, sanitizeForLLM, XML prompts, JWT guard).

Severidades: **CRÍTICA** (explotable en prod / corrupción datos) · **ALTA** (fuga o vector real, mitigable) · **MEDIA** (deuda con riesgo) · **BAJA** (calidad / DX).

---

## 1. Seguridad

### 1.1 JWT

| # | Severidad | Hallazgo | Ubicación | Acción |
|---|-----------|----------|-----------|--------|
| S1 | CRÍTICA | `jwt.verify()` se llama sin `algorithms: ['HS256']` → vulnerable a JWT confusion attacks si algún día se introduce una clave pública/asimétrica. | `middleware/auth.ts:16` | `jwt.verify(token, secret, { algorithms: ['HS256'] })` |
| S2 | ALTA | Logout no invalida el access token. El refresh hash se borra, pero el AT sigue vivo hasta 24 h. No hay blacklist Redis ni versionado. | `routes/auth.ts` (handler logout) + `middleware/auth.ts:16` | Introducir `pwd_reset`-like `token_blacklist:{jti}` con TTL = `exp - now`. Añadir `jti` al firmar. |
| S3 | MEDIA | Startup guard advierte en dev pero no bloquea si JWT débil. Error silencioso en staging si `NODE_ENV` no está seteado. | `app.ts:31-50` | Bloquear también cuando `NODE_ENV !== 'development'` (tratar staging como prod). |
| S4 | MEDIA | `JWT_REFRESH_SECRET` usado sin validación de longitud. | `services/billing/stripeService.ts:68` (uso), `app.ts:31-50` (guard) | Extender `assertCriticalSecrets()` para cubrir `JWT_REFRESH_SECRET`. |

### 1.2 Rate limiting y abuso

| # | Severidad | Hallazgo | Ubicación | Acción |
|---|-----------|----------|-----------|--------|
| S5 | CRÍTICA | `POST /auth/reset-password` **no** tiene rate-limiter. Solo lo tienen `signup`, `login`, `forgot-password`. | `routes/auth.ts:15-19` (authLimiter no aplicado a reset) | Aplicar `authLimiter` a `/reset-password`. |
| S6 | ALTA | Endpoints IA (`/mercado/analizar`, `/brief/analizar`, etc.) solo tienen plan-gating (cuota absoluta), no rate-limit **de frecuencia**. Plan Pro/Business = `-1` (ilimitado) permite 1000 jobs en paralelo → drena créditos Anthropic. | `routes/{mercado,brief,marketing,proveedores,finanzas}.ts` | `rateLimit({ windowMs: 5*60*1000, max: 10, keyGenerator: req => req.userId })` por cada `/analizar`. |
| S7 | MEDIA | Stripe webhook no verifica `event.id` vs dedup-set → retries pueden duplicar la suscripción / crédito. | `routes/billing.ts:137-162` | Redis `SETNX stripe:evt:{id} 1 EX 86400`. Si existe, devolver 200 sin procesar. |

### 1.3 Validación y uploads

| # | Severidad | Hallazgo | Ubicación | Acción |
|---|-----------|----------|-----------|--------|
| S8 | ALTA | `multer` filtra solo por `file.mimetype.startsWith('image/')` — trivialmente spoofeable. Sin validación de magic bytes ni re-encode. | `middleware/upload.ts:8` | `npm i file-type sharp`; validar los primeros bytes con `fileTypeFromBuffer` y re-encode con sharp para destripar metadatos (EXIF, XMP). |
| S9 | ALTA | `POST /productos` inserta body directo sin schema Zod (ya existe `ProductoInputSchema` en `schemas/`). Acepta números negativos, strings en campos numéricos, payload con campos desconocidos. | `routes/productos.ts` | Cablear `validate(ProductoInputSchema)` (update ruta + normalizar nullables como en `routes/mercado.ts`). |
| S10 | MEDIA | Mezcla `Zod` (mercado) + `express-validator` (auth, brief, admin, productos). Superficie de bugs. | múltiples | Completar el paso 2 del plan: `validate(schema)` en las 5 rutas restantes. |
| S11 | MEDIA | `competidores_conocidos` acepta union array\|string pero el orchestrator solo consume string. Si un día el frontend manda array, `competidoresStr` lo aplana a CSV — pierde `tipo`/`categoria_overlap`. | `routes/mercado.ts` | Propagar estructura completa al orchestrator; degradar a CSV solo al interpolar en prompt. |

### 1.4 CORS / Headers / Prompt injection

| # | Severidad | Hallazgo | Ubicación | Acción |
|---|-----------|----------|-----------|--------|
| S12 | MEDIA | `allowedOrigin = process.env.FRONTEND_URL ?? 'http://localhost:3000'`. Si la env var se corrompe a `*` o a un dominio atacante, CORS abierto. | `app.ts:61-67` | Validar formato URL al arranque; en prod, rechazar si no apunta a `https://`. |
| S13 | BAJA | Helmet con defaults — no hay `Content-Security-Policy` explícita ni `Strict-Transport-Security` personalizada. | `app.ts:57` | `helmet({ contentSecurityPolicy: { directives: ... }, hsts: { maxAge: 31536000 } })`. |
| S14 | VERIFICADO | Los 6 servicios IA post-refactor usan `system` prompt + XML `treat_as="data_only"` + `sanitizeForLLM()`. `posicionamientoService` y `sensibilidadService` son 100% deterministas (sin LLM) → no requieren hardening. | `services/*/` | — |

---

## 2. Autenticación y autorización

| # | Severidad | Hallazgo | Acción |
|---|-----------|----------|--------|
| A1 | ALTA | `dashboard.ts` y `events.ts` no fueron revisados ruta por ruta para confirmar que todo `GET /:id` filtra por `usuario_id` (IDOR). Las rutas de `mercado`, `productos`, `brief` sí lo hacen. | Auditoría línea-por-línea + agregar tests que intenten acceder a recursos de otro usuario (supertest). |
| A2 | MEDIA | `requireAdmin` (auth.ts) re-consulta DB en cada request. Sin caché. Añade latencia y carga de DB. | Cachear `role` por `userId` en Redis con TTL 60 s (invalidar al modificar usuario). |
| A3 | BAJA | Password reset valida fuerza (8+mayus+num+special), pero no rechaza contraseñas filtradas (HaveIBeenPwned). | Opcional: integrar `k-Anonymity` HIBP API o lista `top10k-passwords.txt`. |

---

## 3. Arquitectura y flujo de análisis

| # | Severidad | Hallazgo | Ubicación | Acción |
|---|-----------|----------|-----------|--------|
| AR1 | CRÍTICA | **Cero uso de `AppDataSource.transaction()`**. Las escrituras de resultado son `repo.update(id, { tendencias_data, dafo_data, ..., estado_analisis: 'completado' })` — si el proceso muere a mitad (8 campos JSONB), la fila queda en estado inconsistente (`procesando` con algunos campos llenos). | `services/mercado/mercadoOrchestrator.ts:151-167` y los 4 orchestrators hermanos | Envolver el `update` final en `dataSource.transaction(async tx => tx.getRepository(X).update(...))`. |
| AR2 | ALTA | **Fire-and-forget con silencio total**: `enviarAnalisisCompleto(...).catch(() => {})` en 5 orchestrators. Fallas de email, fallas de Sentry, fallas de SDK — invisibles. | `mercadoOrchestrator.ts:185`, `marketingOrchestrator.ts:115`, `proveedoresOrchestrator.ts:76`, `briefOrchestrator.ts:40`, `finanzasOrchestrator.ts` | `.catch((err) => { console.error('[email-fail]', { analisisId, err: err.message }); Sentry.captureException(err); })`. |
| AR3 | ALTA | **No hay idempotency** en `POST /analizar`. Doble-clic del usuario = 2 análisis + 2 cobros de crédito Anthropic. El plan-check corre entre ambos (race). | todas las rutas `/analizar` | Redis `SET analisis:lock:{userId}:{productoId} 1 NX EX 30`. Si existe, devolver 409 con el `analisis_id` en curso. |
| AR4 | ALTA | `/api/health` devuelve `{ status: 'ok' }` sin tocar DB/Redis. Railway lo considera sano aunque DB esté caída. | `app.ts:92-94` | Ping real: `SELECT 1` a DB + `redis.ping()`. Responder 200 solo si ambos pasan; 503 si alguno falla. |
| AR5 | ALTA | **No hay graceful shutdown**. `process.on('SIGTERM'/'SIGINT')` inexistente. En deploy Railway corta el proceso: jobs in-flight de BullMQ se reinician, requests en vuelo devuelven ECONNRESET, conexiones a DB/Redis quedan zombi. | `app.ts` (fin del archivo) | Instalar `http-terminator` + listener SIGTERM que: (1) stop aceptar nuevas conexiones, (2) drain pool TypeORM, (3) `worker.close()`, (4) `redisClient.quit()`, (5) exit(0). |
| AR6 | MEDIA | Worker BullMQ marca error solo tras 3 reintentos. Durante reintentos, el registro permanece en `procesando` indefinidamente desde la perspectiva del usuario. | `workers/analysisWorker.ts:84-99` | Escribir `estado_analisis = 'retry'` con contador, y `'error'` al agotar reintentos. Frontend puede mostrar "Reintentando (2/3)". |

---

## 4. Capa de datos (TypeORM)

| # | Severidad | Hallazgo | Ubicación | Acción |
|---|-----------|----------|-----------|--------|
| D1 | ALTA | **JSONB con `as unknown as object`** — casts brutales pierden el tipo. Cualquier refactor del shape en el servicio pasa silencioso al DB. | `mercadoOrchestrator.ts:152-167` (8 campos), `finanzasOrchestrator.ts:31-34` (4 campos) | Tipar las columnas: `@Column('jsonb') tendencias_data: TendenciasResult \| null;`. Remover los casts. |
| D2 | MEDIA | Índices en `(usuario_id, producto_id)` y `estado_analisis` ✓. **Falta `fecha_creacion`** — se usa para `ORDER BY fecha_creacion DESC` en listados. Full-table scan en Pro/Business con cientos de análisis. | `models/Analisis*.ts` | `@Index(['usuario_id', 'fecha_creacion'])` compuesto. |
| D3 | MEDIA | `synchronize` habilitado en dev si `TYPEORM_SYNCHRONIZE=true`. En prod está apagado por guard, pero el flag existe → riesgo operacional si se mueve a prod. | `config/database.ts:21` | Hardcodear `synchronize: false` para `NODE_ENV === 'production'` sin posibilidad de override. |
| D4 | MEDIA | Solo 2 migraciones (`UpdateIndexes`, `MercadoFase1Columns`). El resto del schema se creó por sync. Si alguien levanta un ambiente limpio con `synchronize=false`, el schema no existe. | `migrations/` | `typeorm migration:generate -n Baseline -d config/database.ts` para capturar el estado actual. |
| D5 | BAJA | `email VARCHAR` sin `@Index({ unique: true })` explícito (es candidato natural para búsqueda login). | `models/Usuario.ts` | Verificar + añadir si falta. |

---

## 5. Redis / BullMQ / Workers

| # | Severidad | Hallazgo | Ubicación | Acción |
|---|-----------|----------|-----------|--------|
| W1 | ALTA | Dos clientes Redis coexisten (`redisClient` via ioredis simple + `bullRedisConnection` con `maxRetriesPerRequest: null`). Si uno falla y el otro no, estado parcial. | `config/redis.ts:3-5`, `workers/analysisQueue.ts:5` | Unificar en un módulo `redis.ts` que exporta ambos roles desde un solo cliente (o dos con misma config de reconnect). |
| W2 | MEDIA | BullMQ sin `removeOnComplete` — la cola crece indefinidamente en Redis. | `workers/analysisQueue.ts:14-19` | `defaultJobOptions: { removeOnComplete: { age: 7*24*3600, count: 5000 } }`. |
| W3 | MEDIA | Sin caché de resultados deterministas (trends, competencia) — cada análisis del mismo producto gasta API externa. | servicios `tendenciasService`, `competenciaService` | Redis cache con clave `trends:{categoria}:{estado}` TTL 12 h. |

---

## 6. Observabilidad

| # | Severidad | Hallazgo | Ubicación | Acción |
|---|-----------|----------|-----------|--------|
| O1 | ALTA | Logs `console.log` planos, sin JSON estructurado, sin `correlationId`. En Railway/Vercel = grep imposible bajo carga. | 25+ archivos | Instalar `pino` (dev) + `pino-http` (req). Middleware que inyecta `req.id = uuid()` y lo propaga a servicios vía AsyncLocalStorage. |
| O2 | MEDIA | Sentry solo captura en el handler global. Los orchestrators tragan errores en `.catch()` sin reportar. | `app.ts:98-103` + orchestrators | Ver AR2. Además instrumentar `Sentry.startTransaction` por cada `/analizar`. |
| O3 | MEDIA | Sin métricas Prometheus ni OTEL. Sin percentiles de latencia por endpoint. | — | `prom-client` + endpoint `/api/metrics` (auth con token interno o IP allow-list). |
| O4 | BAJA | `railway.toml` healthcheck `/api/health` con timeout 300 s. Exagerado — una request sana responde en <50 ms. | `railway.toml` | Bajar a `healthcheckTimeout = 10`. |

---

## 7. Testing

| # | Severidad | Hallazgo | Acción |
|---|-----------|----------|--------|
| T1 | ALTA | Solo 5 archivos de test, todos de servicios **puros** (planService, proyeccion, etc.). **Cero tests de orchestrators, rutas, middleware, Zod schemas, workers**. | Añadir suite Supertest para cada ruta `/analizar` (mock Anthropic + DB en-memory SQLite para los modelos simples, o contenedor PG para integración). |
| T2 | ALTA | 3 tests actualmente **fallan** (`planService.test.ts`): esperan `pro.max_productos = 10`, real es `5`. CI no existe → nadie lo nota. | Actualizar expectativas en el test a `5`. |
| T3 | MEDIA | Sin test de `sanitizeForLLM` (util crítico recién creado). | Crear `__tests__/utils/sanitizeForLLM.test.ts` cubriendo: injection patterns, XML stripping, límite `maxLen`, control chars, template injection. |
| T4 | MEDIA | Sin test de `parseLLMJson` / `parseLLMJsonArray`. | Ídem en `__tests__/middleware/validate.test.ts` con fixtures de respuesta Claude mal formada, envuelta en prosa, triple-fence, etc. |

---

## 8. DevOps / CI / Docker

| # | Severidad | Hallazgo | Ubicación | Acción |
|---|-----------|----------|-----------|--------|
| DO1 | MEDIA | `Dockerfile` (dev) sin multi-stage → imagen pesada. | `backend/Dockerfile` | Copiar la estructura de `Dockerfile.prod` con solo el stage de dev. |
| DO2 | MEDIA | `CLAUDE.md` referencia `.github/workflows/ci.yml` + `deploy.yml`. Confirmar que realmente corren `typecheck` + `tests` en cada PR. Si los tests fallan (T2), ¿el PR se bloquea? | `.github/workflows/ci.yml` | Auditar workflow; añadir `npm run typecheck && npm test` como required status check en branch protection. |
| DO3 | BAJA | `Dockerfile.prod` correcto (multi-stage, user no-root, healthcheck). Pero no corre `npm audit --production` en build → no se detectan CVEs de deps. | `Dockerfile.prod` | Añadir `RUN npm audit --omit=dev --audit-level=high` como paso falible. |

---

## 9. Deuda técnica

| # | Severidad | Hallazgo | Ubicación |
|---|-----------|----------|-----------|
| DT1 | MEDIA | 9 usos de `any` (`marketingOrchestrator:36`, `analysisWorker:84`, etc.). |  |
| DT2 | MEDIA | Lógica repetida en los 5 orchestrators: crear → validar → queue → SSE → error. | Extraer `withAnalysisTracking<T>(module, fn)` helper. |
| DT3 | BAJA | `JSON.parse(JSON.stringify(analisis))` para clonado profundo en freemium gate → costoso y frágil. | `routes/mercado.ts:104`. Usar `structuredClone`. |

---

## Top 15 acciones (orden de ejecución)

| # | ID | Severidad | Acción | Esfuerzo |
|---|----|-----------|--------|----------|
| 1 | S1 | CRÍTICA | `jwt.verify(..., { algorithms: ['HS256'] })` | 10 min |
| 2 | S5 | CRÍTICA | `authLimiter` en `/reset-password` | 5 min |
| 3 | AR1 | CRÍTICA | Envolver writes finales de orchestrators en `dataSource.transaction()` | 4 h |
| 4 | AR5 | ALTA | Graceful shutdown (SIGTERM → drain) | 2 h |
| 5 | AR4 | ALTA | `/api/health` real: DB ping + Redis ping | 45 min |
| 6 | AR3 | ALTA | Idempotency Redis lock en `/analizar` | 2 h |
| 7 | AR2 | ALTA | `.catch(...)` con `Sentry.captureException` + log | 1 h |
| 8 | S8 | ALTA | Multer: `file-type` magic bytes + re-encode con `sharp` | 2 h |
| 9 | S6 | ALTA | Rate-limit de frecuencia en `/analizar` (IA) | 1 h |
| 10 | S9 | ALTA | `validate(ProductoInputSchema)` en `POST /productos` | 1 h |
| 11 | D1 | ALTA | Tipar columnas JSONB, eliminar `as unknown as object` | 2 h |
| 12 | T1 | ALTA | Suite Supertest básica para rutas `/analizar` | 6 h |
| 13 | S7 | MEDIA | Dedup de webhooks Stripe en Redis | 45 min |
| 14 | S2 | MEDIA | Blacklist Redis de JWT al logout | 2 h |
| 15 | O1 | MEDIA | Logs JSON estructurados con `pino` + correlationId | 4 h |

**Esfuerzo total ítems 1-10 (bloque crítico+alta prioridad inmediata): ~13 h.**

---

## Fortalezas confirmadas

- Separación de capas (service puro / orchestrator / route) sostenida en 5 módulos.
- `helmet`, `cors` estricto, `express-rate-limit` global, startup guard de `JWT_SECRET`.
- Refactor de prompt injection **completo** en los 6 servicios con LLM.
- Plan-enforcement consistente vía factory `requireCanRunAnalisis`.
- Refresh token hasheado (bcrypt) en DB, reset-password single-use con TTL Redis.
- Stripe webhook firmado antes de procesar.
- BullMQ con reintentos exponenciales (3 × 5s→10s→20s).
- Multi-stage Dockerfile.prod, usuario no-root, healthcheck configurado en Railway.
- TypeORM con índices ya presentes en `(usuario_id, producto_id)` + `estado_analisis`.

El backend tiene **cimientos sólidos**. La brecha mayor no es "falta de seguridad" sino **falta de atomicidad transaccional + graceful shutdown + observabilidad**: los 3 problemas que solo se manifiestan bajo carga real o durante deploys. Los ítems 1-7 del Top 15 cierran esa brecha en un día de trabajo.
