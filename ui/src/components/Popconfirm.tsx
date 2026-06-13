import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n";

function computeStyle(trigger: HTMLElement): CSSProperties {
  const rect = trigger.getBoundingClientRect();
  const width = 220;
  const gap = 8;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
  const below = rect.bottom + gap;
  const top = below + 80 <= window.innerHeight ? below : rect.top - gap - 80;
  return { left, top, width };
}

export default function Popconfirm({
  message,
  onConfirm,
  children,
}: {
  message: string;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    setStyle(computeStyle(trigger));

    const close = (e: MouseEvent) => {
      if (trigger.contains(e.target as Node) || popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <span ref={triggerRef} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
        {children}
      </span>
      {open && createPortal(
        <div className="popconfirm-popover" ref={popoverRef} style={style}>
          <div className="popconfirm-msg">{message}</div>
          <div className="popconfirm-actions">
            <button
              className="popconfirm-yes"
              onClick={(e) => { e.stopPropagation(); onConfirm(); setOpen(false); }}
            >
              {t("yes")}
            </button>
            <button
              className="popconfirm-no"
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            >
              {t("cancel")}
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
