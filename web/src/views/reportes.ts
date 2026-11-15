import { ErrorDominio, hoyLima, type MovimientoFiado, type Venta } from '@bodegon/core';
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';

import { fuente } from '../datos';
import { esc, esqueletoFilas, soles, vacio } from '../dom';
import { icono } from '../icons';
import type { Cancelar } from '../listeners';
import {
  diasDelPeriodo,
  etiquetaCorta,
  PERIODOS,
  rangoDelPeriodo,
  type DiasPeriodo,
  type Periodo,
} from '../logic/periodos';
import { anchosTop, calcularTotales, serieCompleta, type TotalesReporte } from '../logic/reporte';
import { alCambiarTema } from '../theme';

// Chart.js por npm: solo lo que usa el gráfico de barras.
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

/**
 * Reportes: UN control de periodo arriba (Hoy / 7 días / Mes / Rango) que manda sobre todo,
 * una franja de KPIs, barras por día y el top de productos en barras horizontales.
 */
let raiz: HTMLElement | null = null;
let periodo: Periodo = '7dias';
let rango: DiasPeriodo = { desde: hoyLima(), hasta: hoyLima() };
let cancelar: Cancelar | null = null;
let ultimo: { totales: TotalesReporte; dias: DiasPeriodo } | null = null;
let grafico: Chart<'bar'> | null = null;

const token = (nombre: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || '#0b6b4f';

function pintarControles(): void {
  const c = raiz?.querySelector('#periodo-control');
  if (!c) return;
  c.innerHTML = `
    <div class="segmentado" role="group" aria-label="Periodo del reporte">
      ${PERIODOS.map((p) => `<button type="button" data-periodo="${p.id}" aria-pressed="${p.id === periodo}">${esc(p.etiqueta)}</button>`).join('')}
    </div>
    ${
      periodo === 'rango'
        ? `<div class="rango-fechas">
            <label class="sr-only" for="rango-desde">Desde</label>
            <input type="date" id="rango-desde" class="entrada" value="${esc(rango.desde)}" max="${esc(hoyLima())}">
            <span class="texto-sec">a</span>
            <label class="sr-only" for="rango-hasta">Hasta</label>
            <input type="date" id="rango-hasta" class="entrada" value="${esc(rango.hasta)}" max="${esc(hoyLima())}">
          </div>`
        : ''
    }`;
}

function cargar(): void {
  cancelar?.();
  cancelar = null;
  const cuerpo = raiz?.querySelector('#reporte-cuerpo');
  const errorEl = raiz?.querySelector<HTMLElement>('#reporte-error');
  if (errorEl) errorEl.hidden = true;
  let r;
  const dias = diasDelPeriodo(periodo, new Date(), rango);
  try {
    r = rangoDelPeriodo(periodo, new Date(), rango);
  } catch (error) {
    if (errorEl) {
      errorEl.innerHTML = `${icono('alert', 18)}<span>${esc(error instanceof ErrorDominio ? error.message : 'Revisa las fechas del rango.')}</span>`;
      errorEl.hidden = false;
    }
    return;
  }
  ultimo = null;
  if (cuerpo) cuerpo.innerHTML = esqueletoReporte();
  try {
    cancelar = fuente().observarRango(
      r,
      (ventas: Venta[], movimientos: MovimientoFiado[]) => {
        ultimo = { totales: calcularTotales(ventas, movimientos, r), dias };
        pintar();
      },
      (m) => {
        if (errorEl) {
          errorEl.innerHTML = `${icono('alert', 18)}<span>${esc(m)}</span>`;
          errorEl.hidden = false;
        }
      },
    );
  } catch (error) {
    console.error('Error al cargar el reporte:', error);
  }
}

const esqueletoReporte = (): string => `
  <div class="esqueleto" style="height:104px;border-radius:16px;margin-bottom:24px" aria-hidden="true"></div>
  <div class="analisis">
    <div class="esqueleto" style="height:360px;border-radius:16px" aria-hidden="true"></div>
    <div class="superficie">${esqueletoFilas(5, 'esq-linea')}</div>
  </div>`;

function kpi(etiqueta: string, valor: number, extra = '', nota = ''): string {
  return `
    <div class="kpi">
      <p class="kpi-etiqueta">${extra}${esc(etiqueta)}</p>
      <p class="kpi-valor monto-grande">${esc(soles(valor))}</p>
      ${nota ? `<p class="kpi-nota">${esc(nota)}</p>` : ''}
    </div>`;
}

function pintar(): void {
  const cuerpo = raiz?.querySelector('#reporte-cuerpo');
  if (!cuerpo || !ultimo) return;
  const { totales: t, dias } = ultimo;
  const ventasTxt = t.cantidadVentas === 1 ? '1 venta' : `${t.cantidadVentas} ventas`;
  const top = t.top5Products;
  const anchos = anchosTop(top);
  const sinDatos = t.totalGeneral === 0 && t.totalFiado === 0 && t.cantidadVentas === 0;

  cuerpo.innerHTML = `
    <section class="franja-kpi" aria-label="Resumen del periodo">
      ${kpi('Ingresos', t.totalGeneral, '', `${ventasTxt}${t.totalAbonos > 0 ? `, incluye ${soles(t.totalAbonos)} de abonos` : ''}`)}
      ${kpi('Efectivo', t.totalEfectivo, '<span class="punto" style="background:var(--primario)"></span>')}
      ${kpi('Yape/Plin', t.totalYape, '<span class="punto" style="background:var(--yape)"></span>')}
      ${kpi('Fiado nuevo', t.totalFiado, '<span class="punto" style="background:var(--deuda)"></span>', 'Aún no es ingreso')}
    </section>
    ${
      sinDatos
        ? `<div class="superficie">${vacio({
            icono: 'chart',
            titulo: 'No hay ventas en este periodo',
            texto: 'Elige otro periodo arriba, o registra una venta y aparecerá aquí al momento.',
            accion: { etiqueta: 'Ir a vender', atributo: 'data-ir="vender"' },
          })}</div>`
        : `
    <div class="analisis">
      <section class="superficie" aria-labelledby="t-dias">
        <h2 class="titulo-seccion" id="t-dias">Ingresos por día</h2>
        <div class="grafico"><canvas id="grafico-dias" role="img" aria-label="Barras de ingresos por día"></canvas></div>
      </section>
      <section class="superficie" aria-labelledby="t-top">
        <h2 class="titulo-seccion" id="t-top">Lo que más se vende</h2>
        ${
          top.length
            ? `<ol class="top-lista">${top
                .map(
                  ([nombre, cant], i) => `
              <li class="top-fila">
                <span class="top-nombre">${esc(nombre)}</span>
                <span class="top-cant">${esc(cant)} u.</span>
                <span class="top-barra" aria-hidden="true"><span style="width:${anchos[i] ?? 0}%"></span></span>
              </li>`,
                )
                .join('')}</ol>`
            : '<p class="texto-sec">Sin productos vendidos en este periodo.</p>'
        }
      </section>
    </div>`
    }`;
  if (!sinDatos) dibujarGrafico(t, dias);
}

function dibujarGrafico(t: TotalesReporte, dias: DiasPeriodo): void {
  const canvas = raiz?.querySelector<HTMLCanvasElement>('#grafico-dias');
  const ctx = canvas?.getContext('2d');
  grafico?.destroy();
  grafico = null;
  if (!ctx) return;
  const serie = serieCompleta(t, dias);
  // Colores del gráfico desde los tokens del tema (claro/oscuro).
  const texto2 = token('--texto-2');
  const borde = token('--borde');
  grafico = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: serie.map((p) => etiquetaCorta(p.dia)),
      datasets: [
        {
          label: 'Ingresos',
          data: serie.map((p) => p.ingresos),
          backgroundColor: token('--primario'),
          hoverBackgroundColor: token('--primario-hover'),
          borderRadius: 6,
          maxBarThickness: 40,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          grid: { display: false },
          border: { color: borde },
          ticks: { color: texto2, font: { family: 'Plus Jakarta Sans Variable', size: 12, weight: 600 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: borde },
          border: { display: false },
          ticks: {
            color: texto2,
            font: { family: 'Plus Jakarta Sans Variable', size: 12 },
            callback: (v) => soles(Number(v)),
            maxTicksLimit: 5,
          },
        },
      },
      plugins: {
        tooltip: {
          backgroundColor: token('--texto'),
          titleColor: token('--fondo'),
          bodyColor: token('--fondo'),
          displayColors: false,
          callbacks: { label: (c) => soles(c.parsed.y ?? 0) },
        },
      },
    },
  });
}

export function montarReportes(contenedor: HTMLElement): void {
  raiz = contenedor;
  contenedor.innerHTML = `
    <div class="vista">
      <div class="cabecera-vista" style="margin-bottom:8px">
        <h1 class="titulo-pagina">Reportes</h1>
      </div>
      <div class="barra-periodo" id="periodo-control"></div>
      <p class="mensaje-error" id="reporte-error" role="alert" hidden></p>
      <div id="reporte-cuerpo"></div>
    </div>`;
  contenedor.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-periodo]');
    if (!b?.dataset.periodo) return;
    periodo = b.dataset.periodo as Periodo;
    if (periodo === 'rango') rango = diasDelPeriodo('7dias', new Date());
    pintarControles();
    cargar();
  });
  contenedor.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'rango-desde') rango = { ...rango, desde: t.value };
    else if (t.id === 'rango-hasta') rango = { ...rango, hasta: t.value };
    else return;
    cargar();
  });
  alCambiarTema(() => {
    if (ultimo && raiz?.querySelector('#grafico-dias')) dibujarGrafico(ultimo.totales, ultimo.dias);
  });
  pintarControles();
}

export function mostrarReportes(): void {
  if (!cancelar) cargar();
}

/** Logout. */
export function reiniciarReportes(): void {
  cancelar = null; // el registro global ya cerró el listener
  ultimo = null;
  grafico?.destroy();
  grafico = null;
  periodo = '7dias';
}
