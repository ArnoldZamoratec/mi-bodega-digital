import { BaseDatosMemoria, FiadoMemoria } from '@/data/memoria/repositoriosMemoria';
import type { MovimientoFiado } from '@/domain/entities';
import { calcularSaldo, estadoDeCargos } from '@/domain/rules/fiado';
import { generarReporte, rangoPredefinido } from '@/domain/rules/reportes';
import { liquidarCargo, registrarAbono, registrarCargo } from '@/domain/usecases/fiado';

const leer = (repo: FiadoMemoria, clienteId: string): MovimientoFiado[] => {
  let movs: MovimientoFiado[] = [];
  repo.observarCliente(
    clienteId,
    (m) => (movs = m),
    () => undefined,
  );
  return movs;
};

describe('flujo de fiado completo', () => {
  it('deuda → abono parcial → liquidar: saldo 0 y cobros en el reporte', async () => {
    const db = new BaseDatosMemoria();
    const repo = new FiadoMemoria(db);

    const cargoId = await registrarCargo(repo, 'cli', 25, 'Compra semanal');
    await registrarAbono(repo, {
      clienteId: 'cli',
      monto: 10,
      descripcion: 'Adelanto',
      metodoPago: 'Yape/Plin',
    });
    expect(calcularSaldo(leer(repo, 'cli'))).toBe(15);
    expect(estadoDeCargos(leer(repo, 'cli'))[0]?.estado).toBe('parcial');

    await liquidarCargo(repo, leer(repo, 'cli'), cargoId, 'Efectivo');
    const movs = leer(repo, 'cli');
    expect(calcularSaldo(movs)).toBe(0);
    expect(estadoDeCargos(movs)[0]?.estado).toBe('cubierto');
    // El cargo nunca se marca como pagado (D-14): web y móvil ven el mismo saldo.
    expect(movs.find((m) => m.id === cargoId)?.pagado).toBe(false);

    const reporte = generarReporte([], movs, rangoPredefinido('hoy', db.reloj()));
    expect(reporte.totalYape).toBe(10);
    expect(reporte.totalEfectivo).toBe(15);
    expect(reporte.totalIngresos).toBe(25);
  });

  it('no registra nada si la validación falla', async () => {
    const db = new BaseDatosMemoria();
    const repo = new FiadoMemoria(db);
    await expect(registrarCargo(repo, 'cli', -5, 'x')).rejects.toThrow('mayor a cero');
    expect(db.deudas.size).toBe(0);
  });
});
