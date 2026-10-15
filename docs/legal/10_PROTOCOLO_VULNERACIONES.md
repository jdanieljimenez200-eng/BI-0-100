# Protocolo de respuesta ante vulneraciones de seguridad

**Última actualización:** 15 de octubre de 2026 · **Versión:** 1.0

> Documento **interno**. Base: arts. 18 y 19 de la LFPDPPP (DOF 20-mar-2025): deber de seguridad y aviso **inmediato** al titular cuando la vulneración afecte de forma significativa sus derechos patrimoniales o morales.

## 1. Qué es una vulneración

Cualquier pérdida, destrucción, robo, extravío, copia, uso, acceso, alteración o tratamiento **no autorizado** de datos personales. Ejemplos en BI 0 A 100:

- Acceso de una cuenta a datos de otra cuenta (falla de aislamiento por `usuario_id`).
- Filtración de `JWT_SECRET`, `GOOGLE_TOKENS_KEY`, credenciales de AWS, Stripe, Anthropic u OpenAI, o de la llave privada de **age** de los respaldos.
- Exposición pública del almacén privado de documentos de expertos (cédulas).
- Robo de la sesión de un superadministrador.
- Pérdida de datos sin respaldo recuperable.
- Vulneración en un proveedor (Railway, AWS, Sentry, Resend, Stripe) que afecte nuestros datos.

## 2. Equipo

| Rol | Persona | Contacto |
|---|---|---|
| Coordinador del incidente | [NOMBRE] | [TELÉFONO / CORREO] |
| Técnico | [NOMBRE] | [CONTACTO] |
| Legal | [ABOGADO EXTERNO] | [CONTACTO] |
| Comunicación | [NOMBRE] | [CONTACTO] |

## 3. Fases y tiempos

### Fase 1 — Detección y contención (0 a 4 horas)

1. Abrir un registro del incidente con hora de detección, quién lo detectó y la fuente (Sentry, alerta de Prometheus, aviso de un usuario o de un proveedor).
2. **Contener**, según el caso:
   - Rotar el secreto comprometido (`JWT_*`, `ADMIN_JWT_SECRET`, `GOOGLE_TOKENS_KEY`, claves de AWS, Stripe y de IA). Rotar `JWT_*` invalida todas las sesiones.
   - Revocar sesiones concretas con la denylist de Redis (`deny:<jti>`) o desactivar la cuenta afectada.
   - Desactivar la conexión de Google Calendar afectada.
   - Bloquear el bucket o el endpoint expuesto.
   - Si se compromete la llave privada de **age**, generar un par nuevo y re-cifrar los respaldos vigentes.
3. **Preservar evidencia**: no borrar logs; exportar los de Railway, Sentry y `auditoria_admin` del periodo.

### Fase 2 — Evaluación (4 a 48 horas)

Determinar y documentar:

- Qué datos, de cuántos titulares y de qué tipo (usuarios propios o Datos del Cliente como encargados).
- Si hay **datos sensibles** (expedientes de salud o de juicios) o **patrimoniales** (contabilidad, nómina, ventas).
- Si los datos estaban cifrados y la llave sigue segura.
- Si la afectación es **significativa** para los derechos patrimoniales o morales de los titulares. Ante la duda, tratarla como significativa.

### Fase 3 — Notificación

| A quién | Cuándo | Cómo |
|---|---|---|
| **Titulares afectados** (usuarios propios) | **De inmediato** en cuanto se confirme una afectación significativa, sin esperar a cerrar la investigación | Correo + aviso en la Plataforma |
| **Clientes de BI 0 A 100** cuyos Datos del Cliente se afectaron (somos encargados) | Máximo **72 horas** desde la confirmación (Contrato de Encargado, cl. 4.4) | Correo al dueño de la cuenta |
| Autoridad (Secretaría Anticorrupción y Buen Gobierno) | Si la ley o su normativa lo exige [VERIFICAR obligación vigente de notificar a la autoridad] | Según su procedimiento |
| Autoridades de otros países | Si hay titulares en jurisdicciones que lo exigen (p. ej., 72 h en el RGPD) | Según cada ley |
| Proveedores implicados | En cuanto se detecte | Su canal de seguridad |

**Contenido mínimo del aviso al titular** (art. 19 [VERIFICAR contenido exigido]):

1. Naturaleza del incidente.
2. Datos personales comprometidos.
3. Recomendaciones concretas para protegerse (cambiar contraseña, vigilar cargos, desconfiar de correos que pidan datos).
4. Acciones correctivas que ya tomamos.
5. Medios para obtener más información: [CORREO DE PRIVACIDAD].

### Fase 4 — Corrección y lecciones (hasta 15 días)

1. Corregir la causa raíz y añadir una prueba automatizada que la cubra.
2. Si hubo restauración de un respaldo, **volver a aplicar las purgas** de cuentas borradas después de la fecha del respaldo.
3. Documento de cierre: cronología, causa, impacto, acciones, mejoras. Conservarlo **[3] años**.
4. Actualizar este protocolo si algo no funcionó.

## 4. Plantilla de aviso al titular

> **Asunto:** Aviso de seguridad sobre tu cuenta en BI 0 A 100
>
> Hola, [nombre]:
>
> El [fecha] detectamos [descripción breve y clara del incidente]. Los datos involucrados son: [lista]. [No] se vieron comprometidas contraseñas ni datos de tarjeta (las tarjetas las guarda Stripe, no nosotros).
>
> Ya [acciones tomadas]. Te recomendamos: [recomendaciones].
>
> Si tienes dudas, escríbenos a [CORREO DE PRIVACIDAD] con el folio [FOLIO].
>
> [RAZÓN SOCIAL]

## 5. Prevención (revisión trimestral)

- Revisar accesos de administradores y códigos TOTP; retirar cuentas que ya no se usan.
- Confirmar que el simulacro mensual de restauración se hizo (`docs/deployment/RESPALDOS.md`).
- Revisar que Sentry y los logs no guarden datos personales innecesarios.
- Revisar las dependencias con avisos de seguridad (`npm audit`).
