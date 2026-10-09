import {
  LayoutDashboard, BookOpen, Sparkles, FileUp, Images, ShieldCheck, Languages, ConciergeBell, QrCode,
  BarChart3, Palette, Users, Settings, Store, Bot, ScrollText, Circle, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, BookOpen, Sparkles, FileUp, Images, ShieldCheck, Languages, ConciergeBell, QrCode,
  BarChart3, Palette, Users, Settings, Store, Bot, ScrollText,
};

export function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  const I = ICONS[name] ?? Circle;
  return <I size={size} aria-hidden />;
}
