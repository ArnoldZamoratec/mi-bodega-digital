import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ambar, kraft, verde } from '../theme/paleta';

type Variante = 'color' | 'blanco' | 'monocromo';

interface Props {
  tamano?: number;
  variante?: Variante;
  /** Solo aplica a la variante monocromo. */
  color?: string;
  /** Si se pasa, el símbolo deja de ser decorativo y se anuncia con este texto. */
  accessibilityLabel?: string;
}

// Geometría del símbolo (misma que assets/brand/*.svg, lienzo de 1024).
const RIEL = 'M206 160H818A38 38 0 0 1 856 198V236H168V198A38 38 0 0 1 206 160Z';
const FRANJAS = [
  'M192 224H320V316A64 64 0 0 1 192 316Z',
  'M320 224H448V316A64 64 0 0 1 320 316Z',
  'M448 224H576V316A64 64 0 0 1 448 316Z',
  'M576 224H704V316A64 64 0 0 1 576 316Z',
  'M704 224H832V316A64 64 0 0 1 704 316Z',
];
const LETRA =
  'M336 412H602A108 108 0 0 1 602 628H626A118 118 0 0 1 626 864H336A56 56 0 0 1 280 808V468A56 56 0 0 1 336 412Z' +
  'M412 508H571A39 39 0 0 1 571 586H412A16 16 0 0 1 396 570V524A16 16 0 0 1 412 508Z' +
  'M412 670H591A49 49 0 0 1 591 768H412A16 16 0 0 1 396 752V686A16 16 0 0 1 412 670Z';

function colores(variante: Variante, color?: string) {
  if (variante === 'color') return { cuerpo: verde[600], raya: ambar[400], mono: false };
  if (variante === 'blanco') return { cuerpo: kraft[0], raya: ambar[400], mono: false };
  const unico = color ?? kraft[900];
  return { cuerpo: unico, raya: unico, mono: true };
}

/** Símbolo de marca: toldo de bodega a rayas sobre una "B" redondeada. */
export function SimboloBodegon({
  tamano = 48,
  variante = 'color',
  color,
  accessibilityLabel,
}: Props) {
  const { cuerpo, raya, mono } = colores(variante, color);
  const decorativo = !accessibilityLabel;
  return (
    <View
      accessible={!decorativo}
      accessibilityRole={decorativo ? undefined : 'image'}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={decorativo ? 'no-hide-descendants' : 'yes'}
      accessibilityElementsHidden={decorativo}
      style={{ width: tamano, height: tamano }}
    >
      <Svg width={tamano} height={tamano} viewBox="152 152 720 720">
        <Path d={RIEL} fill={cuerpo} />
        {FRANJAS.map((d, i) => {
          const acento = i % 2 === 0;
          // En monocromo las franjas claras se dejan vacías para conservar el rayado.
          if (mono && !acento) return null;
          return <Path key={d} d={d} fill={acento ? raya : cuerpo} />;
        })}
        <Path d={LETRA} fill={cuerpo} fillRule="evenodd" />
      </Svg>
    </View>
  );
}
