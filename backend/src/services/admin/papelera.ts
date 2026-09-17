import { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { logger } from '../../utils/logger';
import { StorageService } from '../StorageService';
import * as documentos from '../network/documentosService';
import { registrarAccionAdmin, registrarAccionSistema } from './auditoria';
import type { AuthRequest } from '../../middleware/auth';

/**
 * Papelera de cuentas: 30 días para arrepentirse, y después borrado de verdad.
 *
 *  - **Enviar**: la cuenta queda desactivada, sus sesiones se cortan, sus fichas
 *    salen del directorio y sus suscripciones de Stripe se cancelan. Nada se
 *    borra todavía.
 *  - **Restaurar**: dentro del plazo, vuelve todo como estaba (salvo Stripe: una
 *    suscripción cancelada no se reanuda sola, hay que volver a contratar).
 *  - **Purgar**: pasado el plazo, se borra la cuenta, todo lo que cuelga de ella
 *    y sus ficheros del almacén, incluidas las cédulas.
 *
 * Una cuenta de dueño arrastra a sus trabajadores: existen solo dentro de su
 * cuenta, y dejarlos vivos sin dueño (la FK `owner_id` es `SET NULL`) crearía
 * cuentas huérfanas con acceso a nada.
 */

export const DIAS_PAPELERA = 30;

export class ErrorPapelera extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

// ─── Enviar ──────────────────────────────────────────────────────────────────

export interface ResultadoEnvio {
  /** Cuentas afectadas: la principal y sus trabajadores. */
  idsAfectados: string[];
  /** Suscripciones de Stripe a cancelar después del commit. */
  suscripciones: string[];
}

export async function enviarAPapelera(
  manager: EntityManager,
  req: AuthRequest,
  id: string,
  motivo: string
): Promise<ResultadoEnvio> {
  const [cuenta]: {
    id: string;
    email: string;
    admin_rol: string | null;
    eliminado_en: Date | null;
    stripe_subscription_id: string | null;
    activo: boolean;
  }[] = await manager.query(
    `SELECT id, email, admin_rol, eliminado_en, stripe_subscription_id, activo
       FROM usuarios WHERE id = $1 FOR UPDATE`,
    [id]
  );
  if (!cuenta) throw new ErrorPapelera(404, 'Usuario no encontrado');
  if (cuenta.eliminado_en) throw new ErrorPapelera(409, 'Esta cuenta ya está en la papelera');
  if (cuenta.admin_rol) {
    // Un admin en la papelera seguiría figurando como admin hasta la purga. Se
    // exige retirarle antes el acceso: es otra decisión, con su propio registro.
    throw new ErrorPapelera(409, 'Es una cuenta de administración: retírale antes el acceso desde Administradores');
  }

  const ahora = new Date();

  const trabajadores: { id: string }[] = await manager.query(
    `SELECT id FROM usuarios WHERE owner_id = $1 AND eliminado_en IS NULL FOR UPDATE`,
    [id]
  );
  const ids = [id, ...trabajadores.map((t) => t.id)];

  await manager.query(
    `UPDATE usuarios SET eliminado_en = $1, eliminado_por = $2, motivo_eliminacion = $3, activo = false WHERE id = $4`,
    [ahora, req.userId, motivo, id]
  );
  if (trabajadores.length > 0) {
    await manager.query(
      `UPDATE usuarios SET eliminado_en = $1, eliminado_por = $2, motivo_eliminacion = $3, activo = false
        WHERE id = ANY($4::uuid[])`,
      [ahora, req.userId, `Cuenta del dueño en la papelera: ${motivo}`, trabajadores.map((t) => t.id)]
    );
  }
  await manager.query(`UPDATE expertos SET eliminado_en = $1 WHERE usuario_id = ANY($2::uuid[])`, [ahora, ids]);

  // Suscripciones a cancelar: el plan de la cuenta y los patrocinios activos de
  // sus fichas. Se cancelan DESPUÉS del commit: si la transacción fallara, no se
  // puede haber dejado de cobrar a una cuenta que sigue activa.
  const patrocinios: { stripe_subscription_id: string }[] = await manager.query(
    `SELECT p.stripe_subscription_id
       FROM patrocinios_experto p JOIN expertos e ON e.id = p.experto_id
      WHERE e.usuario_id = ANY($1::uuid[]) AND p.estado = 'activo' AND p.stripe_subscription_id IS NOT NULL`,
    [ids]
  );
  const suscripciones = [
    ...(cuenta.stripe_subscription_id ? [cuenta.stripe_subscription_id] : []),
    ...patrocinios.map((p) => p.stripe_subscription_id),
  ];

  await registrarAccionAdmin(manager, req, {
    accion: 'usuario.papelera',
    recursoTipo: 'usuario',
    recursoId: id,
    antes: { activo: cuenta.activo, email: cuenta.email },
    despues: {
      activo: false,
      eliminado_en: ahora.toISOString(),
      trabajadores: trabajadores.length,
      suscripciones_a_cancelar: suscripciones.length,
    },
    motivo,
  });

  return { idsAfectados: ids, suscripciones };
}

// ─── Restaurar ───────────────────────────────────────────────────────────────

export async function restaurarDePapelera(
  manager: EntityManager,
  req: AuthRequest,
  id: string,
  motivo: string
): Promise<{ idsRestaurados: string[] }> {
  const [cuenta]: { id: string; eliminado_en: Date | null; owner_id: string | null }[] = await manager.query(
    `SELECT id, eliminado_en, owner_id FROM usuarios WHERE id = $1 FOR UPDATE`,
    [id]
  );
  if (!cuenta) throw new ErrorPapelera(404, 'Usuario no encontrado');
  if (!cuenta.eliminado_en) throw new ErrorPapelera(409, 'Esta cuenta no está en la papelera');

  const limite = Date.now() - DIAS_PAPELERA * 24 * 60 * 60 * 1000;
  if (new Date(cuenta.eliminado_en).getTime() < limite) {
    throw new ErrorPapelera(410, 'Han pasado más de 30 días: esta cuenta ya no se puede restaurar');
  }

  // Un trabajador cuyo dueño sigue en la papelera no puede volver solo: no
  // tendría cuenta a la que pertenecer.
  if (cuenta.owner_id) {
    const [dueno]: { eliminado_en: Date | null }[] = await manager.query(
      `SELECT eliminado_en FROM usuarios WHERE id = $1`,
      [cuenta.owner_id]
    );
    if (dueno?.eliminado_en) {
      throw new ErrorPapelera(409, 'La cuenta de su dueño está en la papelera: restaura primero la del dueño');
    }
  }

  // Vuelven con él los trabajadores que se fueron EN EL MISMO MOMENTO (con su
  // cuenta). Uno que ya estuviera en la papelera por su cuenta, no.
  const trabajadores: { id: string }[] = await manager.query(
    `SELECT id FROM usuarios WHERE owner_id = $1 AND eliminado_en = $2 FOR UPDATE`,
    [id, cuenta.eliminado_en]
  );
  const ids = [id, ...trabajadores.map((t) => t.id)];

  await manager.query(
    `UPDATE usuarios SET eliminado_en = NULL, eliminado_por = NULL, motivo_eliminacion = NULL, activo = true
      WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  await manager.query(`UPDATE expertos SET eliminado_en = NULL WHERE usuario_id = ANY($1::uuid[])`, [ids]);

  await registrarAccionAdmin(manager, req, {
    accion: 'usuario.restaurado',
    recursoTipo: 'usuario',
    recursoId: id,
    antes: { eliminado_en: new Date(cuenta.eliminado_en).toISOString() },
    despues: { activo: true, trabajadores: trabajadores.length },
    motivo,
  });

  return { idsRestaurados: ids };
}

// ─── Consulta ────────────────────────────────────────────────────────────────

export async function listarPapelera() {
  const filas: {
    id: string;
    email: string;
    nombre: string;
    account_role: string;
    owner_id: string | null;
    eliminado_en: Date;
    motivo_eliminacion: string | null;
    eliminado_por_email: string | null;
  }[] = await AppDataSource.query(
    `SELECT u.id, u.email, u.nombre, u.account_role, u.owner_id, u.eliminado_en, u.motivo_eliminacion,
            a.email AS eliminado_por_email
       FROM usuarios u
       LEFT JOIN usuarios a ON a.id = u.eliminado_por
      WHERE u.eliminado_en IS NOT NULL
      ORDER BY u.eliminado_en ASC`
  );
  const dia = 24 * 60 * 60 * 1000;
  return filas.map((f) => {
    const purgaEn = new Date(new Date(f.eliminado_en).getTime() + DIAS_PAPELERA * dia);
    return {
      ...f,
      purga_en: purgaEn,
      dias_restantes: Math.max(0, Math.ceil((purgaEn.getTime() - Date.now()) / dia)),
    };
  });
}

// ─── Purga ───────────────────────────────────────────────────────────────────

/**
 * Tablas con ficheros subidos por la cuenta. Todas tienen `usuario_id`.
 * `expertos.documento_url` no está aquí: es una clave del almacén privado, no una
 * URL, y se borra con `documentosService`.
 */
const COLUMNAS_DE_FICHEROS: [tabla: string, columna: string][] = [
  ['productos', 'imagen_url'],
  ['productos', 'video_url'],
  ['marcas', 'logo_url'],
  ['articulos', 'imagen_url'],
  ['items_pos', 'imagen_url'],
  ['insumos_inventario', 'imagen_url'],
  ['cotizaciones', 'marca_logo_url'],
  ['perfil_videos', 'storage_url'],
  ['temas_usuario', 'logo_url'],
  ['temas_usuario', 'wallpaper_url'],
  ['expertos', 'avatar_url'],
];

/**
 * ¿Es un fichero de nuestro almacén? Solo esos se borran: una URL externa (un
 * vídeo de YouTube que alguien enlazó) no es nuestra y no se toca.
 */
function esFicheroPropio(url: string): boolean {
  const bases = [
    process.env.AWS_BUCKET_URL_BASE,
    `${process.env.BASE_URL || 'http://localhost:3001'}/uploads/`,
  ].filter((b): b is string => Boolean(b));
  return bases.some((b) => url.startsWith(b));
}

export interface ResultadoPurga {
  omitida: boolean;
  cuentas: number;
  ficheros: number;
  documentos: number;
}

/**
 * Borra definitivamente lo que lleva más de 30 días en la papelera.
 *
 * Un `pg_try_advisory_lock` impide que dos instancias del backend purguen a la
 * vez. Cada cuenta va en su propia transacción: si una falla, las demás siguen,
 * y la que falló se reintenta en la siguiente pasada.
 *
 * Los ficheros se borran DESPUÉS de confirmar el borrado de la fila. Al revés,
 * un fallo a medias dejaría una cuenta viva con sus ficheros ya destruidos.
 */
export async function purgarPapelera(opciones: { ahora?: Date } = {}): Promise<ResultadoPurga> {
  const ahora = opciones.ahora ?? new Date();
  const limite = new Date(ahora.getTime() - DIAS_PAPELERA * 24 * 60 * 60 * 1000);
  const resultado: ResultadoPurga = { omitida: false, cuentas: 0, ficheros: 0, documentos: 0 };

  const runner = AppDataSource.createQueryRunner();
  await runner.connect();
  try {
    const [{ bloqueado }] = await runner.query(`SELECT pg_try_advisory_lock(hashtext('purga_papelera')) AS bloqueado`);
    if (!bloqueado) return { ...resultado, omitida: true };

    try {
      // Primero los trabajadores y después los dueños: así el `SET NULL` de
      // `owner_id` nunca llega a dejar a un trabajador sin dueño.
      const candidatas: { id: string; eliminado_en: Date }[] = await runner.query(
        `SELECT id, eliminado_en FROM usuarios
          WHERE eliminado_en IS NOT NULL AND eliminado_en <= $1
          ORDER BY (owner_id IS NULL) ASC, eliminado_en ASC`,
        [limite]
      );

      for (const cuenta of candidatas) {
        try {
          const aBorrar = await AppDataSource.transaction(async (manager) => {
            const urls: string[] = [];
            for (const [tabla, columna] of COLUMNAS_DE_FICHEROS) {
              const filas: { url: string }[] = await manager.query(
                `SELECT ${columna} AS url FROM ${tabla} WHERE usuario_id = $1 AND ${columna} IS NOT NULL`,
                [cuenta.id]
              );
              urls.push(...filas.map((f) => f.url));
            }
            const claves: { documento_url: string }[] = await manager.query(
              `SELECT documento_url FROM expertos WHERE usuario_id = $1 AND documento_url IS NOT NULL`,
              [cuenta.id]
            );

            // `temas_usuario` se borra por cascada (FK_temas_usuario_usuario, migración 1775550000000).
            const borrado = await manager.query(
              `DELETE FROM usuarios WHERE id = $1 AND eliminado_en IS NOT NULL AND eliminado_en <= $2`,
              [cuenta.id, limite]
            );
            const filasBorradas = Array.isArray(borrado) ? borrado[1] : borrado?.rowCount;
            if (!filasBorradas) return null; // restaurada entre la consulta y ahora

            await registrarAccionSistema(manager, {
              accion: 'usuario.purgado',
              recursoTipo: 'usuario',
              recursoId: cuenta.id,
              // Ni email ni nombre: el registro de la purga no puede volver a
              // guardar los datos personales que se acaban de borrar.
              antes: { eliminado_en: new Date(cuenta.eliminado_en).toISOString() },
              despues: { ficheros: urls.length, documentos: claves.length },
            });
            return { urls, claves: claves.map((c) => c.documento_url) };
          });

          if (!aBorrar) continue;
          resultado.cuentas++;

          for (const url of new Set(aBorrar.urls)) {
            if (!esFicheroPropio(url)) continue;
            await StorageService.deleteFile(url);
            resultado.ficheros++;
          }
          for (const clave of aBorrar.claves) {
            await documentos.borrarDocumento(clave);
            resultado.documentos++;
          }
        } catch (err) {
          logger.error(`[papelera] no se pudo purgar la cuenta ${cuenta.id}; se reintentará:`, err);
        }
      }
    } finally {
      await runner.query(`SELECT pg_advisory_unlock(hashtext('purga_papelera'))`);
    }
  } finally {
    await runner.release();
  }

  if (resultado.cuentas > 0) {
    logger.info(
      `[papelera] purgadas ${resultado.cuentas} cuenta(s), ${resultado.ficheros} fichero(s), ${resultado.documentos} documento(s)`
    );
  }
  return resultado;
}

// ─── Documentos huérfanos ────────────────────────────────────────────────────

/** Un fichero más reciente que esto no se toca: puede estar subiéndose. */
const ANTIGUEDAD_MINIMA_HUERFANO_MS = 60 * 60 * 1000;

/**
 * Borra cédulas del almacén que ya no pertenecen a ninguna ficha.
 *
 * La subida guarda el fichero antes que la fila, así que un fichero reciente sin
 * dueño puede estar a milisegundos de tenerlo: por eso la antigüedad mínima.
 */
export async function limpiarDocumentosHuerfanos(opciones: { borrar: boolean }) {
  const [enAlmacen, filas] = await Promise.all([
    documentos.listarClaves(),
    AppDataSource.query(`SELECT documento_url FROM expertos WHERE documento_url IS NOT NULL`) as Promise<
      { documento_url: string }[]
    >,
  ]);
  const referenciadas = new Set(filas.map((f) => f.documento_url));
  const limite = Date.now() - ANTIGUEDAD_MINIMA_HUERFANO_MS;
  const sinDueno = enAlmacen.filter((d) => !referenciadas.has(d.clave));
  const recientes = sinDueno.filter((d) => d.modificado.getTime() > limite);
  const huerfanas = sinDueno.filter((d) => d.modificado.getTime() <= limite).map((d) => d.clave);

  if (opciones.borrar) {
    for (const clave of huerfanas) await documentos.borrarDocumento(clave);
  }
  return { enAlmacen: enAlmacen.length, referenciadas: referenciadas.size, recientes: recientes.length, huerfanas };
}

// ─── Programación ────────────────────────────────────────────────────────────

let temporizador: NodeJS.Timeout | null = null;

/**
 * Programa la purga diaria (y la limpieza de cédulas huérfanas) dentro del
 * proceso del backend. La primera pasada, unos minutos después de arrancar para
 * no competir con el arranque. No se programa en tests.
 */
export function programarPurgaPapelera(): void {
  if (temporizador || process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return;

  const pasada = async () => {
    try {
      await purgarPapelera();
      await limpiarDocumentosHuerfanos({ borrar: true });
    } catch (err) {
      logger.error('[papelera] fallo en la pasada programada:', err);
    }
  };

  setTimeout(pasada, 5 * 60 * 1000).unref();
  temporizador = setInterval(pasada, 24 * 60 * 60 * 1000);
  temporizador.unref();
}
