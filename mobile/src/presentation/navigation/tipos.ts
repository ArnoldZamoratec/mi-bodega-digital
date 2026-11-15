import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type TabsParams = {
  Vender: undefined;
  Inventario: undefined;
  Fiado: undefined;
  Reportes: undefined;
  Ajustes: undefined;
};

export type RaizParams = {
  Login: undefined;
  Tabs: NavigatorScreenParams<TabsParams>;
  Cobro: undefined;
  /** pos: agrega al carrito. codigo: devuelve el código al formulario de producto. */
  Escaner: { modo: 'pos' | 'codigo' };
  ProductoForm: { productoId?: string; codigoBarras?: string } | undefined;
  ClienteDetalle: { clienteId: string };
  ClienteForm: { clienteId?: string } | undefined;
  MovimientoForm: { clienteId: string; tipo: 'cargo' | 'abono' };
  VentasPendientes: undefined;
  DatosNegocio: undefined;
  /** Historial de ventas con anulación. */
  HistorialVentas: undefined;
};

export type PantallaRaiz<T extends keyof RaizParams> = NativeStackScreenProps<RaizParams, T>;

export type PantallaTab<T extends keyof TabsParams> = CompositeScreenProps<
  BottomTabScreenProps<TabsParams, T>,
  NativeStackScreenProps<RaizParams>
>;

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RaizParams {}
  }
}
