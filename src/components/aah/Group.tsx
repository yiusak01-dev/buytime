import { useState, type ReactNode } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { CatIcon } from "./CatIcon";
import { CAT_STYLE, VERBS } from "@/lib/aah/theme";
import type { ScenarioId } from "@/lib/aah/types";
import { cn } from "@/lib/utils";

/** 「搵」「放」兩個版面共用：一個類別一組，組標題撳一下收埋／打開 */
export function CatGroup({
  scenario,
  count,
  defaultOpen = true,
  children,
}: {
  scenario: ScenarioId;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const s = CAT_STYLE[scenario];
  return (
    <section
      className="bg-card rounded-3xl shadow-[var(--shadow-card)] overflow-hidden"
      data-testid={`group-${scenario}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left"
      >
        <CatIcon scenario={scenario} size={30} />
        <span className="flex-1 text-[16px] font-black" style={{ color: s.fg }}>
          {s.short}
          {count != null && <span className="ml-1.5">{count}</span>}
        </span>
        <ChevronDown
          className={cn("w-5 h-5 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="px-3.5 pb-2">{children}</div>}
    </section>
  );
}

/** 未註冊：組入面頭幾個以外鎖住 */
export function LockRow({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <div
      className="flex items-center justify-between gap-2 py-2.5 border-t border-[#F3ECE4]"
      data-testid="lock-card"
    >
      <span className="text-sm font-black flex items-center gap-1.5 text-muted-foreground">
        <Lock className="w-4 h-4" />
        仲有 {count} 個
      </span>
      <button
        type="button"
        onClick={onClick}
        className="h-10 px-4 rounded-[14px] text-white text-[13px] font-black shrink-0"
        style={{ background: VERBS.find.strong }}
      >
        註冊解鎖全部（免費）
      </button>
    </div>
  );
}
