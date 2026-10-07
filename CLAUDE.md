# CLAUDE.md — Contexto y Guía Canónica de Ingeniería (BI 0 A 100)

Este documento es la **fuente única de verdad técnica** para Claude, Antigravity, Cursor y cualquier agente de inteligencia artificial o desarrollador que trabaje en el repositorio **BI 0 A 100**. Debe mantenerse actualizado ante cualquier cambio arquitectónico.

---

## 1. Visión del Proyecto y Lógica de Negocio

**BI 0 A 100** es una plataforma SaaS B2B que valida la viabilidad comercial, operativa y legal de un negocio o producto en **2 a 3 minutos**.

### Módulos de Análisis (6 Módulos)
1. **Mercado**: Viabilidad, cálculo de TAM/SAM/SOM, competencia y posicionamiento.
2. **Marketing**: Propuesta de valor, canales de captación, copies y cronogramas.
3. **Proveedores**: Directorio de suministros, comparativa de costos y RFQs.
4. **Finanzas**: Punto de equilibrio, márgenes, flujo proyectado y simulador de escenarios.
5. **Legal**: Cumplimiento normativo, contratos sugeridos, propiedad intelectual y riesgos.
6. **Brief**: Diagnóstico y brief ejecutivo integral (a diferencia de los otros 5 módulos, su cuota es **global por cuenta** y no por producto). Implementado con **Claude Sonnet 5.5** (`@anthropic-ai/sdk`).

---

## 2. Topología de Servicios y Puertos

| Servicio | Entorno | Puerto Host | Puerto Contenedor | URL / Endpoint |
|---|---|---|---|---|
| **Frontend (Next.js)** | Dev / Prod | `3000` | `3000` | `http://localhost:3000` |
| **Backend (Express)** | Dev / Prod | `3001` | `3001` | `http://localhost:3001` |
| **Health Check** | Todo | `3001` | `3001` | `http://localhost:3001/health` (503 si Postgres o Redis no responden) |
| **Métricas Prometheus** | Todo | `3001` | `3001` | `http://localhost:3001/metrics` (en prod exige `METRICS_TOKEN`; sin él responde 404) |
| **Prometheus Server** | Todo | `9090` | `9090` | `http://localhost:9090` |
| **PostgreSQL 15** | Todo | `5432` | `5432` | `postgresql://bi0a100_user:bi0a100_password@localhost:5432/bi0a100_db` |
| **Redis 7 (AOF)** | Todo | `6379` | `6379` | `redis://localhost:6379` (interno Docker: `redis:6379`) |

> [!NOTE]
> En entornos Docker, los puertos están vinculados a `127.0.0.1` para garantizar su aislamiento detrás de un reverse proxy (Nginx, Traefik, Caddy o Cloudflare Tunnel).

---

## 3. Stack Tecnológico Exacto

### Requisitos del Sistema
- **Node.js**: `>= 20.9.0` (LTS recomendado).
- **npm**: `>= 10.0.0`.

### Backend (`/backend`)
- **Runtime & Servidor**: Node.js 20 + Express 4.18 + TypeScript 5 (CommonJS, `dist/app.js`).
- **ORM & DB**: TypeORM 0.3 + PostgreSQL 15 (`AppDataSource` en `src/config/database.ts`).
  - **Identificadores**: Todas las entidades usan **UUID v4** como cadenas (`@PrimaryGeneratedColumn('uuid')`). **Prohibido usar `parseInt()`**.
- **Colas y Tareas en Segundo Plano**: BullMQ 5 + ioredis 5 (`src/workers/analysisQueue.ts` y `src/workers/analysisWorker.ts`). BullMQ exige ioredis; el resto (auth, denylist, locks, rate limit, SSE pub/sub) usa `redis` (node-redis) de `config/redis.ts`. Los dos clientes son deliberados. Solo se reintentan errores transitorios (`utils/erroresTransitorios.ts`). En producción los workers (análisis y `calendar-sync`) corren en un **proceso aparte** (`workers/runWorker.ts`, `npm run worker:prod`, servicio `worker` de `docker-compose.prod.yml`) y la API lleva `RUN_WORKER=false`; sin esa variable la API arranca los workers dentro de su proceso (útil en desarrollo). Los eventos del worker llegan al navegador por el puente SSE de Redis.
- **Dependencias dobles conocidas**: `resend` + `nodemailer` (SMTP como alternativa en `emailService`), `express-validator` (admin, billing, equipo, marca, vertical) + `zod` (resto; preferir zod en código nuevo).
- **Inteligencia Artificial**: `@anthropic-ai/sdk` 0.125, modelo por tarea (Sonnet 5.5 / Opus 5.5, ver *Modelos de IA*) con fallback determinista estructurado y validación Zod.
- **Seguridad & Auth**: JWT (Access Token 15 min, Refresh Token 7 días), revocación en Redis vía `deny:${jti}`, `bcryptjs`, Helmet, CORS parametrizado y `cookie-parser`.
- **Subida de Archivos**: Multer en memoria RAM (`memoryStorage()`), límite estricto de 50 MB para grabaciones de voz/video, subida directa a AWS S3 mediante `@aws-sdk/client-s3`.
- **Observabilidad**: Morgan + exportador Prometheus propio (`utils/metrics.ts`, etiquetas `method`/`path`/`status_code`, `normalizePath()` para UUIDs) + `@sentry/node` inicializado en `initializeApp` si hay `SENTRY_DSN` (reportar siempre con `reportarError` de `config/sentry.ts`).

### Frontend (`/frontend`)
- **Framework**: Next.js 16 (React 19, Turbopack, App Router, `output: 'standalone'`).
- **Estilos & UI**: Tailwind CSS + Lucide React Icons.
- **Animaciones**: GSAP 3 (GreenSock) en auth y landing (optimizadas con `requestAnimationFrame` sin forzar re-renders de React) y `framer-motion` en el dashboard (~55 componentes). `react-is` es dependencia de pares de `recharts`: no quitarla.
- **Gestión de Estado**: sin store global (Zustand se retiró en 2026-09: `analysisStore.ts` no tenía consumidores). Estado local de React + React Context para temas (`components/ThemeProvider.tsx`); el progreso de un análisis se sigue con `app/hooks/useAnalysisEvents.ts` (SSE con ticket + polling escalonado de respaldo).
- **Cliente HTTP**: Axios centralizado (`lib/api.ts` y `lib/config.ts`) con interceptores para rotación automática de JWT, detección de desconexión y `AbortController`.
- **Sin proxy en Next**: el navegador llama al API con `NEXT_PUBLIC_API_URL` (absoluta). El refresh token va en la cookie HttpOnly `bi_refresh` (`Path=/api/auth`), así que frontend y API deben compartir dominio registrable (`app.tudominio.com` + `api.tudominio.com`); el access token (15 min) va en `localStorage`. SSE usa ticket de un solo uso (`POST /api/events/ticket`), nunca el JWT en la URL.

### Infraestructura & Docker
- **Docker Compose v2**: Especificación moderna sin tag `version:`.
- **Red**: Red puente dedicada `bi0a100-network`.
- **Init System**: `dumb-init` en todas las imágenes de desarrollo y producción para propagación instantánea de señales `SIGTERM`/`SIGINT`.
- **Seguridad de Contenedores**: Usuarios no privilegiados (`nodejs` / `nextjs`, uid 1001) y archivos `.dockerignore` estrictos en la raíz, `/backend` y `/frontend`.

---

## 4. Flujo de Trabajo Asíncrono (BullMQ)

```
[Usuario/Frontend] 
       │ 1. POST /api/:modulo/:productoId
       ▼
[Backend Router] ──> 2. Middleware requireCanRunAnalisis (comprueba cuota del plan)
       │ 
       ▼ 3. Crea registro en DB (estado: 'procesando')
       │ 4. Encola trabajo en BullMQ ('analysis-queue')
       ▼ 5. Retorna HTTP 202 Accepted { analisis_id }
[Frontend] ──> 6. Polling continuo cada 2s (GET /api/:modulo/:id/status)
       │
[BullMQ Worker] ──> 7. Ejecuta análisis (IA / Algoritmos financieros / Scrapers)
       │ 8. Actualiza entidad en DB (estado: 'completado' o 'fallido')
       ▼
[Frontend] ──> 9. Recibe status 'completado' y renderiza dashboard interactivo
```

---

## 5. Roles y Multi-Inquilino (Multi-Tenancy)

- **`owner` (Dueño)**: Acceso total a la organización. Crea y edita productos, administra planes de facturación (Stripe), invita miembros del equipo y asigna herramientas.
- **`trabajador` (Colaborador)**: Vinculado a un propietario mediante `AsignacionTrabajador`. Acceso de lectura o acotado a los productos y herramientas autorizadas.
- **`admin` (Superadministrador)**: Usuario con bandera `es_admin = true`. Acceso a métricas globales y administración de cuentas en `/api/admin`.

### Cuotas por Plan
- **Freemium (Gratis)**: 1 análisis por módulo por producto; 5 créditos de IA al mes para acciones bajo demanda.
- **Pro (Emprendedor) / Pro+ (Negocio) / Business (Empresa) / Enterprise**: 20 / 60 / 120 / 600 créditos de IA al mes (`creditos_ia_mes` en `planService.ts`). Cada acción cuesta créditos según `COSTO_CREDITOS` (`services/billing/creditosIA.ts`); sin créditos la API responde **402** con `upgrade_required`.
- Los análisis con estado `'error'` o `resultado_estimado = true` (la IA cayó a plantilla) **no consumen cuota** y sus créditos se reembolsan.
- Precios en MXN con IVA incluido: ver `docs/pricing/PROPUESTA_PLANES_2026-09.md`.

### Modelos de IA
Toda llamada a Claude pasa por `crearMensaje(seccion, tarea, params)` de `backend/src/config/anthropic.ts` (nunca `new Anthropic()` en un servicio): `mecanica` → Sonnet 5.5 con effort `low` (hasta 2026-10 era Haiku 4.5), `estrategia`/`extensa` → Sonnet 5.5 (`medium`), `critica` → Opus 5.5 (`medium`). En la familia 5.5 el razonamiento siempre está activo y los niveles de effort se recalibraron: compara con «Probar» antes de subirlos. `temperature`/`top_p`/`top_k` solo viajan a los modelos de `ACEPTA_SAMPLING` (hoy solo Haiku 4.5): cualquier otro responde 400, así que un modelo nuevo no necesita registrarse para no romper. Sonnet 5.5 y Opus 5.5 tienen clasificador y van con `fallbacks: 'default'` del servidor. El costo usa el precio y la lectura de caché **de cada modelo** (`PRECIOS_USD_POR_MILLON`: 0.1× en Sonnet, 0.05× en Opus 5.5); los modelos retirados se quedan en la tabla porque siguen en `uso_ia` y pueden responder como respaldo. Cada llamada queda en `uso_ia` con su costo. Claves: `docs/deployment/CLAVES_IA.md`.

### Prompts versionados (los seis módulos: Legal, Mercado, Finanzas, Ventas, Marketing y Brief)
El `system` se arma con `componerSistema()` (`services/ia/componerSistema.ts`) en tres bloques y en este orden: **modo** del módulo (`legal.modo`, criterio experto), **fichas de país** (`legal.pais.<ISO>`) y **contrato** (esquema JSON, reglas anti-inyección y precedencia). Los dos primeros son editables y versionados en `prompts_ia` desde `/dashboard/admin/prompts` (`/api/admin/prompts`, solo superadmin; publicar pide código TOTP fresco). El contrato vive **solo en el código**: nunca pongas reglas de formato ni de seguridad en la parte editable, y nunca metas datos del usuario en el `system` (van en `messages`, con `treat_as="data_only"`). Sin versión publicada se usa el texto del repositorio (`services/ia/prompts/`). Lo publicado es inmutable (trigger) y hay un solo publicado por clave. El worker **ancla** las versiones al empezar el trabajo (`anclarVersionesPrompt`, guardadas con `job.updateData`), así que publicar no cambia un análisis en curso. Cada resultado guarda `meta` (contrato, versiones, datos usados) y `transparencia` (supuestos, información faltante, nivel de confianza); el código fuerza la confianza a «bajo» si el país no tiene ficha. `uso_ia.prompt_version_id` permite comparar el costo entre versiones. El «Afina tu análisis» se guarda en `productos.perfil_negocio` (`services/ia/perfilNegocio.ts`, gemelo en `frontend/lib/perfilNegocio.ts`: se mueven juntos) y lo reutilizan todos los módulos. Un módulo nuevo en este esquema se declara en `services/ia/prompts/index.ts` (modo y `clavesDeModulo`), en `seccionesCatalogo.ts`, con sus casos de prueba (`casosPrueba.ts`, `casosPruebaMercado.ts`, `casosPruebaFinanzas.ts`, `casosPruebaVentas.ts`, `casosPruebaMarketing.ts`, `casosPruebaBrief.ts`) y en `probarVersion()` (`services/ia/probarPrompt.ts`). **Mercado** (`mercado.modo`, contrato `mercado@2`) usa el modo en el DAFO y en el reporte BI; como sus secciones van en columnas, la transparencia, las secciones extra (salen de la llamada del reporte BI) y las versiones se guardan en `analisis_mercado.meta_ia` (`construirMetaIaMercado`). Ahí la confianza la fija el código con la `cobertura_datos` del modelo de viabilidad y la IA solo puede bajarla (`combinarTransparencia`); solo se ocultan el DAFO y el reporte BI, nunca las secciones de datos. **Finanzas** (`finanzas.modo`, contrato `finanzas@2`) lo calcula el código; el modo solo lo usan los riesgos (lo único que escribe la IA y lo único ocultable), y `analisis_finanzas.meta_ia` lleva la misma transparencia: la confianza la fija lo que falta de los 5 datos que cambian el cálculo y si los números salieron de la contabilidad (`origen_datos`). Worker y «Probar» comparten `generarResultadoFinanzas()`. **Ventas** (`ventas.modo`, contrato `ventas@2`): lo llevan todas las llamadas de estrategia (tips, historia, perfil de cliente, objeciones, guiones, competencia), cada una con su contrato en `ventasService.ts`; las mecánicas (seguimientos, palabras clave) también llevan el modo, con su contrato. La transparencia sale de la llamada de tips (siempre corre) y se guarda en `analisis_ventas.meta_ia`; la confianza la fijan los 4 datos del embudo (contactos al mes, tasa de cierre, ciclo de venta, objeciones), que son del análisis (`inputs_data`), no del perfil del negocio. Solo se oculta la historia del día. Worker y «Probar» comparten `generarResultadoVentas()`. **Marketing** (`marketing.modo`, contrato `marketing@2`): las estrategias son deterministas; el modo lo llevan el calendario (`contratoCalendario`, de donde salen la transparencia y las secciones extra) y el reporte de Ads (`CONTRATO_REPORTE_ADS`); los copies llevan el modo con `CONTRATO_COPIES` y se escriben para las estrategias que de verdad salieron (antes eran PREMIUM/VOLUMEN/ESPECIALIZADO aunque el plan recomendara Ventas+). Solo se ocultan los copies. La confianza la fijan 4 datos (mercado analizado, cliente ideal —de Ventas o del formulario—, lo ya probado y los activos para contenido), «alto» exige además el reporte de Ads, y un calendario de plantilla queda en «bajo». Va en `analisis_marketing.meta_ia` (`construirMetaIaMarketing`). Nada de cifras inventadas: ni testimonios, ni escasez falsa en guiones, ni vistas o engagement medidos en la plantilla (los de la IA se rotulan «Estimado»). Worker y «Probar» comparten `generarResultadoMarketing()`. **Brief** (`brief.modo`, contrato `brief@2`): una sola llamada (`brief.identidad`) con el modo y `contratoBrief`; los datos del negocio (PUV, cliente ideal, país, perfil) y del formulario van en el mensaje como datos. «Afina tu análisis»: marcas de referencia (admiradas y a evitar), elementos a conservar y usos de la marca (`USOS_MARCA`). El puntaje se explica siempre (`score_marca.razon`, `origen`): con IA lo calcula con los criterios del contrato (el ejemplo ya no trae números que copiar); sin IA, `puntajePorReglas()` sobre lo declarado, con `impacto_visual: null` (no se evalúa lo visual sin IA). La confianza la fijan el cliente ideal y la PUV del producto, más referencias, elementos a conservar y usos; de plantilla, «bajo». Se ocultan el diagnóstico y las instrucciones al diseñador. Va en `analisis_brief.meta_ia`; paleta y tipografías las asigna el sistema aunque la IA diga otras. Worker y «Probar» comparten `generarResultadoBrief()`. El **análisis del logo** (`POST /api/marca/logo`, sección `brief.logo`, contrato `logo@2`) usa el mismo `brief.modo` con su contrato en código (`CONTRATO_LOGO_TEXTO` en `logoAnalysisService.ts`) y recibe en el mensaje el producto, el perfil, el brief guardado y los usos del último brief (`meta_ia.meta.contexto_usado.usos_marca`); el total lo calcula el código y sin brief la confianza no pasa de «medio». Sin IA no se ve la imagen: puntajes `null`, sin colores ni tipo de logo, y en su lugar pruebas que el dueño puede hacer; si la IA falla se anota el fallback y `conCreditos` devuelve el crédito (antes devolvía puntajes y colores fijos y cobraba).

---

## 6. Catálogo de Rutas Backend (27 Módulos API)

Montadas en `backend/src/app.ts`:
1. `/api/auth`: Signup, login (rate limited), refresh token, logout, me, reset-password. **Entrar y registrarse con Google** (`services/google/loginGoogle.ts`, OpenID Connect con PKCE, scope `openid email profile`): `GET /google?modo=login|registro&tipo=&codigo=` → Google → `GET /google/callback`, que busca la cuenta por `usuarios.google_sub`, si no la enlaza por email verificado y si no la crea (respeta tipo de cuenta e invitación), pone la cookie `bi_refresh` y redirige a `/auth/google` del frontend, que la canjea con `/auth/refresh` (ningún token viaja en la URL). El `state` va firmado, caduca a los 10 min, es de un solo uso y su nonce tiene que coincidir con la cookie HttpOnly `bi_google` del navegador que empezó (evita el login CSRF). Mismo cliente OAuth que Calendar con su propia URL de retorno `GOOGLE_LOGIN_REDIRECT_URI`; sin ella `GET /proveedores` responde `{ google: false }` y el botón no aparece. Errores de vuelta en `?error=` (`ERRORES_GOOGLE` en `components/auth/BotonGoogle.tsx`).
2. `/api/billing`: Planes, checkout session Stripe, webhook HMAC, suscripción, portal.
3. `/api/productos`: CRUD de productos, logotipos, archivos multimedia y archivado.
4. `/api/mercado`: Análisis de mercado, competidores, viabilidad. **La tracción sale del POS, no del formulario**: `services/mercado/traccionReal.ts` agrega en SQL los meses COMPLETOS de `ventas` del producto (reutiliza `filtroVentas` de Reportes, así que las canceladas no cuentan) y el orquestador usa ese `clientes_mes` y esa `tasa_repeticion` por encima de lo declarado, guardando el rastro en `traccion_data`. `GET /traccion/:productoId` (montada **antes** de `/:id`) alimenta el formulario. **Nunca se fabrican competidores ni tendencias**: sin fuente (SerpAPI/MercadoLibre) el resultado lleva `fuente_disponible: false` + `motivo_sin_fuente` y los factores que dependen de ese dato **no puntúan** en el score (se reparte el peso, como con el precio relativo), baja la confianza y `cobertura_datos` dice qué proporción del modelo se pudo evaluar. NSE y estacionalidad solo se aplican donde hay tabla propia (`services/mercado/coberturaPais.ts`): la de AMAI es mexicana y no describe a Colombia ni a Brasil.
5. `/api/marketing`: Estrategia de marketing, copies, buyer personas. «Afina tu análisis» manda `ya_probado`, `activos` (`ACTIVOS_MARKETING`) y `zona_clientes` al trabajo, y el perfil del negocio al producto. Moneda y país salen del producto en copies, calendario, reporte de Ads y en la página de resultado (`PlanInversionSection` recibe `pais`: los rangos de medios físicos son pesos mexicanos y fuera de México se muestran sin precio; el mínimo diario por red se mide en clics con el CPC de la simulación). Los canales de cada estrategia son los que el negocio usa (todas sus plataformas) más uno sugerido como máximo, y LinkedIn solo si vende a empresas (`perfil.tipo_clientes`); garantía y extra son huecos «[Solo si puedes cumplirla]…», y el público es el cliente ideal declarado. La unit economics de Ventas+ es una **simulación con supuestos** (`origen_supuestos`), el ROAS puede ser menor que 1 (`rentable: false`) y el CPC de respaldo sale por país y moneda de `services/marketing/benchmarksPais.ts`. Los nombres de `UnitEconomicsVentasPlus`, `ScriptWhatsAppVentasPlus`, `SecuenciaSeguimientoVentasPlus`, `kpis_reales` (`KpisRealesVentasPlus`) y `plan_accion_paso_a_paso` (lista de textos) están duplicados en `frontend/.../VentasPlusEstrategiaView.tsx`: **se mueven juntos** (estuvieron desalineados: el tablero entero salía en ceros y el plan de acción en tarjetas vacías).
6. `/api/finanzas`: Modelado financiero, márgenes, simulador de escenarios. **El payback exige `inversion_inicial`**: sin ese dato `meses_para_recuperar_inversion` va `null` con `payback_no_disponible`, nunca un número (antes devolvía el primer mes con utilidad acumulada ≥ 0, que para un negocio rentable es el mes 1). La proyección va **antes de impuestos** y expone `caja_necesaria` / `mes_valle`. **Margen real** (`services/finanzas/economiaUnitaria.ts`): si el precio incluye el impuesto al consumo se quita con la tasa del país (`utils/taxConfig.ts`, nunca la manda el usuario), la comisión de plataformas se cobra sobre el precio y va al costo variable, y el sueldo del dueño fuera de los costos se suma a los fijos. Si vende perecederos (`vendePerecederos`: sector alimentos o categoría de comida), la **merma** (`merma_pct`, en `CAMPOS_FINANCIEROS`) encarece cada venta (costo ÷ (1 − merma)) y, sin ese dato, la transparencia la pide (6 datos en vez de 5). El resumen se condiciona a las ventas («con las ventas que declaraste…», o «tus ventas reales» si vienen de la contabilidad) y pone al frente el punto de equilibrio: nada de presumir el ROI ni de cifras de manual. Con días de cobro/pago y cuota de deuda la caja sale de un **flujo de caja** mensual (`flujo_caja`, `saldo_caja`, `capital_de_trabajo`, `cobertura_deuda`); sin esos datos es idéntica a la utilidad. Esos datos de cobro y pago viven en `productos.perfil_negocio` (`CAMPOS_FINANCIEROS`) y la ruta los copia al trabajo. El simulador del Centro de Mando recalcula con el mismo margen. `analisis_finanzas.pais` sale del producto (antes quedaba siempre en 'MX'). `GET /calibracion/:productoId` (montada **antes** de `/:id`) devuelve los números reales del negocio desde `movimientos_contables` para precargar el formulario.
7. `/api/legal`: Diagnóstico normativo, checklist regulatorio, contratos. Primer módulo con prompts versionados (ver *Prompts versionados*): fichas de 6 países en `services/legal/fichasPais.ts` (MX, CO, AR, PE, CL, ES); el resto de LATAM se analiza con reglas de prudencia y confianza baja hasta que el admin publique su ficha.
8. `/api/brief`: Brief de identidad de marca con IA Claude Sonnet 5.5 (cuota global por cuenta). Acepta los campos de «Afina tu análisis» (`marcas_admiradas`, `marcas_evitar`, `elementos_conservar`, `usos_marca`) y `perfil_negocio`, que se guarda en el producto.
9. `/api/herramientas`: Directorio y asignación de herramientas de negocio.
10. `/api/equipo`: Invitaciones y asignaciones de colaboradores (`trabajador`).
11. `/api/pos`: Terminal punto de venta, tickets con folio de `secuencias_folio` (ver regla 4). Las ventas se cancelan, nunca se borran (ver regla 9).
12. `/api/cotizaciones`: Generación de cotizaciones con folio de `secuencias_folio` (ver regla 4); la conversión a venta es atómica (índice único en `ventas.cotizacion_id`).
13. `/api/inventario`: Control de stock de insumos con bloqueo pesimista `pessimistic_write`.
14. `/api/contabilidad`: Importación de transacciones CSV, conciliación y deduplicación. **El listado va paginado por cursor** (`GET /:productoId` → `{ movimientos, siguiente }`, filtros `tipo/fuente/categoria/q/desde/hasta`, `limite` ≤ 500) y los KPIs, P&L, canales, liquidaciones y calibración se agregan en SQL (`services/contabilidad/consultasContables.ts`; `GET /:productoId/resumen`, `GET /:productoId/exportar` en streaming). Nunca cargues el historial completo con `getMany()`: con 600k movimientos el proceso se quedaba sin memoria y tumbaba la API para todos.
15. `/api/nomina`: Registro y cálculo de nóminas para colaboradores.
16. `/api/clientes`: Directorio de clientes y CRM básico.
17. `/api/negocios`: Perfil empresarial y configuración de actividad económica.
18. `/api/calendario`: Cronogramas y eventos (cálculo de días exacto sin desfase UTC). Dos sub-routers cuelgan de aquí y **se montan antes de las rutas `/:id`** (si no, `exigirUuid` responde 400 al ver la palabra en lugar de un UUID): `/api/calendario/lugares`, catálogo genérico de lugares de atención (mesa, silla, consultorio, bahía…) que **se archivan** cuando ya tienen historial; y `/api/calendario/espera`, la fila del día para quien llega sin cita (`esperando → llamado → atendido → liberado`, más `no_llego`). Un lugar está ocupado si tiene un turno `atendido`: no se guarda estado en el lugar. `POST /espera/:id/llamar` marca el llamado y devuelve el enlace de WhatsApp (sin teléfono responde 200 con `whatsapp_url: null`, para llamar de viva voz). La fila usa el mismo gating `citas` —no es una herramienta nueva— pero cuenta su propio tope de movimientos, y el día sale de `hoyDePeticion(req)`, nunca de `toISOString()`.
19. `/api/vertical`: Módulo de adaptación vertical de la industria.
20. `/api/ventas`: Análisis de ventas, transcripción de voz (Whisper) y tips autenticados. Moneda e idioma salen del país del producto (antes «MXN» y «español mexicano» fijos). Las llamadas bajo demanda (objeciones, seguimientos, palabras clave, guiones, competencia) arman su contexto con `inputDesdeAnalisis()`: lo declarado en el análisis más lo que sabe hoy el producto (`inputDeVentas`); no lo vuelvas a armar a mano en cada ruta.
21. `/api/admin`: Métricas y paneles de administración de la plataforma (`requireAdmin`). `/api/admin/prompts` (prompts de IA versionados) se monta **antes** que `/api/admin`.
22. `/api/events`: Server-Sent Events (SSE) en tiempo real con validación JTI en Redis.
23. `/api/reportes`: Área de reportes de Contabilidad — series de ventas, ranking de productos, almacén, clientes, horarios y conversión de cotizaciones. Agregación en SQL; hereda el gating de `contabilidad`.
24. `/api/config`: Parámetros públicos de configuración de la aplicación.
26. `/api/mantenimientos`: Herramienta de mantenimiento preventivo de equipos (tanque de gas, refrigerador, parrilla, tijeras…). El «cada cuánto» sale del catálogo determinista `services/mantenimientos/catalogoIntervalos.ts` (~50 tipos × intensidad de uso `bajo`/`normal`/`intenso`), gratis e instantáneo; solo si el catálogo no reconoce el objeto, `POST /sugerencia` lo estima con IA (tarea `mecanica`) y cobra 1 crédito (`mantenimiento_sugerencia`). `POST /:id/registrar` guarda el servicio hecho y, si lleva costo, crea el egreso en `movimientos_contables` (`fuente: 'mantenimiento'`) dentro de la misma transacción. El semáforo (al día / ya toca / vencido) se calcula con `estadoEquipo` y alimenta el panel de alertas operativas.
27. `/api/integraciones/google-calendar`: copia de las citas en Google Calendar, **solo app → Google** (lo que se cambie en Google no vuelve). OAuth con `fetch` directo (`services/google/oauthGoogle.ts`, scope `calendar.events` + `openid email`); `GET /callback` es **pública** y solo acepta un `state` firmado con HMAC, de 10 min y de un solo uso (Redis). El refresh token se guarda cifrado (AES-256-GCM, `GOOGLE_TOKENS_KEY`) en `conexiones_google_calendar`, **una conexión activa por cuenta**. Cada alta/cambio/baja de `routes/calendario.ts` encola un trabajo en la cola BullMQ `calendar-sync` (`workers/calendarQueue.ts`) y la respuesta no espera a Google. El id del evento se deriva del id de la cita (`idEventoDeCita`): un reintento que choca con 409 actualiza en vez de duplicar. `invalid_grant`/401/403 desactivan la conexión y la agenda pide reconectar. La hora va como hora local + zona IANA, que sale de `usuarios.zona_horaria`: el frontend manda `X-Zona-Horaria` en cada petición (`lib/api.ts`) y `authenticate` la guarda si cambió (throttle en Redis); sin ella, se deduce del país (`services/google/zonaHoraria.ts`). **Si quitas `X-Zona-Horaria` de `allowedHeaders` en `middleware/cors.ts`, el preflight tumba todas las peticiones de la app.**
25. `/api/network` & Portal `/net0`: Red de expertos y oficios **Net0**. El frontend vive como un portal independiente en `/net0` (con su propio layout, `Net0Navbar` y `Net0Footer`, sin `DashboardShell`, abierto desde el panel principal de BI en una pestaña dedicada `target="net0"` sin `rel="noopener"`). La API del backend permanece exclusivamente en `/api/network` (sin alias `/api/net0`). Directorio de profesionales en 7 categorías: legal, contabilidad, marketing, diseño, ventas, proveedores, tecnología; perfiles con portada, galería (12 fotos), servicios (15) y WhatsApp, reseñas, métricas diarias (`experto_metricas_dia`) e **impulsos**: campañas prepagadas por días con alcance ciudad o nacional, cupo por lugar y pago único en Stripe Checkout (`services/network/impulsosService.ts`; tarifas en `IMPULSO_TARIFA_CIUDAD_MXN` / `IMPULSO_TARIFA_NACIONAL_MXN`, por defecto $39 y $99 MXN/día). Los impulsados salen en `promocionados` (solo página 1) etiquetados como «Promocionado». Al registrarse se elige `usuarios.tipo_cuenta` (`negocio` / `experto`), que solo decide la redirección. **Las rutas `GET /expertos` y `GET /expertos/:id` son públicas sin token** e indexables (`/net0` y `/net0/[id]`); **las páginas públicas NUNCA llaman a endpoints autenticados (como `/auth/me`) al montar**, chequeando sesión solo mediante `useHaySesion` (`localStorage`). Las rutas privadas (`/net0/mis-fichas`, `/net0/registro`) están desindexadas en `robots.ts` y redirigen tras autenticación preservando el parámetro seguro `?next=`. **Regla de cupo inteligente**: Toda cuenta tiene un cupo base de 2 perfiles de experto; cada producto con análisis de IA completado y real (no estimado) en cualquiera de las 6 tablas (`analisis_mercado`, `marketing`, `finanzas`, `legal`, `ventas`, `brief`) desbloquea 1 perfil adicional (`limite = Math.max(2, total_analizados)`). El alta en `POST /expertos` corre en transacción con cerrojo consultivo `pg_advisory_xact_lock(hashtext('net0:cupo:' + req.userId))`. La cola de revisión vive en `/api/admin/network` (montada **antes** de `/api/admin` en `app.ts`). `documento_url` (cédula) nunca se expone fuera de admin.

> [!CAUTION]
> **Patrocinios y el webhook de Stripe**
> Los patrocinios de la red se cobran con el mismo Stripe y al mismo cliente que los planes del SaaS, pero **no son un plan**. Los **impulsos** (pago único, `metadata.tipo = 'impulso_experto'`) se desvían igual, a `manejarEventoImpulso`, y solo se activan con `payment_status = 'paid'` o `async_payment_succeeded`. Las suscripciones de patrocinio llevan `metadata.tipo = 'patrocinio_experto'` y `handleStripeEvent` (en `routes/billing.ts`) las **desvía a `manejarEventoPatrocinio` antes de tocar la tabla `usuarios`**. Si se quita ese desvío, `extractSubscriptionPlan` no reconoce el producto, devuelve `'freemium'` y un experto con plan Pro **queda degradado por haber pagado un patrocinio**, además de perder el rastro de su suscripción real. Precios: `STRIPE_PRICE_PATROCINIO_LEGAL` / `_MARKETING` / `_VENTAS`, con `STRIPE_PRICE_PATROCINIO` como fallback común.
- `/health`: Estado de salud de PostgreSQL, Redis, Uptime y Worker in-process.
- `/metrics`: Endpoint de Prometheus protegido con token Bearer en producción.

---

## 7. Reglas Críticas de Desarrollo y "Gotchas" (Para Agentes IA)

> [!CAUTION]
> **1. TYPEORM_SYNCHRONIZE=false (ESTRICTO)**
> NUNCA cambies `TYPEORM_SYNCHRONIZE` a `true`. Con synchronize activo, TypeORM borra las decenas de índices de rendimiento y destruye las restricciones de claves foráneas creadas por las migraciones (ver historial acumulado en `backend/src/migrations/`). Todos los cambios de esquema se aplican **exclusivamente** con `npm run migration:run`.
> Desde 2026-09-27 `synchronize` es `false` fijo en `config/database.ts` (lo vigila `__tests__/config/database.test.ts`). Antes bastaba con que faltara la variable: `npm run seed:demo` o un `npm run dev` fuera de Docker sincronizaban al conectar, y así quedó dañada `bi0a100_db` (reparación sin pérdida de datos: `docs/audit/reparar_bi0a100_db_2026-09-27.sql`). Una FK nueva lleva índice en la columna hija: Postgres no lo crea solo y borrar el padre recorre la tabla entera. `migrationsRun` también es `false` fijo: con `TYPEORM_MIGRATIONS_RUN=true`, la API y el worker migran al arrancar con `migrarAlArrancar()` (`config/migracionesAlArrancar.ts`) bajo `pg_advisory_lock`, porque en `docker-compose.prod.yml` arrancan a la vez y migraban en paralelo (uno se caía). En Railway las migraciones van en `preDeployCommand`. Todos los seeds (`seed:demo`, `seed:alertas` y los de `src/seeds/`) corren sobre el esquema de migraciones y salen con código 1 si fallan.

> [!WARNING]
> **2. UUIDs como Cadenas**
> Todas las llaves primarias (`id`), `usuario_id`, `producto_id`, etc., son UUIDs nativos. NUNCA uses `parseInt()` sobre un ID.

> [!IMPORTANT]
> **3. Webhooks de Stripe y Body Parsing**
> La ruta `/api/billing/webhook` requiere el buffer crudo para la validación HMAC `stripe.webhooks.constructEvent()`. En `src/app.ts`, `express.raw({ type: 'application/json' })` debe montarse **antes** de `express.json()`.

> [!IMPORTANT]
> **4. Generación de Folios y Concurrencia**
> En POS y cotizaciones el folio sale de `siguienteFolio(manager, usuarioId, 'venta' | 'cotizacion')` (`utils/folios.ts`), **dentro de la transacción que crea el registro**: `UPDATE secuencias_folio SET ultimo = ultimo + 1 … RETURNING` (O(1), bloqueo de fila). El primer uso siembra el contador desde el máximo `POS-`/`COT-` existente, y si el número ya existe se resincroniza solo. NUNCA vuelvas a `MAX(...) + 1` (escanea todas las ventas de la cuenta con el lock tomado) ni a `count()` (colisiona si se borran registros).

> [!IMPORTANT]
> **5. Conexión Perezosa de BullMQ**
> La conexión ioredis del productor en `src/workers/analysisQueue.ts` se inicializa de forma **perezosa** (`lazy`). Esto previene sockets huérfanos que impidan que los tests de Jest o los scripts CLI finalicen.

> [!TIP]
> **6. Contextos de Compilación de Docker**
> El build de la imagen backend debe ejecutarse con contexto `backend/` (`docker build -f backend/Dockerfile.prod backend/`). El frontend debe ejecutarse con contexto `frontend/`. Los archivos `.dockerignore` protegen las imágenes de la inyección de `node_modules` de Windows o credenciales `.env`.

> [!IMPORTANT]
> **7. Seguridad de Autenticación y Criptografía**
> Las contraseñas de usuario se hashean utilizando bcrypt con un factor de costo de 12 rounds (`BCRYPT_COST = 12` en `src/routes/auth.ts`). El middleware de autenticación valida la denylist de tokens en Redis con fallback fail-open e instrumentación Prometheus (`auth_denylist_check_failed_total`).

> [!IMPORTANT]
> **9. Convenciones de API que no se deben romper**
> - Todo router con parámetros de entidad llama a `exigirUuid(router, 'id', …)` (`middleware/validate.ts`): un id no UUID responde 400, nunca llega a Postgres.
> - Orígenes no permitidos → 403 en `middleware/cors.ts`; los rate limits usan `AlmacenLimiteRedis` (compartido entre réplicas, memoria de respaldo).
> - Los seeds y scripts de demo importan primero `scripts/guardiaSeeds.ts`: abortan con `NODE_ENV=production` o base de datos remota.
> - Los tests de integración solo escriben en bases cuyo nombre contenga `test` (`__tests__/helpers/dbGuard.ts`).
> - **"Hoy" nunca con `new Date().toISOString().slice(0, 10)`** (día UTC: en México lo cobrado desde las 18:00 quedaba con fecha de mañana). Usa `hoyDePeticion(req)` de `utils/fechaLocal.ts` (zona del navegador por `X-Zona-Horaria`, luego la guardada del usuario, luego CDMX).
> - **Historial que no se borra:** ventas, pagos de nómina y movimientos de inventario tienen FK `NO ACTION` hacia producto, empleado e insumo (migración `1775590000000`). Un producto con ventas no se borra (409); un empleado con pagos o un insumo con movimientos se **archivan** (`activo = false`). No vuelvas a poner `CASCADE` en esas FK.
> - **Altas de dinero con `idempotente('<ámbito>')`** (`middleware/idempotency.ts`): el cliente manda `Idempotency-Key` (8–100 caracteres `[A-Za-z0-9_-]`, uno por intento de guardado; `nuevaClaveIdempotencia()` en `frontend/lib/api.ts`) y un reintento devuelve la respuesta guardada 24 h con `Idempotent-Replayed: true`; otro cuerpo con la misma clave → 422. Sin cabecera se comporta como antes. Un `POST` nuevo que cree ventas, pagos o movimientos debe llevarlo.
> - **Se responde después del COMMIT, nunca desde dentro de `AppDataSource.transaction`**: el callback devuelve un resultado (unión discriminada, como `POST /api/network/expertos` o el PATCH de admin de la red) y el `res.status(...)` va fuera. Si la respuesta sale antes, el cliente usa el id mientras la fila aún no es visible para otras conexiones (con Postgres cargado, subir la cédula de una ficha recién creada daba 404), y si el COMMIT falla ya se respondió éxito.
> - **Listados con historial paginan por cursor** con `paginar()`/`responderPagina()` de `utils/paginacion.ts`: `?antes=<cursor>&limite=<n>` (200 por defecto, 500 máx.) y el cursor siguiente en la cabecera `X-Siguiente` (expuesta en CORS); el cuerpo sigue siendo el array. Nada de `.limit()` con `leftJoinAndSelect` (limita filas unidas, no entidades) ni de `OFFSET`.
> - **Números con tope de columna**: usa `dinero()`, `cantidad()` y `costoUnitario()` de `utils/limitesNumericos.ts` en los esquemas Zod (un `1e12` o un `NaN` no llegan a Postgres). `venta_items.cantidad` es `numeric(12,3)`. Los enteros llevan `.max(MAX_ENTERO)` y los textos `.max(n)` igual a su `varchar(n)`; el tope es el de la columna **más estrecha a la que llega** el dato (un salario acaba en `movimientos_contables.monto`, la moneda de una cotización en `ventas.moneda` varchar(3)). Si algo se escapa, `middleware/errorHandler.ts` responde 400/409 a los errores de dato de Postgres (22001, 22003, 22P02, 23514, 23505) en vez de 500, pero solo en rutas que delegan con `ah()`: las que hacen `res.status(500)` por su cuenta no pasan por él.
> - **Gating por petición**: `requireToolCapability`/`requireHerramientaAccess` memorizan usuario y permisos en `req`, y la selección de herramientas vive en Redis 60 s (`herr_sel:{cuenta}`). Al cambiar la selección llama a `invalidatePlanCache(cuentaId)`. El tope del plan gratuito se cuenta bajo un candado Redis por cuenta y herramienta.
> - **Tiempo máximo por consulta**: el pool fija `statement_timeout` (30 s, `DB_STATEMENT_TIMEOUT_MS`) e `idle_in_transaction_session_timeout` (60 s). Un trabajo largo legítimo hace `SET LOCAL statement_timeout = 0` dentro de su transacción (como la purga de papelera); las migraciones ya van sin límite (`config/cli-datasource.ts`).
> - **Rate limit general por usuario**: con token de firma válida cuenta por `userId` (`RATE_LIMIT_MAX_USUARIO`, 1 200 / 15 min); sin sesión, por IP (`RATE_LIMIT_MAX`, 300). `req.ip` depende de `TRUST_PROXY` (saltos de proxy delante del backend; 1 por defecto, 2 con Cloudflare delante del hosting).
> - **Una venta no se borra: se cancela.** `POST /api/pos/ventas/:id/cancelar` (y el alias antiguo `DELETE`) deja `ventas.estado = 'cancelada'` con `cancelada_por_id`, `motivo_cancelacion` y `fecha_cancelacion`, genera asientos contables **inversos** con fecha de hoy (categoría `Cancelaciones`, para no tocar un mes ya cerrado; cada inverso guarda en `revierte_movimiento_id` el asiento que revierte), devuelve el almacén con movimientos de **entrada** (la salida original se conserva) y escribe en `auditoria_dinero`. Reportes ya excluye las canceladas en `filtroVentas`/`filtroAmbito`; si escribes una consulta nueva sobre `ventas`, filtra `estado <> 'cancelada'`. **Un reverso cuenta como el negativo de su original, no por su tipo**: toda suma de dinero sobre `movimientos_contables` usa `JOIN_ORIGINAL` + `sumaNeta()` / `LATERAL_CLASE` de `services/contabilidad/reversos.ts` (antes una venta de $87 cancelada salía como $99 de ingresos y $99 de egresos, $87 de gasto operativo y $99 de base fiscal). La base de la estimación fiscal (`fiscal_base.ingresos`) va sin el impuesto que ya viene en las ventas («… por pagar» automático), y la devolución al almacén de una cancelación (entrada con `venta_id`) no es compra: resta del consumo por ventas.
> - **Acciones sensibles dentro de una herramienta** (`ACCIONES_SENSIBLES` en `planService.ts`: `cancelar_ventas`, `precio_libre`): viven en el mismo objeto `permisos` del trabajador pero NO son capacidades (están fuera de `CapabilityKey`). Se comprueban con `await permiteAccion(req, 'accion')` de `middleware/requirePlan.ts`, **después** del gating de la herramienta; el dueño siempre puede. Una acción nueva se declara en `PermisosTrabajador`, en `ACCIONES_SENSIBLES` y en el tipo `AccionSensibleKey`.
> - **El precio del POS incluye el impuesto.** Al público se le muestra el precio con impuestos (LFPC 7 Bis en México; Colombia, Perú, Chile y Ecuador igual; Argentina lo desglosa dentro), así que `calcularTotalesVenta()` (`services/pos/posService.ts`) cobra Σ precio × cantidad y desglosa el impuesto dentro con la tasa y el nombre del país (`impuestoIncluido`, `utils/taxConfig.ts`). `ventas.total` es lo que pagó el cliente, `ventas.subtotal` y `venta_items.subtotal_linea` van **sin** impuesto (márgenes y ventas por producto); el ticket muestra `precio × cantidad` e «Incluye IVA». Si se cobra el impuesto lo decide el régimen, no el ticket: `productos.cobra_impuesto_consumo` (`GET/PATCH /api/pos/punto-cobro/:productoId`, solo el dueño cambia; monotributo, Nuevo RUS o no responsable de IVA lo apagan) y el monto cobrado no cambia, solo si se registra «… por pagar». Las cotizaciones siguen con «subtotal + IVA» (van a empresas). Antes el POS sumaba el IVA encima: 3 tamales de $25 se cobraban $87 aunque la carta en PDF decía «precios incluyen IVA». El ticket por WhatsApp lleva el detalle en el texto (antes enlazaba a `/ticket/:id`, que no existía).
> - **El precio lo pone el catálogo.** Con `item_pos_id`, el item debe ser de la cuenta (si no, 404) y el precio se compara con el del catálogo: si difiere hace falta `precio_libre`, y la línea guarda `precio_catalogo` junto a `precio_unitario` más un apunte en `auditoria_dinero`.
> - **Los asientos derivados se corrigen en su herramienta**, no en Contabilidad: `PATCH`/`DELETE /contabilidad/movimiento/:id` responden 409 si el movimiento tiene `referencia_tipo` distinto de `ajuste_manual`. Igual en Almacén: un movimiento con `venta_id` no se borra a mano. Editar o borrar un movimiento manual queda auditado (`GET /api/contabilidad/auditoria`, solo el dueño).
> - **Nada en pantalla que no sea cierto.** Cada cifra o afirmación sale de (1) lo que dijo el usuario, (2) un cálculo de la app, (3) una tabla con fuente y fecha o (4) una estimación de la IA rotulada como tal. Las plantillas no rellenan con canales, ofertas, garantías ni públicos que el negocio no declaró: dejan un hueco «[…]». `__tests__/services/honestidadPlantillas.test.ts` lleva la lista de frases sin respaldo (`SIN_RESPALDO`: «Sólido», «lo habitual», «reembolsamos el 100 %»…); una plantilla nueva pasa por ahí. Las cifras que escribe la IA se revisan con `services/ia/verificadorCifras.ts` en Finanzas (riesgos), Ventas (tips), Mercado (reporte BI), Marketing (publicaciones del calendario) y Legal: las que no salen de los datos, del cálculo ni del `system` de la llamada (modo, ficha, contrato) van a la transparencia como estimación de la IA y a `meta.contexto_usado.cifras_sin_respaldo`; en Legal el aviso pide confirmarlas con la autoridad. La plantilla no se revisa (sus números los pone el código). Un módulo nuevo llama a `marcarCifrasSinRespaldo()` al armar su transparencia. El perfil del negocio admite `local_fisico: 'via_publica'` (puesto en la calle). Las 6 fichas de país traen `via_publica` (`PaisMeta`: quién da el permiso, qué pide y qué piden para vender alimentos; en México, que dentro del Metro no se vende): lo leen la IA (en el texto de la ficha) y la plantilla, que pone ese permiso en lugar de la licencia de local, los requisitos sanitarios del puesto (no del «establecimiento»), una alerta y su checklist; sin ficha lo describe en general, y el modo de Legal lo dice para toda LATAM. Finanzas le pone primero el riesgo de días sin vender (retiro, cambio de lugar, clima) con su punto de equilibrio y en la transparencia recuerda contar lo que se paga por el lugar; el Brief de plantilla pide la versión para lona o manta del puesto, no para la fachada. Ventas devuelve el crédito si la IA cae a plantilla en objeciones, guion o competidor (`avisoFallo` anota el fallback).
> - **Redondeo de dinero solo con `r2`/`r3`/`r4` de `utils/dinero.ts`**. Nada de `Math.round(v * 100) / 100` suelto: con coma flotante, 1,005 se redondeaba a 1,00 y el ticket no cuadraba con su asiento.
> - **Idea o negocio en marcha** con `normalizarEstatus()` / `estatusEfectivo()` de `utils/estatusProyecto.ts` (gemelo en `frontend/lib/estatusProyecto.ts`, se mueven juntos), nunca comparando el texto de `productos.estatus_proyecto`: el alta guarda `negocio_en_marcha`, los seeds `Negocio en Marcha` y el código viejo usaba `en_operacion`; por compararlo a pelo, toda idea se analizaba como negocio activo y el formulario de Mercado nunca mandaba la tracción. Producto o servicio sale de `productos.tipo_actividad` (`tipoActividadDe`), la categoría solo es el respaldo.
> - **Moneda por defecto**: `monedaDeCuenta(usuarioId, productoId)` (`utils/monedaCuenta.ts`), nunca `'USD'` fijo; un negocio mexicano daba de alta sueldos y cotizaciones en dólares. El país, con `paisDeCuenta()` del mismo archivo.
> - **"Hoy" en el frontend con `hoyLocal()` / `fechaLocal(d)`** de `frontend/lib/fechaLocal.ts`, nunca `toISOString().slice(0, 10)`: por la tarde en México el POS mostraba «Ventas de hoy» en $0 y registrar un mantenimiento fallaba por «fecha futura». Si el trabajo corre en el worker, el día local viaja en el payload (`fecha_local`, `mes_inicio`).
> - **Campos opcionales de texto aceptan `null`** (`textoOpcional = (max) => z.string().trim().max(max).nullable().optional()`): los formularios mandan `campo || null` y `z.string().optional()` los rechazaba con 400.
> - **Referencias de un alta** (`producto_id`, `negocio_id`, `cliente_id`…) se comprueban contra la cuenta (`exists({ where: { id, usuario_id } })` → 404). Un id ajeno no debe guardarse ni hacer que un efecto (el egreso de una compra) se omita en silencio.
> - **WhatsApp** con `telefonoWhatsApp(tel, pais)` de `utils/whatsapp.ts` (gemelo en `frontend/lib/whatsapp.ts`, se mueven juntos): los dígitos tal cual (`wa.me/3312345678`) no abren ningún chat sin la lada.
> - **Idempotencia también en el cliente**: toda pantalla que cree dinero (venta, pago, compra, movimiento, servicio con costo) manda `Idempotency-Key` con una clave por intento que solo cambia cuando el servidor respondió (`hayRespuestaDelServidor`).
> - **Cotización → venta**: lo que dice si ya se vendió es la venta vigente (no `estado = 'aceptada'`, que es solo «el cliente aceptó»); `UQ_ventas_cotizacion` excluye las canceladas. Sus asientos referencian la cotización, así que cancelar la venta invierte el asiento principal (`ventas.movimiento_contable_id`) y sus hijos además de los `referencia_tipo = 'venta'`.
> - **Almacén**: el stock inicial de un insumo entra como ajuste «Inventario inicial» (sin egreso ni consumo del tope gratuito) y solo se puede deshacer el último movimiento de cada insumo, revirtiendo stock, costo promedio y egreso en una transacción.
> - **Trabajadores en módulos de análisis**: `requireModuloAcceso('<modulo>')` después de `authenticate` (cambia `req.userId` a la cuenta del dueño y limita al producto asignado); `productosAsignados()` para listados.
> - Una herramienta nueva se declara en CUATRO sitios con exhaustividad en tipos: `PermisosTrabajador` (`models/AsignacionTrabajador.ts`), `CAPABILITIES` y `HERRAMIENTAS_POR_PLAN` (`services/billing/planService.ts`), `SERVICIOS_CATALOGO` (`services/billing/serviciosCatalogo.ts`) y la tarjeta `META` de `frontend/app/dashboard/herramientas/page.tsx`. Si falta alguno, no compila.

> [!CAUTION]
> **8. Contrato de variables de producción**
> Con `NODE_ENV=production`, `initializeApp` llama a `verificarEntornoProduccion()` (`src/config/entorno.ts`) y **el backend no arranca** si faltan `JWT_*` (≥32 caracteres), `ADMIN_TOTP_KEY`, `ADMIN_JWT_SECRET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME` (no `S3_BUCKET_NAME`), `AWS_BUCKET_URL_BASE`; con correo, `NEXT_PUBLIC_APP_URL`; con Stripe, `STRIPE_WEBHOOK_SECRET` y el `STRIPE_PRODUCT_<PLAN>` de cada plan con precio. Google Calendar es opcional: sin `GOOGLE_CLIENT_ID` solo avisa; con él exige `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` y `GOOGLE_TOKENS_KEY` (32 bytes). Entrar con Google también: sin `GOOGLE_LOGIN_REDIRECT_URI` solo avisa; con ella exige `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`. Si añades una variable imprescindible, añádela ahí, a su test y a `.env.production.template` (que `docker-compose.prod.yml` carga entero con `env_file`).

---

## 8. Comandos de Verificación y Desarrollo

### Backend (`cd backend`)
```bash
npm run dev           # Servidor con recarga automática (ts-node-dev)
npm run typecheck     # Chequeo estricto de tipos (tsc --noEmit)
npm test              # Suite Jest en serie (límites por IP desactivados). Sin BD de test, los de integración se omiten
# Integración completa: solo contra una base cuyo nombre contenga "test" (helpers/dbGuard.ts)
#   DATABASE_URL=postgresql://bi0a100_user:bi0a100_password@localhost:5432/bi0a100_test \
#   REDIS_URL=redis://localhost:6379/15 npm run migration:run && npm test
npm run test:coverage # Cobertura de tests
npm run build         # Compilación de producción hacia dist/
npm run migration:run # Aplicar migraciones pendientes
npm run migration:run:prod # Igual, sobre dist/ (lo usa Railway como preDeployCommand)
npm run seed:demo     # Cargar datos de demostración completos
```

### Frontend (`cd frontend`)
```bash
npm run dev           # Servidor de desarrollo Next.js en :3000
npm run typecheck     # Chequeo estricto de tipos de TypeScript
npm run build         # Compilación de producción (Turbopack)
```

### Monorepo y Docker (desde la raíz)
```bash
npm run up            # Levantar entorno Docker con build y refresco de volúmenes anónimos (-V)
npm run down          # Apagar contenedores y redes
npm run logs          # Ver logs en tiempo real de backend y frontend
npm run kill-all      # Liberar puertos 3000 y 3001 si están tomados
bash scripts/pre-deploy-check.sh # Checklist automatizado antes de producción
```

---

## 9. Regla Estricta: Protección de Diseño UI (Landing Page y Auth)

> [!CAUTION]
> **PROHIBIDO ELIMINAR, REVERTIR O DEGRADAR LA LANDING PAGE Y EL SIGN UP**
> Los siguientes componentes y archivos definen la identidad de marca aprobada y el concepto "0 a 100". Ningún agente de IA ni desarrollador debe modificarlos sin instrucción expresa del usuario:
> 
> 1. **`frontend/components/landing/AmbientBackground.tsx`**:
>    - Motor en Canvas 2D cinemático que materializa el concepto de "Descenso de 100 a 0":
>      - Cota 100 (arriba / Hero): Espacio profundo con campo de estrellas sólidas y limbo planetario curvado.
>      - Cota 0 (abajo / Suelo): Skyline de metrópolis nocturna con rascacielos en dos capas, remates de azotea, balizas rojas de advertencia aeronáutica parpadeantes y matrices de ventanas cálidas/cian.
>    - **NO eliminar ni reemplazar por librerías externas o fondos planos**.
> 2. **`frontend/components/landing/Footer.tsx`**:
>    - El pie de página DEBE conservar fondo transparente (`bg-transparent`) para permitir que el skyline urbano de `AmbientBackground` sea 100% visible a través de él. **NUNCA añadir fondos o gradientes oscuros opacos que tapen la ciudad**.
> 3. **`frontend/components/auth/AuthBackground.tsx`**:
>    - Canvas atmosférico en el panel izquierdo de autenticación con campo estelar interactivo, estrellas fugaces y luces de ciudad sutiles.
> 4. **`frontend/app/auth/signup/page.tsx`**:
>    - Pantalla de registro moderna estilo Studio Dark (`#1C1C1E`) con el explorador interactivo de 4 áreas del programa (`Viabilidad`, `Finanzas`, `Operación`, `Expertos`).
> 5. **Filosofía de Estilo Visual**:
>    - Estándar Apple / Tesla / Linear Dark UI: Tarjetas sólidas `#1C1C1E`, bordes `white/[0.08]`, puntos estelares nítidos y sólidos (cero orbes de neón estridentes, cero rectángulos azules y cero efectos borrosos que ensucien la interfaz).

