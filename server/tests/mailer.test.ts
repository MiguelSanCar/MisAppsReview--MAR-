import nodemailer from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config';
import { sendMail, setTransportForTests, smtpConfigured, verifyMail } from '../src/mailer';

afterEach(() => {
  setTransportForTests(null);
  config.smtp.host = '';
  vi.restoreAllMocks();
});

describe('base del SMTP (sin usar todavía en la app)', () => {
  it('sin SMTP configurado escribe el correo en la consola y no falla', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(smtpConfigured()).toBe(false);
    const r = await sendMail({ to: 'ana@test.com', subject: 'Hola', text: 'Cuerpo' });
    expect(r).toEqual({ sent: false, mode: 'console' });
    expect(log.mock.calls.join(' ')).toMatch(/ana@test.com/);
    expect((await verifyMail()).ok).toBe(false);
  });

  it('con transporte envía el mensaje con remitente, asunto y texto', async () => {
    const t = nodemailer.createTransport({ jsonTransport: true });
    setTransportForTests(t);
    config.smtp.from = 'MAR <no-reply@mar.test>';
    const r = await sendMail({ to: 'ana@test.com', subject: 'Aviso', text: 'Tu lista se borrará', html: '<p>Tu lista</p>' });
    expect(r.sent).toBe(true);
    expect(r.mode).toBe('smtp');
    // jsonTransport devuelve el mensaje serializado: lo recuperamos reenviando con el mismo transporte
    const info: any = await t.sendMail({ from: config.smtp.from, to: 'ana@test.com', subject: 'Aviso', text: 'x' });
    const sent = JSON.parse(info.message);
    expect(sent.from.address).toBe('no-reply@mar.test');
    expect(sent.subject).toBe('Aviso');
  });

  it('rechaza destinatarios no válidos y evita inyección de cabeceras', async () => {
    const t = nodemailer.createTransport({ jsonTransport: true });
    const spy = vi.spyOn(t, 'sendMail');
    setTransportForTests(t);
    await expect(sendMail({ to: 'no-es-correo', subject: 'x', text: 'y' })).rejects.toThrow(/no válida/);
    await expect(sendMail({ to: 'a@b.com\r\nBcc: otro@x.com', subject: 'x', text: 'y' })).rejects.toThrow(/no válida/);
    await expect(sendMail({ to: 'a@b.com', subject: '   ', text: 'y' })).rejects.toThrow(/asunto/);
    await sendMail({ to: 'a@b.com', subject: 'Hola\r\nBcc: otro@x.com', text: 'y' });
    expect((spy.mock.calls[0][0] as any).subject).toBe('Hola Bcc: otro@x.com'); // una sola línea
  });

  it('verifyMail informa del fallo de conexión sin lanzar', async () => {
    config.smtp.host = '127.0.0.1';
    config.smtp.port = 1; // nadie escucha
    const v = await verifyMail();
    expect(v.ok).toBe(false);
    expect(v.error).toBeTruthy();
    expect(smtpConfigured()).toBe(true);
  });
});
