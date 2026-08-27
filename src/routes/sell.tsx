import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  ArrowLeft,
  AlertCircle,
  Plus,
  Trash2,
  Receipt as ReceiptIcon,
  Camera,
  Loader2,
  X,
  MapPin,
  Navigation,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { createOwnListing, syncUserToOwn, notifyListingAlerts } from "@/lib/own-db";
import { SLIP_HINT_SELL } from "@/lib/credit-slip";
import { useMalls } from "@/lib/queries";
import type { Mall } from "@/lib/types";
import { ownSupabase } from "@/integrations/supabase/own-client";
import { fetchMarketRate, type MarketRate } from "@/lib/user-prefs";
import { fetchUserRatingStats, type RatingStats } from "@/lib/escrow-db";
import { requireSignedIn } from "@/lib/auth-guard";

export const Route = createFileRoute("/sell")({
  beforeLoad: requireSignedIn,
  head: () => ({ meta: [{ title: "放售收據 · 買時間" }] }),
  component: SellPage,
});

const RECEIPT_TYPES = ["餐廳", "零售", "超市", "戲院", "其他"] as const;

const PAYMENT_METHODS = [
  "八達通",
  "信用卡",
  "AlipayHK",
  "WeChat Pay",
  "Apple Pay",
  "其他電子支付",
] as const;

const DEFAULT_MIN_SPEND = 50;
const DEFAULT_MAX_HOURS = 3;
const DEFAULT_HOURLY_RATE = 22;

export type MallRuleConfig = {
  minSpendPerHour: number;
  maxParkingHours: number;
  hourlyRate: number;
  spendingTiers: Array<{ min_spend: number; hours: number }>;
  mallCategory: string;
};

function ruleOf(mall: Mall | null | undefined): MallRuleConfig {
  return {
    minSpendPerHour: Number(mall?.min_spend_per_hour) > 0 ? Number(mall!.min_spend_per_hour) : DEFAULT_MIN_SPEND,
    maxParkingHours: Number(mall?.max_parking_hours) > 0 ? Number(mall!.max_parking_hours) : DEFAULT_MAX_HOURS,
    hourlyRate: Number(mall?.hourly_rate) > 0 ? Number(mall!.hourly_rate) : DEFAULT_HOURLY_RATE,
    spendingTiers: Array.isArray((mall as any)?.spending_tiers)
      ? ((mall as any).spending_tiers as Array<{ min_spend: number; hours: number }>)
      : [],
    mallCategory: (mall?.mall_category as string) ?? "A",
  };
}

function hoursFromSpend(amount: number, rule: MallRuleConfig): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (rule.spendingTiers && rule.spendingTiers.length > 0) {
    let hours = 0;
    for (const tier of [...rule.spendingTiers].sort((a, b) => a.min_spend - b.min_spend)) {
      if (amount >= tier.min_spend) hours = tier.hours;
    }
    return hours;
  }
  return Math.min(Math.floor(amount / rule.minSpendPerHour), rule.maxParkingHours);
}

function suggestedPriceOf(hours: number, rule: MallRuleConfig): number {
  return Math.round(rule.hourlyRate * 0.5 * hours);
}

function maxPriceOf(hours: number, rule: MallRuleConfig): number {
  return Math.round(rule.hourlyRate * hours);
}

type ReceiptDraft = {
  id: string;
  mall: string;
  category: (typeof RECEIPT_TYPES)[number] | "";
  amount: string;
  payment: (typeof PAYMENT_METHODS)[number] | "";
  photoUrl: string | null;
  photoPreview: string | null;
  uploading: boolean;
};

function newDraft(mall = ""): ReceiptDraft {
  return {
    id: crypto.randomUUID(),
    mall,
    category: "",
    amount: "",
    payment: "",
    photoUrl: null,
    photoPreview: null,
    uploading: false,
  };
}

export async function uploadListingPhoto(
  file: File,
  t: (k: any, o?: any) => string,
): Promise<string | null> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) {
    toast.error(t("sell.loginRequired"));
    return null;
  }
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await (supabase as any).storage
    .from("listing-photos")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) {
    console.error("[uploadListingPhoto] failed:", error);
    toast.error(t("sell.photoUploadError"), { description: error.message });
    return null;
  }
  const { data: signed, error: signErr } = await (supabase as any).storage
    .from("listing-photos")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signErr || !signed?.signedUrl) {
    console.error("[uploadListingPhoto] sign failed:", signErr);
    toast.error(t("sell.photoUrlError"), { description: signErr?.message });
    const { data: pub } = (supabase as any).storage.from("listing-photos").getPublicUrl(path);
    return pub?.publicUrl ?? path;
  }
  return signed.signedUrl;
}

function SellPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [receipts, setReceipts] = useState<ReceiptDraft[]>([newDraft()]);
  const [sellerAssist, setSellerAssist] = useState(false);
  const [price, setPrice] = useState<number>(0);
  const [ratingStats, setRatingStats] = useState<RatingStats | null>(null);
  const [showStreakGate, setShowStreakGate] = useState(false);
  const [streakAcknowledged, setStreakAcknowledged] = useState(false);

  const { data: malls = [] } = useMalls();

  const mall = receipts[0]?.mall ?? "";
  const selectedMall = useMemo(
    () => malls.find((m) => m.name === mall) ?? null,
    [malls, mall],
  );
  const rule = useMemo(() => ruleOf(selectedMall), [selectedMall]);

  const totalAmount = useMemo(
    () => receipts.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [receipts],
  );
  const hasRestaurant = useMemo(() => receipts.some((r) => r.category === "餐廳"), [receipts]);
  const baseHours = useMemo(() => hoursFromSpend(totalAmount, rule), [totalAmount, rule]);
  const totalHours = useMemo(() => {
    if (rule.mallCategory === "C" && hasRestaurant && baseHours > 0) {
      return Math.min(baseHours + 2, rule.maxParkingHours);
    }
    return Math.min(baseHours, rule.maxParkingHours);
  }, [baseHours, rule, hasRestaurant]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const stats = await fetchUserRatingStats(data.user.id);
      setRatingStats(stats);
      if (stats.recentBadStreak >= 3 && !streakAcknowledged) {
        setShowStreakGate(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showBadRateWarning = !!ratingStats && ratingStats.total >= 3 && ratingStats.badRate > 0.6;

  return (
    <AppLayout>
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-border/60">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => (step > 1 ? setStep(step - 1) : null)}
            className={cn(
              "w-8 h-8 rounded-full grid place-items-center",
              step > 1 ? "bg-card" : "opacity-30",
            )}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold">{t("sell.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("sell.step", { step })}</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "flex-1 h-1 rounded-full",
                i <= step ? "bg-primary" : "bg-border",
              )}
            />
          ))}
        </div>
      </div>

      <div className="px-4 py-5">
        {showBadRateWarning && (
          <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div className="text-xs">
              <div className="font-bold text-destructive">{t("sell.lowRatingTitle")}</div>
              <div className="text-muted-foreground mt-0.5">
                {t("sell.lowRatingDesc", {
                  pct: Math.round(ratingStats!.badRate * 100),
                  total: ratingStats!.total,
                })}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <StepReceipts
            receipts={receipts}
            setReceipts={setReceipts}
            malls={malls}
            rule={rule}
            totalAmount={totalAmount}
            totalHours={totalHours}
            baseHours={baseHours}
            sellerAssist={sellerAssist}
            setSellerAssist={setSellerAssist}
            onNext={() => {
              setPrice(suggestedPriceOf(totalHours, rule) + (sellerAssist ? 10 : 0));
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <StepConfirm
            receipts={receipts}
            mall={mall}
            rule={rule}
            totalAmount={totalAmount}
            totalHours={totalHours}
            price={price}
            setPrice={setPrice}
            sellerAssist={sellerAssist}
            onDone={() => setStep(3)}
          />
        )}
        {step === 3 && <StepDone />}
      </div>

      {showStreakGate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-card rounded-2xl p-6">
            <div className="text-2xl mb-2">⚠️</div>
            <h3 className="text-base font-bold mb-2">{t("sell.streakTitle")}</h3>
            <p className="text-xs text-muted-foreground mb-4">
              {t("sell.streakDesc", { streak: ratingStats?.recentBadStreak })}
            </p>
            <div className="flex gap-2">
              <button onClick={() => window.history.back()} className="flex-1 h-11 border border-border rounded-xl text-sm font-semibold">
                {t("common.back")}
              </button>
              <button
                onClick={() => { setStreakAcknowledged(true); setShowStreakGate(false); }}
                className="flex-1 h-11 bg-primary text-white rounded-xl text-sm font-bold"
              >
                {t("sell.streakAck")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function StepReceipts({
  receipts,
  setReceipts,
  malls,
  rule,
  totalAmount,
  totalHours,
  baseHours,
  sellerAssist,
  setSellerAssist,
  onNext,
}: {
  receipts: ReceiptDraft[];
  setReceipts: (r: ReceiptDraft[]) => void;
  malls: Mall[];
  rule: MallRuleConfig;
  totalAmount: number;
  totalHours: number;
  baseHours: number;
  sellerAssist: boolean;
  setSellerAssist: (v: boolean) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const mallOfFirst = receipts[0]?.mall ?? "";

  function update(id: string, patch: Partial<ReceiptDraft>) {
    setReceipts(receipts.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    if (receipts.length === 1) return;
    setReceipts(receipts.filter((r) => r.id !== id));
  }
  function add() {
    setReceipts([...receipts, newDraft(mallOfFirst)]);
  }

  const allValid = receipts.every(
    (r) =>
      r.mall &&
      r.category &&
      r.payment &&
      Number(r.amount) > 0 &&
      !!r.photoUrl &&
      !r.uploading &&
      r.mall === mallOfFirst,
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-bold text-lg">{t("sell.step1Title")}</h2>
        <p className="text-xs text-muted-foreground mt-1">{t("sell.step1Hint")}</p>
      </div>

      <div className="space-y-4">
        {receipts.map((r, idx) => (
          <ReceiptForm
            key={r.id}
            index={idx}
            data={r}
            canRemove={receipts.length > 1}
            lockedMall={idx > 0 ? mallOfFirst : null}
            malls={malls}
            rule={rule}
            sellerAssist={sellerAssist}
            setSellerAssist={setSellerAssist}
            onChange={(patch) => update(r.id, patch)}
            onRemove={() => remove(r.id)}
          />
        ))}
      </div>

      <button
        onClick={add}
        className="w-full h-12 rounded-xl border-2 border-dashed border-border bg-card flex items-center justify-center gap-2 text-sm font-semibold text-primary"
      >
        <Plus className="w-4 h-4" /> {t("sell.addReceipt")}
      </button>

      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("sell.totalSpend")}</span>
          <span className="font-bold">HK${totalAmount.toFixed(0)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("sell.estimatedHours")}</span>
          <span className="font-bold text-primary">
            {totalHours >= rule.maxParkingHours && totalHours > 0
              ? t("sell.hoursMax", { hours: totalHours, max: rule.maxParkingHours })
              : t("sell.hours", { hours: totalHours })}
          </span>
        </div>
        {rule.mallCategory === "C" && receipts.some((r) => r.category === "餐廳") && baseHours > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">🍽️ 食肆加碼</span>
            <span className="font-bold text-green-600">+2 小時</span>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">
          {rule.mallCategory === "C"
            ? (() => {
                const threshold = rule.spendingTiers[0]?.min_spend ?? rule.minSpendPerHour;
                const baseHrs = rule.spendingTiers[0]?.hours ?? 2;
                const hasRest = receipts.some((r) => r.category === "餐廳");
                return hasRest
                  ? `消費滿$${threshold} → ${baseHrs}小時，食肆加碼 +2小時 @ $5/時`
                  : `消費滿$${threshold} → ${baseHrs}小時 @ $5/時（食肆收據另享 +2小時）`;
              })()
            : t("sell.mallRule", { rate: rule.minSpendPerHour, max: rule.maxParkingHours })}
        </div>
        {totalAmount > 0 && totalHours === 0 && (
          <div className="text-[11px] text-orange-500 flex items-center gap-1 pt-1">
            <AlertCircle className="w-3 h-3" /> {t("sell.belowThreshold", { min: rule.minSpendPerHour })}
          </div>
        )}
      </div>

      <div className="bg-muted/50 rounded-xl p-3 text-[11px] text-muted-foreground">
        {t("sell.noCashNotice")}
      </div>

      <Button
        onClick={onNext}
        disabled={!allValid || totalHours === 0}
        className="w-full h-12 rounded-xl"
      >
        {t("sell.nextStep")} <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

function ReceiptForm({
  index,
  data,
  canRemove,
  lockedMall,
  malls,
  rule,
  sellerAssist,
  setSellerAssist,
  onChange,
  onRemove,
}: {
  index: number;
  data: ReceiptDraft;
  canRemove: boolean;
  lockedMall: string | null;
  malls: Mall[];
  rule: MallRuleConfig;
  sellerAssist: boolean;
  setSellerAssist: (v: boolean) => void;
  onChange: (patch: Partial<ReceiptDraft>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const previewHours = hoursFromSpend(Number(data.amount) || 0, rule);
  const mallCategoryLocal = useMemo(() => {
    const row = malls.find((m) => m.name === data.mall);
    return (row?.mall_category ?? "A") as string;
  }, [malls, data.mall]);
  return (
    <div className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <ReceiptIcon className="w-4 h-4 text-primary" />
          {t("sell.receiptNum", { num: index + 1 })}
          {previewHours > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              +{previewHours}h
            </span>
          )}
        </div>
        {canRemove && (
          <button onClick={onRemove} className="text-muted-foreground hover:text-destructive p-1" aria-label="移除">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <FieldRow label={t("sell.fieldMall")}>
        <NearbyMallPicker
          malls={malls}
          value={data.mall}
          disabled={!!lockedMall}
          onChange={(name) => onChange({ mall: name })}
        />
        {lockedMall && (
          <div className="mt-1 text-[10px] text-muted-foreground">
            {t("sell.lockedMall", { mall: lockedMall })}
          </div>
        )}
        {data.mall.includes("MOSTown") && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-relaxed">
            🛒 <strong>超市收據賣家注意：</strong>如持有一田超市收據，請先到超市服務台換取實體泊車券，再放售該實體泊車券（而非原超市收據）。
          </div>
        )}
        {data.mall.includes("K11 MUSEA") && (
          <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800 leading-relaxed">
            📱 <strong>賣家重要提示：</strong>放售前請勿在 K11 HK App 登記積分，否則收據即作廢，買家將無法換領泊車優惠。
          </div>
        )}
        {index === 0 && mallCategoryLocal === "C" && (
          <div className="mt-3 rounded-lg border border-border bg-card px-3 py-2.5">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-[12px] font-semibold">🅿️ 代辦領展泊車優惠</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  買家只需提供車牌，賣家親自到服務處辦理，完成後上傳確認相片
                </div>
              </div>
              <div
                onClick={() => setSellerAssist(!sellerAssist)}
                className={cn(
                  "relative w-10 h-6 rounded-full transition-colors shrink-0",
                  sellerAssist ? "bg-primary" : "bg-border",
                )}
              >
                <div
                  className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                    sellerAssist ? "translate-x-5" : "translate-x-1",
                  )}
                />
              </div>
            </label>
            {sellerAssist && (
              <div className="mt-2 text-[10px] text-primary">
                ✓ 已選擇代辦服務，建議定價時加 $5–$10 作服務費
              </div>
            )}
          </div>
        )}
      </FieldRow>

      <FieldRow label={t("sell.fieldType")}>
        <select
          value={data.category}
          onChange={(e) => onChange({ category: e.target.value as any })}
          className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="">{t("sell.selectType")}</option>
          {RECEIPT_TYPES.map((rType) => (
            <option key={rType} value={rType}>{rType}</option>
          ))}
        </select>
      </FieldRow>

      <FieldRow label={t("sell.fieldAmount")}>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          value={data.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          placeholder="例：328"
        />
      </FieldRow>

      <FieldRow label={t("sell.fieldPayment")}>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange({ payment: p })}
              className={cn(
                "py-2 rounded-lg border text-[11px] font-semibold",
                data.payment === p
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground",
              )}
            >
              {p}
            </button>
          ))}
        </div>
        {data.payment === "信用卡" && (
          <div className="mt-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] leading-relaxed text-primary">
            {SLIP_HINT_SELL}
          </div>
        )}
      </FieldRow>

      <FieldRow label={t("sell.fieldPhoto")}>
        {data.photoPreview ? (
          <div className="relative">
            <img
              src={data.photoPreview}
              alt={`收據 #${index + 1} 相片`}
              className="w-full max-h-56 object-cover rounded-xl border border-border"
            />
            <button
              type="button"
              onClick={() => onChange({ photoUrl: null, photoPreview: null })}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white grid place-items-center"
              aria-label="移除相片"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <label className="block border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:bg-accent">
            {data.uploading ? (
              <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin text-primary" />
            ) : (
              <Camera className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
            )}
            <div className="text-xs font-semibold">
              {data.uploading ? t("sell.uploading") : t("sell.uploadPhoto")}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground leading-tight px-2">
              {t("sell.photoHint")}
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={data.uploading}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const preview = URL.createObjectURL(f);
                onChange({ uploading: true, photoPreview: preview });
                const url = await uploadListingPhoto(f, t);
                if (url) onChange({ uploading: false, photoUrl: url, photoPreview: preview });
                else onChange({ uploading: false, photoUrl: null, photoPreview: null });
              }}
            />
          </label>
        )}
        <div className="mt-1.5 text-[11px] text-muted-foreground">{t("sell.photoHint2")}</div>
        <div className="text-[10px] text-muted-foreground/80">{t("sell.photoHint3")}</div>
      </FieldRow>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

function StepConfirm({
  receipts,
  mall,
  rule,
  totalAmount,
  totalHours,
  price,
  setPrice,
  sellerAssist,
  onDone,
}: {
  receipts: ReceiptDraft[];
  mall: string;
  rule: MallRuleConfig;
  totalAmount: number;
  totalHours: number;
  price: number;
  setPrice: (n: number) => void;
  sellerAssist: boolean;
  onDone: () => void;
}) {
  const suggested = suggestedPriceOf(totalHours, rule) + (sellerAssist ? 10 : 0);
  const max = maxPriceOf(totalHours, rule);
  const { t } = useTranslation();
  const [expiry, setExpiry] = useState<"1h" | "2h" | "close">("2h");
  const [submitting, setSubmitting] = useState(false);
  const { data: malls = [] } = useMalls();

  const mallRow = useMemo(
    () =>
      malls.find((m) => m.name === mall) ??
      malls.find((m) => m.name.includes(mall)) ??
      malls.find((m) => mall.includes(m.name)),
    [malls, mall],
  );
  const mallCategory = (mallRow?.mall_category ?? "A") as string;

  const [marketRate, setMarketRate] = useState<MarketRate | null>(null);
  useEffect(() => {
    let cancelled = false;
    setMarketRate(null);
    if (!mallRow?.id) return;
    fetchMarketRate(mallRow.id)
      .then((r) => { if (!cancelled) setMarketRate(r); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mallRow?.id]);

  const priceInvalid = price <= 0;
  const priceTooLow = price > 0 && price < 15;
  const priceTooHigh = price > max;

  async function handleSubmit() {
    if (priceInvalid || priceTooLow) return;
    setSubmitting(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        toast.error(t("sell.loginRequired"));
        setSubmitting(false);
        return;
      }
      const mallRow2 =
        malls.find((m) => m.name === mall) ??
        malls.find((m) => m.name.includes(mall)) ??
        malls.find((m) => mall.includes(m.name)) ??
        malls[0];
      if (!mallRow2) {
        toast.error(t("sell.mallLoadError"));
        setSubmitting(false);
        return;
      }
      try { await syncUserToOwn(userRes.user); } catch (err) { console.warn("[sell] syncUserToOwn failed:", err); }
      const expiryMs = expiry === "1h" ? 3600_000 : expiry === "2h" ? 7200_000 : 8 * 3600_000;
      const merchantSummary = receipts.length === 1
        ? `${receipts[0].category}`
        : t("sell.multiReceiptSummary", { count: receipts.length });
      const detailSerial = receipts
        .map((r, i) => `#${i + 1} ${r.category} $${Number(r.amount).toFixed(0)} ${r.payment}`)
        .join(" | ");
      const created = await createOwnListing({
        seller_id: userRes.user.id,
        mall_id: mallRow2.id,
        mall_name: mall || mallRow2.name,
        merchant_name: merchantSummary,
        receipt_amount: totalAmount,
        asking_price: price,
        parking_hours: totalHours,
        expires_at: new Date(Date.now() + expiryMs).toISOString(),
        receipt_serial: detailSerial,
        receipt_photo_url: receipts.find((r) => r.photoUrl)?.photoUrl ?? undefined,
        payment_method: Array.from(new Set(receipts.map((r) => r.payment).filter(Boolean))).join("、") || undefined,
        seller_assist: sellerAssist,
      });
      notifyListingAlerts({
        listing_id: (created as any)?.id,
        mall_id: Number(mallRow2.id),
        seller_id: userRes.user.id,
        asking_price: price,
        mall_name: mall || mallRow2.name,
        parking_hours: totalHours,
      }).catch(() => {});
      onDone();
    } catch (e: any) {
      console.error(e);
      const msg = String(e?.message ?? "");
      if (/foreign key/i.test(msg)) {
        toast.error(t("sell.syncError"));
      } else {
        toast.error(t("sell.submitError"), { description: msg });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-bold text-lg">{t("sell.step2Title")}</h2>
        <p className="text-xs text-muted-foreground mt-1">{t("sell.step2Hint")}</p>
      </div>

      {mallCategory === "C" && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
          <span>⚠️</span>
          <span>{t("sell.linkNotice")}</span>
        </div>
      )}

      <div className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)] space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-border/50">
          <span className="text-xs text-muted-foreground">商場</span>
          <span className="font-bold text-sm">{mall}</span>
        </div>
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-muted-foreground">
            {t("sell.receiptList", { count: receipts.length })}
          </div>
          {receipts.map((r, i) => (
            <div key={r.id} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-3 py-2">
              <div>
                <span className="font-semibold">#{i + 1}</span>
                <span className="ml-2">{r.category}</span>
                <span className="ml-1.5 text-muted-foreground">· {r.payment}</span>
              </div>
              <div className="font-bold">HK${Number(r.amount).toFixed(0)}</div>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-border/50 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-muted-foreground">{t("sell.totalSpend")}</div>
            <div className="font-bold text-sm">HK${totalAmount.toFixed(0)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">{t("sell.parkingHours")}</div>
            <div className="font-bold text-sm text-primary">{t("sell.hours", { hours: totalHours })}</div>
          </div>
        </div>
      </div>

      <div className={cn(
        "bg-card rounded-2xl p-4 shadow-[var(--shadow-card)] border-2 transition-colors",
        priceInvalid ? "border-destructive/40" : "border-transparent",
      )}>
        <label className="text-xs font-semibold text-muted-foreground">{t("sell.priceLabel")}</label>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-2xl font-bold text-muted-foreground">HK$</span>
          <Input
            type="number"
            inputMode="numeric"
            min={15}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value) || 0)}
            className="text-3xl font-bold h-14 border-0 focus-visible:ring-0 p-0"
          />
        </div>
        <div className="flex gap-2 mt-3">
          <QuickPrice label={t("sell.suggestedPrice", { price: suggested })} onClick={() => setPrice(suggested)} active={price === suggested} />
          <QuickPrice label={t("sell.maxPrice", { price: max })} onClick={() => setPrice(max)} active={price === max} />
        </div>
        {priceInvalid && (
          <div className="mt-3 flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{t("sell.priceRequired")}</span>
          </div>
        )}
        {priceTooLow && (
          <div className="mt-3 flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{t("sell.priceTooLow")}</span>
          </div>
        )}
        {priceTooHigh && (
          <div className="mt-3 flex items-start gap-1.5 text-xs text-orange-500">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{t("sell.priceTooHigh", { max, rate: rule.hourlyRate, hours: totalHours })}</span>
          </div>
        )}
        <div className="mt-2 text-[10px] text-muted-foreground">
          {t("sell.priceTip", { rate: rule.hourlyRate, hours: totalHours, suggested })}
        </div>
        {marketRate && (
          <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
            {"💡 "}{t("sell.marketMedian", { median: marketRate.median ?? marketRate.avg })}{" · "}{t("sell.marketNote")}
          </div>
        )}
        <div className="mt-1.5 text-[11px] text-muted-foreground">{t("sell.minPrice")}</div>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground mb-2 block">{t("sell.expiryLabel")}</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { k: "1h", l: t("sell.expiry1h") },
            { k: "2h", l: t("sell.expiry2h") },
            { k: "close", l: t("sell.expiryClose") },
          ].map((o) => (
            <button
              key={o.k}
              onClick={() => setExpiry(o.k as any)}
              className={cn(
                "py-3 rounded-xl border text-sm font-semibold",
                expiry === o.k ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground",
              )}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">{t("sell.feeNote")}</p>

      <Button
        onClick={handleSubmit}
        disabled={priceInvalid || priceTooLow || submitting}
        className="w-full h-12 rounded-xl bg-success hover:bg-success/90 text-success-foreground disabled:opacity-50"
      >
        {submitting ? t("sell.submitting") : t("sell.submit")}
      </Button>
    </div>
  );
}

function QuickPrice({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 py-1.5 rounded-lg text-[11px] font-semibold border",
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

function StepDone() {
  const { t } = useTranslation();
  useEffect(() => { toast.success(t("sell.doneToast")); }, [t]);
  return (
    <div className="py-16 flex flex-col items-center gap-5 text-center">
      <div className="w-20 h-20 rounded-full bg-success/15 grid place-items-center">
        <Check className="w-10 h-10 text-success" strokeWidth={3} />
      </div>
      <div>
        <h2 className="text-xl font-bold">{t("sell.doneTitle")}</h2>
        <p className="text-sm text-muted-foreground mt-2">{t("sell.doneSubtitle")}</p>
      </div>
      <div className="bg-card rounded-2xl p-4 w-full shadow-[var(--shadow-card)]">
        <div className="text-xs text-muted-foreground">{t("sell.doneNotice")}</div>
      </div>
    </div>
  );
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function NearbyMallPicker({
  malls,
  value,
  disabled,
  onChange,
}: {
  malls: Mall[];
  value: string;
  disabled?: boolean;
  onChange: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [gpsState, setGpsState] = useState<"idle" | "detecting" | "ok" | "denied">("detecting");
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [mallsWithCoords, setMallsWithCoords] = useState<any[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    ownSupabase
      .from("malls")
      .select("id, name, lat, lng")
      .not("lat", "is", null)
      .then(({ data }: any) => setMallsWithCoords(data ?? []));
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsState("denied");
      return;
    }
    setGpsState("detecting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsState("ok");
      },
      () => setGpsState("denied"),
      { timeout: 8000, maximumAge: 60000 },
    );
  }, []);

  const displayMalls: (Mall & { distKm?: number })[] = useMemo(() => {
    if (!userPos) return malls.map((m) => ({ ...m }));
    const withDist = malls.map((m) => {
      let lat = m.lat;
      let lng = m.lng;
      if (lat == null || lng == null) {
        const coords = mallsWithCoords.find((c: any) => String(c.id) === String(m.id));
        lat = coords?.lat ?? null;
        lng = coords?.lng ?? null;
      }
      const distKm =
        lat != null && lng != null
          ? haversineKm(userPos.lat, userPos.lng, Number(lat), Number(lng))
          : 999;
      return { ...m, distKm };
    });
    withDist.sort((a, b) => (a.distKm ?? 999) - (b.distKm ?? 999));
    return withDist;
  }, [malls, mallsWithCoords, userPos]);

  const filteredMalls = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return displayMalls.filter((m) => m.name.toLowerCase().includes(q) || (m.district && m.district.toLowerCase().includes(q)));
  }, [displayMalls, query]);

  const hasGps = gpsState === "ok" && userPos != null;
  const nearbyCount = hasGps ? 3 : 4;
  const nearbyMalls = displayMalls.slice(0, nearbyCount);
  const restMalls = displayMalls.slice(nearbyCount);
  const isSearching = query.trim().length > 0;

  if (disabled) {
    return (
      <div className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm flex items-center text-muted-foreground opacity-70">
        {value || t("sell.lockedMallPlaceholder")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {value && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 mb-1">
          <Check className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-sm font-semibold text-primary flex-1">{value}</span>
          <button type="button" onClick={() => onChange("")} className="text-muted-foreground hover:text-destructive" aria-label="取消選擇">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋商場或地區…"
          autoFocus
          className="w-full h-10 pl-9 pr-9 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-muted grid place-items-center text-muted-foreground"
            aria-label="清除搜尋"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {gpsState === "detecting" && (<><Loader2 className="w-3 h-3 animate-spin" /> {t("sell.gpsDetecting")}</>)}
        {gpsState === "ok" && (<><Navigation className="w-3 h-3 text-success" /> {t("sell.gpsSorted")}</>)}
        {(gpsState === "denied" || gpsState === "idle") && (<><MapPin className="w-3 h-3" /> {t("sell.gpsSelect")}</>)}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(isSearching ? filteredMalls : nearbyMalls).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => { onChange(value === m.name ? "" : m.name); setQuery(""); }}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-xl border-2 p-3 text-center transition-colors",
              value === m.name ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent",
            )}
          >
            <span className="text-2xl">{m.icon_emoji}</span>
            <span className="text-[11px] font-semibold leading-tight line-clamp-2">{m.name}</span>
            {m.distKm != null && m.distKm < 900 && (
              <span className="text-[9px] text-muted-foreground">
                {m.distKm < 1 ? `${Math.round(m.distKm * 1000)}m` : `${m.distKm.toFixed(1)}km`}
              </span>
            )}
          </button>
        ))}
      </div>

      {!isSearching && restMalls.length > 0 && (
        <>
          <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full text-[11px] text-primary font-semibold py-1">
            {showAll ? t("sell.showLess") : t("sell.showMore", { count: restMalls.length })}
          </button>
          {showAll && (
            <div className="grid grid-cols-2 gap-2">
              {restMalls.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onChange(value === m.name ? "" : m.name); setQuery(""); }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-xl border-2 p-3 text-center transition-colors",
                    value === m.name ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent",
                  )}
                >
                  <span className="text-2xl">{m.icon_emoji}</span>
                  <span className="text-[11px] font-semibold leading-tight line-clamp-2">{m.name}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
