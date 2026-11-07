import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { AppLayout } from "@/components/AppLayout";
import { Chip, Section, DemoBadge } from "@/components/aah/ui";
import { RegisterSheet } from "@/components/aah/RegisterSheet";
import { aah, aahErrorText, getSettings, testLocationAllowed, useAahState, isBanned, dailyDiningCount, DINING_POSTS_PER_DAY } from "@/lib/aah/store";
import { useAahMalls, demoAudience } from "@/lib/aah/malls";
import { useCurrentMall, fmtClock, useNow } from "@/lib/aah/geo";
import { SCENARIOS, SCENARIO_LIST, GROUPBUY_DEALS, PAY_METHODS, authorRole, diningFlag, receiptCountNote, cleanMoneyInput, payLabel } from "@/lib/aah/scenarios";
import { ScenarioTips } from "@/components/aah/ScenarioTips";
import { quoteParkingReceipt, quoteParkingWant, quoteOffer, mallDiningExtra, mallHasDiningRule, diningTierToday } from "@/lib/aah/pricing";
import type { FieldDef } from "@/lib/aah/scenarios";
import { readAmountsFromImage, fmtAmount } from "@/lib/aah/ocr";
import { takePendingPhoto } from "@/lib/aah/pendingPhoto";
import { GIVE_CATS } from "@/lib/aah/copy";
import type { Direction, PayMethod, ScenarioId } from "@/lib/aah/types";
import { cn } from "@/lib/utils";

/** 直接入去某個場景（例如「搵」唔到時「話人知你要泊車」），用最常見嘅預設，填少啲就發得 */
export type QuickKind = "receipt" | "want" | "dining" | "offer" | "offerwant" | "groupbuy";
const QUICK_KINDS: QuickKind[] = ["receipt", "want", "dining", "offer", "offerwant", "groupbuy"];
const QUICK_SETUP: Record<QuickKind, { scenario: ScenarioId; direction: Direction }> = {
  receipt: { scenario: "parking", direction: "have" },
  want: { scenario: "parking", direction: "want" },
  dining: { scenario: "dining", direction: "have" },
  offer: { scenario: "offer", direction: "have" },
  offerwant: { scenario: "offer", direction: "want" },
  groupbuy: { scenario: "groupbuy", direction: "join" },
};

export const Route = createFileRoute("/post/new")({
  head: () => ({ meta: [{ title: "放出去 · 啱啱好" }] }),
  validateSearch: (s: Record<string, unknown>): { quick?: QuickKind } =>
    QUICK_KINDS.includes(s.quick as QuickKind) ? { quick: s.quick as QuickKind } : {},
  component: NewPost,
});

const MIN = 60000;
/** 「更多設定」入面嘅欄位（有預設，唔改都得） */
const MORE_KEYS = new Set(["receiptCount", "receiptType", "receiptCategory", "calling", "note"]);
/** 類別色（深少少，白字睇得清） */
const GIVE_TILE_COLOR: Record<ScenarioId, string> = { parking: "#1E7F52", dining: "#2F62C9", offer: "#B8336A", groupbuy: "#C2531A" };
const REMARK_MAX = 80;
const REMARK_PLACEHOLDER: Record<ScenarioId, string> = {
  parking: "例如：一張餐廳單加一張超市單，喺停車場繳費處等",
  dining: "例如：卡位，叫號前 5 分鐘喺門口等",
  offer: "例如：只限指定貨品，今晚 10 點到期",
  groupbuy: "例如：滿 $500 減 $100，想搵人夾 $250",
};

function NewPost() {
  const navigate = useNavigate();
  const { user, posts } = useAahState();
  const { malls } = useAahMalls();
  const current = useCurrentMall(malls);
  const now = useNow(30000);
  const mall = current.mall;

  const [scenario, setScenario] = useState<ScenarioId | null>(null);
  const [direction, setDirection] = useState<Direction>("have");
  const [shop, setShop] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [remark, setRemark] = useState("");
  const [price, setPrice] = useState<string>("");
  const [free, setFree] = useState(false);
  const [pay, setPay] = useState<PayMethod[]>(user.defaultPayMethods);
  const [leaveMode, setLeaveMode] = useState<number | "custom">(30);
  const [customTime, setCustomTime] = useState("");
  const [autoAccept, setAutoAccept] = useState(false);
  const [acceptEnRoute, setAcceptEnRoute] = useState(false);
  const [needCount, setNeedCount] = useState(1);
  const [regOpen, setRegOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrNote, setOcrNote] = useState("");
  /** 張相讀到嘅幾個金額，俾用戶撳嚟揀 */
  const [ocrOptions, setOcrOptions] = useState<number[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickFileRef = useRef<HTMLInputElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const s = scenario ? SCENARIOS[scenario] : null;
  const diningExtra = mallDiningExtra(mall);
  const hasDiningRule = mallHasDiningRule(mall);
  const diningTier = diningTierToday(mall, now);
  const fieldShown = (f: FieldDef) => (!f.onlyFor || f.onlyFor.includes(direction)) && (!f.onlyIfDiningRule || hasDiningRule);

  /** 最常見嘅選擇做預設（用戶睇到、可以改），慳返幾下撳 */
  function defaultFields(id: ScenarioId, dir: Direction): Record<string, string> {
    if (id === "groupbuy") return { deal: GROUPBUY_DEALS[1] };
    if (id === "parking" && dir === "have") return { receiptCount: "1 張", receiptType: "紙單" };
    if (id === "parking" && dir === "want") return { hours: "2" };
    if (id === "dining") return { partySize: "2" };
    return {};
  }

  function pickScenario(id: ScenarioId, dir: Direction = SCENARIOS[id].directions[0]) {
    setScenario(id);
    setDirection(dir);
    setFields(defaultFields(id, dir));
    setRemark("");
    setShop(id === "parking" ? "停車場" : "");
    setPrice("");
    setFree(false);
    setOcrNote("");
    setOcrOptions([]);
  }

  // 由首頁快捷掣入嚟：直接揀好場景；「影收據」就即刻讀張相
  const { quick } = Route.useSearch();
  const quickDone = useRef(false);
  useEffect(() => {
    if (!quick || quickDone.current) return;
    quickDone.current = true;
    const q = QUICK_SETUP[quick];
    pickScenario(q.scenario, q.direction);
    if (quick === "receipt") {
      const photo = takePendingPhoto();
      if (photo) void onPhoto(photo, "receiptAmount");
    }
  }, [quick]); // eslint-disable-line react-hooks/exhaustive-deps

  // 商場有食肆單規則：預設「冇食肆單」（保守計鐘），計數卡會提你有食肆單可以換多啲
  useEffect(() => {
    if (scenario === "parking" && direction === "have" && hasDiningRule && !fields.receiptCategory) {
      setFields((x) => (x.receiptCategory ? x : { ...x, receiptCategory: "冇食肆單" }));
    }
  }, [scenario, direction, hasDiningRule, fields.receiptCategory]);

  const leaveAt = useMemo(() => {
    if (leaveMode !== "custom") return now + leaveMode * MIN;
    const m = customTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    // 用香港時間計今日嗰個鐘數
    const hkNow = new Date(now + 8 * 3600 * 1000);
    const target = Date.UTC(hkNow.getUTCFullYear(), hkNow.getUTCMonth(), hkNow.getUTCDate(), Number(m[1]), Number(m[2])) - 8 * 3600 * 1000;
    return target > now ? target : null;
  }, [leaveMode, customTime, now]);

  // 計數同建議價：
  // - 計數（換幾多個鐘、慳幾多）即刻顯示喺用戶輸入嗰格下面（field）
  // - 建議價（慳到嘅一半）顯示喺價錢格下面，只係提示，唔會幫用戶填
  type Suggestion = {
    field: string;
    headline: string | null;
    saving: number | null;
    detail: string | null;
    warn?: boolean;
    max: number | null;
    basis: string | null;
    hours: number;
  };
  const suggestion = useMemo((): Suggestion | null => {
    if (!s || !mall) return null;
    if (s.id === "parking" && direction === "have") {
      const amt = Number(fields.receiptAmount);
      if (!amt) return null;
      const dining = diningFlag(fields);
      const q = quoteParkingReceipt(mall, amt, now, { dining });
      if (q.belowThreshold) {
        return {
          field: "receiptAmount",
          headline: "今日換唔到泊車",
          saving: null,
          detail: `按今日（${q.dayLabel}）規則，要消費滿 $${q.minThreshold} 先換到。`,
          warn: true,
          max: null,
          basis: null,
          hours: 0,
        };
      }
      const detail = [
        q.rate != null ? `按今日（${q.dayLabel}）時租 $${q.rate}` : `按今日（${q.dayLabel}）規則；呢個商場未有時租資料`,
        q.extraApplied ? `已計食肆單額外 ${q.extraApplied} 個鐘` : null,
        q.discRate != null ? `換到嘅鐘數每個鐘仲要俾停車場 $${q.discRate}（共 $${q.copay}）` : null,
        !dining && q.hoursIfDining > q.hours ? `如果入面有食肆單，可以換到 ${q.hoursIfDining} 個鐘` : null,
      ]
        .filter(Boolean)
        .join("；");
      return {
        field: "receiptAmount",
        headline: `可以換 ${q.hours} 個鐘`,
        saving: q.saving,
        detail: `${detail}。`,
        max: q.suggestMax,
        basis: q.saving != null ? `慳到 $${q.saving} 嘅一半` : null,
        hours: q.hours,
      };
    }
    if (s.id === "parking" && direction === "want") {
      const h = Number(fields.hours);
      if (!h) return null;
      const q = quoteParkingWant(mall, h, now);
      if (q.fee == null) return null;
      return {
        field: "hours",
        headline: `用單據泊 ${h} 個鐘`,
        saving: q.fee,
        detail:
          q.discRate != null && q.full != null
            ? `按今日（${q.dayLabel}）正價 $${q.full}；用單據換咗之後每個鐘仲要俾 $${q.discRate}（共 $${q.copay}）。`
            : `按今日（${q.dayLabel}）時租 $${q.rate}。`,
        max: q.suggestMax,
        basis: `慳到 $${q.fee} 嘅一半`,
        hours: h,
      };
    }
    if (s.id === "offer" && direction === "have" && Number(fields.faceValue)) {
      return {
        field: "faceValue",
        headline: null,
        saving: null,
        detail: null,
        max: quoteOffer(Number(fields.faceValue)).suggestMax,
        basis: `面值 $${fields.faceValue} 嘅一半`,
        hours: 0,
      };
    }
    return null;
  }, [s, mall, direction, fields, now]);

  const priceNum = free ? 0 : price === "" ? null : Number(price);

  // 一撳發佈：用戶未填價錢時用嘅價（泊車、有面值嘅優惠用建議價；食飯飛、冇面值嘅優惠用免費）
  // 只會喺用戶撳發佈掣先用，掣上面寫明係幾多錢
  const quickPrice = useMemo((): number | null => {
    if (!s || !s.hasPrice || free || price !== "") return null;
    if (s.id === "parking") return suggestion?.max != null && suggestion.max > 0 ? suggestion.max : null;
    if (s.id === "offer") return suggestion?.max != null && suggestion.max > 0 ? suggestion.max : 0;
    if (s.id === "dining") return 0;
    return null;
  }, [s, free, price, suggestion]);
  const effPrice = priceNum ?? quickPrice;
  /** 自己冇揀收款方式就用現金（掣上面會寫） */
  const effPay: PayMethod[] = pay.length ? pay : ["cash"];

  const missing = useMemo(() => {
    if (!s) return "揀一個場景";
    if (s.shopLabel && !shop.trim()) return "填舖頭";
    for (const f of s.fields) {
      if (!fieldShown(f)) continue;
      const v = String(fields[f.key] ?? "").trim();
      if (f.required && !v) return `${f.type === "choice" ? "揀" : "填"}「${f.label}」`;
      if (f.type === "number" && v && !(Number(v) > 0)) return `填啱「${f.label}」`;
    }
    if (s.hasPrice && effPrice == null) return "填價錢（可以揀免費）";
    if (s.hasPrice && priceNum != null && priceNum > 0 && pay.length === 0) return "揀收款方式";
    if (!leaveAt) return "揀時間";
    return null;
  }, [s, shop, fields, direction, priceNum, effPrice, pay, leaveAt, hasDiningRule]);

  async function submit() {
    if (!s || !scenario || missing || !leaveAt || submitting) return;
    const me = aah.get().user;
    if (isBanned(me)) {
      toast.error("你嘅帳戶停用緊，暫時唔可以出 post", { description: "可以喺「我的配對」申訴" });
      return;
    }
    if (!me.registered) {
      setRegOpen(true);
      return;
    }
    if (!mall || (!current.verified && !testLocationAllowed())) {
      toast.error("去到商場先放得", { description: "對方會即刻嚟搵你見面交收，所以要 GPS 確認你喺商場" });
      return;
    }
    if (scenario === "dining" && dailyDiningCount(posts, user.id) >= DINING_POSTS_PER_DAY) {
      toast.error(`每人每日最多出 ${DINING_POSTS_PER_DAY} 個食飯候位 post`);
      return;
    }
    const f: Record<string, string | number> = {};
    for (const def of s.fields) {
      if (!fieldShown(def)) continue;
      const v = fields[def.key];
      if (v == null || v === "") continue;
      f[def.key] = def.type === "number" ? Number(v) : v.trim();
    }
    if (scenario === "parking" && direction === "have" && suggestion?.hours) f.hours = suggestion.hours;
    if (remark.trim()) f.remark = remark.trim();

    setSubmitting(true);
    try {
    const post = await aah.createPost({
      scenario,
      direction,
      mallId: mall.id,
      mallName: mall.name,
      shop: shop.trim() || "停車場",
      fields: f,
      price: s.hasPrice ? effPrice : null,
      payMethods: s.hasPrice && effPrice && effPrice > 0 ? effPay : [],
      leaveAt,
      verifiedOnSite: current.verified,
      pushedCount: Math.round(demoAudience(mall.id) * (user.notifyCats.length / 4 || 1)),
      autoAccept,
      acceptEnRoute: scenario !== "groupbuy" && acceptEnRoute,
      needCount: scenario === "groupbuy" ? needCount : undefined,
    });
    toast.success("已經發佈！");
    navigate({ to: "/post/$postId", params: { postId: post.id }, replace: true });
    } catch (e) {
      toast.error(aahErrorText(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function onPhoto(file: File | undefined, keyOverride?: string) {
    if (!file) return;
    setOcrBusy(true);
    setOcrNote("");
    setOcrOptions([]);
    try {
      const { best, options } = await readAmountsFromImage(file);
      if (best != null) {
        const key = keyOverride ?? (scenario === "offer" ? "faceValue" : "receiptAmount");
        setFields((x) => ({ ...x, [key]: fmtAmount(best) }));
        setOcrOptions(options);
        setOcrNote(
          options.length > 1
            ? `讀到 $${fmtAmount(best)}。唔啱就撳下面另一個金額，或者自己改（填實際俾咗嘅總數）。`
            : `讀到 $${fmtAmount(best)}，唔啱可以自己改。`,
        );
      } else {
        setOcrNote("讀唔到金額，請自己填。");
      }
    } catch {
      setOcrNote("讀唔到張相，請自己填。");
    } finally {
      setOcrBusy(false);
    }
  }

  const overSuggest = suggestion?.max != null && priceNum != null && priceNum > suggestion.max;
  const timeWord = scenario === "dining" ? "叫號" : "走";

  // 發佈掣上面嗰行：一眼睇到會發咩出去
  const summary = useMemo(() => {
    if (!s || missing || !leaveAt) return null;
    const parts: string[] = [];
    if (s.id === "parking" && direction === "have" && suggestion?.hours) parts.push(`可換 ${suggestion.hours} 個鐘`);
    if (s.id === "parking" && direction === "want" && fields.hours) parts.push(`要 ${fields.hours} 個鐘`);
    if (s.id === "dining" && fields.queueNo) parts.push(`${fields.queueNo}・${fields.partySize} 位`);
    if (s.id === "groupbuy") parts.push(`${fields.deal}・搵 ${needCount} 個人`);
    if (s.hasPrice) parts.push(effPrice && effPrice > 0 ? `$${effPrice}・${payLabel(effPay)}` : "免費");
    parts.push(`${fmtClock(leaveAt)} 前有效`);
    return parts.join("・");
  }, [s, missing, leaveAt, direction, suggestion, fields, needCount, effPrice, effPay]);

  const submitLabel = submitting
    ? "發佈緊…"
    : missing
      ? `仲要${missing}`
      : s?.hasPrice && priceNum == null && quickPrice != null
        ? quickPrice > 0
          ? `用建議價 $${quickPrice} 即刻發佈`
          : "免費即刻發佈"
        : "發佈";

  // 「更多設定」入面揀咗咩：收埋都睇到
  const moreSummary = useMemo(() => {
    if (!s) return "";
    const parts: string[] = [];
    if (s.id === "parking" && direction === "have") parts.push(`${fields.receiptCount ?? "1 張"}${fields.receiptType ?? ""}`);
    if (s.id === "groupbuy") parts.push(`搵 ${needCount} 個人`);
    if (s.hasPrice && effPrice && effPrice > 0) parts.push(payLabel(effPay));
    if (leaveAt) parts.push(`${fmtClock(leaveAt)} 前有效`);
    if (s.id !== "groupbuy") parts.push(acceptEnRoute ? "去緊嘅人都接" : "只限喺場嘅人");
    if (autoAccept) parts.push("自動配對");
    return parts.join("・");
  }, [s, direction, fields, needCount, effPrice, effPay, leaveAt, timeWord, acceptEnRoute, autoAccept]);

  const essentialField = (f: FieldDef) => !MORE_KEYS.has(f.key);
  const shownFields = s ? s.fields.filter((f) => fieldShown(f) && !(s.id === "groupbuy" && f.key === "deal")) : [];

  function renderField(f: FieldDef) {
    return (
      <Section
        key={f.key}
        title={f.label}
        hint={
          f.key === "receiptAmount"
            ? "實際俾咗嘅總數；幾張單就加埋"
            : f.key === "receiptCount"
              ? "好多商場最多合併 2 張，有啲唔收合併"
              : f.key === "receiptType"
                ? "有啲商場只收電子單或者只收紙單"
                : f.key === "receiptCategory" && diningExtra
                  ? `呢個商場只要其中一張係食肆單，可以額外多換 ${diningExtra} 個鐘`
                  : f.key === "receiptCategory" && diningTier
                    ? `呢個商場今日消費滿 $${diningTier.threshold} 要其中一張係食肆（餐飲）單，先換到 ${diningTier.hours} 個鐘`
                    : undefined
        }
      >
        {f.type === "choice" ? (
          <>
            <div className="flex flex-wrap gap-2">
              {(f.options ?? []).map((o) => (
                <Chip key={o} active={fields[f.key] === o} onClick={() => setFields({ ...fields, [f.key]: o })}>{o}</Chip>
              ))}
            </div>
            {f.key === "receiptCount" && receiptCountNote(fields.receiptCount, "giver", mall?.stacking) && (
              <div className="text-xs rounded-xl px-3 py-2 bg-amber-50 text-amber-900 border border-amber-200">
                {receiptCountNote(fields.receiptCount, "giver", mall?.stacking)}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 h-12 px-4 rounded-2xl border border-border bg-card">
            <input
              inputMode={f.type === "number" ? (f.decimal ? "decimal" : "numeric") : "text"}
              value={fields[f.key] ?? ""}
              onChange={(e) =>
                setFields({
                  ...fields,
                  [f.key]:
                    f.type !== "number"
                      ? e.target.value.slice(0, 40)
                      : f.decimal
                        ? cleanMoneyInput(e.target.value)
                        : e.target.value.replace(/[^\d]/g, "").slice(0, 6),
                })
              }
              placeholder={f.placeholder}
              aria-label={f.label}
              className="flex-1 bg-transparent outline-none"
            />
            {f.suffix && <span className="text-sm text-muted-foreground">{f.suffix}</span>}
          </div>
        )}
        {suggestion?.field === f.key && suggestion.headline && (
          <div
            data-testid="calc-card"
            className={cn(
              "rounded-xl px-3 py-2.5 border",
              suggestion.warn ? "bg-amber-50 text-amber-900 border-amber-200" : "bg-[#E3F5EC] text-[#1d6b47] border-[#c5e8d5]",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-bold text-sm">{suggestion.headline}</span>
              {suggestion.saving != null && suggestion.saving > 0 && (
                <span className="font-black text-lg leading-none whitespace-nowrap">慳 ${suggestion.saving}</span>
              )}
            </div>
            {suggestion.detail && <div className="text-xs mt-1 leading-relaxed opacity-90">{suggestion.detail}</div>}
            {s?.id === "parking" && direction === "have" && hasDiningRule && (
              <button
                type="button"
                onClick={() => setFields((x) => ({ ...x, receiptCategory: diningFlag(x) ? "冇食肆單" : "有食肆單" }))}
                className={cn(
                  "mt-2 h-8 px-3 rounded-full text-xs font-bold border",
                  diningFlag(fields) ? "bg-[#1d6b47] text-white border-[#1d6b47]" : "bg-white border-[#c5e8d5]",
                )}
              >
                {diningFlag(fields) ? "✓ 入面有食肆單" : "入面有食肆單？撳呢度"}
              </button>
            )}
            {mall?.source === "sample" && <div className="mt-1"><DemoBadge /></div>}
          </div>
        )}
      </Section>
    );
  }

  const wantMode = direction === "want";
  const catName = s ? (wantMode ? `我要${s.id === "parking" ? "泊車" : "優惠"}` : GIVE_CATS[s.id].name) : "";

  return (
    <AppLayout hideNav>
      {/* 揀類別嗰陣用：泊車收據一撳就開相機 */}
      <input
        ref={pickFileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="give-receipt-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onPhoto(f, "receiptAmount");
        }}
      />
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur px-4 pt-4 pb-3 flex items-center gap-3 border-b border-border/60">
        <button onClick={() => (scenario && !quick ? setScenario(null) : navigate({ to: "/" }))} aria-label="返回" className="w-9 h-9 grid place-items-center rounded-full hover:bg-accent">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="font-black text-lg leading-tight">{wantMode && scenario ? "話人知你要" : "放出去"}</div>
          <div className="text-[11px] text-muted-foreground">{mall ? `📍 ${mall.name}${current.test ? "（測試位置）" : ""}` : "未喺商場：可以先睇吓點放"}</div>
        </div>
      </header>

      <div className="px-4 pt-4 pb-32 space-y-6">
        {!scenario ? (
          <div className="space-y-3">
            <h1 className="text-xl font-black">放咩出去？</h1>
            {SCENARIO_LIST.map((id) => (
              <button
                key={id}
                onClick={() => {
                  pickScenario(id);
                  if (id === "parking") pickFileRef.current?.click();
                }}
                className="w-full flex items-center gap-3 rounded-3xl p-4 text-left text-white active:scale-[0.99] transition-transform"
                style={{ background: GIVE_TILE_COLOR[id] }}
              >
                <span className="text-3xl shrink-0" aria-hidden="true">{SCENARIOS[id].emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-bold opacity-90">{GIVE_CATS[id].name}</span>
                  <span className="block font-black text-lg leading-snug">{GIVE_CATS[id].head}</span>
                  <span className="block text-xs opacity-90">{GIVE_CATS[id].sub}</span>
                </span>
                {id === "parking" && <Camera className="w-5 h-5 shrink-0 opacity-90" aria-label="影相" />}
              </button>
            ))}
            {!mall && <p className="text-xs text-muted-foreground px-1">放出去要喺商場先發佈得，因為對方會即刻嚟搵你見面交收。可以先睇吓點放。</p>}
          </div>
        ) : (
          s && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold px-3 py-1.5 rounded-full text-white" style={{ background: GIVE_TILE_COLOR[s.id] }}>
                  {s.emoji} {catName}
                </span>
                {!quick && <button onClick={() => setScenario(null)} className="text-xs text-muted-foreground underline">換類別</button>}
              </div>

              {s.shopLabel && (
                <Section title={s.shopLabel}>
                  <input
                    value={shop}
                    onChange={(e) => setShop(e.target.value.slice(0, 30))}
                    placeholder="輸入舖頭名"
                    aria-label={s.shopLabel}
                    className="w-full h-12 px-4 rounded-2xl border border-border bg-card outline-none"
                  />
                  <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
                    {s.shopSuggestions.map((n) => (
                      <Chip key={n} active={shop === n} onClick={() => setShop(n)}>{n}</Chip>
                    ))}
                  </div>
                </Section>
              )}

              {((s.id === "parking" && direction === "have") || (s.id === "offer" && direction === "have")) && (
                <div>
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
                  {s.id === "parking" && !fields.receiptAmount && !ocrBusy ? (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-full h-16 rounded-2xl border-2 border-dashed border-[#1E7F52] bg-[#E3F5EC] text-[#1d6b47] flex items-center justify-center gap-2 font-black"
                    >
                      <Camera className="w-5 h-5" /> 影單據，自動計晒
                    </button>
                  ) : (
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={ocrBusy}
                      className="h-10 px-4 rounded-full border border-border bg-card inline-flex items-center gap-2 text-sm font-semibold"
                    >
                      {ocrBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                      {ocrBusy ? "讀緊張相…" : s.id === "parking" ? "再影過" : "影券，自動讀面值"}
                    </button>
                  )}
                  {ocrNote && <div className="text-xs text-muted-foreground mt-1.5">{ocrNote}</div>}
                  {ocrOptions.length > 1 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {ocrOptions.map((n) => {
                        const key = s.id === "offer" ? "faceValue" : "receiptAmount";
                        const v = fmtAmount(n);
                        return (
                          <Chip key={n} active={fields[key] === v} onClick={() => setFields((x) => ({ ...x, [key]: v }))}>
                            ${v}
                          </Chip>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {s.id === "groupbuy" && (
                <Section title="咩優惠？">
                  <div className="flex flex-wrap gap-2">
                    {GROUPBUY_DEALS.map((d) => (
                      <Chip key={d} active={fields.deal === d} onClick={() => setFields({ ...fields, deal: d })}>{d}</Chip>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 h-12 px-4 rounded-2xl border border-border bg-card">
                    <input
                      value={fields.deal && !GROUPBUY_DEALS.includes(fields.deal) ? fields.deal : ""}
                      onChange={(e) => setFields({ ...fields, deal: e.target.value.slice(0, 30) })}
                      placeholder="或者自己寫，例如 滿 $500 減 $100"
                      aria-label="自己寫優惠"
                      className="flex-1 min-w-0 bg-transparent outline-none"
                    />
                  </div>
                </Section>
              )}

              {shownFields.filter(essentialField).map(renderField)}

              {s.hasPrice && (
                <Section title={direction === "want" ? "你願意俾幾多錢？" : "你想收幾多錢？"} hint="見面交收時直接俾，唔經平台">
                  <div className="flex items-center gap-2">
                    <div className={cn("flex-1 min-w-0 flex items-center gap-2 h-12 px-4 rounded-2xl border bg-card", overSuggest ? "border-amber-400" : "border-border")}>
                      <span className="font-bold text-muted-foreground">$</span>
                      <input
                        inputMode="numeric"
                        value={free ? "" : price}
                        disabled={free}
                        onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                        placeholder={free ? "免費" : "自己填"}
                        aria-label="價錢"
                        className="flex-1 min-w-0 w-full bg-transparent outline-none text-lg font-bold"
                      />
                    </div>
                    <Chip active={free} onClick={() => setFree(!free)}>免費</Chip>
                  </div>
                  {suggestion?.max != null && suggestion.max > 0 && (
                    <div
                      data-testid="price-hint"
                      className={cn("text-xs rounded-xl px-3 py-2", overSuggest ? "bg-amber-50 text-amber-800" : "bg-[#E3F5EC] text-[#1d6b47]")}
                    >
                      建議唔好超過 <b className="text-sm">${suggestion.max}</b>
                      {suggestion.basis && <span>（{suggestion.basis}）</span>}
                      {overSuggest ? "。而家高過建議價，可能較難有人接。" : price === "" ? "。唔填就用建議價，想改自己填。" : "。價錢由你自己定。"}
                    </div>
                  )}
                </Section>
              )}

              {/* 更多設定：有預設，唔改都得 */}
              <div className="bg-card rounded-2xl">
                <button
                  type="button"
                  onClick={() => setMoreOpen(!moreOpen)}
                  aria-expanded={moreOpen}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block font-bold text-sm">更多設定（唔改都得）</span>
                    <span className="block text-xs text-muted-foreground truncate">{moreSummary}</span>
                  </span>
                  <ChevronDown className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform", moreOpen && "rotate-180")} />
                </button>
                {moreOpen && (
                  <div className="px-4 pb-4 space-y-6">
                    {s.id === "groupbuy" && (
                      <Section title="仲要幾多個人一齊夾？" hint="買二送一就揀 2 個人；夠人先算配對成功">
                        <div className="flex gap-2">
                          {[1, 2, 3].map((n) => (
                            <Chip key={n} active={needCount === n} onClick={() => setNeedCount(n)}>{n} 個人</Chip>
                          ))}
                        </div>
                      </Section>
                    )}

                    {shownFields.filter((f) => !essentialField(f)).map(renderField)}

                    {s.hasPrice && !free && !(price === "" && quickPrice === 0) && (
                      <Section title="收款方式" hint="下次會自動記住">
                        <div className="flex flex-wrap gap-2">
                          {PAY_METHODS.map((p) => {
                            const on = pay.includes(p.id);
                            return (
                              <Chip key={p.id} active={on} onClick={() => setPay(on ? pay.filter((x) => x !== p.id) : [...pay, p.id])}>
                                {p.label}
                              </Chip>
                            );
                          })}
                        </div>
                      </Section>
                    )}

                    <Section title={s.timeQuestion} hint={leaveAt ? `大約 ${fmtClock(leaveAt)} ${timeWord}，到時個 post 會自動過期` : undefined}>
                      <div className="flex flex-wrap gap-2">
                        {[15, 30, 60].map((m) => (
                          <Chip key={m} active={leaveMode === m} onClick={() => setLeaveMode(m)}>
                            {m === 60 ? "1 個鐘後" : `${m} 分鐘後`}
                          </Chip>
                        ))}
                        <Chip active={leaveMode === "custom"} onClick={() => setLeaveMode("custom")}>自己揀時間</Chip>
                      </div>
                      {leaveMode === "custom" && (
                        <input
                          type="time"
                          value={customTime}
                          onChange={(e) => setCustomTime(e.target.value)}
                          aria-label="時間"
                          className="h-12 px-4 rounded-2xl border border-border bg-card outline-none"
                        />
                      )}
                    </Section>

                    <Section title="備注（可以唔填）" hint="所有人都睇到；唔好寫電話或者個人資料">
                      <textarea
                        value={remark}
                        onChange={(e) => setRemark(e.target.value.slice(0, REMARK_MAX))}
                        rows={2}
                        placeholder={REMARK_PLACEHOLDER[s.id]}
                        aria-label="備注"
                        className="w-full px-4 py-3 rounded-2xl border border-border bg-background outline-none resize-none text-[15px]"
                      />
                      {remark.length > 0 && <div className="text-[11px] text-muted-foreground text-right">{remark.length}/{REMARK_MAX}</div>}
                    </Section>

                    {s.id !== "groupbuy" && (
                      <label className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-sm">接受去緊嘅人</div>
                          <div className="text-xs text-muted-foreground">
                            {acceptEnRoute
                              ? "未到商場嘅人都可以接，最多 30 分鐘到。配對咗之後佢喺路上，你無故取消會記一次臨時取消；佢遲到 5 分鐘你可以取消並重新放出"
                              : "而家只限已經喺商場嘅人接。開咗，未到商場、去緊嘅人都可以接"}
                          </div>
                        </div>
                        <Switch checked={acceptEnRoute} onCheckedChange={setAcceptEnRoute} />
                      </label>
                    )}

                    <label className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-sm">第一個有興趣嘅自動配對</div>
                        <div className="text-xs text-muted-foreground">想快就開；唔開就由你喺名單揀人{s.id !== "groupbuy" && acceptEnRoute ? "。只會自動揀已喺場嘅人" : ""}</div>
                      </div>
                      <Switch checked={autoAccept} onCheckedChange={setAutoAccept} />
                    </label>
                  </div>
                )}
              </div>

              <ScenarioTips scenario={s.id} role={authorRole(direction)} mall={mall} title="放之前要知" />
              <p className="text-[11px] text-muted-foreground">
                發佈即表示你會遵守商場同商戶嘅規則。平台只係顯示資訊同配對，唔參與交易。
              </p>
            </>
          )
        )}
      </div>

      {scenario && (
        <div className="fixed bottom-0 inset-x-0 z-30">
          <div className="max-w-lg mx-auto px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 bg-gradient-to-t from-background via-background to-transparent">
            {summary && (
              <div className="flex justify-center pb-2">
                <div data-testid="publish-summary" className="max-w-full truncate bg-card border border-border rounded-full px-3 py-1 text-xs font-semibold text-[#1a1a1a]/75 shadow-sm">
                  {summary}
                </div>
              </div>
            )}
            <button
              onClick={submit}
              disabled={!!missing || submitting}
              className="w-full h-14 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-black text-base shadow-lg disabled:opacity-50"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      )}

      <RegisterSheet
        open={regOpen}
        onClose={() => setRegOpen(false)}
        reason="登記咗就即刻幫你發佈"
        onDone={() => {
          setRegOpen(false);
          setTimeout(() => void submit(), 0);
        }}
      />
    </AppLayout>
  );
}
