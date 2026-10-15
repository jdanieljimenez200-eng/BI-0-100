# Procedimiento para atender solicitudes ARCO y revocación del consentimiento

**Última actualización:** 15 de octubre de 2026 · **Versión:** 1.0

> Documento **interno** con una parte pública (sección 2) que puede publicarse en `[URL]/arco`. Base: arts. 22 a 31 de la LFPDPPP (DOF 20-mar-2025) [VERIFICAR numeración exacta].

## 1. Responsable interno

- **Persona o área responsable**: [RESPONSABLE DE DATOS PERSONALES].
- **Canal único de entrada**: [CORREO DE PRIVACIDAD] y formulario `[URL]/arco`. Cualquier solicitud que llegue por otro medio (soporte, redes sociales) se reenvía a ese canal el mismo día.
- **Registro**: cada solicitud recibe un folio `ARCO-AAAA-NNN` y se anota en el registro de solicitudes (hoja de cálculo controlada hasta que exista la tabla `solicitudes_arco` en la app).

<!-- RESUELTO 2026-10-15: formulario público /arco, tabla `solicitudes_arco` con folio y plazos, bandeja en /dashboard/admin/arco (solo superadmin). Las solicitudes que lleguen por correo se capturan en el formulario para que tengan folio. -->

## 2. Información pública para el titular

Puedes pedirnos:

- **Acceso**: saber qué datos tuyos tenemos y cómo los usamos.
- **Rectificación**: corregir datos inexactos o incompletos.
- **Cancelación**: que borremos tus datos.
- **Oposición**: que dejemos de usarlos para una finalidad concreta.
- **Revocación** de tu consentimiento y **limitación** del uso o divulgación de tus datos.

**Envía a [CORREO DE PRIVACIDAD]:**

1. Nombre completo y correo de tu cuenta.
2. Copia de una identificación oficial vigente (o, si actúas por otra persona, la suya, la tuya y el documento que te autoriza).
3. Qué derecho quieres ejercer y sobre qué datos.
4. Si pides rectificación, el dato correcto y el documento que lo respalde.

**Plazos:** te responderemos en un máximo de **20 días** desde que tengamos la solicitud completa y, si procede, la haremos efectiva en los **15 días** siguientes. Si falta información, te la pediremos dentro de los primeros **5 días** y tendrás **10 días** para enviarla; el plazo corre de nuevo desde que la recibamos [VERIFICAR plazos de prevención en la ley vigente]. El trámite es gratuito.

Si eres cliente o paciente de un negocio que usa BI 0 A 100, ese negocio es el responsable de tus datos: dirígete a él. Si nos escribes, le reenviaremos tu solicitud en un máximo de 5 días hábiles.

## 3. Flujo interno

| Paso | Plazo | Quién | Qué hacer |
|---|---|---|---|
| 1. Recepción | Día 0 | Responsable de datos | Asignar folio, acusar recibo al titular con folio y fecha límite |
| 2. ¿Somos responsables? | Día 1-3 | Responsable de datos | Si los datos son de un cliente de un negocio usuario (CRM, citas, nómina, ventas), reenviar al dueño de esa cuenta y avisar al titular. Cerrar como «remitida» |
| 3. Identidad | Día 1-5 | Responsable de datos | Verificar que la identificación coincida con el nombre y el correo de la cuenta. Si falta algo, pedirlo **una vez** |
| 4. Análisis | Hasta día 15 | Responsable de datos + técnico | Determinar si procede o si hay causa legal para negarla (p. ej., obligación fiscal de conservar) |
| 5. Respuesta | **Máx. día 20** | Responsable de datos | Comunicar por escrito si procede o no, con fundamento |
| 6. Ejecución | **Máx. 15 días** después de la respuesta | Técnico | Ejecutar según la sección 4 |
| 7. Cierre | Al ejecutar | Responsable de datos | Confirmar al titular, guardar evidencia, actualizar el registro |

## 4. Cómo se ejecuta cada derecho (técnico)

| Derecho | Acción en la Plataforma |
|---|---|
| Acceso | Generar un reporte con los datos de `usuarios` del titular y la lista de categorías de datos asociados a su `usuario_id` (productos, análisis, herramientas, fichas Net0, reseñas). Entregar en PDF o JSON por correo cifrado o enlace temporal. **[BRECHA: no existe exportación completa; hacerlo con consulta manual]** |
| Rectificación | Corregir desde el panel de administración o con consulta auditada; anotar en `auditoria_admin` |
| Cancelación | Enviar la cuenta a la **papelera** (`POST /api/admin/usuarios/:id/papelera`): se desactiva, se cortan las sesiones, se retiran sus fichas y se cancelan sus suscripciones en Stripe; a los 30 días se purga con sus archivos. Avisar al titular que los respaldos caducan en un máximo de 13 meses. Si la cuenta es de un dueño, sus colaboradores se eliminan con ella: avisarlo antes. Conservar bloqueada solo la información que exija una ley (fiscal) |
| Cancelación parcial | Borrar una ficha Net0, una reseña o un archivo concreto |
| Oposición / limitación | Marcar al usuario para excluirlo de comunicaciones no necesarias y de estadísticas no agregadas |
| Revocación | Si es de una finalidad necesaria, explicar que implica terminar el servicio y proceder como cancelación |

## 5. Causas para negar (comunicarlas siempre por escrito y fundadas)

- El solicitante no acredita su identidad o representación.
- Los datos no están en nuestra base de datos.
- Se lesionan derechos de un tercero.
- Existe impedimento legal u orden de autoridad.
- La cancelación afectaría obligaciones legales de conservación; en ese caso se **bloquean** los datos y se suprimen cuando venza la obligación.

## 6. Evidencia

Por cada folio se conserva: solicitud, identificación (se borra al cerrar el folio, conservando solo la constancia de verificación), respuesta, evidencia de ejecución y fechas. Se conserva **[2] años** desde el cierre.
