# Rediseño web Bodegón Digital: dirección UX y emocional

Fecha: 2026-11-15. Fuentes: IDENTIDAD_VISUAL.md (marca), auditorías, skills anti-slop-design y visual-emotion-engineer.
Este documento manda sobre gustos personales. La marca (IDENTIDAD_VISUAL.md) manda sobre este documento.

## 1. Para quién diseñamos (estado emocional real)

| Momento | Quién y cómo está | Lo que siente | Lo que la interfaz debe hacerle sentir |
|---|---|---|---|
| Vendiendo | De pie, con cola de clientes, manos ocupadas, laptop vieja o celular gama media en el mostrador | Prisa, miedo a equivocarse frente al cliente | **Velocidad y control**: "esto no me deja mal parado" |
| Cerrando el día | Cansado, de noche | Incertidumbre: "¿gané o perdí?" | **Calma y orgullo**: "hoy vendí S/ 482, 12 % más que el martes pasado" |
| Cobrando fiado | Incómodo, es su vecino | Vergüenza de cobrar, miedo a perder la plata | **Respaldo y tacto**: la app cobra por él, con respeto |
| Revisando stock | Antes de ir al mercado o distribuidor | "¿Qué me falta?" | **Claridad**: lista de compras lista |

Principios psicológicos aplicados (sin manipular):
- **Ley de Hick y 1 a 3:** cada pantalla tiene una sola acción principal. En Vender es "Cobrar S/ X".
- **Aversión a la pérdida:** después de cada venta, "Deshacer" durante 6 s. Quita el miedo a equivocarse.
- **Progreso y orgullo:** el inicio muestra lo vendido hoy comparado con el mismo día de la semana anterior. Son datos reales, nada de cifras de vanidad.
- **Reencuadre sin vergüenza:** se dice "Por cobrar" y nunca "Deudores". El rojo ladrillo solo aparece cuando hay atraso real.
- **Carga cognitiva:** los montos son grandes y con números tabulares. Los textos son cortos y en voz activa ("Venta registrada", nunca "La operación se completó exitosamente").

## 2. Dirección visual: "mostrador ordenado"

No es una plantilla de SaaS verde. Usa los materiales del mundo del bodeguero:
- **Fondo kraft** (bolsa de papel) `#FAF7F2`, con superficies blancas para lo que se toca.
- **El ticket**: el carrito se ve como un ticket de papel térmico, con borde inferior dentado (CSS mask), líneas punteadas entre ítems y el total en grande. Es el único detalle "físico" de la interfaz; el resto es sobrio.
- **El cuaderno de fiados**: en Por cobrar, cada cliente es una fila con un renglón muy sutil. Nada de tarjetas con sombra.
- **Color con disciplina, proporción 60/30/10:**
  - Verde Bodegón `#0B6B4F`: navegación activa, montos positivos y confirmaciones.
  - Ámbar `#F5A524`: **solo** el botón Cobrar y el aviso de stock por acabarse.
  - Tinta `#1C1917`: el texto.
  - Ladrillo `#B42318`: atraso real de más de 15 días y errores.
  - El morado de Yape aparece solo como punto o etiqueta del método de pago, nunca como marca.
- **Tipografía:** Plus Jakarta Sans (400/500/600/800), una sola familia, con `font-variant-numeric: tabular-nums` en todo monto. Total del ticket entre 40 y 48 px en peso 800. Sin mayúsculas gritonas; etiquetas en sentence case.
- **Íconos:** Lucide en SVG inline con trazo de 1.75. **Cero emojis** en la interfaz.
- **Modo oscuro** pensado para la noche en la bodega: tokens propios, no una inversión de colores.

## 3. Estructura

- **Escritorio:** riel lateral de 72 px con íconos y etiqueta (Vender, Por cobrar, Productos, Caja\*, Reportes, Ajustes) y contenido a la derecha.
- **Móvil:** barra inferior con 5 destinos y botones de al menos 48 px.
- **Vender** (es la pantalla más usada, 85 %):
  - Escritorio: catálogo a la izquierda (≈ 65 %) en grilla de botones grandes con nombre, precio y stock pequeño, más el ticket fijo a la derecha (≈ 35 %).
  - Móvil: el ticket es una hoja inferior que muestra "3 productos · S/ 12.50 · Cobrar".
  - Búsqueda siempre enfocada. `/` enfoca la búsqueda, `Enter` agrega el primer resultado y `Ctrl+Enter` cobra.
  - Agregar un producto no tiene animación (0 ms): el total se actualiza al instante y el ítem parpadea 120 ms.
  - Método de pago con 3 botones segmentados grandes: Efectivo, Yape/Plin y Fiado. Con Fiado se pide elegir cliente, con búsqueda.
  - Con Efectivo aparece la **calculadora de vuelto**: "Paga con S/ 20 → Vuelto S/ 7.50", con atajos de billetes 10, 20, 50 y 100.
  - Confirmación en forma de "ticket impreso", con Deshacer y Nueva venta.
- **Hoy** (al iniciar sesión): "Hoy vendiste S/ X" en grande, la comparación con el mismo día de la semana pasada, "Por cobrar S/ Y" con el botón "Ver quién debe" y "Se acaban: 4 productos".
- **Por cobrar:**
  - Total por cobrar y lo recuperado este mes.
  - Lista ordenada por atraso, con chip de días.
  - Botón "Recordar por WhatsApp" que **muestra el mensaje antes de abrir WhatsApp** (respeto y control) y marca `ultimoRecordatorio`.
  - Detalle del cliente: historial como cuaderno, "Registrar abono" como acción principal y "Fiar sin venta" como secundaria.
- **Productos:** primero "Se acaban". Ajuste rápido de stock con −/+ y edición en panel lateral; no se usa un modal a pantalla completa.
- **Reportes:** un solo control de periodo arriba (chips Hoy, 7 días, Mes, Rango). Una franja de KPIs (Ingresos, Efectivo, Yape/Plin, Fiado nuevo), barras por día y top de productos con barras horizontales.
- **Login:** pantalla dividida.
  - Izquierda: la promesa en una línea ("Tu bodega en orden, también cuando no estás") y una vista previa real de un ticket.
  - Derecha: el formulario.
  - Errores en lenguaje humano ("Esa contraseña no coincide. ¿La recuperamos?").

\* Caja (D-28) ya está en la web, con paridad con la app: abrir con el sencillo (atajos 20/50/100/200), "Debería haber S/ X" con desglose, ingresos y egresos con motivo, cierre en un panel de la página con ayuda para contar billetes y monedas, e historial de cierres. El ladrillo solo aparece con un faltante de más de S/ 1. En el celular se llega desde el ícono de la cabecera y desde la línea de Hoy. Escribe en línea (como las ventas), con transacciones idempotentes.

## 4. Estados e interacción

- **Botones con 8 estados:** normal, hover, focus-visible (anillo verde de 2 px), active (`scale(.97)`), disabled, cargando (spinner dentro y texto "Registrando…"), error y éxito.
- **Movimiento:** 0 ms en acciones de alta frecuencia; 140–180 ms `cubic-bezier(.23,1,.32,1)` en hojas y paneles. Respeta `prefers-reduced-motion`.
- **Mientras carga:** esqueletos con la forma real, sin spinners de página completa.
- **Estados vacíos:** cada lista vacía dice qué hacer ("Agrega tu primer producto, toma 20 segundos") y tiene un botón.
- **Sin conexión:** franja discreta "Sin internet: tus ventas se guardan y se envían al volver".
- **Confirmaciones destructivas:** se piden dentro de la página, con un panel propio. Nunca con `confirm()`.

## 5. Ética (no negociable)

- Sin urgencia falsa, sin contadores ni "oferta termina en…".
- Los recordatorios de fiado no avergüenzan ni amenazan; el dueño siempre ve y aprueba el texto.
- Contraste AA mínimo, foco visible y `aria-label` en los botones de solo ícono.

## 6. Criterio de aceptación (compuerta de 7 ejes de anti-slop-design, ≥ 4 en cada uno)

1. Sin degradados morados, emojis, cifras de vanidad ni etiquetas superiores en mayúsculas en cada sección.
2. Una acción principal por zona y como máximo 3 secundarias.
3. Una familia tipográfica y números tabulares en todos los montos.
4. Grilla de 8 pt y radios anidados correctos (interior = exterior − padding).
5. Movimiento rápido y feedback táctil.
6. Accesibilidad AA y uso completo con teclado en Vender.
7. Móvil sin scroll horizontal y objetivos táctiles de 48 px o más.

## 7. Responsive: todos los equipos de una bodega

La web tiene que funcionar igual de bien en un Android barato de 320 px, un celular echado sobre el mostrador, una tablet o POS de 1024×600, una laptop vieja de 1366×768 y un monitor de 2560 px, también con la letra de Android al 130 % y con el zoom del navegador al 200 %.

**Sistema** (`web/css/app.css`, bloque "Sistema responsive"):
- Todas las medidas van en `rem`; los íconos también. La escala de fuente de Android y el zoom agrandan la interfaz completa, no solo el texto.
- Cortes de viewport (solo estos): 359 px (celulares de 320 px), 767 px (barra inferior si el alto es mayor de 500 px), **alto ≤ 500 px y ancho ≥ 560 px** (celular echado o zoom 200 %: riel compacto que se desplaza), 1023 px (tablets) y 1920 px (monitores grandes: el contenido se topa y el catálogo gana columnas).
- Container queries para lo que depende del espacio que le queda al componente: la forma de Vender (`vender`), el catálogo (`catalogo`), el ticket (`ticket`), la franja de KPI y gráficos de Reportes (`reportes`) y la cabecera móvil (`cabecera`).
- `@media (hover: hover)` para los efectos de hover; `(pointer: coarse)` sube los objetivos a 48 px y oculta las ayudas de teclado (`kbd`). Ninguna acción depende del hover.
- PWA instalada: `viewport-fit=cover` y `env(safe-area-inset-*)` en cabecera, barra inferior, riel, panel lateral, hoja del ticket, avisos e ingreso. `interactive-widget=resizes-content` y unidades `dvh` hacen que el teclado del celular achique la pantalla en vez de tapar los campos.
- `prefers-reduced-motion` apaga animaciones y transiciones.

**Vender** (la regla que no se rompe: el total grande y "Cobrar" se ven sin desplazar, en todos los equipos):
- Celular vertical (Vender con menos de 35 rem de ancho): catálogo y ticket como hoja inferior. Cerrada, la hoja muestra el total en grande y "Cobrar"; abierta, el total sigue en su cabecera y "Cobrar" queda abajo.
- Celular echado, tablet chica y POS (35 a 60 rem): riel compacto y dos columnas con un ticket angosto (sin cabecera del negocio cuando el alto es de 640 px o menos).
- Tablet y escritorio: catálogo y ticket fijo. El ticket nunca es más alto que la pantalla: primero cede la lista de ítems (se desplaza por dentro) y después el bloque de cobro, que se desplaza con "Cobrar" pegado abajo.

**Regresión automática:** `npm run test:responsive -w web` (Playwright, solo Chromium) levanta el servidor de desarrollo en modo demo y recorre 22 viewports (más 5 con letra al 130 %). En cada uno comprueba que ninguna pantalla tenga scroll horizontal y que en Vender, con 4 y con 14 ítems, el total y "Cobrar" estén completos en pantalla y sin nada encima. Necesita `npx playwright install chromium` una vez por máquina; por eso no forma parte de `npm run verify`. Para revisar a ojo cualquier tamaño en el Chrome de escritorio: `npm run dev -w web` y abrir `/dev-harness.html?w=360&h=640&fs=20.8&ruta=%2F%3Fdemo%3D1%23vender` (el arnés no entra al build).

Capturas de referencia: `docs/rediseno/responsive/`.
