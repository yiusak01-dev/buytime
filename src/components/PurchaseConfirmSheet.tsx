import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ReceiptWithMall } from "@/lib/types";
import { formatHKD } from "@/lib/fees";
import { toast } from "sonner";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MapPin, Clock, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ownSupabase } from "@/integrations/supabase/own-client";
import { createOwnTransaction } from "@/lib/own-db";
import { sendPushToUser } from "@/lib/push";

export function PurchaseConfirmSheet({ receipt, open, onOpenChange, onSuccess }: {
  receipt: ReceiptWithMall;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleConfirm() {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (!uid) {
        toast.error("請先登入");
        setLoading(false);
        return;
      }

      if (uid === receipt.seller_id) {
        toast.error("不能購買自己的收據");
        setLoading(false);
        return;
      }

      const { data: existingArr } = await (supabase as any)
        .from("transactions")
        .select("id")
        .eq("listing_id", receipt.id)
        .eq("buyer_id", uid)
        .order("created_at", { ascending: true })
        .limit(1);

      const existing = Array.isArray(existingArr) ? existingArr[0] : null;

      if (existing?.id) {
        toast.info("你已對此收據表達興趣，返回聊天室");
        onSuccess?.();
        navigate({ to: "/chat/$id", params: { id: existing.id } });
        return;
      }

      const newTx = await createOwnTransaction({
        listing_id: receipt.id,
        buyer_id: uid,
        seller_id: receipt.seller_id,
        sale_price: receipt.listing_price,
        mall_name: receipt.mall.name,
        receipt_amount: receipt.amount,
        status: "pending_exchange",
      });

      toast.success("已登記有興趣！", { description: "請於聊天室與賣家溝通" });
      onSuccess?.();
      if (newTx?.id) {
        const { data: buyerProfile } = await ownSupabase
          .from("users")
          .select("display_name")
          .eq("id", uid)
          .maybeSingle();

        fetch("https://oadwfgujhjqgnydigwux.supabase.co/functions/v1/notify-seller", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZHdmZ3VqaGpxZ255ZGlnd3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMTM0MjMsImV4cCI6MjA5ODc4OTQyM30.Zx2prlmxNXhPB6YWHG09QZr7wiNqHIXvrRcYfrXMnBY",
          },
          body: JSON.stringify({
            recipient_id: receipt.seller_id,
            transaction_id: newTx.id,
            mall_name: receipt.mall?.name ?? "商場",
            buyer_name: buyerProfile?.display_name ?? "買家",
            type: "interest",
          }),
        }).catch(console.warn);

        if (receipt.seller_id) {
          void sendPushToUser({
            recipient_id: receipt.seller_id,
            title: "🛒 有人買咗你的單！",
            body: `${receipt.mall?.name ?? "商場"} — HK$${receipt.listing_price} / ${receipt.free_hours}小時，請盡快安排交收`,
            chat_id: newTx.id,
          });
        }

        navigate({ to: "/chat/$id", params: { id: newTx.id } });
      } else {
        const { data: fallbackArr } = await (supabase as any)
          .from("transactions")
          .select("id")
          .eq("listing_id", receipt.id)
          .eq("buyer_id", uid)
          .order("created_at", { ascending: true })
          .limit(1);
        const existingId = Array.isArray(fallbackArr) ? fallbackArr[0]?.id : null;
        if (existingId) {
          toast.info("你已對此收據表達興趣，進入聊天室");
          navigate({ to: "/chat/$id", params: { id: existingId } });
        } else {
          navigate({ to: "/transactions" });
        }
      }

    } catch (e) {
      console.warn(e);
      toast.error("登記失敗，請重試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="p-0 rounded-t-3xl border-0 max-h-[90dvh] overflow-y-auto">
        <div className="mx-auto w-full max-w-lg px-5 pt-6 pb-8">
          <div className="w-10 h-1 bg-border rounded-full mx-auto -mt-2 mb-4" />
          <h2 className="text-lg font-bold mb-1">確認購買</h2>
          <p className="text-xs text-muted-foreground mb-5">請確認以下收據資料，然後於聊天室與賣家安排交收</p>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-2 mb-4">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">商場</span><span className="font-semibold">{receipt.mall.icon_emoji} {receipt.mall.name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">商戶</span><span className="font-semibold">{receipt.shop_name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">消費金額</span><span className="font-semibold">{formatHKD(receipt.amount)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">免費泊車</span><span className="font-semibold text-warning">🚗 {receipt.free_hours} 小時</span></div>
            <div className="border-t border-border pt-2 flex justify-between font-bold text-base">
              <span>放售價</span>
              <span className="text-primary">{formatHKD(receipt.listing_price)}</span>
            </div>
          </div>

          <div className="bg-success/10 border border-success/20 rounded-2xl p-3 mb-4 flex items-center gap-2">
            <span className="text-success font-bold text-sm">🎉 Beta優惠期</span>
            <span className="text-xs text-success">平台手續費全免</span>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 mb-4 space-y-3">
            <div className="text-sm font-semibold">📋 自行交收流程</div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span>登記後於聊天室聯絡賣家，約定於 <span className="font-semibold text-foreground">{receipt.mall.name}</span> 停車場收費處附近交收</span>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
              <span>收據有時限，請盡快完成交收並於有效期內使用</span>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
              <span>建議當面核實收據真偽及泊車優惠條件後再付款給賣家</span>
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-muted-foreground mb-4">
            <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} className="mt-0.5" />
            <span>
              我已閱讀並同意《買時間服務條款》。本人明白買賣雙方須自行安排交收，買時間平台不參與款項收付，對交易結果不承擔法律責任。Beta優惠期間平台免收手續費。
            </span>
          </label>

          <Button
            onClick={handleConfirm}
            disabled={!agreed || loading}
            className="w-full h-12 gradient-primary text-white text-base font-bold rounded-xl"
          >
            {loading ? "登記中..." : "✅ 確認有興趣，前往聊天室"}
          </Button>
          <div className="text-center text-[10px] text-muted-foreground mt-2">
            買時間 Beta · 雙方自行交收 · 免手續費
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
