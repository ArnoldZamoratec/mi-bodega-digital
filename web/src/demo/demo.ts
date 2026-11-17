/**
 * MODO DEMO — solo desarrollo (`/?demo=1`). Datos de ejemplo en memoria para revisar las
 * pantallas sin cuenta ni Firestore. main.ts lo importa dentro de `import.meta.env.DEV`, así
 * que no existe en el build de producción (se verifica buscando DEMO_BODEGON en dist/).
 */
import {
  armarAnulacion,
  hoyLima,
  leerAutoria,
  rangoDiasLima,
  sellarAperturaCaja,
  sellarCierreCaja,
  sellarMovimientoCaja,
  sellarMovimientoFiado,
  sellarVenta,
  sesionDueno,
  type Autoria,
  type Cliente,
  type Invitacion,
  type Miembro,
  type Producto,
  type RangoFechas,
  type Sesion,
} from '@bodegon/core';

import { actualizarDatos, usarFuente, type FuenteDatos } from '../datos';
import { $, avisar } from '../dom';
import { usarRepoEquipo, type RepositorioEquipoWeb } from '../equipo';
import { debeDescontarStock } from '../logic/equipo';
import type { MovimientoWeb, VentaWeb } from '../mappers';
import type { CajaWeb, MovimientoCajaWeb } from '../mappersCaja';
import { fijarAccionesCuenta, fijarSesion } from '../sesion';
import { entrarApp } from '../shell';
import { fijarTema } from '../theme';
import { abrirUnirme, mostrarSinAcceso } from '../views/acceso';

export const MARCA_DEMO = 'DEMO_BODEGON';

// Generador determinista (mismas pantallas en cada carga).
let semilla = 20261115;
const azar = (): number => {
  semilla = (semilla * 1103515245 + 12345) % 2147483648;
  return semilla / 2147483648;
};
const entre = (a: number, b: number): number => a + Math.floor(azar() * (b - a + 1));

const MS_DIA = 86_400_000;
const ahora = Date.now();

// Equipo (D-33): el dueño y una cajera. `?rol=cajero` abre la demo como Rosa (cajera).
const DUENO = 'dueno-demo';
const ROSA: Autoria = { uid: 'cajero-rosa', nombre: 'Rosa' };
const sesionDemo: Sesion =
  new URLSearchParams(location.search).get('rol') === 'cajero'
    ? { uid: ROSA.uid, bodega: DUENO, rol: 'cajero', nombre: ROSA.nombre }
    : sesionDueno(DUENO, 'Lucho');

/** La demo guarda lo mismo que Firestore: el documento sellado y su autoría leída de vuelta. */
const autoriaDe = (tipo: Parameters<typeof leerAutoria>[0], sellado: Record<string, unknown>): { autor?: Autoria } => {
  const a = leerAutoria(tipo, sellado);
  return a ? { autor: a } : {};
};

/** Instante en Lima: `dias` atrás, a la hora indicada. */
function enLima(dias: number, hora: number, minuto = 0): Date {
  const clave = hoyLima(new Date(ahora - dias * MS_DIA));
  const inicio = rangoDiasLima(clave, clave).inicio.getTime();
  return new Date(inicio + (hora * 60 + minuto) * 60_000);
}

let productos: Producto[] = [
  ['Arroz Costeño 1 kg', 4.6, 24],
  ['Azúcar rubia 1 kg', 3.9, 3],
  ['Leche Gloria azul 400 g', 4.2, 30],
  ['Aceite Primor 900 ml', 9.5, 2],
  ['Fideo Don Vittorio 500 g', 3.2, 18],
  ['Atún Florida 170 g', 6.5, 12],
  ['Huevos (unidad)', 0.6, 60],
  ['Pan francés', 0.3, null],
  ['Inca Kola 500 ml', 2.5, 0],
  ['Coca-Cola 1.5 L', 6.8, 9],
  ['Galleta Soda Field', 1.2, 40],
  ['Papel Higiénico Elite x4', 5.9, 7],
  ['Detergente Bolívar 500 g', 7.4, 5],
  ['Sal de Maras 1 kg', 2.2, 15],
  ['Avena 3 Ositos 900 g', 8.9, 6],
  ['Mantequilla Laive 200 g', 7.2, 4],
  ['Yogurt Gloria 1 L', 6.9, 10],
  ['Chocolate Sublime', 2.0, 35],
].map(([nombre, precio, stock], i) => ({
  id: `p${i + 1}`,
  nombre: nombre as string,
  precio: precio as number,
  stock: stock as number | null,
}));

let clientes: Cliente[] = [
  { id: 'c1', nombre: 'Rosa Quispe', telefono: '987 654 321', ultimoRecordatorio: enLima(1, 18) },
  { id: 'c2', nombre: 'Don Julio Mamani', telefono: '956 112 334' },
  { id: 'c3', nombre: 'Carmen Huamán', telefono: '' },
  { id: 'c4', nombre: 'Luis Torres', telefono: '912 445 778' },
  { id: 'c5', nombre: 'Sra. Elena Paredes', telefono: '998 003 112' },
  { id: 'c6', nombre: 'Miguel Ccori', telefono: '944 221 909' },
];

let movimientos: MovimientoWeb[] = [
  { id: 'm1', clienteId: 'c2', monto: 38.5, descripcion: 'Arroz (x3), Aceite (x1), Atún (x2)', fecha: enLima(23, 19), pagado: false },
  { id: 'm2', clienteId: 'c2', monto: -10, descripcion: 'Abono', fecha: enLima(12, 10), pagado: false, metodoPago: 'Efectivo' },
  { id: 'm3', clienteId: 'c2', monto: 12.4, descripcion: 'Leche (x2), Pan (x8)', fecha: enLima(4, 8), pagado: false },
  { id: 'm4', clienteId: 'c1', monto: 24.6, descripcion: 'Azúcar (x2), Fideo (x3), Huevos (x10)', fecha: enLima(9, 17), pagado: false },
  { id: 'm5', clienteId: 'c1', monto: -8, descripcion: 'Pago de: Azúcar, Fideo, Huevos', fecha: enLima(2, 12), pagado: false, metodoPago: 'Yape/Plin' },
  { id: 'm6', clienteId: 'c3', monto: 15.0, descripcion: 'Pan y leche de la semana', fecha: enLima(18, 7), pagado: false },
  { id: 'm7', clienteId: 'c4', monto: 9.6, descripcion: 'Coca-Cola (x1), Galleta (x2)', fecha: enLima(1, 20), pagado: false },
  { id: 'm8', clienteId: 'c5', monto: 20, descripcion: 'Detergente y papel', fecha: enLima(30, 11), pagado: false },
  { id: 'm9', clienteId: 'c5', monto: -20, descripcion: 'Pago completo', fecha: enLima(6, 11), pagado: false, metodoPago: 'Efectivo' },
  { id: 'm10', clienteId: 'c6', monto: 31.8, descripcion: 'Avena, mantequilla y yogurt', fecha: enLima(0, 9), pagado: false, autor: ROSA },
  { id: 'm11', clienteId: 'c4', monto: -15, descripcion: 'Abono', fecha: enLima(3, 16), pagado: false, metodoPago: 'Efectivo' },
];

/** Ventas de los últimos 35 días (hoy solo hasta la hora actual). */
function generarVentas(): VentaWeb[] {
  const lista: VentaWeb[] = [];
  const horaActual = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/Lima' }).format(
      new Date(ahora),
    ),
  );
  for (let d = 35; d >= 0; d--) {
    const n = d === 0 ? Math.max(3, Math.min(14, horaActual - 6)) : d === 7 ? 11 : entre(8, 16);
    for (let k = 0; k < n; k++) {
      const hora = d === 0 ? entre(7, Math.max(7, horaActual - 1)) : entre(7, 21);
      const fecha = enLima(d, hora, entre(0, 59));
      if (fecha.getTime() > ahora) continue;
      const items = Array.from({ length: entre(1, 4) }, () => {
        const p = productos[entre(0, productos.length - 1)]!;
        return { id: p.id, nombre: p.nombre, precio: p.precio, cantidad: entre(1, 3) };
      });
      const total = Math.round(items.reduce((a, i) => a + i.precio * 100 * i.cantidad, 0)) / 100;
      const r = azar();
      const metodo = r < 0.55 ? 'Efectivo' : r < 0.9 ? 'Yape/Plin' : 'Fiado';
      lista.push({
        id: `v${d}-${k}`,
        items,
        total,
        metodoDePago: metodo,
        clienteId: metodo === 'Fiado' ? 'c6' : null,
        fecha,
        // Hoy, una de cada tres ventas la hizo Rosa (para ver "Vendió: Rosa").
        ...(d === 0 ? { autor: k % 3 === 0 ? ROSA : { uid: DUENO, nombre: 'Lucho' } } : {}),
      });
    }
  }
  return lista;
}

let ventas: VentaWeb[] = generarVentas();

// Caja (D-28): cierres de días anteriores (cuadra, sobrante, faltante leve y faltante) y una
// caja abierta hoy desde las 8:05. `?caja=cerrada` muestra la pantalla sin caja abierta.
const cierreDemo = (dias: number, abre: [number, number], cierra: [number, number], inicial: number, esperado: number, contado: number): CajaWeb => ({
  id: `caja-${dias}`,
  estado: 'cerrada',
  apertura: { monto: inicial, fecha: enLima(dias, ...abre), creadaEn: enLima(dias, ...abre) },
  cierre: {
    esperado,
    contado,
    diferencia: Math.round((contado - esperado) * 100) / 100,
    fecha: enLima(dias, ...cierra),
    creadaEn: enLima(dias, ...cierra),
  },
});
let cajas: CajaWeb[] = [
  { ...cierreDemo(1, [7, 50], [21, 30], 50, 412.8, 412.8), cerradaPor: ROSA },
  cierreDemo(2, [8, 0], [21, 10], 50, 386.4, 388.4),
  cierreDemo(3, [7, 45], [21, 5], 100, 455.1, 454.6),
  cierreDemo(4, [8, 10], [20, 50], 50, 398.7, 390.7),
];
let movimientosCaja: MovimientoCajaWeb[] = [];
if (new URLSearchParams(location.search).get('caja') !== 'cerrada' && enLima(0, 8, 5).getTime() < ahora) {
  cajas = [{ id: 'caja-hoy', estado: 'abierta', apertura: { monto: 50, fecha: enLima(0, 8, 5), creadaEn: enLima(0, 8, 5) } }, ...cajas];
  movimientosCaja = [
    { id: 'mc1', cajaId: 'caja-hoy', tipo: 'egreso', monto: 18, motivo: 'Pago al proveedor de pan', fecha: enLima(0, 8, 40) },
    { id: 'mc2', cajaId: 'caja-hoy', tipo: 'ingreso', monto: 20, motivo: 'Sencillo del banco', fecha: enLima(0, 9, 15), autor: ROSA },
  ].filter((m) => (m.fecha?.getTime() ?? 0) < ahora) as MovimientoCajaWeb[];
}
const oyentesMovsCaja = new Set<() => void>();
let contador = 1000;
const nuevoId = (p: string): string => `${p}${++contador}`;

const oyentesRango = new Set<() => void>();
const emitir = (): void => {
  actualizarDatos({ productos: [...productos], clientes: [...clientes], movimientos: [...movimientos], cajas: [...cajas] });
  for (const fn of oyentesRango) fn();
  for (const fn of oyentesMovsCaja) fn();
};

const esperar = (ms = 350): Promise<void> => new Promise((r) => setTimeout(r, ms));

const fuenteDemo: FuenteDatos = {
  nuevoIdVenta: () => nuevoId('v'),
  nuevoIdCargo: () => nuevoId('m'),
  async cobrar(op) {
    await esperar();
    ventas = [...ventas, { id: op.ventaId, ...op.venta, fecha: new Date(), ...autoriaDe('venta', sellarVenta({}, sesionDemo)) }];
    if (op.cargo && op.cargoId) {
      const autor = autoriaDe('movimientoFiado', sellarMovimientoFiado({}, sesionDemo));
      movimientos = [...movimientos, { id: op.cargoId, ...op.cargo, fecha: new Date(), ...autor }];
    }
    productos = productos.map((p) => {
      const d = op.deltasStock.find((x) => x.productoId === p.id);
      return d && p.stock !== null && debeDescontarStock(p.stock, d.delta, sesionDemo) ? { ...p, stock: p.stock + d.delta } : p;
    });
    emitir();
  },
  async deshacerVenta(op) {
    await esperar();
    const a = armarAnulacion({ id: op.ventaId, ...op.venta, fecha: new Date(op.creadaEn) }, 'Deshecha al momento', Date.now());
    if (ventas.some((v) => v.id === a.ventaId)) return;
    ventas = [...ventas, { id: a.ventaId, ...a.venta, fecha: new Date() }];
    productos = productos.map((p) => {
      const d = a.deltasStock.find((x) => x.productoId === p.id);
      return d && p.stock !== null ? { ...p, stock: p.stock + d.delta } : p;
    });
    if (op.cargoId) movimientos = movimientos.filter((m) => m.id !== op.cargoId);
    emitir();
  },
  async guardarProducto(id, p) {
    await esperar();
    productos = id ? productos.map((x) => (x.id === id ? { ...x, ...p } : x)) : [...productos, { id: nuevoId('p'), ...p }];
    productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    emitir();
  },
  async eliminarProducto(id) {
    productos = productos.filter((p) => p.id !== id);
    emitir();
  },
  async ajustarStock(id, delta) {
    productos = productos.map((p) => (p.id === id && p.stock !== null ? { ...p, stock: p.stock + delta } : p));
    emitir();
  },
  async guardarCliente(id, c) {
    await esperar();
    const nuevo = id ?? nuevoId('c');
    clientes = id ? clientes.map((x) => (x.id === id ? { ...x, ...c } : x)) : [...clientes, { id: nuevo, ...c }];
    clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
    emitir();
    return nuevo;
  },
  async registrarMovimiento(m) {
    await esperar();
    const autor = autoriaDe('movimientoFiado', sellarMovimientoFiado({}, sesionDemo));
    movimientos = [...movimientos, { id: nuevoId('m'), ...m, fecha: new Date(), ...autor }];
    emitir();
  },
  async eliminarMovimiento(id) {
    movimientos = movimientos.filter((m) => m.id !== id);
    emitir();
  },
  async marcarRecordatorio(clienteId) {
    clientes = clientes.map((c) => (c.id === clienteId ? { ...c, ultimoRecordatorio: new Date() } : c));
    emitir();
  },
  observarRango(_rango: RangoFechas, onDatos) {
    // El core filtra por fecha efectiva; aquí se entregan todas las ventas en memoria.
    const fn = () => onDatos([...ventas], [...movimientos]);
    oyentesRango.add(fn);
    setTimeout(fn, 400); // deja ver los esqueletos de carga
    return () => oyentesRango.delete(fn);
  },
  nuevoIdCaja: () => nuevoId('caja'),
  nuevoIdMovimientoCaja: () => nuevoId('mc'),
  async guardarCaja(op) {
    await esperar();
    // Misma idempotencia que la transacción real: lo que ya existe no se reescribe.
    const ahoraOp = new Date();
    const creadaEn = new Date(op.creadaEn);
    if (op.tipo === 'abrir') {
      if (!cajas.some((c) => c.id === op.cajaId)) {
        const a = leerAutoria('aperturaCaja', sellarAperturaCaja({}, sesionDemo));
        cajas = [{ id: op.cajaId, estado: 'abierta', apertura: { monto: op.monto, fecha: ahoraOp, creadaEn }, ...(a ? { abiertaPor: a } : {}) }, ...cajas];
      }
    } else if (op.tipo === 'movimiento') {
      if (!movimientosCaja.some((m) => m.id === op.id)) {
        const autor = autoriaDe('movimientoCaja', sellarMovimientoCaja({}, sesionDemo));
        movimientosCaja = [...movimientosCaja, { id: op.id, cajaId: op.cajaId, ...op.movimiento, fecha: ahoraOp, creadaEn, ...autor }];
      }
    } else {
      const a = leerAutoria('cierreCaja', sellarCierreCaja({}, sesionDemo));
      cajas = cajas.map((c) =>
        c.id === op.cajaId && c.estado === 'abierta'
          ? { ...c, estado: 'cerrada', cierre: { ...op.cierre, fecha: ahoraOp, creadaEn }, ...(a ? { cerradaPor: a } : {}) }
          : c,
      );
    }
    emitir();
  },
  observarMovimientosCaja(cajaId, onDatos) {
    const fn = () => onDatos(movimientosCaja.filter((m) => m.cajaId === cajaId));
    oyentesMovsCaja.add(fn);
    setTimeout(fn, 300);
    return () => oyentesMovsCaja.delete(fn);
  },
  async cerrarSesion() {
    location.href = '/';
  },
};

// ---------- Equipo (D-33) en memoria ----------
let miembrosDemo: Miembro[] = [
  { uid: ROSA.uid, rol: 'cajero', nombre: 'Rosa', email: 'rosa@gmail.com', activo: true, desde: enLima(20, 9), invitacion: 'RQSA2345' },
  { uid: 'cajero-pedro', rol: 'cajero', nombre: 'Pedro', email: '', activo: false, desde: enLima(40, 9), invitacion: 'PEDR2345' },
];
let invitacionesDemo: Invitacion[] = [
  {
    codigo: 'KPMX7QRT',
    dueno: DUENO,
    rol: 'cajero',
    creada: enLima(1, 10),
    expira: new Date(enLima(1, 10).getTime() + 6 * MS_DIA),
    usadaPor: null,
    nombreBodega: 'Bodega Doña Rosa',
  },
];
const oyentesEquipo = new Set<() => void>();
const emitirEquipo = (): void => oyentesEquipo.forEach((fn) => fn());
const escuchar = (fn: () => void): (() => void) => {
  oyentesEquipo.add(fn);
  setTimeout(fn, 250);
  return () => oyentesEquipo.delete(fn);
};

const repoDemo: RepositorioEquipoWeb = {
  async crearInvitacion(inv) {
    await esperar();
    invitacionesDemo = [...invitacionesDemo, inv];
    emitirEquipo();
  },
  async leerInvitacion(codigo) {
    return invitacionesDemo.find((i) => i.codigo === codigo) ?? null;
  },
  observarInvitaciones: (dueno, onDatos) => escuchar(() => onDatos(invitacionesDemo.filter((i) => i.dueno === dueno))),
  async borrarInvitacion(codigo) {
    invitacionesDemo = invitacionesDemo.filter((i) => i.codigo !== codigo);
    emitirEquipo();
  },
  observarMiembros: (_dueno, onDatos) => escuchar(() => onDatos([...miembrosDemo])),
  observarMiembro: (_dueno, uid, onDatos) => escuchar(() => onDatos(miembrosDemo.find((m) => m.uid === uid) ?? null)),
  async leerMiembro(_dueno, uid) {
    return miembrosDemo.find((m) => m.uid === uid) ?? null;
  },
  async actualizarMiembro(_dueno, uid, cambios) {
    await esperar(200);
    miembrosDemo = miembrosDemo.map((m) => (m.uid === uid ? { ...m, ...cambios } : m));
    emitirEquipo();
  },
  async quitarMiembro(_dueno, uid) {
    miembrosDemo = miembrosDemo.filter((m) => m.uid !== uid);
    emitirEquipo();
  },
  async leerCuenta() {
    return null;
  },
  async aceptarInvitacion(a) {
    await esperar();
    invitacionesDemo = invitacionesDemo.map((i) => (i.codigo === a.codigo ? { ...i, usadaPor: a.miembro.uid } : i));
    miembrosDemo = [...miembrosDemo, { ...a.miembro, desde: new Date() }];
    emitirEquipo();
  },
  async borrarCuenta() {},
};

export function iniciarDemo(): void {
  console.info(`${MARCA_DEMO}: datos de ejemplo en memoria (solo desarrollo).`);
  const p = new URLSearchParams(location.search);
  const tema = p.get('tema');
  if (tema === 'noche') fijarTema('oscuro');
  else if (tema === 'claro') fijarTema('claro');
  $('cargando')?.setAttribute('hidden', '');
  if (p.get('pantalla') === 'login') {
    void import('../views/login').then((m) => {
      m.pintarTicketLogin();
      const login = $('login');
      if (login) login.hidden = false;
    });
    return;
  }
  usarRepoEquipo(repoDemo);
  const usuario = { uid: 'usuario-demo', email: 'demo@bodegon.pe', displayName: null };
  fijarAccionesCuenta({
    unirmeConCodigo: () => abrirUnirme(usuario, () => avisar('Demo: aquí la web volvería a abrir la sesión como cajero.')),
  });
  // `?acceso=desactivado|quitado`: la pantalla que ve un cajero sin acceso.
  const acceso = p.get('acceso');
  if (acceso === 'desactivado' || acceso === 'quitado') {
    const nada = () => avisar('Demo: sin conexión real.');
    mostrarSinAcceso({ tipo: 'sin-acceso', motivo: acceso, bodega: DUENO, codigo: null }, 'Bodega Doña Rosa', {
      reintentar: nada,
      usarMiBodega: async () => nada(),
      tengoCodigo: () => abrirUnirme(usuario, nada),
      salir: () => {
        location.href = '/?demo=1';
      },
    });
    return;
  }
  fijarSesion(sesionDemo);
  usarFuente(fuenteDemo);
  actualizarDatos({ email: 'demo@bodegon.pe', nombreBodega: 'Bodega Doña Rosa' });
  entrarApp();
  // Datos "llegando" después, como con Firestore.
  setTimeout(emitir, 450);
}
