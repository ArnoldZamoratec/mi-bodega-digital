import { EquipoMemoria } from '@/data/memoria/equipoMemoria';
import { resolverSesionRemota } from '@/data/sesion';
import { sesionDueno } from '@/domain/rules/roles';
import {
  aceptarInvitacion,
  cambiarActivoCajero,
  invitarCajero,
  quitarCajero,
} from '@/domain/usecases/equipo';

/** D-33: ciclo completo del equipo con los casos de uso del core y el repositorio en memoria. */

const lucho = sesionDueno('d1', 'Lucho');
let semilla = 0;
const rng = () => (semilla = (semilla * 9301 + 49297) % 233280) / 233280;

async function invitar(equipo: EquipoMemoria) {
  const miembros = await new Promise<
    Parameters<Parameters<EquipoMemoria['observarMiembros']>[1]>[0]
  >((r) => equipo.observarMiembros('d1', r)());
  return invitarCajero(equipo, {
    sesion: lucho,
    nombreBodega: 'Bodega Lucho',
    miembros,
    ahora: new Date(),
    rng,
  });
}

const aceptar = (equipo: EquipoMemoria, codigo: string, uid = 'c1', nombre = 'Rosa') =>
  aceptarInvitacion(equipo, { codigo, uid, nombre, email: `${uid}@x.pe`, ahora: new Date() });

describe('Equipo (D-33)', () => {
  it('invitar → aceptar (con guion y minúsculas) → la sesión del cajero apunta a la bodega', async () => {
    const equipo = new EquipoMemoria();
    const { invitacion, mensaje } = await invitar(equipo);
    expect(mensaje).toContain('Bodega Lucho');
    expect(mensaje).toContain(`${invitacion.codigo.slice(0, 4)}-${invitacion.codigo.slice(4)}`);

    const escrito = `${invitacion.codigo.slice(0, 4).toLowerCase()} - ${invitacion.codigo.slice(4)}`;
    const sesion = await aceptar(equipo, escrito);
    expect(sesion).toEqual({ uid: 'c1', bodega: 'd1', rol: 'cajero', nombre: 'Rosa' });
    expect(equipo.invitaciones.get(invitacion.codigo)?.usadaPor).toBe('c1');
    expect(equipo.cuentas.get('c1')).toEqual({ uid: 'c1', bodega: 'd1', rol: 'cajero' });
    await expect(resolverSesionRemota(equipo, 'c1', '')).resolves.toEqual({
      tipo: 'activa',
      sesion,
    });
  });

  it('un código usado, propio o mal escrito da un mensaje claro', async () => {
    const equipo = new EquipoMemoria();
    const { invitacion } = await invitar(equipo);
    await expect(aceptar(equipo, invitacion.codigo, 'd1')).rejects.toMatchObject({
      codigo: 'INVITACION_PROPIA',
    });
    await aceptar(equipo, invitacion.codigo);
    await expect(aceptar(equipo, invitacion.codigo, 'c2')).rejects.toMatchObject({
      codigo: 'INVITACION_USADA',
    });
    await expect(aceptar(equipo, 'ABC')).rejects.toMatchObject({ codigo: 'CODIGO_INVALIDO' });
    await expect(aceptar(equipo, 'ZZZZ-ZZZZ')).rejects.toMatchObject({
      codigo: 'INVITACION_NO_EXISTE',
    });
  });

  it('máximo 3 cajeros activos; al pausar uno se libera el cupo', async () => {
    const equipo = new EquipoMemoria();
    for (const uid of ['c1', 'c2', 'c3']) {
      const { invitacion } = await invitar(equipo);
      await aceptar(equipo, invitacion.codigo, uid);
    }
    await expect(invitar(equipo)).rejects.toMatchObject({ codigo: 'LIMITE_CAJEROS' });
    await cambiarActivoCajero(equipo, lucho, 'c2', false);
    await expect(invitar(equipo)).resolves.toBeTruthy();
  });

  it('desactivado → sin acceso; quitado → puede volver con una invitación nueva', async () => {
    const equipo = new EquipoMemoria();
    const primera = await invitar(equipo);
    await aceptar(equipo, primera.invitacion.codigo);

    await cambiarActivoCajero(equipo, lucho, 'c1', false);
    await expect(resolverSesionRemota(equipo, 'c1', '')).resolves.toMatchObject({
      tipo: 'sin-acceso',
      motivo: 'desactivado',
    });
    // Pausado no puede reentrar con otra invitación: lo activa el dueño.
    const otra = await invitar(equipo);
    await expect(aceptar(equipo, otra.invitacion.codigo)).rejects.toThrow(/pausado/);

    await quitarCajero(equipo, lucho, 'c1');
    await expect(resolverSesionRemota(equipo, 'c1', '')).resolves.toMatchObject({
      motivo: 'quitado',
    });
    // Vuelve: su cuenta ya apunta a esta bodega y no se reescribe.
    await expect(aceptar(equipo, otra.invitacion.codigo)).resolves.toMatchObject({
      bodega: 'd1',
    });
  });

  it('un cajero no gestiona el equipo', async () => {
    const equipo = new EquipoMemoria();
    const rosa = { uid: 'c1', bodega: 'd1', rol: 'cajero' as const, nombre: 'Rosa' };
    await expect(
      invitarCajero(equipo, {
        sesion: rosa,
        nombreBodega: 'x',
        miembros: [],
        ahora: new Date(),
        rng,
      }),
    ).rejects.toMatchObject({ codigo: 'SIN_PERMISO' });
    await expect(quitarCajero(equipo, rosa, 'c2')).rejects.toMatchObject({
      codigo: 'SIN_PERMISO',
    });
  });
});
