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