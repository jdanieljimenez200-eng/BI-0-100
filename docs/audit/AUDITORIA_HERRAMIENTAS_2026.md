# 📋 AUDITORÍA DE HERRAMIENTAS Y DEPENDENCIAS — BI 0 A 100

**Fecha**: 2026-08-15  
**Proyecto**: BI 0 A 100 (SaaS de validación de viabilidad empresarial)  
**Estado**: Producción en Railway (backend) + Vercel (frontend)

---

## 1️⃣ STACK TECNOLÓGICO GENERAL

| Capa | Tecnología | Versión | Propósito |
|------|-----------|---------|----------|
| **Backend** | Node.js + Express | 20-alpine | API REST |
| **Frontend** | Next.js 13+ | 16.2.9 | App web |
| **BD Principal** | PostgreSQL | 16-alpine | Datos transaccionales |
| **Cache/Queue** | Redis | 7-alpine | BullMQ, sesiones |
| **ORM** | TypeORM | 0.3.17 | Mapeo BD |
| **Task Queue** | BullMQ | 5.71.1 | Análisis async |
| **Lenguaje** | TypeScript | 5.3.2 | Tipado estático |
| **Testing** | Jest + ts-jest | 29.7.0 | Unit tests |
| **Auth** | JWT + bcrypt | jsonwebtoken 9.0.2 | Seguridad |
| **Cloud** | Railway + Vercel | - | Deploy |
| **CI/CD** | GitHub Actions | - | Automatización |

---

## 2️⃣ DEPENDENCIAS BACKEND (66 librerías)

### 📦 Dependencias Principales (24)
