import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { HelperText, Text } from 'react-native-paper';

import { mensajeDeError } from '@/data/firebase/errores';
import type { MovimientoFiado, Venta } from '@/domain/entities';
import { ErrorDominio } from '@/domain/errors';
import { formatearSoles, sumarSoles } from '@/domain/rules/dinero';
import {
  crearRango,
  generarReporte,
  rangoPredefinido,
  type RangoFechas,
} from '@/domain/rules/reportes';

import { Aparecer } from '../../components/Aparecer';
import { BannerConexion } from '../../components/BannerConexion';
import {
  ChipHero,
  DatoHero,
  EncabezadoHero,
  FilaDatosHero,
  sobreHero,
} from '../../components/EncabezadoHero';
import { EstadoVista } from '../../components/EstadoVista';
import { IconoSuave, type NombreIcono } from '../../components/IconoSuave';
import { SelectorFecha } from '../../components/SelectorFecha';
import { Tarjeta } from '../../components/Tarjeta';
import { useSaldos, useTema } from '../../hooks/useDerivados';
import type { PantallaTab } from '../../navigation/tipos';
import { useContenedor } from '../../stores/sesionStore';
import { familia } from '../../theme/tema';
import { espacio, NUMEROS, radio } from '../../theme/tokens';
import { ANCHO_CONTENIDO } from '../../theme/ventana';

type Periodo = 'hoy' | 'ayer' | 'semana' | 'mes' | 'personalizado';

const PERIODOS: { valor: Periodo; etiqueta: string }[] = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: 'ayer', etiqueta: 'Ayer' },
  { valor: 'semana', etiqueta: '7 días' },
  { valor: 'mes', etiqueta: 'Este mes' },
  { valor: 'personalizado', etiqueta: 'Rango' },
];

/**
 * Wireframe Reportes:
 *  [chips: Hoy · Ayer · 7 días · Este mes · Rango] ([desde] [hasta] si Rango)
 *  [Ingresos totales S/ ...]  [Efectivo] [Yape/Plin] [Fiado del periodo] [Por cobrar]
 *  [gráfico de ingresos por día]
 *  [Top 5 productos]
 * Actualización en tiempo real (onSnapshot), como la web v3.1+.
 */
export function ReportesScreen({ navigation }: PantallaTab<'Reportes'>) {
  const tema = useTema();
  const contenedor = useContenedor();
  // El gráfico se mide contra el contenido (tope de 840dp en tablets), no contra la ventana.
  const width = Math.min(useWindowDimensions().width, ANCHO_CONTENIDO.lista);
  const saldos = useSaldos();

  const hoy = useMemo(() => new Date(), []);
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);

  const rango = useMemo<RangoFechas | ErrorDominio>(() => {
    try {
      return periodo === 'personalizado'
        ? crearRango(desde, hasta)
        : rangoPredefinido(periodo, new Date());
    } catch (e) {
      return e instanceof ErrorDominio ? e : new ErrorDominio('RANGO_FECHAS_INVALIDO');
    }
  }, [periodo, desde, hasta]);

  // Los resultados se guardan junto al rango que los produjo: al cambiar de rango, los datos
  // anteriores dejan de coincidir y se muestra "cargando" sin resetear estado en el efecto.
  const [ventas, setVentas] = useState<{ rango: RangoFechas; datos: Venta[] } | null>(null);
  const [movs, setMovs] = useState<{ rango: RangoFechas; datos: MovimientoFiado[] } | null>(null);
  const [error, setError] = useState<{ rango: RangoFechas; mensaje: string } | null>(null);

  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (rango instanceof ErrorDominio) return;
    const onError = (e: Error) =>
      setError({ rango, mensaje: mensajeDeError(e, 'Error al cargar el reporte') });
    const c1 = contenedor.ventas.observarRango(
      rango,
      (datos) => setVentas({ rango, datos }),
      onError,
    );
    const c2 = contenedor.fiado.observarRango(rango, (datos) => setMovs({ rango, datos }), onError);
    return () => {
      c1();
      c2();
    };
    // `intento` vuelve a suscribir al tocar "Reintentar".
  }, [contenedor, rango, intento]);

  const reporte = useMemo(
    () =>
      !(rango instanceof ErrorDominio) && ventas?.rango === rango && movs?.rango === rango
        ? generarReporte(ventas.datos, movs.datos, rango)
        : null,
    [ventas, movs, rango],
  );
  const mensajeError = error && error.rango === rango ? error.mensaje : null;
  const porCobrar = useMemo(() => sumarSoles([...saldos.values()].filter((s) => s > 0)), [saldos]);

  const datosGrafico = useMemo(
    () =>
      (reporte?.serieDiaria ?? []).map((p) => ({
        value: p.ingresos,
        label: p.dia.slice(8, 10) + '/' + p.dia.slice(5, 7),
        dataPointText: p.ingresos.toFixed(0),
      })),
    [reporte],
  );

  let cuerpo;
  if (rango instanceof ErrorDominio) cuerpo = <HelperText type="error">{rango.message}</HelperText>;
  else if (mensajeError)
    cuerpo = (
      <EstadoVista
        tipo="error"
        titulo="No se pudo cargar el reporte"
        mensaje={mensajeError}
        accion={{
          etiqueta: 'Reintentar',
          onPress: () => {
            setError(null);
            setIntento((n) => n + 1);
          },
        }}
      />
    );
  else if (!reporte) cuerpo = <EstadoVista tipo="cargando" mensaje="Calculando…" />;
  else
    cuerpo = (
      <Aparecer style={estilos.bloques}>
        <Distribucion
          partes={[
            // Solo ventas (sin abonos): suma exactamente "Vendido" y no se confunde con
            // los ingresos del encabezado, que sí incluyen cobros de fiado.
            {
              etiqueta: 'Efectivo',
              valor: reporte.ventasEfectivo,
              color: tema.extra.pagos.efectivo,
            },
            { etiqueta: 'Yape/Plin', valor: reporte.ventasYape, color: tema.extra.pagos.yape },
            { etiqueta: 'Fiado', valor: reporte.totalFiado, color: tema.extra.pagos.fiado },
          ]}
        />

        <View style={estilos.grid}>
          <Kpi titulo="Efectivo que entró" valor={reporte.totalEfectivo} icono="cash" />
          <Kpi titulo="Yape/Plin que entró" valor={reporte.totalYape} icono="cellphone" />
          {/* El rojo solo cuando hay algo que atender: S/ 0.00 en rojo alarma sin motivo. */}
          <Kpi
            titulo="Fiado del periodo"
            valor={reporte.totalFiado}
            icono="notebook-outline"
            color={reporte.totalFiado > 0 ? tema.extra.deuda : undefined}
          />
          <Kpi
            titulo="Por cobrar (total)"
            valor={porCobrar}
            icono="timer-sand"
            color={porCobrar > 0 ? tema.extra.deuda : undefined}
          />
        </View>

        <Tarjeta style={estilos.seccion}>
          <Text variant="titleMedium">Ingresos por día</Text>
          {datosGrafico.length === 0 ? (
            <Text style={{ color: tema.colors.onSurfaceVariant }}>
              Sin ingresos en este periodo.
            </Text>
          ) : (
            <View
              accessible
              accessibilityLabel={`Gráfico de ingresos: ${reporte.serieDiaria.map((p) => `${p.dia} ${formatearSoles(p.ingresos)}`).join(', ')}`}
            >
              <LineChart
                data={
                  datosGrafico.length === 1
                    ? [{ value: 0, label: '' }, ...datosGrafico]
                    : datosGrafico
                }
                width={width - 112}
                height={180}
                areaChart
                curved
                thickness={3}
                color={tema.colors.primary}
                startFillColor={tema.colors.primary}
                endFillColor={tema.colors.primary}
                startOpacity={0.28}
                endOpacity={0.02}
                dataPointsColor={tema.colors.primary}
                dataPointsRadius={4}
                yAxisTextStyle={{
                  color: tema.colors.onSurfaceVariant,
                  fontSize: 10,
                  fontFamily: familia.medio,
                }}
                xAxisLabelTextStyle={{
                  color: tema.colors.onSurfaceVariant,
                  fontSize: 10,
                  fontFamily: familia.medio,
                }}
                rulesType="dashed"
                dashWidth={4}
                dashGap={6}
                rulesColor={tema.colors.outlineVariant}
                yAxisThickness={0}
                xAxisThickness={0}
                noOfSections={4}
                spacing={Math.max(40, (width - 140) / Math.max(datosGrafico.length, 2))}
                initialSpacing={12}
                isAnimated={false}
              />
            </View>
          )}
        </Tarjeta>

        <Tarjeta style={estilos.seccion}>
          <Text variant="titleMedium">Top 5 productos más vendidos</Text>
          {reporte.topProductos.length === 0 ? (
            <Text style={{ color: tema.colors.onSurfaceVariant }}>
              No hay datos de productos para este periodo.
            </Text>
          ) : (
            reporte.topProductos.map((p, i) => {
              const maximo = reporte.topProductos[0]?.cantidad || 1;
              return (
                <View key={p.nombre} style={estilos.top}>
                  <View
                    style={[
                      estilos.puesto,
                      {
                        backgroundColor: i === 0 ? tema.colors.primary : tema.colors.surfaceVariant,
                      },
                    ]}
                  >
                    <Text
                      variant="labelMedium"
                      style={{
                        color: i === 0 ? tema.colors.onPrimary : tema.colors.onSurfaceVariant,
                      }}
                    >
                      {i + 1}
                    </Text>
                  </View>
                  <View style={estilos.flex}>
                    <View style={estilos.topFila}>
                      <Text variant="bodyLarge" style={estilos.flex} numberOfLines={1}>
                        {p.nombre}
                      </Text>
                      <Text variant="labelLarge" style={{ color: tema.colors.onSurface }}>
                        {p.cantidad} Uds.
                      </Text>
                    </View>
                    <View
                      style={[estilos.barraFondo, { backgroundColor: tema.colors.surfaceVariant }]}
                    >
                      <View
                        style={[
                          estilos.barraValor,
                          {
                            backgroundColor: tema.colors.primary,
                            width: `${Math.max(6, (p.cantidad / maximo) * 100)}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </Tarjeta>
      </Aparecer>
    );

  return (
    <View style={[estilos.flex, { backgroundColor: tema.colors.background }]}>
      <ScrollView contentContainerStyle={estilos.scroll}>
        <EncabezadoHero antetitulo="Tu negocio en números" titulo="Reportes">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={estilos.chips}
          >
            {PERIODOS.map((p) => (
              <ChipHero
                key={p.valor}
                etiqueta={p.etiqueta}
                activo={periodo === p.valor}
                onPress={() => setPeriodo(p.valor)}
                testID={`periodo-${p.valor}`}
              />
            ))}
          </ScrollView>
          <View style={estilos.total}>
            <Text variant="labelLarge" style={{ color: sobreHero.tenue }}>
              Ingresos · Efectivo + Yape/Plin
            </Text>
            <Text
              variant="displaySmall"
              style={[NUMEROS, { color: sobreHero.texto }]}
              testID="reporte-total"
            >
              {reporte ? formatearSoles(reporte.totalIngresos) : '—'}
            </Text>
            {reporte && reporte.totalAbonos > 0 ? (
              <Text variant="bodySmall" style={{ color: sobreHero.tenue }}>
                Incluye {formatearSoles(reporte.totalAbonos)} cobrados de fiado
              </Text>
            ) : null}
          </View>
          <FilaDatosHero>
            <DatoHero
              etiqueta="Ventas"
              valor={reporte ? String(reporte.cantidadVentas) : '—'}
              onPress={() => navigation.navigate('HistorialVentas')}
              testID="reporte-ver-ventas"
            />
            <DatoHero
              etiqueta="Ticket promedio"
              valor={reporte ? formatearSoles(reporte.ticketPromedio) : '—'}
            />
          </FilaDatosHero>
        </EncabezadoHero>
        <BannerConexion onPress={() => navigation.navigate('VentasPendientes')} />
        <View style={estilos.contenido}>
          {periodo === 'personalizado' ? (
            <Tarjeta style={estilos.fechas}>
              <SelectorFecha etiqueta="Desde" valor={desde} maximo={hoy} onCambiar={setDesde} />
              <Text style={{ color: tema.colors.onSurfaceVariant }}>→</Text>
              <SelectorFecha etiqueta="Hasta" valor={hasta} maximo={hoy} onCambiar={setHasta} />
            </Tarjeta>
          ) : null}
          {cuerpo}
        </View>
      </ScrollView>
    </View>
  );
}

/** Barra apilada: qué parte de lo vendido entró por cada medio de pago. */
function Distribucion({
  partes,
}: {
  partes: { etiqueta: string; valor: number; color: string }[];
}) {
  const tema = useTema();
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <Tarjeta style={estilos.seccion}>
      <View style={estilos.topFila}>
        <Text variant="titleMedium" style={estilos.flex}>
          Cómo se vendió
        </Text>
        <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
          {formatearSoles(total)}
        </Text>
      </View>
      <View style={[estilos.apilada, { backgroundColor: tema.colors.surfaceVariant }]}>
        {total > 0
          ? partes
              .filter((p) => p.valor > 0)
              .map((p) => (
                <View
                  key={p.etiqueta}
                  style={{ flex: p.valor / total, backgroundColor: p.color }}
                />
              ))
          : null}
      </View>
      <View style={estilos.leyenda}>
        {partes.map((p) => (
          <View
            key={p.etiqueta}
            style={estilos.leyendaItem}
            accessible
            accessibilityLabel={`${p.etiqueta}: ${formatearSoles(p.valor)}`}
          >
            <View style={[estilos.puntoLeyenda, { backgroundColor: p.color }]} />
            <Text variant="labelMedium" style={{ color: tema.colors.onSurfaceVariant }}>
              {p.etiqueta}
            </Text>
            <Text variant="labelMedium" style={{ color: tema.colors.onSurface }}>
              {total > 0 ? `${Math.round((p.valor / total) * 100)}%` : '0%'}
            </Text>
          </View>
        ))}
      </View>
    </Tarjeta>
  );
}

function Kpi({
  titulo,
  valor,
  icono,
  color,
}: {
  titulo: string;
  valor: number;
  icono: NombreIcono;
  color?: string;
}) {
  const tema = useTema();
  const deuda = color === tema.extra.deuda;
  return (
    <Tarjeta
      style={estilos.kpi}
      accessible
      accessibilityLabel={`${titulo}: ${formatearSoles(valor)}`}
    >
      <IconoSuave
        nombre={icono}
        tamano={32}
        color={deuda ? tema.extra.deuda : tema.colors.primary}
        fondo={deuda ? tema.extra.fondoDeuda : tema.colors.secondaryContainer}
      />
      <Text variant="labelMedium" style={{ color: tema.colors.onSurfaceVariant }}>
        {titulo}
      </Text>
      <Text variant="titleLarge" style={[NUMEROS, { color: color ?? tema.colors.onSurface }]}>
        {formatearSoles(valor)}
      </Text>
    </Tarjeta>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: espacio.xl },
  contenido: {
    padding: espacio.md,
    gap: espacio.md,
    width: '100%',
    maxWidth: ANCHO_CONTENIDO.lista,
    alignSelf: 'center',
  },
  bloques: { gap: espacio.md },
  // Aire al final para que el último chip ("Rango") no quede cortado contra el borde.
  chips: { gap: espacio.xs, paddingRight: espacio.lg, paddingVertical: espacio.xxs },
  total: { gap: 2 },
  fechas: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.xs,
    padding: espacio.sm,
  },
  apilada: {
    flexDirection: 'row',
    height: 12,
    borderRadius: radio.completo,
    overflow: 'hidden',
    gap: 2,
  },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.md },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  puntoLeyenda: { width: 10, height: 10, borderRadius: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm },
  kpi: { flexBasis: '47%', flexGrow: 1, padding: espacio.md, gap: espacio.xs },
  seccion: { padding: espacio.md, gap: espacio.sm, overflow: 'hidden' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    paddingVertical: espacio.xxs,
  },
  topFila: { flexDirection: 'row', alignItems: 'center', gap: espacio.xs },
  puesto: {
    width: 28,
    height: 28,
    borderRadius: radio.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barraFondo: {
    height: 6,
    borderRadius: radio.completo,
    marginTop: espacio.xxs,
    overflow: 'hidden',
  },
  barraValor: { height: 6, borderRadius: radio.completo },
});
