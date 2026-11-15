import type { Cliente, MovimientoFiado } from '../entities';
import {
  DIAS_PAUSA_RECORDATORIO,
  diasCalendario,
  enlaceRecordatorio,
  haceDias,
  listaCobranza,
  mensajeRecordatorio,
  numeroWhatsapp,
  rangoMes,
  recordadoHacePoco,
  recuperadoEnMes,
  totalPorCobrar,
} from '../rules/cobranza';
import { recordarPorWhatsapp } from '../usecases/cobranza';

const AHORA = new Date(2026, 10, 15, 18, 0); // 15/11/2026 18:00 local

const cliente = (id: string, nombre: string, telefono = '', extra: Partial<Cliente> = {}) => ({
  id,
  nombre,
  telefono,
  ...extra,
});

let n = 0;
const mov = (
  clienteId: string,
  monto: number,
  fecha: Date | null,
  extra: Partial<MovimientoFiado> = {},
): MovimientoFiado => ({
  id: `m${++n}`,
  clienteId,
  monto,
  descripcion: monto > 0 ? 'Cargo' : 'Pago',
  fecha,
  pagado: false,
  ...extra,
});

const dia = (d: number, h = 10) => new Date(2026, 10, d, h);

describe('WhatsApp', () => {
  it('acepta celulares peruanos con o sin +51 y espacios', () => {
    expect(numeroWhatsapp('987 654 321')).toBe('51987654321');
    expect(numeroWhatsapp('+51 987-654-321')).toBe('51987654321');
    expect(numeroWhatsapp('51987654321')).toBe('51987654321');
  });

  it('rechaza fijos, vacíos y números incompletos', () => {
    expect(numeroWhatsapp('')).toBeNull();
    expect(numeroWhatsapp('014567890')).toBeNull();
    expect(numeroWhatsapp('98765432')).toBeNull();
  });

  it('mensaje respetuoso: saluda por el nombre, dice el saldo y agradece; sin palabras duras', () => {
    const m = mensajeRecordatorio({ nombreCliente: 'Rosa Quispe', saldo: 12.5 });
    expect(m).toBe('Hola Rosa, te saluda tu bodega. Tu saldo pendiente es S/ 12.50. ¡Gracias!');
    expect(m).not.toMatch(/deuda|moros|urgente|debe/i);
  });

  it('firma con el nombre del negocio si se configuró (el genérico se lee "tu bodega")', () => {
    expect(
      mensajeRecordatorio({ nombreCliente: 'Rosa', saldo: 5, nombreNegocio: 'Bodega Doña Ana' }),
    ).toContain('te saluda Bodega Doña Ana.');
    expect(
      mensajeRecordatorio({ nombreCliente: 'Rosa', saldo: 5, nombreNegocio: 'Mi Bodega' }),
    ).toContain('te saluda tu bodega.');
  });

  it('arma el enlace wa.me con el texto codificado', () => {
    expect(enlaceRecordatorio('987654321', 'Hola Rosa, S/ 1.00 ¡Gracias!')).toBe(
      'https://wa.me/51987654321?text=Hola%20Rosa%2C%20S%2F%201.00%20%C2%A1Gracias!',
    );
    expect(enlaceRecordatorio('', 'x')).toBeNull();
  });
});

describe('fechas', () => {
  it('días de calendario: hoy 0, ayer 1, aunque pasen pocas horas', () => {
    expect(diasCalendario(dia(15, 8), AHORA)).toBe(0);
    expect(diasCalendario(new Date(2026, 10, 14, 23, 59), new Date(2026, 10, 15, 0, 1))).toBe(1);
    expect(diasCalendario(dia(1), AHORA)).toBe(14);
    expect(diasCalendario(dia(20), AHORA)).toBe(0); // nunca negativo
  });

  it('textos', () => {
    expect(haceDias(0)).toBe('hoy');
    expect(haceDias(1)).toBe('ayer');
    expect(haceDias(5)).toBe('hace 5 días');
  });

  it(`pausa de ${DIAS_PAUSA_RECORDATORIO} días entre recordatorios (horas reales)`, () => {
    expect(recordadoHacePoco(undefined, AHORA)).toBe(false);
    expect(recordadoHacePoco(new Date(Number.NaN), AHORA)).toBe(false);
    expect(recordadoHacePoco(new Date(2026, 10, 13, 18, 1), AHORA)).toBe(true);
    expect(recordadoHacePoco(new Date(2026, 10, 12, 18, 0), AHORA)).toBe(false);
    // Reloj adelantado: un recordatorio "futuro" también es reciente.
    expect(recordadoHacePoco(dia(16), AHORA)).toBe(true);
  });

  it('rango del mes calendario local', () => {
    const { inicio, fin } = rangoMes(AHORA);
    expect(inicio).toEqual(new Date(2026, 10, 1, 0, 0, 0, 0));
    expect(fin).toEqual(new Date(2026, 10, 30, 23, 59, 59, 999));
    expect(rangoMes(new Date(2026, 1, 10)).fin.getDate()).toBe(28);
  });
});

describe('listaCobranza', () => {
  it('solo clientes con saldo > 0, del cargo pendiente más antiguo al más nuevo', () => {
    const clientes = [
      cliente('a', 'Ana', '987654321'),
      cliente('b', 'Beto'),
      cliente('c', 'Carla', '912345678'),
      cliente('d', 'Dora'),
    ];
    const movs = [
      mov('a', 10, dia(10)),
      mov('b', 5, dia(2)),
      mov('c', 8, dia(5)),
      mov('d', 4, dia(1)),
      mov('d', -4, dia(3), { metodoPago: 'Efectivo' }), // Dora al día
    ];
    const filas = listaCobranza(clientes, movs, AHORA);
    expect(filas.map((f) => f.cliente.nombre)).toEqual(['Beto', 'Carla', 'Ana']);
    expect(filas[0]).toMatchObject({ saldo: 5, diasPendiente: 13, whatsapp: null });
    expect(filas[2]).toMatchObject({ whatsapp: '51987654321', diasDesdeRecordatorio: null });
  });

  it('el cargo más antiguo es el primero que los abonos aún no cubren (FIFO, D-14)', () => {
    const movs = [
      mov('a', 10, dia(1)),
      mov('a', 6, dia(8)),
      mov('a', -10, dia(9), { metodoPago: 'Efectivo' }), // cubre el del día 1
    ];
    const [fila] = listaCobranza([cliente('a', 'Ana')], movs, AHORA);
    expect(fila?.saldo).toBe(6);
    expect(fila?.desde).toEqual(dia(8));
    expect(fila?.diasPendiente).toBe(7);
  });

  it('usa la fecha efectiva (D-26): una venta fiada sin señal cuenta desde que se fió', () => {
    const movs = [mov('a', 3, dia(14, 9), { creadaEn: dia(12, 20) })];
    const [fila] = listaCobranza([cliente('a', 'Ana')], movs, AHORA);
    expect(fila?.desde).toEqual(dia(12, 20));
    expect(fila?.diasPendiente).toBe(3);
  });

  it('un cargo con fecha pendiente (serverTimestamp) cuenta como de hoy', () => {
    const [fila] = listaCobranza([cliente('a', 'Ana')], [mov('a', 3, null)], AHORA);
    expect(fila?.desde).toEqual(AHORA);
    expect(fila?.diasPendiente).toBe(0);
  });

  it('cargos heredados con pagado: true no cuentan; desempata por saldo y luego nombre', () => {
    const clientes = [cliente('a', 'Ana'), cliente('b', 'Beto'), cliente('c', 'Ceci')];
    const movs = [
      mov('a', 5, dia(1), { pagado: true }),
      mov('a', 2, dia(4)),
      mov('b', 9, dia(4)),
      mov('c', 2, dia(4)),
    ];
    const filas = listaCobranza(clientes, movs, AHORA);
    expect(filas.map((f) => f.cliente.nombre)).toEqual(['Beto', 'Ana', 'Ceci']);
    expect(filas[1]?.saldo).toBe(2);
  });

  it('último recordatorio y estado de pausa', () => {
    const clientes = [
      cliente('a', 'Ana', '987654321', { ultimoRecordatorio: new Date(2026, 10, 14, 9) }),
      cliente('b', 'Beto', '987654322', { ultimoRecordatorio: dia(1) }),
      cliente('c', 'Ceci', '987654323', { ultimoRecordatorio: new Date(Number.NaN) }),
    ];
    const movs = [mov('a', 1, dia(1)), mov('b', 1, dia(2)), mov('c', 1, dia(3))];
    const [ana, beto, ceci] = listaCobranza(clientes, movs, AHORA);
    expect(ana).toMatchObject({ diasDesdeRecordatorio: 1, recordadoHacePoco: true });
    expect(beto).toMatchObject({ diasDesdeRecordatorio: 14, recordadoHacePoco: false });
    expect(ceci).toMatchObject({ ultimoRecordatorio: null, diasDesdeRecordatorio: null });
  });

  it('total por cobrar sin error de coma flotante', () => {
    expect(totalPorCobrar([{ saldo: 0.1 }, { saldo: 0.2 }, { saldo: -5 }])).toBe(0.3);
  });
});

describe('recuperadoEnMes', () => {
  it('suma los abonos del mes calendario por fecha efectiva, de cualquier medio', () => {
    const movs = [
      mov('a', 50, dia(2)),
      mov('a', -10, dia(1, 0), { metodoPago: 'Efectivo' }),
      mov('a', -5.5, dia(14), { metodoPago: 'Yape/Plin' }),
      mov('a', -1, null, { creadaEn: dia(15) }), // pendiente en el teléfono
      mov('a', -7, new Date(2026, 9, 31, 23, 59)), // octubre
      // Sincronizado en noviembre pero cobrado en octubre (D-26): no cuenta.
      mov('a', -3, dia(1, 8), { creadaEn: new Date(2026, 9, 31, 22) }),
      mov('a', -2, new Date(2026, 11, 1, 0, 0)), // diciembre
    ];
    expect(recuperadoEnMes(movs, AHORA)).toBe(16.5);
  });
});

describe('recordarPorWhatsapp', () => {
  it('anota el recordatorio y devuelve el enlace', async () => {
    const repo = { registrar: jest.fn(async () => undefined) };
    const enlace = await recordarPorWhatsapp(
      repo,
      { clienteId: 'a', nombreCliente: 'Ana', telefono: '987654321', saldo: 3 },
      AHORA,
    );
    expect(enlace).toMatch(/^https:\/\/wa\.me\/51987654321\?text=Hola%20Ana/);
    expect(repo.registrar).toHaveBeenCalledWith('a', AHORA);
  });

  it('sin celular no anota nada', async () => {
    const repo = { registrar: jest.fn(async () => undefined) };
    const enlace = await recordarPorWhatsapp(repo, {
      clienteId: 'a',
      nombreCliente: 'Ana',
      telefono: '',
      saldo: 3,
    });
    expect(enlace).toBeNull();
    expect(repo.registrar).not.toHaveBeenCalled();
  });
});
