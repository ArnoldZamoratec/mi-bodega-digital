import { collection, doc, type Firestore } from 'firebase/firestore';

/**
 * Rutas idénticas a `js/store.js` de la web:
 *   artifacts/{appId}/users/{uid}/{productos|clientes|ventas|deudas}
 * más el documento aditivo `config/negocio`.
 */
export type NombreColeccion = 'productos' | 'clientes' | 'ventas' | 'deudas';

export class Rutas {
  constructor(
    private readonly db: Firestore,
    private readonly appId: string,
    private readonly uid: string,
  ) {}

  base(): string {
    return `artifacts/${this.appId}/users/${this.uid}`;
  }

  coleccion(nombre: NombreColeccion) {
    return collection(this.db, `${this.base()}/${nombre}`);
  }

  configNegocio() {
    return doc(this.db, `${this.base()}/config/negocio`);
  }
}
