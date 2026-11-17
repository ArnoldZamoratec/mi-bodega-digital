import type { AlError, Cancelar } from '@/domain/ports';
import type { AceptacionInvitacion } from '@/domain/portsEquipo';
import type { Cuenta, Invitacion, Miembro } from '@/domain/rules/roles';

import { ErrorEquipo, type EquipoMovil } from '../firebase/equipoFirestore';

const denegado = () => Object.assign(new Error('permission-denied'), { code: 'permission-denied' });

/**
 * Equipo en memoria para pruebas. Repite lo esencial de las reglas (D-33): la invitación se
 * usa una sola vez, la cuenta no se reescribe y solo se borra si ya no es cajero activo.
 */
export class EquipoMemoria implements EquipoMovil {
  invitaciones = new Map<string, Invitacion>();
  /** clave: `${dueno}/${uid}` */
  miembros = new Map<string, Miembro>();
  cuentas = new Map<string, Cuenta>();
  reloj = () => new Date();
  private oyentes = new Set<() => void>();

  private avisar() {
    this.oyentes.forEach((f) => f());
  }

  private escuchar(emitir: () => void): Cancelar {
    emitir();
    this.oyentes.add(emitir);
    return () => this.oyentes.delete(emitir);
  }

  async crearInvitacion(inv: Invitacion): Promise<void> {
    if (this.invitaciones.has(inv.codigo)) throw denegado();
    this.invitaciones.set(inv.codigo, { ...inv, creada: this.reloj() });
    this.avisar();
  }

  async leerInvitacion(codigo: string): Promise<Invitacion | null> {
    return this.invitaciones.get(codigo) ?? null;
  }

  observarInvitaciones(dueno: string, onDatos: (i: Invitacion[]) => void): Cancelar {
    return this.escuchar(() =>
      onDatos([...this.invitaciones.values()].filter((i) => i.dueno === dueno)),
    );
  }

  async borrarInvitacion(codigo: string): Promise<void> {
    this.invitaciones.delete(codigo);
    this.avisar();
  }

  observarMiembros(dueno: string, onDatos: (m: Miembro[]) => void): Cancelar {
    return this.escuchar(() =>
      onDatos(
        [...this.miembros.entries()].filter(([k]) => k.startsWith(`${dueno}/`)).map(([, m]) => m),
      ),
    );
  }

  observarMiembro(
    dueno: string,
    uid: string,
    onDatos: (m: Miembro | null) => void,
    _onError: AlError,
  ): Cancelar {
    return this.escuchar(() => onDatos(this.miembros.get(`${dueno}/${uid}`) ?? null));
  }

  async leerMiembro(dueno: string, uid: string): Promise<Miembro | null> {
    return this.miembros.get(`${dueno}/${uid}`) ?? null;
  }

  async actualizarMiembro(
    dueno: string,
    uid: string,
    cambios: Partial<Pick<Miembro, 'activo' | 'nombre'>>,
  ): Promise<void> {
    const m = this.miembros.get(`${dueno}/${uid}`);
    if (!m) throw Object.assign(new Error('not-found'), { code: 'not-found' });
    this.miembros.set(`${dueno}/${uid}`, { ...m, ...cambios });
    this.avisar();
  }

  async quitarMiembro(dueno: string, uid: string): Promise<void> {
    this.miembros.delete(`${dueno}/${uid}`);
    this.avisar();
  }

  async leerCuenta(uid: string): Promise<Cuenta | null> {
    return this.cuentas.get(uid) ?? null;
  }

  async borrarCuenta(uid: string): Promise<void> {
    const c = this.cuentas.get(uid);
    if (c && this.miembros.get(`${c.bodega}/${uid}`)?.activo) throw denegado();
    this.cuentas.delete(uid);
  }

  async aceptarInvitacion(a: AceptacionInvitacion): Promise<void> {
    const uid = a.miembro.uid;
    const existente = this.miembros.get(`${a.dueno}/${uid}`);
    if (existente) {
      if (existente.activo) return;
      throw new ErrorEquipo('MIEMBRO_PAUSADO');
    }
    const inv = this.invitaciones.get(a.codigo);
    if (!inv || inv.usadaPor !== null || inv.dueno !== a.dueno) throw denegado();
    if (this.reloj().getTime() >= inv.expira.getTime()) throw denegado();
    const cuenta = this.cuentas.get(uid);
    if (a.crearCuenta ? cuenta : cuenta?.bodega !== a.dueno) throw denegado();
    this.invitaciones.set(a.codigo, { ...inv, usadaPor: uid });
    this.miembros.set(`${a.dueno}/${uid}`, { ...a.miembro, desde: this.reloj() });
    if (a.crearCuenta) this.cuentas.set(uid, { uid, bodega: a.dueno, rol: 'cajero' });
    this.avisar();
  }
}
