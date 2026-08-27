import { Star, Clock } from "lucide-react";
import type { ReceiptWithMall } from "@/lib/types";
import { formatHKD, calcSavings } from "@/lib/fees";
import { isCreditCardPayment, SLIP_HINT_CARD } from "@/lib/credit-slip";

export function receiptTypeBadgeClass(type: string | null | undefined) {
  const t = type ?? "";
  if (t.includes("零售")) return "bg-primary/10 text-primary";
  if (t.includes("餐廳")) return "bg-warning/15 text-warning";
  if (t.includes("超市")) return "bg-success/15 text-success";
  return "bg-muted text-muted-foreground";
}

export function ReceiptCard({ receipt, onClick }: { receipt: ReceiptWithMall; onClick?: () => void }) {
  const { mall, seller } = receipt;
  const rate = mall.hourly_rate_weekday;
  const savings = calcSavings(rate, receipt.free_hours, receipt.listing_price);
  const hasSlip = isCreditCardPayment(receipt.payment_method, receipt.serial_number);
  const minsLeft = (new Date(receipt.expiry_time).getTime() - Date.now()) / 60000;
  const urgent = minsLeft < 30;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card rounded-2xl shadow-[var(--shadow-card)] active:scale-[0.99] transition-transform overflow-hidden"
    >
      {receipt.photo_url && (
        <img
          src={receipt.photo_url}
          alt={`${mall.name} 收據相片`}
          loading="lazy"
          className="w-full h-40 object-cover bg-accent"
        />
      )}
      <div className="flex items-start gap-3 p-4">
        <div className="w-12 h-12 shrink-0 rounded-xl bg-accent grid place-items-center text-2xl">
          {mall.icon_emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-foreground truncate">{mall.name}</div>
              <div className="mt-0.5">
                <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${receiptTypeBadgeClass(receipt.shop_name)}`}>
                  {receipt.shop_name}
                </span>
              </div>
            </div>
            <div className="bg-success text-success-foreground px-2.5 py-1 rounded-lg text-sm font-bold shrink-0">
              {formatHKD(receipt.listing_price)}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-md bg-accent text-accent-foreground font-medium">
              消費 {formatHKD(receipt.amount)}
            </span>
            {hasSlip && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-semibold">
                {SLIP_HINT_CARD}
              </span>
            )}
            {mall.entry_time_start && mall.entry_time_end && (
              <span className="text-[10px] text-muted-foreground">
                ⏰ 入車：{mall.entry_time_start.slice(0,5)}–{mall.entry_time_end.slice(0,5)}
              </span>
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <div className="w-5 h-5 rounded-full bg-primary/10 text-primary grid place-items-center text-[10px] font-bold">
                {seller.initial}
              </div>
              <span className="truncate max-w-[80px]">{seller.name}</span>
              <span className="inline-flex items-center gap-0.5">
                <Star className="w-3 h-3 fill-warning text-warning" /> {seller.rating.toFixed(1)}
              </span>
              <span className="text-muted-foreground/60">·</span>
              <span className={`inline-flex items-center gap-0.5 ${urgent ? "text-destructive font-semibold animate-pulse" : ""}`}>
                <Clock className="w-3 h-3" />
                {urgent
                  ? `🔥 剩 ${Math.max(0, Math.round(minsLeft))} 分`
                  : `${new Date(receipt.expiry_time).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })}前`}
              </span>
            </div>
            {savings > 0 && (
              <span className="inline-flex items-center gap-1 text-success font-bold text-sm">
                <span>💰</span> 慳 {formatHKD(savings)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
