import { logger } from '../../utils/logger';
import { AppDataSource } from '../../config/database';
import { Usuario } from '../../models/Usuario';
import nodemailer, { Transporter } from 'nodemailer';
import { Resend } from 'resend';

let transporter: Transporter | null = null;
let resendClient: Resend | null = null;

/**
 * Remitente por defecto. Se puede sobrescribir con EMAIL_FROM (recomendado en
 * produccion, donde Resend exige un dominio verificado). En SMTP se cae hacia
 * SMTP_USER para mantener el comportamiento anterior.
 */
const DEFAULT_FROM = 'BI 0 a 100 <noreply@bi0a100.com>';

const getFromAddress = (): string =>
  process.env.EMAIL_FROM || process.env.SMTP_USER || DEFAULT_FROM;

export const isEmailAvailable = (): boolean => {
  return !!process.env.RESEND_API_KEY || !!process.env.SMTP_PASSWORD;
};

export const initEmailService = async (): Promise<void> => {
  if (!isEmailAvailable()) {
    logger.info('Email service disabled (no RESEND_API_KEY or SMTP_PASSWORD env var)');
    return;
  }

  if (resendClient || transporter) {
    return;
  }

  if (process.env.RESEND_API_KEY) {
    logger.info('Initializing email service with Resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
  } else if (process.env.SMTP_PASSWORD) {
    logger.info('Initializing email service with SMTP');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || 'noreply@bi0a100.com',
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
};

/**
 * Inicializacion perezosa: evita que un envio se pierda en silencio si
 * initEmailService() no se llamo durante el arranque.
 */
const ensureTransport = async (): Promise<boolean> => {
  if (!resendClient && !transporter) {
    await initEmailService();
  }
  return !!(resendClient || transporter);
};

interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
}

/**
 * Punto unico de envio. Devuelve true SOLO si el proveedor acepto el mensaje,
 * de modo que ningun log de exito pueda emitirse sin un envio real.
 */
const sendEmail = async ({ to, subject, html }: OutgoingEmail): Promise<boolean> => {
  if (!isEmailAvailable()) {
    logger.info('Email service not available, skipping email');
    return false;
  }

  if (!(await ensureTransport())) {
    logger.error(
      'Email service marked as available but no transport could be initialized; email not sent'
    );
    return false;
  }

  const from = getFromAddress();

  try {
    if (resendClient) {
      const { data, error } = await resendClient.emails.send({ from, to, subject, html });

      if (error) {
        logger.error(`Resend rejected email to ${to}: ${error.message}`);
        return false;
      }

      logger.info(`Email sent to ${to} via Resend (id: ${data?.id ?? 'unknown'})`);
      return true;
    }

    if (transporter) {
      const info = await transporter.sendMail({ from, to, subject, html });
      logger.info(`Email sent to ${to} via SMTP (id: ${info.messageId})`);
      return true;
    }

    return false;
  } catch (err) {
    logger.error(`Error sending email to ${to}:`, err);
    return false;
  }
};

export const sendAnalisisResultEmail = async (
  usuarioId: string,
  analisisData: {
    tipo_analisis: string;
    estado: string;
  }
): Promise<boolean> => {
  if (!isEmailAvailable()) {
    logger.info('Email service not available, skipping email');
    return false;
  }

  try {
    const usuario = await AppDataSource.getRepository(Usuario).findOne({
      where: { id: usuarioId },
    });

    if (!usuario || !usuario.email) {
      logger.error(`Usuario ${usuarioId} not found or has no email; analysis email skipped`);
      return false;
    }

    const emailContent = `
      <h1>Análisis Completado</h1>
      <p>Tu análisis de ${analisisData.tipo_analisis} ha sido completado.</p>
    `;

    return await sendEmail({
      to: usuario.email,
      subject: `BI Análisis Completado: ${analisisData.tipo_analisis}`,
      html: emailContent,
    });
  } catch (err) {
    logger.error('Error preparing analysis result email:', err);
    return false;
  }
};

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string
): Promise<boolean> => {
  if (!isEmailAvailable()) {
    logger.info('Email service not available');
    return false;
  }

  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;

  const emailContent = `
    <h1>Restablecimiento de Contraseña</h1>
    <p>Haz clic en el siguiente enlace para restablecer tu contraseña:</p>
    <a href="${resetUrl}">Restablecer Contraseña</a>
    <p>Este enlace expira en 1 hora.</p>
  `;

  const sent = await sendEmail({
    to: email,
    subject: 'Restablecimiento de Contraseña - BI 0 a 100',
    html: emailContent,
  });

  if (!sent) {
    logger.error(`Password reset email could NOT be delivered to ${email}`);
  }

  return sent;
};

export const notificarAnalisisCompleto = async (params: {
  ownerId?: string;
  trabajadorId?: string;
  productoNombre?: string;
  productoId?: string;
  analisisId?: string;
  modulo?: string;
}): Promise<boolean> => {
  if (!params.ownerId) {
    return false;
  }

  return sendAnalisisResultEmail(params.ownerId, {
    tipo_analisis: params.modulo || 'general',
    estado: 'completado',
  });
};
// ─── Red de expertos ─────────────────────────────────────────────────────────

/**
 * Avisa al experto del resultado de la revisión de su ficha.
 *
 * Sin esto, quien presenta una ficha no se entera de nada: tiene que volver a
 * entrar por su cuenta a ver si le han contestado. Y un rechazo sin aviso es un
 * rechazo que nadie corrige.
 *
 * Nunca lanza: que el correo no salga no puede tumbar la aprobación, que ya está
 * guardada. Devuelve si se entregó, para poder registrarlo.
 */
export const notificarRevisionFicha = async (params: {
  email: string;
  nombreComercial: string;
  estado: 'aprobado' | 'rechazado' | 'suspendido';
  verificado: boolean;
  motivo?: string | null;
  expertoId: string;
}): Promise<boolean> => {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const ficha = `${base}/network/${params.expertoId}`;
  const misFichas = `${base}/network/mis-fichas`;

  let asunto: string;
  let cuerpo: string;

  if (params.estado === 'aprobado') {
    asunto = `Tu ficha "${params.nombreComercial}" ya está publicada`;
    cuerpo = `
      <h1>Tu ficha ya está en el directorio</h1>
      <p>Hemos revisado <strong>${params.nombreComercial}</strong> y ya aparece en la red de expertos de 0 a 100.</p>
      ${
        params.verificado
          ? '<p>Además, comprobamos tu acreditación: tu ficha lleva la insignia de acreditación comprobada.</p>'
          : '<p>Tu ficha está publicada sin la insignia de acreditación comprobada. Si quieres obtenerla, sube tu cédula o licencia desde tu panel y volveremos a revisarla.</p>'
      }
      <p><a href="${ficha}">Ver tu ficha</a></p>
      <p style="color:#666;font-size:13px">Recuerda que el trato y el cobro los acuerdas directamente con cada cliente: la plataforma no interviene en la contratación.</p>
    `;
  } else if (params.estado === 'rechazado') {
    asunto = `Necesitamos que corrijas tu ficha "${params.nombreComercial}"`;
    cuerpo = `
      <h1>Tu ficha necesita cambios</h1>
      <p>Hemos revisado <strong>${params.nombreComercial}</strong> y todavía no podemos publicarla.</p>
      <p><strong>Motivo:</strong> ${params.motivo ?? 'No se indicó un motivo.'}</p>
      <p>Puedes corregirlo desde tu panel: al guardar, la ficha vuelve a la cola de revisión automáticamente.</p>
      <p><a href="${misFichas}">Corregir mi ficha</a></p>
    `;
  } else {
    asunto = `Tu ficha "${params.nombreComercial}" se ha retirado del directorio`;
    cuerpo = `
      <h1>Tu ficha se ha retirado</h1>
      <p><strong>${params.nombreComercial}</strong> ya no aparece en el directorio.</p>
      ${params.motivo ? `<p><strong>Motivo:</strong> ${params.motivo}</p>` : ''}
      <p>Si crees que es un error, responde a este correo.</p>
      <p><a href="${misFichas}">Ver mis fichas</a></p>
    `;
  }

  try {
    const enviado = await sendEmail({ to: params.email, subject: asunto, html: cuerpo });
    if (!enviado) {
      logger.warn(`[network] no se pudo avisar a ${params.email} del estado '${params.estado}'`);
    }
    return enviado;
  } catch (err) {
    // El estado ya está guardado en la base: un fallo de correo no puede
    // propagarse y hacer que parezca que la revisión no se aplicó.
    logger.error('[network] error enviando el aviso de revisión:', err);
    return false;
  }
};
