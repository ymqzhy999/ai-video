import {
  Boxes,
  Braces,
  Combine,
  Cpu,
  Crop,
  Dices,
  FileText,
  Frame,
  Group,
  Hash,
  ImageDown,
  ImagePlus,
  Layers,
  MessageSquareText,
  Palette,
  Scaling,
  ShieldX,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  StickyNote,
  Type,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  Type,
  ImagePlus,
  Hash,
  MessageSquareText,
  ShieldX,
  Combine,
  WandSparkles,
  Palette,
  Scaling,
  Crop,
  SlidersHorizontal,
  Boxes,
  Layers,
  Sparkles,
  Cpu,
  SquareDashed,
  Dices,
  Frame,
  ImageDown,
  FileText,
  Workflow,
  Braces,
  StickyNote,
  Group,
};

interface NodeIconProps {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function NodeIcon({ name, size = 15, strokeWidth = 1.8, className }: NodeIconProps) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}
