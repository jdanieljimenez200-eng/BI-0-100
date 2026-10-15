# Política de Suscripción, Cancelación y Reembolsos

**Última actualización:** 15 de octubre de 2026 · **Versión:** 1.0

<!-- NOTAS PARA EL EDITOR: esta política sigue el art. 76 Bis, fracciones VIII y IX, de la LFPC (reforma publicada en diciembre de 2025). Los puntos marcados BRECHA requieren cambios en la app o en la configuración de Stripe antes de publicar. Confirmar con el dueño las decisiones comerciales marcadas [DECISIÓN]. -->

## 1. Planes

BI 0 A 100 ofrece un plan **Gratis** y planes de pago (**Emprendedor, Negocio, Empresa y Enterprise**). Precios, funciones, herramientas y créditos de IA de cada plan están en **[URL]/pricing**. Los precios están en **pesos mexicanos e incluyen IVA**; en otros países se muestran en la moneda indicada al contratar.

## 2. Cómo se contrata y se cobra

1. Eliges plan y periodicidad (**mensual** o **anual**).
2. Antes de pagar verás el **monto total, la periodicidad del cargo y la fecha del siguiente cobro**, y deberás **autorizar expresamente el cargo recurrente** marcando una casilla.
3. El pago se procesa en la página segura de **Stripe**. BI 0 A 100 no recibe ni guarda los datos de tu tarjeta.
4. El plan se activa en cuanto Stripe confirma el pago.

<!-- RESUELTO 2026-10-15: casilla de autorización en /dashboard/billing, registro en `aceptaciones_legales` y texto del cargo en el Checkout. -->

## 3. Renovación automática

- Tu suscripción se **renueva automáticamente** al final de cada periodo con el mismo plan y precio, salvo que la canceles.
- Te enviaremos un **aviso por correo al menos 5 días naturales antes** de cada renovación, con el monto y la fecha del cargo y el enlace para cancelar.
- Si vamos a cambiar el precio de tu plan, te avisaremos al menos **30 días antes**; el nuevo precio aplicará hasta la siguiente renovación posterior a ese plazo y podrás cancelar antes sin penalización.

<!-- RESUELTO 2026-10-15: correo por `invoice.upcoming`. PENDIENTE DE CONFIGURAR EN STRIPE: suscribir el webhook a `invoice.upcoming` y fijar el aviso en ≥ 7 días (Settings › Billing › Subscriptions). -->

## 4. Cancelación

- Puedes **cancelar en cualquier momento, de forma inmediata y sin penalización**, desde **Facturación › Cancelar suscripción** o escribiendo a **[CORREO DE SOPORTE]**. No te pediremos llamar ni justificar el motivo. Mientras el periodo pagado siga vigente puedes deshacer la cancelación con **Reanudar suscripción**.
- Al cancelar **no se harán más cargos**. Conservas el plan hasta el final del periodo ya pagado; después tu cuenta pasa al plan **Gratis**.
- **Tus datos se conservan**: en el plan Gratis seguirás viendo tu información, pero las herramientas y cuotas que no incluya ese plan dejarán de estar disponibles [VERIFICAR comportamiento exacto en la app]. Si además quieres borrar tu cuenta, sigue el procedimiento del Aviso de Privacidad.

<!-- RESUELTO 2026-10-15: botón «Cancelar suscripción» en /dashboard/billing (POST /api/billing/cancelar). Pendiente: el botón de cancelar patrocinios de Net0 (hoy no hay pantalla de compra de patrocinios). -->

## 5. Cambios de plan

- **Subir de plan**: el cambio es inmediato y se cobra la diferencia proporcional del periodo en curso [DECISIÓN: confirmar prorrateo].
- **Bajar de plan**: aplica al iniciar el siguiente periodo; hasta entonces conservas el plan actual.

## 6. Créditos de IA

- Cada plan incluye una cantidad de **créditos de IA al mes** para acciones bajo demanda. Cada acción cuesta los créditos indicados en la Plataforma antes de ejecutarla.
- Los créditos se renuevan el **día 1 de cada mes natural** y **no se acumulan**: los no usados vencen al terminar el mes.
- **Si una acción falla o la IA no puede generar el resultado y se entrega una plantilla, el crédito se devuelve automáticamente.** Lo mismo con la cuota de análisis: un análisis con error o con resultado estimado de plantilla no la consume.
- Sin créditos disponibles, la Plataforma te avisará antes de ejecutar la acción; no se hace ningún cargo adicional automático.
- Los créditos no tienen valor monetario, no son transferibles y no son reembolsables en efectivo.

## 7. Reembolsos

| Situación | ¿Reembolso? |
|---|---|
| Cobro duplicado o erróneo | **Sí, total** del cargo indebido |
| Cobro después de haber cancelado | **Sí, total** |
| No pudiste usar el servicio por una falla nuestra prolongada | Sí, proporcional, o la compensación del Acuerdo de Nivel de Servicio |
| Cambio sustancial que reduce lo que incluye tu plan, o rechazo de nuevos Términos | Sí, proporcional al periodo no usado |
| Terminamos tu cuenta sin causa imputable a ti | Sí, proporcional al periodo no usado |
| Cancelación voluntaria a mitad del periodo | No; conservas el servicio hasta el fin del periodo pagado [DECISIÓN: considerar reembolso en los primeros 7 días del primer pago] |
| Suspensión por incumplimiento de la Política de Uso Aceptable | No |

Solicita tu reembolso en **[CORREO DE SOPORTE]** dentro de los **90 días** siguientes al cargo. Te responderemos en un máximo de **10 días hábiles**; si procede, se devuelve al mismo medio de pago y su reflejo depende de tu banco. Esto no limita tus derechos ante PROFECO ni ante tu banco.

## 8. Net0: impulsos y patrocinios

- **Impulsos**: son **pagos únicos** por un número de días de promoción, con alcance por ciudad o nacional y sujetos a cupo. No se renuevan solos. Se activan solo cuando el pago queda confirmado. Si cancelas **antes de que empiece** el impulso, se reembolsa completo; una vez iniciado, no se reembolsan los días transcurridos [DECISIÓN: confirmar].
- **Patrocinios de categoría**: son **suscripciones** independientes de tu plan y se rigen por esta misma política (renovación automática, aviso de 5 días, cancelación inmediata). Cancelar un patrocinio **no** afecta tu plan.

## 9. Comprobantes fiscales

Recibirás el recibo de Stripe por cada cargo. Para solicitar tu **CFDI**, **[MECANISMO DE FACTURACIÓN: portal, correo o datos fiscales en tu cuenta]**.

<!-- BRECHA: hoy no se emite CFDI. Confirmar con contador e integrar un PAC antes de cobrar. -->

## 10. Contacto

**[CORREO DE SOPORTE]** · **[TELÉFONO]** · **[DOMICILIO]**. Si no resolvemos tu reclamación, puedes acudir a la **PROFECO**.
