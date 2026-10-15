# Acuerdo de Nivel de Servicio (SLA)

**Última actualización:** 15 de octubre de 2026 · **Versión:** 1.0

<!-- NOTAS PARA EL EDITOR: el porcentaje y las compensaciones son una propuesta [DECISIÓN]. La infraestructura actual (un servicio en Railway con los workers dentro de la API, una sola región) hace prudente no comprometer más de 99.5 %. -->

## 1. Alcance

Este acuerdo aplica a las cuentas con plan **Empresa (Business)** y **Enterprise** al corriente en sus pagos. Para los demás planes, BI 0 A 100 procura la misma disponibilidad, pero sin compensaciones.

## 2. Compromiso de disponibilidad

BI 0 A 100 se compromete a una **disponibilidad mensual de [99.5 %]** de la aplicación web y de la API (`[URL]` y `api.[DOMINIO]`).

**Disponibilidad** = (minutos del mes − minutos de indisponibilidad) ÷ minutos del mes × 100.

Se considera **indisponibilidad** el tiempo en que el chequeo de salud (`/health`) no responde correctamente o la mayoría de las peticiones de los usuarios fallan con errores del servidor, medido por nuestro monitoreo.

**No cuentan como indisponibilidad:**

1. Mantenimientos programados avisados con al menos **48 horas** de anticipación, de hasta 4 horas al mes, preferentemente entre las 23:00 y las 06:00 (hora del centro de México).
2. Fallas de proveedores de terceros que no controlamos cuando el resto de la Plataforma funciona, por ejemplo: retrasos de los modelos de IA (en ese caso el análisis puede entregarse como estimado de plantilla y el crédito se devuelve), Stripe, Google o el servicio de correo.
3. Caso fortuito o fuerza mayor, ataques de denegación de servicio a gran escala o órdenes de autoridad.
4. Problemas de tu conexión, tu equipo o tu configuración.
5. Suspensiones por incumplimiento de los Términos.

## 3. Tiempos de respuesta del soporte

| Severidad | Ejemplo | Primera respuesta |
|---|---|---|
| Crítica | No se puede iniciar sesión ni cobrar en el punto de venta | [4] horas hábiles |
| Alta | Una herramienta no funciona | [1] día hábil |
| Normal | Dudas o errores menores | [2] días hábiles |

Horario de soporte: **[HORARIO]**, por **[CORREO DE SOPORTE]**.

## 4. Compensaciones

Si en un mes no se cumple la disponibilidad comprometida, recibirás un **crédito** sobre la siguiente mensualidad:

| Disponibilidad mensual | Crédito sobre la mensualidad de ese mes |
|---|---|
| < [99.5 %] y ≥ 99.0 % | 10 % |
| < 99.0 % y ≥ 95.0 % | 25 % |
| < 95.0 % | 50 % |

Para obtenerlo, solicítalo a **[CORREO DE SOPORTE]** dentro de los **30 días** siguientes al cierre del mes. El crédito no es canjeable por efectivo, salvo que canceles tu plan, en cuyo caso se reembolsa. Estas compensaciones no limitan los derechos que te otorga la ley.

## 5. Respaldos y recuperación

- Respaldo diario cifrado de la base de datos, verificado automáticamente.
- Objetivo de pérdida máxima de datos ante un desastre (RPO): **24 horas**.
- Objetivo de tiempo de recuperación (RTO): **[8] horas**.
- Simulacro de restauración mensual documentado.

## 6. Comunicación de incidentes

Publicaremos los incidentes que afecten a la mayoría de los usuarios y los mantenimientos programados en **[PÁGINA DE ESTADO O CORREO]** y te enviaremos un resumen de causa y acciones correctivas de cualquier incidente crítico en un máximo de **5 días hábiles**.
