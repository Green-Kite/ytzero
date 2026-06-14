import type { ReactNode } from "react";

export default function Tooltip({ text, pos = "left", children }: {
  text: string;
  pos?: "left" | "right" | "top" | "bottom";
  children: ReactNode;
}) {
  return (
    <span className={`tooltip-wrap tooltip-wrap--${pos}`}>
      {children}
      <span className="tooltip-tip">{text}</span>
    </span>
  );
}
