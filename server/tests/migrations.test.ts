import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../src/migrations';

describe('migraciones sobre datos existentes', () => {
  it('7 y 8: quien compartía el perfil pasa a público y las listas antiguas reciben su pareja y última actividad', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run('PRAGMA foreign_keys = ON');
    const upTo = (v: number) => MIGRATIONS.filter((m) => m.version <= v).forEach((m) => db.exec(m.sql));

    // Base tal y como estaba tras la fase 9 (migraciones 1-6) con datos
    upTo(6);
    db.run("INSERT INTO users (username, email, password_hash, created_at, share_enabled, share_token) VALUES ('ana','a@t.com','x','2026-01-01',1,'tok'), ('beto','b@t.com','x','2026-01-01',0,NULL), ('carla','c@t.com','x','2026-01-01',0,NULL)");
    db.run("INSERT INTO content (source, external_id, type, title) VALUES ('tmdb','movie-1','pelicula','Peli')");
    db.run("INSERT INTO joint_lists (id, name, created_by, created_at) VALUES (1,'Vieja con historial',2,'2026-02-01T00:00:00.000Z'), (2,'Vieja sin historial',3,'2026-03-01T00:00:00.000Z')");
    db.run('INSERT INTO joint_list_members (list_id, user_id) VALUES (1,2),(1,1),(2,3),(2,1)');
    db.run("INSERT INTO joint_list_history (list_id, content_id, user_id, action, created_at) VALUES (1,1,1,'add','2026-02-10T12:00:00.000Z'), (1,1,2,'status','2026-02-20T08:00:00.000Z')");

    // Se aplican las nuevas
    MIGRATIONS.filter((m) => m.version >= 7).forEach((m) => db.exec(m.sql));

    const users = db.exec('SELECT username, profile_public FROM users ORDER BY id')[0].values;
    expect(users).toEqual([['ana', 1], ['beto', 0], ['carla', 0]]); // ana compartía → pública; el resto, privado

    const lists = db.exec('SELECT id, user_a, user_b, last_activity_at FROM joint_lists ORDER BY id')[0].values;
    expect(lists[0]).toEqual([1, 1, 2, '2026-02-20T08:00:00.000Z']); // pareja ordenada y última actividad = último cambio
    expect(lists[1]).toEqual([2, 1, 3, '2026-03-01T00:00:00.000Z']); // sin historial: fecha de creación

    const left = db.exec('SELECT COUNT(*) FROM joint_list_members WHERE left_at IS NOT NULL')[0].values[0][0];
    expect(left).toBe(0); // todos siguen dentro
  });

  it('15: el anime guardado de Jikan pasa a la fuente «mal» con el mismo id y conserva su progreso', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run('PRAGMA foreign_keys = ON');
    MIGRATIONS.filter((m) => m.version <= 14).forEach((m) => db.exec(m.sql));
    db.run("INSERT INTO users (username, email, password_hash, created_at) VALUES ('ana','a@t.com','x','2026-01-01')");
    db.run("INSERT INTO content (source, external_id, type, title) VALUES ('jikan','20','anime','Naruto'), ('tmdb','tv-1396','serie','Breaking Bad')");
    db.run("INSERT INTO user_content (user_id, content_id, status, watched_episodes, updated_at) VALUES (1, 1, 'VIENDO', 50, '2026-10-01')");

    MIGRATIONS.filter((m) => m.version >= 15).forEach((m) => db.exec(m.sql));

    expect(db.exec('SELECT id, source, external_id FROM content ORDER BY id')[0].values).toEqual([[1, 'mal', '20'], [2, 'tmdb', 'tv-1396']]);
    expect(db.exec('SELECT content_id, watched_episodes FROM user_content')[0].values).toEqual([[1, 50]]);
  });

  it('las versiones son correlativas y no se repiten', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(MIGRATIONS.map((_, i) => i + 1));
  });
});
