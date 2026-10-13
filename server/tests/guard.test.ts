import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config';
import { guarded, HttpError } from '../src/http';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BASE = 60;

afterEach(() => { config.providerDownMaxMs = 15 * 60_000; });

describe('corte automático de proveedores caídos (con retroceso progresivo)', () => {
  it('tras un fallo de red no se vuelve a llamar durante la espera, y luego se prueba de nuevo', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(504, 'timeout'));
    await expect(guarded('t1', BASE, fn)).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(1);

    // dentro de la espera: respuesta inmediata, sin llamar al proveedor
    await expect(guarded('t1', BASE, fn)).rejects.toThrow(/temporalmente/);
    expect(fn).toHaveBeenCalledTimes(1);

    await sleep(BASE + 20);
    await expect(guarded('t1', BASE, fn)).rejects.toThrow('timeout'); // vuelve a probar
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cada fallo seguido duplica la espera', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(502, 'caído'));
    await guarded('t2', BASE, fn).catch(() => {}); // fallo 1 → espera 60
    await sleep(BASE + 20);
    await guarded('t2', BASE, fn).catch(() => {}); // fallo 2 → espera 120
    await sleep(BASE + 20); // 80 ms después: sigue cortado (habría que esperar 120)
    await expect(guarded('t2', BASE, fn)).rejects.toThrow(/temporalmente/);
    expect(fn).toHaveBeenCalledTimes(2);
    await sleep(70); // ya han pasado >120 ms desde el 2º fallo
    await guarded('t2', BASE, fn).catch(() => {});
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('la espera tiene un máximo', async () => {
    config.providerDownMaxMs = BASE; // no puede crecer más allá de la base
    const fn = vi.fn().mockRejectedValue(new HttpError(504, 'timeout'));
    await guarded('t3', BASE, fn).catch(() => {});
    await sleep(BASE + 20);
    await guarded('t3', BASE, fn).catch(() => {});
    await sleep(BASE + 20); // con retroceso sin tope seguiría cortado
    await guarded('t3', BASE, fn).catch(() => {});
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('si el proveedor responde, el retroceso se reinicia', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new HttpError(504, 'x'))
      .mockRejectedValueOnce(new HttpError(504, 'x'))
      .mockResolvedValueOnce('ok')
      .mockRejectedValue(new HttpError(504, 'x'));
    await guarded('t4', BASE, fn).catch(() => {}); // espera 60
    await sleep(BASE + 20);
    await guarded('t4', BASE, fn).catch(() => {}); // espera 120
    await sleep(2 * BASE + 20);
    await expect(guarded('t4', BASE, fn)).resolves.toBe('ok'); // responde: se borra el estado
    await guarded('t4', BASE, fn).catch(() => {});             // nuevo fallo: espera otra vez 60, no 240
    await sleep(BASE + 20);
    await guarded('t4', BASE, fn).catch(() => {});
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('los errores de la API (401, 404…) no cortan el proveedor', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(401, 'clave no válida'));
    await expect(guarded('t5', BASE, fn)).rejects.toThrow('clave no válida');
    await expect(guarded('t5', BASE, fn)).rejects.toThrow('clave no válida'); // se vuelve a llamar
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('un error de red sin código también corta', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    await guarded('t6', BASE, fn).catch(() => {});
    await expect(guarded('t6', BASE, fn)).rejects.toThrow(/temporalmente/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
