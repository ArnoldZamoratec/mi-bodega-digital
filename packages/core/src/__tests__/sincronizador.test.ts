import type { ClasificadorErrores, Cola, EntradaColaDe } from '../ports';
import { SincronizadorCola } from '../usecases/sincronizarVentas';

interface Op {
  id: string;
}

/** Cola en memoria con la semántica de `ColaPersistente` (FIFO, quitar por id). */
class ColaMemoria implements Cola<Op> {
  entradas: EntradaColaDe<Op>[] = [];
  listar = () => Promise.resolve(this.entradas.map((e) => ({ ...e })));
  agregar = (operacion: Op) => {
    this.entradas.push({ operacion, intentos: 0 });
    return Promise.resolve();
  };
  actualizar = (entrada: EntradaColaDe<Op>) => {
    this.entradas = this.entradas.map((e) =>
      e.operacion.id === entrada.operacion.id ? entrada : e,
    );
    return Promise.resolve();
  };
  quitar = (id: string) => {
    this.entradas = this.entradas.filter((e) => e.operacion.id !== id);
    return Promise.resolve();
  };
  suscribir = () => () => undefined;
}

const ROTA = 'FIRESTORE (13.3.0) INTERNAL ASSERTION FAILED: AsyncQueue is already failed';
const clasificador: ClasificadorErrores = {
  esErrorPermanente: (e) => e instanceof Error && e.message === 'permission-denied',
  esInstanciaRota: (e) => e instanceof Error && e.message.includes('INTERNAL ASSERTION FAILED'),
};

/** Envío que nunca termina (lo que hace runTransaction con el SDK roto) y luego responde bien. */
function montar(opciones: { cuelgaPrimero?: boolean; rotaDespues?: boolean } = {}) {
  const cola = new ColaMemoria();
  let reloj = 0;
  const enviados: string[] = [];
  const escritos = new Set<string>();
  const enviar = (op: Op): Promise<'escrita' | 'ya-existia'> => {
    enviados.push(op.id);
    if (opciones.cuelgaPrimero && enviados.length === 1) return new Promise(() => undefined);
    if (opciones.rotaDespues) throw new Error(ROTA);
    // Idempotente como VentasFirestore.confirmar.
    if (escritos.has(op.id)) return Promise.resolve('ya-existia');
    escritos.add(op.id);
    return Promise.resolve('escrita');
  };
  const sinc = new SincronizadorCola<Op>(cola, enviar, (op) => op.id, clasificador, {
    timeoutMs: 20,
    ahora: () => reloj,
  });
  return { cola, sinc, enviados, escritos, avanzar: (ms: number) => (reloj += ms) };
}

describe('SincronizadorCola · en vuelo (D-31)', () => {
  it('un envío colgado no se reenvía dentro del plazo (3 × timeout)', async () => {
    const { cola, sinc, enviados, avanzar } = montar({ cuelgaPrimero: true });
    await cola.agregar({ id: 'v1' });

    const r1 = await sinc.sincronizar();
    expect(r1).toMatchObject({ sincronizadas: 0, pendientes: 1, interrumpida: true });
    expect(cola.entradas[0]?.ultimoError).toBe('Tiempo de espera agotado');

    avanzar(59); // < 3 × 20 ms
    const r2 = await sinc.sincronizar();
    expect(r2).toMatchObject({ sincronizadas: 0, pendientes: 1, instanciaRota: false });
    expect(enviados).toEqual(['v1']);
  });

  it('pasado el plazo se reenvía, se confirma y se informa la instancia como rota', async () => {
    const { cola, sinc, enviados, escritos, avanzar } = montar({ cuelgaPrimero: true });
    await cola.agregar({ id: 'v1' });
    await sinc.sincronizar();

    avanzar(60);
    expect(sinc.atascadas()).toEqual(['v1']);
    const r = await sinc.sincronizar();
    expect(r).toEqual({
      sincronizadas: 1,
      pendientes: 0,
      interrumpida: false,
      instanciaRota: true,
    });
    expect(enviados).toEqual(['v1', 'v1']);
    expect([...escritos]).toEqual(['v1']);
    expect(sinc.atascadas()).toEqual([]);
  });

  it('"Sincronizar ahora" (forzar) reenvía de inmediato lo que sigue en vuelo', async () => {
    const { cola, sinc, enviados, avanzar } = montar({ cuelgaPrimero: true });
    await cola.agregar({ id: 'v1' });
    await cola.agregar({ id: 'v2' });
    await sinc.sincronizar();

    avanzar(1);
    const r = await sinc.sincronizar({ forzar: true });
    expect(r).toMatchObject({ sincronizadas: 2, pendientes: 0, instanciaRota: false });
    expect(enviados).toEqual(['v1', 'v1', 'v2']);
  });

  it('una llamada forzada durante otra ejecución corre después de ella', async () => {
    const { cola, sinc, enviados } = montar({ cuelgaPrimero: true });
    await cola.agregar({ id: 'v1' });
    const primera = sinc.sincronizar();
    const forzada = sinc.sincronizar({ forzar: true });
    expect(sinc.sincronizar()).toBe(primera);
    await primera;
    expect((await forzada).pendientes).toBe(0);
    expect(enviados).toEqual(['v1', 'v1']);
  });

  it('error de instancia rota (incluso síncrono): no bloquea la entrada e informa', async () => {
    const { cola, sinc } = montar({ rotaDespues: true });
    await cola.agregar({ id: 'v1' });
    await cola.agregar({ id: 'v2' });
    const r = await sinc.sincronizar();
    expect(r).toEqual({ sincronizadas: 0, pendientes: 2, interrumpida: true, instanciaRota: true });
    expect(cola.entradas[0]).toMatchObject({ intentos: 1, bloqueada: false, ultimoError: ROTA });
  });

  it('sin forzar ni vencer el plazo, la respuesta tardía del envío colgado lo saca de la cola', async () => {
    const cola = new ColaMemoria();
    let soltar: () => void = () => undefined;
    const sinc = new SincronizadorCola<Op>(
      cola,
      () => new Promise<void>((r) => (soltar = r)),
      (op) => op.id,
      clasificador,
      5,
    );
    await cola.agregar({ id: 'v1' });
    expect((await sinc.sincronizar()).interrumpida).toBe(true);
    soltar();
    await new Promise((r) => setTimeout(r, 0));
    expect(cola.entradas).toEqual([]);
  });
});
