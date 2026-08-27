import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const colorMap = {
  active:           "bg-primary/10 text-primary",
  pending_exchange: "bg-warning/15 text-warning",
  validating:       "bg-info/15 text-info",
  completed:        "bg-success/15 text-success",
  disputed:         "bg-destructive/15 text-destructive",
  cancelled:        "bg-muted text-muted-foreground",
  expired:          "bg-muted text-muted-foreground",
  pending_payment:  "bg-muted text-muted-foreground",
  paid_held:        "bg-warning/15 text-warning",
  delivery_confirmed: "bg-info/15 text-info",
  buyer_confirmed:  "bg-success/15 text-success",
  auto_released:    "bg-success/15 text-success",
  resolved_refund:  "bg-muted text-muted-foreground",
  resolved_release: "bg-success/15 text-success",
} as const;

export function StatusBadge({ status, className }: { status: keyof typeof colorMap; className?: string }) {
  const { t } = useTranslation();
  const cls = colorMap[status] ?? colorMap.active;
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold", cls, className)}>
      {t(`status.${status}`)}
    </span>
  );
}
