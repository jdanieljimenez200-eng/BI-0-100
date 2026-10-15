# Contrato de Encargado del Tratamiento de Datos Personales

**Última actualización:** 15 de octubre de 2026 · **Versión:** 1.0

<!-- NOTAS PARA EL EDITOR: contrato de adhesión que acepta el usuario (dueño de la cuenta) al registrarse o, como mínimo, al activar herramientas que guardan datos de terceros (CRM, agenda, fila de espera, nómina, ventas, cotizaciones, expedientes por giro). Documento de MAYOR RIESGO: revisar con abogado. -->

Este contrato lo celebran:

- **El Responsable**: la persona física o moral titular de la cuenta en BI 0 A 100 que acepta este contrato (el «Cliente»).
- **El Encargado**: **[RAZÓN SOCIAL]** («BI 0 A 100»), con domicilio en **[DOMICILIO]**.

## 1. Objeto

El Cliente usa la Plataforma para registrar datos personales de **sus propios clientes, pacientes, empleados y contactos** (los «Datos del Cliente»). BI 0 A 100 los trata **únicamente por cuenta y siguiendo las instrucciones del Cliente**, en términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (la «Ley»).

## 2. Datos y tratamientos cubiertos

| Herramienta | Datos personales | Tratamiento |
|---|---|---|
| CRM / Clientes | Nombre, empresa, correo, teléfono, dirección, notas, campos del expediente por giro | Almacenar, consultar, editar, exportar |
| Expedientes por giro | Pueden incluir **datos sensibles de salud** (fecha de nacimiento, tipo de sangre, alergias, padecimientos, motivo de consulta, nivel de dolor, graduación visual) y **datos de procedimientos judiciales** (número de juicio, juzgado, estatus) | Almacenar, consultar, editar |
| Agenda y fila de espera | Nombre, teléfono, correo, notas, horarios | Almacenar; copiar a Google Calendar **si el Cliente lo conecta**; generar enlaces de WhatsApp |
| Punto de venta y cotizaciones | Nombre, teléfono y correo del comprador | Emitir tickets y cotizaciones, generar enlaces de WhatsApp |
| Nómina | Nombre, puesto, salario, teléfono, correo, pagos | Calcular y registrar pagos |
| Equipo | Correo de colaboradores invitados | Enviar invitaciones |

**Lo que BI 0 A 100 no hace con los Datos del Cliente:** no los usa para fines propios, no los vende, no los envía a modelos de inteligencia artificial y no los comparte con otros clientes.

<!-- Verificado en código al 15-oct-2026: las llamadas a IA no reciben nombres ni contactos de clientes/empleados. Si eso cambia, actualizar este contrato y la lista de subencargados antes de desplegar. -->

## 3. Obligaciones del Cliente (Responsable)

1. Contar con el **aviso de privacidad** propio frente a sus clientes, pacientes y empleados, y con su **consentimiento** cuando la Ley lo exija.
2. Para **datos sensibles**, obtener el consentimiento **expreso y por escrito** del titular (art. 8 de la Ley [VERIFICAR fracción]) y registrar solo los datos estrictamente necesarios.
3. Atender las solicitudes ARCO de sus titulares. BI 0 A 100 le ayudará como se indica en la cláusula 6.
4. Asignar a sus colaboradores solo los permisos que necesiten y retirar los accesos que ya no se usen.
5. No cargar datos de los que no tenga derecho a disponer.

## 4. Obligaciones de BI 0 A 100 (Encargado)

1. Tratar los Datos del Cliente **solo conforme a sus instrucciones**, que son las que se derivan del uso de la Plataforma, de este contrato y de las que dé por escrito. Si una instrucción le parece contraria a la Ley, lo avisará.
2. Guardar **confidencialidad**, incluso después de terminado el contrato, y exigirla a su personal. El personal de BI 0 A 100 solo accede a Datos del Cliente cuando es necesario para dar soporte, atender un incidente o cumplir una obligación legal; los accesos administrativos quedan registrados.
3. Aplicar las **medidas de seguridad** de la cláusula 5.
4. **Avisar al Cliente sin demora**, y en un plazo máximo de **72 horas** desde que la confirme, de cualquier vulneración de seguridad que afecte sus datos, con la información disponible para que el Cliente pueda informar a sus titulares (art. 19 de la Ley).
5. **Suprimir** los Datos del Cliente al terminar la relación, conforme a la cláusula 8.
6. No transferirlos a terceros salvo a los subencargados de la cláusula 7 o por mandato de autoridad, avisando al Cliente si la ley lo permite.

## 5. Medidas de seguridad

- Cifrado en tránsito (HTTPS) y respaldos diarios cifrados.
- Separación lógica de datos por cuenta: todas las consultas se limitan a la cuenta del usuario autenticado.
- Contraseñas con hash bcrypt, sesiones de corta duración con revocación, doble factor para administradores.
- Control de permisos por colaborador y bitácora de acciones sensibles (cancelaciones, precios, movimientos de dinero).
- Cifrado de credenciales de integraciones (AES-256-GCM).
- **[A IMPLEMENTAR]** Cifrado a nivel de campo de los datos sensibles de expedientes.

<!-- BRECHA: el cifrado por campo de atributos sensibles no existe hoy. No publicar la última viñeta como hecho hasta implementarlo. -->

## 6. Asistencia en derechos ARCO

El Cliente puede consultar, corregir y borrar los datos de sus titulares directamente en la Plataforma. Un empleado con pagos de nómina registrados se **archiva** en lugar de borrarse, porque esos pagos forman parte del historial contable; si un titular pide la cancelación de esos datos, el Cliente debe valorar si alguna obligación legal (laboral o fiscal) le exige conservarlos.

<!-- BRECHA: no hay exportación de clientes del CRM; añadirla para facilitar el derecho de acceso de los titulares. -->

 Si BI 0 A 100 recibe una solicitud de un titular de los Datos del Cliente, la remitirá al Cliente en un plazo de **5 días hábiles** y no la responderá por su cuenta, salvo instrucción del Cliente.

## 7. Subencargados

El Cliente autoriza a BI 0 A 100 a usar los siguientes subencargados para prestar el servicio:

| Subencargado | Función respecto de los Datos del Cliente | Ubicación |
|---|---|---|
| Railway | Alojamiento de la aplicación y la base de datos | [REGIÓN] |
| Amazon Web Services | Almacenamiento de archivos y respaldos cifrados | Estados Unidos |
| Sentry | Registro de errores (puede incluir fragmentos técnicos) | [REGIÓN] |
| Google | Solo si el Cliente conecta Google Calendar: copia de citas | Estados Unidos |

BI 0 A 100 exigirá a cada subencargado obligaciones de seguridad y confidencialidad equivalentes. Avisará al Cliente de cualquier subencargado nuevo con **15 días** de anticipación; si el Cliente se opone por motivos razonables, podrá terminar el contrato y recibir el reembolso proporcional.

## 8. Duración y devolución o supresión

- Este contrato dura lo mismo que la cuenta del Cliente.
- Al terminar, el Cliente tiene **30 días** para exportar sus datos. Después, BI 0 A 100 los **suprime** de la base de datos y del almacenamiento. Las copias de respaldo cifradas caducan en un máximo de **13 meses** y no se usan salvo para recuperación ante desastres.
- Los registros de ventas y pagos de nómina se conservan íntegros mientras la cuenta exista porque forman parte del historial contable del Cliente.

## 9. Auditoría

El Cliente puede solicitar, una vez al año y con 30 días de aviso, información razonable sobre las medidas de seguridad aplicadas. BI 0 A 100 la entregará por escrito; las auditorías presenciales se acordarán por separado y a costa del Cliente.

## 10. Responsabilidad

Cada parte responde por el incumplimiento de sus propias obligaciones bajo la Ley. Si BI 0 A 100 trata los datos fuera de las instrucciones del Cliente, asumirá el carácter de responsable respecto de ese tratamiento.

## 11. Ley aplicable

Este contrato se rige por la Ley y demás leyes federales mexicanas. Las controversias se resuelven conforme a la cláusula de jurisdicción de los Términos y Condiciones.
