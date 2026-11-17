import AsyncStorage from '@react-native-async-storage/async-storage';

import { aCuenta, aInvitacion, aMiembro } from '@/data/mappersEquipo';
import { EquipoMemoria } from '@/data/memoria/equipoMemoria';
import {
  CacheSesion,
  claveLocal,
  resolverSesionRemota,
  resultadoSesion,
  type ResultadoSesion,
} from '@/data/sesion';
import type { Miembro } from '@/domain/rules/roles';

const miembro = (parcial: Partial<Miembro> = {}): Miembro => ({
  uid: 'c1',
  rol: 'cajero',
  nombre: 'Rosa',
  email: 'rosa@x.pe',
  activo: true,
  desde: null,
  invitacion: 'ABCDEFGH',
  ...parcial,
});

describe('claveLocal (D-33)', () => {
  it('el dueño conserva la clave de siempre; el cajero separa por bodega', () => {
    expect(claveLocal({ uid: 'u1', bodega: 'u1', rol: 'dueno' })).toBe('u1');
    expect(claveLocal({ uid: 'c1', bodega: 'd1', rol: 'cajero' })).toBe('c1@d1');
  });
});

describe('resultadoSesion', () => {
  it('sin cuenta = dueño de su ruta', () => {
    expect(resultadoSesion('u1', 'Lucho', null, null)).toEqual({
      tipo: 'activa',
      sesion: { uid: 'u1', bodega: 'u1', rol: 'dueno', nombre: 'Lucho' },
    });
  });

  it('cuenta + miembro activo = cajero de esa bodega, con el nombre del miembro', () => {
    const r = resultadoSesion('c1', 'otro', { uid: 'c1', bodega: 'd1', rol: 'cajero' }, miembro());
    expect(r).toEqual({
      tipo: 'activa',
      sesion: { uid: 'c1', bodega: 'd1', rol: 'cajero', nombre: 'Rosa' },
    });
  });

  it('desactivado o quitado: sin acceso, con el motivo', () => {
    const cuenta = { uid: 'c1', bodega: 'd1', rol: 'cajero' as const };
    expect(resultadoSesion('c1', '', cuenta, miembro({ activo: false }))).toEqual({
      tipo: 'sin-acceso',
      uid: 'c1',
      bodega: 'd1',
      motivo: 'desactivado',
    });
    expect(resultadoSesion('c1', '', cuenta, null)).toMatchObject({ motivo: 'quitado' });
  });
});

describe('resolverSesionRemota', () => {
  it('lee la cuenta y, solo si es cajero, su miembro', async () => {
    const equipo = new EquipoMemoria();
    const leerMiembro = jest.spyOn(equipo, 'leerMiembro');
    await expect(resolverSesionRemota(equipo, 'u1', '')).resolves.toMatchObject({
      sesion: { rol: 'dueno', bodega: 'u1', nombre: 'Dueño' },
    });
    expect(leerMiembro).not.toHaveBeenCalled();

    equipo.cuentas.set('c1', { uid: 'c1', bodega: 'd1', rol: 'cajero' });
    equipo.miembros.set('d1/c1', miembro());
    await expect(resolverSesionRemota(equipo, 'c1', '')).resolves.toMatchObject({
      sesion: { rol: 'cajero', bodega: 'd1' },
    });
  });

  it('sin red falla (quien llama decide usar la caché)', async () => {
    const equipo = new EquipoMemoria();
    jest
      .spyOn(equipo, 'leerCuenta')
      .mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }));
    await expect(resolverSesionRemota(equipo, 'c1', '')).rejects.toMatchObject({
      code: 'unavailable',
    });
  });
});

describe('CacheSesion', () => {
  beforeEach(() => AsyncStorage.clear());

  it('guarda y recupera la sesión por uid', async () => {
    const cache = new CacheSesion(AsyncStorage);
    const r: ResultadoSesion = {
      tipo: 'activa',
      sesion: { uid: 'c1', bodega: 'd1', rol: 'cajero', nombre: 'Rosa' },
    };
    await cache.guardar('c1', r);
    await expect(cache.leer('c1')).resolves.toEqual(r);
    await expect(cache.leer('otro')).resolves.toBeNull();
    await cache.borrar('c1');
    await expect(cache.leer('c1')).resolves.toBeNull();
  });

  it('descarta datos raros: de otro uid, dueño con otra bodega o JSON roto', async () => {
    const cache = new CacheSesion(AsyncStorage);
    await AsyncStorage.setItem(
      'bodega:sesion:u1',
      JSON.stringify({
        tipo: 'activa',
        sesion: { uid: 'u1', bodega: 'x', rol: 'dueno', nombre: 'a' },
      }),
    );
    await expect(cache.leer('u1')).resolves.toBeNull();
    await AsyncStorage.setItem(
      'bodega:sesion:u2',
      JSON.stringify({
        tipo: 'activa',
        sesion: { uid: 'otro', bodega: 'd', rol: 'cajero', nombre: 'a' },
      }),
    );
    await expect(cache.leer('u2')).resolves.toBeNull();
    await AsyncStorage.setItem('bodega:sesion:u3', '{roto');
    await expect(cache.leer('u3')).resolves.toBeNull();
  });

  it('recuerda también el "sin acceso"', async () => {
    const cache = new CacheSesion(AsyncStorage);
    const r: ResultadoSesion = {
      tipo: 'sin-acceso',
      uid: 'c1',
      bodega: 'd1',
      motivo: 'desactivado',
    };
    await cache.guardar('c1', r);
    await expect(cache.leer('c1')).resolves.toEqual(r);
  });
});

describe('mappers del equipo', () => {
  it('invitación válida y descarte de documentos raros', () => {
    const expira = new Date(2026, 10, 20);
    expect(
      aInvitacion('ABCDEFGH', {
        dueno: 'd1',
        rol: 'cajero',
        expira,
        usadaPor: null,
        nombreBodega: 'Bodega Lucho',
      }),
    ).toMatchObject({ codigo: 'ABCDEFGH', dueno: 'd1', usadaPor: null, expira });
    expect(aInvitacion('X', { dueno: 'd1', rol: 'dueno', expira })).toBeNull();
    expect(aInvitacion('X', { dueno: 'd1', rol: 'cajero' })).toBeNull();
  });

  it('miembro: activo solo si es true; cuenta solo si es de cajero', () => {
    expect(aMiembro('c1', { nombre: 'Rosa', activo: 'sí' }).activo).toBe(false);
    expect(aMiembro('c1', { nombre: 'Rosa', activo: true }).activo).toBe(true);
    expect(aCuenta('c1', { bodega: 'd1', rol: 'cajero' })).toEqual({
      uid: 'c1',
      bodega: 'd1',
      rol: 'cajero',
    });
    expect(aCuenta('c1', { bodega: 'd1', rol: 'otro' })).toBeNull();
    expect(aCuenta('c1', undefined)).toBeNull();
  });
});
