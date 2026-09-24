# Depuración de código muerto — BI 0 A 100

**Fecha:** 2026-09-21 · **Rama:** `master` (HEAD `de630c2`) · **Sin commit.**
**Contexto:** el árbol de trabajo tenía 124 cambios sin commitear de otras tres sesiones activas (landing, auditoría predeploy, base de datos de la pizzería). Esta depuración **no toca ningún archivo que esas sesiones tuvieran modificado**; lo que aparece en ellos se deja como candidato.
**Regla aplicada:** solo se elimina lo que tiene 0 consumidores comprobados. Ante cualquier duda (APIs, permisos, sistema de diseño en rediseño activo, features a medio cablear) se marca como candidato y no se toca.

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Archivos eliminados | **15** (5 backend, 6 frontend, 4 docs duplicados) |
| Archivos modificados | 38 (+1 línea en `CLAUDE.md` y este informe) |
| Líneas | **+41 / −2401** (código ≈ −990, docs duplicados −1362, lockfile −33) |
| Exports muertos eliminados | 22 en archivos vivos (más los de los 11 archivos de código borrados) |
| Imports / variables / estados sin uso eliminados | 44 (31 imports + 13 variables, estados y parámetros) |
| Dependencias eliminadas | 2 (`zustand`, `@eslint/eslintrc`) |
| Duplicados eliminados | 4 docs idénticos byte a byte + 1 componente duplicado sin uso (`ui/Block.tsx`) |
| Bugs de infraestructura corregidos | 2 (build vacío tras borrar `dist/`; `npm test` sincronizaba la BD de test) |

El proyecto ya estaba limpio a nivel de archivos (auditorías previas): de 590 módulos TS/JS, solo 13 eran inalcanzables desde algún punto de entrada. La mayor parte del valor está en exports muertos, código deprecado que seguía vivo (`porque_fallan`, folio de POS por `count()`), y en dos fallos de configuración que se descubrieron al validar.

---

## 2. Método e inventario

**Herramientas (sin dependencias nuevas, con el TypeScript del propio repo):**

1. **Grafo de imports** con `ts.preProcessFile` + `ts.resolveModuleName` (alias `@/*`, `import()` dinámico, `require`, `jest.mock`, `require.resolve`).
2. **Alcanzabilidad** desde los puntos de entrada reales: `app.ts`, `cli-datasource.ts`, migraciones (glob de TypeORM), tests, setup de Jest, scripts y seeds; en el frontend, las convenciones de archivo del App Router (`page`, `layout`, `route`, `error`, `global-error`, `not-found`…), `instrumentation*` y configs raíz.
3. **Exports muertos**: cada export con nombre buscado por palabra completa en los 590 archivos. Solo se consideró muerto si aparecía **únicamente en su declaración**.
4. **Locales/imports**: `tsc --noUnusedLocals --noUnusedParameters` en ambos proyectos.
5. **Rutas**: 235 endpoints (`router.METHOD` + prefijos de `app.ts`) cruzados con todos los literales de ruta del frontend, tests y scripts de QA.
6. **Verificación manual** de cada candidato: búsqueda global (código, docs, Docker, CI, scripts `.sh`/`.ps1`), historial de git y estado del árbol de trabajo.

| Área | Inventario |
|---|---|
| Backend | 40 modelos, 30 routers (235 endpoints), 98 servicios, 8 middlewares, 3 workers (2 colas BullMQ), 55 migraciones, 91 suites de test, 25 scripts/seeds |
| Frontend | 56 páginas, 68 componentes, 18 módulos de `lib/` + hooks |
| Infra | 2 Dockerfiles por app, `docker-compose.yml` / `.prod.yml`, Prometheus + reglas, CI (`ci.yml`, `deploy.yml`), Railway, Vercel |
| Docs | 58 Markdown versionados |

---

## 3. Código eliminado (con evidencia)

### 3.1 Archivos

| Archivo | Tipo | Refs | Evidencia | Riesgo |
|---|---|---|---|---|
| `backend/src/enums/index.ts` | enums | 0 | Nadie importa `enums/`; `PlanType`, `AnalysisStatus`, `AnalysisModule` no aparecen fuera (el `AccountRole` real vive en `models/Usuario.ts`) | Bajo |
| `backend/src/events/events.ts` | EventEmitter | 0 | 6 líneas; ni `events/events` ni `someEvent` se referencian | Bajo |
| `backend/src/schemas/{index,productos.schema,ventas.schema}.ts` | Zod | 0 tras 3.2 | El propio `index.ts` decía que solo existía porque `validate.ts` importaba un tipo; ese import era de `validateVentasInput` (muerto). `formularios.test.ts` lee `routes/*.ts`, no `schemas/` | Bajo |
| `frontend/components/landing/index.tsx` | barrel | 0 | Landing antigua; `app/page.tsx` compone las secciones directamente | Bajo |
| `frontend/components/landing/CTA.tsx` | componente | 1 (solo el barrel muerto) | — | Bajo |
| `frontend/components/landing/HeroModulesExpanded.tsx` | componente | 0 | Huérfano desde el commit inicial | Bajo |
| `frontend/components/landing/sections/howitworks.tsx` | componente | 0 | Duplicado viejo de `landing/HowItWorks.tsx` | Bajo |
| `frontend/components/ui/Block.tsx` | componente | 0 | Las 5 páginas de formulario usan su propio `Block` local con acento por módulo | Bajo |
| `frontend/lib/design-tokens.ts` | tokens | 0 | Ni la ruta ni `SPACE`/`RADIUS`/`SHADOW`/`BLUR` se usan | Bajo |
| `docs/audit/AUDIT_PLAN.md`, `AUDIT_PLAN_2.md`, `AUDITORIA_ARQUITECTURA.md`, `AUDITORIA_BACKEND.md` | docs | — | md5 idéntico a su copia en `docs/archive/reports/`, que es la que indexa `INDEX.md`. La auditoría predeploy del 14-09 ya pedía "Dejar solo archive" | Nulo |

### 3.2 Exports y funciones muertas

| Ubicación | Qué | Motivo |
|---|---|---|
| `middleware/validate.ts` | `validateVentasInput`, `validateQuery`, `validateParams` | 0 usos; solo `validateBody`/`validate` están en uso |
| `config/database.ts` | `initDatabase`, `isDatabaseReady` (+ import de `logger`) | `app.ts` y `/health` usan `AppDataSource` directamente |
| `config/temaPresets.ts` | `WALLPAPER_PRESET_KEYS`, `PALETA_PRESET_KEYS` | 0 usos |
| `events/sse.ts` | `emitAnalysisList`, `emitTabCheck`, `getClientCount` | Emitían los eventos `analysis-list` y `tab-check`, que ningún cliente escucha (el frontend solo registra `analysis-update`) |
| `services/pos/posService.ts` | `generarNumeroTicket` | **Folio por `count() + 1`: patrón prohibido por la regla 4 de `CLAUDE.md`** (colisiona al borrar ventas). El folio real sale de `MAX()` + advisory lock |
| `services/ventas/ventasService.ts` | `generarPorqueFallan`, `generarPorqueFallanMock`, `PorqueFallanOutputSchema`, `RazonSchema` (−85 líneas) | Sección deprecada: `ventasOrchestrator` fija `porque_fallan_data = null` ("el análisis de riesgo vive en Finanzas"). Los análisis viejos se siguen mostrando: el tipo `PorqueFallan` y la columna se conservan |
| `services/ventas/types.ts` | `RebatidasObjeciones`, `ResultadoVentas` | Tipos sin uso |
| `services/billing/planService.ts` | `getPrecioUsd` | 0 usos |
| `services/billing/serviciosCatalogo.ts` | `getPrecioServicio` (+ import `CapabilityKey`) | 0 usos; la exhaustividad por tipos (`_CatalogoServiciosCompleto`) se mantiene |
| `services/billing/stripeService.ts` | `isBillingCycle` | 0 usos |
| `utils/latam.ts` | `PAISES_LATAM_LISTA` | 0 usos |
| `frontend/lib/moduleTheme.ts` | `hexARgbTriplete` | 0 usos |
| `frontend/lib/latam.ts` | tipo `PaisCode` | 0 usos |
| `frontend/.../reportes/tipos.ts` | `PanelReportes` | Tipo de la respuesta de `/reportes/panel` (API v1, sin consumidor, ver §5) |

### 3.3 Imports, variables y estados sin uso (solo archivos que ninguna otra sesión estaba editando)

- **Backend:** `Request` en `routes/brief.ts`, `finanzas.ts`, `legal.ts`. `hayClaveAnthropic` en `resumenCompletoService`, `resumenIaService`, `briefService`, `dafoService`, `reporteBiService`. `RazonFracaso` y `MetricaGuion` en `ventasService`. Índice `i` sin uso en un `.map`.
- **Frontend:**
  - `finanzas/.../resultado/page.tsx`: `shortMXN`; la cadena muerta `VIABILIDAD_STYLES` → `vKey` → `vs`; y el parámetro `proy` de `normalizeBreakeven`, que tiene un solo llamador.
  - `CsvImportModal.tsx`: estado `fileName`, que se escribía y nunca se leía (re-render inútil al cargar cada archivo).
  - `EstadoResultadosPnL.tsx`: estado de solo escritura `fugaGlobal`; `mesActual`, que además calculaba el mes en UTC (patrón prohibido por `CLAUDE.md`); y 7 iconos sin uso.
  - `LiquidacionesPanel.tsx`: 6 iconos sin uso. `CanalesCobroModal.tsx`: 1 icono sin uso.
  - `TendenciasSection.tsx`: import de `motion` y dos tablas de colores muertas (`PLATFORM_COLOR`, y `CAT_COLOR`, que solo alimentaba la variable sin uso `c`).
  - `tema/page.tsx`: variable `activo` sin uso. `Pagination.tsx`: `import React` sin uso.
- **Tests:** mock de `emitAnalysisList` en `flujoAnalisis.test.ts` y bloque `generarPorqueFallanMock` de `ventasGeneradores.test.ts` (probaban código deprecado).

### 3.4 Dependencias

| Paquete | Evidencia | Acción |
|---|---|---|
| `zustand` | Ningún `from 'zustand'` en el árbol ni en `HEAD`; el único store (`stores/analysisStore.ts`, ya borrado por otra sesión) no tenía consumidores | `npm uninstall` |
| `@eslint/eslintrc` (dev) | `eslint.config.mjs` documenta que ya no usa `FlatCompat`; 0 imports | `npm uninstall` |

Todas las demás dependencias de ambos `package.json` tienen consumidor directo, o son implícitas: `pg` (driver de TypeORM), `react-dom`, `react-is` (par de `recharts`), `autoprefixer`/`postcss`, `@types/*` y `ts-node(-dev)`, que usan los scripts.

---

## 4. Código optimizado (antes → después)

| Cambio | Antes | Después |
|---|---|---|
| `backend/tsconfig.build.json` | `incremental` heredado: el `.tsbuildinfo` se compartía con `typecheck`, así que tras borrar `dist/` el build salía **con código 0 sin emitir nada** (verificado). `dist/` local acumulaba compilados de fuentes borradas (5,3 MB) | `"incremental": false`: build completo siempre; 12 s, 259 JS, 2,6 MB. Docker y Railway no se veían afectados (no copian `.tsbuildinfo`) |
| `backend/src/__tests__/helpers/entornoTests.ts` | `config/database.ts` activa `synchronize` fuera de producción salvo `TYPEORM_SYNCHRONIZE=false`. El comando de tests de `CLAUDE.md` no la pasa, así que un `npm test` local sincronizaba la BD de test (borra CHECK y rehace FK, justo lo que prohíbe la regla 1) | El setup de Jest fija `TYPEORM_SYNCHRONIZE=false`, como CI |
| `EstadoResultadosPnL`, `CsvImportModal` | Estados de solo escritura que provocaban un render extra por carga | Eliminados |
| `CLAUDE.md` / `README.md` | Citaban Zustand, `stores/` y "Claude 3 Haiku" | Reflejan el estado real (sin store global; modelo por tarea) |

---

## 5. Candidatos que NO se eliminaron (requieren decisión)

| Candidato | Por qué se conserva | Sugerencia |
|---|---|---|
| **9 endpoints v1 de reportes** (`GET /api/reportes/{resumen,serie,productos,almacen,clientes,horarios,metodos-pago,cotizaciones,panel}`) | APIs; el frontend usa la API por áreas (`/reportes/areas`, `/area/:vista`, `/panorama`, `/completo`) | Retirarlos juntos en un cambio propio |
| Endpoints sin consumidor: `GET /productos/count`, `GET /marketing/producto/:id`, `GET /legal/:id/status`, `GET /herramientas/historial`, `POST /config/tema/{wallpaper,logo}`, `GET /marca/lista`, `GET /clientes/:id/citas`, `DELETE /contabilidad/:id/import/:batchId`, `DELETE /inventario/movimientos/:id`, `POST /vertical/elegir`, `GET /ventas/tips`, `GET /ventas/historias/diaria`, `POST /ventas/transcribir` | APIs públicas del backend; algunas podrían ser features pendientes de UI (`transcribir`, borrado de importaciones) | Decidir por producto |
| `POST /network/patrocinios/checkout` y `GET /admin/network/pendientes` | Solo los llaman `iniciarPatrocinio` / `pendientesDeRevision` de `lib/network.ts`, que a su vez no usa nadie. El checkout de patrocinio **no tiene botón en la UI** | Cablear la UI o retirar ambos lados |
| `services/estadisticas/` (censo oficial, Banco Mundial, DENUE, institutos: ~720 líneas + test) | Feature completa sin cablear desde el commit inicial; `AnalisisMercado` ya tipa `censo_oficial` | Decidir si se integra en Mercado o se retira |
| `frontend/lib/plans.ts` `planTieneFeature` + `FEATURE_PLANS` + `PlanFeature`; `lib/gating.ts` `moduloCompletoBloqueado`; backend `canRunAnalisis`/`canRunBriefAnalisis` | Lógica de permisos por plan (regla: no borrar permisos automáticamente). Son espejos que nadie consulta y pueden desincronizarse | Retirarlos tras revisar el gating real (`gatingAnalisis.ts` + `seccionesBloqueadas`) |
| `frontend/lib/motion/tokens.ts`: `staggerContainer`, `staggerItem`, `interactiveCard`, `interactiveButton`, `revealStagger` | Sistema de animación compartido; la sesión de landing lo está rediseñando ahora mismo | Revisar al cerrar el rediseño |
| `utils/metrics.ts` `setActiveConnections` / métrica `db_active_connections` | Nadie la actualiza: Prometheus recibe siempre 0 | Conectarla al pool de `pg` o quitar la métrica |
| `ProductoGate` prop `herramienta` | Prop obligatoria sin uso, pero la pasan 8 páginas que otras sesiones están editando | Quitarla cuando esas páginas se estabilicen |
| Parámetros posicionales sin uso (`posicionamientoService`: `scores`, `buyerPersonas`, `nivelTraccion`; `competenciaService`: `precio`; `dafoService`: `producto`; `analizarCompetidorMock`: `transcripcion`) | Quitar un parámetro intermedio obliga a reordenar todas las llamadas | Convertir a objeto de opciones cuando se toquen |
| 5 `Block` locales en los formularios de Mercado/Marketing/Ventas/Finanzas/Legal | Casi idénticos, pero con acento y espaciado distintos por módulo: unificarlos cambia la UI | Unificar con prop `acento` en un cambio de diseño |
| Símbolos sin uso en archivos de otras sesiones (`pos.ts`: `repoVentaItems`, `repoNegocios`, `repoMovs`; `nomina.ts`: `repoMov`; `productos.ts`: `Request`, `NextFunction`, `multer`; `contabilidad.ts`: `In`; y ~88 en el frontend) | Archivos con cambios sin commitear de otras sesiones | Que cada sesión los limpie al cerrar su trabajo |
| `prometheus.yml` (raíz) | Ningún compose lo monta (prod usa `prometheus.prod.yml`); `CLAUDE.md` y `README.md` anuncian Prometheus en `:9090` también en desarrollo, y no existe ese servicio | Borrarlo o añadir Prometheus al compose de desarrollo |
| `backend/*.md` sueltos, `docs/user-guide/README_PROVEEDORES_REMOVED.md`, `docs/dev-setup/DOCUMENTO_TOTAL_CLAUDE_CODE_V6.0.md` | Documentación histórica, no duplicada | Mover a `docs/archive/` |

---

## 6. Riesgos y hallazgos encontrados durante la validación

1. **La BD de desarrollo (`bi0a100_db`) no coincide con las migraciones** (solo lectura, previo a esta depuración). Frente a una BD recién migrada le faltan 117 objetos y le sobran 71, estos con nombres autogenerados `FK_<hash>`/`IDX_<hash>`: la huella de un `synchronize`. Faltan, entre otros, `FK_usuarios_owner_id`, `FK_ventas_cliente`, `FK_ventas_cotizacion`, `FK_cotizaciones_cliente`, `FK_movimientos_inventario_venta`, las CHECK `CHK_expertos_estado`, `CHK_resenas_experto_*` y `CHK_patrocinios_experto_estado`, y unos 40 índices de rendimiento. Producción se construye solo con migraciones (`preDeployCommand`), así que no debería estar afectada, pero las pruebas manuales en local corren sobre un esquema distinto. **Recomendación:** recrear la BD de desarrollo desde migraciones y volver a sembrar. Es destructivo: decisión del equipo.
2. **La BD de test compartida (`bi0a100_test`) quedó sincronizada** (9 CHECK frente a las 22 que crean las migraciones). Las dos primeras ejecuciones de Jest de esta depuración se lanzaron con el comando de `CLAUDE.md`, sin `TYPEORM_SYNCHRONIZE=false`, y lo más probable es que la causa sean ellas. Por eso fallan `adminRoles` (CHECK de `admin_rol`) y `adminPapelera` (cascada). La causa raíz queda corregida en `entornoTests.ts`. **Pendiente:** recrear `bi0a100_test` desde migraciones, o apuntar a la base limpia `bi0a100_test_limpieza` que se creó para esta validación.
3. **Tipos rotos en scripts de demo** (previo). Con chequeo estricto, 10 scripts de `src/scripts/` tienen 126 errores de tipos: importan funciones que ya no existen (`ejecutarAnalisis*` de los orquestadores) y leen propiedades retiradas (`Usuario.role`, `intentos_login`, `bloqueado_hasta`). Con `ts-node --transpile-only` fallarán en runtime. `seed:demo` (`seed-demo-completo.ts`) tiene 2 errores. No se tocaron: los seeds los está usando la sesión de la BD.
4. **`GET /api/mercado/abc` sin sesión responde 400, no 401** (previo). `mercado.ts` aplica `authenticate` por ruta y no con `router.use`, así que `exigirUuid` corre antes. No filtra datos, pero contradice el comentario de `exigirUuid`.
5. **Los 5 `Block` y el código de colores por módulo** se repiten. No es un riesgo, es deuda de diseño (§5).

---

## 7. Validaciones ejecutadas

| Validación | Resultado |
|---|---|
| Backend `npm run typecheck` | ✅ 0 errores |
| Backend `tsc` sobre tests + scripts + seeds | ⚠️ 162 errores **previos** (tipos de `supertest` y scripts desfasados, §6.3); 0 relacionados con lo eliminado (buscado identificador a identificador) |
| Backend `npm run build` (limpio) | ✅ 12 s, 259 JS, `dist/config/database.js` carga |
| Backend Jest sobre BD recién migrada (`bi0a100_test_limpieza`, entorno de CI, sin pasar `TYPEORM_SYNCHRONIZE`) | ✅ **91/91 suites, 1085/1085 tests** en 153 s. Tras la ejecución la base conserva sus 22 CHECK y 194 índices: el setup ya no sincroniza |
| Backend Jest sobre `bi0a100_test` (sincronizada, §6.2) | 1083/1085 ✅; los 2 fallos dependen del esquema dañado |
| Migraciones desde cero | ✅ 55/55 en 5 s sobre base vacía |
| Frontend `tsc --noEmit` | ✅ 0 errores |
| Frontend ESLint | ✅ 0 errores (275 avisos previos; ninguno nuevo en archivos tocados) |
| Frontend `next build` | ✅ Next 16.3.5 (Turbopack): compilado, TypeScript OK, 64 rutas, 15 páginas estáticas, 14 s |
| Docker | ✅ 4 contenedores `healthy`; `/health` → `database: connected`, `redis: connected`, `worker: running` |
| Rutas del frontend tocadas (dev server) | ✅ 200 en `/`, `/auth/login`, `/auth/signup`, `/dashboard`, `/dashboard/tema`, `/dashboard/nuevo`, resultados de Finanzas y Marketing, `/dashboard/herramientas/{contabilidad,pos}`, Ventas, Legal y Billing |
| Seguridad (sondas HTTP) | ✅ 401 en `/auth/me`, `/productos`, `/config`, `/reportes/areas`, `/events/ticket` y `/auth/refresh` sin credenciales; 403 a origen CORS ajeno; el preflight admite `X-Zona-Horaria`; `/network/expertos` es público (200) |
| Landing en navegador | ✅ Renderiza, 0 errores de consola |
| BullMQ | ✅ 2 colas con worker; los 6 tipos encolados tienen `case` en `analysisWorker` |
| E2E con sesión real (login → uso → logout) | ⏸ **No verificado en navegador**: el agente no introduce contraseñas ni crea cuentas. La suite de integración cubre signup, login, refresh, logout, CRUD de herramientas, colas, SSE ticket, billing webhook y admin por HTTP contra Postgres y Redis reales |

---

## 8. Métricas finales

| Métrica | Valor |
|---|---|
| Archivos eliminados | 15 |
| Líneas eliminadas / añadidas | −2401 / +41 |
| Imports eliminados | 31 |
| Exports/funciones/tipos muertos eliminados | 22 (en archivos vivos) |
| Variables, estados y parámetros sin uso eliminados | 13 |
| Dependencias eliminadas | 2 (−33 líneas de lockfile) |
| Duplicados eliminados | 4 docs (1362 líneas) + 1 componente |
| `dist/` del backend | 5,3 MB (con restos) → 2,6 MB (build limpio) |
| Build backend | 12 s (el "antes" no es comparable: salía en 0 s sin emitir) |
| Build frontend | 14 s con la caché de Turbopack (6 archivos menos tienen un efecto despreciable; no se midió un "antes" para no revertir cambios de otras sesiones) |
| Riesgo residual | **Bajo** en lo eliminado (0 consumidores, compila, tests en verde). **Medio** en el entorno: esquemas de BD local desviados (§6.1–6.2) |
