import { query, where, getDocs, onSnapshot, Timestamp } from '../firebase.js?v=4.0'; // MODIFICADO
import { getVentasCol, getDeudasCol } from '../store.js?v=4.0'; // MODIFICADO
import { showToast, updateReporteUI } from '../ui.js?v=4.0'; // MODIFICADO

/**
 * Función principal que lee las fechas del DOM y llama a loadReporte.
 */
export function loadReporteDelDia() {
    const fechaInicioString = document.getElementById('reporte-fecha-inicio').value;
    const fechaFinString = document.getElementById('reporte-fecha-fin').value;

    if (!fechaInicioString || !fechaFinString) {
        // No mostramos toast aquí, es normal al cargar la app
        return;
    }

    const partsInicio = fechaInicioString.split('-').map(Number);
    const fechaInicio = new Date(partsInicio[0], partsInicio[1] - 1, partsInicio[2]);

    const partsFin = fechaFinString.split('-').map(Number);
    const fechaFin = new Date(partsFin[0], partsFin[1] - 1, partsFin[2]);

    if (fechaFin < fechaInicio) {
        showToast("La fecha de fin no puede ser anterior a la de inicio", true);
        return;
    }

    loadReporte(fechaInicio, fechaFin);
}

export function handleReporteDateChange() {
    loadReporteDelDia();
}
export function handleReporteRefreshClick() {
    loadReporteDelDia();
    showToast("Reporte actualizado");
}

/**
 * Variable global para almacenar los unsubscribe de los listeners
 */
let unsubscribeVentas = null;
let unsubscribeDeudas = null;

/**
 * Lógica principal para consultar y calcular el reporte por rango.
 * Ahora usa onSnapshot para actualizaciones en tiempo real.
 */
async function loadReporte(fechaInicio, fechaFin) {

    // Cancelar listeners anteriores si existen
    if (unsubscribeVentas) {
        unsubscribeVentas();
        unsubscribeVentas = null;
    }
    if (unsubscribeDeudas) {
        unsubscribeDeudas();
        unsubscribeDeudas = null;
    }

    const inicioTimestamp = Timestamp.fromDate(new Date(fechaInicio.setHours(0, 0, 0, 0)));
    const finTimestamp = Timestamp.fromDate(new Date(fechaFin.setHours(23, 59, 59, 999)));

    let totalGeneral = 0;
    let totalEfectivo = 0;
    let totalYape = 0;
    let totalFiado = 0;

    const productSalesMap = new Map();
    const dailySalesMap = new Map();

    // Función para recalcular totales
    function recalcularTotales(ventasSnapshot, deudasSnapshot) {
        // Resetear totales
        totalGeneral = 0;
        totalEfectivo = 0;
        totalYape = 0;
        totalFiado = 0;
        productSalesMap.clear();
        dailySalesMap.clear();

        // Procesar ventas
        ventasSnapshot.forEach(doc => {
            const venta = doc.data();
            let saleAmount = 0;

            if (venta.metodoDePago === 'Efectivo') {
                totalEfectivo += venta.total;
                saleAmount = venta.total;
            } else if (venta.metodoDePago === 'Yape/Plin') {
                totalYape += venta.total;
                saleAmount = venta.total;
            } else if (venta.metodoDePago === 'Fiado') {
                totalFiado += venta.total;
            }

            if (venta.items && Array.isArray(venta.items)) {
                venta.items.forEach(item => {
                    const currentQty = productSalesMap.get(item.nombre) || 0;
                    productSalesMap.set(item.nombre, currentQty + item.cantidad);
                });
            }

            if (venta.fecha && saleAmount > 0) {
                const dayKey = venta.fecha.toDate().toISOString().split('T')[0];
                const currentSales = dailySalesMap.get(dayKey) || 0;
                dailySalesMap.set(dayKey, currentSales + saleAmount);
            }
        });

        // Procesar deudas (pagos)
        deudasSnapshot.forEach(doc => {
            const deuda = doc.data();
            const pagoRecibido = Math.abs(deuda.monto);

            if (deuda.metodoPago === 'Efectivo') {
                totalEfectivo += pagoRecibido;
            } else if (deuda.metodoPago === 'Yape/Plin') {
                totalYape += pagoRecibido;
            }

            if (deuda.fecha) {
                const dayKey = deuda.fecha.toDate().toISOString().split('T')[0];
                const currentSales = dailySalesMap.get(dayKey) || 0;
                dailySalesMap.set(dayKey, currentSales + pagoRecibido);
            }
        });

        totalGeneral = totalEfectivo + totalYape;

        const top5Products = Array.from(productSalesMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const sortedDailySales = new Map([...dailySalesMap.entries()].sort());
        const chartLabels = Array.from(sortedDailySales.keys());
        const chartData = Array.from(sortedDailySales.values());

        updateReporteUI({
            totalGeneral,
            totalEfectivo,
            totalYape,
            totalFiado,
            top5Products,
            chartLabels,
            chartData
        });
    }

    try {
        const qVentas = query(getVentasCol(),
            where("fecha", ">=", inicioTimestamp),
            where("fecha", "<=", finTimestamp)
        );

        const qDeudas = query(getDeudasCol(),
            where("fecha", ">=", inicioTimestamp),
            where("fecha", "<=", finTimestamp),
            where("monto", "<", 0)
        );

        let ventasData = [];
        let deudasData = [];

        // Listener en tiempo real para ventas
        unsubscribeVentas = onSnapshot(qVentas, (snapshot) => {

            ventasData = snapshot.docs;
            recalcularTotales(ventasData, deudasData);
        }, (error) => {
            console.error("Error en listener de ventas:", error);
            showToast("Error al cargar ventas en tiempo real", true);
        });

        // Listener en tiempo real para deudas
        unsubscribeDeudas = onSnapshot(qDeudas, (snapshot) => {

            deudasData = snapshot.docs;
            recalcularTotales(ventasData, deudasData);
        }, (error) => {
            console.error("Error en listener de deudas:", error);
            showToast("Error al cargar pagos en tiempo real", true);
        });

    } catch (error) {
        console.error("Error al cargar reporte: ", error);
        showToast("Error al cargar el reporte", true);
    }
}