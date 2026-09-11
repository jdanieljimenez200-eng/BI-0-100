# BI 0 A 100 — Documentación Central

Bienvenido a la documentación técnica del proyecto **BI 0 A 100**, plataforma SaaS B2B que valida la viabilidad comercial y técnica de negocios en 2-3 minutos.

## 🗂️ Índice de Documentación

### Inicio Rápido y Guía para Agentes IA
- **[CLAUDE.md](../CLAUDE.md)** — **Guía canónica de ingeniería para IAs y desarrolladores** (topología, rutas, gotchas y reglas).
- **[README principal](../README.md)** — Descripción, stack y comandos de inicio rápido.

### Desarrollo y Operaciones
- **[setup.md](development/setup.md)** — Configuración local + Docker
- **[workflow.md](development/workflow.md)** — Git workflow y convenciones
- **[observability.md](development/observability.md)** — Logs, métricas Prometheus y Sentry

### Arquitectura
- **[overview.md](architecture/overview.md)** — Visión del sistema y topología
- **[backend.md](architecture/backend.md)** — Express, TypeORM, middlewares
- **[frontend.md](architecture/frontend.md)** — Next.js 16, App Router, Tailwind, GSAP
- **[database.md](architecture/database.md)** — PostgreSQL 15, esquema UUID, migraciones
- **[queue.md](architecture/queue.md)** — BullMQ 5, Redis 7 (AOF), procesamiento asíncrono

### Módulos de Análisis (6 Módulos)
Cada módulo valida un aspecto de viabilidad del producto o cuenta:
- **[mercado.md](modules/mercado.md)** — Análisis de mercado, TAM/SAM/SOM y competencia
- **[marketing.md](modules/marketing.md)** — Estrategia de marketing, copies y buyer personas
- **[proveedores.md](modules/proveedores.md)** — Directorio de proveedores y costos
- **[finanzas.md](modules/finanzas.md)** — Proyecciones financieras y simulador de escenarios
- **[legal.md](modules/legal.md)** — Cumplimiento regulatorio y contratos sugeridos
- **[brief.md](modules/brief.md)** — Brief ejecutivo global con IA (Claude 3 Haiku)

### Archivo Histórico
Documentos históricos de auditorías y reparaciones previas consolidados:
- **[archive/reports/](archive/reports/)** — [Índice de reportes de auditoría históricos](archive/reports/INDEX.md)

---

## 📌 Información General

**Última actualización**: 2026-09-07

**Tech Stack**:
- Backend: Node.js 20+ + Express + TypeORM + PostgreSQL 15 + Redis 7 + BullMQ 5
- Frontend: Next.js 16 (App Router, Turbopack) + React 19 + Tailwind CSS + GSAP 3
- DevOps: Docker Compose v2, dumb-init, Prometheus, Sentry

---

## ❓ ¿Dónde encontrar la información más actualizada?

Para cualquier trabajo de desarrollo o consulta por parte de agentes IA, la **fuente de verdad canónica** es **[`CLAUDE.md`](../CLAUDE.md)** en la raíz del repositorio.