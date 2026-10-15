# TRASPASO — Léelo antes de tocar nada (BI 0 A 100)

> **Para la IA o la persona que continúa el trabajo.** Escrito el **2026-10-08** por la IA que llevaba el
> proyecto hasta hoy. Explica el estado actual, lo que quedó a medias, las reglas que no se pueden romper y
> las trampas del entorno que ya costaron horas.
>
> **Orden de lectura obligatorio:**
> 1. Este archivo completo.
> 2. [`CLAUDE.md`](CLAUDE.md) completo: es la **fuente única de verdad técnica**. Si algo de aquí lo
>    contradice, manda `CLAUDE.md`, y avisa de la contradicción.
> 3. [`frontend/AGENTS.md`](frontend/AGENTS.md) y [`frontend/CLAUDE.md`](frontend/CLAUDE.md) antes de tocar
>    el frontend (Next.js 16 tiene cambios incompatibles con lo que la mayoría de las IA conocen).

---

## 0. Resumen en 10 líneas

- **Qué es:** SaaS B2B para negocios pequeños de México y LATAM. Valida un negocio con 6 análisis de IA
  (Mercado, Marketing, Finanzas, Legal, Ventas, Brief) y le da herramientas para operar: Punto de Venta,
  Cotizaciones, Inventario, Contabilidad, Nómina, Clientes, Calendario, Mantenimientos y la red de expertos
  Net0.
- **Estado:** **no se ha lanzado.** Nada está publicado y no hay clientes reales.
- **Prioridad del dueño (textual):** «dejarlo funcional, seguro y confiable, para que negocios reales puedan
  tener sus datos, inventarios, ventas con nosotros». Las mejoras y funciones nuevas van **después** del
  lanzamiento. Ante una idea que no sea de confiabilidad, proponla para después; no la construyas sin permiso.
- **Stack:** backend Express + TypeORM + PostgreSQL 15 + Redis 7 + BullMQ; frontend Next.js 16 + React 19.
  Todo corre en Docker en Windows.
- **Todo el trabajo está en commits** (2026-10-15), verificado con la suite completa y en el navegador.
  Lo que falta es del dueño (GitHub, Railway y dominio): ver §0.1.
- **No hay remoto de git.** El repositorio solo existe en esta carpeta: no hay `origin` ni GitHub. No
  hagas `push` ni configures un remoto sin que el dueño lo pida.
- **El dueño habla español informal y no siempre técnico.** Responde en español claro, sin jerga, con
  resultados comprobados (no «debería funcionar»).

---

## 0.1 Actualización del 2026-10-14 y 15: auditoría técnica

El dueño pidió una auditoría completa y aprobó un plan. Decidió:
- todo en **Railway**;
- **hasta $25 USD/mes** de hosting;
- **menos de 100 negocios** el primer año.

Plan y hallazgos: [`docs/deployment/RAILWAY.md`](docs/deployment/RAILWAY.md) (cómo desplegar) y la
sección de cada regla en `CLAUDE.md`.

**Hecho y verificado sin Docker:**
- typecheck de backend y frontend;
- 1,084 pruebas unitarias;
- build de producción;
- `npm audit --omit=dev` en 0;
- landing revisada en el navegador en escritorio y celular.

| Cambio | Archivos |
|---|---|
| Parches de seguridad: `next` 16.3.8 (RCE en `next/og`), `axios` 1.20, Express 4.22.3 (`proxy-addr` 2.0.8), `nodemailer` 10, Sentry backend 11 | `package.json` y `package-lock.json` de backend y frontend, `backend/src/config/sentry.ts` |
| **Node 24 LTS** (Node 20 sin soporte desde abril de 2026) | 4 Dockerfiles, `ci.yml`, `deploy.yml`, `engines` |
| Cabeceras de seguridad (CSP en modo «solo reportar», `X-Frame-Options`, HSTS…) | `frontend/next.config.js`, `frontend/Dockerfile.prod` (`CSP_ENFORCE`) |
| Despliegue todo en Railway: frontend en Railway, sin volumen `/app/uploads`, worker dentro de la API, Prometheus fijo y solo para servidor propio, `vercel.json` borrado | `frontend/railway.toml` (nuevo), `backend/railway.toml`, `deploy.yml`, `docker-compose.prod.yml`, `.env.production.template`, `docs/deployment/RAILWAY.md` (nuevo), avisos en `docs/devops/*` y `docs/architecture/overview.md` |
| Mantenimiento: `ts-node-dev` → `node --watch` (no `tsx`: no emite metadatos de decoradores de TypeORM), Jest 30, `uuid` → `crypto.randomUUID` | `backend/package.json`, 12 archivos con `import { randomUUID as uuidv4 } from 'crypto'` |
| **Prueba de paridad de gemelos.** Encontró que el impuesto de Brasil (23 caracteres) no cabía en las cotizaciones (400) | `backend/src/__tests__/contratos/gemelosFrontend.test.ts` (nuevo), `backend/jest.config.js` (alias `@/`), `frontend/lib/taxConfig.ts` |
| Firma de los archivos subidos (un HTML renombrado a `.png` responde 400) | `backend/src/utils/firmaArchivo.ts` (nuevo, con su prueba), `backend/src/middleware/upload.ts` |
| Landing en celular (aprobado por el dueño): resolución máxima 2×; la ciudad no se regenera al moverse la barra del navegador; con «reducir movimiento» sigue al scroll | `frontend/components/landing/AmbientBackground.tsx` |
| 27 `alert()` → avisos de `sonner` | POS, Inventario, Equipo, Billing, Canales, Liquidaciones, Cotizaciones |
| Títulos de pestaña en 30 secciones, con plantilla «… \| BI 0 A 100» | 30 `layout.tsx` nuevos; `app/auth/layout.tsx` y `app/dashboard/layout.tsx` con plantilla |
| La descripción de `/pricing` anunciaba $299 y $799 (precios viejos) | `frontend/app/pricing/layout.tsx` |
| La contraseña de prueba ya no está escrita en el script | `scripts/dev/VERIFY_CREDENTIALS.sh` (ahora usa `VERIFY_EMAIL`/`VERIFY_PASSWORD`) |

**Verificado con Docker el 2026-10-15:**
- Imágenes de desarrollo reconstruidas en Node 24.22 (`next` 16.3.8, Express 4.22.3, `nodemailer` 10.1.1).
- Suite completa contra `bi0a100_test`, ya con el trabajo legal (`d4d2bc6`) y su migración aplicada:
  **1,551/1,551 y 0 saltadas**. Antes falló la prueba de canales con números viejos, ya corregida junto
  con un total sin redondear en `consultasContables.ts`.
- **Todo quedó en commits el 2026-10-15** (`a3f58cc` … ver `git log`), uno por tema: cotizaciones,
  comisiones, seguridad y dependencias, gemelos, despliegue, landing, avisos y títulos, y documentación.
- En el navegador, con la cuenta demo:
  - **Cotizaciones de punta a punta:**
    - decimales y quitar filas;
    - descuento de 12.5 % y PDF;
    - WhatsApp con detalle y lada;
    - venta con las líneas repartidas y su asiento;
    - modo «solo notas»;
    - cotización en USD bloqueada;
    - chip «Vencida».
  - **POS con canal Clip:** el aviso y lo registrado coinciden al centavo ($25.06 de comisión, llegan
    $574.94).
  - **Canal de app:** retenciones sobre la venta sin IVA.
  - **Subidas:** un HTML disfrazado de `.png` responde 400.
  - **CSP:** 0 violaciones en 11 páginas del panel y Net0. Pasan el mapa de Google, YouTube y Google
    Fonts.
  - **Títulos de pestaña:** correctos.

**Pendiente:**
- **Del dueño:**
  - repositorio privado en GitHub (hoy el código solo vive en `J:`) y subir los commits;
  - proyecto, dominio y variables en Railway;
  - alinear la versión de Postgres de Railway con `ci.yml` y `PG_MAJOR`;
  - `CSP_ENFORCE=true` en el frontend de producción: las pruebas del 2026-10-15 no mostraron
    violaciones;
  - textos legales y baja de cuenta: el chat del área legal ya subió consentimiento, ARCO y avisos
    (`d4d2bc6`, `docs/legal/`); revisa ahí qué falta.
- **Datos de prueba en la cuenta demo local:** COT-000001 a 003, ventas POS-000002 a 004 y los canales
  «Clip prueba» y «App comida prueba» (solo en `bi0a100_db`).
- **Para después:**
  - unificar el `Toast` propio con `sonner`;
  - dividir las páginas gigantes cuando se toquen;
  - limpiar los avisos de lint;
  - cambiar `fluent-ffmpeg` (archivado) por llamadas directas a ffmpeg.

---

## 1. Reglas de oro (si rompes una, se pierden datos o dinero)

Están todas en `CLAUDE.md` §7. Estas son las que más cuestan si se olvidan:

1. **`TYPEORM_SYNCHRONIZE` nunca en `true`.** Ya dañó la base de desarrollo una vez: borró 4 FK, 4 CHECK y
   32 índices, entre ellos el único de `usuarios.email`. Hoy `synchronize: false` está fijo en código y un
   test lo vigila. Todo cambio de esquema va con una migración nueva en `backend/src/migrations/` y
   `npm run migration:run`. Una FK nueva lleva índice en la columna hija.
2. **Los IDs son UUID en texto.** Nunca `parseInt()` sobre un id. Todo router con `:id` llama a
   `exigirUuid()`.
3. **El dinero no se borra: se revierte.**
   - Una venta se **cancela** (asientos inversos con `revierte_movimiento_id`, devolución al almacén y
     auditoría), nunca se borra.
   - Ventas, pagos de nómina y movimientos de inventario tienen FK `NO ACTION`. No pongas `CASCADE`.
   - Toda suma sobre `movimientos_contables` usa `JOIN_ORIGINAL` + `sumaNeta()` de
     `services/contabilidad/reversos.ts`.
   - Toda consulta nueva sobre `ventas` filtra `estado <> 'cancelada'`.
4. **Redondeo de dinero solo con `r2`/`r3`/`r4`**: `backend/src/utils/dinero.ts` en el servidor y
   `frontend/lib/dinero.ts` en el navegador. Nada de `Math.round(v * 100) / 100` suelto.
5. **«Hoy» nunca con `toISOString().slice(0, 10)`**, porque es el día UTC. Usa `hoyDePeticion(req)` en el
   backend y `hoyLocal()` en el frontend.
6. **Altas de dinero idempotentes:** `idempotente('<ámbito>')` en el servidor y `Idempotency-Key` en el
   cliente, con una clave por intento.
7. **Se responde después del COMMIT**, nunca desde dentro de `AppDataSource.transaction`.
8. **Nada en pantalla que no sea cierto.** Cada cifra sale de una de cuatro fuentes:
   - lo que dijo el usuario;
   - un cálculo de la app;
   - una tabla con fuente y fecha;
   - una estimación de la IA rotulada como tal.

   Las plantillas dejan huecos «[…]» en lugar de inventar datos. Lo vigilan
   `__tests__/services/honestidadPlantillas.test.ts` y `services/ia/verificadorCifras.ts`.
9. **Precios con impuesto incluido en el POS** (LFPC 7 Bis en México). `ventas.total` es lo que pagó el
   cliente; `subtotal` y `subtotal_linea` van **sin** impuesto. Las cotizaciones, en cambio, van «subtotal
   + IVA».
10. **Moneda y país salen del producto** (`monedaDeCuenta`, `paisDeCuenta`, `getTaxConfig(pais)`). Nunca
    pongas `'USD'`, `'MXN'` ni `0.16` fijos.
11. **Diseño protegido:** no modifiques sin orden expresa del dueño `AmbientBackground.tsx`, `Footer.tsx`
    (debe seguir `bg-transparent`), `AuthBackground.tsx` ni `app/auth/signup/page.tsx`. Ver `CLAUDE.md` §9.

### Archivos gemelos (backend ↔ frontend): se cambian juntos o se rompe algo en silencio

| Backend | Frontend | Qué pasa si se desalinean |
|---|---|---|
| `utils/dinero.ts` | `lib/dinero.ts` | La pantalla anuncia un centavo distinto del que se guarda |
| `services/contabilidad/comisionesService.ts` (`calcularDesgloseComision`, `calcularPrecioObjetivo`) | `lib/comisiones.ts` | El POS anuncia una comisión y se registra otra (el bug que se acaba de arreglar) |
| `utils/taxConfig.ts` | `lib/taxConfig.ts` | Impuestos y monedas por país distintos |
| `utils/fechaLocal.ts` | `lib/fechaLocal.ts` | Ventas con fecha de mañana |
| `utils/whatsapp.ts` (`telefonoWhatsApp`) | `lib/whatsapp.ts` | Enlaces de WhatsApp que no abren chat |
| `utils/estatusProyecto.ts` | `lib/estatusProyecto.ts` | Ideas analizadas como negocios activos |
| `services/ia/perfilNegocio.ts` | `lib/perfilNegocio.ts` | «Afina tu análisis» pierde campos |
| Tipos de Ventas+ en Marketing | `VentasPlusEstrategiaView.tsx` | Tablero en ceros |

Otras altas que se declaran en varios sitios a la vez (detalle en `CLAUDE.md`):

- **Herramienta nueva:** 4 sitios. Si falta uno, no compila.
- **Variable de producción imprescindible:** `config/entorno.ts`, su test y `.env.production.template`.
- **Tabla imprescindible:** la verificación de `scripts/respaldo/respaldar.sh`.
- **Módulo de IA nuevo:** `prompts/index.ts`, `seccionesCatalogo.ts`, sus casos de prueba y `probarVersion()`.

---

## 2. Entorno: cómo está montado y sus trampas

### 2.1 Máquina del dueño
- Windows 11 y Docker Desktop. El proyecto vive en `J:\Bi0a100`. Hay Git Bash y PowerShell.
- **Docker Desktop no arranca solo.** Lo abre el dueño a mano: no lo lances tú y no ejecutes
  `docker compose up` por tu cuenta (el dueño lo rechazó). Si `docker ps` falla, pídele que lo abra.
- Si `docker ps` sale vacío sin error, ya pasó con el stack arriba. Antes de concluir que está caído,
  comprueba `http://localhost:3001/health`.

### 2.2 Servicios (desarrollo, `docker-compose.yml`)
| Servicio | Puerto | Nota |
|---|---|---|
| frontend (Next.js dev) | 3000 | |
| backend (Express) | 3001 | `/health` da 503 si Postgres o Redis no responden |
| postgres 15 | 5432 | bases `bi0a100_db` (desarrollo, con datos demo) y `bi0a100_test` (tests) |
| redis 7 | 6379 | los tests usan la db 15 |

- **Desde la raíz:** `npm run up` levanta, `npm run down` apaga y `npm run logs` muestra los registros.
- **Sin recarga automática dentro de Docker**: lo que ves en el navegador puede ser código viejo.
  - Backend (`ts-node --transpile-only` sin watch): tras cambiar código o `.env`,
    `docker compose up -d --force-recreate backend`.
  - Frontend (Turbopack no ve el bind mount): tras editar, `docker compose restart frontend`.
- **Worktrees:** si trabajas desde un worktree (`.claude/worktrees/...`), usa
  `docker compose --project-directory J:/Bi0a100 -f J:/Bi0a100/docker-compose.yml ...`. Si no, crea un
  stack duplicado que choca en los puertos 5432 y 6379.
- No lances dos `docker compose up` a la vez. Si otra sesión ya lo está haciendo, espera a que termine.
- `npm run build` del frontend en el host es seguro (el `.next` del contenedor es un volumen aparte), pero
  **modifica `frontend/next-env.d.ts`**. Restáuralo con `git checkout -- frontend/next-env.d.ts`.

### 2.3 Variables de entorno y secretos
- Docker usa el **`.env` de la raíz**: no existe `backend/.env`. El frontend tiene `frontend/.env.local`.
- **Los `.env` no se suben a git y no deben compartirse.** Si te pasaron una copia con claves reales del
  dueño, no las copies a ningún chat, log ni documento. Para tu máquina, créalos desde `.env.example`.
- Hoy el `.env` de la raíz solo trae las variables de Google: `GOOGLE_LOGIN_REDIRECT_URI` apunta a
  localhost, y `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` están vacías.
- En desarrollo **no hay `ANTHROPIC_API_KEY`**: los análisis de IA caen a plantilla. Eso es lo esperado;
  no lo reportes como bug.
- `backups/db/*.sql` son volcados viejos de la base de desarrollo (junio y agosto). Están ignorados por git.
  No los compartas ni los restaures sin permiso.
- **Nunca escribas contraseñas ni claves en el chat ni en archivos.** Las credenciales de las cuentas demo
  viven dentro de los propios seeds. Úsalas solo contra `localhost` y no las repitas.

### 2.4 Cuentas demo (en `bi0a100_db`)
- `demo@bi0a100.com` (sale de `npm run seed:demo`): plan **enterprise**, con los 6 análisis, todas las
  herramientas y 600 créditos. La contraseña está en `backend/src/scripts/seed-demo-completo.ts`.
- Antes de reportar un 403 de una herramienta como bug, revisa el plan y las herramientas seleccionadas de
  la cuenta.
- Hay otros seeds en `backend/src/seeds/`: `seed-demo-business.ts` (3 negocios y 9 productos) y
  `seed-demo-equipo.ts` (dueño con trabajadores). Los seeds abortan en producción o con una base remota.

### 2.5 Pruebas
```bash
# Unitarias y de rutas, sin base de datos (las de integración se SALTAN solas):
cd backend && npm test

# Suite completa (Docker arriba). Solo contra una base cuyo nombre contenga "test":
cd backend
DATABASE_URL=postgresql://bi0a100_user:bi0a100_password@localhost:5432/bi0a100_test \
REDIS_URL=redis://localhost:6379/15 npm run migration:run
DATABASE_URL=postgresql://bi0a100_user:bi0a100_password@localhost:5432/bi0a100_test \
REDIS_URL=redis://localhost:6379/15 npx jest --runInBand --forceExit

cd backend && npm run typecheck
cd frontend && npx tsc --noEmit && npm run build   # después: git checkout -- next-env.d.ts
```
- **Revisa siempre el número de pruebas saltadas.** «1071 passed, 444 skipped» significa que las de
  integración **no corrieron**: no es una suite verde.
- Si todas las pruebas de integración fallan con `AggregateError`, Postgres no está arriba (Docker cerrado).
  El código no tiene la culpa.
- Último resultado completo y verde, antes del trabajo de §3: **122 suites, 1506 pruebas**.

### 2.6 Shell en Windows (trampas reales)
- **Git Bash reescribe los argumentos que empiezan por `/` o `//`** (conversión de rutas de MSYS). Un script
  que recibía `"// ─── Marca"` como argumento corrompió un archivo en silencio. Pasa los textos por
  archivo o usa una herramienta de edición. Para comandos con rutas tipo `/api/...`, antepón
  `MSYS_NO_PATHCONV=1`.
- Los heredocs con muchas comillas simples fallan en Git Bash. Para escribir archivos, usa la herramienta
  de escritura y no `echo`.
- Git avisa de «LF will be replaced by CRLF». Es normal en esta máquina.

### 2.7 Forma de trabajar del dueño
- Suele tener **varias sesiones o agentes trabajando a la vez** en el mismo repo. Por eso:
  - haz commit **solo de tus archivos**, nombrándolos uno por uno (**nunca `git add -A` ni `git add .`**);
  - no toques archivos que otra sesión tiene modificados (ver §3.3);
  - no borres ramas ni worktrees ajenos.
- Prefiere que la IA explore el código directamente y no lance subagentes.
- **Pide confirmación antes de cualquier cosa destructiva o difícil de deshacer**: borrar bases, volúmenes
  o imágenes de Docker; `git reset --hard`; borrar archivos ajenos; cambiar datos de producción. Una
  aprobación vale solo para esa acción.
- No hagas commit si el dueño no lo pidió. Al terminar, ofrece hacerlo y di qué archivos entrarían.
- Formato de commit en uso: estilo convencional en español, por ejemplo
  `fix(pos): el precio del catálogo incluye el impuesto; ticket de WhatsApp sin enlace roto`.

---

## 3. Cotizaciones y comisiones (2026-10-08; verificado y en commits el 2026-10-15)

El dueño pidió: *«revisa de nuevo las herramientas, encontré varios bugs y errores en cotizaciones, necesito
que esa parte quede perfecta; también hay algo raro porque las comisiones cambian, ¿será mejor que el usuario
las coloque o que nosotros le demos exactamente cuál es?»*.

Todo está implementado. Ya pasaron el typecheck de backend y frontend, ESLint (sin avisos nuevos), el build
del frontend y las 1,071 pruebas unitarias. **Faltan** las 444 pruebas de integración y la revisión en el
navegador, porque Docker estaba cerrado.

### 3.1 Cotizaciones: qué se arregló
**Backend** (`backend/src/routes/cotizaciones.ts`):
- **Una cotización vendida solo admite cambiar sus notas.** Un PATCH a cualquier otro campo responde 409
  con «duplícala» y `venta_id`.
- **Con una venta, aunque esté cancelada, no se elimina** (409). Antes se borraba y la venta perdía su origen.
- **Al convertir en venta se exige la moneda del producto.** Una cotización en USD sobre un producto
  mexicano responde 409 («Duplícala en MXN»). Antes entraba a la contabilidad como si fueran pesos.
- **`venta_items` con el descuento repartido y sin impuesto.** `lineasDeVenta()`, exportada, hace que las
  líneas sumen exactamente `ventas.subtotal` y pasa el centavo del redondeo a la línea más grande. Antes iban
  sin descontar y el margen por producto salía inflado. `ventas.subtotal` ahora va con `r2`.
- **Tope de importes:** si una línea o el total superan `MAX_DINERO` (numeric(12,2)), el alta y la edición
  responden 400. Antes se podía cotizar algo imposible de convertir en venta.
- **`moneda`:** se pasa a mayúsculas, exige 3 letras ISO y vacío significa la del país del producto.
  `'$'` o `'MX'` responden 400.
- **Mensaje de WhatsApp:**
  - lleva conceptos, subtotal, descuento, impuesto, total y vigencia, con `Intl` y el locale del país
    (antes decía «te envío la cotización» sin ningún detalle);
  - el cuerpo se valida con zod (`mensaje` texto ≤ 4000; si no es texto, 400).

**Frontend** (`frontend/app/dashboard/herramientas/cotizaciones/page.tsx`):
- **El estado `'vencida'` tumbaba toda la lista** (`estadoChip` leía `.cls` de `undefined`). Se agregó a
  `ESTADOS`, con un chip de respaldo.
- **Vencida visible:** una cotización sin vender, en borrador o enviada, con la vigencia pasada se muestra
  «Vencida» (`estadoVisible`). No se escribe en la base al leer.
- **Fechas un día antes en México:** `new Date('2026-12-31')` es medianoche UTC. Ahora `aFecha()` lee las
  fechas solas como día local.
- **Cantidad:** no aceptaba decimales y al borrarla volvía a 1 (para poner 3 quedaba 13). Ahora es texto con
  `inputMode="decimal"` y admite coma o punto.
- **Filas con clave estable:** antes el `key` era el índice y, al quitar una fila, la de abajo heredaba la
  cantidad y el precio de la quitada.
- **Totales:** se calculan con el redondeo del servidor (`calcTotales` usa `r2`) y se validan antes de
  enviar, con el número de fila.
- **Idempotency-Key** en el alta, para que un doble clic o un reintento no creen dos cotizaciones.
- **Cotización vendida:** el formulario se abre en modo «solo notas» (`fieldset disabled` y un aviso), el
  botón de eliminar se oculta, y «Aceptar» y «Rechazada» no aparecen.
- **Nuevo botón «Rechazada»** para las enviadas o vencidas.
- **Indicadores:**
  - suman **solo la moneda de la contabilidad** (antes 100 USD + 100 MXN se mostraban como «$200») y dicen
    cuántas cotizaciones en otra moneda no se sumaron;
  - «Ganado» cuenta las aceptadas y las vendidas;
  - la tasa de cierre se mide sobre las propuestas enviadas, sin contar los borradores.
- **Paginación:** antes solo se leían las primeras 200 cotizaciones. Ahora hay «Cargar más» con el cursor
  de la cabecera `X-Siguiente`.
- **PDF:**
  - lleva el nombre del negocio (`negocio_nombre` o el del producto), no «Mi Negocio»;
  - ya no muestra el «Estado», que le decía «Borrador» al cliente;
  - los porcentajes llevan 2 decimales (12.5 % salía como 13 %);
  - los importes van con `Intl`;
  - el diálogo de impresión ya no se puede abrir dos veces;
  - avisa si el navegador bloqueó la ventana;
  - con marca propia (white label) no dice «Generado con BI 0 A 100».
- **WhatsApp:** la ventana se abre en el mismo clic, para que el bloqueador del navegador no la cancele.
- **Errores:** se muestra el mensaje real del servidor (por ejemplo, el 409 de eliminar).
- **Duplicar** limpia la fecha de vigencia.
- **Impuesto inicial:** si el producto tiene `cobra_impuesto_consumo === false`, la cotización nueva arranca
  con 0 % y lo explica.
- **Moneda distinta:** el formulario y el modal de venta avisan si la moneda no es la de la contabilidad,
  y el modal no deja convertir.
- **CSV:** columna «Venta», estado visible, moneda de respaldo del país y fecha local en el nombre del
  archivo.
- Se quitaron imports sin uso.

**Archivos nuevos o tocados:**
- `frontend/lib/dinero.ts` (nuevo): `r2`, `r3`, `formatoDinero(valor, moneda, locale)` y `formatoPct`.
- `frontend/lib/productoActivo.ts`: el tipo `ProductoActivo` ahora tiene `cobra_impuesto_consumo?`
  (`GET /productos` ya lo devolvía).
- `backend/src/__tests__/routes/cotizacionAVenta.test.ts`: 5 pruebas nuevas.
  - edición bloqueada y borrado prohibido aunque la venta esté cancelada;
  - descuento repartido: con 12.5 % en tres líneas, la línea de $10 queda en 8.75;
  - USD sobre un producto mexicano da 409;
  - moneda inválida y total demasiado grande dan 400;
  - texto de WhatsApp: `wa.me/52…`, «2 × …», `$1,700.00`, «Total: $1,972.00» y «31 de diciembre de 2026».

### 3.2 Comisiones: por qué «cambiaban» y qué se hizo
**Causas encontradas:**
1. **El POS trataba la fracción como porcentaje.** `comision_porcentaje` se guarda como fracción
   (0.036 = 3.6 %). El POS mostraba «0.036%» y estimaba `total × 0.036 / 100`, una comisión **100 veces
   menor** que la que el servidor registraba al cobrar.
2. **IVA de la comisión con 16 % fijo** en el POS (estimación), en Contabilidad (vista previa y registro) y
   en el simulador. El registro del POS sí usaba la tasa del país, así que en Colombia (19 %) salían cifras
   distintas.
3. **Retenciones de apps sobre el total con IVA.** La ley (art. 113-A de la LISR y 18-J de la LIVA) las
   calcula sobre la venta sin IVA: en un pedido de $116, el IVA retenido debe ser $8.00, no $9.28.
4. **Tarifas precargadas con el ISR de 2025 (1 %).** En 2026 es **2.5 %** para persona física con RFC
   registrado en la app (art. 25, fr. VI de la LIF 2026); sin RFC, 20 %. Una sociedad no tiene retención de
   IVA. Esto se verificó con consultoras (Praxium, IDC, Siigo), **no con el DOF**: que un contador lo
   confirme antes del lanzamiento.

**Cambios:**
- `comisionesService.ts`:
  - `calcularDesgloseComision(montoBruto, canal, tasaIvaPais, impuestoEnBruto = 0)`: las retenciones van
    sobre `bruto − impuestoEnBruto`;
  - `calcularPrecioObjetivo(..., precioIncluyeImpuesto)` hace la cuenta inversa con esa misma base;
  - las tarifas de referencia ahora dicen que lo son («confírmala con tu contrato») y tienen ISR 2.5 %;
  - nuevo `PAISES_CON_PRESETS = ['MX']`.
- `routes/pos.ts`: pasa `totales.impuesto_monto` como impuesto dentro del bruto.
- `routes/contabilidad.ts`:
  - nuevo `impuestoDelProducto()`, que da el IVA del país y si el precio lo incluye según
    `cobra_impuesto_consumo`;
  - se usa en el alta manual con canal y en `/canales/simular`;
  - `/canales/seed-defaults` fuera de México responde 200 con `{ creados: 0, sin_referencia: true, mensaje }`,
    porque las tarifas de referencia son mexicanas y en otro país darían comisiones falsas.
- `frontend/lib/comisiones.ts` (nuevo): gemelo exacto del servicio, con `textoPorcentaje(fraccion)`.
- POS: el selector muestra «3.6 %» y la estimación usa el gemelo. Muestra «Te llega», las retenciones y una
  nota: «con la tarifa que guardaste para este canal».
- Contabilidad (`page.tsx`, `CanalesCobroModal.tsx` y `SimuladorPreciosComision.tsx`):
  - el cálculo es el gemelo, con la tasa del país;
  - las retenciones solo se precargan en México (2.5 % y 8 %), con un texto de ayuda por país;
  - en otro país se muestra el aviso de que no hay tarifas de referencia;
  - el modal explica que cada negocio debe poner la tarifa de su contrato.
- Pruebas actualizadas:
  - `__tests__/services/comisionesService.test.ts`: 10/10 pasan; incluyen la base sin IVA, la tasa del país
    y que las tarifas digan «referencia».
  - `__tests__/routes/flujosHerramientas.test.ts`: el ingreso de $1,000 con Uber ahora da
    `ret: 77.59, neto: 574.41`, porque la base es 862.07 sin IVA. Además, el seed en un producto de
    Colombia da `sin_referencia`.
- **Los canales que ya existen en la base no se migraron.** Son configuración del usuario. Los canales demo
  de `bi0a100_db` pueden seguir con ISR 1 %.

**Recomendación que se le dio al dueño, pendiente de respuesta:** la tarifa la pone el usuario, la de su
contrato, porque la app no puede saberla: cambia por plan, por volumen, por lo negociado y por régimen. La app
da tarifas de referencia solo para México y rotuladas. También se propuso, **sin aprobar todavía**: al
conciliar un depósito, capturar lo que realmente llegó, calcular la tasa efectiva real y sugerir actualizar el
canal. **No lo construyas sin que el dueño diga que sí.**

### 3.3 Estado de `git status` y qué es de quién
| Archivo | De quién | Qué hacer |
|---|---|---|
| `backend/src/routes/cotizaciones.ts`, `backend/src/__tests__/routes/cotizacionAVenta.test.ts`, `frontend/app/dashboard/herramientas/cotizaciones/page.tsx`, `frontend/lib/dinero.ts`, `frontend/lib/productoActivo.ts` | trabajo de §3.1 | verificar y hacer commit (commit 1) |
| `backend/src/services/contabilidad/comisionesService.ts`, `backend/src/routes/contabilidad.ts`, `backend/src/routes/pos.ts`, `backend/src/__tests__/services/comisionesService.test.ts`, `backend/src/__tests__/routes/flujosHerramientas.test.ts`, `frontend/lib/comisiones.ts`, `frontend/app/dashboard/herramientas/pos/page.tsx`, `frontend/app/dashboard/herramientas/contabilidad/page.tsx`, `.../contabilidad/CanalesCobroModal.tsx`, `.../contabilidad/SimuladorPreciosComision.tsx` | trabajo de §3.2 | verificar y hacer commit (commit 2) |
| `CLAUDE.md` (rutas 12 y 14 y regla de redondeo) y este `TRASPASO.md` | documentación del traspaso | entran con el commit 2 o en uno propio |
| `backend/src/scripts/seed-alertas-demo.ts`, `backend/src/scripts/seed-demo-completo.ts` | **otra sesión**: pone la cuenta demo en plan enterprise, a pedido del dueño el 2026-10-06 | no los mezcles con tus commits; pregunta al dueño si se hace commit aparte |
| `frontend/scratch_landing.html` | **borrador de otra sesión** | no lo subas, no lo borres |
| worktree `.claude/worktrees/unruffled-gagarin-7c0d24` (rama `claude/unruffled-gagarin-7c0d24`, en `0c8f47a`) | sesión vieja | no lo borres sin permiso |

> **Ojo:** `cotizaciones.ts` y otros archivos ya aparecían como modificados al empezar la última sesión. Era
> el mismo trabajo en curso, no cambios ajenos.

### 3.4 Cómo cerrar este trabajo (paso a paso)
1. Pídele al dueño que abra Docker Desktop. Comprueba `http://localhost:3001/health`.
2. Corre la suite completa contra `bi0a100_test` (§2.5). Debe salir **0 fallos y 0 saltadas**. Si algo
   falla, el número esperado en una prueba puede estar mal calculado. Rehaz la cuenta a mano antes de tocar
   el código.
3. Recrea el backend y reinicia el frontend (§2.2). Después revisa en el navegador con la cuenta demo:
   - **Cotizaciones:**
     - crea una con cantidad 1.5 y tres filas, quita la del medio y comprueba que las demás conservan sus
       números;
     - pon 12.5 % de descuento: el PDF debe mostrar el nombre del negocio, «12.5 %» y ningún «Estado»;
     - comparte por WhatsApp: el mensaje debe traer los conceptos;
     - conviértela en venta y comprueba el ticket en el POS y el ingreso en Contabilidad;
     - vuelve a abrirla: debe estar en modo solo notas y sin botón de eliminar;
     - una cotización en USD no debe dejar vender;
     - una con la vigencia pasada debe verse «Vencida».
   - **POS con canal Clip** (3.6 % + IVA), venta de $100:
     - el aviso debe decir comisión $4.18 y «Te llega $95.82»;
     - tras cobrar, en `ventas`: `comision_monto` 3.60, `comision_iva` 0.58, `monto_neto` 95.82.
   - **POS con un canal tipo Uber** (30 %, ISR 2.5 %, IVA ret. 8 %), venta de $116 con IVA incluido:
     - comisión 34.80 + 5.57 de IVA, retenciones 2.50 + 8.00, neto **65.13**;
     - el registro debe coincidir con el aviso.
   - **Contabilidad:**
     - la vista previa de un ingreso con canal debe coincidir con lo guardado;
     - en un producto de Colombia, «Cargar tarifas de referencia» debe mostrar el aviso sin crear canales.
4. Restaura `frontend/next-env.d.ts` si hiciste build. Luego haz los commits por grupos, **solo con permiso
   del dueño**, nombrando los archivos de la tabla de §3.3.

---

## 4. Pendientes del proyecto (en orden de importancia para el lanzamiento)

**Bloquean el lanzamiento o esperan una decisión del dueño:**
1. **Términos y Aviso de privacidad son texto de relleno** (`frontend/app/terminos`,
   `frontend/app/privacidad`). Necesitan los datos legales del dueño: razón social, RFC, domicilio y
   contacto para derechos ARCO. No los inventes.
2. **Baja de cuenta y exportación de datos (#2):** el dueño debe decidir si, al cerrar una cuenta, se borra
   todo o se conservan ventas y contabilidad unos 5 años por obligación fiscal. **Sin respuesta todavía.**
   No implementes ninguna de las dos sin su decisión.
3. **Respaldos en producción:** el código y la guía están listos (`scripts/respaldo/`,
   `docs/deployment/RESPALDOS.md`, con un simulacro local exitoso el 2026-10-07). Falta que el dueño cree el
   bucket S3, la llave de age y el servicio en Railway. La llave privada nunca va al servidor ni al chat.
4. **Limpieza del simulacro de respaldos:** quedaron en el Postgres local las bases
   `bi0a100_restauracion_prueba` y `bi0a100_restauracion_vacia`, más imágenes de Docker del simulacro
   (`bi0a100-respaldo:prueba`, `bi0a100-respaldo:pg17` y una de shellcheck). Se le preguntó al dueño si se
   borran. **No las borres sin su sí.**
5. **Que un contador confirme las retenciones de 2026** de §3.2.

**Cuando el dueño tenga las claves** (las pone él en el `.env`, nunca por chat):
- `ANTHROPIC_API_KEY` de desarrollo:
  - correr `backend/scripts/medir-costos-ia.ts` (tope $10) para cambiar los costos estimados por medidos;
  - comparar effort `medium` contra `high` con «Probar» en el admin antes de subirlo.
- Stripe: crear los precios en MXN y poner los `STRIPE_PRICE_*` y `STRIPE_PRODUCT_*`. Luego probar el
  checkout real de planes y de impulsos de Net0.
- Google OAuth (login y Calendar): `GOOGLE_CLIENT_ID`/`SECRET`/`*_REDIRECT_URI`, y registrar
  `http://localhost:3001/api/auth/google/callback` en Google Cloud.

**Para después del lanzamiento** (no las empieces sin permiso):
- Verificar la comisión contra el depósito real (propuesta de §3.2).
- ~287 avisos previos de ESLint: imports sin uso y `setState` dentro de efectos, sin errores.
- Títulos de pestaña genéricos.

---

## 5. Decisiones de negocio ya tomadas (no las cambies sin re-confirmar)

- **Precios en MXN con IVA incluido**, anual = 10 meses. Fuente de verdad: `services/billing/planService.ts`
  y `services/billing/creditosIA.ts`; detalle en `docs/pricing/PROPUESTA_PLANES_2026-09.md`.

  | Plan | MXN/mes | Créditos IA/mes |
  |---|---|---|
  | Gratis | 0 | 5 |
  | Emprendedor (pro) | 449 | 20 |
  | Negocio (pro_plus) | 599 | 60 |
  | Empresa (business) | 1,199 | 120 |
  | Enterprise | desde 4,999 | 600 |

  - No se vuelve a «ilimitado» ni se cambia de moneda.
  - Con tráfico real se ajustan los **créditos**, no los precios.
  - Un análisis que falla o sale de plantilla **no consume** cuota y devuelve sus créditos.
- **Modelos de IA** (desde 2026-10-03): toda llamada pasa por `crearMensaje()` de
  `backend/src/config/anthropic.ts`, nunca por `new Anthropic()` dentro de un servicio.
  - Sonnet 5.5 para estrategia y extensas (effort medium) y para las mecánicas (effort low).
  - Opus 5.5 para Legal (effort medium).
  - El README todavía menciona Haiku 4.5 / Sonnet 5 / Opus 5: **está desactualizado** y manda `CLAUDE.md`.
- **Prompts versionados:** el admin edita el «modo» y las fichas de país. El contrato (formato JSON, reglas
  anti-inyección) vive **solo en el código**. Los datos del usuario van en `messages`, nunca en el `system`.
  El dueño **no ha publicado ninguna versión**: rigen los textos del repositorio.
- **Red Net0:**
  - impulsos estilo Meta, prepagados por días: $39 MXN/día por ciudad y $99 nacional, de 3 a 30 días, con
    5 lugares por categoría y lugar;
  - 7 categorías;
  - el contacto es directo (WhatsApp, llamada, email);
  - sin feed, likes ni mensajería;
  - las rutas `GET /expertos` son públicas y las páginas públicas nunca llaman a endpoints con sesión al
    montar.
- **Webhook de Stripe:** los patrocinios e impulsos se desvían **antes** de tocar `usuarios`. Si se quita ese
  desvío, un experto con plan Pro queda degradado. Ver la advertencia en `CLAUDE.md` §6.

---

## 6. Mapa rápido del código

```
backend/src/
  app.ts                 montaje de las 27 rutas (el orden importa: subrutas antes de /:id)
  config/                database.ts (synchronize false FIJO), anthropic.ts (crearMensaje), entorno.ts (variables de prod), redis, sentry
  routes/                una por módulo o herramienta (cotizaciones.ts, pos.ts, contabilidad.ts…)
  services/              lógica: contabilidad/ (reversos, comisiones, consultas SQL), pos/, ia/ (prompts, verificador de cifras), billing/…
  utils/                 dinero.ts, fechaLocal.ts, taxConfig.ts, monedaCuenta.ts, folios.ts, paginacion.ts, whatsapp.ts, limitesNumericos.ts
  middleware/            auth, requirePlan (gating), validate (exigirUuid, validateBody), idempotency, cors, errorHandler
  migrations/            74 migraciones; la última: 1775780000000-CobraImpuestoConsumo
  workers/               BullMQ (análisis y calendar-sync); en prod corren en un proceso aparte
  __tests__/             Jest; helpers/dbGuard.ts impide escribir en bases sin «test» en el nombre
frontend/
  app/dashboard/         módulos de análisis y herramientas (herramientas/{pos,cotizaciones,contabilidad,inventario,…})
  app/net0/              portal público de expertos (layout propio)
  lib/                   api.ts (axios, JWT, Idempotency-Key, X-Zona-Horaria), gemelos (dinero, comisiones, taxConfig, fechaLocal, whatsapp…)
  components/landing/    diseño PROTEGIDO (AmbientBackground, Footer)
scripts/respaldo/        respaldo diario cifrado y restauración segura
docs/                    auditorías, despliegue, precios. Si algo contradice CLAUDE.md, manda CLAUDE.md
```

Carpetas `agency-agents/`, `gsap-skills/` y `ui-ux-pro-max-skill/`: son bibliotecas de terceros que el
dueño descargó para sus herramientas de IA. Están ignoradas por git y no son parte de la app. No las edites.

Documentos útiles:
- `docs/audit/REVISION_E2E_HERRAMIENTAS_2026-09-28.md`: revisión de punta a punta de las herramientas.
- `docs/audit/AUDITORIA_BASE_DATOS_2026-09-27.md`: daño y reparación de la base.
- `docs/deployment/RESPALDOS.md`: respaldos.
- `docs/deployment/CLAVES_IA.md`: claves de IA.

Lo de `docs/archive/` y `docs/dev-setup/` es histórico.

---

## 7. Historial reciente (para entender de dónde viene cada cosa)

| Commit | Qué hizo |
|---|---|
| `8af68d3` | Respaldo diario cifrado (age + S3) y restauración que se niega a pisar una base con datos |
| `ca20b22` | Cotización con cantidad usable, nómina en la estimación fiscal, páginas que no se cortan |
| `aeaac39` | POS: el precio del catálogo incluye el impuesto por país; punto de cobro `cobra_impuesto_consumo`; ticket de WhatsApp sin enlace roto |
| `da5ef92` | Cancelaciones que suman cero (`revierte_movimiento_id`, `sumaNeta`); la receta no se pierde |
| `4df57c6` | Logo con el modo del Brief; venta en la vía pública por país en Legal, Finanzas y Brief |
| `ad5f303` … `2d5dc85` | Prompts versionados en los 6 módulos, transparencia, verificador de cifras, modelos 5.5 |

Antes de eso: rediseño del dashboard, el portal Net0 y el login con Google.

---

## 8. Lista de comprobación antes de dar algo por terminado

- [ ] Leí la sección de `CLAUDE.md` del módulo que toqué.
- [ ] Si toqué un gemelo, toqué también su pareja (§1).
- [ ] No usé `synchronize`, `parseInt` sobre ids, `toISOString().slice(0,10)`, `Math.round(v*100)/100`,
      `'USD'` fijo ni `0.16` fijo.
- [ ] Una consulta nueva sobre `ventas` filtra las canceladas; una suma de dinero usa `sumaNeta`.
- [ ] Las altas de dinero son idempotentes y responden después del COMMIT.
- [ ] Ningún texto en pantalla afirma algo que la app no sabe.
- [ ] `npm run typecheck` (backend), `npx tsc --noEmit` (frontend) y ESLint sin avisos nuevos.
- [ ] Suite completa contra `bi0a100_test` con **0 fallos y 0 saltadas**.
- [ ] Verificado en el navegador **después** de recrear el backend o reiniciar el frontend.
- [ ] `next-env.d.ts` restaurado; commit solo de mis archivos y solo si el dueño lo pidió.
- [ ] Si cambié una regla o una convención, actualicé `CLAUDE.md`.
- [ ] Le reporté al dueño lo hecho, lo verificado y lo que no se pudo verificar, sin adornos.
