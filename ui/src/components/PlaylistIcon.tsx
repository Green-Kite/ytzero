import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Bell,
  Bike,
  BookOpen,
  Bookmark,
  Bot,
  Brain,
  Briefcase,
  Brush,
  Building2,
  Calendar,
  Camera,
  Car,
  ChartBar,
  CheckCircle,
  Clapperboard,
  Clock,
  Cloud,
  Code2,
  Coffee,
  Cpu,
  Database,
  Dumbbell,
  Eye,
  Film,
  Flame,
  Folder,
  Gamepad2,
  Gem,
  Globe,
  GraduationCap,
  Hammer,
  Hash,
  Headphones,
  Heart,
  Home,
  Image,
  Laptop,
  Lightbulb,
  Link,
  ListMusic,
  Lock,
  Mail,
  Map,
  MessageCircle,
  Mic,
  Moon,
  Music,
  Newspaper,
  Palette,
  PenTool,
  PiggyBank,
  Plane,
  PlaySquare,
  PlusCircle,
  Radio,
  Rocket,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Star,
  Sun,
  Terminal,
  ThumbsUp,
  Trophy,
  Tv,
  Users,
  Utensils,
  Wrench,
  Zap,
} from "lucide-react";
import { useI18n } from "../i18n";

type IconComponent = LucideIcon;

export const PLAYLIST_ICONS = [
  { id: "ListMusic", label: "Lista" },
  { id: "Bookmark", label: "Zakładka" },
  { id: "Star", label: "Gwiazdka" },
  { id: "Folder", label: "Folder" },
  { id: "Archive", label: "Archiwum" },
  { id: "Heart", label: "Serce" },
  { id: "ThumbsUp", label: "Polecane" },
  { id: "Eye", label: "Obejrzane" },
  { id: "Clock", label: "Czas" },
  { id: "Calendar", label: "Kalendarz" },
  { id: "History", label: "Historia" },
  { id: "Bell", label: "Alert" },
  { id: "PlaySquare", label: "Odtwarzanie" },
  { id: "Clapperboard", label: "Film" },
  { id: "Film", label: "Kino" },
  { id: "Tv", label: "TV" },
  { id: "Radio", label: "Radio" },
  { id: "Music", label: "Muzyka" },
  { id: "Headphones", label: "Słuchanie" },
  { id: "Mic", label: "Podcast" },
  { id: "Gamepad2", label: "Gry" },
  { id: "Trophy", label: "Najlepsze" },
  { id: "Dumbbell", label: "Trening" },
  { id: "Plane", label: "Podróże" },
  { id: "Map", label: "Mapa" },
  { id: "Camera", label: "Foto" },
  { id: "Image", label: "Obrazy" },
  { id: "Palette", label: "Kreatywne" },
  { id: "Brush", label: "Sztuka" },
  { id: "PenTool", label: "Projekt" },
  { id: "BookOpen", label: "Książki" },
  { id: "GraduationCap", label: "Nauka" },
  { id: "Newspaper", label: "News" },
  { id: "Lightbulb", label: "Pomysły" },
  { id: "Brain", label: "Myślenie" },
  { id: "Code2", label: "Kod" },
  { id: "Terminal", label: "Terminal" },
  { id: "Laptop", label: "Technologia" },
  { id: "Cpu", label: "Sprzęt" },
  { id: "Bot", label: "AI" },
  { id: "Database", label: "Dane" },
  { id: "ChartBar", label: "Analiza" },
  { id: "Briefcase", label: "Praca" },
  { id: "Building2", label: "Firma" },
  { id: "PiggyBank", label: "Finanse" },
  { id: "ShoppingCart", label: "Zakupy" },
  { id: "Wrench", label: "Narzędzia" },
  { id: "Hammer", label: "Budowa" },
  { id: "Settings", label: "Ustawienia" },
  { id: "Rocket", label: "Projekty" },
  { id: "Zap", label: "Szybkie" },
  { id: "Sparkles", label: "Inspiracje" },
  { id: "Flame", label: "Hot" },
  { id: "Gem", label: "Cenne" },
  { id: "Shield", label: "Bezpieczne" },
  { id: "Lock", label: "Prywatne" },
  { id: "Globe", label: "Świat" },
  { id: "Cloud", label: "Chmura" },
  { id: "Sun", label: "Dzień" },
  { id: "Moon", label: "Noc" },
  { id: "Coffee", label: "Kawa" },
  { id: "Utensils", label: "Jedzenie" },
  { id: "Car", label: "Auto" },
  { id: "Bike", label: "Rower" },
  { id: "Home", label: "Dom" },
  { id: "Users", label: "Ludzie" },
  { id: "MessageCircle", label: "Rozmowy" },
  { id: "Mail", label: "Poczta" },
  { id: "Link", label: "Linki" },
  { id: "Hash", label: "Tag" },
  { id: "PlusCircle", label: "Dodane" },
  { id: "CheckCircle", label: "Gotowe" },
] as const;

const ICONS: Record<string, IconComponent> = {
  Archive,
  Bell,
  Bike,
  BookOpen,
  Bookmark,
  Bot,
  Brain,
  Briefcase,
  Brush,
  Building2,
  Calendar,
  Camera,
  Car,
  ChartBar,
  CheckCircle,
  Clapperboard,
  Clock,
  Cloud,
  Code2,
  Coffee,
  Cpu,
  Database,
  Dumbbell,
  Eye,
  Film,
  Flame,
  Folder,
  Gamepad2,
  Gem,
  Globe,
  GraduationCap,
  Hammer,
  Hash,
  Headphones,
  Heart,
  Home,
  Image,
  Laptop,
  Lightbulb,
  Link,
  ListMusic,
  Lock,
  Mail,
  Map,
  MessageCircle,
  Mic,
  Moon,
  Music,
  Newspaper,
  Palette,
  PenTool,
  PiggyBank,
  Plane,
  PlaySquare,
  PlusCircle,
  Radio,
  Rocket,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Star,
  Sun,
  Terminal,
  ThumbsUp,
  Trophy,
  Tv,
  Users,
  Utensils,
  Wrench,
  Zap,
};
const LABELS = Object.fromEntries(PLAYLIST_ICONS.map((item) => [item.id, item.label]));

function englishLabel(id: string, fallback: string): string {
  return id.replace(/([a-z])([A-Z])/g, "$1 $2") || fallback;
}

function getIcon(icon?: string): IconComponent {
  return ICONS[icon || ""] ?? ListMusic;
}

export function PlaylistIcon({ icon }: { icon?: string }) {
  const Icon = getIcon(icon);
  return <Icon />;
}

function computePopoverStyle(trigger: HTMLButtonElement): CSSProperties {
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 16);
  const height = 334;
  const gap = 8;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  const below = rect.bottom + gap;
  const top = below + height <= window.innerHeight - 8
    ? below
    : Math.max(8, rect.top - height - gap);
  return { left, top, width };
}

export function PlaylistIconPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PLAYLIST_ICONS;
    return PLAYLIST_ICONS.filter((item) => {
      const label = language === "pl" ? item.label : englishLabel(item.id, item.label);
      return label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q);
    });
  }, [language, query]);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    setStyle(computePopoverStyle(trigger));
    queueMicrotask(() => searchRef.current?.focus());

    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (trigger.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const reposition = () => setStyle(computePopoverStyle(trigger));
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const selectedLabel = language === "pl" ? (LABELS[value] ?? "Lista") : englishLabel(value, "List");

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`playlist-icon-trigger${compact ? " compact" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={language === "pl" ? "Wybierz ikonę playlisty" : "Choose playlist icon"}
        title={selectedLabel}
      >
        <span className="playlist-icon-trigger-mark"><PlaylistIcon icon={value} /></span>
      </button>
      {open && createPortal(
        <div className="playlist-icon-popover" ref={popoverRef} style={style}>
          <input
            ref={searchRef}
            className="playlist-icon-search"
            value={query}
            placeholder={t("search")}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="playlist-icon-grid">
            {filtered.map((item) => {
              const Icon = getIcon(item.id);
              const label = language === "pl" ? item.label : englishLabel(item.id, item.label);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`playlist-icon-choice${value === item.id ? " active" : ""}`}
                  title={label}
                  aria-label={label}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(item.id);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Icon />
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
