import nodemailer, { Transporter } from 'nodemailer';
import { config } from './config';

/**
 * Base del envío de correos (SMTP). TODAVÍA NO SE USA en la app: recuperar contraseña y verificar correo
 * siguen escribiendo el enlace en la consola (routes/auth.ts). Cuando se conecte (tarea 12.12) bastará con
 * llamar a `sendMail`; sin SMTP configurado escribe el correo en la consola y no falla.
 *
 * Configuración (variables de entorno): SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM.
 * Probar: `npm run mail:test -w server -- tu@correo.com`.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailResult {
  /** true = entregado al servidor SMTP; false = solo escrito en la consola (sin SMTP). */
  sent: boolean;
  mode: 'smtp' | 'console';
  messageId?: string;
}

export const smtpConfigured = () => !!config.smtp.host;

let override: Transporter | null = null;
let cache: { key: string; transport: Transporter } | null = null;

/** Solo para tests: sustituye el transporte (p. ej. `jsonTransport`). */
export function setTransportForTests(t: Transporter | null) {
  override = t;
}

function transport(): Transporter {
  if (override) return override;
  const s = config.smtp;
  const key = JSON.stringify([s.host, s.port, s.secure, s.user, s.pass]);
  if (!cache || cache.key !== key) {
    cache = {
      key,
      transport: nodemailer.createTransport({
        host: s.host,
        port: s.port,
        secure: s.secure, // true = TLS directo (465); false = STARTTLS si el servidor lo ofrece (587)
        auth: s.user ? { user: s.user, pass: s.pass } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    };
  }
  return cache.transport;
}

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
// Los saltos de línea en asunto o destinatario permiten inyectar cabeceras (Bcc: ...)
const oneLine = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();

export async function sendMail(msg: MailMessage): Promise<MailResult> {
  const to = oneLine(msg.to);
  if (!EMAIL.test(to) || to.length > 254) throw new Error('Dirección de correo no válida');
  const subject = oneLine(msg.subject).slice(0, 200);
  if (!subject) throw new Error('El correo necesita un asunto');

  if (!override && !smtpConfigured()) {
    console.log(`\n[correo simulado: no hay SMTP configurado]\n  Para: ${to}\n  Asunto: ${subject}\n  ${msg.text.split('\n').join('\n  ')}\n`);
    return { sent: false, mode: 'console' };
  }

  const info = await transport().sendMail({ from: config.smtp.from, to, subject, text: msg.text, html: msg.html });
  return { sent: true, mode: 'smtp', messageId: info.messageId };
}

/** Comprueba la conexión y las credenciales sin enviar nada. */
export async function verifyMail(): Promise<{ ok: boolean; error?: string }> {
  if (!override && !smtpConfigured()) return { ok: false, error: 'No hay SMTP configurado (falta SMTP_HOST)' };
  try {
    await transport().verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
