# Desplegar en Railway (todo en un proyecto)

Decisión del 2026-10-14 (auditoría técnica): con menos de 100 negocios el primer año y un tope de
$25 USD/mes de hosting, todo va en **un solo proyecto de Railway**. Una factura, la base y Redis en red
privada (no expuestos a internet) y el respaldo diario ya preparado para Railway.

> Las tarifas de Railway (≈ $10 por GB de RAM al mes, ≈ $20 por vCPU al mes, plan Hobby de $5 que
> incluye $5 de uso) salen de fuentes de terceros consultadas el 2026-10-14. Confírmalas en
> railway.com/pricing antes de contar con ellas.

## Servicios

| Servicio | Origen | Qué hace | RAM esperada |
|---|---|---|---|
| `frontend` | este repo, raíz `frontend` (`frontend/railway.toml`) | Next.js (`Dockerfile.prod`, standalone) | ~0.3 GB |
| `backend` | este repo, raíz `backend` (`backend/railway.toml`) | API **con los workers dentro** (análisis de IA y Google Calendar); migra antes de cada despliegue (`preDeployCommand`) | ~0.45 GB |
| `Postgres` | plantilla de Railway | la base, con volumen | ~0.35 GB |
| `Redis` | plantilla de Railway | colas, límites de peticiones, sesiones cerradas, avisos en vivo | ~0.1 GB |
| `respaldo` | este repo, raíz `scripts/respaldo` | `pg_dump` diario cifrado a S3 (ver `RESPALDOS.md`) | solo ~1 min al día |

Costo estimado al inicio: **~$15–21 USD/mes en total**, sumando S3 (~$1–2) y el dominio. Con 1,000
negocios, ~$40–60 (worker aparte y más RAM). La IA de Anthropic se cobra aparte y es el costo mayor.

**No se despliegan en Railway**: Prometheus y sus alertas (con este tamaño bastan Sentry y un monitor
de disponibilidad), ni un worker aparte. `docker-compose.prod.yml` queda para un servidor propio.

## Requisito: dominio propio

La sesión vive en una cookie HttpOnly del API, así que **frontend y API tienen que compartir dominio
registrable**: `app.tudominio.com` (frontend) y `api.tudominio.com` (backend). Con los dominios
`*.up.railway.app` que da Railway, el navegador trata cada servicio como otro sitio y la sesión caduca a
los 15 minutos. Compra el dominio antes de abrir la app a negocios reales.

## Pasos (una vez)

1. **Proyecto.** En railway.com crea un proyecto en la región más cercana a México. En *Usage*, pon un
   límite de gasto (≈ $25) con aviso por correo, para que nunca cobre de más sin enterarte.
2. **Postgres y Redis.** Agrega las plantillas *Postgres* y *Redis*.
   - Anota la versión mayor de Postgres (`SELECT version();` en la pestaña *Data*). El CI y el entorno
     local usan la 15: si Railway da otra, avisa para alinear `ci.yml`, `PG_MAJOR` del respaldo y el
     Postgres local (este último con volcado y restauración, no se cambia de versión en caliente).
   - En Redis comprueba `CONFIG GET maxmemory-policy` → debe decir `noeviction`. BullMQ lo exige: con
     otra política, Redis puede borrar trabajos en cola cuando se llena. BullMQ también lo avisa en los
     logs del backend al arrancar.
3. **Servicio `backend`.** *New service → GitHub repo* (o `railway up` desde `backend/`), *Root
   Directory* `backend`. Variables: las de [`.env.production.template`](../../.env.production.template)
   marcadas `[OBLIGATORIA]`, con
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}` y `REDIS_URL=${{Redis.REDIS_URL}}` (red privada);
   - `FRONTEND_URL=https://app.tudominio.com`, `NEXT_PUBLIC_APP_URL=https://app.tudominio.com`;
   - `TRUST_PROXY=1` (Railway pone un proxy delante; 2 si además hay Cloudflare);
   - **sin** `RUN_WORKER` (los análisis corren dentro de la API).
   Dominio: `api.tudominio.com`. El backend no arranca si falta una variable obligatoria
   (`config/entorno.ts`): el log dice cuál.
4. **Servicio `frontend`.** *Root Directory* `frontend`. Variables (se hornean al compilar):
   `NEXT_PUBLIC_API_URL=https://api.tudominio.com/api`, `NEXT_PUBLIC_APP_URL`,
   `NEXT_PUBLIC_SENTRY_DSN` (opcional) y, más adelante, `CSP_ENFORCE=true` (ver abajo). Dominio:
   `app.tudominio.com`.
5. **Servicio `respaldo`.** Sigue [`RESPALDOS.md`](RESPALDOS.md) (*Root Directory* `scripts/respaldo`,
   `PG_MAJOR` = la versión de Postgres de Railway o mayor). Ejecútalo a mano una vez y haz el simulacro de
   restauración.
6. **Archivos.** Bucket S3 de la app (`AWS_*`) con *Versioning* activado. Es distinto del bucket de
   respaldos.
7. **Monitoreo.**
   - Sentry (plan gratis): `SENTRY_DSN` en el backend y `NEXT_PUBLIC_SENTRY_DSN` en el frontend.
   - Un monitor de disponibilidad gratis (UptimeRobot, Better Stack…) sobre
     `https://api.tudominio.com/health` cada 5 minutos, con aviso por correo. `/health` responde 503 si
     Postgres o Redis no contestan.
8. **Despliegues automáticos.** Con el repositorio en GitHub, el workflow `Deploy` despliega backend y
   luego frontend **solo si el CI pasó en `main`**. Necesita el secreto `RAILWAY_TOKEN` en GitHub. Si
   conectas además la integración GitHub de Railway, desactiva su auto-deploy en cada servicio.

## Primer despliegue: primero un entorno de pruebas

Crea un *environment* `staging` en el mismo proyecto (sus propias variables y base) y despliega ahí
antes que en producción. Comprueba:

- [ ] `https://api…/health` → 200, con Postgres y Redis `ok`.
- [ ] Registro, login, y que la sesión siga viva después de 15 minutos (cookie compartida entre `app.`
      y `api.`).
- [ ] Una venta en el POS y su asiento en Contabilidad.
- [ ] Un análisis que termina (lo corre el worker dentro de la API) y su aviso en vivo.
- [ ] Una subida de archivo (logo) que queda en S3.
- [ ] La consola del navegador sin violaciones de la CSP en modo «solo reportar»; entonces
      `CSP_ENFORCE=true` en el frontend y redespliegue.
- [ ] El respaldo programado corrió y su restauración en una base vacía cuadra.
- [ ] El monitor avisa si apagas el backend un momento.

## Cuándo crecer

| Señal | Qué hacer |
|---|---|
| Los análisis hacen lenta la API (picos de CPU o memoria del backend) | Servicio `worker` con `npm run worker:prod` y `RUN_WORKER=false` en el backend |
| La base pasa de ~1 GB o las consultas se ponen lentas | Más RAM a Postgres; revisar índices con `pg_stat_statements` |
| Varias réplicas del backend | Ya está preparado: límites de peticiones, candados y avisos en vivo van por Redis |
