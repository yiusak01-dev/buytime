import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Elements, PaymentElement, ExpressCheckoutElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { formatHKD, calcFees, feeLabel } from "@/lib/fees";
import type { ReceiptWithMall } from "@/lib/types";
import { Loader2, ShieldCheck } from "lucide-react";

const PUBLISHABLE_KEY =
  "pk_test_51TxzUMGjQt3NQ9YTHg0E4EgCTYy9WK2kPyUFwKJa079qPJDGnNnAkKsvU7ETMtGezynNhPV0Q0ic73NRK6ri95X100A1HNiEgB";
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!PUBLISHABLE_KEY) return null;
  if (!stripePromise) stripePromise = loadStripe(PUBLISHABLE_KEY);
  return stripePromise;
}

type IntentData = {
  client_secret: string;
  customer_session_client_secret?: string;
  transaction_id: string;
  amount_charged: number;
  seller_payout: number;
  buyer_fee: number;
  seller_fee: number;
  asking_price: number;
};

export function StripeCheckoutSheet({
  receipt,
  open,
  onOpenChange,
}: {
  receipt: ReceiptWithMall;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState<IntentData | null>(null);
  const [step, setStep] = useState<"summary" | "pay">("summary");
  const [userId, setUserId] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setIntent(null);
      setStep("summary");
      setLoading(false);
    }
  }, [open]);

  async function beginCheckout(useDiscount: boolean) {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (!uid) {
        toast.error("請先登入");
        return;
      }
      if (uid === receipt.seller_id) {
        toast.error("不能購買自己的收據");
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token;

      const res = await fetch(
        "https://oadwfgujhjqgnydigwux.supabase.co/functions/v1/create-payment-intent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { "Authorization": `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({ listing_id: receipt.id, buyer_id: uid, use_discount: useDiscount }),
        }
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg: string = (errJson as any).error ?? "";
        if (errMsg.includes("unique_listing_buyer")) {
          toast.info("你已有一個購買申請", { description: "請前往「交易」頁面或聊天室查看" });
        } else {
          toast.error("無法建立付款", { description: errMsg || "請稍後再試" });
        }
        return;
      }
      const data = await res.json();
      if (!data?.client_secret) {
        toast.error("無法建立付款", { description: "請稍後再試" });
        return;
      }
      setIntent(data as IntentData);
      setStep("pay");
    } finally {
      setLoading(false);
    }
  }

  const stripe = useMemo(() => getStripe(), []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="p-0 h-[92dvh] rounded-t-3xl border-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg px-5 pt-6 pb-8">
          <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-5" />
          <h2 className="text-xl font-bold mb-1">立即購買</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {receipt.mall.name} · {receipt.free_hours} 小時
          </p>

          {step === "summary" && (
            <SummaryView
              receipt={receipt}
              loading={loading}
              onConfirm={beginCheckout}
              intentPreview={null}
              userId={userId}
            />
          )}

          {step === "pay" && intent && stripe && PUBLISHABLE_KEY && (
            <Elements
              stripe={stripe}
              options={{
                clientSecret: intent.client_secret,
                ...(intent.customer_session_client_secret
                  ? { customerSessionClientSecret: intent.customer_session_client_secret }
                  : {}),
                appearance: { theme: "stripe" },
              }}
            >
              <PayForm
                intent={intent}
                onDone={() => onOpenChange(false)}
              />
            </Elements>
          )}

          {step === "pay" && !PUBLISHABLE_KEY && (
            <div className="rounded-xl bg-destructive/10 text-destructive text-sm p-4">
              未設定 VITE_STRIPE_PUBLISHABLE_KEY，無法載入付款介面。
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SummaryView({
  receipt,
  loading,
  onConfirm,
  userId,
}: {
  receipt: ReceiptWithMall;
  loading: boolean;
  onConfirm: (useDiscount: boolean) => void;
  intentPreview: IntentData | null;
  userId: string;
}) {
  const [discountRemaining, setDiscountRemaining] = useState(0);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("users")
      .select("discount_txns_remaining")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        setDiscountRemaining(Number((data as any)?.discount_txns_remaining ?? 0));
      });
  }, [userId]);

  const hours = receipt.free_hours;
  const price = receipt.listing_price;
  const fees = calcFees(price, hours);
  const baseBuyerFee = fees.buyerFee;
  const sellerFee = fees.sellerFee;
  const useDiscount = discountRemaining > 0;
  const buyerFee = useDiscount
    ? Math.round(baseBuyerFee * 0.5 * 100) / 100
    : baseBuyerFee;
  const total = Math.round((price + buyerFee) * 100) / 100;
  const payout = Math.round((price - sellerFee) * 100) / 100;

  return (
    <div className="space-y-4">
      {useDiscount && (
        <div className="rounded-xl bg-green-500/10 text-green-600 text-sm p-3 font-medium">
          🎉 手續費半價次數：仲有 {discountRemaining} 次
        </div>
      )}
      <div className="rounded-2xl border border-border p-4 space-y-2 text-sm">
        <Row k="收據面值" v={formatHKD(price)} />
        {useDiscount ? (
          <>
            <Row k={`平台手續費（買家 ${feeLabel(hours)}）`} v={formatHKD(baseBuyerFee)} muted />
            <Row k="新用戶半價手續費" v={formatHKD(buyerFee)} />
          </>
        ) : (
          <Row k={`平台手續費（買家 ${feeLabel(hours)}）`} v={formatHKD(buyerFee)} />
        )}
        <div className="border-t border-border my-2" />
        <Row k="合共付款" v={formatHKD(total)} bold />
        <div className="border-t border-border my-2" />
        <Row k="賣家實收" v={formatHKD(payout)} muted />
      </div>

      <div className="rounded-xl bg-primary/5 text-primary text-xs p-3 flex gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          款項會由 Stripe 代收並暫存（Escrow），面交確認後先過數比賣家。
        </div>
      </div>

      <Button className="w-full h-12" onClick={() => onConfirm(useDiscount)} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `確認並付款 ${formatHKD(total)}`}
      </Button>
    </div>
  );
}

function PayForm({ intent, onDone }: { intent: IntentData; onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const [expressReady, setExpressReady] = useState(false);

  async function handleExpressConfirm() {
    if (!stripe || !elements) return;
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (error) {
      toast.error("付款失敗", { description: error.message });
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      toast.success("付款成功！款項已暫存");
      onDone();
      navigate({ to: "/chat/$id", params: { id: intent.transaction_id } });
    }
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    setSubmitting(false);
    if (error) {
      toast.error("付款失敗", { description: error.message });
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      toast.success("付款成功！款項已暫存");
      onDone();
      navigate({ to: "/chat/$id", params: { id: intent.transaction_id } });
    } else {
      toast.info("付款處理中");
      onDone();
    }
  }

  return (
    <>
      <div className={expressReady ? "mb-3" : "hidden"}>
        <ExpressCheckoutElement
          onConfirm={handleExpressConfirm}
          onReady={({ availablePaymentMethods }) => {
            if (availablePaymentMethods && Object.values(availablePaymentMethods).some(Boolean)) {
              setExpressReady(true);
            }
          }}
          options={{
            buttonHeight: 48,
            buttonTheme: { applePay: "black", googlePay: "black" },
            layout: { maxColumns: 1, maxRows: 2 },
          }}
        />
        {expressReady && (
          <div className="flex items-center gap-2 my-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">或用信用卡</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}
      </div>
      <form onSubmit={handlePay} className="space-y-4">
        <div className="rounded-2xl border border-border p-3">
          <PaymentElement options={{ wallets: { link: 'auto' } }} />
        </div>
        <div className="text-xs text-muted-foreground text-center">
          合共付款：<span className="font-semibold text-foreground">{formatHKD(intent.amount_charged)}</span>
        </div>
        <Button type="submit" className="w-full h-12" disabled={!stripe || submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "確認付款"}
        </Button>
      </form>
    </>
  );
}

function Row({ k, v, bold, muted }: { k: string; v: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span>{k}</span>
      <span className={bold ? "font-bold text-base" : ""}>{v}</span>
    </div>
  );
}
