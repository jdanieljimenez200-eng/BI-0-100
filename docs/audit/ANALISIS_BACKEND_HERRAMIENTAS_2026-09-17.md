# Análisis técnico del backend de las herramientas — BI 0 A 100

**Fecha:** 2026-09-17 · **Commit analizado:** `de630c2` (rama `master`)
**Alcance:** backend de las 8 herramientas (POS, Inventario, Cotizaciones, Clientes, Citas + Google Calendar, Nómina, Contabilidad + canales/liquidaciones/P&L, Mantenimientos), Reportes, alertas operativas y todo lo transversal que usan (gating por plan, permisos de trabajador, rate limit, pool de base de datos, colas).
**Pregunta que responde:** ¿aguanta el backend de herramientas a muchos usuarios reales, cada uno con meses o años de datos, sin perder dinero, historial ni disponibilidad?

---

## Estado (2026-09-22) — Fases 0, 1 y 2 aplicadas

### Fase 2 — control interno

| ID | Estado | Verificación |
|---|---|---|
| P1-6 | ✅ **Cancelar ya no es borrar**: `POST /api/pos/ventas/:id/cancelar` (alias `DELETE`) deja la venta en `estado = 'cancelada'` con quién, cuándo y por qué; genera asientos **inversos** con fecha de hoy (categoría `Cancelaciones`) en vez de borrarlos, y devuelve el almacén con movimientos de **entrada** conservando la salida original. Hace falta el permiso `cancelar_ventas`, aparte de tener el POS. Los asientos derivados (`referencia_tipo` ≠ `ajuste_manual`) ya no se editan ni se borran desde Contabilidad (409, con el nombre de la herramienta donde se corrigen), y el borrado de un manual va en transacción con sus hijos. Tabla `auditoria_dinero` (solo escritura, dentro de la misma transacción) + `GET /api/contabilidad/auditoria`, solo para el dueño | `fase2ControlInterno.test.ts`: cajero sin permiso → 403 y la venta sigue completada; con permiso → cancelada, `cancelada_por_id` = la persona real, neto contable 0, reportes a 0, segunda cancelación 409 sin duplicar; PATCH/DELETE de un asiento de venta → 409; edición y borrado manual auditados |
| P1-7 | ✅ Con `item_pos_id`, el item tiene que ser de la cuenta (404 si no) y el precio sale del catálogo; cobrar otro exige `precio_libre` y la línea guarda `precio_catalogo` junto a lo cobrado, con apunte en la auditoría | Cajero sin permiso a 10 en vez de 100 → 403; con permiso → 201, línea `{cobrado: 10, lista: 100}` y auditoría `100 → 10`; item de otra cuenta → 404 |
| P2-1 | ✅ La cola `calendar-sync` prioriza lo interactivo (1) frente a la sincronización masiva (10) | Prioridades en `workers/calendarQueue.ts` |
| P2-2 | ✅ Un movimiento de almacén con `venta_id` no se borra a mano (409, remite a cancelar la venta) | Test de almacén |
| P2-3 | ✅ Migración `1775630000000`: fuera 3 índices duplicados exactos (`clientes`, `marcas`, `venta_items`) y 3 `(usuario_id)` sueltos ya cubiertos por un compuesto (`clientes`, `citas`, `cotizaciones`); los decoradores correspondientes también | Suite completa |
| P2-4 | ✅ Índice `(usuario_id, producto_id, fecha DESC)` en `movimientos_contables`, que es el orden real del listado | Misma migración |
| P2-5 | ✅ `monedaDeCuenta()`: empleados y cotizaciones nacen en la moneda del país del producto; una moneda explícita se respeta | Test: producto MX → MXN; `moneda: 'USD'` → USD |
| P2-6 | ✅ La purga de papelera vacía por lotes de 5 000 las tablas pesadas (venta_items, movimientos de almacén, ventas, asientos) antes del borrado en cascada, cada lote en su transacción | 17 tests de papelera en verde |
| P2-7 | ✅ `DELETE /contabilidad/movimiento/:id` borra padre e hijos en una transacción | Incluido en P1-6 |
| P3 | ✅ Redondeo de dinero centralizado en `utils/dinero.ts` (`r2`/`r3`/`r4`, sin el fallo de 1,005 → 1,00) y usado en POS, cotizaciones, comisiones, impuestos, almacén, reportes y finanzas · el catálogo de canales ya no se duplica si se renombró un preset (compara también institución + tipo) · lo de la fecha «futura» en UTC de mantenimientos quedó resuelto en la Fase 0 con `hoyDePeticion` | `dinero.test.ts` (5 casos) y suite completa |

**Queda pendiente de P3:** índice trigram (`pg_trgm`) para la búsqueda de clientes; a 20 000 clientes tarda 18 ms, así que no corre prisa hasta ~100 000.

**Queda del lado del frontend** (páginas que otra línea de trabajo está rediseñando): botón de cancelar venta con motivo en el POS (hoy la pantalla no ofrece cancelar), aviso de precio fuera de catálogo, y en Equipo los interruptores de las acciones sensibles — `GET /api/equipo/capabilities` ya las devuelve con `grupo: 'acciones'`, y una UI que solo conozca los grupos de siempre simplemente no las pinta. Mientras tanto se conceden con el mismo `PATCH` de permisos.

### Fase 1

| ID | Estado | Verificación |
|---|---|---|
| P1-2 | ✅ Tabla `secuencias_folio` (migración `1775600000000`, sembrada con el máximo `POS-`/`COT-` existente): `UPDATE … RETURNING` por clave primaria, sin advisory lock ni escaneo. Si alguien importa un folio fuera de secuencia, se resincroniza sola | 20 ventas simultáneas → 20 folios distintos y consecutivos; 0,5 ms por folio (antes 116 ms con 200k ventas y creciendo). **No re-medido con k6** sobre la cuenta de 200k |
| P1-10 | ✅ Usuario, permisos y selección se resuelven una vez por petición (`req`); selección de herramientas en Redis 60 s, invalidada al seleccionar o quitar (plan y permisos siempre frescos). Pool con `statement_timeout` 30 s e `idle_in_transaction_session_timeout` 60 s (`DB_STATEMENT_TIMEOUT_MS`, `DB_IDLE_IN_TX_TIMEOUT_MS`); migraciones y purga de papelera sin límite | Test `SHOW statement_timeout` = 30 s; quitar una herramienta se nota al instante |
| P1-3 (carrera) | ✅ Candado Redis corto por cuenta y herramienta mientras se cuenta y se crea en plan gratuito | 6 altas simultáneas con tope 2 → 2 |
| P1-1 | ✅ `Idempotency-Key` (`idempotente()` en `middleware/idempotency.ts`) en ventas POS, pagos de nómina, movimientos de inventario, alta contable, citas, clientes, registro de mantenimiento, cotizaciones y conversión a venta. Misma clave → misma respuesta (`Idempotent-Replayed: true`); otro cuerpo → 422; 5xx libera la clave. Frontend: POS y nómina la envían | Doble cobro simultáneo → 1 venta |
| P1-4 | ✅ Cursor en cabecera `X-Siguiente` (`?antes=…&limite=…`, máx. 500) en ventas, clientes, cotizaciones, movimientos de inventario, pagos de nómina e historial de mantenimiento; el cuerpo sigue siendo el mismo array/objeto. `/pos/ventas` pagina ventas (no filas unidas) y carga los ítems aparte. El POS tiene «Cargar ventas anteriores». El catálogo de equipos de mantenimiento se deja entero (tope 300) a propósito: no es un historial y el semáforo resume sobre todos | Página de ventas con todos sus ítems; 2 + 1 en cada listado; gasto total de mantenimiento sobre todo el historial |
| P1-8 | ✅ Límite general por usuario (1 200 / 15 min, `RATE_LIMIT_MAX_USUARIO`) con token de firma válida; por IP (300, `RATE_LIMIT_MAX`) sin sesión. `TRUST_PROXY` configurable. **Pendiente:** cupos separados lectura/escritura y confirmar la cadena real de proxies en producción | Test de `usuarioParaLimite` (token falso → IP) |
| P1-9 | ✅ Zod con topes de columna (`utils/limitesNumericos.ts`) en insumos, catálogo POS, edición contable y movimientos; `venta_items.cantidad` a `numeric(12,3)` (migración `1775610000000`); CSV con `fechaISO`, en una sola transacción y solo sobre productos propios; errores de dominio de inventario → 400, el resto 500 | `NaN`, `1e12`, 0,125 kg, `2026-02-30` y CSV ajeno cubiertos en `fase1Herramientas.test.ts` |
| P0-5 | ✅ `workers/runWorker.ts` (`npm run worker` / `worker:prod`), API con `RUN_WORKER=false`, servicio `worker` en `docker-compose.prod.yml` | En contenedor: arranca en 9 s; con SIGTERM termina los trabajos y sale en 1 s sin procesos colgados |

Suite completa en verde contra `bi0a100_test`. `fase1Herramientas.test.ts` (16 tests) cubre lo anterior.

**Queda del lado del frontend** (páginas que otra línea de trabajo está rediseñando): enviar `Idempotency-Key` en inventario, contabilidad, citas, clientes, mantenimientos y cotizaciones, y el botón «Cargar más» en clientes, cotizaciones, movimientos, pagos e historial. Sin eso funcionan como antes: primera página de 200 y sin protección de doble envío.

### Fase 0

| ID | Estado | Verificación |
|---|---|---|
| P0-1 | ✅ Listado paginado por cursor con filtros en servidor; resumen, P&L, canales, liquidaciones y calibración en SQL; exportación CSV en streaming; frontend adaptado | Con 600k movimientos: listado 243 ms (antes caída por OOM), P&L 212 ms (antes 6,9–11 s), `/health` durante el P&L 4 ms (antes 3,3 s), CSV de 600k filas sin caída |
| P0-2 | ✅ Producto con historial → 409; empleado con pagos e insumo con movimientos → archivados; negocio → catálogo e insumos quedan sin negocio; FK a `NO ACTION`/`SET NULL` (migración `1775590000000`) | Tests `fase0Herramientas.test.ts`; borrar la cuenta completa sigue funcionando |
| P0-3 | ✅ Conversión atómica (UPDATE condicional dentro de la transacción) + índice único parcial `ventas(cotizacion_id)` | 3 clics simultáneos → `[201, 409, 409]`, 1 venta |
| P0-4 | ✅ `utils/fechaLocal.ts` en ventas, compras, conversión, contacto de clientes, liquidaciones, mantenimientos y alertas | Test con UTC+14 y UTC−11 |
| P1-3 | ✅ Sin `COUNT(*)` en planes ilimitados | Suite completa |
| P1-5 | ✅ La alerta de stock lee `insumos_inventario` | Test: agotado → rojo, bajo mínimo → amarillo |

Plan completo aplicado (secciones 4 y 8): Fases 0, 1 y 2. Lo que queda son las pantallas que las usan y el índice trigram de clientes, anotados arriba.

## 1. Resumen ejecutivo

**Veredicto: todavía no está listo para muchos usuarios con volumen.** Con cuentas pequeñas funciona bien (52 ventas/s con 10 cajas simultáneas, p95 244 ms). El problema aparece al crecer: los listados y reportes que cargan "todo el historial" escalan con el tamaño de la cuenta, y **una sola cuenta grande puede tumbar el servidor para todos**. Además hay cuatro defectos que pierden o duplican dinero hoy, a cualquier escala.

Lo más grave, **todo demostrado con pruebas reales** (sección 3):

| # | Qué pasa | Impacto |
|---|---|---|
| P0-1 | `GET /contabilidad/:productoId` devuelve **todo** el historial: con 600 000 movimientos genera ~442 MB de JSON y **el proceso muere por falta de memoria** | Caída total de la API para todos los usuarios, provocada por un usuario |
| P0-2 | Borrar un producto **borra físicamente todas sus ventas** (FK `ON DELETE CASCADE`); la contabilidad conserva el ingreso sin venta | Pérdida irreversible de historial + reportes descuadrados |
| P0-3 | Convertir la misma cotización 3 veces a la vez crea **3 ventas** | Ingresos triplicados |
| P0-4 | La fecha de ventas, compras y liquidaciones se calcula en **UTC**: en México, todo lo cobrado después de las 18:00 queda con **fecha del día siguiente** | Cortes de caja, reportes diarios y cierres de mes (IVA) incorrectos |
| P0-5 | Un P&L histórico de una cuenta grande **congela el servidor 3,3 s** para todos los demás | Latencia global impredecible |

Semáforo por herramienta:

| Herramienta | Correctitud | Integridad del historial | Escala | Comentario |
|---|---|---|---|---|
| POS | 🟡 | 🔴 | 🔴 | Folio O(n) bajo lock, sin idempotencia, cancelar = borrar, fecha UTC, precio del cliente |
| Inventario | 🟡 | 🔴 | 🟢 | Bloqueo ordenado correcto; sin validación (acepta `NaN`); borrar insumo borra su historial |
| Cotizaciones | 🔴 | 🟢 | 🟡 | Conversión duplicable; sin paginación |
| Clientes | 🟢 | 🟢 | 🟡 | Validado; lista tope 200 sin paginación |
| Citas / Google | 🟢 | 🟢 | 🟡 | Validado y probado; cola de Google con limitador global compartido |
| Nómina | 🟢 | 🔴 | 🟢 | Borrar un empleado borra su historial de pagos |
| Contabilidad | 🟡 | 🔴 | 🔴 | Todo-el-historial en memoria; asientos derivados editables/borrables |
| Reportes | 🟢 | — | 🟢 | Agregación en SQL, zona horaria y tope de rango: el mejor módulo |
| Mantenimientos | 🟢 | 🟢 | 🟢 | "Hoy" en UTC (desfase de un día por la tarde) |
| Alertas operativas | 🔴 | — | 🟢 | El stock crítico lee una tabla que nadie escribe |

Lo que está **bien** (sección 7): el aislamiento entre cuentas es sólido (ninguna consulta sin filtro de cuenta), las ventas son transaccionales, el descuento de inventario bloquea en orden (sin deadlocks), Reportes agrega en SQL con zona horaria y tope de rango, y las migraciones son reversibles.

---

## 2. Metodología

1. **Lectura de código** de todas las rutas de herramientas (`backend/src/routes/{pos,inventario,cotizaciones,clientes,calendario,googleCalendar,nomina,contabilidad,reportes,mantenimientos}.ts`, 4 989 líneas), sus servicios y el middleware de gating (`middleware/requirePlan.ts`).
2. **Esquema real** consultado en Postgres (claves foráneas, reglas `ON DELETE`, índices, precisión de columnas `numeric`).
3. **Volumen sintético** en `bi0a100_test`: una cuenta con 200 000 ventas (≈ 400 al día durante 500 días), 400 000 líneas, 600 000 movimientos contables, 20 000 clientes y 5 000 citas. `EXPLAIN (ANALYZE, BUFFERS)` de las consultas calientes.
4. **Carga HTTP** contra el backend real (local, puerto 3301) con esa cuenta y con una cuenta pequeña de control.
5. **Pruebas de concurrencia e integridad** con un test de integración temporal (peticiones simultáneas reales contra Postgres y Redis). El test se borró al terminar; los datos de carga también.

**Limitaciones:** las cifras absolutas son de una laptop Windows con Postgres en Docker y bajo presión de memoria (2,5 GB libres de 16 GB); en producción cambiarán. **Las conclusiones relativas** (qué crece con el tamaño de la cuenta, qué bloquea a otros) no dependen del hardware. No verificado: topología real de proxies en producción (afecta al rate limit, ver P1-8) y tamaño real de la base de clientes.

---

## 3. Evidencia medida

### 3.1 Consultas con 200 000 ventas / 600 000 movimientos

| Consulta (dónde se usa) | Plan | Tiempo |
|---|---|---|
| Tope del plan en cada alta: `COUNT(*) ventas` (`routes/pos.ts:95`) | Index Only Scan, 200k filas | 16 ms |
| Folio: `MAX(regexp_replace(numero_ticket))` (`utils/folios.ts:25`), **bajo advisory lock** | **Parallel Seq Scan** 200k filas | **116 ms** |
| `GET /contabilidad/:productoId` (`routes/contabilidad.ts:126`) | 600 000 filas, **~442 MB de JSON** | 376 ms en SQL; el proceso Node muere al serializar |
| P&L histórico (`routes/contabilidad.ts:762`) | Seq Scan 600k filas + hidratación TypeORM | 92 ms SQL; 6,9–11 s en Node |
| Reportes, ventas de 30 días | Bitmap Index Scan | 3,6 ms |
| Búsqueda de clientes `ILIKE '%…%'` (20k) | Seq Scan filtrado | 18 ms |

### 3.2 Carga HTTP

| Escenario | Resultado |
|---|---|
| `POST /pos/ventas` secuencial, cuenta grande | p50 218 ms, p95 286 ms |
| `POST /pos/ventas`, 10 cajas a la vez, **cuenta grande** | **5,8 ventas/s**, p50 1 608 ms, **p95 2 259 ms** |
| `POST /pos/ventas`, 10 a la vez, **cuenta pequeña** | 52,6 ventas/s, p50 177 ms, p95 244 ms |
| `GET /reportes/area/ventas` (30 días) | p50 103 ms |
| `GET /contabilidad/:id/pnl` histórico | 6,9–11 s; **`/health` de otros usuarios congelado hasta 3,3 s** |
| `GET /contabilidad/:id` (600k movimientos) | **`FATAL ERROR: JavaScript heap out of memory`**: el backend se cae |

### 3.3 Pruebas de concurrencia e integridad (peticiones reales simultáneas)

| Prueba | Resultado |
|---|---|
| Convertir la misma cotización 3 veces a la vez | `[201, 201, 201]` → **3 ventas** |
| Enviar la misma venta dos veces (doble clic o reintento de red) | `[201, 201]` → **2 ventas** |
| Tope gratuito de 2 movimientos, 6 altas simultáneas de clientes | `[201,201,201,429,429,429]` → **3 creados** |
| Borrar un producto con una venta | 200 → **0 ventas**; queda **1 ingreso contable huérfano de $58** |
| Crear un insumo con `stock_actual: "mucho"` | 201 → se guarda **`NaN`** en stock y costo |
| Vender con precio `1e12` | **500** (desbordamiento de `numeric(12,2)`) |
| Vender cantidad `0.125` | Guarda `cantidad = 0.13` pero `subtotal = 1.25` (debería ser 1.30) |
| Venta a las 20:59 de México (02:59 UTC) | Fecha guardada **2026-09-18**; fecha local **2026-09-17** |
| Importar CSV con `2026-02-30` | **500**, 0 filas (JavaScript lo toma como 2 de marzo; Postgres lo rechaza) |

---

## 4. Hallazgos priorizados

Formato: **ID · título** — evidencia (archivo:línea) · por qué importa con muchos usuarios · arreglo recomendado · esfuerzo (S ≤ 1 día, M 2–4 días, L ≥ 1 semana).

### P0 — Bloqueantes antes de crecer

**P0-1 · Listados y cálculos contables cargan todo el historial en memoria**
- `GET /:productoId` (`routes/contabilidad.ts:126`): `getMany()` sin límite. Hacen lo mismo el P&L (`:762`), `analisis-canales` (`:684`), `liquidaciones` (`:609`) y la recalibración tras cada importación CSV (`:411`).
- Medido (3.1/3.2): 442 MB de JSON → **caída del proceso**. El P&L tarda 7–11 s y **congela el event loop 3,3 s** para todos.
- Un restaurante con 300 ventas al día genera unos 1 000 movimientos diarios. En un año es un tamaño que tumba el servidor, y basta con abrir la pestaña Contabilidad.
- **Arreglo:**
  - paginación por cursor (`fecha DESC, id DESC`, 100 por página) en el listado y en liquidaciones;
  - P&L, análisis de canales y calibración con `GROUP BY` en SQL, con rango obligatorio (por defecto el mes actual);
  - tope duro de filas en cualquier `getMany` de herramientas.
- **Esfuerzo:** M.

**P0-2 · Borrados físicos que destruyen historial**
- `DELETE /api/productos/:id` hace `remove()` (`routes/productos.ts:310-331`), y en la base `ventas.producto_id → productos` es `ON DELETE CASCADE`. Medido: la venta desaparece y la contabilidad conserva el ingreso sin venta.
- Mismo patrón en otras tablas:
  - `pagos_nomina.empleado_id` es CASCADE (`routes/nomina.ts:121`): borrar un empleado borra su historial de nómina, que en México hay que conservar;
  - `movimientos_inventario.insumo_id` e `item_pos_insumos.insumo_id` son CASCADE (`routes/inventario.ts:106`);
  - `items_pos` e `insumos_inventario` son CASCADE desde `negocios`.
- **Arreglo:**
  - archivado (`activo = false` / `archivado_en`) en lugar de `remove()` para productos, empleados, insumos, ítems de catálogo y negocios;
  - migración que cambie esas FK a `RESTRICT`, de modo que un borrado físico accidental falle en vez de arrasar;
  - un borrado real solo desde la papelera de cuenta.
- **Esfuerzo:** M.

**P0-3 · Conversión de cotización duplicable**
- `routes/cotizaciones.ts:305` comprueba `estado === 'aceptada'` fuera de la transacción y sin bloqueo; el `update` de `:390` es incondicional. Medido: 3 peticiones simultáneas → 3 ventas.
- **Arreglo:**
  - dentro de la transacción, como primera sentencia: `UPDATE cotizaciones SET estado='aceptada' WHERE id=$1 AND usuario_id=$2 AND estado <> 'aceptada' RETURNING id`; si no devuelve fila → 409;
  - además, índice único parcial `ventas(cotizacion_id) WHERE cotizacion_id IS NOT NULL`.
- **Esfuerzo:** S.

**P0-4 · "Hoy" calculado en UTC**
- Hay 8 sitios con `new Date().toISOString().slice(0, 10)`:
  - `routes/pos.ts:382` (fecha de venta);
  - `routes/inventario.ts:168`;
  - `routes/cotizaciones.ts:341` (fecha de la venta convertida);
  - `routes/contabilidad.ts:649` (fecha de liquidación);
  - `routes/clientes.ts:216` y `services/crm/resolverCliente.ts:65,96`;
  - `routes/mantenimientos.ts:165,272` (vía `aISO(new Date())`).
- Medido: una venta a las 20:59 de México queda fechada al día siguiente.
- Cada noche, lo cobrado desde las 18:00 cuenta al día siguiente. **El último día del mes pasa al mes siguiente** (IVA, P&L mensual). Reportes sí convierte la zona horaria para la hora (`reportesAreas.ts:155`), así que la hora y el día de una misma venta no cuadran.
- **Arreglo:**
  - helper `hoyEnZona(zona)` con `Intl.DateTimeFormat('en-CA', { timeZone })`, usando `usuarios.zona_horaria`, que ya se guarda en cada petición desde el commit `de630c2`, con el país como respaldo;
  - aplicarlo en los 8 sitios;
  - migración opcional para corregir ventas pasadas, si se decide.
- **Esfuerzo:** S–M.

**P0-5 · Trabajo pesado en el hilo de la API**
- Es consecuencia de P0-1: hidratar cientos de miles de entidades TypeORM es CPU síncrona y bloquea a todos.
- Además, el worker de análisis y el de Google Calendar corren **en el mismo proceso** que la API (`app.ts`, `startAnalysisWorker`/`startCalendarWorker`), y no existe un entrypoint para sacarlos a otro proceso (`RUN_WORKER=false` apaga el worker, pero no hay nada que lo arranque en otro lado).
- **Arreglo:**
  - resolver P0-1;
  - crear `src/workers/runWorker.ts` y un servicio aparte en Railway/Compose.
- **Esfuerzo:** S.

### P1 — Necesarios para operar con muchos usuarios

**P1-1 · Sin idempotencia en ninguna alta de herramientas**
- `middleware/idempotency.ts` solo se usa en los análisis. Medido: doble envío → 2 ventas.
- En el POS, un reintento por mala señal (muy común en móvil) cobra dos veces en el sistema.
- **Arreglo:** cabecera `Idempotency-Key` (UUID por intento de guardado desde el frontend), guardada con `SET NX` en Redis con la respuesta, 24 h, en `POST` de ventas, pagos de nómina, movimientos de inventario y contabilidad, conversión de cotización y registro de mantenimiento.
- **Esfuerzo:** M.

**P1-2 · El folio escanea todas las ventas de la cuenta, con el lock tomado**
- `utils/folios.ts:21-25`: advisory lock por cuenta y luego `MAX(regexp_replace(...))`, un Seq Scan de todas las ventas (116 ms con 200k). Lo usan también las cotizaciones convertidas.
- Medido: la cuenta grande no pasa de 5,8 ventas/s con p95 de 2,3 s.
- Cada venta en espera **retiene una conexión del pool** (`DB_POOL_MAX=20`, `config/database.ts:106`). Dos negocios grandes en hora pico pueden agotar el pool y entonces esperan todos (con timeout de 5 s).
- **Arreglo:**
  - tabla `secuencias_folio(usuario_id, tipo, ultimo)` con `UPDATE … SET ultimo = ultimo + 1 RETURNING ultimo`: O(1), bloqueo de fila y sin advisory lock;
  - la misma técnica en `cotizaciones.ts:96-100`;
  - migración que la inicialice con el máximo actual.
- **Esfuerzo:** S–M.

**P1-3 · El tope del plan gratuito se cuenta en cada alta, también en planes ilimitados**
- `middleware/requirePlan.ts:291-326` ejecuta `getCount` antes de mirar el plan. Son 8 herramientas (`routes/*.ts`, `requireHerramientaAccess(x, contar…)`) con `COUNT(*)` O(n) del historial (16 ms con 200k, creciendo).
- Además hay carrera: medido 3 altas con tope de 2.
- **Arreglo:**
  - `if (max === -1) return next()` antes de contar;
  - para freemium, contar y crear dentro de la misma transacción con un advisory lock por cuenta y herramienta.
- **Esfuerzo:** S.

**P1-4 · Listados truncados y sin paginación**
- `GET /pos/ventas` (`routes/pos.ts:303`) usa `.limit(200)` con `leftJoinAndSelect(items)`, que en TypeORM limita **filas unidas, no ventas**. Medido: con 2 ítems por venta, **muestra 100 ventas**, y la última puede venir con ítems incompletos.
- Sin paginación ni cursor:
  - ventas: 200;
  - clientes: 200 (`routes/clientes.ts:74`);
  - cotizaciones: 200 (`:146`);
  - movimientos de inventario: 200;
  - pagos de nómina: 100;
  - equipos de mantenimiento: 300.
- Pasado ese número, el usuario **no puede ver su historial** desde la herramienta.
- **Arreglo:** `take/skip` (TypeORM pagina bien entidades con join) o consulta de ids + carga de ítems; cursor `?antes=<fecha,id>` y respuesta `{ datos, siguiente }` en todos los listados.
- **Esfuerzo:** M.

**P1-5 · La alerta de stock crítico no ve el inventario real**
- `services/alertas/agregadorOperativo.ts:65-85` lee `articulos`, pero la herramienta de Inventario escribe en `insumos_inventario` y el POS en `items_pos`. Fuera de `scripts/seed-alertas-demo.ts`, **nada escribe en `articulos`** (grep).
- La tabla nació en la migración `1775100000000-ArticulosYContactos` como "Fase 1" de una unificación que no se completó.
- Consecuencia: el panel de alertas **nunca avisa de un insumo agotado**.
- **Arreglo:** leer de `insumos_inventario` (stock ≤ mínimo, activo); o terminar la unificación con sincronización y un plan de migración explícito.
- **Esfuerzo:** S.

**P1-6 · Control interno: borrar en lugar de cancelar, y permisos todo o nada**
- `DELETE /pos/ventas/:id` (`routes/pos.ts:600`) borra la venta, sus ítems, sus asientos y sus movimientos de inventario. **No queda rastro** de que existió.
- Cualquier trabajador con permiso `pos` puede hacerlo. Los permisos son booleanos por herramienta (`models/AsignacionTrabajador.ts:20-36`), sin separar ver, crear, editar y borrar.
- En Contabilidad, `PATCH` y `DELETE /movimiento/:id` (`routes/contabilidad.ts:312,326`) permiten cambiar el monto o borrar **asientos derivados** del POS, nómina, inventario o mantenimientos, y descuadran Contabilidad frente a Reportes y ventas. El `DELETE` son dos sentencias sin transacción.
- En negocios con empleados, esto facilita el fraude clásico de caja: cobrar, borrar la venta y quedarse el efectivo.
- **Arreglo:**
  - cancelación como estado (`estado='cancelada'`, `cancelada_por`, `motivo`, `fecha_cancelacion`) que revierte inventario y genera **asientos inversos**, no borrados;
  - permiso separado "cancelar ventas";
  - bloquear `PATCH`/`DELETE` de movimientos con `referencia_tipo` (se corrigen desde su herramienta);
  - tabla de auditoría de cambios en dinero.
- **Esfuerzo:** L.

**P1-7 · El precio lo decide el cliente**
- `POST /pos/ventas` toma `precio_unitario` del cuerpo aunque venga `item_pos_id` (`routes/pos.ts:448-456`). `item_pos_id` tampoco se valida como propio: un ítem de otra cuenta no descuenta nada, pero queda enlazado.
- **Arreglo:** con `item_pos_id`, usar el precio del catálogo propio. Un precio distinto exige permiso y se guarda como `precio_catalogo` junto a `precio_cobrado`.
- **Esfuerzo:** S–M.

**P1-8 · El rate limit es por IP y muy bajo para un negocio con varias cajas**
- `middleware/cors.ts:160-169`: 300 peticiones cada 15 minutos por IP (unas 20 por minuto), con clave por defecto `req.ip`.
- Todas las cajas y tablets de un negocio salen por la misma IP pública.
- En México las operadoras móviles usan CGNAT: **desconocidos comparten IP y se agotan el cupo entre sí**.
- **No verificado:** con `trust proxy = 1` (`app.ts:55`), si en producción hay dos saltos (p. ej. Cloudflare + proxy del hosting), `req.ip` sería la IP del proxy y **toda la plataforma compartiría un solo cupo**.
- **Arreglo:**
  - clave por `userId` (del JWT) para peticiones autenticadas, con la IP como respaldo;
  - cupos separados para lectura y escritura;
  - validar la cadena de proxies real y ajustar `trust proxy`.
- **Esfuerzo:** S.

**P1-9 · Entradas sin validar que acaban en `NaN` o en 500**
- `POST /inventario/insumos` (`routes/inventario.ts:53-89`): `Number("mucho")` → `NaN` → Postgres lo guarda (`numeric` admite NaN) y envenena la valuación de almacén. Medido.
- `PATCH /pos/catalogo/:id`, `PATCH /inventario/insumos/:id` y `PATCH /contabilidad/movimiento/:id` no tienen esquema: un `nombre: null` o un número como texto da 500.
- Sin topes: precio `1e12` → 500 (medido); `cantidad` mayor que 999 999,99 → 500.
- `venta_items.cantidad` es `numeric(8,2)`: 0,125 kg se guarda como 0,13 mientras el subtotal usa 0,125 (medido).
- La importación CSV acepta `2026-02-30` (`contabilidad.ts:96-106`, `Date.parse`) → 500 a mitad de lote. Con más de 500 filas, **los lotes anteriores quedan guardados**.
- La importación no comprueba que `productoId` sea de la cuenta.
- `POST /inventario/movimientos` devuelve **cualquier** error como 400 con el mensaje interno de la base (`routes/inventario.ts:248-254`): filtra detalles y oculta fallos transitorios.
- **Arreglo:**
  - esquemas Zod en todos los `POST`/`PATCH` restantes, con topes alineados con las columnas;
  - `fechaISO` en el CSV;
  - importación en una sola transacción;
  - `cantidad numeric(12,3)`;
  - distinguir 4xx de 5xx.
- **Esfuerzo:** M.

**P1-10 · Coste fijo por petición del gating**
- Antes de llegar a la lógica, cada petición de herramienta ejecuta:
  - `requireToolCapability`: carga el usuario (fila completa, con `datos_negocio` jsonb) y la selección de herramientas;
  - `requireHerramientaAccess`: vuelve a cargar el usuario y la selección;
  - en altas, un tercer middleware: usuario + selección + `COUNT`;
  - para trabajadores, además dueño + asignaciones, dos veces.
- Son **4–11 consultas por petición** (`middleware/requirePlan.ts:141-334`).
- No hay `statement_timeout` ni `idle_in_transaction_session_timeout` (`config/database.ts:105-109`): una consulta lenta retiene su conexión indefinidamente.
- **Arreglo:**
  - resolver usuario, cuenta, plan, selección y permisos **una vez** por petición en `req.contexto`;
  - caché de 60 s en Redis invalidada al cambiar plan, selección o asignaciones (ya existe el gancho `invalidatePlanCache`);
  - `statement_timeout` de 10–15 s en el pool.
- **Esfuerzo:** M.

### P2 — Mejoras de robustez

| ID | Hallazgo | Evidencia | Arreglo | Esfuerzo |
|---|---|---|---|---|
| P2-1 | La cola `calendar-sync` tiene un limitador **global** de 5 trabajos/s y concurrencia 2 para todas las cuentas: conectar un calendario con 500 citas retrasa ~100 s los cambios de los demás | `workers/calendarQueue.ts:85-92` | Prioridad alta a los cambios interactivos (`priority: 1`) y baja a la sincronización masiva | S |
| P2-2 | Borrar un movimiento de inventario no revierte el stock (documentado); si era de una venta, rompe la reversión al cancelarla | `routes/inventario.ts:257-271` | Prohibir borrar movimientos con `venta_id`; ofrecer "movimiento inverso" | S |
| P2-3 | Índices duplicados en tablas calientes (encarecen cada escritura): `clientes(usuario_id, tipo_contacto)` ×2, `venta_items(item_pos_id)` ×2, y `(usuario_id)` sueltos que ya cubre un índice compuesto | `pg_indexes` | Migración de limpieza | S |
| P2-4 | Falta índice para el orden más usado de contabilidad: `(usuario_id, producto_id, fecha DESC)` | EXPLAIN 3.1 (usa `fecha` y filtra) | Índice compuesto al paginar (P0-1) | S |
| P2-5 | La moneda por defecto es `'USD'` en empleados y cotizaciones, aunque el producto sea mexicano | `routes/nomina.ts` (esquema), `routes/cotizaciones.ts:39` | Tomar la moneda del país del producto o de la cuenta | S |
| P2-6 | Borrar una cuenta grande tarda 46 s en una sola transacción (medido al limpiar) y la purga diaria de la papelera la hace así | limpieza de la cuenta de carga | Purga por lotes | S |
| P2-7 | `DELETE /contabilidad/movimiento/:id` hace dos sentencias sin transacción | `routes/contabilidad.ts:326-331` | Envolver en transacción (y P1-6) | S |

### P3 — Menores

- La búsqueda de clientes usa `ILIKE '%…%'` sin índice trigram: 18 ms con 20k, suficiente por ahora; `pg_trgm` a partir de ~100k.
- El redondeo `Math.round(x * 100) / 100` tiene los casos de coma flotante típicos (1,005 → 1,00). Conviene centralizarlo en una función de dinero o usar céntimos enteros.
- `seed-defaults` de canales deduplica por nombre: si alguien renombra un preset, se vuelve a crear.
- Los mantenimientos rechazan fechas "futuras" comparando con el día UTC: en zonas al este de UTC, justo después de medianoche, se rechaza la fecha de hoy.

---

## 5. Análisis por herramienta

### 5.1 POS (`routes/pos.ts`, `services/pos/*`, `utils/folios.ts`)
- **Bien:**
  - la venta, sus ítems, el descuento de inventario, los asientos (ingreso, IVA, comisiones) y el vínculo con el CRM van en **una sola transacción**;
  - el costo se congela en la línea (`costo_unitario_snapshot`);
  - la validación de pertenencia del cliente ocurre dentro de la transacción;
  - el canal de cobro se valida (activo y de la cuenta).
- **Mal:**
  - folio O(n) bajo lock (P1-2);
  - sin idempotencia (P1-1);
  - fecha UTC (P0-4);
  - precio del cliente (P1-7);
  - cancelar = borrar (P1-6);
  - listado truncado (P1-4);
  - `PATCH /catalogo` sin esquema y `POST /catalogo` sin verificar que `negocio_id` sea propio (P1-9).
- **Capacidad medida:** 52 ventas/s en una cuenta pequeña; 5,8 ventas/s en una de 200k ventas. Con 10 cajas en la cuenta grande, el p95 pasa de 2 s.

### 5.2 Inventario (`routes/inventario.ts`, `services/inventario/*`, `services/pos/inventarioVenta.ts`)
- **Bien:**
  - `pessimistic_write` con los insumos **ordenados por id** (sin deadlocks entre ventas concurrentes);
  - costo promedio ponderado;
  - la compra genera el egreso en la misma transacción;
  - el stock negativo se permite con advertencia, lo razonable para no bloquear una venta real.
- **Mal:**
  - `NaN` y 500 por falta de esquema (P1-9);
  - borrar un insumo borra su historial en cascada (P0-2);
  - borrar un movimiento no revierte el stock (P2-2);
  - errores de base devueltos como 400 (P1-9);
  - la alerta de stock no lo ve (P1-5).

### 5.3 Cotizaciones (`routes/cotizaciones.ts`)
- **Bien:** folio con advisory lock e índice único `(usuario_id, numero)`; edición validada (commit `8286a18`); el vínculo con el CRM valida pertenencia.
- **Mal:**
  - conversión duplicable (P0-3);
  - folio O(n) (P1-2);
  - la venta convertida lleva fecha UTC (P0-4) y no descuenta inventario (por diseño: los ítems son texto libre; conviene documentarlo en la interfaz);
  - lista tope 200 (P1-4);
  - moneda USD por defecto (P2-5).

### 5.4 Clientes (`routes/clientes.ts`, `services/crm/resolverCliente.ts`)
- **Bien:** esquema completo con longitudes de columna, negocio y producto propios, `atributos_extra` filtrado por vertical.
- **Mal:** lista tope 200 sin paginación (P1-4); `fecha_ultimo_contacto` en UTC (P0-4).

### 5.5 Citas y Google Calendar (`routes/calendario.ts`, `routes/googleCalendar.ts`, `services/google/*`, `workers/calendarQueue.ts`)
- **Bien:**
  - validación completa (fechas y horas reales, fin después del inicio, datos propios);
  - la sincronización es asíncrona e idempotente (id de evento derivado de la cita);
  - `state` firmado y de un solo uso; token cifrado;
  - 13 tests de integración.
- **Mal:** limitador global de la cola (P2-1).

### 5.6 Nómina (`routes/nomina.ts`)
- **Bien:** el pago y su egreso van en una transacción con referencia cruzada; periodo validado.
- **Mal:** borrar un empleado borra su historial de pagos (P0-2); moneda USD por defecto (P2-5).

### 5.7 Contabilidad, canales y liquidaciones (`routes/contabilidad.ts`, `services/contabilidad/*`)
- **Bien:**
  - desglose de comisión, IVA y retenciones correcto y probado;
  - conciliación que también liquida los asientos hijos;
  - canales solo sobre productos propios;
  - tope freemium por movimientos manuales.
- **Mal:**
  - todo el historial en memoria y la caída medida (P0-1);
  - asientos derivados editables o borrables (P1-6);
  - importación CSV no atómica y con fechas imposibles (P1-9);
  - dos topes freemium distintos que se solapan: 2 por el middleware y 3 por producto en el handler (`contabilidad.ts:84`); solo aplica el primero, hay que unificarlos.

### 5.8 Reportes (`routes/reportes.ts`, `services/reportes/*`)
- **El mejor módulo:**
  - agrega en SQL;
  - tope de rango de 5 años (`reportes.ts:22-60`);
  - convierte la zona horaria (`reportesAreas.ts:155`);
  - una fuente por consulta, sin doble conteo;
  - permisos por área para trabajadores.
- **Mal:** hereda el error de fecha UTC de las ventas (P0-4); el panel lanza muchas consultas por carga sin caché (conviene una caché de 30–60 s por cuenta y rango cuando haya muchos usuarios).

### 5.9 Mantenimientos (`routes/mantenimientos.ts`)
- **Bien:** catálogo determinista, IA solo si hace falta y con cobro y reembolso correctos, egreso transaccional, fechas validadas.
- **Mal:** "hoy" en UTC (P0-4); lista tope 300.

### 5.10 Alertas operativas (`services/alertas/*`)
- **Mal:** el stock crítico lee `articulos` (P1-5).

---

## 6. Capacidad y cuellos de botella

1. **Memoria del proceso (P0-1).** El primer límite que se alcanza. Depende del tamaño de **una** cuenta, no del número de usuarios, así que puede ocurrir con un solo cliente grande.
2. **Event loop (P0-1, P0-5).** Cualquier cálculo que hidrata decenas de miles de entidades congela el servidor para todos.
3. **Pool de base de datos (P1-2, P1-10).** 20 conexiones por instancia. Las ventas de una cuenta grande esperan el advisory lock con la conexión tomada, y cada petición hace 4–11 consultas de gating.
4. **Folio (P1-2).** Techo de unas 6 ventas/s por cuenta grande (medido), y baja a medida que la cuenta crece.
5. **Rate limit por IP (P1-8).** Límite artificial para negocios con varias cajas o usuarios detrás de CGNAT.

Con los P0 y P1 resueltos, el diseño aguanta volumen: el SQL de Reportes ya está preparado, los índices por cuenta existen y el aislamiento es correcto.

---

## 7. Lo que ya está bien (no tocar)

- **Aislamiento entre cuentas:** revisé todas las lecturas y escrituras por id de las 10 rutas; todas filtran por `usuario_id` (o por `cuenta_id` en Google). Trabajadores y dueños resuelven la cuenta efectiva en el middleware.
- **Transaccionalidad** de venta, compra, pago de nómina, mantenimiento con costo, conversión de cotización y liquidación.
- **Bloqueos ordenados** en inventario (sin deadlocks).
- **Reportes:** SQL, zona horaria, tope de rango y permisos por área.
- **Esquema:** las FK de datos de negocio usan `SET NULL` (clientes, citas, canales), con índices por cuenta en todas las tablas calientes y migraciones reversibles.
- **Validación** con Zod en citas, clientes, cotizaciones, nómina, mantenimientos y ventas (commits `8286a18` y `de630c2`).
- **Tests:** 1 072 en verde, con integración real contra Postgres y Redis y tests de flujos entre herramientas.

---

## 8. Plan de remediación recomendado

**Fase 0 — antes de abrir a más usuarios (≈ 1–1,5 semanas)**
1. P0-1: paginación de contabilidad y liquidaciones; P&L, canales y calibración en SQL con rango.
2. P0-3: conversión atómica de cotizaciones + índice único.
3. P0-4: `hoyEnZona` en los 8 sitios.
4. P0-2: archivado en lugar de borrado + FK a `RESTRICT`.
5. P1-3: no contar el tope en planes ilimitados (una línea, gran efecto).
6. P1-5: alerta de stock desde `insumos_inventario`.

**Fase 1 — escala y control (≈ 2 semanas)**
1. P1-2 (secuencias de folio) y P1-10 (contexto por petición + caché + `statement_timeout`).
2. P1-1 (idempotencia en altas).
3. P1-4 (paginación por cursor en todos los listados; arregla `/pos/ventas`).
4. P1-8 (rate limit por usuario y verificación de proxies).
5. P1-9 (esquemas pendientes, CSV atómico, `cantidad numeric(12,3)`).
6. P0-5 (worker en proceso aparte).

**Fase 2 — control interno (≈ 2 semanas)**
1. P1-6: cancelación con asientos inversos, permisos granulares y auditoría.
2. P1-7: precio de catálogo y precio cobrado.
3. P2 y P3.

**Para cada fase:** convertir las pruebas de este análisis en tests permanentes: concurrencia (conversión, doble envío, tope), borrado de producto, fecha nocturna y un test de volumen con 50k filas en CI. Los scripts k6 de `scripts/load/` ya existen para medir antes y después.

---

## Anexo A — Reproducir las mediciones

- **Volumen:** script SQL con `generate_series` (una cuenta con 200k ventas, 400k líneas, 600k movimientos, 20k clientes, 5k citas) cargado en `bi0a100_test` en 53 s; `ANALYZE` después.
- **Consultas:** `EXPLAIN (ANALYZE, BUFFERS)` de las consultas de las secciones 3.1 y 4.
- **HTTP:** backend local (`ts-node --transpile-only src/app.ts`, puerto 3301, `bi0a100_test`, Redis db 15) y un script Node con `fetch` concurrente (10 clientes, 60 peticiones), comparando la cuenta grande con una pequeña.
- **Bloqueo:** `/health` sondeado cada 100 ms mientras corre `GET /contabilidad/:id/pnl`.
- **Concurrencia e integridad:** test Jest de integración temporal con `Promise.all` de peticiones reales (supertest) contra Postgres y Redis.

Los datos sintéticos y el test temporal se borraron al terminar.
