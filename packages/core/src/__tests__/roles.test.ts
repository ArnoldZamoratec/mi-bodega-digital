import { ErrorDominio } from '../errors';
import type { RepositorioEquipo } from '../portsEquipo';
import {
  ALFABETO_CODIGO,
  CAMPOS_AUTORIA,
  MAX_CAJEROS_ACTIVOS,
  PERMISOS,
  VIGENCIA_INVITACION_MS,
  VIGENCIA_MAXIMA_MS,
  crearInvitacion,
  cuposCajeros,
  exigirPermiso,
  formatearCodigo,
  generarCodigoInvitacion,
  leerAutoria,
  mensajeInvitacion,
  nombreAutor,
  normalizarCodigo,
  problemaInvitacion,
  puede,
  puedeAnularVenta,
  puedeBorrarMovimientos,
  puedeCrearClientes,
  puedeDescontarStock,
  puedeEditarClientes,
  puedeEditarConfig,
  puedeEditarProductos,
  puedeFiarPorVenta,
  puedeFiarSinVenta,
  puedeGestionarEquipo,
  puedeMarcarPagado,
  puedeMarcarRecordatorio,
  puedeRegistrarAbono,
  puedeRegistrarVenta,
  puedeUsarCaja,
  puedeVerConfig,
  puedeVerProductos,
  puedeVerReportes,
  puedeVerVentas,
  resolverSesion,
  sellarAperturaCaja,
  sellarAutoria,
  sellarCierreCaja,
  sellarMovimientoCaja,
  sellarMovimientoFiado,
  sellarVenta,
  sesionDueno,
  validarInvitacion,
  type Cuenta,
  type Invitacion,
  type Miembro,
  type Sesion,
} from '../rules/roles';
import {
  aceptarInvitacion,
  cambiarActivoCajero,
  invitarCajero,
  quitarCajero,
} from '../usecases/equipo';

const dueno: Sesion = sesionDueno('ana', 'Ana');
const cajero: Sesion = { uid: 'rosa', bodega: 'ana', rol: 'cajero', nombre: 'Rosa' };
const AHORA = new Date('2026-11-15T15:00:00Z');

/** rng determinista que recorre una secuencia. */
const secuencia = (valores: number[]) => {
  let i = 0;
  return () => valores[i++ % valores.length] as number;
};

describe('permisos (tabla de docs/roles.md)', () => {
  it.each([
    ['ver productos', puedeVerProductos, true],
    ['editar productos', puedeEditarProductos, false],
    ['descontar stock', puedeDescontarStock, true],
    ['crear clientes', puedeCrearClientes, true],
    ['editar clientes', puedeEditarClientes, false],
    ['registrar venta', puedeRegistrarVenta, true],
    ['anular venta', puedeAnularVenta, false],
    ['ver ventas', puedeVerVentas, true],
    ['fiar por venta', puedeFiarPorVenta, true],
    ['registrar abono', puedeRegistrarAbono, true],
    ['fiar sin venta', puedeFiarSinVenta, false],
    ['marcar pagado', puedeMarcarPagado, false],
    ['borrar movimientos', puedeBorrarMovimientos, false],
    ['marcar recordatorio', puedeMarcarRecordatorio, true],
    ['usar caja', puedeUsarCaja, true],
    ['ver configuración', puedeVerConfig, true],
    ['editar configuración', puedeEditarConfig, false],
    ['gestionar equipo', puedeGestionarEquipo, false],
    ['ver reportes', puedeVerReportes, false],
  ])('%s: dueño sí, cajero %p', (_n, predicado, cajeroPuede) => {
    expect(predicado(dueno)).toBe(true);
    expect(predicado(cajero)).toBe(cajeroPuede);
  });

  it('el dueño puede todo; sin sesión no se puede nada', () => {
    for (const permiso of Object.keys(PERMISOS) as (keyof typeof PERMISOS)[]) {
      expect(puede(dueno, permiso)).toBe(true);
      expect(puede(null, permiso)).toBe(false);
      expect(puede(undefined, permiso)).toBe(false);
    }
  });

  it('exigirPermiso lanza SIN_PERMISO', () => {
    expect(() => exigirPermiso(dueno, 'anularVenta')).not.toThrow();
    expect(() => exigirPermiso(cajero, 'anularVenta')).toThrow(ErrorDominio);
    try {
      exigirPermiso(cajero, 'gestionarEquipo');
    } catch (e) {
      expect((e as ErrorDominio).codigo).toBe('SIN_PERMISO');
    }
  });
});

describe('código de invitación', () => {
  it('8 caracteres del alfabeto sin ambiguos', () => {
    expect(ALFABETO_CODIGO).toHaveLength(31);
    for (const ambiguo of ['0', 'O', '1', 'I', 'L']) expect(ALFABETO_CODIGO).not.toContain(ambiguo);
    const codigo = generarCodigoInvitacion(Math.random);
    expect(codigo).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  });

  it('usa el rng: extremos y valores fuera de rango no rompen', () => {
    expect(generarCodigoInvitacion(() => 0)).toBe('AAAAAAAA');
    expect(generarCodigoInvitacion(() => 0.999999)).toBe('99999999');
    expect(generarCodigoInvitacion(() => 1)).toBe('99999999');
    expect(generarCodigoInvitacion(() => -3)).toBe('AAAAAAAA');
    expect(generarCodigoInvitacion(secuencia([0, 1 / 31, 2 / 31]))).toBe('ABCABCAB');
  });

  it('se muestra como ABCD-EFGH y se normaliza lo que escribe el cajero', () => {
    expect(formatearCodigo('ABCDEFGH')).toBe('ABCD-EFGH');
    expect(formatearCodigo('abcd efgh')).toBe('ABCD-EFGH');
    expect(formatearCodigo('xx')).toBe('xx');
    expect(normalizarCodigo('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizarCodigo('  AbCd - EfGh ')).toBe('ABCDEFGH');
    expect(normalizarCodigo('ABCD-EFG')).toBeNull();
    expect(normalizarCodigo('ABCD-EFG0')).toBeNull();
    expect(normalizarCodigo('ABCD-EFGI')).toBeNull();
    expect(normalizarCodigo('ABCDEFGHJ')).toBeNull();
    expect(normalizarCodigo('')).toBeNull();
    expect(normalizarCodigo(null)).toBeNull();
    expect(normalizarCodigo(undefined)).toBeNull();
  });
});

describe('invitaciones', () => {
  const inv = (extra: Partial<Invitacion> = {}): Invitacion => ({
    ...crearInvitacion({ dueno: 'ana', nombreBodega: 'Bodega Ana', ahora: AHORA, rng: () => 0.5 }),
    ...extra,
  });

  it('crearInvitacion: cajero, sin usar, vence en menos de 7 días', () => {
    const i = inv();
    expect(i.rol).toBe('cajero');
    expect(i.usadaPor).toBeNull();
    expect(i.dueno).toBe('ana');
    expect(i.expira.getTime() - AHORA.getTime()).toBe(VIGENCIA_INVITACION_MS);
    expect(VIGENCIA_INVITACION_MS).toBeLessThan(VIGENCIA_MAXIMA_MS);
    expect(i.codigo).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  });

  it('recorta el nombre de la bodega y usa uno por defecto si está vacío', () => {
    const largo = crearInvitacion({
      dueno: 'a',
      nombreBodega: 'x'.repeat(200),
      ahora: AHORA,
      rng: Math.random,
    });
    expect(largo.nombreBodega).toHaveLength(120);
    const vacio = crearInvitacion({
      dueno: 'a',
      nombreBodega: '  ',
      ahora: AHORA,
      rng: Math.random,
    });
    expect(vacio.nombreBodega).toBe('Mi Bodega');
  });

  it('validación: no existe, propia, usada, vencida, vigencia inflada', () => {
    expect(problemaInvitacion(inv(), 'rosa', AHORA)).toBeNull();
    expect(problemaInvitacion(null, 'rosa', AHORA)).toBe('INVITACION_NO_EXISTE');
    expect(problemaInvitacion(inv({ rol: 'dueno' as 'cajero' }), 'rosa', AHORA)).toBe(
      'INVITACION_NO_EXISTE',
    );
    expect(problemaInvitacion(inv(), 'ana', AHORA)).toBe('INVITACION_PROPIA');
    expect(problemaInvitacion(inv({ usadaPor: 'beto' }), 'rosa', AHORA)).toBe('INVITACION_USADA');
    expect(problemaInvitacion(inv({ usadaPor: 'rosa' }), 'rosa', AHORA)).toBe('INVITACION_USADA');
    const despues = new Date(AHORA.getTime() + VIGENCIA_INVITACION_MS);
    expect(problemaInvitacion(inv(), 'rosa', despues)).toBe('INVITACION_VENCIDA');
    const inflada = inv({ expira: new Date(AHORA.getTime() + VIGENCIA_MAXIMA_MS + 1) });
    expect(problemaInvitacion(inflada, 'rosa', AHORA)).toBe('INVITACION_VENCIDA');
    // Sin `creada` (serverTimestamp pendiente) solo cuenta `expira`.
    expect(problemaInvitacion(inv({ creada: null }), 'rosa', AHORA)).toBeNull();
    expect(() => validarInvitacion(inv(), 'rosa', AHORA)).not.toThrow();
    expect(() => validarInvitacion(null, 'rosa', AHORA)).toThrow('No encontramos ese código');
  });

  it('cupos: máximo 3 cajeros activos', () => {
    expect(MAX_CAJEROS_ACTIVOS).toBe(3);
    expect(cuposCajeros([])).toBe(3);
    expect(cuposCajeros([{ activo: true }, { activo: false }])).toBe(2);
    expect(
      cuposCajeros([{ activo: true }, { activo: true }, { activo: true }, { activo: true }]),
    ).toBe(0);
  });

  it('mensaje de WhatsApp cálido, con el código formateado y sin emojis', () => {
    const m = mensajeInvitacion({ nombreBodega: 'Bodega Lucho', codigo: 'ABCDEFGH' });
    expect(m).toBe(
      'Hola, te invito a vender en Bodega Lucho con Bodegón. Descarga la app y usa el código ' +
        'ABCD-EFGH. El código vale por 7 días. ¡Te esperamos!',
    );
    expect(m).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(mensajeInvitacion({ nombreBodega: 'Mi Bodega', codigo: 'ABCDEFGH' })).toContain(
      'vender en mi bodega',
    );
    expect(mensajeInvitacion({ nombreBodega: null, codigo: 'ABCDEFGH' })).toContain('mi bodega');
  });
});

describe('resolverSesion', () => {
  const cuenta: Cuenta = { uid: 'rosa', bodega: 'ana', rol: 'cajero' };
  const miembro: Miembro = {
    uid: 'rosa',
    rol: 'cajero',
    nombre: 'Rosa Q.',
    email: 'rosa@x.pe',
    activo: true,
    desde: AHORA,
    invitacion: 'ABCDEFGH',
  };

  it('sin cuenta ⇒ dueño de su propia ruta (como hoy)', () => {
    expect(resolverSesion('ana', 'Ana', null, null)).toEqual({
      uid: 'ana',
      bodega: 'ana',
      rol: 'dueno',
      nombre: 'Ana',
    });
  });

  it('con cuenta y miembro activo ⇒ cajero en la bodega del dueño', () => {
    expect(resolverSesion('rosa', 'rosa@x.pe', cuenta, miembro)).toEqual({
      uid: 'rosa',
      bodega: 'ana',
      rol: 'cajero',
      nombre: 'Rosa Q.',
    });
    expect(resolverSesion('rosa', 'Rosa', cuenta, { ...miembro, nombre: '' })?.nombre).toBe('Rosa');
  });

  it('desactivado, quitado o miembro de otro uid ⇒ sin acceso', () => {
    expect(resolverSesion('rosa', 'Rosa', cuenta, { ...miembro, activo: false })).toBeNull();
    expect(resolverSesion('rosa', 'Rosa', cuenta, null)).toBeNull();
    expect(resolverSesion('rosa', 'Rosa', cuenta, { ...miembro, uid: 'otro' })).toBeNull();
  });
});

describe('autoría', () => {
  it('nombres de campo fijos', () => {
    expect(CAMPOS_AUTORIA).toEqual({
      venta: { uid: 'vendidoPor', nombre: 'vendidoPorNombre' },
      movimientoFiado: { uid: 'registradoPor', nombre: 'registradoPorNombre' },
      aperturaCaja: { uid: 'abiertaPor', nombre: 'abiertaPorNombre' },
      cierreCaja: { uid: 'cerradaPor', nombre: 'cerradaPorNombre' },
      movimientoCaja: { uid: 'registradoPor', nombre: 'registradoPorNombre' },
    });
  });

  it('sella cada tipo de documento sin perder sus datos', () => {
    expect(sellarVenta({ total: 5 }, cajero)).toEqual({
      total: 5,
      vendidoPor: 'rosa',
      vendidoPorNombre: 'Rosa',
    });
    expect(sellarMovimientoFiado({ monto: -2 }, cajero)).toMatchObject({
      registradoPor: 'rosa',
      registradoPorNombre: 'Rosa',
    });
    expect(sellarAperturaCaja({ estado: 'abierta' }, cajero)).toMatchObject({
      abiertaPor: 'rosa',
      abiertaPorNombre: 'Rosa',
    });
    expect(sellarCierreCaja({ estado: 'cerrada' }, dueno)).toMatchObject({
      cerradaPor: 'ana',
      cerradaPorNombre: 'Ana',
    });
    expect(sellarMovimientoCaja({ tipo: 'egreso' }, cajero)).toMatchObject({
      registradoPor: 'rosa',
    });
  });

  it('sin sesión (versión vieja / dueño) deja el documento igual', () => {
    const datos = { total: 1 };
    expect(sellarVenta(datos)).toBe(datos);
    expect(sellarAutoria('venta', datos, null)).toBe(datos);
  });

  it('nombre del autor: recortado a 60 y nunca vacío', () => {
    expect(nombreAutor('  Rosa  ', 'cajero')).toBe('Rosa');
    expect(nombreAutor('x'.repeat(80), 'cajero')).toHaveLength(60);
    expect(nombreAutor('', 'cajero')).toBe('Cajero');
    expect(nombreAutor(null, 'dueno')).toBe('Dueño');
    expect(sellarVenta({}, { ...cajero, nombre: ' ' })).toMatchObject({
      vendidoPorNombre: 'Cajero',
    });
  });

  it('leerAutoria es tolerante con documentos viejos', () => {
    expect(leerAutoria('venta', { vendidoPor: 'rosa', vendidoPorNombre: ' Rosa ' })).toEqual({
      uid: 'rosa',
      nombre: 'Rosa',
    });
    expect(leerAutoria('venta', { vendidoPor: 'rosa' })).toEqual({ uid: 'rosa', nombre: '' });
    expect(leerAutoria('venta', { total: 1 })).toBeUndefined();
    expect(leerAutoria('venta', { vendidoPor: 7 })).toBeUndefined();
    expect(leerAutoria('venta', null)).toBeUndefined();
    expect(leerAutoria('cierreCaja', { cerradaPor: 'ana', cerradaPorNombre: 3 })).toEqual({
      uid: 'ana',
      nombre: '',
    });
  });
});

/** Repositorio en memoria con las mismas restricciones que las reglas. */
function repoMemoria() {
  const invitaciones = new Map<string, Invitacion>();
  const miembros = new Map<string, Miembro>(); // clave `${dueno}/${uid}`
  const cuentas = new Map<string, Cuenta>();
  const repo: RepositorioEquipo & { fallarCrear: number } = {
    fallarCrear: 0,
    async crearInvitacion(i) {
      if (repo.fallarCrear > 0) {
        repo.fallarCrear--;
        throw new Error('red');
      }
      invitaciones.set(i.codigo, i);
    },
    leerInvitacion: async (c) => invitaciones.get(c) ?? null,
    observarInvitaciones: (dueno, onDatos) => {
      onDatos([...invitaciones.values()].filter((i) => i.dueno === dueno));
      return () => {};
    },
    borrarInvitacion: async (c) => void invitaciones.delete(c),
    observarMiembros: (dueno, onDatos) => {
      onDatos([...miembros.entries()].filter(([k]) => k.startsWith(`${dueno}/`)).map(([, m]) => m));
      return () => {};
    },
    leerMiembro: async (dueno, uid) => miembros.get(`${dueno}/${uid}`) ?? null,
    async actualizarMiembro(dueno, uid, cambios) {
      const m = miembros.get(`${dueno}/${uid}`);
      if (m) miembros.set(`${dueno}/${uid}`, { ...m, ...cambios });
    },
    quitarMiembro: async (dueno, uid) => void miembros.delete(`${dueno}/${uid}`),
    leerCuenta: async (uid) => cuentas.get(uid) ?? null,
    async aceptarInvitacion(a) {
      const inv = invitaciones.get(a.codigo);
      if (!inv || inv.usadaPor) throw new Error('permission-denied');
      if (a.crearCuenta && cuentas.has(a.miembro.uid)) throw new Error('permission-denied');
      invitaciones.set(a.codigo, { ...inv, usadaPor: a.miembro.uid });
      miembros.set(`${a.dueno}/${a.miembro.uid}`, { ...a.miembro, desde: AHORA });
      if (a.crearCuenta)
        cuentas.set(a.miembro.uid, { uid: a.miembro.uid, bodega: a.dueno, rol: 'cajero' });
    },
  };
  return { repo, invitaciones, miembros, cuentas };
}

describe('casos de uso del equipo', () => {
  it('flujo completo: invitar, aceptar, desactivar y quitar', async () => {
    const { repo, miembros, cuentas } = repoMemoria();
    const { invitacion, mensaje } = await invitarCajero(repo, {
      sesion: dueno,
      nombreBodega: 'Bodega Ana',
      miembros: [],
      ahora: AHORA,
      rng: Math.random,
    });
    expect(mensaje).toContain(formatearCodigo(invitacion.codigo));

    const codigoEscrito = formatearCodigo(invitacion.codigo).toLowerCase();
    const sesion = await aceptarInvitacion(repo, {
      codigo: codigoEscrito,
      uid: 'rosa',
      nombre: 'Rosa',
      email: ' rosa@x.pe ',
      ahora: AHORA,
    });
    expect(sesion).toEqual({ uid: 'rosa', bodega: 'ana', rol: 'cajero', nombre: 'Rosa' });
    expect(miembros.get('ana/rosa')).toMatchObject({
      activo: true,
      email: 'rosa@x.pe',
      invitacion: invitacion.codigo,
    });
    expect(cuentas.get('rosa')).toEqual({ uid: 'rosa', bodega: 'ana', rol: 'cajero' });

    // Segundo uso del mismo código
    await expect(
      aceptarInvitacion(repo, {
        codigo: invitacion.codigo,
        uid: 'beto',
        nombre: 'B',
        email: null,
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ codigo: 'INVITACION_USADA' });

    await cambiarActivoCajero(repo, dueno, 'rosa', false);
    expect(miembros.get('ana/rosa')?.activo).toBe(false);
    await quitarCajero(repo, dueno, 'rosa');
    expect(miembros.has('ana/rosa')).toBe(false);
  });

  it('el cajero que vuelve a la misma bodega no reescribe su cuenta', async () => {
    const { repo, cuentas, invitaciones } = repoMemoria();
    cuentas.set('rosa', { uid: 'rosa', bodega: 'ana', rol: 'cajero' });
    const i = crearInvitacion({ dueno: 'ana', nombreBodega: 'B', ahora: AHORA, rng: () => 0.1 });
    invitaciones.set(i.codigo, i);
    const espia = jest.spyOn(repo, 'aceptarInvitacion');
    await aceptarInvitacion(repo, {
      codigo: i.codigo,
      uid: 'rosa',
      nombre: '',
      email: null,
      ahora: AHORA,
    });
    expect(espia.mock.calls[0]?.[0]).toMatchObject({
      crearCuenta: false,
      miembro: { nombre: 'Cajero', email: '' },
    });
  });

  it('rechaza código mal escrito, inexistente, vencido y cuenta de otra bodega', async () => {
    const { repo, cuentas, invitaciones } = repoMemoria();
    const base = { uid: 'rosa', nombre: 'Rosa', email: null, ahora: AHORA };
    await expect(aceptarInvitacion(repo, { ...base, codigo: 'hola' })).rejects.toMatchObject({
      codigo: 'CODIGO_INVALIDO',
    });
    await expect(aceptarInvitacion(repo, { ...base, codigo: 'ABCD-EFGH' })).rejects.toMatchObject({
      codigo: 'INVITACION_NO_EXISTE',
    });
    const i = crearInvitacion({ dueno: 'ana', nombreBodega: 'B', ahora: AHORA, rng: () => 0.2 });
    invitaciones.set(i.codigo, i);
    await expect(
      aceptarInvitacion(repo, {
        ...base,
        codigo: i.codigo,
        ahora: new Date(AHORA.getTime() + VIGENCIA_MAXIMA_MS),
      }),
    ).rejects.toMatchObject({ codigo: 'INVITACION_VENCIDA' });
    await expect(
      aceptarInvitacion(repo, { ...base, uid: 'ana', codigo: i.codigo }),
    ).rejects.toMatchObject({
      codigo: 'INVITACION_PROPIA',
    });
    cuentas.set('rosa', { uid: 'rosa', bodega: 'beto', rol: 'cajero' });
    await expect(aceptarInvitacion(repo, { ...base, codigo: i.codigo })).rejects.toMatchObject({
      codigo: 'CUENTA_DE_OTRA_BODEGA',
    });
  });

  it('invitar: solo el dueño, máximo 3 activos, reintenta si el código choca o falla', async () => {
    const { repo, invitaciones } = repoMemoria();
    const datos = { nombreBodega: 'B', miembros: [], ahora: AHORA };
    await expect(
      invitarCajero(repo, { ...datos, sesion: cajero, rng: Math.random }),
    ).rejects.toMatchObject({ codigo: 'SIN_PERMISO' });
    await expect(
      invitarCajero(repo, {
        ...datos,
        sesion: dueno,
        miembros: [{ activo: true }, { activo: true }, { activo: true }],
        rng: Math.random,
      }),
    ).rejects.toMatchObject({ codigo: 'LIMITE_CAJEROS' });

    // Primer código (AAAAAAAA) ya existe: se genera otro.
    const ocupado = crearInvitacion({ dueno: 'x', nombreBodega: 'X', ahora: AHORA, rng: () => 0 });
    invitaciones.set(ocupado.codigo, ocupado);
    const rng = secuencia([0, 0, 0, 0, 0, 0, 0, 0, 0.5]);
    const { invitacion } = await invitarCajero(repo, { ...datos, sesion: dueno, rng });
    expect(invitacion.codigo).not.toBe('AAAAAAAA');

    // Falla de escritura transitoria: reintenta.
    repo.fallarCrear = 1;
    await expect(
      invitarCajero(repo, { ...datos, sesion: dueno, rng: Math.random }),
    ).resolves.toBeDefined();
    // Falla siempre: propaga el error.
    repo.fallarCrear = 5;
    await expect(
      invitarCajero(repo, { ...datos, sesion: dueno, rng: Math.random }),
    ).rejects.toThrow('red');
    // Todos los códigos chocan: error claro.
    await expect(invitarCajero(repo, { ...datos, sesion: dueno, rng: () => 0 })).rejects.toThrow(
      'código de invitación libre',
    );
  });

  it('desactivar y quitar exigen ser dueño', async () => {
    const { repo } = repoMemoria();
    await expect(cambiarActivoCajero(repo, cajero, 'x', false)).rejects.toMatchObject({
      codigo: 'SIN_PERMISO',
    });
    await expect(quitarCajero(repo, cajero, 'x')).rejects.toMatchObject({ codigo: 'SIN_PERMISO' });
  });
});
