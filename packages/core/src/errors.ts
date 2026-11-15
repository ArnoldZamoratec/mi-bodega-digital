export type CodigoErrorDominio =
  | 'CARRITO_VACIO'
  | 'FIADO_SIN_CLIENTE'
  | 'METODO_PAGO_INVALIDO'
  | 'CANTIDAD_INVALIDA'
  | 'MONTO_INVALIDO'
  | 'DESCRIPCION_VACIA'
  | 'RANGO_FECHAS_INVALIDO'
  | 'SIN_DEUDA_PENDIENTE'
  | 'NO_SE_ANULA_ANULACION'
  | 'VENTA_YA_ANULADA';

const MENSAJES: Record<CodigoErrorDominio, string> = {
  CARRITO_VACIO: 'El carrito está vacío',
  FIADO_SIN_CLIENTE: 'Debes seleccionar un cliente para fiar',
  METODO_PAGO_INVALIDO: 'Método de pago no válido',
  CANTIDAD_INVALIDA: 'La cantidad debe ser un número entero mayor a cero',
  MONTO_INVALIDO: 'El monto debe ser mayor a cero',
  DESCRIPCION_VACIA: 'La descripción es obligatoria',
  RANGO_FECHAS_INVALIDO: 'La fecha de fin no puede ser anterior a la de inicio',
  SIN_DEUDA_PENDIENTE: 'El cliente no tiene deuda pendiente',
  NO_SE_ANULA_ANULACION: 'Una anulación no se puede anular',
  VENTA_YA_ANULADA: 'Esta venta ya fue anulada',
};

/** Error de regla de negocio: siempre tiene un mensaje apto para mostrar al usuario. */
export class ErrorDominio extends Error {
  readonly codigo: CodigoErrorDominio;

  constructor(codigo: CodigoErrorDominio) {
    super(MENSAJES[codigo]);
    this.name = 'ErrorDominio';
    this.codigo = codigo;
  }
}
