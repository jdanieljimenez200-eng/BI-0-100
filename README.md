# BI 0 A 100

Plataforma SaaS B2B que valida la viabilidad comercial, financiera, técnica y legal de un negocio en **2 a 3 minutos**.

---

## 🚀 Tech Stack

- **Backend:** Node.js 24 (LTS) + Express + TypeORM + PostgreSQL 15 + Redis 7 + BullMQ 5 + Anthropic Claude (Sonnet 5.5 / Opus 5.5 según la tarea).
- **Frontend:** Next.js 16 (App Router, Turbopack, standalone) + React 19 + Tailwind CSS + GSAP 3 + Framer Motion.
- **DevOps & Contenedores:** Docker Compose v2, dumb-init, Prometheus + Alertmanager, Sentry.

---

## ⚡ Inicio Rápido

### 1. Clonar y Configurar Entorno

```bash
git clone <repo>
cd Bi0a100
cp .env.example .env
```

Genera claves aleatorias de mínimo 32 caracteres para `JWT_SECRET` y `JWT_REFRESH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2. Levantar con Docker (Recomendado)

```bash
# Levantar PostgreSQL, Redis, Backend y Frontend
docker compose up -d --build
```

O usando el shortcut de npm desde la raíz:
```bash
npm run up
```

### 3. Verificar Servicios

| Servicio | URL / Endpoint | Descripción |
|---|---|---|
| **Frontend** | `http://localhost:3000` | Aplicación web Next.js |
| **Backend API** | `http://localhost:3001/api` | API REST Express |
| **Health Check** | `http://localhost:3001/health` | Estado de PostgreSQL, Redis y worker |
| **PostgreSQL** | `localhost:5432` | Base de datos relacional (UUIDs) |
| **Redis** | `localhost:6379` | Colas BullMQ y revocación de tokens |
| **Prometheus** | `http://localhost:9090` | Monitoreo y telemetría de endpoints |

---

## 💻 Desarrollo Local (Sin Docker)

### Requisitos
- Node.js `>= 24`
- PostgreSQL 15 y Redis 7 corriendo en local

### Backend
```bash
cd backend
npm install
npm run dev           # node --watch con recarga automática en puerto 3001
npm run typecheck     # Verificación de tipos TypeScript
npm test              # Ejecutar suite de pruebas Jest
```

### Frontend
```bash
cd frontend
npm install
npm run dev           # Servidor Next.js en puerto 3000
npm run typecheck     # Verificación de tipos TypeScript
npm run build         # Compilación de producción
```

---

## 📁 Estructura del Proyecto

```
Bi0a100/
├── backend/
│   ├── src/
│   │   ├── app.ts              # Entry point Express, middlewares y rutas
│   │   ├── config/             # database.ts (TypeORM), redis.ts, stripe.ts
│   │   ├── entities/           # Modelos TypeORM con UUIDs
│   │   ├── middleware/         # auth.ts, upload.ts, gating.ts, cors.ts
│   │   ├── routes/             # 26 controladores de rutas REST
│   │   ├── services/           # Lógica de negocio (brief IA, billing, plan)
│   │   └── workers/            # BullMQ queue y worker asíncrono
│   ├── Dockerfile              # Imagen de desarrollo
│   ├── Dockerfile.prod         # Imagen multi-stage de producción optimizada
│   └── package.json
├── frontend/
│   ├── app/                    # App Router Next.js 16 (landing, auth, dashboard)
│   ├── components/             # Componentes React modulares (UI, Dashboard, Auth)
│   ├── hooks/                  # Hooks personalizados (useAuth)
│   ├── lib/                    # api.ts (Axios), config.ts, gating.ts
│   ├── Dockerfile              # Imagen de desarrollo
│   ├── Dockerfile.prod         # Imagen standalone de producción
│   └── package.json
├── docs/                       # Documentación técnica y archivo histórico
├── scripts/                    # Scripts de base de datos y pre-deploy
├── docker-compose.yml          # Compose para desarrollo local
├── docker-compose.prod.yml     # Compose para despliegue en producción
├── CLAUDE.md                   # Guía canónica para agentes de IA
└── README.md                   # Esta guía
```

---

## 🤖 Guía para Agentes de IA y Contribuidores

Para detalles exhaustivos de arquitectura, flujos de BullMQ, catálogo completo de 26 endpoints, multi-tenancy y reglas críticas (como `TYPEORM_SYNCHRONIZE=false` obligatorio), consulta **[CLAUDE.md](CLAUDE.md)**.
