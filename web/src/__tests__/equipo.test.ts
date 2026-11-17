import {
  cuposCajeros,
  ErrorDominio,
  sesionDueno,
  type AceptacionInvitacion,
  type Cuenta,
  type Invitacion,
  type Miembro,
  type Sesion,
} from '@bodegon/core';
import { describe, expect, it, vi } from 'vitest';

import { unirmeConCodigo, type RepositorioEquipoWeb } from '../equipo';
import {
  aCuenta,
  aInvitacion,
  AvisoEquipo,
  aMiembro,
  codigoMientrasEscribe,
  debeDescontarStock,
  documentoCuenta,
  documentoInvitacion,
  documentoMiembro,
  enlaceWhatsAppTexto,
  hayVentasDeCajeros,
  invitacionesVigentes,
  mensajeErrorEquipo,
  nombreSugerido,
  ocupanCupo,
  resolverAcceso,
  textoVence,
  ventasDelTurno,
  ventasPorAutor,
} from '../logic/equipo';
import { aCaja, aMovimientoCaja, escrituraCaja, sellarEscrituraCaja } from '../mappersCaja';
import { aMovimiento, aVenta, type VentaWeb } from '../mappers';

const DUENO = 'dueno-1';
const ROSA = 'rosa-1';
const AHORA = new Date('2026-11-16T15:00:00Z');
const cajera: Sesion = { uid: ROSA, bodega: DUENO, rol: 'cajero', nombre: 'Rosa' };
const dueno = sesionDueno(DUENO, 'Lucho');
const ts = (d: Date) => ({ toDate: () => d });

const invitacion = (extra: Partial<Invitacion> = {}): Invitacion => ({
  codigo: 'ABCDEFGH',
  dueno: DUENO,
  rol: 'cajero',
  creada: new Date(AHORA.getTime() - 3_600_000),
  expira: new Date(AHORA.getTime() + 5 * 86_400_000),
  usadaPor: null,
  nombreBodega: 'Bodega Lucho',
  ...extra,
});
const miembro = (extra: Partial<Miembro> = {}): Miembro => ({
  uid: ROSA,
  rol: 'cajero',
  nombre: 'Rosa',
  email: 'rosa@gmail.com',
  activo: true,
  desde: AHORA,
  invitacion: 'ABCDEFGH',
  ...extra,
});

describe('documentos del equipo ↔ entidades', () => {
  it('invitación: lee Timestamps y descarta documentos sin dueño o sin vencimiento', () => {
    const inv = aInvitacion('ABCDEFGH', {
      dueno: DUENO,
      rol: 'cajero',
      creada: ts(AHORA),
      expira: ts(new Date(AHORA.getTime() + 1000)),
      usadaPor: null,
      nombreBodega: 'Bodega Lucho',
    });
    expect(inv).toMatchObject({ codigo: 'ABCDEFGH', dueno: DUENO, usadaPor: null, nombreBodega: 'Bodega Lucho' });
    expect(inv?.expira.getTime()).toBe(AHORA.getTime() + 1000);
    expect(aInvitacion('X', { expira: ts(AHORA) })).toBeNull();
    expect(aInvitacion('X', { dueno: DUENO })).toBeNull();
    expect(aInvitacion('X', undefined)).toBeNull();
  });

  it('miembro: solo activo === true da acceso; cuenta propia o vacía = sin cuenta', () => {
    expect(aMiembro(ROSA, { nombre: 'Rosa', activo: 'true' })?.activo).toBe(false);
    expect(aMiembro(ROSA, { nombre: 'Rosa', activo: true, desde: ts(AHORA) })).toMatchObject({ activo: true, desde: AHORA, email: '' });
    expect(aCuenta(ROSA, { bodega: DUENO, rol: 'cajero' })).toEqual({ uid: ROSA, bodega: DUENO, rol: 'cajero' });
    expect(aCuenta(ROSA, { bodega: ROSA })).toBeNull();
    expect(aCuenta(ROSA, { bodega: '' })).toBeNull();
  });

  it('escrituras con EXACTAMENTE las claves que piden las reglas', () => {
    const inv = documentoInvitacion(invitacion(), 'SELLO', (d) => `ts:${d.getTime()}`);
    expect(Object.keys(inv).sort()).toEqual(['creada', 'dueno', 'expira', 'nombreBodega', 'rol', 'usadaPor']);
    expect(inv).toMatchObject({ creada: 'SELLO', usadaPor: null, rol: 'cajero' });

    const a: AceptacionInvitacion = {
      codigo: 'ABCDEFGH',
      dueno: DUENO,
      miembro: { uid: ROSA, rol: 'cajero', nombre: 'Rosa', email: '', activo: true, invitacion: 'ABCDEFGH' },
      crearCuenta: true,
    };
    const m = documentoMiembro(a, 'SELLO');
    // Sin correo no se manda `email` (es opcional en las reglas).
    expect(Object.keys(m).sort()).toEqual(['activo', 'desde', 'invitacion', 'nombre', 'rol']);
    expect(m).toMatchObject({ activo: true, desde: 'SELLO', invitacion: 'ABCDEFGH' });
    expect(documentoMiembro({ ...a, miembro: { ...a.miembro, email: 'r@x.pe' } }, 1)).toHaveProperty('email', 'r@x.pe');
    expect(documentoCuenta(a)).toEqual({ bodega: DUENO, rol: 'cajero' });
  });
});

describe('sesión al ingresar (resolverAcceso)', () => {
  const cuenta: Cuenta = { uid: ROSA, bodega: DUENO, rol: 'cajero' };

  it('sin cuenta: dueño de su propia ruta, como siempre', () => {
    const a = resolverAcceso(DUENO, 'Lucho', null, null);
    expect(a).toEqual({ tipo: 'ok', sesion: { uid: DUENO, bodega: DUENO, rol: 'dueno', nombre: 'Lucho' } });
  });

  it('cajero activo: su raíz de datos es la bodega del dueño', () => {
    const a = resolverAcceso(ROSA, '', cuenta, miembro());
    expect(a.tipo).toBe('ok');
    if (a.tipo === 'ok') expect(a.sesion).toEqual({ uid: ROSA, bodega: DUENO, rol: 'cajero', nombre: 'Rosa' });
  });

  it('desactivado o quitado: sin acceso, con el motivo y el código para el nombre de la bodega', () => {
    expect(resolverAcceso(ROSA, '', cuenta, miembro({ activo: false }))).toEqual({
      tipo: 'sin-acceso',
      motivo: 'desactivado',
      bodega: DUENO,
      codigo: 'ABCDEFGH',
    });
    expect(resolverAcceso(ROSA, '', cuenta, null)).toEqual({ tipo: 'sin-acceso', motivo: 'quitado', bodega: DUENO, codigo: null });
  });

  it('nombre sugerido para el cajero: el de Google o lo de antes de la @', () => {
    expect(nombreSugerido({ displayName: ' Rosa Q ', email: 'x@y.pe' })).toBe('Rosa Q');
    expect(nombreSugerido({ displayName: null, email: 'rosa.quispe92@gmail.com' })).toBe('Rosa quispe');
    expect(nombreSugerido({ displayName: null, email: null })).toBe('');
  });
});

describe('venta del cajero: stock y autoría', () => {
  it('el dueño descuenta todo stock controlado; el cajero solo BAJA un stock numérico', () => {
    expect(debeDescontarStock(null, -1, dueno)).toBe(false);
    expect(debeDescontarStock(undefined, -1, dueno)).toBe(false);
    expect(debeDescontarStock(5, -1, dueno)).toBe(true);
    expect(debeDescontarStock(5, 1, dueno)).toBe(true);
    expect(debeDescontarStock('5', -1, dueno)).toBe(true); // heredado: como antes
    expect(debeDescontarStock(null, -1, cajera)).toBe(false);
    expect(debeDescontarStock('5', -1, cajera)).toBe(false);
    expect(debeDescontarStock(5, 1, cajera)).toBe(false);
    expect(debeDescontarStock(5, -2, cajera)).toBe(true);
  });

  const venta = (id: string, total: number, autor?: { uid: string; nombre: string }, extra: Partial<VentaWeb> = {}): VentaWeb => ({
    id,
    items: [{ id: 'p', nombre: 'Arroz', precio: total, cantidad: 1 }],
    total,
    metodoDePago: 'Efectivo',
    clienteId: null,
    fecha: AHORA,
    ...(autor ? { autor } : {}),
    ...extra,
  });

  it('"quién vendió": suma por autor; una anulación descuenta a quien vendió y no cuenta como venta', () => {
    const lista = [
      venta('v1', 10, { uid: ROSA, nombre: 'Rosa' }),
      venta('v2', 4.5, { uid: ROSA, nombre: 'Rosa' }),
      venta('v3', 20, { uid: DUENO, nombre: 'Lucho' }),
      venta('v4', 1.1),
      venta('v2-anulada', -4.5, { uid: DUENO, nombre: 'Lucho' }, { anulaA: 'v2' }),
    ];
    expect(ventasPorAutor(lista)).toEqual([
      { uid: DUENO, nombre: 'Lucho', total: 20, cantidad: 1 },
      { uid: ROSA, nombre: 'Rosa', total: 10, cantidad: 2 },
      { uid: '', nombre: '', total: 1.1, cantidad: 1 },
    ]);
    expect(hayVentasDeCajeros(lista, DUENO)).toBe(true);
    expect(hayVentasDeCajeros([venta('a', 1, { uid: DUENO, nombre: 'L' }), venta('b', 2)], DUENO)).toBe(false);
  });

  it('ventas del turno: desde la apertura de la caja (las sin fecha cuentan)', () => {
    const antes = venta('a', 1, undefined, { fecha: new Date(AHORA.getTime() - 60_000) });
    const despues = venta('b', 2, undefined, { fecha: new Date(AHORA.getTime() + 60_000) });
    const pendiente = venta('c', 3, undefined, { fecha: null });
    expect(ventasDelTurno([antes, despues, pendiente], { apertura: { fecha: AHORA } }).map((v) => v.id)).toEqual(['b', 'c']);
    expect(ventasPorAutor([antes, despues], AHORA)).toEqual([{ uid: '', nombre: '', total: 2, cantidad: 1 }]);
  });

  it('los mappers leen la autoría (y toleran documentos viejos sin ella)', () => {
    expect(aVenta('v', { total: 5, vendidoPor: ROSA, vendidoPorNombre: 'Rosa' }).autor).toEqual({ uid: ROSA, nombre: 'Rosa' });
    expect(aVenta('v', { total: 5 })).not.toHaveProperty('autor');
    expect(aMovimiento('m', { monto: -5, registradoPor: ROSA, registradoPorNombre: 'Rosa' }).autor?.uid).toBe(ROSA);
    const caja = aCaja('c', {
      estado: 'cerrada',
      apertura: { monto: 50 },
      abiertaPor: DUENO,
      abiertaPorNombre: 'Lucho',
      cerradaPor: ROSA,
      cerradaPorNombre: 'Rosa',
    });
    expect(caja.abiertaPor).toEqual({ uid: DUENO, nombre: 'Lucho' });
    expect(caja.cerradaPor).toEqual({ uid: ROSA, nombre: 'Rosa' });
    expect(aMovimientoCaja('c', 'm', { tipo: 'egreso', monto: 3, registradoPor: ROSA, registradoPorNombre: 'Rosa' }).autor?.nombre).toBe('Rosa');
  });

  it('caja: apertura, movimiento y cierre llevan el sello que exigen las reglas al cajero', () => {
    const abrir = sellarEscrituraCaja(escrituraCaja({ id: 'c', tipo: 'abrir', cajaId: 'c', monto: 50, creadaEn: 1 }, 'S', 'T'), cajera);
    expect(abrir.datos).toMatchObject({ abiertaPor: ROSA, abiertaPorNombre: 'Rosa', estado: 'abierta' });
    const mov = sellarEscrituraCaja(
      escrituraCaja({ id: 'm', tipo: 'movimiento', cajaId: 'c', movimiento: { tipo: 'egreso', monto: 5, motivo: 'Pan' }, creadaEn: 1 }, 'S', 'T'),
      cajera,
    );
    expect(mov.datos).toMatchObject({ registradoPor: ROSA, registradoPorNombre: 'Rosa' });
    const cerrar = sellarEscrituraCaja(
      escrituraCaja({ id: 'c-cierre', tipo: 'cerrar', cajaId: 'c', cierre: { contado: 10, esperado: 10, diferencia: 0 }, creadaEn: 1 }, 'S', 'T'),
      cajera,
    );
    expect(Object.keys(cerrar.datos).sort()).toEqual(['cerradaPor', 'cerradaPorNombre', 'cierre', 'estado']);
    // Sin sesión, la escritura queda como antes (compatibilidad del dueño).
    const sin = sellarEscrituraCaja(escrituraCaja({ id: 'c', tipo: 'abrir', cajaId: 'c', monto: 50, creadaEn: 1 }, 'S', 'T'), null);
    expect(Object.keys(sin.datos).sort()).toEqual(['apertura', 'estado']);
  });
});

describe('invitaciones: textos, cupos y WhatsApp', () => {
  it('el código se escribe en mayúsculas con guion (ABCD-EFGH)', () => {
    expect(codigoMientrasEscribe('abcd')).toBe('ABCD');
    expect(codigoMientrasEscribe('abcde')).toBe('ABCD-E');
    expect(codigoMientrasEscribe(' ab cd-ef gh xyz')).toBe('ABCD-EFGH');
  });

  it('vigentes: sin usar y sin vencer, la más nueva primero; cuentan para el tope de 3', () => {
    const a = invitacion({ codigo: 'AAAAAAAA', expira: new Date(AHORA.getTime() + 1000) });
    const b = invitacion({ codigo: 'BBBBBBBB', expira: new Date(AHORA.getTime() + 9000) });
    const usada = invitacion({ codigo: 'CCCCCCCC', usadaPor: ROSA });
    const vencida = invitacion({ codigo: 'DDDDDDDD', expira: new Date(AHORA.getTime() - 1) });
    const vigentes = invitacionesVigentes([a, b, usada, vencida], AHORA);
    expect(vigentes.map((i) => i.codigo)).toEqual(['BBBBBBBB', 'AAAAAAAA']);
    expect(cuposCajeros(ocupanCupo([miembro(), miembro({ uid: 'x', activo: false })], vigentes))).toBe(0);
    expect(cuposCajeros(ocupanCupo([miembro({ activo: false })], []))).toBe(3);
    expect(textoVence(vencida, AHORA)).toBe('Venció');
    expect(textoVence(b, AHORA)).toMatch(/^Vale hasta el \w{3} \d+$/);
  });

  it('WhatsApp sin número fijo y con el texto codificado', () => {
    expect(enlaceWhatsAppTexto('Hola & código ABCD-EFGH')).toBe('https://wa.me/?text=Hola%20%26%20c%C3%B3digo%20ABCD-EFGH');
  });

  it('errores en lenguaje humano', () => {
    expect(mensajeErrorEquipo(new ErrorDominio('LIMITE_CAJEROS'), 'x')).toContain('3 cajeros');
    expect(mensajeErrorEquipo({ code: 'unavailable' }, 'x')).toContain('conexión');
    expect(mensajeErrorEquipo({ code: 'permission-denied' }, 'Pide otro código')).toBe('Pide otro código');
  });
});

describe('"Tengo un código de invitación" (unirmeConCodigo)', () => {
  function repoFalso(estado: {
    invitaciones?: Invitacion[];
    miembros?: Record<string, Miembro>;
    cuenta?: Cuenta | null;
  }) {
    const invs = new Map((estado.invitaciones ?? [invitacion()]).map((i) => [i.codigo, i]));
    const miembros = new Map(Object.entries(estado.miembros ?? {}));
    let cuenta = estado.cuenta ?? null;
    const repo = {
      crearInvitacion: vi.fn(),
      leerInvitacion: vi.fn(async (c: string) => invs.get(c) ?? null),
      observarInvitaciones: vi.fn(),
      borrarInvitacion: vi.fn(),
      observarMiembros: vi.fn(),
      observarMiembro: vi.fn(),
      leerMiembro: vi.fn(async (dueno: string, uid: string) => miembros.get(`${dueno}/${uid}`) ?? null),
      actualizarMiembro: vi.fn(),
      quitarMiembro: vi.fn(),
      leerCuenta: vi.fn(async () => cuenta),
      aceptarInvitacion: vi.fn(async (_a: AceptacionInvitacion) => undefined),
      borrarCuenta: vi.fn(async () => {
        cuenta = null;
      }),
    } satisfies RepositorioEquipoWeb;
    return repo;
  }
  const datos = { codigo: 'abcd-efgh', uid: ROSA, nombre: '  Rosa ', email: 'rosa@gmail.com', ahora: AHORA };

  it('normaliza el código, escribe las tres cosas en una transacción y devuelve la sesión de cajero', async () => {
    const repo = repoFalso({});
    const sesion = await unirmeConCodigo(repo, datos);
    expect(sesion).toEqual({ uid: ROSA, bodega: DUENO, rol: 'cajero', nombre: 'Rosa' });
    expect(repo.aceptarInvitacion).toHaveBeenCalledWith({
      codigo: 'ABCDEFGH',
      dueno: DUENO,
      miembro: { uid: ROSA, rol: 'cajero', nombre: 'Rosa', email: 'rosa@gmail.com', activo: true, invitacion: 'ABCDEFGH' },
      crearCuenta: true,
    });
  });

  it('cajero que vuelve a la misma bodega tras ser quitado: no recrea la cuenta', async () => {
    const repo = repoFalso({ cuenta: { uid: ROSA, bodega: DUENO, rol: 'cajero' } });
    await unirmeConCodigo(repo, datos);
    expect(repo.aceptarInvitacion.mock.calls[0]?.[0].crearCuenta).toBe(false);
    expect(repo.borrarCuenta).not.toHaveBeenCalled();
  });

  it('cuenta de otra bodega donde ya no está activo: la borra primero (lo permiten las reglas)', async () => {
    const repo = repoFalso({
      cuenta: { uid: ROSA, bodega: 'otra', rol: 'cajero' },
      miembros: { [`otra/${ROSA}`]: miembro({ activo: false }) },
    });
    await unirmeConCodigo(repo, datos);
    expect(repo.borrarCuenta).toHaveBeenCalledWith(ROSA);
    expect(repo.aceptarInvitacion.mock.calls[0]?.[0].crearCuenta).toBe(true);
  });

  it('sigue activo en otra bodega: CUENTA_DE_OTRA_BODEGA y no toca nada', async () => {
    const repo = repoFalso({ cuenta: { uid: ROSA, bodega: 'otra', rol: 'cajero' }, miembros: { [`otra/${ROSA}`]: miembro() } });
    await expect(unirmeConCodigo(repo, datos)).rejects.toMatchObject({ codigo: 'CUENTA_DE_OTRA_BODEGA' });
    expect(repo.borrarCuenta).not.toHaveBeenCalled();
    expect(repo.aceptarInvitacion).not.toHaveBeenCalled();
  });

  it('ya es miembro de esa bodega: activo o en pausa, con un aviso claro y sin escribir', async () => {
    const activo = repoFalso({ miembros: { [`${DUENO}/${ROSA}`]: miembro() } });
    await expect(unirmeConCodigo(activo, datos)).rejects.toMatchObject({ codigo: 'YA_ERES_CAJERO' });
    const pausa = repoFalso({ miembros: { [`${DUENO}/${ROSA}`]: miembro({ activo: false }) } });
    const error = await unirmeConCodigo(pausa, datos).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AvisoEquipo);
    expect((error as AvisoEquipo).codigo).toBe('ACCESO_EN_PAUSA');
    expect(pausa.aceptarInvitacion).not.toHaveBeenCalled();
  });

  it('código inválido, inexistente, usado, vencido o propio: el mensaje del core', async () => {
    await expect(unirmeConCodigo(repoFalso({}), { ...datos, codigo: 'O0I1' })).rejects.toMatchObject({ codigo: 'CODIGO_INVALIDO' });
    await expect(unirmeConCodigo(repoFalso({ invitaciones: [] }), datos)).rejects.toMatchObject({ codigo: 'INVITACION_NO_EXISTE' });
    await expect(unirmeConCodigo(repoFalso({ invitaciones: [invitacion({ usadaPor: 'x' })] }), datos)).rejects.toMatchObject({
      codigo: 'INVITACION_USADA',
    });
    await expect(
      unirmeConCodigo(repoFalso({ invitaciones: [invitacion({ expira: new Date(AHORA.getTime() - 1) })] }), datos),
    ).rejects.toMatchObject({ codigo: 'INVITACION_VENCIDA' });
    await expect(unirmeConCodigo(repoFalso({}), { ...datos, uid: DUENO })).rejects.toMatchObject({ codigo: 'INVITACION_PROPIA' });
  });
});
