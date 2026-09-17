# CLAUDE.md — Contexto y Guía Canónica de Ingeniería (BI 0 A 100)

Este documento es la **fuente única de verdad técnica** para Claude, Antigravity, Cursor y cualquier agente de inteligencia artificial o desarrollador que trabaje en el repositorio **BI 0 A 100**. Debe mantenerse actualizado ante cualquier cambio arquitectónico.

---

## 1. Visión del Proyecto y Lógica de Negocio

**BI 0 A 100** es una plataforma SaaS B2B que valida la viabilidad comercial, operativa y legal de un negocio o producto en **2 a 3 minutos**.

### Módulos de Análisis (6 Módulos)
1. **Mercado**: Viabilidad, cálculo de TAM/SAM/SOM, competencia y posicionamiento.
2. **Marketing**: Propuesta de valor, canales de captación, copies y cronogramas.
3. **Proveedores**: Directorio de suministros, comparativa de costos y RFQs.
4. **Finanzas**: Punto de equilibrio, márgenes, flujo proyectado y simulador de escenarios.
5. **Legal**: Cumplimiento normativo, contratos sugeridos, propiedad intelectual y riesgos.
6. **Brief**: Diagnóstico y brief ejecutivo integral (a diferencia de los otros 5 módulos, su cuota es **global por cuenta** y no por producto). Implementado con **Claude Sonnet 5** (`@anthropic-ai/sdk`).

---

## 2. Topología de Servicios y Puertos

| Servicio | Entorno | Puerto Host | Puerto Contenedor | URL / Endpoint |
|---|---|---|---|---|
| **Frontend (Next.js)** | Dev / Prod | `3000` | `3000` | `http://localhost:3000` |
| **Backend (Express)** | Dev / Prod | `3001` | `3001` | `http://localhost:3001` |
| **Health Check** | Todo | `3001` | `3001` | `http://localhost:3001/health` (503 si Postgres o Redis no responden) |
| **Métricas Prometheus** | Todo | `3001` | `3001` | `http://localhost:3001/metrics` (en prod exige `METRICS_TOKEN`; sin él responde 404) |
| **Prometheus Server** | Todo | `9090` | `9090` | `http://localhost:9090` |
| **PostgreSQL 15** | Todo | `5432` | `5432` | `postgresql://bi0a100_user:bi0a100_password@localhost:5432/bi0a100_db` |
| **Redis 7 (AOF)** | Todo | `6379` | `6379` | `redis://localhost:6379` (interno Docker: `redis:6379`) |

> [!NOTE]
> En entornos Docker, los puertos están vinculados a `127.0.0.1` para garantizar su aislamiento detrás de un reverse proxy (Nginx, Traefik, Caddy o Cloudflare Tunnel).

---

## 3. Stack Tecnológico Exacto

### Requisitos del Sistema
- **Node.js**: `>= 20.9.0` (LTS recomendado).
- **npm**: `>= 10.0.0`.

### Backend (`/backend`)
- **Runtime & Servidor**: Node.js 20 + Express 4.18 + TypeScript 5 (CommonJS, `dist/app.js`).
- **ORM & DB**: TypeORM 0.3 + PostgreSQL 15 (`AppDataSource` en `src/config/database.ts`).
  - **Identificadores**: Todas las entidades usan **UUID v4** como cadenas (`@PrimaryGeneratedColumn('uuid')`). **Prohibido usar `parseInt()`**.
- **Colas y Tareas en Segundo Plano**: BullMQ 5 + ioredis 5 (`src/workers/analysisQueue.ts` y `src/workers/analysisWorker.ts`). BullMQ exige ioredis; el resto (auth, denylist, locks, rate limit, SSE pub/sub) usa `redis` (node-redis) de `config/redis.ts`. Los dos clientes son deliberados. Solo se reintentan errores transitorios (`utils/erroresTransitorios.ts`).
- **Dependencias dobles conocidas**: `resend` + `nodemailer` (SMTP como alternativa en `emailService`), `express-validator` (admin, billing, equipo, marca, vertical) + `zod` (resto; preferir zod en código nuevo).
- **Inteligencia Artificial**: `@anthropic-ai/sdk` 0.125, modelo por tarea (Haiku 4.5 / Sonnet 5 / Opus 5, ver *Modelos de IA*) con fallback determinista estructurado y validación Zod.
- **Seguridad & Auth**: JWT (Access Token 15 min, Refresh Token 7 días), revocación en Redis vía `deny:${jti}`, `bcryptjs`, Helmet, CORS parametrizado y `cookie-parser`.
- **Subida de Archivos**: Multer en memoria RAM (`memoryStorage()`), límite estricto de 50 MB para grabaciones de voz/video, subida directa a AWS S3 mediante `@aws-sdk/client-s3`.
- **Observabilidad**: Morgan + exportador Prometheus propio (`utils/metrics.ts`, etiquetas `method`/`path`/`status_code`, `normalizePath()` para UUIDs) + `@sentry/node` inicializado en `initializeApp` si hay `SENTRY_DSN` (reportar siempre con `reportarError` de `config/sentry.ts`).

### Frontend (`/frontend`)
- **Framework**: Next.js 16 (React 19, Turbopack, App Router, `output: 'standalone'`).
- **Estilos & UI**: Tailwind CSS + Lucide React Icons.
- **Animaciones**: GSAP 3 (GreenSock) en auth y landing (optimizadas con `requestAnimationFrame` sin forzar re-renders de React) y `framer-motion` en el dashboard (~55 componentes). `react-is` es dependencia de pares de `recharts`: no quitarla.
- **Gestión de Estado**: Zustand (`analysisStore.ts`) para estado global de análisis + React Context para temas.
- **Cliente HTTP**: Axios centralizado (`lib/api.ts` y `lib/config.ts`) con interceptores para rotación automática de JWT, detección de desconexión y `AbortController`.
- **Sin proxy en Next**: el navegador llama al API con `NEXT_PUBLIC_API_URL` (absoluta). El refresh token va en la cookie HttpOnly `bi_refresh` (`Path=/api/auth`), así que frontend y API deben compartir dominio registrable (`app.tudominio.com` + `api.tudominio.com`); el access token (15 min) va en `localStorage`. SSE usa ticket de un solo uso (`POST /api/events/ticket`), nunca el JWT en la URL.

### Infraestructura & Docker
- **Docker Compose v2**: Especificación moderna sin tag `version:`.
- **Red**: Red puente dedicada `bi0a100-network`.
- **Init System**: `dumb-init` en todas las imágenes de desarrollo y producción para propagación instantánea de señales `SIGTERM`/`SIGINT`.
- **Seguridad de Contenedores**: Usuarios no privilegiados (`nodejs` / `nextjs`, uid 1001) y archivos `.dockerignore` estrictos en la raíz, `/backend` y `/frontend`.

---

## 4. Flujo de Trabajo Asíncrono (BullMQ)

```
[Usuario/Frontend] 
       │ 1. POST /api/:modulo/:productoId
       ▼
[Backend Router] ──> 2. Middleware requireCanRunAnalisis (comprueba cuota del plan)
       │ 
       ▼ 3. Crea registro en DB (estado: 'procesando')
       │ 4. Encola trabajo en BullMQ ('analysis-queue')
       ▼ 5. Retorna HTTP 202 Accepted { analisis_id }
[Frontend] ──> 6. Polling continuo cada 2s (GET /api/:modulo/:id/status)
       │
[BullMQ Worker] ──> 7. Ejecuta análisis (IA / Algoritmos financieros / Scrapers)
       │ 8. Actualiza entidad en DB (estado: 'completado' o 'fallido')
       ▼
[Frontend] ──> 9. Recibe status 'completado' y renderiza dashboard interactivo
```

---

## 5. Roles y Multi-Inquilino (Multi-Tenancy)

- **`owner` (Dueño)**: Acceso total a la organización. Crea y edita productos, administra planes de facturación (Stripe), invita miembros del equipo y asigna herramientas.
- **`trabajador` (Colaborador)**: Vinculado a un propietario mediante `AsignacionTrabajador`. Acceso de lectura o acotado a los productos y herramientas autorizadas.
- **`admin` (Superadministrador)**: Usuario con bandera `es_admin = true`. Acceso a métricas globales y administración de cuentas en `/api/admin`.

### Cuotas por Plan
- **Freemium (Gratis)**: 1 análisis por módulo por producto; 5 créditos de IA al mes para acciones bajo demanda.
- **Pro (Emprendedor) / Pro+ (Negocio) / Business (Empresa) / Enterprise**: 20 / 60 / 120 / 600 créditos de IA al mes (`creditos_ia_mes` en `planService.ts`). Cada acción cuesta créditos según `COSTO_CREDITOS` (`services/billing/creditosIA.ts`); sin créditos la API responde **402** con `upgrade_required`.
- Los análisis con estado `'error'` o `resultado_estimado = true` (la IA cayó a plantilla) **no consumen cuota** y sus créditos se reembolsan.
- Precios en MXN con IVA incluido: ver `docs/pricing/PROPUESTA_PLANES_2026-09.md`.

### Modelos de IA
Toda llamada a Claude pasa por `crearMensaje(seccion, tarea, params)` de `backend/src/config/anthropic.ts` (nunca `new Anthropic()` en un servicio): `mecanica` → Haiku 4.5, `estrategia`/`extensa` → Sonnet 5, `critica` → Opus 5. Cada llamada queda en `uso_ia` con su costo. Claves: `docs/deployment/CLAVES_IA.md`.

---

## 6. Catálogo de Rutas Backend (26 Módulos API)

Montadas en `backend/src/app.ts`:
1. `/api/auth`: Signup, login (rate limited), refresh token, logout, me, reset-password.
2. `/api/billing`: Planes, checkout session Stripe, webhook HMAC, suscripción, portal.
3. `/api/productos`: CRUD de productos, logotipos, archivos multimedia y archivado.
4. `/api/mercado`: Análisis de mercado, competidores, viabilidad.
5. `/api/marketing`: Estrategia de marketing, copies, buyer personas.
6. `/api/finanzas`: Modelado financiero, márgenes, simulador de escenarios.
7. `/api/legal`: Diagnóstico normativo, checklist regulatorio, contratos.
8. `/api/brief`: Diagnóstico ejecutivo con IA Claude Sonnet 5 (cuota global).
9. `/api/herramientas`: Directorio y asignación de herramientas de negocio.
10. `/api/equipo`: Invitaciones y asignaciones de colaboradores (`trabajador`).
11. `/api/pos`: Terminal punto de venta, tickets con folios seguros bajo advisory locks.
12. `/api/cotizaciones`: Generación de cotizaciones con folios correlativos `MAX(...) + 1`.
13. `/api/inventario`: Control de stock de insumos con bloqueo pesimista `pessimistic_write`.
14. `/api/contabilidad`: Importación de transacciones CSV, conciliación y deduplicación.
15. `/api/nomina`: Registro y cálculo de nóminas para colaboradores.
16. `/api/clientes`: Directorio de clientes y CRM básico.
17. `/api/negocios`: Perfil empresarial y configuración de actividad económica.
18. `/api/calendario`: Cronogramas y eventos (cálculo de días exacto sin desfase UTC).
19. `/api/vertical`: Módulo de adaptación vertical de la industria.
20. `/api/ventas`: Análisis de ventas, transcripción de voz (Whisper) y tips autenticados.
21. `/api/admin`: Métricas y paneles de administración de la plataforma (`requireAdmin`).
22. `/api/events`: Server-Sent Events (SSE) en tiempo real con validación JTI en Redis.
23. `/api/reportes`: Área de reportes de Contabilidad — series de ventas, ranking de productos, almacén, clientes, horarios y conversión de cotizaciones. Agregación en SQL; hereda el gating de `contabilidad`.
24. `/api/config`: Parámetros públicos de configuración de la aplicación.
26. `/api/mantenimientos`: Herramienta de mantenimiento preventivo de equipos (tanque de gas, refrigerador, parrilla, tijeras…). El «cada cuánto» sale del catálogo determinista `services/mantenimientos/catalogoIntervalos.ts` (~50 tipos × intensidad de uso `bajo`/`normal`/`intenso`), gratis e instantáneo; solo si el catálogo no reconoce el objeto, `POST /sugerencia` lo estima con IA (Haiku, tarea `mecanica`) y cobra 1 crédito (`mantenimiento_sugerencia`). `POST /:id/registrar` guarda el servicio hecho y, si lleva costo, crea el egreso en `movimientos_contables` (`fuente: 'mantenimiento'`) dentro de la misma transacción. El semáforo (al día / ya toca / vencido) se calcula con `estadoEquipo` y alimenta el panel de alertas operativas.
25. `/api/network`: Red de expertos (directorio de profesionales en 7 categorías: legal, contabilidad, marketing, diseño, ventas, proveedores, tecnología), perfiles con portada, galería (12 fotos), servicios (15) y WhatsApp, reseñas, métricas diarias (`experto_metricas_dia`) e **impulsos**: campañas prepagadas por días con alcance ciudad o nacional, cupo por lugar y pago único en Stripe Checkout (`services/network/impulsosService.ts`; tarifas en `IMPULSO_TARIFA_CIUDAD_MXN` / `IMPULSO_TARIFA_NACIONAL_MXN`, por defecto $39 y $99 MXN/día). Los impulsados salen en `promocionados` (solo página 1) etiquetados como «Promocionado». Al registrarse se elige `usuarios.tipo_cuenta` (`negocio` / `experto`), que solo decide la redirección. **Las rutas `GET /expertos` y `GET /expertos/:id` son públicas sin token** y solo devuelven fichas con `estado = 'aprobado'`; el alta y la edición exigen autenticación, y la cola de revisión vive en `/api/admin/network` (montada **antes** de `/api/admin` en `app.ts`). `documento_url` (cédula) nunca se expone fuera de admin.

> [!CAUTION]
> **Patrocinios y el webhook de Stripe**
> Los patrocinios de la red se cobran con el mismo Stripe y al mismo cliente que los planes del SaaS, pero **no son un plan**. Los **impulsos** (pago único, `metadata.tipo = 'impulso_experto'`) se desvían igual, a `manejarEventoImpulso`, y solo se activan con `payment_status = 'paid'` o `async_payment_succeeded`. Las suscripciones de patrocinio llevan `metadata.tipo = 'patrocinio_experto'` y `handleStripeEvent` (en `routes/billing.ts`) las **desvía a `manejarEventoPatrocinio` antes de tocar la tabla `usuarios`**. Si se quita ese desvío, `extractSubscriptionPlan` no reconoce el producto, devuelve `'freemium'` y un experto con plan Pro **queda degradado por haber pagado un patrocinio**, además de perder el rastro de su suscripción real. Precios: `STRIPE_PRICE_PATROCINIO_LEGAL` / `_MARKETING` / `_VENTAS`, con `STRIPE_PRICE_PATROCINIO` como fallback común.
- `/health`: Estado de salud de PostgreSQL, Redis, Uptime y Worker in-process.
- `/metrics`: Endpoint de Prometheus protegido con token Bearer en producción.

---

## 7. Reglas Críticas de Desarrollo y "Gotchas" (Para Agentes IA)

> [!CAUTION]
> **1. TYPEORM_SYNCHRONIZE=false (ESTRICTO)**
> NUNCA cambies `TYPEORM_SYNCHRONIZE` a `true`. Con synchronize activo, TypeORM borra las decenas de índices de rendimiento y destruye las restricciones de claves foráneas creadas por las migraciones (ver historial acumulado en `backend/src/migrations/`). Todos los cambios de esquema se aplican **exclusivamente** con `npm run migration:run`.

> [!WARNING]
> **2. UUIDs como Cadenas**
> Todas las llaves primarias (`id`), `usuario_id`, `producto_id`, etc., son UUIDs nativos. NUNCA uses `parseInt()` sobre un ID.

> [!IMPORTANT]
> **3. Webhooks de Stripe y Body Parsing**
> La ruta `/api/billing/webhook` requiere el buffer crudo para la validación HMAC `stripe.webhooks.constructEvent()`. En `src/app.ts`, `express.raw({ type: 'application/json' })` debe montarse **antes** de `express.json()`.

> [!IMPORTANT]
> **4. Generación de Folios y Concurrencia**
> En cotizaciones y POS, los folios se generan con `MAX(NULLIF(regexp_replace(...)))::integer + 1` dentro de transacciones protegidas con `pg_advisory_xact_lock()`. NUNCA uses `count()` porque produce colisiones si se eliminan registros previos.

> [!IMPORTANT]
> **5. Conexión Perezosa de BullMQ**
> La conexión ioredis del productor en `src/workers/analysisQueue.ts` se inicializa de forma **perezosa** (`lazy`). Esto previene sockets huérfanos que impidan que los tests de Jest o los scripts CLI finalicen.

> [!TIP]
> **6. Contextos de Compilación de Docker**
> El build de la imagen backend debe ejecutarse con contexto `backend/` (`docker build -f backend/Dockerfile.prod backend/`). El frontend debe ejecutarse con contexto `frontend/`. Los archivos `.dockerignore` protegen las imágenes de la inyección de `node_modules` de Windows o credenciales `.env`.

> [!IMPORTANT]
> **7. Seguridad de Autenticación y Criptografía**
> Las contraseñas de usuario se hashean utilizando bcrypt con un factor de costo de 12 rounds (`BCRYPT_COST = 12` en `src/routes/auth.ts`). El middleware de autenticación valida la denylist de tokens en Redis con fallback fail-open e instrumentación Prometheus (`auth_denylist_check_failed_total`).

> [!IMPORTANT]
> **9. Convenciones de API que no se deben romper**
> - Todo router con parámetros de entidad llama a `exigirUuid(router, 'id', …)` (`middleware/validate.ts`): un id no UUID responde 400, nunca llega a Postgres.
> - Orígenes no permitidos → 403 en `middleware/cors.ts`; los rate limits usan `AlmacenLimiteRedis` (compartido entre réplicas, memoria de respaldo).
> - Los seeds y scripts de demo importan primero `scripts/guardiaSeeds.ts`: abortan con `NODE_ENV=production` o base de datos remota.
> - Los tests de integración solo escriben en bases cuyo nombre contenga `test` (`__tests__/helpers/dbGuard.ts`).
> - Una herramienta nueva se declara en CUATRO sitios con exhaustividad en tipos: `PermisosTrabajador` (`models/AsignacionTrabajador.ts`), `CAPABILITIES` y `HERRAMIENTAS_POR_PLAN` (`services/billing/planService.ts`), `SERVICIOS_CATALOGO` (`services/billing/serviciosCatalogo.ts`) y la tarjeta `META` de `frontend/app/dashboard/herramientas/page.tsx`. Si falta alguno, no compila.

> [!CAUTION]
> **8. Contrato de variables de producción**
> Con `NODE_ENV=production`, `initializeApp` llama a `verificarEntornoProduccion()` (`src/config/entorno.ts`) y **el backend no arranca** si faltan `JWT_*` (≥32 caracteres), `ADMIN_TOTP_KEY`, `ADMIN_JWT_SECRET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME` (no `S3_BUCKET_NAME`), `AWS_BUCKET_URL_BASE`; con correo, `NEXT_PUBLIC_APP_URL`; con Stripe, `STRIPE_WEBHOOK_SECRET` y el `STRIPE_PRODUCT_<PLAN>` de cada plan con precio. Si añades una variable imprescindible, añádela ahí, a su test y a `.env.production.template` (que `docker-compose.prod.yml` carga entero con `env_file`).

---

## 8. Comandos de Verificación y Desarrollo

### Backend (`cd backend`)
```bash
npm run dev           # Servidor con recarga automática (ts-node-dev)
npm run typecheck     # Chequeo estricto de tipos (tsc --noEmit)
npm test              # Suite Jest en serie (límites por IP desactivados). Sin BD de test, los de integración se omiten
# Integración completa: solo contra una base cuyo nombre contenga "test" (helpers/dbGuard.ts)
#   DATABASE_URL=postgresql://bi0a100_user:bi0a100_password@localhost:5432/bi0a100_test \
#   REDIS_URL=redis://localhost:6379/15 npm run migration:run && npm test
npm run test:coverage # Cobertura de tests
npm run build         # Compilación de producción hacia dist/
npm run migration:run # Aplicar migraciones pendientes
npm run migration:run:prod # Igual, sobre dist/ (lo usa Railway como preDeployCommand)
npm run seed:demo     # Cargar datos de demostración completos
```

### Frontend (`cd frontend`)
```bash
npm run dev           # Servidor de desarrollo Next.js en :3000
npm run typecheck     # Chequeo estricto de tipos de TypeScript
npm run build         # Compilación de producción (Turbopack)
```

### Monorepo y Docker (desde la raíz)
```bash
npm run up            # Levantar entorno Docker con build y refresco de volúmenes anónimos (-V)
npm run down          # Apagar contenedores y redes
npm run logs          # Ver logs en tiempo real de backend y frontend
npm run kill-all      # Liberar puertos 3000 y 3001 si están tomados
bash scripts/pre-deploy-check.sh # Checklist automatizado antes de producción
```
