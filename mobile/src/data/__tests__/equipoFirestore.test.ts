import type { Firestore } from 'firebase/firestore';

import { EquipoFirestore, ErrorEquipo } from '@/data/firebase/equipoFirestore';
import type { Invitacion } from '@/domain/rules/roles';

/**
 * D-33: la transacción de aceptar escribe EXACTAMENTE lo que esperan las reglas
 * (invitación usadaPor null → uid, miembro con `desde` del servidor, cuenta) y la invitación
 * se crea con `creada` del servidor.
 */

type Ref = { ruta: string };
type Escritura = { tipo: 'set' | 'update'; ruta: string; datos: Record<string, unknown> };
const mockEscrituras: Escritura[] = [];
const mockDocumentos = new Map<string, Record<string, unknown>>();
const mockSetDoc = jest.fn();

jest.mock('firebase/firestore', () => {
  const actual = jest.requireActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: (_db: unknown, ruta: string) => ({ ruta }),
    doc: (padre: Ref | object, ruta?: string) =>
      'ruta' in padre ? { ruta: `${(padre as Ref).ruta}/${ruta}` } : { ruta },
    serverTimestamp: () => 'HORA_SERVIDOR',
    setDoc: (ref: Ref, datos: unknown) => mockSetDoc(ref.ruta, datos),
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: Ref) => {
          const d = mockDocumentos.get(ref.ruta);
          return { exists: () => !!d, get: (c: string) => d?.[c] };
        },
        set: (ref: Ref, datos: Record<string, unknown>) =>
          mockEscrituras.push({ tipo: 'set', ruta: ref.ruta, datos }),
        update: (ref: Ref, datos: Record<string, unknown>) =>
          mockEscrituras.push({ tipo: 'update', ruta: ref.ruta, datos }),
      }),
  };
});

const getIdToken = jest.fn(async () => 'token');
const repo = new EquipoFirestore(
  () => ({}) as Firestore,
  { currentUser: { getIdToken } } as never,
  'mi-bodega-app',
);
const A = 'artifacts/mi-bodega-app';

const aceptacion = (crearCuenta: boolean) => ({
  codigo: 'ABCDEFGH',
  dueno: 'd1',
  miembro: {
    uid: 'c1',
    rol: 'cajero' as const,
    nombre: 'Rosa',
    email: '',
    activo: true,
    invitacion: 'ABCDEFGH',
  },
  crearCuenta,
});

beforeEach(() => {
  mockEscrituras.length = 0;
  mockDocumentos.clear();
  mockSetDoc.mockClear();
  getIdToken.mockClear();
});

describe('EquipoFirestore.aceptarInvitacion', () => {
  it('una transacción: invitación usada, miembro y cuenta', async () => {
    await repo.aceptarInvitacion(aceptacion(true));
    expect(getIdToken).toHaveBeenCalled(); // D-31: token antes de la transacción
    expect(mockEscrituras).toEqual([
      { tipo: 'update', ruta: `${A}/invitaciones/ABCDEFGH`, datos: { usadaPor: 'c1' } },
      {
        tipo: 'set',
        ruta: `${A}/users/d1/miembros/c1`,
        // Sin `email` vacío; claves dentro de la lista cerrada de las reglas.
        datos: {
          rol: 'cajero',
          nombre: 'Rosa',
          activo: true,
          desde: 'HORA_SERVIDOR',
          invitacion: 'ABCDEFGH',
        },
      },
      { tipo: 'set', ruta: `${A}/cuentas/c1`, datos: { bodega: 'd1', rol: 'cajero' } },
    ]);
  });

  it('si la cuenta ya apunta a esta bodega no se reescribe', async () => {
    await repo.aceptarInvitacion(aceptacion(false));
    expect(mockEscrituras.map((e) => e.ruta)).not.toContain(`${A}/cuentas/c1`);
    expect(mockEscrituras).toHaveLength(2);
  });

  it('miembro activo ya existente: nada que hacer (reintento); pausado: mensaje claro', async () => {
    mockDocumentos.set(`${A}/users/d1/miembros/c1`, { activo: true });
    await repo.aceptarInvitacion(aceptacion(true));
    expect(mockEscrituras).toHaveLength(0);

    mockDocumentos.set(`${A}/users/d1/miembros/c1`, { activo: false });
    await expect(repo.aceptarInvitacion(aceptacion(true))).rejects.toBeInstanceOf(ErrorEquipo);
    expect(mockEscrituras).toHaveLength(0);
  });
});

describe('EquipoFirestore.crearInvitacion', () => {
  it('creada = hora del servidor, usadaPor null y las 6 claves de las reglas', async () => {
    const inv: Invitacion = {
      codigo: 'ABCDEFGH',
      dueno: 'd1',
      rol: 'cajero',
      creada: new Date(),
      expira: new Date(Date.now() + 86_400_000),
      usadaPor: null,
      nombreBodega: 'Bodega Lucho',
    };
    await repo.crearInvitacion(inv);
    const [ruta, datos] = mockSetDoc.mock.calls[0] as [string, Record<string, unknown>];
    expect(ruta).toBe(`${A}/invitaciones/ABCDEFGH`);
    expect(Object.keys(datos).sort()).toEqual(
      ['creada', 'dueno', 'expira', 'nombreBodega', 'rol', 'usadaPor'].sort(),
    );
    expect(datos).toMatchObject({ creada: 'HORA_SERVIDOR', usadaPor: null, dueno: 'd1' });
  });
});
