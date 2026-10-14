import initSqlJs from 'sql.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../src/migrations';
import { Client, startTestApp } from './client';

let app: Awaited<ReturnType<typeof startTestApp>>;
const ana = new Client();
const beto = new Client();

beforeAll(async () => {
  app = await startTestApp();
  await ana.post('/api/auth/register', { username: 'ana', email: 'ana@test.com', password: 'secreto123' });
  await beto.post('/api/auth/register', { username: 'beto', email: 'beto@test.com', password: 'secreto123' });
});
afterAll(() => app.stop());

describe('tema claro / oscuro por usuario', () => {
  it('por defecto es oscuro', async () => {
    expect((await ana.get('/api/auth/me')).body.user.theme).toBe('dark');
  });

  it('se guarda y se recupera al volver a entrar (también desde otra sesión)', async () => {
    const r = await ana.put('/api/me/theme', { theme: 'light' });
    expect(r.status).toBe(200);
    expect(r.body.user.theme).toBe('light');
    expect((await ana.get('/api/auth/me')).body.user.theme).toBe('light');
    // otro dispositivo: sesión nueva con las mismas credenciales
    const otro = new Client();
    const login = await otro.post('/api/auth/login', { identifier: 'ana', password: 'secreto123' });
    expect(login.body.user.theme).toBe('light');
    await ana.put('/api/me/theme', { theme: 'dark' });
    expect((await ana.get('/api/auth/me')).body.user.theme).toBe('dark');
  });

  it('es una preferencia personal: no afecta a otras cuentas', async () => {
    await ana.put('/api/me/theme', { theme: 'light' });
    expect((await beto.get('/api/auth/me')).body.user.theme).toBe('dark');
  });

  it('rechaza valores no válidos y exige sesión', async () => {
    for (const bad of ['rojo', '', null, 1, undefined]) {
      expect((await ana.put('/api/me/theme', { theme: bad })).status, String(bad)).toBe(400);
    }
    expect((await ana.put('/api/me/theme', {})).status).toBe(400);
    expect((await new Client().put('/api/me/theme', { theme: 'light' })).status).toBe(401);
    expect((await ana.get('/api/auth/me')).body.user.theme).toBe('light'); // sigue igual
  });

  it('una cuenta nueva nace con el tema que el visitante ya usaba (y oscuro si no dice nada)', async () => {
    const c = new Client();
    const r = await c.post('/api/auth/register', { username: 'clara', email: 'clara@test.com', password: 'secreto123', theme: 'light' });
    expect(r.status).toBe(201);
    expect(r.body.user.theme).toBe('light');
    const d = new Client();
    expect((await d.post('/api/auth/register', { username: 'dario', email: 'dario@test.com', password: 'secreto123' })).body.user.theme).toBe('dark');
    expect((await new Client().post('/api/auth/register', { username: 'eva', email: 'eva@test.com', password: 'secreto123', theme: 'rojo' })).status).toBe(400);
  });

  it('el tema de otras personas no aparece en su perfil público', async () => {
    const p = await beto.get('/api/profiles/ana');
    expect(JSON.stringify(p.body)).not.toMatch(/theme/);
  });
});

describe('migración 10', () => {
  it('las cuentas existentes quedan en oscuro', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    MIGRATIONS.filter((m) => m.version <= 9).forEach((m) => db.exec(m.sql));
    db.run("INSERT INTO users (username, email, password_hash, created_at) VALUES ('vieja','v@t.com','x','2026-01-01')");
    db.exec(MIGRATIONS.find((m) => m.version === 10)!.sql);
    expect(db.exec("SELECT theme FROM users WHERE username = 'vieja'")[0].values[0][0]).toBe('dark');
  });
});
