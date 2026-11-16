import type {
  Cliente,
  ClienteDatos,
  ConfigNegocio,
  MovimientoFiado,
  Producto,
  ProductoDatos,
  Usuario,
  Venta,
} from './entities';
import type { AbonoNuevo, CargoNuevo, OperacionMovimiento } from './rules/fiado';
import type { RangoFechas } from './rules/reportes';
import type { OperacionVenta } from './rules/venta';

/** Puertos (interfaces) que implementa la capa `data/`. El dominio no conoce Firebase. */

export type Cancelar = () => void;
export type AlError = (error: Error) => void;

export interface RepositorioProductos {
  observar(onDatos: (productos: Producto[]) => void, onError: AlError): Cancelar;
  crear(datos: ProductoDatos): Promise<string>;
  actualizar(id: string, datos: ProductoDatos): Promise<void>;
  eliminar(id: string): Promise<void>;
}

export interface RepositorioClientes {
  observar(onDatos: (clientes: Cliente[]) => void, onError: AlError): Cancelar;
  crear(datos: ClienteDatos): Promise<string>;
  actualizar(id: string, datos: ClienteDatos): Promise<void>;
}

export interface RepositorioFiado {
  /** Todos los movimientos (para saldos por cliente con un único listener). */
  observarTodos(onDatos: (movs: MovimientoFiado[]) => void, onError: AlError): Cancelar;
  observarCliente(
    clienteId: string,
    onDatos: (movs: MovimientoFiado[]) => void,
    onError: AlError,
  ): Cancelar;
  observarRango(
    rango: RangoFechas,
    onDatos: (movs: MovimientoFiado[]) => void,
    onError: AlError,
  ): Cancelar;
  crearCargo(cargo: CargoNuevo): Promise<string>;
  crearAbono(abono: AbonoNuevo): Promise<string>;
  eliminar(id: string): Promise<void>;
}

/** Lado remoto del fiado: además de leer, confirma movimientos guardados en el outbox. */
export interface RemotoFiado extends RepositorioFiado {
  nuevoId(): string;
  /** Escribe `deudas/{op.id}` si no existe (idempotente, como `RepositorioVentas.confirmar`). */
  confirmar(op: OperacionMovimiento): Promise<ResultadoConfirmacion>;
}

export type ResultadoConfirmacion = 'escrita' | 'ya-existia';

export interface RepositorioVentas {
  nuevoId(): string;
  nuevoIdCargo(): string;
  /**
   * Escribe venta + cargo + descuentos de stock de forma atómica e **idempotente**:
   * si `ventas/{ventaId}` ya existe no vuelve a escribir (evita doble descuento).
   */
  confirmar(operacion: OperacionVenta): Promise<ResultadoConfirmacion>;
  /**
   * Escribe el contraasiento `operacion` (ver rules/anulacion.ts), devuelve el stock y, si
   * `original` era fiada, elimina su cargo: todo en una transacción. Idempotente por id.
   */
  anular(operacion: OperacionVenta, original: Venta): Promise<ResultadoConfirmacion>;
  observarRango(rango: RangoFechas, onDatos: (ventas: Venta[]) => void, onError: AlError): Cancelar;
}

export interface RepositorioConfig {
  observar(onDatos: (config: ConfigNegocio) => void, onError: AlError): Cancelar;
  guardar(config: ConfigNegocio): Promise<void>;
}

export interface EntradaColaDe<T> {
  operacion: T;
  intentos: number;
  ultimoError?: string;
  /** true si el error no se resuelve reintentando (p. ej. permisos). */
  bloqueada?: boolean;
}

export type EntradaCola = EntradaColaDe<OperacionVenta>;

/** Outbox persistente en el teléfono (D-05). `quitar` recibe el id de la operación. */
export interface Cola<T> {
  listar(): Promise<EntradaColaDe<T>[]>;
  agregar(operacion: T): Promise<void>;
  actualizar(entrada: EntradaColaDe<T>): Promise<void>;
  quitar(id: string): Promise<void>;
  suscribir(listener: (entradas: EntradaColaDe<T>[]) => void): Cancelar;
}

export type ColaVentas = Cola<OperacionVenta>;
/** Cargos y abonos manuales de fiado registrados sin conexión (D-24). */
export type ColaMovimientos = Cola<OperacionMovimiento>;

export interface ServicioAuth {
  observar(onCambio: (usuario: Usuario | null) => void): Cancelar;
  ingresar(email: string, password: string): Promise<void>;
  /** true si la app tiene configurado el inicio de sesión con Google. */
  readonly googleDisponible: boolean;
  /** Inicia sesión (o crea la cuenta) con Google. 'cancelado' si el usuario cerró el selector. */
  ingresarConGoogle(): Promise<'ok' | 'cancelado'>;
  registrar(email: string, password: string): Promise<void>;
  recuperarContrasena(email: string): Promise<void>;
  salir(): Promise<void>;
}

/** Clasifica errores de infraestructura sin acoplar el dominio a Firebase. */
export interface ClasificadorErrores {
  /** true si reintentar no lo resolverá (permisos, datos inválidos). */
  esErrorPermanente(error: unknown): boolean;
  /**
   * D-31: true si el error indica que el cliente de la base quedó inutilizable (p. ej.
   * `INTERNAL ASSERTION FAILED` del SDK de Firestore): reintentar en la misma instancia no
   * sirve; hay que recrearla. Opcional: sin él nunca se reporta.
   */
  esInstanciaRota?(error: unknown): boolean;
}
