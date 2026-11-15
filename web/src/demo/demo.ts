/**
 * MODO DEMO — solo desarrollo (`/?demo=1`). Datos de ejemplo en memoria para revisar las
 * pantallas sin cuenta ni Firestore. main.ts lo importa dentro de `import.meta.env.DEV`, así
 * que no existe en el build de producción (se verifica buscando DEMO_BODEGON en dist/).
 */
import {
  armarAnulacion,
  hoyLima,
  rangoDiasLima,
  type Cliente,
  type MovimientoFiado,
  type Producto,
  type RangoFechas,
  type Venta,
} from '@bodegon/core';

import { actualizarDatos, usarFuente, type FuenteDatos } from '../datos';
import { $ } from '../dom';
import { entrarApp } from '../shell';
import { fijarTema } from '../theme';

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

let movimientos: MovimientoFiado[] = [
  { id: 'm1', clienteId: 'c2', monto: 38.5, descripcion: 'Arroz (x3), Aceite (x1), Atún (x2)', fecha: enLima(23, 19), pagado: false },
  { id: 'm2', clienteId: 'c2', monto: -10, descripcion: 'Abono', fecha: enLima(12, 10), pagado: false, metodoPago: 'Efectivo' },
  { id: 'm3', clienteId: 'c2', monto: 12.4, descripcion: 'Leche (x2), Pan (x8)', fecha: enLima(4, 8), pagado: false },
  { id: 'm4', clienteId: 'c1', monto: 24.6, descripcion: 'Azúcar (x2), Fideo (x3), Huevos (x10)', fecha: enLima(9, 17), pagado: false },
  { id: 'm5', clienteId: 'c1', monto: -8, descripcion: 'Pago de: Azúcar, Fideo, Huevos', fecha: enLima(2, 12), pagado: false, metodoPago: 'Yape/Plin' },
  { id: 'm6', clienteId: 'c3', monto: 15.0, descripcion: 'Pan y leche de la semana', fecha: enLima(18, 7), pagado: false },
  { id: 'm7', clienteId: 'c4', monto: 9.6, descripcion: 'Coca-Cola (x1), Galleta (x2)', fecha: enLima(1, 20), pagado: false },
  { id: 'm8', clienteId: 'c5', monto: 20, descripcion: 'Detergente y papel', fecha: enLima(30, 11), pagado: false },
  { id: 'm9', clienteId: 'c5', monto: -20, descripcion: 'Pago completo', fecha: enLima(6, 11), pagado: false, metodoPago: 'Efectivo' },
  { id: 'm10', clienteId: 'c6', monto: 31.8, descripcion: 'Avena, mantequilla y yogurt', fecha: enLima(0, 9), pagado: false },
  { id: 'm11', clienteId: 'c4', monto: -15, descripcion: 'Abono', fecha: enLima(3, 16), pagado: false, metodoPago: 'Efectivo' },
];

/** Ventas de los últimos 35 días (hoy solo hasta la hora actual). */
function generarVentas(): Venta[] {
  const lista: Venta[] = [];
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
      });
    }
  }
  return lista;
}

let ventas: Venta[] = generarVentas();
let contador = 1000;
const nuevoId = (p: string): string => `${p}${++contador}`;

const oyentesRango = new Set<() => void>();
const emitir = (): void => {
  actualizarDatos({ productos: [...productos], clientes: [...clientes], movimientos: [...movimientos] });
  for (const fn of oyentesRango) fn();
};

const esperar = (ms = 350): Promise<void> => new Promise((r) => setTimeout(r, ms));

const fuenteDemo: FuenteDatos = {
  nuevoIdVenta: () => nuevoId('v'),
  nuevoIdCargo: () => nuevoId('m'),
  async cobrar(op) {
    await esperar();
    ventas = [...ventas, { id: op.ventaId, ...op.venta, fecha: new Date() }];
    if (op.cargo && op.cargoId) movimientos = [...movimientos, { id: op.cargoId, ...op.cargo, fecha: new Date() }];
    productos = productos.map((p) => {
      const d = op.deltasStock.find((x) => x.productoId === p.id);
      return d && p.stock !== null ? { ...p, stock: p.stock + d.delta } : p;
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
    movimientos = [...movimientos, { id: nuevoId('m'), ...m, fecha: new Date() }];
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
  async cerrarSesion() {
    location.href = '/';
  },
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
  usarFuente(fuenteDemo);
  actualizarDatos({ email: 'demo@bodegon.pe', nombreBodega: 'Bodega Doña Rosa' });
  entrarApp();
  // Datos "llegando" después, como con Firestore.
  setTimeout(emitir, 450);
}
