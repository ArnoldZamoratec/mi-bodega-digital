import { z } from 'zod';

import { METODOS_PAGO_ABONO } from '@/domain/entities';
import { parsearSoles } from '@/domain/rules/dinero';

/** Validaciones de formularios. Reflejan las reglas de la web (RN-11) más las faltantes. */

const email = z.string().trim().min(1, 'Ingresa tu correo').email('Correo no válido');

export const esquemaLogin = z.object({
  email,
  password: z.string().min(1, 'Ingresa tu contraseña'),
});
export type DatosLogin = z.infer<typeof esquemaLogin>;

export const esquemaRegistro = z
  .object({
    email,
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
    confirmacion: z.string(),
  })
  .refine((d) => d.password === d.confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion'],
  });
export type DatosRegistro = z.infer<typeof esquemaRegistro>;

/** Monto en soles escrito por el usuario ("12,50" o "12.50"), > 0. */
const montoTexto = z
  .string()
  .trim()
  .min(1, 'Ingresa un monto')
  .refine((t) => !Number.isNaN(parsearSoles(t)), 'Monto no válido (máx. 2 decimales)')
  .refine((t) => parsearSoles(t) > 0, 'Debe ser mayor a cero');

export const esquemaProducto = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(80, 'Máximo 80 caracteres'),
  precio: montoTexto,
  /** Vacío = no controlar stock (null), igual que la web. */
  stock: z
    .string()
    .trim()
    .refine((t) => t === '' || /^-?\d+$/.test(t), 'Debe ser un número entero'),
  codigoBarras: z
    .string()
    .trim()
    .refine((t) => t === '' || /^[0-9A-Za-z\-.]{3,64}$/.test(t), 'Código no válido'),
});
export type DatosProducto = z.infer<typeof esquemaProducto>;

export const esquemaCliente = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(80, 'Máximo 80 caracteres'),
  telefono: z
    .string()
    .trim()
    .refine((t) => t === '' || /^[+\d\s-]{6,20}$/.test(t), 'Teléfono no válido'),
});
export type DatosCliente = z.infer<typeof esquemaCliente>;

export const esquemaMovimiento = z.object({
  monto: montoTexto,
  descripcion: z
    .string()
    .trim()
    .min(1, 'La descripción es obligatoria')
    .max(100, 'Máximo 100 caracteres'),
  metodoPago: z.enum(METODOS_PAGO_ABONO),
});
export type DatosMovimiento = z.infer<typeof esquemaMovimiento>;

export const esquemaNegocio = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  ruc: z
    .string()
    .trim()
    .refine((t) => t === '' || /^\d{11}$/.test(t), 'El RUC tiene 11 dígitos'),
  direccion: z.string().trim().max(120),
  telefono: z
    .string()
    .trim()
    .refine((t) => t === '' || /^[+\d\s-]{6,20}$/.test(t), 'Teléfono no válido'),
  diasVencimientoFiado: z
    .string()
    .trim()
    .refine((t) => /^\d+$/.test(t) && Number(t) >= 1 && Number(t) <= 365, 'Entre 1 y 365 días'),
});
export type DatosNegocio = z.infer<typeof esquemaNegocio>;
