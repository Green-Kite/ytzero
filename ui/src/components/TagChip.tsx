import { X } from "lucide-react";
import type { Tag } from "../api";
import { useI18n } from "../i18n";

const SOURCE_LABEL: Record<"en" | "pl", Record<string, string>> = {
  en: {
    auto: "Automatic tag",
    channel: "Channel tag",
    manual: "Manual tag",
  },
  pl: {
    auto: "Tag automatyczny",
    channel: "Tag kanału",
    manual: "Tag ręczny",
  },
};

/** Small tag pill shown on video cards and the watch page. */
export default function TagChip({
  tag,
  onClick,
  onRemove,
}: {
  tag: Tag;
  onClick?: () => void;
  onRemove?: () => void;
}) {
  const { language } = useI18n();
  return (
    <span
      className={`tag-pill${onClick ? " clickable" : ""}`}
      onClick={onClick}
      title={tag.source ? SOURCE_LABEL[language][tag.source] : undefined}
      style={{ color: tag.color, background: `${tag.color}18` }}
    >
      {tag.name}
      {onRemove && (
        <span
          className="x"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X />
        </span>
      )}
    </span>
  );
}
