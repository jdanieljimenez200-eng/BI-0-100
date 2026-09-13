import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import { authenticate } from '../middleware/auth';
import { requireRolSinMfa, type AdminRequest } from '../middleware/requireAdmin';
import { ah } from '../utils/asyncHandler';
import { registrarAccionAdmin } from '../services/admin/auditoria';
import * as totp from '../services/admin/totp';

/**
 * Entrada al panel de administración: verificación en dos pasos.
 *
 * Se monta en `/api/admin/sesion`, ANTES que `/api/admin`, porque estas son las
 * rutas que emiten el token de admin y no pueden exigirlo. Piden sesión normal y
 * rol de administración, nada más.
 *
 * Flujo:
 *   1. `GET  /estado`              ¿tiene la verificación activa?
 *   2. `POST /enrolar`             (con contraseña) → QR para la app
 *   3. `POST /enrolar/confirmar`   primer código → activa, da códigos de
 *                                  recuperación y el primer token de admin
 *   4. `POST /verificar`           en cada entrada: código o código de
 *                                  recuperación → token de admin
 *   5. `POST /cerrar`              revoca el token de admin
 */

const router = Router();
router.use(authenticate, requireRolSinMfa('verPanel'));

/** Traduce los errores del servicio a respuestas, en un solo sitio. */
function responderError(res: Response, error: unknown): boolean {
  if (error instanceof totp.DemasiadosIntentos) {
    res.status(429).json({
      error: `Demasiados intentos fallidos. Vuelve a probar en ${Math.ceil(error.segundos / 60)} minutos.`,
    });
    return true;
  }
  if (error instanceof totp.VerificacionNoDisponible) {
    res.status(503).json({ error: 'La verificación no está disponible ahora mismo. Inténtalo en unos minutos.' });
    return true;
  }
  return false;
}

async function cargarConSecreto(id: string) {
  return AppDataSource.getRepository(Usuario)
    .createQueryBuilder('u')
    .addSelect('u.admin_totp_secreto')
    .where('u.id = :id', { id })
    .getOne();
}

router.get(
  '/estado',
  ah(async (req: AdminRequest, res: Response) => {
    const usuario = await AppDataSource.getRepository(Usuario).findOne({
      where: { id: req.userId! },
      select: ['id', 'admin_totp_activado_en'],
    });
    res.json({ enrolado: Boolean(usuario?.admin_totp_activado_en), rol: req.adminRol });
  })
);

/**
 * Empieza (o reinicia) el enrolamiento.
 *
 * Pide la contraseña aunque ya haya sesión: si alguien se sienta en un portátil
 * con la sesión abierta de un admin sin enrolar, no puede atar SU móvil a esa
 * cuenta de admin. Una vez activa, no se puede re-enrolar desde aquí: se pide a
 * un superadmin que la reinicie.
 */
router.post(
  '/enrolar',
  ah(async (req: AdminRequest, res: Response) => {
    const usuario = await AppDataSource.getRepository(Usuario)
      .createQueryBuilder('u')
      .addSelect('u.password_hash')
      .where('u.id = :id', { id: req.userId })
      .getOne();
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (usuario.admin_totp_activado_en) {
      return res.status(409).json({
        error: 'Ya tienes la verificación en dos pasos activa. Si perdiste el acceso, pide a un superadmin que la reinicie.',
      });
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || !(await bcrypt.compare(password, usuario.password_hash))) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    const secreto = totp.generarSecreto();
    await AppDataSource.getRepository(Usuario).update(usuario.id, {
      admin_totp_secreto: totp.cifrarSecreto(secreto),
      admin_totp_activado_en: null,
    });

    const { uri, qr } = await totp.datosEnrolamiento(usuario.email, secreto);
    // El secreto en claro va UNA vez, para quien no pueda escanear el QR.
    res.json({ qr, uri, secreto });
  })
);

router.post(
  '/enrolar/confirmar',
  ah(async (req: AdminRequest, res: Response) => {
    const usuario = await cargarConSecreto(req.userId!);
    if (!usuario?.admin_totp_secreto) {
      return res.status(409).json({ error: 'Empieza el enrolamiento antes de confirmarlo' });
    }
    if (usuario.admin_totp_activado_en) {
      return res.status(409).json({ error: 'La verificación en dos pasos ya está activa' });
    }

    try {
      const ok = await totp.verificarCodigo(
        usuario.id,
        totp.descifrarSecreto(usuario.admin_totp_secreto),
        req.body?.codigo
      );
      if (!ok) return res.status(401).json({ error: 'Código incorrecto. Comprueba que la hora del móvil es la correcta.' });
    } catch (e) {
      if (responderError(res, e)) return;
      throw e;
    }

    const { claros, hashes } = await totp.generarCodigosRecuperacion();
    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(Usuario).update(usuario.id, { admin_totp_activado_en: new Date() });
      await manager.query(`DELETE FROM admin_codigos_recuperacion WHERE usuario_id = $1`, [usuario.id]);
      for (const hash of hashes) {
        await manager.query(`INSERT INTO admin_codigos_recuperacion (usuario_id, hash) VALUES ($1, $2)`, [
          usuario.id,
          hash,
        ]);
      }
      await registrarAccionAdmin(manager, req, {
        accion: 'admin.2fa_activado',
        recursoTipo: 'usuario',
        recursoId: usuario.id,
      });
    });

    const { token, expiraEn } = totp.emitirTokenAdmin(usuario.id);
    res.json({ token, expira_en: expiraEn, codigos_recuperacion: claros });
  })
);

/**
 * Entrada al panel: código de la app o, si se perdió el móvil, un código de
 * recuperación (que se gasta al usarlo).
 */
router.post(
  '/verificar',
  ah(async (req: AdminRequest, res: Response) => {
    const usuario = await cargarConSecreto(req.userId!);
    if (!usuario?.admin_totp_secreto || !usuario.admin_totp_activado_en) {
      return res.status(409).json({ error: 'Activa primero la verificación en dos pasos', codigo: 'SIN_ENROLAR' });
    }

    const codigo = typeof req.body?.codigo === 'string' ? req.body.codigo : '';
    const recuperacion = typeof req.body?.codigo_recuperacion === 'string' ? req.body.codigo_recuperacion : '';
    if (!codigo && !recuperacion) {
      return res.status(400).json({ error: 'Escribe el código de tu app de autenticación' });
    }

    try {
      if (recuperacion) {
        const vivos: { id: string; hash: string }[] = await AppDataSource.query(
          `SELECT id, hash FROM admin_codigos_recuperacion WHERE usuario_id = $1 AND usado_en IS NULL`,
          [usuario.id]
        );
        const i = await totp.coincidenciaRecuperacion(usuario.id, recuperacion, vivos.map((v) => v.hash));
        if (i < 0) return res.status(401).json({ error: 'Código de recuperación incorrecto o ya usado' });

        let gastado = false;
        await AppDataSource.transaction(async (manager) => {
          // `usado_en IS NULL` en el propio UPDATE: si dos peticiones presentan el
          // mismo código a la vez, solo una lo gasta.
          const r = await manager.query(
            `UPDATE admin_codigos_recuperacion SET usado_en = now() WHERE id = $1 AND usado_en IS NULL`,
            [vivos[i].id]
          );
          gastado = (Array.isArray(r) ? r[1] : r?.rowCount) === 1;
          if (!gastado) return;
          await registrarAccionAdmin(manager, req, {
            accion: 'admin.codigo_recuperacion_usado',
            recursoTipo: 'usuario',
            recursoId: usuario.id,
            despues: { quedan: vivos.length - 1 },
          });
        });
        if (!gastado) return res.status(401).json({ error: 'Código de recuperación incorrecto o ya usado' });

        const { token, expiraEn } = totp.emitirTokenAdmin(usuario.id);
        return res.json({ token, expira_en: expiraEn, codigos_restantes: vivos.length - 1 });
      }

      const ok = await totp.verificarCodigo(usuario.id, totp.descifrarSecreto(usuario.admin_totp_secreto), codigo);
      if (!ok) return res.status(401).json({ error: 'Código incorrecto o ya usado' });
    } catch (e) {
      if (responderError(res, e)) return;
      throw e;
    }

    const { token, expiraEn } = totp.emitirTokenAdmin(usuario.id);
    res.json({ token, expira_en: expiraEn });
  })
);

router.post(
  '/cerrar',
  ah(async (req: AdminRequest, res: Response) => {
    await totp.revocarTokenAdmin(req.get('x-admin-token') ?? undefined);
    res.json({ mensaje: 'Sesión de administración cerrada' });
  })
);

export default router;
