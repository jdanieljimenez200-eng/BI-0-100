# BI 0 A 100 — Documento de Flujo del Sistema

> Este documento explica cómo funciona BI 0 A 100 de extremo a extremo: desde el momento en que un usuario llega a la aplicación hasta que recibe sus resultados de análisis. Está escrito para dos audiencias simultáneamente: el fundador no técnico que quiere entender qué hace su producto, y el desarrollador que necesita orientarse rápido en el código.

---

## Tabla de contenido

1. [Qué es BI 0 A 100](#1-qué-es-bi-0-a-100)
2. [Arquitectura general en lenguaje simple](#2-arquitectura-general-en-lenguaje-simple)
3. [Flujo de autenticación](#3-flujo-de-autenticación)
4. [Creación de un producto](#4-creación-de-un-producto)
5. [El pipeline de análisis](#5-el-pipeline-de-análisis)
6. [Los cuatro módulos de análisis](#6-los-cuatro-módulos-de-análisis)
7. [Cómo el usuario recibe los resultados en tiempo real](#7-cómo-el-usuario-recibe-los-resultados-en-tiempo-real)
8. [El dashboard y la pantalla de producto](#8-el-dashboard-y-la-pantalla-de-producto)
9. [Sistema de planes y límites](#9-sistema-de-planes-y-límites)
10. [Exportación a PDF](#10-exportación-a-pdf)
11. [Servicios externos y degradación elegante](#11-servicios-externos-y-degradación-elegante)
12. [Infraestructura y despliegue en producción](#12-infraestructura-y-despliegue-en-producción)

---

## 1. Qué es BI 0 A 100

BI 0 A 100 es un SaaS (software como servicio) que valida la viabilidad de un negocio en 2 a 3 minutos. El usuario describe su producto o servicio, y la plataforma ejecuta cuatro análisis independientes con inteligencia artificial:

- **Mercado**: ¿hay demanda real y competencia manejable?
- **Marketing**: ¿cómo se posiciona y qué mensajes usar?
- **Proveedores**: ¿con quién fabricar o abastecerse?
- **Finanzas**: ¿el modelo de negocio es rentable?

Cada análisis es independiente: el usuario puede correr uno, varios, o los cuatro en cualquier orden. El sistema está diseñado para responder rápido y sin bloquear la pantalla del usuario mientras la inteligencia artificial trabaja en segundo plano.

---

## 2. Arquitectura general en lenguaje simple

La aplicación está dividida en dos grandes piezas que se comunican entre sí:

### El frontend (lo que ve el usuario)

Es la interfaz web construida con Next.js. Cada página que el usuario visita es una aplicación interactiva que corre directamente en su navegador. No hay recargas de página completa: las transiciones son fluidas y los datos se actualizan en tiempo real.

### El backend (el motor invisible)

Es un servidor construido con Node.js y Express. Recibe las peticiones del frontend, habla con la base de datos, coordina los análisis de inteligencia artificial, y devuelve los resultados.

### La base de datos

PostgreSQL almacena toda la información permanente: usuarios, productos, resultados de análisis e historial de pagos. Cada usuario solo puede ver sus propios datos; el servidor garantiza este aislamiento en cada consulta.

### Redis (memoria de trabajo)

Redis es una base de datos en memoria que se usa para dos tareas específicas:
- Guardar temporalmente los tokens de recuperación de contraseña (caducan en 1 hora).
- Gestionar la cola de trabajos de análisis, asegurando que las peticiones se procesen en orden y con reintentos automáticos si la IA falla.

### La cola de análisis (BullMQ)

Cuando el usuario solicita un análisis, la tarea no se ejecuta inmediatamente en el hilo principal del servidor. En cambio, se encola en una fila de trabajo gestionada por BullMQ (que usa Redis como almacén). Un proceso separado llamado "worker" toma los trabajos de esa fila y los ejecuta. Esto permite que el servidor responda de inmediato al usuario ("tu análisis está en proceso") mientras el trabajo pesado ocurre en paralelo.

### Comunicación frontend ↔ backend

El frontend habla con el backend exclusivamente mediante una API REST (peticiones HTTP estándar). Todas las peticiones a rutas protegidas incluyen un token de identidad (JWT) que el servidor verifica antes de procesar cualquier operación.

---

## 3. Flujo de autenticación

### Registro de nuevo usuario

1. El usuario completa el formulario de registro: nombre, correo electrónico y contraseña.
2. La contraseña debe tener mínimo 8 caracteres, al menos una mayúscula, un número y un carácter especial. Estas reglas se validan en el servidor, no solo en el navegador.
3. El servidor verifica que el correo no esté registrado previamente.
4. La contraseña nunca se guarda en texto plano: se convierte en un hash irreversible usando bcrypt antes de almacenarse.
5. El usuario nuevo se crea con el plan **freemium** de forma automática.
6. El servidor genera dos tokens:
   - **Access token**: caduca en 24 horas. Se usa en cada petición para identificar al usuario.
   - **Refresh token**: caduca en 7 días. Solo se usa para obtener un nuevo access token cuando el anterior expira.
7. Se envía un correo de bienvenida al usuario (de forma asíncrona, sin bloquear la respuesta).
8. El frontend guarda los tokens en `localStorage` y redirige al dashboard.

### Inicio de sesión

1. El usuario ingresa su correo y contraseña.
2. El servidor tiene una protección antifuerza bruta: después de 5 intentos fallidos, la cuenta se bloquea durante 30 minutos.
3. Si las credenciales son correctas, el servidor genera tokens nuevos y los devuelve al frontend.
4. El frontend actualiza los tokens almacenados y lleva al usuario al dashboard.

### Renovación automática de sesión

Cuando el access token expira (después de 24 horas), el frontend lo detecta automáticamente al recibir un error de "no autorizado" en cualquier petición. En ese momento:

1. Intenta renovar usando el refresh token (vigente por 7 días).
2. Si la renovación tiene éxito, repite la petición original que había fallado.
3. Si el refresh token también expiró o es inválido, borra los tokens del navegador y redirige al usuario a la pantalla de inicio de sesión.

Este proceso es invisible para el usuario en la mayoría de los casos: la sesión se renueva en segundo plano sin interrumpirle.

### Recuperación de contraseña

1. El usuario ingresa su correo electrónico en el formulario de "Olvidé mi contraseña".
2. El servidor siempre responde con el mismo mensaje ("si ese correo está registrado, recibirás un enlace"), sin revelar si el correo existe o no en la base de datos. Esto protege la privacidad de los usuarios.
3. Si el correo sí existe, el servidor genera un token aleatorio de 64 caracteres y lo guarda en Redis con una vigencia de 1 hora.
4. Se envía un correo con un enlace que contiene ese token.
5. Al hacer clic en el enlace, el usuario introduce su nueva contraseña.
6. El servidor verifica el token en Redis, actualiza la contraseña, y elimina el token inmediatamente. El token solo puede usarse una vez.

### Cierre de sesión

Al cerrar sesión, el servidor invalida el refresh token en base de datos. Aunque alguien tuviera el token, ya no podría usarlo para obtener un nuevo access token.

### Perfil y cambio de contraseña

El usuario puede actualizar su nombre y cambiar su contraseña desde el perfil. Para cambiar la contraseña, debe confirmar la contraseña actual (el servidor la verifica contra el hash almacenado).

---

## 4. Creación de un producto

Un "producto" en BI 0 A 100 es el objeto central alrededor del cual giran todos los análisis. Puede representar un producto físico o un servicio.

### Formulario de nuevo producto

El formulario está dividido en tres secciones:

**Tu Marca**
- Logo del negocio (imagen PNG o SVG, opcional).
- Nombre del producto o servicio (obligatorio).
- Tipo: producto o servicio.

**Tu Producto**
- Categoría (obligatoria): se elige de una lista predefinida con 13 categorías como Ropa, Alimentos, Electrónicos, Servicios Profesionales, etc.
- Precio esperado en pesos mexicanos (opcional).
- Foto del producto: JPG, PNG o WEBP de hasta 5 MB (opcional).
- Descripción libre del producto (opcional).

**Tu Mercado**
- Radio de cobertura: slider de 1 a 20 km, que representa el área geográfica de operación.
- Propuesta Única de Valor (PUV): texto libre de hasta 200 caracteres que describe qué hace único al producto (opcional pero recomendado para análisis más precisos).

### Qué pasa cuando el usuario guarda

1. El frontend envía los datos al servidor como un formulario multipart (para poder incluir la imagen).
2. El servidor verifica que el usuario no haya superado el límite de productos activos de su plan.
3. Si hay imagen, se sube al servicio de almacenamiento (local en desarrollo, en la nube en producción) y se guarda la URL.
4. Se crea el registro del producto en la base de datos con estado "activo".
5. El frontend redirige a la pantalla de detalle del producto, donde el usuario puede iniciar los análisis.

### Archivar un producto

Los productos no se eliminan permanentemente. Al archivar, el estado cambia a "archivado" en base de datos y desaparece del dashboard. Todos los análisis asociados quedan guardados.

---

## 5. El pipeline de análisis

Este es el corazón del sistema. Todos los módulos siguen exactamente el mismo patrón, lo que hace que el sistema sea predecible y fácil de mantener.

### Paso 1 — El usuario solicita un análisis

El usuario está en la pantalla de un módulo específico (por ejemplo, Mercado) y pulsa "Iniciar análisis". El frontend envía una petición al servidor con el identificador del producto y los parámetros adicionales que ese módulo requiera.

### Paso 2 — El servidor verifica límites del plan

Antes de hacer nada, el servidor comprueba si el usuario tiene derecho a ejecutar ese análisis según su plan actual. Esta verificación consulta la base de datos en tiempo real (no el token JWT, para evitar que un usuario con plan vencido siga ejecutando análisis). Si el usuario superó su límite, recibe un error 403 con la indicación de que debe actualizar su plan.

### Paso 3 — Se crea el registro en base de datos

El servidor crea inmediatamente un registro en la tabla correspondiente al módulo (por ejemplo, `analisis_mercado`) con el estado `procesando`. Este registro ya tiene un identificador único que el frontend usará para hacer seguimiento.

### Paso 4 — El trabajo se encola y el servidor responde de inmediato

El servidor encola el trabajo de análisis en la cola de BullMQ y responde al frontend con un código HTTP 202 ("Aceptado") junto al identificador del análisis. Esta respuesta llega al frontend en milisegundos, antes de que la IA haya procesado nada.

La cola está configurada con:
- Hasta 3 reintentos automáticos si la IA falla.
- Espera exponencial entre reintentos: 5 segundos, luego 10, luego 20.
- Los trabajos fallidos se conservan en Redis para diagnóstico.
- Los trabajos exitosos se eliminan de la cola automáticamente.

### Paso 5 — El worker ejecuta el análisis en segundo plano

Un proceso worker separado, corriendo en paralelo al servidor principal, toma el trabajo de la cola y lo ejecuta. El worker puede procesar hasta 2 análisis simultáneamente.

La ejecución del análisis implica:
1. Llamar al servicio de IA (Anthropic Claude) con el contexto del producto.
2. Procesar y estructurar la respuesta.
3. Guardar los resultados en la base de datos.
4. Actualizar el estado del registro a `completado` (o `error` si algo falla).
5. Enviar una notificación en tiempo real al usuario vía SSE (ver sección siguiente).
6. Enviar un correo de notificación al usuario (de forma asíncrona, sin bloquear nada).

### Paso 6 — El frontend recibe la actualización

El frontend no necesita esperar a que el usuario recargue la página. Recibe la notificación de que el análisis terminó a través de dos mecanismos en paralelo (SSE y polling), que se explican en detalle en la sección 7.

---

## 6. Los cuatro módulos de análisis

### Módulo de Mercado

**Qué necesita el usuario para iniciarlo:**
- El identificador del producto.
- Alcance del análisis: `local` (ciudad específica) o `nacional`.
- Si es local: ciudad, estado, y opcionalmente coordenadas geográficas y radio en kilómetros.

**Qué produce:**
- Un **score de viabilidad** de 0 a 100 que resume el potencial del mercado.
- Un **estado de viabilidad**: clasificación cualitativa (alta, media, baja).
- El **número total de competidores** identificados en el mercado objetivo.
- El **porcentaje de tendencia** del mercado (creciente, estable, o en declive).
- Análisis detallado del Tamaño Total del Mercado (TAM).
- Perfil de los competidores principales.
- Segmentación del público objetivo.

**Lo que el usuario ve al terminar:**
Un score numérico, la clasificación del mercado, el número de competidores y el estado de la tendencia como métricas rápidas en la tarjeta del módulo. Accediendo al resultado completo, puede ver el análisis detallado.

---

### Módulo de Marketing

**Qué necesita el usuario para iniciarlo:**
- El identificador del producto.
- Opcionalmente: el identificador de un análisis de mercado previo (para que el marketing se construya sobre esa base).
- Opcionalmente: la voz de la marca, elegida entre: Profesional, Divertido, Urgente o Empático.

**Qué produce:**
- Estrategia de posicionamiento: cómo diferenciarse en el mercado.
- Copy publicitario listo para usar: textos para anuncios, redes sociales y correos.
- Un calendario de contenidos para los primeros 90 días.
- Recomendaciones de canales de distribución y publicidad según el tipo de producto y público.

**Relación con el módulo de Mercado:**
Si el usuario ya ejecutó el análisis de mercado, puede enlazarlo al análisis de marketing para que la estrategia tome en cuenta los competidores y segmentos identificados previamente. Si no existe análisis de mercado, el módulo trabaja únicamente con la información del producto.

---

### Módulo de Proveedores

**Qué necesita el usuario para iniciarlo:**
- Únicamente el identificador del producto.

**Qué produce:**
- Un directorio de **5 proveedores** identificados para ese tipo de producto.
- Para cada proveedor: nombre, tipo (nacional, internacional, dropshipping), condiciones de compra, rango de precios, y datos de contacto.
- El **proveedor recomendado**: el mejor candidato según precio, confiabilidad y condiciones de pago.
- El **costo estimado del pedido inicial**.
- Una **solicitud de cotización (RFQ) profesional**: un documento modelo que el emprendedor puede enviar directamente a los proveedores.
- Consejos de negociación específicos para el tipo de producto.

**Lo que el usuario ve en la tarjeta del módulo:**
El nombre del proveedor recomendado, el tipo de proveedor y el costo estimado del primer pedido.

---

### Módulo de Finanzas

**Qué necesita el usuario para iniciarlo:**
- El identificador del producto.
- **Precio de venta** por unidad (obligatorio).
- **Costo variable unitario**: lo que cuesta producir o adquirir cada unidad (obligatorio).
- **Costos fijos mensuales**: renta, salarios, servicios, y cualquier gasto que no dependa del volumen de ventas (obligatorio).
- **Unidades a vender el primer mes** (estimación inicial).
- **Tasa de crecimiento mensual** como porcentaje: cuánto espera crecer mes a mes.

**Qué produce:**
- **Proyección financiera a 12 meses**: ingresos, costos y utilidades mes por mes.
- **Punto de equilibrio**: el número de unidades que deben venderse cada mes para no perder dinero.
- **ROI anual**: retorno sobre la inversión al cabo de un año, expresado como porcentaje.
- **Payback**: el mes en que el negocio recupera su inversión inicial. Si no lo logra en 12 meses, se indica explícitamente.
- **Viabilidad financiera**: clasificación de si el negocio es viable o no según los números ingresados.
- Análisis de sensibilidad: cómo cambian los resultados si las ventas son menores a lo esperado.

**Lo que el usuario ve en la tarjeta del módulo:**
La clasificación de viabilidad, el ROI anual, y el mes en que se alcanza el punto de equilibrio (o "No en 12 meses").

---

## 7. Cómo el usuario recibe los resultados en tiempo real

El sistema usa dos mecanismos en paralelo para notificar al usuario cuando un análisis termina. Esta redundancia garantiza que el usuario siempre reciba la actualización, incluso si la red es inestable.

### Server-Sent Events (SSE) — la notificación instantánea

SSE es una tecnología que permite al servidor empujar mensajes al navegador del usuario a través de una conexión HTTP persistente. En cuanto el análisis termina, el worker emite una notificación que el servidor envía inmediatamente al navegador del usuario, sin necesidad de que el usuario haga nada.

El sistema soporta que el mismo usuario tenga varias pestañas abiertas simultáneamente. Cada pestaña abierta registra su conexión SSE, y el servidor guarda la lista de todas las conexiones activas por usuario. Cuando llega una notificación, se envía a todas las pestañas a la vez. Cuando el usuario cierra una pestaña, esa conexión se elimina automáticamente de la lista.

### Polling — el respaldo de seguridad

Mientras la conexión SSE está activa, el frontend también consulta el estado del análisis cada 3 segundos de forma independiente. Esto cubre el caso en que el análisis termina antes de que la conexión SSE se haya establecido (lo cual puede ocurrir con análisis muy rápidos o en redes con latencia alta).

Cuando llega la notificación (ya sea por SSE o por polling), el que llegue primero cancela al otro para no hacer trabajo doble.

### Qué pasa cuando termina el análisis

1. El frontend recibe la notificación (estado `completado` o `error`).
2. Si completó con éxito, redirige automáticamente a la pantalla de resultados.
3. Si hubo error, muestra el mensaje de error y ofrece volver a intentarlo.

---

## 8. El dashboard y la pantalla de producto

### El dashboard principal

El dashboard es la primera pantalla que ve el usuario al iniciar sesión. Muestra una cuadrícula con todos sus productos activos y el estado de los cuatro módulos para cada uno.

**Qué información muestra por producto:**
- Imagen del producto (o un placeholder si no se subió imagen).
- Nombre y categoría.
- Precio esperado.
- Una barra de progreso que indica cuántos de los 4 módulos están completados.
- Cuatro indicadores de módulo: cada uno muestra si está pendiente, en proceso o completado.
- Botón para entrar al producto o archivarlo.

**Cómo se cargan los datos:**
Con una única consulta a la base de datos que obtiene la lista de productos y el estado del último análisis de cada módulo para cada producto. Esta estrategia evita hacer múltiples consultas separadas y mantiene el dashboard rápido incluso con muchos productos.

**Estado vacío:**
Si el usuario no tiene ningún producto todavía, el dashboard muestra una pantalla de bienvenida con una explicación de los cuatro módulos y un botón para crear el primer análisis.

### La pantalla de producto (Product Hub)

Al hacer clic en un producto, el usuario accede a la pantalla de detalle del producto, que actúa como centro de operaciones para ese producto específico.

**Qué muestra:**
- Imagen, nombre, categoría, precio y descripción del producto.
- El número de módulos completados (por ejemplo: 2/4) y una barra de progreso.
- Cuatro tarjetas, una por módulo, cada una con:
  - El nombre y descripción del módulo.
  - El estado actual: Pendiente / En proceso / Listo / Error.
  - Si está completado: las métricas más importantes a golpe de vista.
  - La fecha en que se completó.
  - Un botón para ver el resultado completo.
  - Un botón para iniciar el análisis (si no se ha hecho) o para ejecutarlo de nuevo (re-análisis).

**Datos paralelos:**
La pantalla de producto hace cinco consultas en paralelo al cargar: una para el producto y una por cada módulo. El servidor espera a que todas terminen y las devuelve juntas, reduciendo el tiempo total de carga.

---

## 9. Sistema de planes y límites

BI 0 A 100 tiene cuatro niveles de plan, cada uno con límites distintos sobre cuántos productos y análisis puede manejar el usuario.

### Tabla de planes

| Plan | Precio mensual | Productos activos | Análisis por módulo por producto | Copy con IA |
|---|---|---|---|---|
| Freemium | Gratis | 1 | 1 | No |
| Pro | $299 MXN | 10 | Ilimitados | Sí |
| Business | $799 MXN | 50 | Ilimitados | Sí |
| Enterprise | Precio a medida | Ilimitados | Ilimitados | Sí |

### Cómo funcionan los límites

**Límite de productos:** al intentar crear un producto nuevo, el servidor cuenta cuántos productos activos tiene el usuario. Si ya alcanzó el máximo de su plan, devuelve un error que indica qué plan le permitiría continuar.

**Límite de análisis:** al intentar iniciar un análisis en cualquier módulo, el servidor cuenta cuántos análisis de ese módulo tiene el usuario para ese producto específico. En el plan Freemium, si ya existe un análisis (aunque sea de hace meses), no puede volver a ejecutarlo en ese producto. En Pro, Business y Enterprise, puede ejecutarlo ilimitadas veces (útil para revalidar después de cambios en el mercado o en la propuesta de valor).

**Verificación en tiempo real:** el plan se consulta directamente en la base de datos en cada petición de análisis, no en el token de sesión. Esto garantiza que si el plan de un usuario cambia (por vencimiento o actualización), el sistema lo refleje de inmediato sin necesidad de que el usuario cierre y vuelva a abrir sesión.

**Respuesta en caso de límite alcanzado:** el servidor devuelve un error con código 403 que incluye el plan actual del usuario, el límite de ese plan, y una indicación de que se requiere actualización.

---

## 10. Exportación a PDF

Todas las pantallas de resultados (los cuatro módulos) tienen la capacidad de exportarse a PDF.

### Cómo funciona

1. El usuario pulsa el botón "Descargar PDF".
2. El frontend activa un modo de impresión especial que ajusta la presentación visual para PDF: expande todas las secciones colapsadas (para que aparezca todo el contenido), oculta elementos de navegación y botones que no tienen sentido en un documento estático.
3. Espera 150 milisegundos para que el navegador termine de re-renderizar la página con todos los cambios visuales aplicados.
4. Invoca el diálogo de impresión nativo del navegador, que el usuario puede usar para guardar como PDF.
5. Cuando el diálogo se cierra, la interfaz vuelve a su estado normal automáticamente.

Este enfoque no requiere ningún software externo ni biblioteca de generación de PDF en el servidor. El navegador del usuario hace todo el trabajo.

---

## 11. Servicios externos y degradación elegante

Tres servicios externos son opcionales. La aplicación está diseñada para funcionar completamente sin ellos; simplemente desactiva las funcionalidades relacionadas si las credenciales no están configuradas.

### Stripe (pagos)

Gestiona las suscripciones de pago a los planes Pro, Business y Enterprise. Si Stripe no está configurado, la interfaz de facturación no aparece, pero toda la funcionalidad de análisis sigue operando normalmente.

### Resend (correo electrónico)

Envía correos de bienvenida, notificaciones de análisis completado, y enlaces de recuperación de contraseña. Si Resend no está configurado, estas funciones se deshabilitan silenciosamente: el análisis se ejecuta igual, solo el usuario no recibe correos. En el flujo de recuperación de contraseña, el token se genera y guarda en Redis de todas formas.

### Sentry (monitoreo de errores)

Captura errores inesperados en producción y los envía a un panel de monitoreo. Si Sentry no está configurado, los errores siguen apareciendo en los logs del servidor pero no se envían a ningún sistema externo.

---

## 12. Infraestructura y despliegue en producción

### Dónde corre cada parte

- **Backend**: Railway. Se construye mediante un proceso de dos etapas: primero se compila el código TypeScript a JavaScript usando todas las dependencias de desarrollo, y luego se crea una imagen final limpia que solo incluye el código compilado y las dependencias de producción, reduciendo el tamaño y la superficie de ataque.
- **Frontend**: Vercel. Se despliega automáticamente y sirve la interfaz desde una red de distribución global (CDN).
- **Base de datos PostgreSQL**: servicio gestionado (Railway o similar), con copias de seguridad automáticas.
- **Redis**: servicio gestionado para la cola de análisis y almacenamiento temporal.

### Seguridad del servidor

El servidor aplica varias capas de seguridad en todas las peticiones:

- **Helmet**: configura cabeceras HTTP de seguridad que protegen contra ataques comunes en navegadores.
- **CORS**: solo acepta peticiones provenientes del dominio del frontend autorizado.
- **Rate limiting**: en producción, limita a 200 peticiones cada 15 minutos por dirección IP para proteger contra abusos. En la ruta de autenticación, el límite es más estricto: 5 intentos cada 15 minutos.
- **Validación de datos**: todas las entradas del usuario se validan en el servidor antes de procesarse, independientemente de cualquier validación que exista en el frontend.

### Integración y despliegue continuos (CI/CD)

Cada vez que se sube código al repositorio, un proceso automatizado en GitHub Actions ejecuta:
1. Verificación de tipos TypeScript (si hay errores de tipado, el despliegue se detiene).
2. Suite de pruebas unitarias.
3. Construcción de la imagen Docker del backend para verificar que compila correctamente.

Cuando el código llega a la rama principal (`main`), el proceso de despliegue envía automáticamente el nuevo código a Railway (backend) y Vercel (frontend).

### Entorno de desarrollo local

Para desarrollar localmente, el proyecto usa Docker Compose, que levanta todos los servicios necesarios (PostgreSQL, Redis, backend y frontend) con un solo comando. El esquema de la base de datos se sincroniza automáticamente en desarrollo: añadir un campo nuevo al modelo de datos lo crea en la base de datos sin necesidad de migraciones manuales.

---

## Resumen del flujo completo de extremo a extremo

El siguiente recorrido resume la experiencia completa de un usuario nuevo:

1. El usuario llega a la aplicación y crea una cuenta. Recibe un correo de bienvenida.
2. Entra al dashboard (vacío) y ve una pantalla que explica los cuatro módulos.
3. Pulsa "Comenzar primer análisis" y completa el formulario de nuevo producto con nombre, categoría y, opcionalmente, precio, foto y propuesta de valor.
4. El servidor crea el producto y redirige al usuario a la pantalla de detalle del producto.
5. El usuario ve las cuatro tarjetas de módulos, todas en estado "Pendiente".
6. Pulsa "Iniciar análisis" en la tarjeta de Mercado. Aparece un formulario donde elige entre análisis local o nacional.
7. Al confirmar, el frontend envía la petición. El servidor verifica los límites del plan, crea el registro, encola el trabajo, y responde en menos de un segundo con el identificador del análisis.
8. La tarjeta de Mercado pasa a estado "En proceso" con un indicador animado.
9. Mientras espera, el usuario puede iniciar los análisis de Marketing, Proveedores y Finanzas.
10. El worker toma los trabajos de la cola y los ejecuta en paralelo (hasta 2 a la vez).
11. Cuando termina el primer análisis, el servidor envía una notificación SSE al navegador del usuario. La tarjeta cambia a "Listo" y aparecen las métricas clave.
12. El usuario pulsa "Ver resultado" y accede al informe completo del módulo de Mercado.
13. Si quiere conservarlo, pulsa "Descargar PDF" y guarda el informe.
14. El proceso se repite para los módulos restantes. En 2 a 3 minutos, los cuatro módulos están completados.
15. El usuario tiene un diagnóstico completo de la viabilidad de su idea de negocio.
