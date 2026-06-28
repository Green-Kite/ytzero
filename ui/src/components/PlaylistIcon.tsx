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

// Icon ids only. Human-readable, searchable labels live per-language in the i18n
// locale files (iconLabels) and are resolved via the iconLabel() helper.
export const PLAYLIST_ICONS = [
  "ListMusic", "Bookmark", "Star", "Folder", "Archive", "Heart", "ThumbsUp", "Eye",
  "Clock", "Calendar", "History", "Bell", "PlaySquare", "Clapperboard", "Film", "Tv",
  "Radio", "Music", "Headphones", "Mic", "Gamepad2", "Trophy", "Dumbbell", "Plane",
  "Map", "Camera", "Image", "Palette", "Brush", "PenTool", "BookOpen", "GraduationCap",
  "Newspaper", "Lightbulb", "Brain", "Code2", "Terminal", "Laptop", "Cpu", "Bot",
  "Database", "ChartBar", "Briefcase", "Building2", "PiggyBank", "ShoppingCart", "Wrench",
  "Hammer", "Settings", "Rocket", "Zap", "Sparkles", "Flame", "Gem", "Shield", "Lock",
  "Globe", "Cloud", "Sun", "Moon", "Coffee", "Utensils", "Car", "Bike", "Home", "Users",
  "MessageCircle", "Mail", "Link", "Hash", "PlusCircle", "CheckCircle",
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
  const { t, iconLabel } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PLAYLIST_ICONS;
    return PLAYLIST_ICONS.filter((id) => {
      return iconLabel(id).toLowerCase().includes(q) || id.toLowerCase().includes(q);
    });
  }, [iconLabel, query]);

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

  const selectedLabel = iconLabel(value);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`playlist-icon-trigger${compact ? " compact" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={t("choosePlaylistIcon")}
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
            {filtered.map((id) => {
              const Icon = getIcon(id);
              const label = iconLabel(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`playlist-icon-choice${value === id ? " active" : ""}`}
                  title={label}
                  aria-label={label}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(id);
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
