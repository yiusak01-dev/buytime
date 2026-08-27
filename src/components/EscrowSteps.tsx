import { CreditCard, Receipt, CheckCircle2 } from "lucide-react";

export function EscrowSteps({ activeIndex = 0 }: { activeIndex?: number }) {
  const steps = [
    { icon: CreditCard, label: "付款" },
    { icon: Receipt, label: "收據" },
    { icon: CheckCircle2, label: "確認" },
  ];
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const active = i <= activeIndex;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-10 h-10 rounded-full grid place-items-center transition-colors ${
                active ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
              }`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={`text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-5 rounded ${i < activeIndex ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
