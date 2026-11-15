import { createContext, useContext, type ReactNode } from 'react';

import type { ServicioAuth } from '@/domain/ports';

interface Servicios {
  auth: ServicioAuth;
}

const Contexto = createContext<Servicios | null>(null);

/** Inyección de servicios globales (permite reemplazarlos por dobles en pruebas). */
export function ProveedorServicios({ valor, children }: { valor: Servicios; children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useServicios(): Servicios {
  const s = useContext(Contexto);
  if (!s) throw new Error('ProveedorServicios no está montado');
  return s;
}
