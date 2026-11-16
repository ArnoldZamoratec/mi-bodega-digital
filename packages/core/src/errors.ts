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
  | 'VENTA_YA_ANULADA'
  | 'CAJA_YA_ABIERTA'
  | 'CAJA_NO_ABIERTA'
  | 'MOTIVO_VACIO'
  | 'CODIGO_INVALIDO'
  | 'INVITACION_NO_EXISTE'
  | 'INVITACION_VENCIDA'
  | 'INVITACION_USADA'
  | 'INVITACION_PROPIA'
  | 'CUENTA_DE_OTRA_BODEGA'
  | 'LIMITE_CAJEROS'
  | 'SIN_PERMISO';

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
  CAJA_YA_ABIERTA: 'Ya tienes una caja abierta. Ciérrala antes de abrir otra.',
  CAJA_NO_ABIERTA: 'No hay una caja abierta. Abre la caja para registrar movimientos.',
  MOTIVO_VACIO: 'Escribe el motivo (por ejemplo: pago al proveedor)',
  CODIGO_INVALIDO: 'Revisa el código: son 8 letras y números, como ABCD-EFGH',
  INVITACION_NO_EXISTE: 'No encontramos ese código. Pídele al dueño que te lo vuelva a enviar.',
  INVITACION_VENCIDA: 'Este código ya venció. Pídele al dueño uno nuevo.',
  INVITACION_USADA: 'Este código ya fue usado. Pídele al dueño uno nuevo.',
  INVITACION_PROPIA: 'Este código es de tu propia bodega: compártelo con tu cajero.',
  CUENTA_DE_OTRA_BODEGA: 'Tu cuenta ya trabaja en otra bodega. Usa otra cuenta para esta.',
  LIMITE_CAJEROS: 'Ya tienes 3 cajeros activos. Desactiva uno para invitar a otro.',
  SIN_PERMISO: 'Solo el dueño de la bodega puede hacer esto.',
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
