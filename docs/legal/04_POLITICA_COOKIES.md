# Política de Cookies y Tecnologías de Rastreo

**Última actualización:** 15 de octubre de 2026 · **Versión:** 1.0

## 1. Qué usamos y por qué

**BI 0 A 100** usa un número reducido de **cookies** y de **almacenamiento local del navegador** (localStorage y sessionStorage). Son **necesarios** para iniciar sesión, mantenerla de forma segura y recordar preferencias de la interfaz.

**No usamos** cookies de publicidad, píxeles de redes sociales ni herramientas de analítica de terceros (como Google Analytics). No te rastreamos en otros sitios.

## 2. Detalle

### Cookies

| Nombre | Finalidad | Duración | Tipo |
|---|---|---|---|
| `bi_refresh` | Mantener tu sesión iniciada de forma segura. Solo la lee nuestro servidor (no es accesible desde JavaScript). | 7 días | Propia, necesaria |
| `bi_google` | Proteger el inicio de sesión con Google contra ataques de falsificación de solicitudes. | 10 minutos | Propia, necesaria |

### Almacenamiento local del navegador

| Nombre | Finalidad | Duración | Tipo |
|---|---|---|---|
| `accessToken` | Credencial de acceso de corta duración (15 minutos) | Hasta cerrar sesión | Necesario |
| `usuario` | Datos básicos de tu cuenta para mostrar la interfaz | Hasta cerrar sesión | Necesario |
| `adminToken` | Sesión de administración (solo personal autorizado) | Mientras la pestaña esté abierta | Necesario |
| `bi_next` | Volver a la página donde estabas después de iniciar sesión | Mientras la pestaña esté abierta | Necesario |
| `producto_activo_id` | Recordar el producto que estabas viendo | Persistente | Preferencia |
| `net0_vista_preferida`, `net0_favoritos` | Recordar la vista y tus favoritos en Net0 | Persistente | Preferencia |
| `bi_upsell_dismissed_until` | No volver a mostrarte un aviso que cerraste | Persistente | Preferencia |
| Tema de la interfaz | Recordar modo claro u oscuro | Persistente | Preferencia |

### Registro de errores

Usamos **Sentry** para detectar fallas. Cuando ocurre un error, o en una muestra del 10 % de las navegaciones para medir el rendimiento, el navegador envía a Sentry información técnica: la página, el tipo de navegador, el error y los pasos previos dentro de la aplicación. Sentry no instala cookies propias en nuestro sitio.

<!-- BRECHA: configurar en el frontend un filtro (beforeSend) que quite parámetros de URL y contenido de formularios, y desactivar el guardado de IP en el proyecto de Sentry. -->

## 3. Cómo controlarlas

Como todas son necesarias o de preferencia y ninguna se usa con fines publicitarios, no mostramos un panel de consentimiento. Puedes borrarlas o bloquearlas desde la configuración de tu navegador; si bloqueas las necesarias, **no podrás iniciar sesión**. Al cerrar sesión borramos el token de acceso y los datos de cuenta del almacenamiento local.

## 4. Cambios

Si en el futuro incorporamos analítica o publicidad, actualizaremos esta política y te pediremos tu consentimiento **antes** de activarlas.

<!-- DECISIÓN PENDIENTE: si se aceptan usuarios de la UE, la medición de rendimiento de Sentry debe desactivarse o quedar sujeta a consentimiento previo (Directiva ePrivacy / LSSI en España). -->

Contacto: **[CORREO DE PRIVACIDAD]**.
