// Comprueba la configuración SMTP:  npm run mail:test -w server -- tu@correo.com
import { config } from './config';
import { sendMail, smtpConfigured, verifyMail } from './mailer';

async function main() {
  const to = process.argv[2];
  if (!smtpConfigured()) {
    console.log('No hay SMTP configurado. Añade a .env (ver .env.example): SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM');
    process.exit(1);
  }
  console.log(`Servidor: ${config.smtp.host}:${config.smtp.port} (secure=${config.smtp.secure}) · usuario: ${config.smtp.user || '(sin autenticación)'}`);
  const v = await verifyMail();
  if (!v.ok) {
    console.error(`✖ No se pudo conectar/autenticar: ${v.error}`);
    process.exit(1);
  }
  console.log('✔ Conexión y credenciales correctas');
  if (!to) {
    console.log('Para enviar un correo de prueba: npm run mail:test -w server -- tu@correo.com');
    return;
  }
  const r = await sendMail({ to, subject: 'Prueba de correo de MAR', text: 'Si lees esto, el envío de correos de MAR funciona.' });
  console.log(r.sent ? `✔ Enviado a ${to} (${r.messageId})` : '✖ No se envió');
}

main().catch((e) => {
  console.error('✖', e.message);
  process.exit(1);
});
