import { DISTRICTS, type District } from "@/lib/districts";
import { cn } from "@/lib/utils";

export function DistrictFilter({ value, onChange }: { value: District | null; onChange: (v: District | null) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
      <Chip active={value === null} onClick={() => onChange(null)}>🌏 全港</Chip>
      {DISTRICTS.map((d) => (
        <Chip key={d.id} active={value === d.id} onClick={() => onChange(value === d.id ? null : d.id)}>
          {d.emoji} {d.label}
        </Chip>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors shrink-0",
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-card text-foreground border-border"
      )}
    >
      {children}
    </button>
  );
}
