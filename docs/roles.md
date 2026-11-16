# Cajeros y roles: diseño (D-33)

Fecha: 2026-11-15. Estado: aprobado por dirección técnica. Implementación por fases.

## Decisión principal: sin migración de datos

- **bodegaId = uid del dueño.** Los datos siguen en `artifacts/mi-bodega-app/users/{duenoUid}/{productos,clientes,ventas,deudas,cajas,config}`.
- **Por qué:** mover datos a `bodegas/{id}` exige copiar documentos desde el cliente (no hay Cloud Functions) con riesgo de pérdidas. Además, las versiones antiguas de la app y la web dejarían de funcionar para los dueños.
- **Consecuencia:** un cajero trabaja **dentro de la ruta del dueño**. Las reglas le dan acceso si es miembro activo.

## Modelo

| Ruta | Campos | Quién escribe |
|---|---|---|
| `users/{dueno}/miembros/{uid}` | `rol: 'cajero'`, `nombre` (≤60), `email` (≤120), `activo: bool`, `desde: timestamp`, `invitacion: string` | Lo crea el cajero al aceptar una invitación válida. El dueño solo puede cambiar `activo` y `nombre`, o borrarlo |
| `artifacts/mi-bodega-app/invitaciones/{codigo}` | `dueno: uid`, `rol: 'cajero'`, `creada: timestamp`, `expira: timestamp` (≤ 7 días), `usadaPor: uid \| null`, `nombreBodega` (≤120) | Lo crea el dueño. El cajero solo marca `usadaPor = su uid`, una vez y antes de que expire |
| `artifacts/mi-bodega-app/cuentas/{uid}` | `bodega: duenoUid`, `rol: 'cajero'` | Lo escribe el cajero al aceptar, solo si el miembro correspondiente existe (`existsAfter`) |

- **Código de invitación:** 8 caracteres sin ambiguos (sin 0/O/1/I/L), generado en el cliente. El dueño lo comparte por WhatsApp. **No se envían correos.**
- **Dueño:** cualquier usuario sin documento `cuentas/{uid}` es dueño de su propia ruta, como hoy. Un cajero no puede ser dueño de otra bodega a la vez en esta versión: una cuenta pertenece a una sola bodega.
- **Límite:** máximo 3 cajeros activos por bodega (el plan Pro dice "hasta 3"). Las reglas no pueden contar, así que la app lo valida y lo documenta. Ver "Pendiente".

## Permisos (aplicados en las reglas; la interfaz solo los refleja)

| Acción | Dueño | Cajero |
|---|---|---|
| Ver productos y clientes | ✓ | ✓ |
| Crear o editar productos (precio, nombre, stock manual) | ✓ | ✗ |
| Descontar stock al vender (solo `stock` vía increment) | ✓ | ✓ |
| Crear clientes | ✓ | ✓ (para poder fiar) |
| Editar o borrar clientes | ✓ | ✗ |
| Registrar venta | ✓ | ✓, con `vendidoPor == auth.uid` obligatorio |
| Anular venta (contraasiento) | ✓ | ✗ |
| Ver ventas | ✓ | ✓ (las necesita la caja). La app oculta los reportes |
| Fiar (cargo por venta) y registrar abonos | ✓ | ✓, con `registradoPor == auth.uid` |
| Fiar sin venta (cargo manual) | ✓ | ✗ |
| Borrar movimientos de fiado | ✓ | ✗ |
| Marcar recordatorio (`ultimoRecordatorio`) | ✓ | ✓ |
| Caja: abrir, movimientos, cerrar | ✓ | ✓, con `abiertaPor`/`registradoPor` = su uid |
| Configuración del negocio | ✓ | solo lectura |
| Invitar, desactivar o borrar cajeros | ✓ | ✗ |
| Reportes y ganancias | ✓ | oculto en la app (no es secreto a nivel de reglas: el cajero puede leer ventas) |

- **Cajero desactivado** (`activo: false`) o borrado: pierde **todo** acceso de inmediato. Las reglas comprueban `activo == true` en cada operación.
- **Auditoría:** ventas, abonos y movimientos de caja guardan quién los hizo (`vendidoPor` + `vendidoPorNombre`, etc.). En la app y la web, el dueño ve "Vendió: Rosa" en el historial y en el cierre de caja.
- **Compatibilidad:** los campos de autoría son **opcionales para el dueño** (las versiones viejas no los escriben) y **obligatorios para el cajero**.

## Flujo

1. **Dueño → Ajustes → Equipo → "Invitar cajero":** se genera un código y un mensaje de WhatsApp listo para enviar ("Hola, te invito a vender en Bodega Lucho con Bodegón. Descarga la app y usa el código ABCD-EFGH").
2. **Cajero:** se registra (correo o Google), elige "Tengo un código de invitación" y lo escribe. Una transacción hace tres cosas: marca la invitación como usada, crea `miembros/{uid}` y crea `cuentas/{uid}`.
3. **La app del cajero** lee `cuentas/{uid}` al iniciar sesión y usa `users/{bodega}` como raíz de datos. Su interfaz no muestra reportes, inventario editable, ajustes del negocio ni equipo.
4. **Dueño → Equipo:** lista de cajeros, con quién vendió cuánto hoy, interruptor de activo y botón para quitar.

## Fases

1. **Base:** core (permisos como funciones puras), reglas, pruebas de reglas y documentación. Se despliega primero en dev.
2. **Interfaz:** web y móvil en paralelo (Equipo, aceptar invitación, interfaz según el rol, autoría en historial y caja).
3. **Prueba con dos cuentas reales en dev** (el dueño y un cajero de prueba que el usuario crea) y luego producción.

## Pendiente (fuera de esta versión)

- Límite de 3 cajeros y el plan Pro **aplicados en el servidor**: requieren Cloud Functions (plan Blaze) o un contador en el documento del dueño.
- Varias bodegas por cuenta y cajeros que trabajan en dos bodegas.
- Ocultar ventas al cajero a nivel de reglas: requiere un resumen de caja en el servidor.
