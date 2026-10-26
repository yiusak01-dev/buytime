import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { AppLayout } from "@/components/AppLayout";
import { Chip, Section, DemoBadge } from "@/components/aah/ui";
import { RegisterSheet } from "@/components/aah/RegisterSheet";
import { aah, aahErrorText, getSettings, useAahState, isBanned, dailyDiningCount, DINING_POSTS_PER_DAY } from "@/lib/aah/store";
import { useAahMalls, demoAudience } from "@/lib/aah/malls";
import { useCurrentMall, fmtClock, useNow } from "@/lib/aah/geo";
import { SCENARIOS, SCENARIO_LIST, GROUPBUY_DEALS, PAY_METHODS, authorRole } from "@/lib/aah/scenarios";
import { ScenarioTips } from "@/components/aah/ScenarioTips";
import { quoteParkingReceipt, quoteParkingWant, quoteOffer, mallDiningExtra } from "@/lib/aah/pricing";
import type { FieldDef } from "@/lib/aah/scenarios";
import { readAmountFromImage } from "@/lib/aah/ocr";
import type { Direction, PayMethod, ScenarioId } from "@/lib/aah/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/post/new")({
  head: () => ({ meta: [{ title: "出 post · 啱啱好" }] }),
  component: NewPost,
});

const MIN = 60000;

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
  const [price, setPrice] = useState<string>("");
  const [free, setFree] = useState(false);
  const [pay, setPay] = useState<PayMethod[]>(user.defaultPayMethods);
  const [leaveMode, setLeaveMode] = useState<number | "custom">(30);
  const [customTime, setCustomTime] = useState("");
  const [autoAccept, setAutoAccept] = useState(false);
  const [needCount, setNeedCount] = useState(1);
  const [regOpen, setRegOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrNote, setOcrNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const s = scenario ? SCENARIOS[scenario] : null;
  const diningExtra = mallDiningExtra(mall);
  const fieldShown = (f: FieldDef) => (!f.onlyFor || f.onlyFor.includes(direction)) && (!f.onlyIfDiningRule || diningExtra != null);

  function pickScenario(id: ScenarioId) {
    setScenario(id);
    setDirection(SCENARIOS[id].directions[0]);
    setFields(id === "groupbuy" ? { deal: GROUPBUY_DEALS[1] } : {});
    setShop(id === "parking" ? "停車場" : "");
    setPrice("");
    setFree(false);
    setOcrNote("");
  }

  const leaveAt = useMemo(() => {
    if (leaveMode !== "custom") return now + leaveMode * MIN;
    const m = customTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    // 用香港時間計今日嗰個鐘數
    const hkNow = new Date(now + 8 * 3600 * 1000);
    const target = Date.UTC(hkNow.getUTCFullYear(), hkNow.getUTCMonth(), hkNow.getUTCDate(), Number(m[1]), Number(m[2])) - 8 * 3600 * 1000;
    return target > now ? target : null;
  }, [leaveMode, customTime, now]);

  // 建議價
  const suggestion = useMemo(() => {
    if (!s || !mall) return null;
    if (s.id === "parking" && direction === "have") {
      const amt = Number(fields.receiptAmount);
      if (!amt) return null;
      const dining = fields.receiptCategory === "食肆單";
      const q = quoteParkingReceipt(mall, amt, now, { dining });
      if (q.belowThreshold) return { text: `按今日（${q.dayLabel}）規則，要消費滿 $${q.minThreshold} 先換到泊車。`, max: null, hours: 0, warn: true };
      const hoursText = `可以換 ${q.hours} 個鐘${q.extraApplied ? `（食肆單額外 +${q.extraApplied}）` : ""}`;
      const copayText = q.discRate != null ? `，每個鐘 $${q.discRate}，共俾停車場 $${q.copay}` : "";
      const moreText = q.diningExtra && !dining && q.hours > 0 ? ` 如果係食肆單，可以多換 ${q.diningExtra} 個鐘。` : "";
      if (q.saving == null) return { text: `${hoursText}${copayText}（呢個商場未有時租資料）。${moreText}`, max: null, hours: q.hours };
      return {
        text: `按今日（${q.dayLabel}）收費計，${hoursText}${copayText}，比正價慳 $${q.saving}。${moreText}`,
        max: q.suggestMax,
        hours: q.hours,
      };
    }
    if (s.id === "parking" && direction === "want") {
      const h = Number(fields.hours);
      if (!h) return null;
      const q = quoteParkingWant(mall, h, now);
      if (q.fee == null) return null;
      const text =
        q.discRate != null && q.full != null
          ? `按今日（${q.dayLabel}）收費，泊 ${h} 個鐘正價 $${q.full}；用收據換（每個鐘 $${q.discRate}，共 $${q.copay}）慳 $${q.fee}。`
          : `按今日（${q.dayLabel}）收費，泊 ${h} 個鐘要 $${q.fee}。`;
      return { text, max: q.suggestMax, hours: h };
    }
    if (s.id === "offer" && direction === "have" && Number(fields.faceValue)) {
      return { text: `面值 $${fields.faceValue}。`, max: quoteOffer(Number(fields.faceValue)).suggestMax, hours: 0 };
    }
    return null;
  }, [s, mall, direction, fields, now]);

  const priceNum = free ? 0 : price === "" ? null : Number(price);

  const missing = useMemo(() => {
    if (!s) return "揀一個場景";
    if (s.shopLabel && !shop.trim()) return "填舖頭";
    for (const f of s.fields) {
      if (!fieldShown(f)) continue;
      if (f.required && !String(fields[f.key] ?? "").trim()) return `${f.type === "choice" ? "揀" : "填"}「${f.label}」`;
    }
    if (s.hasPrice && priceNum == null) return "填價錢（可以揀免費）";
    if (s.hasPrice && priceNum != null && priceNum > 0 && pay.length === 0) return "揀收款方式";
    if (!leaveAt) return "揀時間";
    return null;
  }, [s, shop, fields, direction, priceNum, pay, leaveAt, diningExtra]);

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
    if (!mall || (!current.verified && !getSettings().allowTestLocation)) {
      toast.error("要喺商場先可以出 post", { description: "GPS 搵唔到你喺任何商場範圍" });
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

    setSubmitting(true);
    try {
    const post = await aah.createPost({
      scenario,
      direction,
      mallId: mall.id,
      mallName: mall.name,
      shop: shop.trim() || "停車場",
      fields: f,
      price: s.hasPrice ? priceNum : null,
      payMethods: s.hasPrice && priceNum && priceNum > 0 ? pay : [],
      leaveAt,
      verifiedOnSite: current.verified,
      pushedCount: Math.round(demoAudience(mall.id) * (user.notifyCats.length / 4 || 1)),
      autoAccept,
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

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setOcrBusy(true);
    setOcrNote("");
    try {
      const amt = await readAmountFromImage(file);
      if (amt) {
        const key = scenario === "offer" ? "faceValue" : "receiptAmount";
        setFields((x) => ({ ...x, [key]: String(amt) }));
        setOcrNote(`讀到 $${amt}，唔啱可以自己改。`);
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

  return (
    <AppLayout hideNav>
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur px-4 pt-4 pb-3 flex items-center gap-3 border-b border-border/60">
        <button onClick={() => (scenario ? setScenario(null) : navigate({ to: "/" }))} aria-label="返回" className="w-9 h-9 grid place-items-center rounded-full hover:bg-accent">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="font-black text-lg leading-tight">出 post</div>
          <div className="text-[11px] text-muted-foreground">{mall ? `📍 ${mall.name}${current.test ? "（測試位置）" : ""}` : "要喺商場先可以出 post"}</div>
        </div>
      </header>

      <div className="px-4 pt-4 pb-32 space-y-6">
        {!scenario ? (
          <Section title="你想做咩？">
            <div className="grid grid-cols-2 gap-3">
              {SCENARIO_LIST.map((id) => {
                const d = SCENARIOS[id];
                return (
                  <button
                    key={id}
                    onClick={() => pickScenario(id)}
                    className="rounded-2xl p-4 text-left h-28 flex flex-col justify-between text-white active:scale-[0.98] transition-transform"
                    style={{ background: d.color }}
                  >
                    <span className="text-3xl">{d.emoji}</span>
                    <span>
                      <span className="block font-black text-lg">{d.label}</span>
                      <span className="block text-[11px] opacity-90">
                        {id === "parking" ? "收據轉俾人／搵收據" : id === "dining" ? "候位飛轉俾人" : id === "offer" ? "即時優惠轉俾人" : "搵人一齊夾優惠"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>
        ) : (
          s && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold px-3 py-1.5 rounded-full text-white" style={{ background: s.color }}>
                  {s.emoji} {s.label}
                </span>
                <button onClick={() => setScenario(null)} className="text-xs text-muted-foreground underline">換場景</button>
              </div>

              {s.directions.length > 1 ? (
                <Section title="你係？">
                  <div className="grid grid-cols-2 gap-2">
                    {s.directions.map((d) => (
                      <button
                        key={d}
                        onClick={() => {
                          setDirection(d);
                          setPrice("");
                        }}
                        className={cn("h-14 rounded-2xl border-2 font-bold", direction === d ? "border-[#1a1a1a] bg-[#1a1a1a] text-white" : "border-border bg-card")}
                      >
                        {d === "have" ? `我有${s.id === "parking" ? "收據" : ""}` : `我要${s.id === "parking" ? "泊車" : ""}`}
                      </button>
                    ))}
                  </div>
                </Section>
              ) : s.id === "groupbuy" ? (
                <Section title="仲要幾多個人一齊夾？" hint="買二送一就揀 2 個人；夠人先算配對成功">
                  <div className="flex gap-2">
                    {[1, 2, 3].map((n) => (
                      <Chip key={n} active={needCount === n} onClick={() => setNeedCount(n)}>{n} 個人</Chip>
                    ))}
                  </div>
                </Section>
              ) : null}

              {s.shopLabel && (
                <Section title={s.shopLabel}>
                  <input
                    value={shop}
                    onChange={(e) => setShop(e.target.value.slice(0, 30))}
                    placeholder="輸入舖頭名"
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
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={ocrBusy}
                    className="w-full h-14 rounded-2xl border-2 border-dashed border-border bg-card flex items-center justify-center gap-2 font-bold"
                  >
                    {ocrBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                    {ocrBusy ? "讀緊張相…" : s.id === "parking" ? "影收據，自動填金額" : "影優惠券，自動填面值"}
                  </button>
                  {ocrNote && <div className="text-xs text-muted-foreground mt-1.5">{ocrNote}</div>}
                </div>
              )}

              {s.id === "groupbuy" && (
                <Section title="咩優惠？">
                  <div className="flex flex-wrap gap-2">
                    {GROUPBUY_DEALS.map((d) => (
                      <Chip key={d} active={fields.deal === d} onClick={() => setFields({ ...fields, deal: d })}>{d}</Chip>
                    ))}
                  </div>
                </Section>
              )}

              {s.fields
                .filter((f) => fieldShown(f) && !(s.id === "groupbuy" && f.key === "deal"))
                .map((f) => (
                  <Section
                    key={f.key}
                    title={f.label}
                    hint={
                      f.key === "receiptType"
                        ? "有啲商場只收電子單或者只收紙單，講清楚免得對方白行一趟"
                        : f.key === "receiptCategory" && diningExtra
                          ? `呢個商場食肆單可以額外多換 ${diningExtra} 個鐘`
                          : undefined
                    }
                  >
                    {f.type === "choice" ? (
                      <div className="flex flex-wrap gap-2">
                        {(f.options ?? []).map((o) => (
                          <Chip key={o} active={fields[f.key] === o} onClick={() => setFields({ ...fields, [f.key]: o })}>{o}</Chip>
                        ))}
                      </div>
                    ) : (
                    <div className="flex items-center gap-2 h-12 px-4 rounded-2xl border border-border bg-card">
                      <input
                        inputMode={f.type === "number" ? "numeric" : "text"}
                        value={fields[f.key] ?? ""}
                        onChange={(e) => setFields({ ...fields, [f.key]: f.type === "number" ? e.target.value.replace(/[^\d]/g, "").slice(0, 6) : e.target.value.slice(0, 40) })}
                        placeholder={f.placeholder}
                        className="flex-1 bg-transparent outline-none"
                      />
                      {f.suffix && <span className="text-sm text-muted-foreground">{f.suffix}</span>}
                    </div>
                    )}
                  </Section>
                ))}

              {s.hasPrice && (
                <Section title={direction === "want" ? "你願意俾幾多？" : "價錢"} hint="見面交收時直接俾，唔經平台">
                  <div className="flex items-center gap-2">
                    <div className={cn("flex-1 min-w-0 flex items-center gap-2 h-12 px-4 rounded-2xl border bg-card", overSuggest ? "border-amber-400" : "border-border")}>
                      <span className="font-bold text-muted-foreground">$</span>
                      <input
                        inputMode="numeric"
                        value={free ? "" : price}
                        disabled={free}
                        onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                        placeholder={free ? "免費" : "自己填"}
                        className="flex-1 min-w-0 w-full bg-transparent outline-none text-lg font-bold"
                      />
                    </div>
                    <Chip active={free} onClick={() => setFree(!free)}>免費</Chip>
                  </div>
                  {suggestion && (
                    <div className={cn("text-xs rounded-xl px-3 py-2", suggestion.warn ? "bg-amber-50 text-amber-800" : "bg-[#E3F5EC] text-[#1d6b47]")}>
                      {suggestion.text}
                      {suggestion.max != null && <b> 建議唔好超過 ${suggestion.max}。</b>}
                      {mall?.source === "sample" && <span className="ml-1"><DemoBadge /></span>}
                    </div>
                  )}
                  {overSuggest && <div className="text-xs text-amber-700">高過建議價，可能較難有人接。</div>}
                </Section>
              )}

              {s.hasPrice && !free && (
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
                    className="h-12 px-4 rounded-2xl border border-border bg-card outline-none"
                  />
                )}
              </Section>

              <label className="flex items-center justify-between gap-3 bg-card rounded-2xl p-4">
                <div>
                  <div className="font-semibold text-sm">第一個有興趣嘅自動配對</div>
                  <div className="text-xs text-muted-foreground">想快就開；唔開就由你喺名單揀人</div>
                </div>
                <Switch checked={autoAccept} onCheckedChange={setAutoAccept} />
              </label>

              <ScenarioTips scenario={s.id} role={authorRole(direction)} mall={mall} title="出 post 前要知" />
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
            <button
              onClick={submit}
              disabled={!!missing || submitting}
              className="w-full h-14 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-black text-base shadow-lg disabled:opacity-50"
            >
              {submitting ? "發佈緊…" : missing ? `仲要${missing}` : "發佈"}
            </button>
          </div>
        </div>
      )}

      <RegisterSheet
        open={regOpen}
        onClose={() => setRegOpen(false)}
        reason="出 post 要先註冊，註冊完會自動幫你發佈。"
        onDone={() => {
          setRegOpen(false);
          setTimeout(() => void submit(), 0);
        }}
      />
    </AppLayout>
  );
}
