import type { Auth } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';

import type { AlError, Cancelar } from '@/domain/ports';
import type { AceptacionInvitacion, RepositorioEquipo } from '@/domain/portsEquipo';
import type { Cuenta, Invitacion, Miembro } from '@/domain/rules/roles';

import { asegurarToken } from '../asegurarToken';
import { aCuenta, aInvitacion, aMiembro } from '../mappersEquipo';
import { escucharSeguro } from './repositorios';

/**
 * Lo que la app móvil necesita del equipo además del puerto del core: escuchar el propio
 * miembro (para enterarse al instante si el dueño lo desactiva) y borrar la propia cuenta
 * (dejar una bodega; las reglas solo lo permiten si ya no es cajero activo).
 */
export interface EquipoMovil extends RepositorioEquipo {
  observarMiembro(
    dueno: string,
    uid: string,
    onDatos: (miembro: Miembro | null) => void,
    onError: AlError,
  ): Cancelar;
  borrarCuenta(uid: string): Promise<void>;
}

/** Errores del equipo que no son reglas del core, con su mensaje para la persona. */
export type CodigoErrorEquipo = 'MIEMBRO_PAUSADO';

export class ErrorEquipo extends Error {
  constructor(readonly codigo: CodigoErrorEquipo) {
    super(
      {
        MIEMBRO_PAUSADO:
          'Ya eres parte de esta bodega, pero tu acceso está pausado. Pídele al dueño que te active desde Equipo.',
      }[codigo],
    );
    this.name = 'ErrorEquipo';
  }
}

const aError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/**
 * Equipo en Firestore (D-33):
 *   artifacts/{app}/invitaciones/{codigo}
 *   artifacts/{app}/users/{dueño}/miembros/{uid}
 *   artifacts/{app}/cuentas/{uid}
 * Todo necesita red: no hay outbox (invitar y aceptar se confirman en el momento).
 */
export class EquipoFirestore implements EquipoMovil {
  constructor(
    /** Getter: tras recrear Firestore (D-31) se usa siempre la instancia vigente. */
    private readonly db: () => Firestore,
    private readonly auth: Pick<Auth, 'currentUser'>,
    private readonly appId: string,
  ) {}

  private invitacion(codigo: string) {
    return doc(this.db(), `artifacts/${this.appId}/invitaciones/${codigo}`);
  }

  private miembros(dueno: string) {
    return collection(this.db(), `artifacts/${this.appId}/users/${dueno}/miembros`);
  }

  private miembro(dueno: string, uid: string) {
    return doc(this.miembros(dueno), uid);
  }

  private cuenta(uid: string) {
    return doc(this.db(), `artifacts/${this.appId}/cuentas/${uid}`);
  }

  async crearInvitacion(inv: Invitacion): Promise<void> {
    await setDoc(this.invitacion(inv.codigo), {
      dueno: inv.dueno,
      rol: 'cajero',
      // Las reglas exigen `creada == request.time` y `expira <= request.time + 7 días`.
      creada: serverTimestamp(),
      expira: Timestamp.fromDate(inv.expira),
      usadaPor: null,
      nombreBodega: inv.nombreBodega,
    });
  }

  async leerInvitacion(codigo: string): Promise<Invitacion | null> {
    const snap = await getDoc(this.invitacion(codigo));
    return snap.exists() ? aInvitacion(codigo, snap.data()) : null;
  }

  observarInvitaciones(
    dueno: string,
    onDatos: (invitaciones: Invitacion[]) => void,
    onError: AlError,
  ): Cancelar {
    // Las reglas solo dejan listar con este filtro (`resource.data.dueno == auth.uid`).
    const q = query(
      collection(this.db(), `artifacts/${this.appId}/invitaciones`),
      where('dueno', '==', dueno),
    );
    return escucharSeguro(
      () =>
        onSnapshot(
          q,
          (snap) =>
            onDatos(
              snap.docs
                .map((d) => aInvitacion(d.id, d.data({ serverTimestamps: 'estimate' })))
                .filter((i): i is Invitacion => i !== null),
            ),
          (e) => onError(aError(e)),
        ),
      onError,
    );
  }

  async borrarInvitacion(codigo: string): Promise<void> {
    await deleteDoc(this.invitacion(codigo));
  }

  observarMiembros(
    dueno: string,
    onDatos: (miembros: Miembro[]) => void,
    onError: AlError,
  ): Cancelar {
    return escucharSeguro(
      () =>
        onSnapshot(
          this.miembros(dueno),
          (snap) =>
            onDatos(snap.docs.map((d) => aMiembro(d.id, d.data({ serverTimestamps: 'estimate' })))),
          (e) => onError(aError(e)),
        ),
      onError,
    );
  }

  observarMiembro(
    dueno: string,
    uid: string,
    onDatos: (miembro: Miembro | null) => void,
    onError: AlError,
  ): Cancelar {
    return escucharSeguro(
      () =>
        onSnapshot(
          this.miembro(dueno, uid),
          (snap) => {
            // Sin red, el SDK responde "no existe" desde su caché en memoria vacía: eso no
            // significa que lo quitaron. Solo cuenta lo confirmado por el servidor.
            if (snap.metadata.fromCache) return;
            onDatos(snap.exists() ? aMiembro(uid, snap.data() as DocumentData) : null);
          },
          (e) => onError(aError(e)),
        ),
      onError,
    );
  }

  async leerMiembro(dueno: string, uid: string): Promise<Miembro | null> {
    const snap = await getDoc(this.miembro(dueno, uid));
    return snap.exists() ? aMiembro(uid, snap.data()) : null;
  }

  async actualizarMiembro(
    dueno: string,
    uid: string,
    cambios: Partial<Pick<Miembro, 'activo' | 'nombre'>>,
  ): Promise<void> {
    await updateDoc(this.miembro(dueno, uid), { ...cambios });
  }

  async quitarMiembro(dueno: string, uid: string): Promise<void> {
    await deleteDoc(this.miembro(dueno, uid));
  }

  async leerCuenta(uid: string): Promise<Cuenta | null> {
    const snap = await getDoc(this.cuenta(uid));
    return snap.exists() ? aCuenta(uid, snap.data()) : null;
  }

  async borrarCuenta(uid: string): Promise<void> {
    await deleteDoc(this.cuenta(uid));
  }

  /**
   * Una transacción, exactamente como la esperan las reglas: la invitación pasa de
   * `usadaPor: null` a este uid, se crea `miembros/{uid}` (`desde` = hora del servidor) y,
   * si hace falta, `cuentas/{uid}` apuntando a la bodega. Si la cuenta ya apunta aquí (cajero
   * que vuelve tras ser quitado) no se reescribe: las reglas no dejan editarla.
   */
  async aceptarInvitacion(a: AceptacionInvitacion): Promise<void> {
    // D-31: sin token válido no se abre la transacción (evita la aserción 3c6b del SDK).
    await asegurarToken(this.auth);
    const uid = a.miembro.uid;
    const invRef = this.invitacion(a.codigo);
    const miembroRef = this.miembro(a.dueno, uid);
    await runTransaction(this.db(), async (tx) => {
      const miembro = await tx.get(miembroRef);
      if (miembro.exists()) {
        // Ya es miembro: activo = nada que hacer (reintento tras un corte); pausado = solo el
        // dueño puede activarlo (las reglas no dejan recrear el documento).
        if (miembro.get('activo') === true) return;
        throw new ErrorEquipo('MIEMBRO_PAUSADO');
      }
      tx.update(invRef, { usadaPor: uid });
      tx.set(miembroRef, {
        rol: 'cajero',
        nombre: a.miembro.nombre,
        ...(a.miembro.email ? { email: a.miembro.email } : {}),
        activo: true,
        desde: serverTimestamp(),
        invitacion: a.codigo,
      });
      if (a.crearCuenta) tx.set(this.cuenta(uid), { bodega: a.dueno, rol: 'cajero' });
    });
  }
}
