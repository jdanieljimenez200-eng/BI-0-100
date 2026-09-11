# Auditoría Técnica Integral — BI 0 A 100 (Parte 2)

**Fecha**: 2026-09-07
**Alcance de esta pasada**: Frontend, Testing, DevOps/CI-CD, Performance.
**Continúa de**: [AUDITORIA_TECNICA_INTEGRAL_2026-09.md](AUDITORIA_TECNICA_INTEGRAL_2026-09.md) (Inventario, Arquitectura, Backend, Seguridad, Base de Datos).
**Metodología**: igual que la Parte 1 — evidencia archivo:línea leída directamente del código actual, sin asumir vigencia de documentación previa.

---

## 1. Resumen Ejecutivo

El hallazgo más serio de esta pasada es de **testing, no de código en ejecución**: el 100% de las 28 rutas del backend carecen de test propio, el módulo `services/ventas/` (facturación/ventas) está **excluido explícitamente de la resolución de módulos de Jest** (`modulePathIgnorePatterns`), el coverage threshold (20% líneas) no bloquea el pipeline de CI, y no existe ningún test E2E ni tests de frontend. Esto no es un bug activo, pero significa que **cualquier regresión en las rutas de negocio, incluidas las que mueven dinero (POS, cotizaciones, nómina), puede llegar a producción sin que ningún test la detecte**.

En frontend, el hallazgo más relevante es una **condición de carrera en el refresh de JWT**: múltiples peticiones 401 simultáneas disparan múltiples llamadas a `/auth/refresh` en paralelo sin mutex, lo que puede causar cierres de sesión espurios si el backend rota el refresh token de forma estricta.

En DevOps, la infraestructura Docker está bien construida (multi-stage, usuario no root, `dumb-init`, cache de capas correcto) — no hay hallazgos negativos ahí. El problema real es de **proceso**: `scripts/pre-deploy-check.sh` permite que el script termine en "✅ ALL CHECKS PASSED" aunque los tests hayan fallado, y CI ejecuta la suite de Jest dos veces por push (costo, no bug).

No se encontraron N+1 queries en el hot path de producción (solo en scripts de seed, sin impacto).

---

## 2. Score de esta pasada (0-100)

| Dimensión | Score | Justificación |
|---|---|---|
| Frontend (arquitectura/calidad) | 68/100 | Hook de polling (`useAnalysisEvents`) bien construido; penaliza race condition de refresh, páginas de 1700+ líneas, manejo de errores inconsistente |
| Testing | 38/100 | 0% de rutas testeadas, módulo de ventas excluido de Jest, coverage no bloqueante, sin E2E, sin tests frontend |
| DevOps/CI-CD | 78/100 | Dockerfiles de producción muy sólidos; penaliza pre-deploy-check que no bloquea en fallos de test y duplicación de ejecución de Jest en CI |
| Performance | 74/100 | Sin N+1 en producción; penaliza `<img>` plano en 9 páginas en vez de `next/image` pese a tener `images.remotePatterns` configurado |
| **Promedio ponderado (esta pasada)** | **65/100** | — |

> El score combinado de Parte 1 (72/100) + Parte 2 (65/100) da una idea de proyecto en estado **razonable pero con deuda de testing significativa** como el riesgo estructural más grande, por encima de cualquier vulnerabilidad de seguridad puntual.

---

## 3. Hallazgos Críticos 🔴

### Hallazgo #10 — `services/ventas/` excluido de la suite de tests de Jest

**Severidad**: 🔴 Crítica
**Ubicación**: `backend/jest.config.js:23`

**Problema**: `modulePathIgnorePatterns: ['<rootDir>/src/routes/productos.ts', '<rootDir>/src/services/ventas/']` excluye por completo el directorio `services/ventas/` (incluye `ventasService.ts`, `ventasOrchestrator.ts`) de la resolución de módulos de Jest. Ningún test puede siquiera importar código de ese directorio.

**Evidencia**:
```js
// backend/jest.config.js:23
modulePathIgnorePatterns: ['<rootDir>/src/routes/productos.ts', '<rootDir>/src/services/ventas/'],
```

**Impacto**: El módulo de Ventas (que según CLAUDE.md incluye transcripción de voz con Whisper y tips autenticados, además de la lógica de negocio de ventas) no tiene ni puede tener cobertura de test mientras esta exclusión exista. Cualquier regresión ahí es invisible para CI.

**Causa raíz**: Probablemente se añadió temporalmente para evitar que un test roto bloqueara el pipeline, y nunca se revirtió tras corregir el problema original.

**Solución recomendada**: Investigar por qué se excluyó (revisar `git blame` de esa línea si se dispone de historial), corregir el problema subyacente (probablemente un import circular o una dependencia no mockeable), y remover la exclusión. Añadir al menos tests de las funciones puras de `ventasService.ts` como primer paso.

**Riesgo de implementación**: Medio (puede destapar un problema de diseño que motivó la exclusión original).

---

## 4. Hallazgos Altos 🟠

### Hallazgo #11 — 0% de las rutas backend tienen test de sus propios endpoints

**Severidad**: 🟠 Alta
**Ubicación**: `backend/src/routes/*.ts` (28 archivos) vs. `backend/src/__tests__/routes/` (1 archivo)

**Problema**: Existe un único archivo de test de rutas (`herramientas.test.ts`), pero en realidad prueba `routes/auth.ts` (signup), no los endpoints de `herramientas.ts`. Es decir, **ninguna de las 28 rutas HTTP tiene un test que ejercite su propio endpoint** end-to-end (request → response). Además, `jest.config.js:24-27` excluye `src/routes/` del cálculo de `collectCoverageFrom`, por lo que ni siquiera se ve reflejado como "0%" en el reporte de coverage — simplemente no se mide.

**Impacto**: Los endpoints HTTP (validación de status codes, forma de la respuesta, manejo de errores 4xx/5xx) dependen enteramente de revisión manual/QA exploratorio. Combinado con el Hallazgo #3 de la Parte 1 (falta de validación centralizada), el riesgo compuesto es alto: ni el código valida de forma uniforme, ni los tests lo detectarían si se rompe.

**Causa raíz**: La suite se construyó centrada en probar funciones puras de `services/`, evitando deliberadamente la complejidad de bases de datos/HTTP en los tests (según lo observado: cero usos de `jest.mock()`, cero mocks de Redis/BullMQ en toda la suite).

**Solución recomendada**: Adoptar `supertest` (ya usado en el único test existente) como estándar para rutas críticas primero: `auth.ts`, `billing.ts` (webhook), `pos.ts`, `cotizaciones.ts`. No requiere mockear todo — el propio test existente ya demuestra el patrón de usar Postgres real vía `AppDataSource.initialize()` en CI (que ya levanta Postgres/Redis como servicios).

**Riesgo de implementación**: Medio (requiere tiempo dedicado, no es una corrección de una línea; hacerlo incremental por sprint).

---

### Hallazgo #12 — Coverage threshold no bloqueante y tests duplicados en CI

**Severidad**: 🟠 Alta (proceso) / 🟡 Media (costo)
**Ubicación**: `backend/jest.config.js:28-32`, `.github/workflows/ci.yml` (pasos `npm test` y `npm run test:coverage`), `scripts/pre-deploy-check.sh:22-26`

**Problema**: Tres capas distintas del pipeline permiten que código sin cobertura o con tests fallidos llegue a producción sin bloquear:
1. `jest.config.js` fija el umbral en solo 20% líneas, y solo sobre `services/` (no `routes/`).
2. CI ejecuta `npm run test:coverage` con `continue-on-error: true` — el resultado de cobertura es puramente informativo.
3. `scripts/pre-deploy-check.sh:25` imprime `"⚠️  Some tests failed (but proceeding)"` y continúa, permitiendo que el script final reporte `✅ ALL CHECKS PASSED` aunque los tests hayan fallado.

**Evidencia**: `scripts/pre-deploy-check.sh:22-26` (paráfrasis del agente de auditoría, verificar línea exacta antes de modificar):
```bash
npm test || echo "⚠️  Some tests failed (but proceeding)"
```

**Impacto**: El script de pre-deploy da una falsa sensación de seguridad — su nombre y mensaje final sugieren que todo está validado, cuando en realidad los tests pueden estar rotos y el script lo permite.

**Causa raíz**: Diseño permisivo probablemente para no bloquear despliegues por tests flaky, pero sin distinguir entre "flaky" y "roto".

**Solución recomendada**: Hacer que `pre-deploy-check.sh` falle (`exit 1`) si `npm test` falla, y separar claramente cualquier verificación no bloqueante (ej. coverage informativo) de las que sí deben detener el despliegue (tests rojos). Adicionalmente, en CI, eliminar la ejecución duplicada de Jest fusionando `npm test` y `npm run test:coverage` en un solo comando (`jest --coverage`) que sirva para ambos propósitos.

**Riesgo de implementación**: Bajo.

---

### Hallazgo #13 — Race condition en el refresh automático de JWT (frontend)

**Severidad**: 🟠 Alta
**Ubicación**: `frontend/lib/api.ts:27-58`

**Problema**: El interceptor de respuesta de Axios maneja 401 disparando `POST /auth/refresh` sin un mecanismo de mutex/cola compartida. Si varias peticiones reciben 401 casi simultáneamente (típico al cargar un dashboard que hace varias llamadas en paralelo), **cada una** ejecuta su propio refresh de forma independiente.

**Evidencia**:
```ts
// frontend/lib/api.ts:27-33 (paráfrasis del agente de auditoría)
if (error.response?.status === 401 && !originalRequest._retry) {
  originalRequest._retry = true;
  const refreshToken = ...localStorage.getItem('refreshToken');
  if (refreshToken) {
    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
    ...
  }
}
```

**Impacto**: Si el backend rota el refresh token de forma estricta (invalida el anterior al emitir uno nuevo), la segunda y sucesivas peticiones que lleguen con el refresh token ya usado reciben un error y fuerzan un logout espurio (`window.location.href` duro, línea 54) — el usuario pierde su sesión activa aunque tenía credenciales válidas, solo por una coincidencia de timing.

**Causa raíz**: Patrón de interceptor de Axios implementado sin el "refresh queue" estándar (una promesa compartida que las peticiones concurrentes esperan en vez de disparar su propio refresh).

**Solución recomendada**: Introducir una variable de módulo `let refreshPromise: Promise<string> | null = null;` — la primera petición 401 crea la promesa de refresh, las siguientes la reutilizan (`await refreshPromise`) en vez de llamar de nuevo a `/auth/refresh`. Patrón estándar y bien documentado para interceptores de Axios.

**Riesgo de implementación**: Bajo-Medio (cambio acotado a un archivo, pero requiere probar bien el caso de múltiples tabs/pestañas si aplica).

---

## 5. Hallazgos Medios 🟡

### Hallazgo #14 — Manejo de errores de API inconsistente entre páginas del dashboard

**Severidad**: 🟡 Media
**Ubicación**: `frontend/lib/apiError.ts` (helper `interpretarErrorApi`, usado hoy solo por `herramientas`/`contabilidad` según comentario propio del archivo) vs. el resto de páginas de dashboard (mercado, marketing, finanzas, legal, ventas)

**Problema**: Existe un helper centralizado para interpretar errores de API (403 `upgrade_required`, 429 con mensaje amigable, errores de validación), pero la mayoría de páginas no lo usan y construyen su propio manejo de error ad-hoc.

**Impacto**: Experiencia de usuario inconsistente — un error 429 (rate limit) puede mostrarse con mensaje amigable en una página y como error genérico en otra.

**Solución recomendada**: Migrar progresivamente los `catch` de las páginas de resultado (finanzas, mercado, marketing) a `interpretarErrorApi`, empezando por las de mayor tráfico.

**Riesgo de implementación**: Bajo, pero de alcance amplio (tocar ~5-6 páginas).

---

### Hallazgo #15 — Páginas de resultado de +1700 líneas mezclando fetch, cálculo y presentación

**Severidad**: 🟡 Media
**Ubicación**: `frontend/app/dashboard/finanzas/[productoId]/resultado/[analisisId]/page.tsx` (1770 líneas), `mercado/.../page.tsx` (1721 líneas), `marketing/.../page.tsx` (1705 líneas), `app/dashboard/page.tsx` (1153 líneas), `app/dashboard/nuevo/page.tsx` (972 líneas)

**Problema**: Estas páginas concentran polling, parsing del estado del backend, cálculo de KPIs y renderizado completo de UI en un único archivo. El módulo de Marketing ya demostró el patrón correcto extrayendo `TendenciasSection.tsx` y `PlanInversionSection.tsx`; Finanzas y Mercado no siguieron ese patrón.

**Impacto**: Mantenibilidad — cualquier cambio en la lógica de un módulo de análisis requiere navegar un archivo de +1700 líneas; mayor probabilidad de bugs al modificar.

**Solución recomendada**: Aplicar el mismo patrón de extracción de secciones que ya existe en Marketing a Finanzas y Mercado, y extraer un hook común `useAnalisisResultado(modulo, analisisId)` que encapsule el ciclo fetch-status→fetch-completo (Hallazgo #16).

**Riesgo de implementación**: Medio (refactor de UI, requiere pruebas visuales cuidadosas por módulo).

---

### Hallazgo #16 — Lógica de fetching de resultado de análisis duplicada entre 5 módulos

**Severidad**: 🟡 Media
**Ubicación**: páginas `resultado/page.tsx` de finanzas, mercado, marketing, legal y ventas

**Problema**: El patrón `GET /:modulo/:analisisId/status` → al completar, `GET /:modulo/:analisisId` se reimplementa casi idéntico en cada una de las 5 páginas, en vez de extraerse a un hook único.

**Solución recomendada**: Extraer `useAnalisisResultado(modulo, analisisId)` reutilizando el ya sólido `useAnalysisEvents` como base.

**Riesgo de implementación**: Medio (mismo alcance que Hallazgo #15, se recomienda abordarlos juntos).

---

### Hallazgo #17 — `<img>` plano en 9 páginas en vez de `next/image`

**Severidad**: 🟡 Media
**Ubicación**: `app/dashboard/{finanzas,marca,marketing,mercado,nuevo,producto,ventas}/**/page.tsx` (9 archivos) vs. solo 2 archivos usando `next/image`

**Problema**: `next.config.js:3-9` ya tiene `output: 'standalone'` y `images.remotePatterns` configurado para S3, pero 9 páginas usan `<img>` nativo, renunciando a lazy-loading automático, `srcset` responsivo y optimización on-the-fly.

**Impacto**: Mayor peso de transferencia de imágenes y peor LCP/CLS en páginas con imágenes de producto.

**Solución recomendada**: Reemplazar `<img>` por `next/image` en las 9 páginas listadas, definiendo `width`/`height` o `fill` según el layout de cada una.

**Riesgo de implementación**: Bajo-Medio (requiere ajustar CSS en algunos casos porque `next/image` exige dimensiones explícitas).

---

### Hallazgo #18 — Proxy server-side reenvía `x-forwarded-for` del cliente sin validar

**Severidad**: 🟡 Media
**Ubicación**: `frontend/app/api/[...path]/route.ts` (función `buildHeaders`, ~líneas 22-40)

**Problema**: El proxy toma `x-forwarded-for` directamente de la request del cliente y lo reenvía al backend sin verificar que provenga de un proxy confiable (Vercel/Railway). Un cliente malicioso puede falsear su IP de origen.

**Impacto**: Si el backend usa esa cabecera para rate-limiting o para logging de auditoría de seguridad, un atacante puede evadir el límite o falsificar su IP en los logs.

**Solución recomendada**: En el route handler, ignorar el `x-forwarded-for` entrante del cliente y usar la IP real que Next.js expone del request (`request.ip` o el header que la plataforma de hosting garantiza que no es falsificable), reenviando esa al backend en su lugar.

**Riesgo de implementación**: Bajo.

---

## 6. Hallazgos Bajos 🟢

### Hallazgo #19 — Único test de integración es frágil (orden de ejecución, sin cleanup)

**Severidad**: 🟢 Baja (dado que es solo 1 archivo, pero afectaría a cualquier expansión futura de tests de integración)
**Ubicación**: `backend/src/__tests__/routes/herramientas.test.ts:29-57`

**Problema**: 3 `it()` dependientes entre sí (el segundo asume datos insertados por el primero), sin `afterEach` que limpie filas — solo `afterAll` cierra la conexión, no borra datos. Reejecutar la suite contra la misma BD fallaría por constraint único de email duplicado.

**Solución recomendada**: Añadir `afterEach` que borre los usuarios de prueba creados, o usar un email único por ejecución (timestamp/UUID) para evitar colisión.

**Riesgo de implementación**: Bajo.

---

### Hallazgo #20 — Componentes de marketing/landing con `'use client'` innecesario

**Severidad**: 🟢 Baja
**Ubicación**: `frontend/components/ui/Block.tsx`, `components/ui/HelpTip.tsx`, `components/landing/HowItWorks.tsx`, `components/landing/Modules.tsx` (entre 40 archivos con `'use client'`)

**Problema**: Componentes presentacionales de landing marcados como Client Components sin necesidad aparente de interactividad, aumentando el bundle de cliente en páginas de marketing (que priorizan carga rápida para SEO/conversión).

**Solución recomendada**: Revisar caso por caso si realmente necesitan hooks de cliente; si no, quitar `'use client'`.

**Riesgo de implementación**: Bajo, pero requiere probar que no rompan si dependen de algo del navegador.

---

## 7. Controles Verificados Sin Hallazgo

- `useAnalysisEvents.ts`: cleanup completo de listeners/timers, sin memory leaks, pausa el polling cuando `document.hidden`.
- Ninguna imagen `<img>` encontrada sin atributo `alt`.
- Dockerfiles de producción (backend y frontend): multi-stage, usuario no root, `dumb-init`, orden de capas óptimo para cache.
- `.dockerignore` (raíz/backend/frontend) excluyen correctamente `node_modules`, `.git`, `.env*`, `dist`, `.next`.
- `railway.toml`/`vercel.json` coherentes con los Dockerfiles y con el flujo de `deploy.yml` (despliega el SHA validado por CI, no el HEAD actual).
- Sin N+1 queries en el hot path de rutas de producción (los únicos loops con queries encontrados están en scripts de seed o en jobs de mantenimiento acotados a 6 tablas fijas).
- `package.json` raíz: comandos `up`/`down`/`logs`/`kill-all` coherentes con los nombres de servicio reales en `docker-compose.yml`.

---

## 8. Matriz de Prioridades (Parte 2)

| Prioridad | Hallazgo | Impacto | Esfuerzo |
|---|---|---|---|
| **P0** | #10 — `services/ventas/` excluido de Jest | Módulo de ventas sin cobertura posible, ni siquiera en teoría | Medio |
| **P1** | #11 — 0% de rutas con test propio | Regresiones en endpoints HTTP invisibles a CI | Medio-Alto (incremental) |
| **P1** | #12 — pre-deploy-check no bloquea en fallo de tests | Falsa sensación de seguridad antes de desplegar | Bajo |
| **P1** | #13 — Race condition en refresh de JWT | Logouts espurios bajo carga concurrente | Bajo-Medio |
| **P2** | #14 — Manejo de errores inconsistente | UX inconsistente | Bajo (alcance amplio) |
| **P2** | #15/#16 — Páginas gigantes + fetching duplicado | Mantenibilidad, riesgo de bugs al modificar | Medio |
| **P2** | #17 — `<img>` en vez de `next/image` | Performance (LCP/CLS) | Bajo-Medio |
| **P3** | #18 — `x-forwarded-for` sin validar en proxy | Evasión de rate-limit/logs falseados | Bajo |
| **P3** | #19 — Test de integración frágil | Bloquea expansión futura de tests de integración | Bajo |
| **P3** | #20 — `'use client'` innecesario en landing | Bundle ligeramente mayor en marketing | Bajo |

---

## 9. Roadmap (Parte 2)

### Sprint 2 — Frontend
- **Objetivo**: cerrar la race condition de refresh de JWT y estandarizar manejo de errores.
- **Archivos**: `frontend/lib/api.ts`, `frontend/lib/apiError.ts`, páginas de resultado de mercado/finanzas/marketing/legal/ventas.
- **Pasos**: (1) implementar `refreshPromise` compartida en el interceptor; (2) migrar catches de las páginas de resultado a `interpretarErrorApi`.
- **Riesgos**: probar bien multi-tab si la app se usa con varias pestañas abiertas simultáneamente.
- **Tiempo estimado**: 2-3 días.

### Sprint 3 — Testing
- **Objetivo**: destrabar `services/ventas/`, empezar cobertura real de rutas críticas.
- **Archivos**: `backend/jest.config.js`, nuevos tests con `supertest` para `auth.ts`, `billing.ts`, `pos.ts`, `cotizaciones.ts`.
- **Pasos**: (1) investigar y resolver la causa de la exclusión de `services/ventas/`; (2) escribir tests de integración con `supertest` para las 4 rutas críticas primero; (3) hacer que `test:coverage` sea bloqueante en CI una vez la cobertura real suba de forma sostenida.
- **Riesgos**: destapar bugs preexistentes al testear código no probado antes — tratarlos como hallazgos nuevos, no como regresiones del sprint.
- **Tiempo estimado**: 5-8 días (incremental, puede extenderse varios sprints).

### Sprint 4 — DevOps
- **Objetivo**: que el pipeline de pre-deploy realmente bloquee ante fallos.
- **Archivos**: `scripts/pre-deploy-check.sh`, `.github/workflows/ci.yml`.
- **Pasos**: (1) cambiar el script para que falle si los tests fallan; (2) fusionar `npm test` + `npm run test:coverage` en un solo `jest --coverage` en CI.
- **Riesgos**: si hay tests actualmente rotos y silenciados, este cambio los expondrá — resolverlos antes de activar el bloqueo, o el pipeline quedará roto.
- **Tiempo estimado**: 1 día (más el tiempo de arreglar tests rotos que se destapen).

### Sprint 5 — Performance
- **Objetivo**: mejorar LCP/CLS reemplazando `<img>` por `next/image`.
- **Archivos**: las 9 páginas listadas en el Hallazgo #17.
- **Tiempo estimado**: 2 días.

---

## 10. Estado Consolidado de la Auditoría

Con esta pasada quedan cubiertas: Inventario, Arquitectura, Backend, Seguridad OWASP, Base de Datos (Parte 1) + Frontend, Testing, DevOps/CI-CD, Performance (Parte 2).

**Pendiente real remanente**: análisis de complejidad ciclomática/SOLID a nivel de función individual en los 71 archivos de `services/` (se evaluó a nivel de patrón y duplicación, no función por función), y verificación en vivo de despliegue (el hallazgo de `railway.toml` sobre permisos del volumen `/app/uploads` con `USER nodejs` no se pudo confirmar sin desplegar).

Se recomienda decidir con el usuario si esas dos verificaciones residuales ameritan una tercera pasada, o si se pasa directamente a ejecutar el Sprint 0 (credenciales expuestas, ya identificado como lo más urgente en la Parte 1).
