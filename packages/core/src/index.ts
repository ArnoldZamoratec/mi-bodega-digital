/**
 * @bodegon/core — reglas de negocio compartidas por la web (web/) y la app móvil (mobile/).
 * TypeScript puro: sin React, sin Firebase, sin APIs del navegador ni de React Native.
 */
export * from './entities';
export * from './errors';
export * from './ports';
export * from './portsEquipo';
export * from './rules/anulacion';
export * from './rules/carrito';
export * from './rules/dinero';
export * from './rules/fechasLima';
export * from './rules/fiado';
export * from './rules/productos';
export * from './rules/recordatorio';
export * from './rules/reportes';
export * from './rules/roles';
export * from './rules/venta';
export * from './rules/vuelto';
export * from './usecases/anularVenta';
export * from './usecases/equipo';
export * from './usecases/fiado';
export * from './usecases/registrarVenta';
export * from './usecases/sincronizarVentas';
