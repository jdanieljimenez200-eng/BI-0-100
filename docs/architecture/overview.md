# Arquitectura — Visión General

Descripción de alto nivel de BI 0 A 100 y cómo funciona.

## ¿Qué es BI 0 A 100?

**SaaS que valida viabilidad de negocios en 2-3 minutos.**

Usuario sube datos de producto → Recibe 5 análisis independientes (Mercado, Marketing, Finanzas, Legal, Proveedores) + Brief global.

## Stack Técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16 + React 18 + Tailwind CSS |
| Backend | Express.js + TypeORM + Node.js 18 |
| Database | PostgreSQL 15 |
| Cache/Queue | Redis 7 + BullMQ |
| Auth | JWT (15m access + 7d refresh) |
| Deployment | Vercel (frontend) + Railway (backend) |
| Monitoring | Prometheus + Grafana + Sentry |

## Flujo de Alto Nivel
