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
6. **Brief**: Diagnóstico y brief ejecutivo integral (a diferencia de los otros 5 módulos, su cuota es **global por cuenta** y no por producto). Implementado con **Claude 3 Haiku** (`@anthropic-ai/sdk`).

---

## 2. Topología de Servicios y Puertos

| Servicio | Entorno | Puerto Host | Puerto Contenedor | URL / Endpoint |
|---|---|---|---|---|
| **Frontend (Next.js)** | Dev / Prod | `3000` | `3000` | `http://localhost:3000` |
| **Backend (Express)** | Dev / Prod | `3001` | `3001` | `http://localhost:3001` |
| **Health Check** | Todo | `3001` | `3001` | `http://localhost:3001/health` |
| **Métricas Prometheus** | Todo | `3001` | `3001` | `http://localhost:3001/metrics` (requiere `METRICS_TOKEN` en prod) |
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
- **Colas y Tareas en Segundo Plano**: BullMQ 5 + ioredis 5 (`src/workers/analysisQueue.ts` y `src/workers/analysisWorker.ts`).
- **Inteligencia Artificial**: `@anthropic-ai/sdk` (Claude 3 Haiku) con fallback determinista estructurado y validación Zod.
- **Seguridad & Auth**: JWT (Access Token 15 min, Refresh Token 7 días), revocación en Redis vía `deny:${jti}`, `bcryptjs`, Helmet, CORS parametrizado y `cookie-parser`.
- **Subida de Archivos**: Multer en memoria RAM (`memoryStorage()`), límite estricto de 50 MB para grabaciones de voz/video, subida directa a AWS S3 mediante `@aws-sdk/client-s3`.
- **Observabilidad**: Morgan + Prometheus (`prom-client`) con `normalizePath()` anti-memory leaks + `@sentry/node`.

### Frontend (`/frontend`)
- **Framework**: Next.js 16 (React 19, Turbopack, App Router, `output: 'standalone'`).
- **Estilos & UI**: Tailwind CSS + Lucide React Icons.
- **Animaciones**: GSAP 3 (GreenSock) para efectos de interface y transiciones suaves (optimizadas con `requestAnimationFrame` sin forzar re-renders de React).
- **Gestión de Estado**: Zustand (`analysisStore.ts`) para estado global de análisis + React Context para temas.
- **Cliente HTTP**: Axios centralizado (`lib/api.ts` y `lib/config.ts`) con interceptores para rotación automática de JWT, detección de desconexión y `AbortController`.
- **Proxy Server-Side**: `app/api/[...path]/route.ts` reenvía peticiones hacia el backend Docker interno (`http://backend:3001`).

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
- **Freemium**: 1 análisis por módulo por producto.
- **Pro / Pro+ / Business**: Análisis ilimitados (`-1`).
- Los análisis que concluyan con estado `'fallido'` **no consumen cuota**.

---

## 6. Catálogo de Rutas Backend (25 Módulos API)

Montadas en `backend/src/app.ts`:
1. `/api/auth`: Signup, login (rate limited), refresh token, logout, me, reset-password.
2. `/api/billing`: Planes, checkout session Stripe, webhook HMAC, suscripción, portal.
3. `/api/productos`: CRUD de productos, logotipos, archivos multimedia y archivado.
4. `/api/mercado`: Análisis de mercado, competidores, viabilidad.
5. `/api/marketing`: Estrategia de marketing, copies, buyer personas.
6. `/api/finanzas`: Modelado financiero, márgenes, simulador de escenarios.
7. `/api/legal`: Diagnóstico normativo, checklist regulatorio, contratos.
8. `/api/brief`: Diagnóstico ejecutivo con IA Claude 3 Haiku (cuota global).
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
25. `/api/network`: Red de expertos (directorio de profesionales legal/marketing/ventas). **Las rutas `GET /expertos` y `GET /expertos/:id` son públicas sin token** y solo devuelven fichas con `estado = 'aprobado'`; el alta y la edición exigen autenticación, y la cola de revisión vive en `/api/admin/network` (montada **antes** de `/api/admin` en `app.ts`). `documento_url` (cédula) nunca se expone fuera de admin.
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

---

## 8. Comandos de Verificación y Desarrollo

### Backend (`cd backend`)
```bash
npm run dev           # Servidor con recarga automática (ts-node-dev)
npm run typecheck     # Chequeo estricto de tipos (tsc --noEmit)
npm test              # Suite completa de tests Jest (527 pruebas)
npm run test:coverage # Cobertura de tests
npm run build         # Compilación de producción hacia dist/
npm run migration:run # Aplicar migraciones pendientes
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
