# Diagnóstico legal de BI 0 A 100 — datos, riesgos y cambios pendientes

> Fecha: 15 de octubre de 2026 · Preparado con base en el código del repositorio (rama `master`) · **No sustituye la revisión de un abogado titulado.**
>
> Este documento es para ti (el dueño), en lenguaje sencillo. Los textos que se publican están en los archivos `01_` a `12_` de esta misma carpeta.

## Cómo leer esto

- **Responsable**: quien decide para qué se usan los datos. BI 0 A 100 es responsable de los datos de **sus usuarios** (dueños de negocio, colaboradores y expertos de Net0).
- **Encargado**: quien trata datos **por cuenta de otro**. BI 0 A 100 es encargado de los datos que tus usuarios cargan de **sus propios clientes, pacientes y empleados** (CRM, citas, nómina, ventas, cotizaciones). Por eso hace falta el *Contrato de Encargado* (`07_`).
- Las marcas **[VERIFICAR]** señalan artículos o hechos que no pude confirmar contra el texto oficial; las marcas en corchetes como **[RAZÓN SOCIAL]** son datos que tú debes darme.

---

## 1. Mapa de datos

### 1.1 Datos de tus usuarios (BI 0 A 100 es responsable)

| Dato | Fuente en el código | Finalidad | Almacenamiento | Retención | Terceros |
|---|---|---|---|---|---|
| Nombre, correo, contraseña (hash bcrypt, 12 rondas) | `models/Usuario.ts`; alta en `routes/auth.ts` (`handleSignup`, l. 290) | Crear y operar la cuenta, iniciar sesión | PostgreSQL (`usuarios`) | Mientras la cuenta exista; al borrarla, 30 días en papelera y luego purga (`services/admin/papelera.ts`) | Resend (correo transaccional, EE. UU.) |
| Identificador de Google (`google_sub`), correo y nombre de Google | `services/google/loginGoogle.ts`, `routes/auth.ts` l. 761-829 | Entrar/registrarse con Google | PostgreSQL | Igual que la cuenta | Google (EE. UU.) |
| Tipo de cuenta, plan, rol, zona horaria, país | `Usuario.ts` (`tipo_cuenta`, `plan`, `account_role`, `zona_horaria`) | Operar el servicio, cobrar, mostrar horas locales | PostgreSQL; zona también en Redis (throttle) | Igual que la cuenta | — |
| Identificadores de Stripe (cliente, suscripción), fecha de vencimiento del plan | `Usuario.ts` (`stripe_customer_id`, `stripe_subscription_id`, `plan_expires_at`); `services/billing/stripeService.ts` l. 80 (envía **correo + userId** a Stripe) | Cobro de suscripciones | PostgreSQL; tarjetas **solo en Stripe** (Checkout alojado) | Cuenta + obligaciones fiscales [VERIFICAR plazo con contador; el CFF suele exigir 5 años] | Stripe (EE. UU./Irlanda) |
| Eventos de Stripe procesados | `models/StripeEvent.ts` (id, tipo, fecha) | Evitar procesar dos veces un pago | PostgreSQL | Indefinida (no hay purga) | — |
| Datos del negocio y del producto (descripción, precios, costos, ventas declaradas, perfil «Afina tu análisis») | `Producto.ts` (`perfil_negocio`), modelos `Analisis*.ts` | Generar los 6 análisis | PostgreSQL; en cola BullMQ/Redis mientras corre el trabajo | Cuenta | **Anthropic** (EE. UU.) para los análisis con IA; SerpAPI y MercadoLibre reciben solo términos de búsqueda del producto |
| Contabilidad, ventas, inventario, cotizaciones, nómina del negocio (si el usuario es persona física, son **datos patrimoniales**) | `MovimientoContable.ts`, `Venta.ts`, `Cotizacion.ts`, `PagoNomina.ts`, etc. | Herramientas de gestión | PostgreSQL | Cuenta; las ventas no se borran, se cancelan (regla del producto) | — |
| Grabación de voz o video de un guion de ventas | `routes/ventas.ts` l. 675-760; `services/media/transcripcionService.ts`; `frameExtractionService.ts` | Transcribir y evaluar el guion | **Solo en memoria**: se transcribe y se descarta (`routes/ventas.ts` l. 244) | No se guarda el archivo | **OpenAI** (Whisper, EE. UU.) recibe el audio; **Anthropic** recibe fotogramas del video |
| Imágenes y logos subidos (producto, marca, cotizaciones) | `routes/productos.ts`, `routes/marca.ts`, `routes/config.ts` vía `services/StorageService.ts` | Mostrarlos en la app | AWS S3 (`us-east-1` según `.env.production.template`) — **URL pública** sin sesión (`StorageService.ts` l. 80) | Hasta que se reemplacen o se purgue la cuenta | AWS (EE. UU.); Anthropic recibe el logo en «análisis de logo» |
| Invitaciones a colaboradores (correo destino) | `InvitacionTrabajador.ts` | Unir colaboradores a la cuenta | PostgreSQL | Sin purga automática de invitaciones vencidas | Resend |
| Actividad de colaboradores dentro de la cuenta | `AuditoriaHerramienta.ts`, `auditoria_dinero` | Que el dueño vea quién hizo qué (cancelaciones, precio libre) | PostgreSQL | Cuenta | — |
| Conexión con Google Calendar (token de actualización **cifrado AES-256-GCM**) | `ConexionGoogleCalendar.ts`, `services/google/oauthGoogle.ts` | Copiar citas a Google Calendar | PostgreSQL | Hasta desconectar o purga | Google |
| Dirección IP | Rate limit en Redis (`AlmacenLimiteRedis`); `auditoria_admin.ip` y `user_agent` (solo administradores) | Seguridad y abuso | Redis (minutos); PostgreSQL para admins | Ventana del límite; auditoría admin indefinida | — |
| Uso de IA (módulo, modelo, tokens, costo) | tabla `uso_ia` (migración) | Control de costos | PostgreSQL | Indefinida | — (no guarda el texto de los prompts) |
| Errores de la aplicación | Backend `config/sentry.ts` (borra cabeceras `authorization`/`cookie` y redacta secretos); Frontend `instrumentation-client.ts` (**sin filtro**, `browserTracingIntegration`, 10 % de trazas) | Detectar fallas | Sentry | Según plan de Sentry [VERIFICAR] | Sentry (EE. UU. o UE según la región del proyecto) |
| Bitácoras del servidor | `utils/logger.ts`; `routes/auth.ts` l. 369 y `emailService.ts` l. 93/109 **escriben el correo del usuario** | Diagnóstico | Railway (logs) | Según plan de Railway [VERIFICAR] | Railway (EE. UU.) |
| Respaldos de la base completa | `scripts/respaldo/`, `docs/deployment/RESPALDOS.md` | Recuperación ante desastres | S3 propio, **cifrado con age** | **Diarios 35 días; mensuales 13 meses** | AWS |

### 1.2 Datos de expertos de la red Net0 (BI 0 A 100 es responsable)

| Dato | Fuente | Finalidad | Almacenamiento | Retención | Terceros |
|---|---|---|---|---|---|
| Ficha pública: nombre comercial, bio, categoría, ciudad, país, **dirección y coordenadas**, foto, portada, galería, video, tarifas, sitio web | `models/Experto.ts`; rutas públicas `GET /api/network/expertos` | Publicar el perfil en el directorio **público e indexable** (`/net0`) | PostgreSQL + S3 (URL pública) | Hasta borrar la ficha o la cuenta | Buscadores (indexación) |
| Teléfono, WhatsApp, correo de contacto | `Experto.ts` (solo visibles si `mostrar_contacto`, l. 91-100) | Que los negocios contacten al experto | PostgreSQL | Igual | WhatsApp/Meta solo cuando el visitante abre el enlace |
| Cédula/documento de acreditación | `Experto.documento_url`; `services/network/documentosService.ts` (almacén **privado**, solo admin) | Verificar al experto | Almacén privado | Hasta purga de la cuenta (**no hay plazo propio**) | — |
| Reseñas que recibe y su autor (**se muestra el nombre del autor**) | `services/network/resenasService.ts` l. 52-81 | Reputación en el directorio | PostgreSQL | Indefinida | Pública |
| Métricas diarias (impresiones, vistas, clics) | tabla `experto_metricas_dia` (**sin IP ni identificador del visitante**) | Mostrar al experto su alcance | PostgreSQL | Indefinida | — |
| Impulsos y patrocinios pagados | `impulsos_experto`, `PatrocinioExperto.ts`; `services/network/impulsosService.ts` | Cobrar y mostrar «Promocionado» | PostgreSQL | Fiscal | Stripe |

### 1.3 Datos de terceros que tus usuarios cargan (BI 0 A 100 es **encargado**)

| Dato | Fuente | Finalidad (la decide tu usuario) | Almacenamiento | Retención | Terceros |
|---|---|---|---|---|---|
| Clientes del negocio: nombre, empresa, correo, teléfono, dirección, notas | `models/Cliente.ts` | CRM | PostgreSQL | Hasta que el usuario lo borre o purga | — |
| **Expediente por giro** (`Cliente.atributos_extra`): fecha de nacimiento, **tipo de sangre, alergias, padecimientos crónicos, motivo de consulta, nivel de dolor**, graduación visual, **número de juicio, juzgado, estatus del caso**, RFC, razón social, límite de crédito | `services/vertical/camposExpediente.ts` | Expediente del paciente/cliente | PostgreSQL (JSON, **sin cifrado por campo**) | Igual | — |
| Citas y fila de espera: nombre, teléfono, correo, notas | `Cita.ts`, `TurnoEspera.ts` | Agenda | PostgreSQL | Igual | **Google Calendar** si el usuario lo conecta |
| Empleados: nombre, puesto, **salario**, teléfono, correo; pagos de nómina | `Empleado.ts`, `PagoNomina.ts` | Nómina | PostgreSQL | Pagos no se borran (se archivan) | — |
| Cliente en ventas y cotizaciones (nombre, teléfono, correo) | `Venta.ts`, `Cotizacion.ts` | Ticket, cotización, WhatsApp | PostgreSQL | Ventas no se borran | WhatsApp solo si el usuario abre el enlace |

> Verifiqué que los datos personales de clientes y empleados **no** viajan a Anthropic: las llamadas a `crearMensaje()` reciben agregados del negocio, no nombres ni teléfonos (búsqueda en `services/**`). Si en el futuro un módulo de IA recibe datos de clientes, el aviso y el contrato de encargado deben actualizarse.

### 1.4 Navegador (cookies y almacenamiento)

| Nombre | Tipo | Para qué | Duración | Fuente |
|---|---|---|---|---|
| `bi_refresh` | Cookie HttpOnly, `Path=/api/auth`, `Secure` en producción | Mantener la sesión (token de 7 días) | 7 días | `routes/auth.ts` l. 57-72 |
| `bi_google` | Cookie HttpOnly | Proteger el inicio con Google (anti-CSRF) | 10 min | `routes/auth.ts` l. 741-777 |
| `accessToken`, `usuario` | localStorage | Token de acceso (15 min) y datos básicos del usuario | Hasta cerrar sesión | `lib/api.ts` y otros |
| `adminToken` (+ `:expira`) | sessionStorage | Sesión de superadministrador | Pestaña | `lib/api.ts` l. 65 |
| `bi_next` | sessionStorage | Volver a la página tras iniciar sesión | Pestaña | auth |
| `producto_activo_id`, `net0_vista_preferida`, `net0_favoritos`, `bi_upsell_dismissed_until`, tema | localStorage | Preferencias de interfaz | Persistente | `lib/productoActivo.ts`, `app/net0/page.tsx`, `components/net0/Net0ReelCard.tsx`, `components/ui/UpsellSlot.tsx`, `components/ThemeProvider.tsx` |
| Sentry (SDK de navegador) | Script, sin cookies propias | Errores y rendimiento | — | `instrumentation-client.ts` |

**No hay** Google Analytics, píxeles de Meta, Hotjar ni otros rastreadores publicitarios (búsqueda en `frontend/app`, `components`, `lib`).

### 1.5 Autenticación, borrado y exportación

- **Autenticación**: JWT de acceso 15 min + refresh 7 días en cookie; revocación en Redis (`deny:<jti>`); bcrypt 12; administradores con TOTP.
- **Borrado de cuenta**: **solo lo puede hacer un superadministrador** (`POST /api/admin/usuarios/:id/papelera`). El usuario no tiene botón para borrar su cuenta (búsqueda en `frontend/`). La purga ocurre a los 30 días y borra también archivos en S3 y la cédula. Los respaldos conservan copia hasta 13 meses.
- **Exportación**: hay exportaciones por herramienta (p. ej. `GET /api/contabilidad/:productoId/exportar`), pero **no** una descarga de «todos mis datos».
- **Consentimiento**: el registro solo muestra «Al registrarte aceptas nuestros Términos y Política de privacidad» (`app/auth/signup/page.tsx` l. 572). **No se guarda** fecha, versión ni IP de la aceptación, y el alta con Google no muestra ese texto.

---

## 2. Qué leyes te aplican (explicado sin tecnicismos)

| Ley | ¿Aplica? | Por qué y qué pide |
|---|---|---|
| **Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)**, nueva, publicada en el DOF el **20 de marzo de 2025** (vigente desde el 21 de marzo de 2025; última reforma registrada 14-nov-2025). Abrogó la ley de 2010. | **Sí** | Tratas datos personales en México. Aviso de privacidad (art. 15; simplificado, art. 16), medidas de seguridad (art. 18), aviso de vulneraciones (art. 19), derechos ARCO (arts. 22 y ss.), respuesta en **20 días** y ejecución en **15 días** (art. 31), transferencias (art. 36). Datos sensibles: consentimiento **expreso y por escrito** (art. 8 [VERIFICAR fracción]). |
| Autoridad de datos | — | Ya **no es el INAI** (se extinguió): ahora es la **Secretaría Anticorrupción y Buen Gobierno**. |
| Reglamento de la LFPDPPP | **Incierto** | No encontré publicado un reglamento nuevo a octubre de 2026; el de 2011 reglamenta una ley abrogada y se aplica, en lo que no se oponga, por la vía transitoria [VERIFICAR]. Los Lineamientos del Aviso de Privacidad (2013) siguen siendo la mejor guía práctica [VERIFICAR vigencia formal]. |
| **Ley Federal de Protección al Consumidor (LFPC)** | **Sí** (muchos de tus clientes son personas o micronegocios) | Información clara del proveedor y precios totales con impuestos (art. 7 Bis); comercio electrónico (art. 76 Bis); **reforma publicada en diciembre de 2025** que añadió las fracciones VIII y IX al art. 76 Bis: **cancelación inmediata**, **consentimiento expreso para cargos recurrentes** y **aviso al menos 5 días naturales antes de una renovación automática**; contratos de adhesión sin cláusulas abusivas (arts. 85 y 90 [VERIFICAR]). |
| **Código de Comercio**, Título «Del Comercio Electrónico» (arts. 89 a 114) y art. 49; **NOM-151-SCFI-2016** | **Sí** (contratos en línea) | El consentimiento por medios electrónicos es válido, pero **tienes que poder probarlo**. La NOM-151 (constancias de conservación) no es obligatoria para ti, pero es la forma más fuerte de probar que alguien aceptó. |
| Código Civil Federal (arts. 1803 y 1834 bis) | Sí | Validez del consentimiento expreso por medios electrónicos. |
| **Ley Federal del Derecho de Autor** (software como obra, arts. 13 y 101 a 114) y **Ley Federal de Protección a la Propiedad Industrial** (2020) | Sí | Proteger tu código y la marca «BI 0 A 100» / «Net0» (registro ante el IMPI) y fijar la licencia sobre lo que suben tus usuarios. |
| Código Fiscal de la Federación (CFDI, art. 29) | Sí | Debes emitir CFDI por cada cobro; **Stripe no emite CFDI** [VERIFICAR con tu contador]. |
| Ley Reglamentaria del art. 5.º constitucional (ejercicio profesional) | Riesgo indirecto | El módulo Legal y Finanzas dan orientación generada por IA: deben presentarse como información, nunca como asesoría profesional. |
| **RGPD (Unión Europea)** | **Solo si aceptas usuarios en España/UE** | El código ya trae ficha legal de España (`services/legal/fichasPais.ts`). Si ofreces el servicio allá, aplica el RGPD (art. 3.2): base jurídica, representante en la UE (art. 27), contratos de transferencia, consentimiento de cookies no esenciales. **Decisión tuya** (ver «Datos que me faltan»). |
| CCPA/CPRA (California) | **No por ahora** | Solo aplica a empresas que superan umbrales de ingresos o volumen de datos de californianos. |
| Leyes de LATAM | **Sí si tienes usuarios allá** | Colombia (Ley 1581 de 2012), Argentina (Ley 25.326), Perú (Ley 29733), Chile (Ley 21.719, **entra en vigor el 1 de diciembre de 2026**), Brasil (LGPD). El aviso incluye un anexo genérico; si un país se vuelve relevante conviene revisarlo con un abogado local. |
| Ley de IA | [VERIFICAR] | No identifiqué una ley mexicana de IA vigente. Si operas en la UE, el Reglamento de IA impone deberes de transparencia [VERIFICAR fechas]. |

---

## 3. Diagnóstico de riesgos

| # | Riesgo | Ley aplicable | Gravedad | Solución |
|---|---|---|---|---|
| 1 | El aviso de privacidad publicado (`/privacidad`) tiene 2 párrafos genéricos: no dice quién es el responsable, qué datos, finalidades, transferencias ni cómo ejercer ARCO | LFPDPPP art. 15 | 🔴 | Publicar `01_AVISO_PRIVACIDAD_INTEGRAL.md` |
| 2 | Los Términos publicados (`/terminos`) son un texto de relleno: no hay contrato de servicio válido | Código de Comercio; LFPC arts. 76 Bis, 85 | 🔴 | Publicar `03_TERMINOS_Y_CONDICIONES.md` |
| 3 | No se guarda evidencia de aceptación (fecha, versión, IP); el registro con Google no muestra los términos | Código de Comercio arts. 89 y ss.; LFPDPPP (carga de la prueba del consentimiento [VERIFICAR artículo]) | 🔴 | Casilla obligatoria + tabla `aceptaciones_legales` (ver §5) |
| 4 | Datos **sensibles** de pacientes (sangre, alergias, padecimientos) y datos de juicios en `atributos_extra`, sin contrato de encargado, sin aviso al usuario de que necesita consentimiento escrito del paciente y sin cifrado por campo | LFPDPPP arts. 8 y 18 | 🔴 | `07_CONTRATO_ENCARGADO.md` + aviso en la app al activar giros de salud/legal + cifrado de esos campos |
| 5 | Cobro recurrente sin aviso de 5 días antes de renovar ni consentimiento expreso documentado; cancelación depende de cómo esté configurado el Portal de Stripe | LFPC art. 76 Bis fr. VIII y IX (reforma dic-2025) | 🔴 | Casilla de cargo recurrente en el checkout, correo de recordatorio, cancelación inmediata en el portal |
| 6 | No hay canal ni procedimiento para derechos ARCO ni registro de solicitudes | LFPDPPP arts. 22-31 | 🔴 | Correo/formulario + `09_PROCEDIMIENTO_ARCO.md` |
| 7 | El usuario no puede borrar su cuenta ni descargar sus datos | LFPDPPP (cancelación y acceso); LFPC 76 Bis (cancelación) | 🟡 | Botón «Eliminar mi cuenta» (reusa la papelera de 30 días) y exportación completa |
| 8 | Transferencias internacionales (Anthropic, OpenAI, Stripe, Resend, Sentry, Google, AWS, Railway — todos con servidores en EE. UU.) no informadas | LFPDPPP art. 15 y 36 | 🟡 | Ya se listan en el aviso; firmar/aceptar los DPA de cada proveedor y guardar copia |
| 9 | Grabaciones de voz/video de guiones pueden contener voz o imagen de terceros (clientes reales) | LFPDPPP; derecho a la propia imagen | 🟡 | Aviso antes de subir: «solo grabaciones tuyas o con consentimiento»; se envían a OpenAI/Anthropic y no se guardan |
| 10 | Sentry en el navegador sin filtro (URLs, rastros, posible IP) | LFPDPPP art. 18 (proporcionalidad) | 🟡 | `beforeSend` en el frontend, `sendDefaultPii: false`, desactivar guardado de IP en el proyecto de Sentry |
| 11 | Los correos de usuarios quedan en bitácoras de Railway | LFPDPPP (minimización) | 🟢 | Enmascarar el correo en logs (`j***@dominio`) |
| 12 | Los datos borrados siguen en respaldos hasta 13 meses | LFPDPPP (supresión/bloqueo) | 🟡 | Informarlo (ya está en el aviso) y llevar un registro de purgas para re-borrar tras una restauración |
| 13 | Ficha pública de experto con **dirección y coordenadas exactas** e indexación en buscadores | LFPDPPP (finalidad y consentimiento) | 🟡 | Consentimiento explícito al publicar + opción de mostrar solo ciudad |
| 14 | La cédula del experto se conserva sin plazo tras verificarla | LFPDPPP (proporcionalidad y conservación) | 🟡 | Borrarla 30 días después de aprobar/rechazar, conservar solo el resultado |
| 15 | Sin verificación de mayoría de edad | Código Civil (capacidad); LFPDPPP (menores) | 🟡 | Declaración «Soy mayor de edad» en el registro; prohibir menores en Términos |
| 16 | Imágenes subidas quedan en URL pública sin sesión | LFPDPPP art. 18 | 🟢 | Informarlo y advertir que no suban fotos con datos personales; a futuro URLs firmadas |
| 17 | No se emite CFDI por las suscripciones | CFF art. 29 | 🟡 | Integrar un PAC o servicio de facturación [VERIFICAR con contador] |
| 18 | Resultados de IA (Legal, Finanzas) podrían tomarse como asesoría profesional | LFPC art. 32 (publicidad veraz); responsabilidad civil | 🟡 | Ya hay avisos en el módulo Legal; reforzar con `12_CLAUSULAS_IA.md` y Términos |
| 19 | Net0: el sello «verificado» y las reseñas pueden generar reclamos si un experto falla | LFPC (publicidad engañosa); responsabilidad civil | 🟡 | Términos de la red: BI 0 A 100 no es parte del contrato entre negocio y experto; explicar qué significa «verificado» |
| 20 | Si aceptas usuarios en España: sin representante UE, sin base jurídica RGPD, Sentry de rendimiento sin consentimiento | RGPD arts. 3.2, 6, 27; ePrivacy | 🟡 (🔴 si vendes allá) | Decidir; si no vas a vender en la UE, decirlo en Términos y no aceptar registros desde allá |
| 21 | Sin documento de medidas de seguridad ni responsable de datos designado | LFPDPPP art. 18 [VERIFICAR si exige designar persona o departamento] | 🟢 | Usar `10_PROTOCOLO_VULNERACIONES.md` y designar a [RESPONSABLE DE DATOS] |
| 22 | Domicilio y medios de contacto del proveedor no visibles | LFPC art. 76 Bis [VERIFICAR fracción] | 🟡 | Ponerlos en el pie de página y en `11_AVISO_LEGAL_Y_PI.md` |

---

## 4. Qué documentos redacté y por qué

| Archivo | Aplica porque… |
|---|---|
| `01_AVISO_PRIVACIDAD_INTEGRAL.md` | Obligatorio para cualquier responsable (LFPDPPP art. 15) |
| `02_AVISO_PRIVACIDAD_SIMPLIFICADO.md` | Para mostrar junto a los formularios de registro (art. 16) |
| `03_TERMINOS_Y_CONDICIONES.md` | Contrato de adhesión del servicio, incluida la red Net0 |
| `04_POLITICA_COOKIES.md` | Usas cookies y almacenamiento local; hay que informarlo aunque sean esenciales |
| `05_POLITICA_USO_ACEPTABLE.md` | Los usuarios suben contenido y publican fichas y reseñas |
| `06_SUSCRIPCIONES_CANCELACION_REEMBOLSOS.md` | Cobras suscripciones, créditos, impulsos y patrocinios (LFPC 76 Bis) |
| `07_CONTRATO_ENCARGADO.md` | Es B2B y tus usuarios cargan datos de sus clientes, pacientes y empleados |
| `08_SLA.md` | Es B2B; redactado como **objetivo** con compensación solo en planes de pago, para no prometer lo que la infraestructura (un solo servicio en Railway) no garantiza |
| `09_PROCEDIMIENTO_ARCO.md` | Obligatorio tener un procedimiento para derechos ARCO y revocación |
| `10_PROTOCOLO_VULNERACIONES.md` | Documento interno; la ley exige avisar a los titulares (art. 19) |
| `11_AVISO_LEGAL_Y_PI.md` | Identifica al proveedor y protege tu software, marca y contenido |
| `12_CLAUSULAS_IA.md` | Usas Claude (Anthropic) y Whisper (OpenAI) en casi todos los módulos |

---

## 5. Cambios requeridos en la app (checklist)

> No modifiqué código. Cada punto indica dónde iría el cambio.

### Consentimiento y documentos
- [x] **Casilla obligatoria (sin marcar por defecto)** en `app/auth/signup/page.tsx` con declaración de mayoría de edad (hecho 2026-10-15).
- [x] **Misma aceptación para el alta con Google**: la casilla del registro viaja en el `state` firmado; sin ella no se crea la cuenta.
- [x] **Tabla `aceptaciones_legales`** (migración `1775790000000`): documento, versión, vía, IP, navegador y fecha, en la transacción que crea el usuario. Sin hash del texto: la versión identifica el documento.
- [x] **Versionado de documentos** (`config/documentosLegales.ts`) y modal de aceptación pendiente en el panel. Falta: el correo de aviso 15 días antes de un cambio relevante.
- [ ] Opcional (prueba reforzada): constancia NOM-151 de la aceptación con un PSC acreditado.
- [ ] **Aviso simplificado** visible junto a los formularios de registro, registro de experto (`/net0/registro`) e invitación a colaboradores.
- [ ] **Páginas públicas**: reemplazar `/privacidad` y `/terminos`; crear `/cookies`, `/uso-aceptable`, `/suscripciones`, `/encargado`, `/sla`, `/aviso-legal`, `/ia`, `/arco`. Deben ser accesibles sin sesión y no llamar a endpoints autenticados.
- [ ] **Enlaces en los pies de página**: `components/landing/Footer.tsx` (sin cambiar su fondo transparente), `Net0Footer` y el menú del dashboard. Incluir razón social, domicilio y correo de contacto.

### Derechos ARCO, borrado y exportación
- [x] **Canal ARCO**: formulario público `/arco` con folio y acuse; aviso interno a `PRIVACIDAD_EMAIL`. Falta publicar el correo [CORREO DE PRIVACIDAD].
- [x] **Tabla `solicitudes_arco`** con plazos de 20/15 días y bandeja en `/dashboard/admin/arco` (solo superadmin, auditada).
- [ ] **«Eliminar mi cuenta»** en ajustes: reautenticación, explicación de los 30 días, cancelación de Stripe y reuso de `papelera.enviarAPapelera()` (hoy solo admin). Un colaborador solo puede pedir su baja; la cuenta del dueño arrastra a sus colaboradores (ya es así).
- [ ] **«Descargar mis datos»**: trabajo BullMQ que arme un ZIP (JSON + CSV) con todo lo que cuelga de `usuario_id`, enlace firmado que caduque en 24 h.
- [ ] **Registro de purgas** (solo ids y fecha) para volver a borrar si alguna vez se restaura un respaldo anterior a la purga; anotarlo en `docs/deployment/RESPALDOS.md`.
- [ ] Purga automática de invitaciones vencidas y de la cédula de expertos 30 días después de la decisión.

### Cobros (LFPC 76 Bis VIII y IX)
- [x] Autorización expresa del cargo recurrente antes de pagar (casilla + registro con el importe real del Price) y texto del cargo en el Checkout (`custom_text`).
- [x] **Correo de renovación** por `invoice.upcoming`. **Falta en Stripe**: suscribir el webhook a ese evento y configurar el aviso con ≥ 7 días.
- [x] Botón «Cancelar suscripción» (y «Reanudar») en `/dashboard/billing`, sin pasar por el portal. Falta: lo mismo para patrocinios de Net0 cuando exista su pantalla de compra.
- [ ] Emisión de CFDI (PAC) [VERIFICAR con contador].

### Datos sensibles y de terceros
- [ ] Al activar un giro con expediente de salud o legal (`camposExpediente.ts`): aviso «Estos datos son sensibles. Necesitas el consentimiento expreso y por escrito de tu paciente/cliente» y aceptación del Contrato de Encargado.
- [ ] **Cifrado por campo** de los atributos sensibles (sangre, alergias, padecimientos, motivo de consulta, nivel de dolor, datos de juicios) con la misma técnica AES-256-GCM de `GOOGLE_TOKENS_KEY` y una llave propia.
- [ ] Permiso específico para que un colaborador vea expedientes sensibles (hoy solo existe el gating por herramienta).
- [ ] Aviso antes de subir audio/video en Ventas: «Sube solo grabaciones tuyas o de personas que lo autorizaron. Se envían a OpenAI y Anthropic para procesarlas y no se guardan».

### Seguridad y terceros
- [ ] Sentry del navegador: `beforeSend` que quite query strings y datos de formularios, `sendDefaultPii: false`, y en el proyecto activar «Prevent storing of IP addresses» y el scrubbing de datos.
- [ ] Enmascarar correos en `routes/auth.ts` l. 369/667 y `services/email/emailService.ts` l. 93/109.
- [ ] Aceptar y archivar los DPA de Anthropic, OpenAI, Stripe, Resend, Sentry, AWS, Railway y Google (lista de subencargados en el `07_`).
- [ ] Revisar las opciones de retención cero/limitada de Anthropic y OpenAI para la API [VERIFICAR plazos vigentes de cada proveedor].

### Net0
- [ ] Al publicar una ficha: casilla «Autorizo que esta ficha sea pública e indexable» y opción de mostrar **solo ciudad** en vez de dirección y mapa.
- [ ] Botón «Reportar» en reseñas y fichas; flujo de moderación documentado.
- [ ] Texto junto al sello «Verificado»: «Revisamos su documento de acreditación; no garantizamos sus servicios».

### IA
- [ ] Etiqueta visible «Generado con IA» o «Estimado» en todos los resultados (ya existe en parte).
- [ ] Aviso permanente en Legal y Finanzas: «Información orientativa; no sustituye a un abogado o contador» (ya existe en Legal; añadir en Finanzas).

---

## 6. Datos que me faltan

1. **Responsable legal**: ¿persona física con actividad empresarial o persona moral? Nombre o razón social, RFC, régimen fiscal y domicilio completo.
2. **Contacto**: correo de privacidad (sugerencia: `privacidad@bi0a100.com`), correo de soporte, teléfono.
3. **Persona o departamento de datos personales** (nombre o puesto).
4. **Países donde vas a vender**: ¿solo México, LATAM o también España? (cambia si aplica el RGPD).
5. **Regiones de infraestructura**: región de Railway (Postgres, Redis, API), región real del bucket S3 y del proyecto de Sentry; ¿usas Resend o SMTP en producción? ¿está activa la transcripción con OpenAI (`OPENAI_API_KEY`)?
6. **Dominio definitivo** (el código usa `app.bi0a100.com` y `api.bi0a100.com`).
7. **Política comercial**: ¿hay plan anual?, ¿prorrateo al subir de plan?, ¿reembolsos por cobros erróneos o también por insatisfacción?, ¿periodo de prueba?, ¿los impulsos de Net0 se reembolsan si se cancelan antes de empezar?
8. **SLA**: ¿quieres comprometer disponibilidad? Propuse 99.5 % mensual solo para planes Business y Enterprise.
9. **Ciudad para tribunales** (sugerencia: la de tu domicilio) y si aceptas mediación de PROFECO (recomendado).
10. **Marca**: ¿«BI 0 A 100» y «Net0» están registradas ante el IMPI? Número de registro o solicitud.
11. **Correos comerciales**: ¿planeas enviar promociones o boletines? Hoy solo hay correos transaccionales.
12. **Edad mínima**: confirmar 18 años.

---

## 7. Qué debe revisar un abogado titulado antes de publicar (por orden de riesgo)

1. **`07_CONTRATO_ENCARGADO.md`** — por los datos de salud y de juicios que tus usuarios cargan; es donde más multa hay (datos sensibles).
2. **`03_TERMINOS_Y_CONDICIONES.md`** — límites de responsabilidad: PROFECO anula cláusulas que excluyen toda responsabilidad; la redacción busca ser válida, pero un abogado debe confirmar los topes.
3. **`06_SUSCRIPCIONES_CANCELACION_REEMBOLSOS.md`** — reforma reciente del art. 76 Bis; la autoridad está vigilando suscripciones digitales.
4. **`01_AVISO_PRIVACIDAD_INTEGRAL.md`** — nueva ley sin reglamento actualizado; confirmar artículos marcados [VERIFICAR].
5. **`12_CLAUSULAS_IA.md`** y las partes del módulo Legal — riesgo de que la orientación se confunda con asesoría profesional.
6. Si decides vender en España: todo el bloque RGPD.

## Fuentes consultadas (vigencia, 15-oct-2026)

- Texto vigente LFPDPPP, Cámara de Diputados: <https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf>
- Reglamento de 2011 (de la ley abrogada): <https://www.diputados.gob.mx/LeyesBiblio/regley/Reg_LFPDPPP.pdf>
- Resumen de la nueva ley y cambio de autoridad: <https://www.garrigues.com/es_ES/noticia/mexico-nueva-ley-federal-proteccion-datos-personales-posesion-particulares-introduce>; <https://www.hlc.com/es/publications/mexicos-new-federal-data-protection-law-what-it-means-for-companies>
- Reglamento pendiente: <https://sharkit.mx/nueva-lfpdppp-reglamento-pendiente/>
- Reforma LFPC art. 76 Bis fr. VIII y IX: <https://www.jornada.com.mx/noticia/2025/12/12/economia/gobierno-modifica-regulacion-de-servicios-digitales-que-cobran-de-forma-recurrente>; <https://www.elimparcial.com/dinero/2026/03/17/profeco-obliga-a-plataformas-a-avisar-5-dias-antes-de-renovar-suscripciones-y-facilitar-cancelacion-sin-trabas-desde-2025/>
- Chile, Ley 21.719 (vigencia 1-dic-2026): <https://www.diarioconstitucional.cl/2026/06/12/la-ley-21-719-entra-en-vigor-el-1-de-diciembre-y-expone-vacios-en-regulacion-de-pequenas-empresas/>
