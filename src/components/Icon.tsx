import {
  Anchor, ArrowDownRight, ArrowUpRight, Bell, Boxes, Camera, ChartGantt, Check, ChevronDown, CircleCheck, CircleDollarSign,
  CircleHelp, CircleX, ClipboardCheck, Ellipsis, ExternalLink, Factory, FilePlus2, FileText, Heart, History, Layers,
  LayoutGrid, LoaderCircle, Mail, MoveHorizontal, PackageCheck, Plane, Plus, Receipt, RotateCcw, Route, Search, Send,
  Settings, Ship, Sparkles, Star, Store, Truck, Wallet, ZoomIn, ZoomOut, type LucideIcon,
} from 'lucide-react';

/** One outline icon family across the app chrome (1.6px stroke). */
const ICONS: Record<string, LucideIcon> = {
  anchor: Anchor,
  'arrow-up': ArrowUpRight,
  'arrow-down': ArrowDownRight,
  bell: Bell,
  boxes: Boxes,
  camera: Camera,
  timeline: ChartGantt,
  check: Check,
  chevron: ChevronDown,
  'circle-check': CircleCheck,
  dollar: CircleDollarSign,
  help: CircleHelp,
  'circle-x': CircleX,
  clipboard: ClipboardCheck,
  more: Ellipsis,
  external: ExternalLink,
  factory: Factory,
  'file-plus': FilePlus2,
  file: FileText,
  heart: Heart,
  history: History,
  layers: Layers,
  grid: LayoutGrid,
  spinner: LoaderCircle,
  mail: Mail,
  fit: MoveHorizontal,
  received: PackageCheck,
  plane: Plane,
  plus: Plus,
  receipt: Receipt,
  reset: RotateCcw,
  route: Route,
  search: Search,
  send: Send,
  settings: Settings,
  ship: Ship,
  sparkles: Sparkles,
  star: Star,
  store: Store,
  truck: Truck,
  wallet: Wallet,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut,
};

export function Icon({ name, size = 18, spin = false, className = '' }: { name: string; size?: number; spin?: boolean; className?: string }) {
  const C = ICONS[name] ?? CircleHelp;
  return <C size={size} strokeWidth={1.6} className={`ico ${spin ? 'spin' : ''} ${className}`} aria-hidden />;
}
