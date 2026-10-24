import type { ReactNode } from "react";
import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCENARIOS, DIRECTION_LABEL } from "@/lib/aah/scenarios";
import type { Direction, ScenarioId } from "@/lib/aah/types";

/** 由底升上嚟嘅 sheet（手機用） */
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 max-w-lg mx-auto bg-card rounded-t-3xl max-h-[88vh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="sticky top-0 bg-card px-5 pt-3 pb-2 z-10">
          <div className="w-10 h-1 bg-border rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <div className="font-bold text-base">{title}</div>
            <button onClick={onClose} aria-label="關閉" className="w-8 h-8 grid place-items-center rounded-full hover:bg-accent">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="px-5 pt-1">{children}</div>
      </div>
    </div>
  );
}

export function ScenarioTag({ scenario, direction, className }: { scenario: ScenarioId; direction?: Direction; className?: string }) {
  const s = SCENARIOS[scenario];
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full", className)}
      style={{ background: s.soft, color: s.color }}
    >
      {s.emoji} {s.label}
      {direction && direction !== "join" ? `・${DIRECTION_LABEL[direction]}` : ""}
    </span>
  );
}

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 px-3 py-2 rounded-full text-sm font-semibold border transition-colors",
        active ? "bg-[#1a1a1a] text-white border-[#1a1a1a]" : "bg-card text-foreground border-border hover:bg-accent",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span className={cn("text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded", className)}>示範</span>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <div className="text-sm font-bold">{title}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      {children}
    </section>
  );
}
