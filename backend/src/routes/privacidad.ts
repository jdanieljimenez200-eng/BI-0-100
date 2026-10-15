import { Router, Request, Response } from 'express';
import { arcoLimiter } from '../middleware/cors';
import { ah } from '../utils/asyncHandler';
import { logger } from '../utils/logger';
import { swallowWithLog } from '../utils/fireAndForget';
import { crearSolicitudArco, NOMBRE_TIPO_ARCO, SolicitudArcoSchema } from '../services/cumplimiento/arco';
import { avisarSolicitudArcoInterna, enviarAcuseArco } from '../services/email/emailService';

/**
 * Canal público de privacidad (sin sesión): cualquier titular —tenga o no
 * cuenta— puede pedir acceso, rectificación, cancelación u oposición, revocar
 * su consentimiento o limitar el uso de sus datos (LFPDPPP, arts. 22 a 31).
 * Lo atiende el superadmin en `/api/admin/arco`.
 */
const router = Router();

router.post(
  '/arco',
  arcoLimiter,
  ah(async (req: Request, res: Response) => {
    const datos = SolicitudArcoSchema.safeParse(req.body ?? {});
    if (!datos.success) {
      return res.status(400).json({ error: datos.error.issues[0]?.message ?? 'Revisa los datos de tu solicitud' });
    }

    const solicitud = await crearSolicitudArco(datos.data, req.ip ?? null);
    logger.info(`[arco] solicitud ${solicitud.folio} (${solicitud.tipo}) registrada`);

    const tipo = NOMBRE_TIPO_ARCO[solicitud.tipo];
    const fechaLimite = new Date(solicitud.fecha_limite_respuesta);
    enviarAcuseArco({ email: solicitud.email, nombre: solicitud.nombre, folio: solicitud.folio, tipo, fechaLimite })
      .catch(swallowWithLog('arco:acuse', { folio: solicitud.folio }));
    avisarSolicitudArcoInterna({ folio: solicitud.folio, tipo, fechaLimite })
      .catch(swallowWithLog('arco:aviso-interno', { folio: solicitud.folio }));

    return res.status(201).json({ folio: solicitud.folio, fecha_limite_respuesta: solicitud.fecha_limite_respuesta });
  }),
);

export default router;
