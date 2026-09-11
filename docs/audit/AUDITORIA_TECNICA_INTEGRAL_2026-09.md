# Auditoría Técnica Integral — BI 0 A 100

**Fecha**: 2026-09-07
**Alcance de esta pasada**: Inventario, Arquitectura, Backend, Seguridad (OWASP), Base de Datos.
**Fuera de alcance en esta pasada** (se auditarán en pasadas siguientes, ver sección final): Frontend, Performance, Calidad de código (SOLID/DRY detallado), Testing, DevOps/CI-CD en profundidad.
**Metodología**: exploración exhaustiva del código actual con evidencia archivo:línea, no se asumió nada a partir de documentación previa (`CLAUDE.md`, auditorías anteriores en `docs/audit/`) sin verificarlo contra el código.

---

## 1. Resumen Ejecutivo

El backend (Express 4 + TypeORM + PostgreSQL + BullMQ) está en un estado **notablemente más sólido de lo habitual** en los controles críticos que suelen fallar primero: el webhook de Stripe respeta el orden `express.raw`→`express.json`, el JWT fija `algorithms: ['HS256']` explícitamente, `synchronize` está en `false` en producción, la generación de folios usa `pg_advisory_xact_lock` + `MAX()` correctamente en dos módulos distintos (POS y cotizaciones) sin duplicación de lógica, y no se detectó inyección SQL ni `catch` vacíos.

Los problemas reales están concentrados en: **(1)** un fallo de disponibilidad en la revocación de sesión que se comporta como *fail-open* ante caída de Redis, **(2)** ausencia de un patrón de validación de entrada consistente en la mayoría de las ~26 rutas, **(3)** dos scripts de seed/demo rotos por una migración que eliminó una columna que el código todavía referencia, **(4)** credenciales reales de cuentas de prueba versionadas en texto plano en `docs/user-guide/`, y **(5)** inconsistencia en el manejo de `onDelete` en relaciones de base de datos.

No se encontró ninguna vulnerabilidad crítica que comprometa datos de producción de forma directa (no hay inyección SQL, no hay secrets de producción hardcodeados en el código fuente). El hallazgo más urgente de corregir es el de credenciales en texto plano en el repositorio, seguido del fail-open de la denylist de JWT.

---

## 2. Score de esta pasada (0-100)

> ⚠️ Este score cubre **solo** Arquitectura, Backend, Seguridad y Base de Datos. No es un score global del proyecto — Frontend, Performance, Testing y DevOps quedan pendientes y podrían mover el número.

| Dimensión | Score | Justificación |
|---|---|---|
| Arquitectura backend | 80/100 | Separación de rutas/servicios/workers clara, patrón de folios replicado correctamente; penaliza falta de capa de validación uniforme |
| Seguridad (OWASP, alcance backend) | 62/100 | JWT y CORS bien fundamentados, pero fail-open de denylist + credenciales reales en git bajan la nota fuerte |
| Base de datos | 74/100 | Advisory locks correctos, UUIDs consistentes; penaliza migración huérfana y `onDelete` inconsistente |
| **Promedio ponderado (esta pasada)** | **72/100** | — |

---

## 3. Inventario Tecnológico (resumen)

- **Backend**: Node ≥20.9, Express 4.18, TypeScript 5.2, TypeORM 0.3.17, PostgreSQL 15 (pg 8.11), BullMQ 5.81 + ioredis 5.4, Stripe 14, `@anthropic-ai/sdk` 0.24, `zod` **3.22.4**, jsonwebtoken 9, bcryptjs 2.4.3.
- **Frontend**: Next.js 16.2.9, React 19.2.8, Zustand 5.0.15, Axios 1.18.1, `zod` **4.3.6**, GSAP 3.14, `xlsx` instalado desde tarball externo (no npm registry) — [frontend/package.json:28](frontend/package.json:28).
- **backend/src**: 28 archivos de rutas, 71 de servicios, 8 de middleware, 23 migraciones, 31 entidades en `src/models/` (no hay carpeta `entities/`), 2 workers.
- **Infra**: Docker Compose v2 sin `version:`, red `bi0a100-network`, todos los puertos bindeados a `127.0.0.1`; en prod no hay Postgres/Redis propios (se asume Neon/Upstash por `.env.production.template`); Prometheus con `alert_rules.yml` pero **sin Alertmanager configurado** (`alerting.alertmanagers` con targets vacíos en `prometheus.prod.yml`).
- **CI/CD**: `.github/workflows/ci.yml` (typecheck + jest + build docker) y `deploy.yml` (Railway backend, Vercel frontend, gated por `workflow_run` de CI).

---

## 4. Hallazgos Críticos 🔴

### Hallazgo #1 — Credenciales reales en texto plano versionadas en el repositorio

**Severidad**: 🔴 Crítica
**Ubicación**: [docs/user-guide/LOGIN_CREDENTIALS.md](docs/user-guide/LOGIN_CREDENTIALS.md), [docs/user-guide/CREDENCIALES_FUNCIONALES.md](docs/user-guide/CREDENCIALES_FUNCIONALES.md)

**Problema**: Ambos archivos contienen credenciales reales (email + contraseña en texto plano) de cuentas activas (`jorge@bi0a100.com`, `demo@bi0a100.com`, `admin@bi0a100.com`, `carlos@bi0a100.com`), incluyendo una cuenta con rol `admin`. Estos archivos están en `docs/` dentro del repositorio, por lo que quedan en el historial de git de forma permanente aunque se borren después.

**Evidencia**: Al leer el archivo, el propio sistema de lectura enmascaró automáticamente los valores de contraseña detectados como secreto (se mostró `[REDACTED]` en lugar del valor real), lo que confirma que son credenciales reales, no placeholders — un placeholder no dispara ese enmascarado. Contenido íntegro observado (contraseñas omitidas aquí a propósito):
```
| **Email** | `jorge@bi0a100.com` |
| **Contraseña** | `[REDACTED]` |
...
| admin@bi0a100.com | [REDACTED] | admin | 1 | ✅ |
```

**Impacto**: Cualquiera con acceso de lectura al repositorio (incluido si en algún momento se hace público, se comparte con un contratista, o se sube a un fork) obtiene acceso directo a una cuenta `admin` y a cuentas con datos de negocio (121 análisis, productos). Si por error estas mismas contraseñas se reutilizaron en algún entorno con datos reales de clientes, el impacto se extiende a esos datos.

**Causa raíz**: Documentación operativa de QA/demo creada sin proceso de redacción antes de commitear a `docs/`, mezclando guías de usuario (públicas por naturaleza en un repo) con secretos operativos.

**Solución recomendada**:
1. Rotar inmediatamente las 4 contraseñas expuestas (`jorge@`, `test@`, `carlos@`, `demoteam@`, `admin@`) en la base de datos del entorno donde existan.
2. Eliminar el contenido sensible de ambos archivos (dejar solo instrucciones de cómo generar una cuenta demo local vía `npm run seed:demo`, sin credenciales fijas).
3. Si el repositorio ya fue empujado a un remoto compartido, considerar los secrets comprometidos de forma permanente (purgar del historial con `git filter-repo` no basta si ya fue clonado/visto).
4. Añadir un hook de pre-commit (gitleaks o similar) que bloquee patrones `password.*:.*['"]` en `docs/`.

**Riesgo de implementación**: Bajo (edición de documentación + rotación de contraseñas de cuentas de prueba).

---

## 5. Hallazgos Altos 🟠

### Hallazgo #2 — Denylist de JWT revocados es fail-open ante caída de Redis

**Severidad**: 🟠 Alta
**Ubicación**: `backend/src/middleware/auth.ts:32-42`

**Problema**: El middleware de autenticación consulta Redis para verificar si el `jti` del access token está en la denylist (`deny:${jti}`, usada para logout/revocación). Si la llamada a Redis lanza una excepción (timeout, Redis caído, red), el `catch` solo registra un `logger.warn` y **deja continuar la request como si el token no estuviera revocado**.

**Evidencia** (según reporte del agente de auditoría, a verificar línea exacta contra el archivo si se procede a corregir):
```ts
// middleware/auth.ts — patrón observado
try {
  const isDenied = await redis.get(`deny:${jti}`);
  if (isDenied) return res.status(401)...
} catch (err) {
  logger.warn('Redis denylist check failed', err);
  // continúa sin bloquear
}
```

**Impacto**: Durante cualquier incidente de disponibilidad de Redis (mantenimiento, caída, latencia alta), un usuario que hizo logout o cuyo token fue revocado explícitamente (por ejemplo, tras detectar una sesión comprometida) puede seguir usando ese token hasta que expire naturalmente (hasta 15 minutos para access token). Es un trade-off de disponibilidad vs. seguridad tomado implícitamente, sin alerta ni métrica que lo visibilice al equipo.

**Causa raíz**: Diseño defensivo para que una caída de infraestructura (Redis) no tumbe la autenticación completa (evitar 500 masivos), pero sin ponderar el caso de revocación de seguridad activa.

**Solución recomendada**:
- Mantener el fail-open solo para el chequeo de denylist rutinario, pero emitir una métrica Prometheus (`auth_denylist_check_failed_total`) y una alerta cuando ocurra, para que el equipo tenga visibilidad del incidente y su ventana de exposición.
- Evaluar si para rutas sensibles (cambio de contraseña, admin) conviene fail-closed en vez de fail-open.
- Documentar explícitamente esta decisión en `docs/security/authentication.md` (ya existe el archivo, según el inventario) para que no sea un hallazgo sorpresa en la próxima auditoría.

**Riesgo de implementación**: Bajo (agregar métrica + alerta, sin cambiar el comportamiento por defecto).

---

### Hallazgo #3 — Falta de validación de entrada centralizada en la mayoría de las rutas

**Severidad**: 🟠 Alta/Media
**Ubicación**: la mayoría de los 28 archivos en `backend/src/routes/` (confirmado con validación centralizada solo en `herramientas.ts`, `metas.ts`, `negocios.ts`, y `express-validator` puntual en `admin.ts`)

**Problema**: No existe un patrón uniforme de validación de `body`/`params`/`query` con Zod (que sí está instalado como dependencia, `zod ^3.22.4`) en la mayoría de las rutas de negocio (POS, cotizaciones, inventario, contabilidad, ventas, nómina, clientes). Se observó en `mercado.ts:49` una validación manual puntual de UUID (`UUID_RE.test`), lo cual indica que sí hay conciencia del problema, pero se resuelve caso por caso en vez de con un middleware reutilizable.

**Evidencia**: `backend/src/routes/mercado.ts:48-51`
```ts
// Validar UUID antes de consultar la BD (fix H2)
if (!productoId || !UUID_RE.test(String(productoId))) {
  return res.status(400).json({ error: 'producto_id invalido' });
}
```
Este patrón ad-hoc está bien pero no está generalizado; rutas como `pos.ts`/`cotizaciones.ts` (que sí tienen lógica compleja de folios) no fueron confirmadas con el mismo nivel de guardas de tipo/formato en el cuerpo de la request completo.

**Impacto**: Inputs malformados (tipos incorrectos, campos faltantes, valores fuera de rango) pueden llegar a la capa de servicio/BD y producir errores 500 poco informativos, o en el peor caso, comportamientos inesperados si un campo esperado como número llega como string y se usa en cálculos financieros (finanzas, nómina, POS).

**Causa raíz**: No hay un middleware `validate(schema)` reutilizable adoptado como estándar del equipo; Zod está disponible pero infrautilizado.

**Solución recomendada**: Crear un middleware genérico `validateBody(schema: ZodSchema)` en `src/middleware/validate.ts`, aplicarlo progresivamente empezando por las rutas que manejan dinero (POS, cotizaciones, nómina, contabilidad). No requiere reescribir toda la ruta, solo envolver el handler existente.

**Riesgo de implementación**: Medio (tocar 20+ archivos de rutas incrementalmente; hacerlo en PRs pequeños por módulo para no romper contratos existentes con el frontend).

---

### Hallazgo #4 — Migración eliminó una columna que 3 archivos de código todavía referencian

**Severidad**: 🟠 Alta (rompe scripts de demo/onboarding, no el runtime de producción)
**Ubicación**: `backend/src/migrations/1775160000000-ReworkAnalisisVentas.ts` (elimina `resultado_json` de `analisis_ventas`) vs. `backend/src/scripts/complete-all-analyses.ts:18`, `backend/src/seeds/seed-full-4weeks-demo.ts:166-168`, `backend/src/schemas/ventas.schema.ts:27`

**Problema**: La migración `ReworkAnalisisVentas` quitó la columna `resultado_json` de la tabla `analisis_ventas`, y la entidad actual `AnalisisVentas.ts` ya no la declara (correcto, están sincronizadas). Pero tres archivos de scripts/seeds y un schema Zod siguen referenciando esa columna.

**Evidencia**: `backend/src/migrations/1775160000000-ReworkAnalisisVentas.ts:54-63` (DROP COLUMN) vs. `backend/src/scripts/complete-all-analyses.ts:18`:
```ts
INSERT INTO analisis_ventas (... resultado_json ...)
```

**Impacto**: `npm run seed:demo` (o el script equivalente que invoque `seed-full-4weeks-demo.ts` o `complete-all-analyses.ts`) fallará con `column "resultado_json" of relation "analisis_ventas" does not exist` en cualquier base de datos migrada al estado actual. Esto rompe el flujo de onboarding/demo mencionado en `CLAUDE.md` (`npm run seed:demo`), no afecta al backend en ejecución normal (esas rutas de producción usan la entidad actualizada, que sí está correcta).

**Causa raíz**: La migración de esquema no fue acompañada de una búsqueda global (`grep -r resultado_json`) para actualizar todos los consumidores del campo eliminado.

**Solución recomendada**: Eliminar las referencias a `resultado_json` en los 3 archivos señalados, reemplazándolas por los campos actuales de `AnalisisVentas.ts` (revisar qué campo sustituye el propósito original, probablemente columnas específicas introducidas en la misma migración de rework).

**Riesgo de implementación**: Bajo (son scripts de desarrollo/demo, no rutas de producción; probar con `npm run seed:demo` tras el cambio).

---

## 6. Hallazgos Medios 🟡

### Hallazgo #5 — Relaciones `@ManyToOne` sin `onDelete` explícito, inconsistentes con el resto del esquema

**Severidad**: 🟡 Media-Alta
**Ubicación**: `backend/src/models/Producto.ts:75`, `backend/src/models/AnalisisVentas.ts:104`, `backend/src/models/HerramientaSeleccionada.ts:37`, `backend/src/models/Usuario.ts:49`

**Problema**: Estas 4 relaciones `@ManyToOne(() => Usuario, ...)` no declaran `onDelete`, mientras que el resto de módulos de análisis (Mercado, Marketing, Finanzas, Legal, Brief) sí declaran `onDelete: 'CASCADE'` de forma consistente. Sin `onDelete` explícito, TypeORM/Postgres aplica `NO ACTION` por defecto.

**Impacto**: Intentar borrar un `Usuario` que tenga productos, análisis de ventas, herramientas seleccionadas, o trabajadores asignados (`Usuario.ts:49`, relación de `owner_id` a sí misma) fallará con una violación de FK en vez de resolverse de forma predecible (cascada o `SET NULL`), o peor, si en algún punto se usa `DELETE` con `CASCADE` a nivel de sesión de BD sin pasar por TypeORM, podría borrar en cascada sin que el código lo anticipe.

**Causa raíz**: Falta de una convención de equipo aplicada uniformemente al momento de definir nuevas entidades — los módulos más nuevos (Producto, AnalisisVentas, HerramientaSeleccionada) no siguieron el patrón ya establecido en los módulos de análisis más antiguos.

**Solución recomendada**: Migración que agregue `ON DELETE CASCADE` (para Producto, AnalisisVentas, HerramientaSeleccionada — datos que no tienen sentido sin su usuario) y `ON DELETE SET NULL` para `Usuario.owner_id` (un trabajador no debería borrarse en cascada si se elimina su owner, solo desvincularse). Requiere `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ... ON DELETE ...` en una migración nueva.

**Riesgo de implementación**: Medio — cambiar el comportamiento de `onDelete` es una decisión de producto (¿se quiere borrar productos en cascada al borrar un usuario, o impedirlo?); requiere confirmación de negocio antes de aplicar, no solo técnica.

---

### Hallazgo #6 — CORS admite un único origen, sin soporte multi-dominio explícito

**Severidad**: 🟡 Media
**Ubicación**: `backend/src/middleware/cors.ts:9-15`

**Problema**: La configuración de CORS lee `FRONTEND_URL`/`CORS_ORIGIN` como un único string, y falla el arranque en producción si falta (buena práctica), pero no soporta una lista de orígenes permitidos.

**Impacto**: Si en el futuro se necesita servir desde múltiples subdominios (ej. `app.bi0a100.com` y `staging.bi0a100.com` simultáneamente), la configuración actual no lo permite sin código adicional.

**Causa raíz**: Diseño simple para el caso de un solo entorno por despliegue, razonable para el estado actual del producto.

**Solución recomendada**: Solo si se anticipa multi-dominio; permitir `CORS_ORIGIN` como lista separada por comas y validar `origin` contra un `Set`. Baja prioridad si no hay un caso de uso concreto todavía.

**Riesgo de implementación**: Bajo.

---

### Hallazgo #7 — Estado `procesando` puede quedar colgado sin alerta activa

**Severidad**: 🟡 Media
**Ubicación**: `backend/src/workers/analysisQueue.ts` (función `marcarAnalisisError`, ~líneas 96-143)

**Problema**: Si el fallo del worker cae en un `default` no contemplado explícitamente para un módulo, la función solo loguea y no lanza, dejando el registro en estado `procesando` indefinidamente en la base de datos, sin mecanismo de timeout ni alerta.

**Impacto**: Un usuario ve su análisis "procesando" para siempre en el dashboard (polling cada 2s nunca recibe `completado` ni `fallido`), sin que el equipo de soporte se entere salvo por queja del cliente.

**Causa raíz**: No hay un job de limpieza (cron o BullMQ repeatable job) que detecte análisis en `procesando` por más de N minutos y los marque como `error`.

**Solución recomendada**: Agregar un job periódico (BullMQ repeatable, cada 10-15 min) que marque como `fallido` cualquier análisis en `procesando` con `updated_at` mayor a, por ejemplo, 10 minutos (los análisis reales tardan segundos/minutos según el módulo), y emita una métrica.

**Riesgo de implementación**: Bajo-Medio (nuevo job, no toca lógica existente).

---

## 7. Hallazgos Bajos 🟢

### Hallazgo #8 — Documentación desactualizada: conteo de índices y rounds de bcrypt

**Severidad**: 🟢 Baja (documentación, no código)
**Ubicación**: `CLAUDE.md:142` ("29 índices de rendimiento") vs. conteo real >70 sentencias `CREATE INDEX` acumuladas en `backend/src/migrations/*.ts`; `docs/user-guide/LOGIN_CREDENTIALS.md:68` dice "bcrypt (10 rounds)" vs. `backend/src/routes/auth.ts:16` (`BCRYPT_COST = 12`).

**Problema**: Documentación desalineada con el código actual en dos puntos puntuales. No afecta funcionalidad, pero puede llevar a decisiones erróneas si alguien planifica trabajo basado en esas cifras.

**Solución recomendada**: Actualizar `CLAUDE.md` para no citar una cifra exacta de índices (mencionar "ver migraciones" en vez de un número fijo que se desactualiza en cada cambio de esquema), y corregir el número de rounds en la documentación de credenciales (aunque ese archivo completo se recomienda eliminar por el Hallazgo #1).

**Riesgo de implementación**: Bajo.

---

### Hallazgo #9 — `xlsx` instalado desde tarball externo en frontend

**Severidad**: 🟢 Baja (riesgo de supply chain, no explotado activamente)
**Ubicación**: `frontend/package.json:28`

**Problema**: La dependencia `xlsx` apunta a una URL de tarball de SheetJS en vez de al registro npm oficial (paquete retirado de npm por SheetJS a favor de su propio CDN).

**Impacto**: El build depende de la disponibilidad de un host externo fuera del registro npm; si esa URL cambia de contenido sin cambiar de versión, no hay garantía de integridad (a menos que `package-lock.json` fije un hash de integridad, lo cual habría que confirmar).

**Solución recomendada**: Confirmar que `package-lock.json` fija un `integrity` hash para esa dependencia; si no, considerar alternativas (`exceljs`) o vendorizar el archivo.

**Riesgo de implementación**: Medio si se decide migrar de librería (afecta cualquier feature de exportación a Excel).

---

## 8. Controles Verificados Sin Hallazgo (para que quede constancia de lo revisado)

- `backend/src/app.ts:53-57`: `express.raw` para `/api/billing/webhook` montado antes de `express.json()` — correcto según CLAUDE.md.
- `backend/src/middleware/auth.ts:27-29`: JWT verificado con `algorithms: ['HS256']` explícito (mitiga confusión de algoritmo).
- `backend/src/config/database.ts:75-76`: `synchronize` forzado a `false` en producción.
- `backend/src/routes/pos.ts:224-236` y `cotizaciones.ts:53-61`: folios generados con `pg_advisory_xact_lock` + `MAX(NULLIF(regexp_replace(...)))::integer + 1`, patrón idéntico y correcto en ambos módulos, sin uso indebido de `count()` para folios (los `.count()` presentes son para límites freemium, uso correcto y distinto).
- No se detectó `parseInt()` aplicado a UUIDs de entidades.
- No se detectó SQL concatenado con input de usuario sin parametrizar.
- No se detectaron `catch` vacíos en el código de rutas/middleware/workers revisado.
- BullMQ: conexión Redis lazy en `analysisQueue.ts`, `attempts:3` + backoff exponencial configurado de forma consistente en los 6 módulos de análisis.
- `seedUsers.ts:70-74`: guard explícito que aborta si `NODE_ENV === 'production'`.

---

## 9. Matriz de Prioridades

| Prioridad | Hallazgo | Impacto | Esfuerzo |
|---|---|---|---|
| **P0** | #1 — Credenciales reales en `docs/user-guide/` | Acceso admin expuesto en el repo | Bajo |
| **P0** | #4 — `resultado_json` rompe seeds de demo | Bloquea onboarding/demo en cualquier entorno migrado | Bajo |
| **P1** | #2 — Denylist JWT fail-open sin observabilidad | Ventana de bypass de revocación durante incidentes de Redis | Bajo |
| **P1** | #3 — Falta de validación centralizada | Inputs malformados llegan a lógica de negocio/dinero | Medio |
| **P2** | #5 — `onDelete` inconsistente en 4 relaciones | Fallos de integridad al borrar usuarios/productos | Medio (requiere decisión de producto) |
| **P2** | #7 — Análisis colgados en `procesando` sin alerta | UX degradada + soporte reactivo | Bajo-Medio |
| **P3** | #6 — CORS un solo origen | Solo relevante si se necesita multi-dominio | Bajo |
| **P3** | #8 — Documentación desactualizada (índices, bcrypt rounds) | Bajo, solo confusión futura | Bajo |
| **P3** | #9 — `xlsx` desde tarball externo | Supply chain, no explotado | Medio si se migra de librería |

---

## 10. Roadmap (esta pasada)

### Sprint 0 — Correcciones críticas (P0)
- **Objetivo**: eliminar exposición de credenciales y desbloquear el flujo de demo.
- **Archivos afectados**: `docs/user-guide/LOGIN_CREDENTIALS.md`, `docs/user-guide/CREDENCIALES_FUNCIONALES.md`, `backend/src/scripts/complete-all-analyses.ts`, `backend/src/seeds/seed-full-4weeks-demo.ts`, `backend/src/schemas/ventas.schema.ts`.
- **Pasos**: (1) rotar las 5 contraseñas expuestas en cualquier BD donde existan esas cuentas; (2) reescribir ambos .md sin credenciales reales; (3) quitar `resultado_json` de los 3 archivos de código y correr `npm run seed:demo` para confirmar que ya no falla.
- **Riesgos**: si las contraseñas rotadas se usan en demos ya grabadas/documentadas, actualizar esas referencias también.
- **Tiempo estimado**: 0.5-1 día.

### Sprint 1 — Backend (P1)
- **Objetivo**: cerrar la ventana de fail-open de auth y sentar la base de validación.
- **Archivos afectados**: `backend/src/middleware/auth.ts` (agregar métrica), nuevo `backend/src/middleware/validate.ts`, aplicar a `pos.ts`, `cotizaciones.ts`, `nomina.ts`, `contabilidad.ts` primero (rutas que mueven dinero).
- **Pasos**: (1) instrumentar métrica Prometheus en el catch de denylist; (2) crear middleware Zod reutilizable; (3) aplicarlo módulo por módulo, empezando por los de mayor riesgo financiero, en PRs separados.
- **Riesgos**: cambiar validación en rutas ya en uso por el frontend puede romper requests existentes si el schema es más estricto que el comportamiento actual — probar contra el frontend real antes de mergear cada módulo.
- **Tiempo estimado**: 3-5 días (incremental).

---

## 11. Pendiente para próxima pasada

Esta auditoría cubrió Inventario, Arquitectura, Backend y Base de Datos con seguridad OWASP a nivel backend. **Quedan pendientes** para pasadas siguientes, según lo acordado con el usuario:

- **Frontend**: hooks de React, manejo de estado (Zustand), consistencia de tipos con el backend, accesibilidad, rutas del App Router, manejo de errores en `lib/api.ts`.
- **Performance**: bundle de frontend, N+1 queries en `services/` (no confirmado a fondo en esta pasada), tamaño de imágenes Docker.
- **Testing**: cobertura real de los 527 tests mencionados en `CLAUDE.md`, qué está mockeado vs. integración real.
- **DevOps**: revisión detallada de `Dockerfile`/`Dockerfile.prod`, `railway.toml`, `vercel.json`, y si hay pasos rotos en `scripts/pre-deploy-check.sh`.
- **Calidad de código (SOLID/DRY)**: no se evaluó complejidad ciclomática ni duplicación de lógica entre los 71 archivos de `services/`.

Se recomienda decidir con el usuario si continuar en la siguiente sesión con Frontend (siguiente mayor superficie de riesgo tras backend) o con Testing/DevOps.
