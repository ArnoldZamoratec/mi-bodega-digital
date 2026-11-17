import { ErrorDominio, type Invitacion } from '@bodegon/core';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import type { RepositorioEquipoWeb } from './equipo';
import { appId, db } from './firebase';
import { registrarListener } from './listeners';
import { aCuenta, aInvitacion, aMiembro, documentoCuenta, documentoInvitacion, documentoMiembro } from './logic/equipo';

/**
 * Equipo (D-33) en Firestore, con las rutas y escrituras exactas de `firestore.rules`:
 *   artifacts/mi-bodega-app/invitaciones/{codigo}
 *   artifacts/mi-bodega-app/users/{dueno}/miembros/{uid}
 *   artifacts/mi-bodega-app/cuentas/{uid}
 * Los listeners quedan en el registro global (listeners.ts), que los cierra al salir.
 */
const base = `artifacts/${appId}`;
const refInvitacion = (codigo: string) => doc(db, `${base}/invitaciones/${codigo}`);
const colMiembros = (dueno: string) => collection(db, `${base}/users/${dueno}/miembros`);
const refMiembro = (dueno: string, uid: string) => doc(colMiembros(dueno), uid);
const refCuenta = (uid: string) => doc(db, `${base}/cuentas/${uid}`);

export const equipoFirestore: RepositorioEquipoWeb = {
  async crearInvitacion(inv: Invitacion) {
    // Transacción: si el código ya existe no se pisa (las reglas tampoco lo dejarían).
    const ref = refInvitacion(inv.codigo);
    await runTransaction(db, async (tx) => {
      if ((await tx.get(ref)).exists()) throw new Error('El código ya existe');
      tx.set(ref, documentoInvitacion(inv, serverTimestamp(), (d) => Timestamp.fromDate(d)));
    });
  },

  async leerInvitacion(codigo) {
    const snap = await getDoc(refInvitacion(codigo));
    return snap.exists() ? aInvitacion(codigo, snap.data()) : null;
  },

  observarInvitaciones(dueno, onDatos, onError) {
    return registrarListener(
      onSnapshot(
        // Las reglas solo dejan listar las propias: el filtro es obligatorio.
        query(collection(db, `${base}/invitaciones`), where('dueno', '==', dueno)),
        (s) =>
          onDatos(
            s.docs
              .map((d) => aInvitacion(d.id, d.data({ serverTimestamps: 'estimate' })))
              .filter((i): i is Invitacion => i !== null),
          ),
        (e) => {
          console.error('Error al cargar invitaciones:', e);
          onError(new Error('No pudimos cargar tus invitaciones. Revisa tu conexión.'));
        },
      ),
    );
  },

  async borrarInvitacion(codigo) {
    await deleteDoc(refInvitacion(codigo));
  },

  observarMiembros(dueno, onDatos, onError) {
    return registrarListener(
      onSnapshot(
        query(colMiembros(dueno)),
        (s) =>
          onDatos(
            s.docs
              .map((d) => aMiembro(d.id, d.data({ serverTimestamps: 'estimate' })))
              .filter((m) => m !== null)
              .sort((a, b) => a.nombre.localeCompare(b.nombre)),
          ),
        (e) => {
          console.error('Error al cargar el equipo:', e);
          onError(new Error('No pudimos cargar tu equipo. Revisa tu conexión.'));
        },
      ),
    );
  },

  observarMiembro(dueno, uid, onDatos, onError) {
    return registrarListener(
      onSnapshot(
        refMiembro(dueno, uid),
        (snap) => onDatos(snap.exists() ? aMiembro(uid, snap.data()) : null),
        (e) => {
          console.error('Error al revisar tu acceso:', e);
          onError(new Error('No pudimos revisar tu acceso. Revisa tu conexión.'));
        },
      ),
    );
  },

  async leerMiembro(dueno, uid) {
    const snap = await getDoc(refMiembro(dueno, uid));
    return snap.exists() ? aMiembro(uid, snap.data()) : null;
  },

  async actualizarMiembro(dueno, uid, cambios) {
    // Las reglas solo aceptan `activo` y `nombre`.
    const datos: { activo?: boolean; nombre?: string } = {};
    if (cambios.activo !== undefined) datos.activo = cambios.activo;
    if (cambios.nombre !== undefined) datos.nombre = cambios.nombre;
    await updateDoc(refMiembro(dueno, uid), datos);
  },

  async quitarMiembro(dueno, uid) {
    await deleteDoc(refMiembro(dueno, uid));
  },

  async leerCuenta(uid) {
    const snap = await getDoc(refCuenta(uid));
    return snap.exists() ? aCuenta(uid, snap.data()) : null;
  },

  async aceptarInvitacion(a) {
    // UNA transacción con las tres escrituras que exigen las reglas: la invitación pasa de
    // usadaPor null a este uid, se crea el miembro y (si falta) la cuenta.
    const invRef = refInvitacion(a.codigo);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(invRef);
      if (!snap.exists()) throw new ErrorDominio('INVITACION_NO_EXISTE');
      if (snap.get('usadaPor') !== null) throw new ErrorDominio('INVITACION_USADA');
      tx.update(invRef, { usadaPor: a.miembro.uid });
      tx.set(refMiembro(a.dueno, a.miembro.uid), documentoMiembro(a, serverTimestamp()));
      if (a.crearCuenta) tx.set(refCuenta(a.miembro.uid), documentoCuenta(a));
    });
  },

  async borrarCuenta(uid) {
    await deleteDoc(refCuenta(uid));
  },
};
