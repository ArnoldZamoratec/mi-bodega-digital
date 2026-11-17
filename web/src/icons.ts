/**
 * Íconos Lucide como SVG inline (trazo 1.75, IDENTIDAD/ux-web §2). Se importa cada ícono por
 * separado: el bundle solo lleva los que se usan. Cero emojis en la interfaz.
 */
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ChartColumn,
  Check,
  ChevronRight,
  CircleCheck,
  CirclePause,
  Coins,
  Copy,
  Eye,
  EyeOff,
  HandCoins,
  House,
  KeyRound,
  Lock,
  LogOut,
  MessageCircle,
  Minus,
  Moon,
  NotebookPen,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Receipt,
  Scale,
  Search,
  Settings,
  Smartphone,
  Store,
  Sun,
  Trash,
  TriangleExclamationPoint,
  Undo2,
  UserMinus,
  UserPlus,
  Users,
  Vault,
  WifiOff,
  X,
} from 'lucide';

type Nodo = [tag: string, attrs: Record<string, string | number | undefined>][];

const ICONOS = {
  'arrow-down-right': ArrowDownRight,
  'arrow-up-right': ArrowUpRight,
  banknote: Banknote,
  chart: ChartColumn,
  check: Check,
  'chevron-right': ChevronRight,
  'circle-check': CircleCheck,
  'circle-pause': CirclePause,
  coins: Coins,
  copy: Copy,
  eye: Eye,
  'eye-off': EyeOff,
  'hand-coins': HandCoins,
  house: House,
  key: KeyRound,
  lock: Lock,
  'log-out': LogOut,
  message: MessageCircle,
  minus: Minus,
  moon: Moon,
  notebook: NotebookPen,
  package: Package,
  'package-plus': PackagePlus,
  pencil: Pencil,
  plus: Plus,
  receipt: Receipt,
  scale: Scale,
  search: Search,
  settings: Settings,
  smartphone: Smartphone,
  store: Store,
  sun: Sun,
  trash: Trash,
  alert: TriangleExclamationPoint,
  undo: Undo2,
  'user-minus': UserMinus,
  'user-plus': UserPlus,
  users: Users,
  vault: Vault,
  'wifi-off': WifiOff,
  x: X,
} satisfies Record<string, Nodo>;

export type NombreIcono = keyof typeof ICONOS;

const attrs = (a: Record<string, string | number | undefined>): string =>
  Object.entries(a)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${String(v)}"`)
    .join(' ');

/** SVG decorativo (aria-hidden): el texto o el aria-label del botón dan el nombre. */
export function icono(nombre: NombreIcono, tam = 20, clase = ''): string {
  const hijos = (ICONOS[nombre] as Nodo).map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('');
  return `<svg class="ico ${clase}" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${hijos}</svg>`;
}
