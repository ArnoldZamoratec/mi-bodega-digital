import {
  enlaceRecordatorioWhatsApp,
  mensajeRecordatorio,
  numeroWhatsApp,
} from '../rules/recordatorio';

describe('numeroWhatsApp', () => {
  it.each([
    ['987654321', '51987654321'],
    ['987 654 321', '51987654321'],
    ['+51 987-654-321', '51987654321'],
    ['51987654321', '51987654321'],
  ])('%s → %s', (entrada, esperado) => {
    expect(numeroWhatsApp(entrada)).toBe(esperado);
  });

  it.each(['', '01 4251234', '87654321', '1987654321', null, undefined])(
    'rechaza lo que no es celular peruano: %p',
    (entrada) => {
      expect(numeroWhatsApp(entrada)).toBeNull();
    },
  );
});

describe('mensajeRecordatorio', () => {
  it('es cordial, menciona el monto y firma "tu bodega" sin nombre configurado', () => {
    const m = mensajeRecordatorio({ nombreCliente: 'Rosa', saldo: 1234.5 });
    expect(m).toContain('Hola Rosa');
    expect(m).toContain('te saluda tu bodega');
    expect(m).toContain('S/ 1,234.50');
    expect(m).toContain('¡Gracias!');
  });

  it('usa el nombre de la bodega si existe', () => {
    const m = mensajeRecordatorio({
      nombreCliente: 'Rosa',
      saldo: 10,
      nombreBodega: ' Bodega Doña Juana ',
    });
    expect(m).toContain('te saluda Bodega Doña Juana.');
  });

  it('ignora el nombre por defecto ("Mi Bodega") y nombres vacíos', () => {
    expect(
      mensajeRecordatorio({ nombreCliente: 'A', saldo: 5, nombreBodega: 'Mi Bodega' }),
    ).toContain('tu bodega');
    expect(mensajeRecordatorio({ nombreCliente: 'A', saldo: 5, nombreBodega: '  ' })).toContain(
      'tu bodega',
    );
  });

  it('sin deuda no cobra', () => {
    const m = mensajeRecordatorio({ nombreCliente: 'Rosa', saldo: -3 });
    expect(m).toContain('No tienes saldo pendiente');
    expect(m).not.toContain('S/');
  });

  it('sin nombre de cliente saluda igual', () => {
    expect(mensajeRecordatorio({ nombreCliente: '  ', saldo: 1 })).toMatch(/^Hola, te saluda/);
  });
});

describe('enlaceRecordatorioWhatsApp', () => {
  it('arma el enlace wa.me con el texto codificado', () => {
    const url = enlaceRecordatorioWhatsApp('987654321', { nombreCliente: 'Rosa', saldo: 7 });
    expect(url).toMatch(/^https:\/\/wa\.me\/51987654321\?text=/);
    const texto = decodeURIComponent(url!.split('text=')[1]!);
    expect(texto).toBe(mensajeRecordatorio({ nombreCliente: 'Rosa', saldo: 7 }));
  });

  it('null si el teléfono no sirve', () => {
    expect(enlaceRecordatorioWhatsApp('', { nombreCliente: 'Rosa', saldo: 7 })).toBeNull();
  });
});
