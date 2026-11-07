import { Car, Tag, Ticket, Users } from "lucide-react";
import { CAT_STYLE, LIVE } from "@/lib/aah/theme";
import type { ScenarioId } from "@/lib/aah/types";
import { cn } from "@/lib/utils";

const ICONS = { parking: Car, dining: Ticket, offer: Tag, groupbuy: Users } as const;

/** 類別圖示：圓形底色 + 線條圖示 */
export function CatIcon({
  scenario,
  size = 40,
  className,
}: {
  scenario: ScenarioId;
  size?: number;
  className?: string;
}) {
  const s = CAT_STYLE[scenario];
  const Icon = ICONS[scenario];
  return (
    <span
      aria-hidden="true"
      className={cn("rounded-full grid place-items-center shrink-0", className)}
      style={{ width: size, height: size, background: s.bg, color: s.fg }}
    >
      <Icon style={{ width: size / 2, height: size / 2 }} strokeWidth={2} />
    </span>
  );
}

/** 即時綠點 */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("live-dot inline-block w-2 h-2 rounded-full shrink-0", className)}
      style={{ background: LIVE }}
    />
  );
}
