# Auditoría de la base de datos — 2026-09-27

**Pregunta:** ¿la base de datos funciona con el proyecto, en todos sus detalles?

**Respuesta corta:** el esquema que crean las migraciones —el que tendría producción—
**sí** funciona con el código: todas las columnas que el código usa existen, las 159
consultas SQL crudas son válidas, las FK y los CHECK coinciden con lo que el código
espera. Los fallos estaban alrededor del esquema: una configuración que dañaba bases sin
avisar, validaciones que dejaban pasar datos que no caben en su columna, índices que
faltaban, rollbacks que no se podían ejecutar y tu base de desarrollo, que está dañada.
Todo lo que es código está corregido y `bi0a100_db` quedó reparada, sin perder una
sola fila, e idéntica en significado a producción.

---

## Método

Se trabajó con cuatro bases del Postgres 15.17 de Docker, sin escribir en la de
desarrollo salvo aplicar la migración nueva:

| Base | Para qué |
|---|---|
| `bi0a100_auditoria_ref` | **Nueva, creada desde cero** solo con las migraciones: es lo que tendría un despliegue limpio de producción. |
| `bi0a100_test` | La de la suite. |
| `bi0a100_db` | Tu desarrollo. Solo lectura (más la migración nueva, aditiva). |
| copias `…_rev` y `…_devcopia` | Ensayo de rollback y ensayo de la reparación. |

Comparaciones hechas **por definición y no por nombre** (el `synchronize` antiguo dejó
nombres autogenerados como `FK_a1d19caf…`), normalizando la notación de Postgres.

| Comprobación | Herramienta |
|---|---|
| ¿Las migraciones aplican en una base vacía? | `migration:run` sobre la base nueva |
| Entidades ↔ migraciones | `createSchemaBuilder().log()` de TypeORM (calcula lo que haría `synchronize` sin ejecutarlo) + emparejado por definición |
| Producción ↔ test ↔ desarrollo | Foto normalizada del catálogo: tablas, 792 columnas, restricciones, índices, triggers, funciones |
| SQL crudo | Cobertura de la suite sobre todo `src/` + `PREPARE` de lo no ejecutado |
| Rollback | `down` de las 62 migraciones hasta cero y vuelta a aplicar |
| Validación de la API ↔ tamaño de columna | Cruce de cada campo Zod de las rutas con su `varchar(n)` / `numeric(p,s)` / `integer` |
| CHECK ↔ tipos del código | Lista de cada CHECK contra la unión de literales de la entidad |
| Integridad de los datos de dev | Huérfanos, duplicados, valores fuera de catálogo, invariantes de negocio |
| Conexión | `statement_timeout`, `idle_in_transaction`, `max_connections`, zona horaria, ida y vuelta de un `timestamp` |

---

## Hallazgos

### 1. `synchronize` estaba activo por defecto · P0 · corregido

[`config/database.ts`](../../backend/src/config/database.ts) tenía
`synchronize: !isProd && TYPEORM_SYNCHRONIZE !== 'false'`. Docker fija la variable, pero
**cualquier proceso fuera de Docker sincronizaba al conectar**: `npm run seed:demo`,
`npm run seed:alertas` (el flujo que documenta este mismo repositorio), un
`npm run dev` local o un script. Contradice la regla 1 de `CLAUDE.md`.

**Prueba de que es la causa del daño de `bi0a100_db`:** le faltan exactamente los 31
índices que `synchronize` borra (31 de 31 son índices que crean las migraciones y la
entidad no declara), y le sobran exactamente los objetos que `synchronize` añade.

**Corrección:** `synchronize: false` fijo, sin interruptor. Test de regresión
[`__tests__/config/database.test.ts`](../../backend/src/__tests__/config/database.test.ts)
(con el código antiguo, el caso «desarrollo sin la variable» daba `true`).

### 2. Un presupuesto de Marketing con centavos tumbaba el análisis · P0 · corregido

El formulario deja escribir `8500.50`, la ruta lo aceptaba y el worker lo guardaba en
`analisis_marketing.presupuesto_mensual`, que es `integer`. Postgres:
`invalid input syntax for type integer: "8000.5"` (comprobado). El análisis acababa en
error **al final**, después de haber pagado todas las llamadas a la IA.
**Corrección:** se redondea al guardar
([`marketingOrchestrator.ts`](../../backend/src/services/marketing/marketingOrchestrator.ts))
y la ruta pone tope `MAX_ENTERO`.

### 3. Validaciones que dejaban pasar datos que no caben · P1 · corregido

Un valor mayor que su columna pasaba Zod y el INSERT respondía **500** (y alertaba a
Sentry). Seis campos de dinero incumplían además la regla escrita de `CLAUDE.md`
(«usa `dinero()`, `cantidad()`…»).

| Ruta | Campo(s) | Columna de destino |
|---|---|---|
| Contabilidad | `monto` · `descripcion` · `categoria` · `institucion` · `comision_fija` | numeric(12,2) · varchar(255) · (100) · (100) · numeric(12,2) |
| Contabilidad (editar) | `descripcion` con `.max(500)` | **varchar(255)**: de 256 a 500 caracteres reventaba el UPDATE |
| Nómina | `salario`, `monto` | acaban en `movimientos_contables.monto` numeric(12,2) |
| Nómina | `nombre`, `cargo`, `moneda`, `telefono`, `email` | varchar(200/100/10/30/200) |
| Cotizaciones | `precio_unitario`, `cantidad`, `descripcion` del item | pasan a `venta_items` al convertir: la cotización se guardaba y luego **no se podía convertir** |
| Cotizaciones | `impuesto_tasa` sin tope | numeric(5,2); ahora 0–100 |
| Cotizaciones | `moneda` | se copia a `ventas.moneda`, **varchar(3)** |
| Cotizaciones | `cliente_*`, `impuesto_nombre` | varchar(200/30/20) |
| POS | item de catálogo, línea de carrito, cliente, receta | varchar(255/100/500/8/200/30), `integer`, numeric(12,3) |
| Legal | `numero_empleados` | `integer` |

Descartados tras verificarlos (falsos positivos del cruce automático): los campos de
Mercado (no escribe en `productos`), `inversion_inicial` de Finanzas (va a jsonb), los
emoji validados por puntos de código (coinciden con cómo cuenta Postgres) y los que ya
tenían el tope correcto.

**Red de seguridad:** [`errorHandler.ts`](../../backend/src/middleware/errorHandler.ts)
responde 400 a 22001/22003/22P02/22007/22008/23514 y 409 a 23505, con un mensaje
genérico (el de Postgres lleva nombres de columna y valores) y sin alertar a Sentry.
Solo cubre las rutas que delegan con `ah()`; las 80 que hacen `res.status(500)` por su
cuenta no pasan por él. Tests: 7 del manejador y 5 de Cotizaciones.

### 4. `bi0a100_db` estaba dañada · P1 · reparada el 2026-09-27

**Aplicada con autorización del usuario.** Antes: respaldo completo con `pg_dump` y
nueva comprobación de los datos (todo en cero). Resultado: 49 sentencias en una
transacción, las 52 tablas con exactamente las mismas filas, y el esquema **idéntico en
significado a producción**: 52 tablas, 104 FK, 25 CHECK y 204 índices en ambas, cero
diferencias. Backend sano después (`/health` 200, sin errores en el log).

Frente a producción le faltan **4 FK** (`usuarios.owner_id`, `ventas.cotizacion_id`,
`cotizaciones.cliente_id`, `movimientos_inventario.venta_id`), **4 CHECK** (estado de
expertos, patrocinios y reseñas, puntuación 1–5) y **32 índices**, entre ellos el
**único de `usuarios.email`** (dev admite correos duplicados). Le sobran 3 objetos que
añadió el `synchronize`. Diferencias menores de defaults y de `tamano_equipo`.

**Los datos están sanos:** cero huérfanos en las FK que faltan, cero correos duplicados,
cero valores fuera de catálogo, cero comisiones o estados de liquidación nulos, ventas
que cuadran con sus líneas. Por eso **se puede reparar sin recrearla ni perder nada.**

[`reparar_bi0a100_db_2026-09-27.sql`](reparar_bi0a100_db_2026-09-27.sql): una sola
transacción, no toca filas. **Ensayado en una copia**: tras aplicarlo, la copia es
idéntica a producción en significado (solo difiere cómo imprime Postgres `0` frente a
`'0'` y dos notaciones equivalentes de un mismo CHECK) y conserva todas sus filas.

### 5. Claves foráneas sin índice · P1 · corregido

Postgres no indexa el lado hijo de una FK. Al borrar un producto, un cliente o un canal
de cobro, la acción de la FK recorría la tabla entera **de todas las cuentas** con el
candado tomado; lo peor, `movimientos_contables.producto_id` (hay cuentas con 600 000
movimientos). `ventas.canal_cobro_id` además lo declara la entidad y ninguna migración lo
había creado.

**Corrección:** migración
[`1775660000000-IndicesClavesForaneas`](../../backend/src/migrations/1775660000000-IndicesClavesForaneas.ts)
con 8 índices (parciales donde la columna casi siempre va vacía). También quita la FK
duplicada de `marcas.producto_id` (el Baseline y `MarcaLogoAndBrief` crearon la misma
dos veces), solo si existen las dos. Quedan sin índice FK hacia `negocios` y otras de
tablas pequeñas o de borrado raro: ver «Lo que no se tocó».

### 6. Tres rollbacks no se podían ejecutar · P2 · corregido

Revirtiendo las migraciones una a una hasta cero, 3 `down` fallaban:

| Migración | Fallo | Corrección |
|---|---|---|
| `ReworkAnalisisVentas1775160000000` | el default `'solo_tu'` no se convierte a integer | `DROP DEFAULT` antes del cambio de tipo |
| `DropProveedoresTable1775140000000` | recreaba vacía, y con otras columnas, una tabla que ya había archivado otra migración | no la recrea si existe el archivo; la restaura quien la archivó |
| `AddConfianzaYDeltaScore…1775340000000` | tabla ya borrada por una migración posterior de un solo sentido | `ALTER TABLE IF EXISTS` |

**Ahora: 62 de 62 `down` funcionan** y las 62 se vuelven a aplicar. Revertir hasta cero
deja tres tablas (dos conservan datos archivados a propósito y la tercera la creó un
`synchronize` antes del Baseline) y la re-aplicación no recrea dos FK de la tabla
archivada de Proveedores, que no tiene código que la use. Las últimas 30 migraciones ya
se revertían bien antes: los fallos solo aparecían en rollbacks muy profundos.

### 7. La hora guardada dependía de dónde corriera el proceso · P2 · corregido en seeds

Hay 88 columnas `timestamp` sin zona. `node-postgres` convierte cada `Date` a la hora
local del proceso: **el mismo instante se guarda como 18:30 en Docker/producción y como
12:30 desde tu Windows**, mientras los `DEFAULT now()` siempre guardan UTC (comprobado).
**Corrección:** [`guardiaSeeds.ts`](../../backend/src/scripts/guardiaSeeds.ts), que todos
los seeds importan primero, fija `TZ=UTC` (fuera de Jest). Para un `npm run dev` local
fuera de Docker sigue pendiente: ver abajo.

### 8. Entidades que no describían su columna · P3 · corregido

`lugares_atencion` y `turnos_espera` (de la migración de la Fila de hoy, de esta misma
serie de trabajos) crean las fechas como `timestamptz` y la entidad declaraba `timestamp`;
`analisis_ventas.tamano_equipo` es varchar(20) y la entidad no lo decía. Se alinean las
entidades; la base no cambia.

---

## Lo que está bien

| Comprobación | Resultado |
|---|---|
| Migraciones sobre una base vacía | ✅ 61 en 16 s, sin errores (+1 nueva) |
| `bi0a100_test` frente a producción | ✅ idénticas por definición |
| Entidades registradas | ✅ 43 de 43 |
| Columnas que el código usa y la base no tiene | ✅ ninguna |
| FK declaradas por las entidades | ✅ 45, todas presentes con el mismo `ON DELETE`; las migraciones añaden 12 más |
| SQL crudo | ✅ 159 de 159 válidas: 154 ejecutadas por la suite, 5 validadas con `PREPARE` |
| CHECK frente a los tipos del código | ✅ 11 de 11 coinciden; las 5 restantes (sin unión en la entidad) contrastadas a mano |
| Dinero | ✅ todo `numeric`, ningún `float`/`real` |
| JSON | ✅ todo `jsonb` |
| Pool | ✅ `statement_timeout` 30 s e `idle_in_transaction` 1 min se aplican de verdad; `max_connections` 100 frente a 20 por proceso |
| Tablas sin entidad | ✅ todas usadas por SQL crudo, salvo la archivada de Proveedores |
| Unicidad de `perfiles_analiticos` | ✅ existe en producción como índice único (la entidad la declara como restricción: mismo efecto) |

---

## Lo que no se tocó, y por qué

| Tema | Decisión |
|---|---|
| 80 `res.status(500)` locales en las rutas | Cambiarlos a `next(err)` toca decenas de manejadores; con los topes nuevos ya no deberían llegarles errores de dato. |
| FK hacia `negocios` y otras de tablas pequeñas sin índice | Borrar un negocio es raro y esas tablas son pequeñas. `turnos_espera.lugar_id` tiene un índice parcial que no sirve para la FK, pero los lugares con historial se archivan, no se borran. |
| `ventas.comision_monto/iva` y `movimientos_contables.estado_liquidacion` admiten NULL en la base y la entidad dice NOT NULL | Tienen default y hay 0 nulos. `SET NOT NULL` en producción bloquea la tabla mientras la recorre; no compensa. |
| Total de una cotización mayor que `numeric(12,2)` al convertirla en venta | Cada línea ya tiene tope; la suma solo desborda por encima de 10 000 millones. |
| `TZ=UTC` para un `npm run dev` local | Cambia el comportamiento de tu entorno local; el flujo documentado es Docker, que ya corre en UTC. Recomendado. |
| `TYPEORM_SYNCHRONIZE` en `docker-compose.yml` y `.env.example` | Ya no hace nada; se deja por si se reintroduce un interruptor. |
| Bases de auditoría (`bi0a100_auditoria_ref`, `_rev`, `_devcopia`) y `bi0a100_test_limpieza` | Son mías, sin datos tuyos. La de referencia sirve para comparar tras reparar. Se borran cuando digas. |

---

## Validaciones ejecutadas

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` backend | ✅ 0 errores |
| Suite completa del backend | ✅ 98/98 suites, 1170/1170 tests |
| Tests nuevos | 5 de `synchronize`, 7 del manejador de errores, 5 de Cotizaciones |
| ESLint de lo tocado | ✅ 0 errores |
| Migración nueva | ✅ aplicada en referencia, test, copia de dev y `bi0a100_db`; su `down` probado |
| Rollback completo | ✅ 62/62 |
| Reparación de dev ensayada en copia | ✅ esquema = producción, filas intactas |
| Reparación aplicada a `bi0a100_db` | ✅ 52/52 tablas con las mismas filas; 0 diferencias de esquema con producción |

---

## Segunda pasada: listas para el deploy y las pruebas reales

Hecha a petición del usuario, después de reparar `bi0a100_db`.

### Todas las bases, contra la ruta real de producción

La referencia ya no es TypeScript: se compiló `dist/` y se ejecutó **exactamente** el
`preDeployCommand` de Railway (`npm run migration:run:prod`, `NODE_ENV=production`)
sobre una base vacía: **62 de 62**. Contra ella, por significado:

| Base | Tablas | Columnas | FK | CHECK | UNIQUE | Índices | Diferencias |
|---|---|---|---|---|---|---|---|
| Ruta de Railway (`dist/`) | 52 | 777 | 104 | 25 | 5 | 204 | — |
| `bi0a100_db` (desarrollo) | 52 | 777 | 104 | 25 | 5 | 204 | **0** |
| `bi0a100_test` | 52 | 777 | 104 | 25 | 5 | 204 | **0** |
| Arranque del compose de producción | 52 | 777 | 104 | 25 | 5 | 204 | **0** |

Entidades frente a esquema: las 45 FK que declara el código existen con el mismo
`ON DELETE`; ya no queda ninguna columna que TypeORM quiera recrear; lo que resta son
nombres distintos, índices de rendimiento que solo crean las migraciones y defaults
escritos de otra forma.

### 9. La API y el worker migraban a la vez · P1 · corregido

`.env.production.template` pone `TYPEORM_MIGRATIONS_RUN=true` y `docker-compose.prod.yml`
la carga en la API **y** en el worker, que arrancan casi a la vez. Reproducido con el
código compilado: sobre una base vacía la API se cayó con `duplicate key value violates
unique constraint "pg_class_relname_nsp_index"`, y con una sola migración pendiente se
cayó el worker. `restart: always` los levantaba, pero cada deploy con migraciones
empezaba con una caída, y una migración de datos no idempotente podía aplicarse dos
veces.

**Corrección:** `migrationsRun` es `false` fijo y
[`migracionesAlArrancar.ts`](../../backend/src/config/migracionesAlArrancar.ts) aplica
lo pendiente bajo `pg_advisory_lock`, en un DataSource propio sin el `statement_timeout`
de 30 s de la app. La API y el worker lo llaman antes de abrir su pool. Probado con
**tres procesos a la vez**: sobre base vacía uno aplica las 62 y los otros dos 0; con una
pendiente, uno la aplica y los otros esperan; los tres arrancan, sin registros duplicados
ni candados colgados. Sin la variable no toca nada. Railway no cambia: sigue migrando en
`preDeployCommand`.

### 10. Cuatro seeds estaban rotos y fallaban en silencio · P2 · corregido

Hasta hoy los seeds corrían con `synchronize` activo; nunca se habían probado contra el
esquema puro de migraciones. Resultado sobre una base limpia cada uno:

| Seed | Antes | Ahora |
|---|---|---|
| `seed:demo`, `seed:alertas` | ✅ | ✅ |
| `seed-usuario-completo` → `seed-herramientas-data` | ✅ | ✅ |
| `seed-valeria-super-completo`, `seed-full-4weeks-demo` | ✅ | ✅ |
| `seed-demo-business` | ❌ columnas `role`, `tipo`, `precio_esperado` que no existen desde el Baseline; `canal_venta` en texto libre de hasta 58 caracteres en un varchar(40) | ✅ 1 cuenta business, 3 negocios, 9 productos |
| `seed-legal-carlos` | ❌ dependía del anterior y leía `productos.tipo` | ✅ 9 análisis legales |
| `seed-demo-equipo` | ❌ `role`, `tipo`, `precio_esperado` | ✅ dueño y 2 trabajadores |

Además **salían con código 0 aunque fallaran** (imprimían el error y seguían); ahora salen
con 1. Los valores de `canal_venta` se pasan a los códigos que usa la app (`mixto`,
`redes`, `online`…). Los demás seeds manuales siguen guardando `canal_venta` en texto
libre: funciona, solo que la pantalla lo mostrará tal cual.

### 11. El contrato de producción no exigía la conexión · P2 · corregido

Sin `DATABASE_URL` el backend caía a `postgres:postgres@postgres/bi0a100` (los valores
de desarrollo) y fallaba con un `ECONNREFUSED` que no decía qué faltaba. Ahora
[`entorno.ts`](../../backend/src/config/entorno.ts) exige `DATABASE_URL` (o `DB_HOST`) y
`REDIS_URL` (o `REDIS_HOST`), y avisa si la base es remota y va sin TLS.

Comprobado contra un Postgres sin SSL: `?sslmode=require` en la URL **sí** activa TLS
aunque `config/database.ts` ponga `ssl: false` (node-postgres mezcla la URL encima). Pero
`pg` avisa de que en su próxima versión mayor `require` dejará de verificar el
certificado: la plantilla pasa a `sslmode=verify-full` y el contrato avisa si alguien usa
`require`.

### Arranque real y prueba de humo

- `docker compose restart backend`: sano en 18 s, arranque limpio (base, Redis, servidor).
- Con la cuenta demo de `seed:demo` contra `bi0a100_db` reparada: **22 de 22**. Sesión,
  productos, dashboard, facturación, clientes, calendario (lugares y fila), mantenimientos,
  reportes, contabilidad, tracción de Mercado y calibración de Finanzas.
- Las herramientas que la cuenta demo no eligió (POS, Cotizaciones, Inventario, Nómina)
  responden 403, que es lo correcto: `pro_plus` trae 4 a elegir. El seed decía «todo
  desbloqueado» desde antes del cambio de precios; corregido el texto. **Para probar todas
  las herramientas hace falta una cuenta business**: `seed-demo-business`.
- Una descripción de 300 caracteres en Contabilidad responde 400 (antes 500): el
  contenedor ya ejecuta el código nuevo.

### Redis

Redis 7.4.8 con AOF activo (`everysec`) y `maxmemory-policy noeviction`, que es lo que
exige BullMQ para no perder trabajos. Las colas `analysis-queue` y `calendar-sync` están
creadas. La cola lee `REDIS_URL` antes que las variables sueltas, así que el `rediss://`
de Upstash de la plantilla funciona. **En Upstash, comprueba en su panel que la expulsión
de claves (eviction) esté desactivada**: no se puede ver desde aquí.

### Lo que no se puede comprobar desde aquí

La base y el Redis de producción reales (credenciales del hosting), sus copias de
seguridad y la política de expulsión de Upstash.
