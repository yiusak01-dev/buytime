import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Clock, AlertTriangle, Heart, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { ReceiptWithMall } from "@/lib/types";
import { calcFees, formatHKD, calcSavings } from "@/lib/fees";
import { isCreditCardPayment, SLIP_HINT_DETAIL } from "@/lib/credit-slip";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ownSupabase } from "@/integrations/supabase/own-client";

import { StripeCheckoutSheet } from "./StripeCheckoutSheet";

export function ReceiptDetailSheet({ receipt, open, onOpenChange }: {
  receipt: ReceiptWithMall | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {

  const [buyOpen, setBuyOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [favorited, setFavorited] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);
  const isSelfListing = !!currentUserId && currentUserId === receipt?.seller_id;

  // 賣家統計：成交次數
  const [dealCount, setDealCount] = useState<number | null>(null);
  const sellerId = receipt?.seller_id ?? null;
  useEffect(() => {
    if (!open || !sellerId) return;
    let cancelled = false;
    setDealCount(null);
    (async () => {
      try {
        const { count, error } = await ownSupabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", sellerId)
          .eq("status", "completed");
        if (error) throw error;
        if (!cancelled) setDealCount(count ?? 0);
      } catch (e) {
        console.error("[sellerDealCount]", e);
        if (!cancelled) setDealCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, [open, sellerId]);


  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = receipt ? `${receipt.mall.name} 泊車收據 · 買時間` : "買時間";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("連結已複製");
    } catch {
      /* user cancelled */
    }
  }

  if (!receipt) return null;
  const { mall } = receipt;
  const fees = calcFees(receipt.listing_price, receipt.free_hours);
  const savings = calcSavings(mall.hourly_rate_weekday, receipt.free_hours, fees.buyerTotal);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="p-0 h-[92dvh] rounded-t-3xl border-0 shadow-[var(--shadow-sheet)] overflow-y-auto">
          <div className="mx-auto w-full max-w-lg">
            {receipt.photo_url && (
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                className="block w-full"
                aria-label="放大收據相片"
              >
                <img
                  src={receipt.photo_url}
                  alt={`${mall.name} 收據相片`}
                  className="w-full h-56 object-cover bg-muted"
                />
              </button>
            )}
            {/* Receipt gradient card */}
            <div className={`gradient-receipt text-white px-5 pt-8 pb-6 relative ${receipt.photo_url ? "" : "rounded-t-3xl"}`}>
              <div className="w-10 h-1 bg-white/30 rounded-full mx-auto -mt-4 mb-4" />

              <div className="absolute top-3 right-4 flex items-center gap-2">
                <button
                  type="button"
                  aria-label={favorited ? "取消收藏" : "收藏"}
                  onClick={() => setFavorited((v) => !v)}
                  className="w-9 h-9 rounded-full bg-white/15 grid place-items-center"
                >
                  <Heart className={`w-4 h-4 ${favorited ? "fill-current text-destructive" : ""}`} />
                </button>
                <button
                  type="button"
                  aria-label="分享"
                  onClick={handleShare}
                  className="w-9 h-9 rounded-full bg-white/15 grid place-items-center"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>


              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white/15 grid place-items-center text-3xl">{mall.icon_emoji}</div>
                <div className="flex-1">
                  <div className="text-lg font-bold">{mall.name}</div>
                  <div className="text-white/70 text-sm">{receipt.shop_name}</div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <Stat label="消費金額" value={formatHKD(receipt.amount)} />
                <Stat label="免費泊車" value={`${receipt.free_hours} 小時`} />
                <Stat label="放售價" value={formatHKD(receipt.listing_price)} />
              </div>
              {isCreditCardPayment(receipt.payment_method, receipt.serial_number) && (
                <div className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-xs font-medium">
                  {SLIP_HINT_DETAIL}
                </div>
              )}
            </div>


            <div className="px-5 py-5 space-y-5">
              {mall.entry_time_start && mall.entry_time_end && (

                <section className="bg-warning/10 border border-warning/30 rounded-2xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <div className="font-semibold text-warning-foreground mb-1">
                      入車時間要求：{mall.entry_time_start.slice(0,5)} – {mall.entry_time_end.slice(0,5)}
                    </div>
                    <div className="text-muted-foreground">請確認你嘅車係喺此時間段內入場</div>
                  </div>
                </section>
              )}


              {/* Seller */}
              <section className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary grid place-items-center font-bold">
                    {receipt.seller.initial}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{receipt.seller.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span className="inline-flex items-center gap-0.5 text-success font-semibold">✓ 身份已驗證</span>
                      <span className="text-muted-foreground/60">·</span>
                      {dealCount === null ? (
                        <span className="inline-block h-3 w-12 rounded bg-muted animate-pulse" />
                      ) : (
                        <span>成交 {dealCount} 次</span>
                      )}
                      <span className="text-muted-foreground/60">·</span>
                      <span>好評 {Math.round((receipt.seller.rating / 5) * 100)}%</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Mall rules */}
              <section className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">🅿️ 商場泊車規則</div>
                  <button className="text-xs text-primary font-medium">報告問題</button>
                </div>
                <div className="text-xs space-y-1.5">
                  <Row k="收費" v={`平日 ${formatHKD(mall.hourly_rate_weekday)}/hr · 周末 ${formatHKD(mall.hourly_rate_weekend)}/hr`} />
                  {mall.spending_tiers.map((t, i) => (
                    <Row key={i} k={`消費 ${formatHKD(t.min_spend)}`} v={`${t.hours} 小時`} />
                  ))}
                  <Row k="核銷方式" v={mall.validation_method === "stamp" ? "櫃檯蓋印" : "電子核銷"} />
                </div>
                <div className="border-t border-border pt-3">
                  <div className="text-xs font-semibold mb-1.5">📍 核銷櫃檯</div>
                  <div className="text-xs text-muted-foreground">
                    {mall.counter_floor} {mall.counter_location} · {mall.counter_hours}
                  </div>
                </div>
                {mall.notes && (
                  <div className="bg-warning/10 text-warning-foreground rounded-lg p-2.5 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <span className="text-xs text-warning">{mall.notes}</span>
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground">最後核實：2 天前</div>
              </section>

              {/* Fee breakdown */}
              <section className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)] space-y-2">
                <div className="text-sm font-semibold mb-2">💰 費用明細</div>
                <Row k="收據放售價" v={formatHKD(receipt.listing_price)} />
                <Row k={`買家服務費 (${fees.label})`} v={`+ ${formatHKD(fees.buyerFee)}`} />
                <div className="border-t border-border pt-2 flex justify-between font-bold">
                  <span>你總共付</span>
                  <span className="text-primary">{formatHKD(fees.buyerTotal)}</span>
                </div>
                {savings > 0 && (
                  <div className="bg-success/10 text-success rounded-lg px-3 py-2 text-xs font-semibold flex items-center justify-between">
                    <span>比直接泊車便宜</span>
                    <span>慳 {formatHKD(savings)}</span>
                  </div>
                )}
              </section>



              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>放售倒數：即將於 {new Date(receipt.expiry_time).toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit", hour12: false })} 過期</span>
              </div>

              {isSelfListing ? (
                <div className="w-full h-12 flex items-center justify-center rounded-xl bg-muted text-muted-foreground text-sm font-medium">
                  這是你的收據
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-primary shrink-0"
                    />
                    <span className="leading-relaxed">
                      本人確認已了解以上泊車條款，入車時間符合要求。如不符合，本平台概不負責。
                    </span>
                  </label>
                  <Button
                    onClick={() => setBuyOpen(true)}
                    disabled={!acknowledged}
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground text-base font-bold rounded-xl disabled:opacity-50"
                  >
                    💳 立即購買 · {formatHKD(fees.buyerTotal)}
                  </Button>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground leading-relaxed pt-2 border-t border-border">
                收據真實性由賣家負責。入車時間是否符合商場要求，由買家自行確認，平台不承擔相關責任。
              </p>
            </div>

          </div>
        </SheetContent>
      </Sheet>


      <StripeCheckoutSheet
        receipt={receipt}
        open={buyOpen}
        onOpenChange={setBuyOpen}
      />

      {zoomOpen && receipt.photo_url && (
        <div
          role="dialog"
          aria-label="收據相片"
          onClick={() => setZoomOpen(false)}
          className="fixed inset-0 z-[100] bg-foreground/90 grid place-items-center p-4"
        >
          <img
            src={receipt.photo_url}
            alt={`${mall.name} 收據相片放大`}
            className="max-w-full max-h-[90dvh] object-contain rounded-xl"
          />
        </div>
      )}

    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/10 rounded-xl px-2.5 py-2 backdrop-blur-sm">
      <div className="text-[10px] text-white/60 mb-0.5">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-foreground">{v}</span>
    </div>
  );
}
