# Reporte — Seed MOCK de análisis

**Proyecto:** BI 0 A 100
**Fecha:** 2026-06-30
**Script:** `backend/src/scripts/seed-mock-analisis.ts`
**Comando:** `docker compose exec backend npx ts-node src/scripts/seed-mock-analisis.ts`

---

## 1. Objetivo

Sembrar datos MOCK end-to-end para los 4 módulos (Mercado, Marketing, Proveedores, Finanzas) dejando los registros en estado `completado` directamente en la base de datos, sin depender del worker BullMQ. El script llama de forma síncrona a los orquestadores `ejecutar...`.

## 2. Idempotencia

El script es idempotente de punta a punta:

1. Reutiliza el usuario MOCK por email (`mock-seed@bi0a100.local`).
2. Antes de sembrar, borra **todos** sus análisis (primero por las FK) y luego sus productos.
3. Vuelve a crear exactamente **4 productos + 4 análisis**.

Verificado con dos corridas consecutivas:

