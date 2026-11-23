import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, Send, Pin, Minus, Plus, Clock, Flag } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { PushPrompt } from "@/components/aah/PushPrompt";
import { BottomSheet, Chip, DemoBadge, ScenarioTag } from "@/components/aah/ui";
import { RegisterSheet } from "@/components/aah/RegisterSheet";
import { LiveDot } from "@/components/aah/CatIcon";
import { rowTitle } from "@/components/aah/FeedRow";
import { postSaving, priceLabel } from "@/components/aah/PostCard";
import {
  aah,
  aahErrorText,
  getSettings,
  getRules,
  pinIsFree,
  testLocationAllowed,
  useAahLive,
  useAahMode,
  useAahState,
  isBanned,
  pinnedCountInMall,
  nextPinFreeAt,
  MAX_PINNED_PER_MALL,
  PIN_MINUTES,
  PIN_PROMPT_AFTER_MIN,
} from "@/lib/aah/store";
import { useAahMalls, nearbyMalls, demoAudience } from "@/lib/aah/malls";
import { Switch } from "@/components/ui/switch";
import { useDocVisible } from "@/lib/aah/visible";
import { useCurrentMall, useNow, fmtClock, fmtLeft, fmtAgo, useGeo, geoStore } from "@/lib/aah/geo";
import { distanceM } from "@/lib/aah/malls";
import {
  acceptsEnRoute,
  etaChoices,
  fmtKm,
  sortInterests,
  suggestedInterest,
  LATE_GRACE_MIN,
} from "@/lib/aah/enroute";
import type { InterestOpts } from "@/lib/aah/remote";
import { SCENARIOS, payLabel, authorRole, receiptCountNote, stackRule } from "@/lib/aah/scenarios";
import { ScenarioTips } from "@/components/aah/ScenarioTips";
import { ReportBlockSheet } from "@/components/aah/ReportBlockSheet";
import { ParkingHandover } from "@/components/aah/ParkingHandover";
import { postPriceCheck, CONTACT_RE, CONTACT_WARNING } from "@/lib/aah/rules";
import { buyerParkingSaving, quoteParkingReceipt } from "@/lib/aah/pricing";
import type { Post } from "@/lib/aah/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/post/$postId")({
  head: () => ({ meta: [{ title: "詳情 · 啱啱好" }] }),
  component: PostPage,
});

function PostPage() {
  const { postId } = Route.useParams();
  const { posts, user } = useAahState();
  const post = posts.find((p) => p.id === postId);
  // 開住 post：有人有興趣、對方覆訊息、揀咗你，都即刻見到
  useAahLive("post", postId, !post || post.status === "open");

  useEffect(() => {
    if (post) aah.viewPost(post.id);
  }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!post) {
    return (
      <AppLayout hideNav>
        <div className="p-8 text-center space-y-3">
          <div className="text-4xl">🤷</div>
          <div className="font-bold">搵唔到呢個 post</div>
          <p className="text-sm text-muted-foreground">可能已經過期或者被取消。</p>
          <Link
            to="/"
            className="inline-block h-11 px-5 leading-[44px] rounded-2xl bg-[#1a1a1a] text-white font-bold"
          >
            返去首頁
          </Link>
        </div>
      </AppLayout>
    );
  }
  return post.authorId === user.id ? <MyPostView post={post} /> : <PostDetailView post={post} />;
}

function TopBar({ title, onReport }: { title: string; onReport?: () => void }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur px-4 pt-4 pb-3 flex items-center gap-3 border-b border-border/60">
      <button
        onClick={() => (window.history.length > 1 ? window.history.back() : navigate({ to: "/" }))}
        aria-label="返回"
        className="w-9 h-9 grid place-items-center rounded-full hover:bg-accent"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div className="font-black text-lg flex-1">{title}</div>
      {onReport && (
        <button
          onClick={onReport}
          aria-label="舉報或封鎖"
          className="w-9 h-9 grid place-items-center rounded-full hover:bg-accent text-muted-foreground"
        >
          <Flag className="w-4 h-4" />
        </button>
      )}
    </header>
  );
}

/** 標題以外嘅補充資料（唔重複標題） */
function detailLine(p: Post): string {
  const f = p.fields;
  switch (p.scenario) {
    case "parking":
      return p.direction === "have"
        ? [
            f.receiptAmount ? `單據 $${f.receiptAmount}` : "",
            f.fragment ? "碎單（要加埋其他單）" : "",
            f.receiptShop ? `${f.receiptShop}單` : "",
            f.receiptDate ? "今日單據（影相讀到）" : "",
            f.receiptCount && f.receiptCount !== "1 張" ? `${f.receiptCount}單` : "",
            f.receiptType ? String(f.receiptType) : "",
          ]
            .filter(Boolean)
            .join("・")
        : "";
    case "dining":
      return f.calling ? `而家叫到 ${f.calling}` : "";
    case "offer":
      return "";
    case "groupbuy":
      return [f.note ? String(f.note) : "", p.needCount ? `仲要 ${p.needCount} 人` : ""]
        .filter(Boolean)
        .join("・");
  }
}

/** 唔支持炒飛：泊車單價錢高過參考價（商場時租 × 比例 × 鐘數）就講；冇時租資料就唔顯示 */
function FairPriceNote({ post, who }: { post: Post; who: "buyer" | "seller" }) {
  const { malls } = useAahMalls();
  const pc = postPriceCheck(
    post,
    getRules(),
    malls.find((m) => m.id === post.mallId),
  );
  if (!pc || pc.level === "ok") return null;
  return (
    <div
      data-testid="fair-price-note"
      className="text-sm rounded-2xl px-4 py-3 bg-amber-50 text-amber-900 border border-amber-200 leading-relaxed"
    >
      呢個價高過參考價 <b>${pc.ref}</b>（{pc.basis}）。
      {who === "buyer"
        ? "啱啱好唔支持炒飛。覺得佢炒賣，或者見面先話要加錢，可以撳右上角旗仔舉報。"
        : "啱啱好唔支持炒飛，價錢合理啲會快啲有人要。"}
    </div>
  );
}

function PostSummary({ post, now }: { post: Post; now: number }) {
  const { malls } = useAahMalls();
  const mall = malls.find((m) => m.id === post.mallId);
  const s = SCENARIOS[post.scenario];
  const saving = postSaving(post, mall, now);
  return (
    <div
      className="bg-card rounded-2xl shadow-[var(--shadow-card)] overflow-hidden border-l-[6px]"
      style={{ borderLeftColor: s.color }}
    >
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <ScenarioTag scenario={post.scenario} direction={post.direction} />
          <div className="text-xl font-black">{priceLabel(post)}</div>
        </div>
        <div className="font-black text-lg leading-snug">{rowTitle(post)}</div>
        <div className="text-sm text-muted-foreground">
          📍 {post.mallName}
          {post.scenario === "parking" ? " 停車場" : ""}・{post.authorName}
        </div>
        {detailLine(post) && <div className="text-[15px]">{detailLine(post)}</div>}
        {post.fields.remark && (
          <div className="text-sm bg-muted/60 rounded-xl px-3 py-2 whitespace-pre-wrap break-words">
            <span className="font-semibold">備注：</span>
            {String(post.fields.remark)}
          </div>
        )}
        {saving != null && saving > 0 && (
          <div className="text-2xl font-black text-[#2E9E6A]">慳 ${saving}</div>
        )}
        {post.payMethods.length > 0 && post.price != null && post.price > 0 && (
          <div className="text-sm text-muted-foreground">點俾錢：{payLabel(post.payMethods)}</div>
        )}
        <div className="flex items-center gap-3 text-xs flex-wrap pt-1">
          <span className="text-muted-foreground">
            ⏰ {fmtClock(post.leaveAt)} 前{post.scenario === "dining" ? "叫號" : "喺度"}（
            {fmtLeft(post.leaveAt - now)}）
          </span>
          {post.verifiedOnSite && (
            <span className="text-[#2E9E6A] font-semibold">📍 佢已確認喺商場</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap pt-1" data-testid="live-chips">
          <span className="h-7 px-2.5 rounded-full bg-background text-xs font-bold inline-flex items-center gap-1.5">
            <LiveDot />
            {fmtAgo(post.createdAt, now)}放上嚟
          </span>
          {post.viewCount > 0 && (
            <span className="h-7 px-2.5 rounded-full bg-background text-xs font-bold inline-flex items-center">
              {post.viewCount} 人睇過
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= 其他人嘅 post：詳情 + 有興趣 ================= */

function PostDetailView({ post }: { post: Post }) {
  const navigate = useNavigate();
  const { user } = useAahState();
  const { malls } = useAahMalls();
  const current = useCurrentMall(malls);
  const now = useNow(5000);
  const s = SCENARIOS[post.scenario];
  const mall = malls.find((m) => m.id === post.mallId);
  const [regOpen, setRegOpen] = useState(false);
  const [pending, setPending] = useState<{
    text: string;
    offer?: number;
    opts?: InterestOpts;
  } | null>(null);
  const [offer, setOffer] = useState(() =>
    post.price && post.price > 10 ? post.price - 5 : (post.price ?? 0),
  );
  const [entry, setEntry] = useState("");
  const [pickTime, setPickTime] = useState(false);
  const [draft, setDraft] = useState("");
  const geo = useGeo();
  const [eta, setEta] = useState<number | null>(null);

  const mine = post.interests.find((i) => i.userId === user.id);
  const [reportOpen, setReportOpen] = useState(false);
  const lastSent = useRef<{ text: string; at: number } | null>(null);

  // 自己傳咗訊息或者對方覆：捲落對話度（唔好俾底部嗰排掣遮住）
  const chatEnd = useRef<HTMLDivElement>(null);
  const seenMsgs = useRef<number | null>(null);
  useEffect(() => {
    const n = mine?.messages.length ?? 0;
    if (seenMsgs.current != null && n > seenMsgs.current)
      chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    seenMsgs.current = n;
  }, [mine?.messages.length]);

  // 已讀：開住畫面，對方講咗嘢就當睇咗
  const visible = useDocVisible();
  const markedRef = useRef<string | null>(null);
  const lastFromAuthor = mine?.messages.filter((x) => x.from !== user.id).at(-1);
  useEffect(() => {
    if (!visible || !mine?.id || mine.status !== "pending" || !lastFromAuthor) return;
    if (lastFromAuthor.at <= (mine.buyerReadAt ?? 0)) return;
    const k = `${mine.id}:${lastFromAuthor.at}`;
    if (markedRef.current === k) return;
    markedRef.current = k;
    aah.markRead("interest", mine.id);
  }, [visible, mine?.id, mine?.status, lastFromAuthor?.at, mine?.buyerReadAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // 排第幾：每 10 秒問一次（睇唔到其他人嘅興趣，要問伺服器）
  const [queue, setQueue] = useState<{ ahead: number; total: number } | null>(null);
  const pendingMine = mine?.status === "pending";
  useEffect(() => {
    if (!pendingMine || !visible) return;
    let alive = true;
    const load = () => void aah.queuePosition(post.id).then((q) => alive && setQueue(q));
    load();
    const t = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [post.id, pendingMine, visible, mine?.messages.length]);

  // 對方揀咗你 → 去配對畫面
  useEffect(() => {
    if (mine?.status === "accepted" && post.matchId) {
      toast.success("配對成功！");
      navigate({ to: "/match/$matchId", params: { matchId: post.matchId } });
    }
  }, [mine?.status, post.matchId, navigate]);

  // 要喺同一個商場；置頂推到嚟嘅附近商場 post 都接得（泊車除外）
  const inRange = useMemo(() => {
    // 正式上線（唔准測試位置）：一定要 GPS 確認喺商場先接得
    if (!current.mall || (current.test && !testLocationAllowed())) return false;
    if (current.mall.id === post.mallId) return true;
    if (!s.pushNearby || !mall) return false;
    return nearbyMalls(malls, mall).some((m) => m.id === current.mall!.id);
  }, [current.mall, post.mallId, s.pushNearby, mall, malls]);

  const banned = isBanned(user);
  const open = post.status === "open" && post.leaveAt > now;

  // 我去緊
  const enRouteOk = acceptsEnRoute(post);
  const choices = etaChoices(post.leaveAt, now);
  const myDist =
    geo.status === "ok" && geo.lat != null && geo.lng != null && mall
      ? distanceM(geo.lat, geo.lng, mall.lat, mall.lng)
      : null;
  function goEnRoute(m: number) {
    const g = geoStore.get();
    if (g.status !== "ok" || g.lat == null || g.lng == null) {
      void geoStore.start();
      toast("要開定位，計你距離商場幾遠", { description: "開咗再撳一次" });
      return;
    }
    send(`我去緊，大約 ${m} 分鐘到`, undefined, { etaMin: m, coords: { lat: g.lat, lng: g.lng } });
  }

  function send(text: string, off?: number, opts?: InterestOpts) {
    // 防連撳：同一句 5 秒內唔重複發送
    const t0 = Date.now();
    if (lastSent.current && lastSent.current.text === text && t0 - lastSent.current.at < 5000)
      return;
    lastSent.current = { text, at: t0 };
    const me = aah.get().user;
    if (isBanned(me)) return;
    // 喺場撳：話俾伺服器知（之前講咗去緊嘅，會轉做已喺場）
    const o = opts ?? (inRange && current.verified ? { onSite: true } : undefined);
    if (!me.registered) {
      setPending({ text, offer: off, opts: o });
      setRegOpen(true);
      return;
    }
    void doExpress(text, off, o);
  }

  async function doExpress(text: string, off?: number, opts?: InterestOpts) {
    try {
      const matchId = await aah.expressInterest(post.id, text, off, opts);
      if (matchId) {
        toast.success("配對成功！");
        navigate({ to: "/match/$matchId", params: { matchId } });
      }
    } catch (e) {
      toast.error(aahErrorText(e));
    }
  }

  // 張單換到幾多個鐘：出 post 時有計就用；冇就按今日商場規則同單據金額計（唔夠門檻 = 0）
  const receiptQuote = useMemo(() => {
    if (post.scenario !== "parking" || post.direction !== "have" || !mall) return null;
    const amt = Number(post.fields.receiptAmount ?? 0);
    return amt > 0 ? quoteParkingReceipt(mall, amt, now) : null;
  }, [post, mall, now]);
  const offeredHours = Number(post.fields.hours ?? 0) || receiptQuote?.hours || 0;
  const cantRedeem =
    (!!post.fields.fragment || !!receiptQuote?.belowThreshold) && !Number(post.fields.hours ?? 0);
  const stack = stackRule(mall?.stacking);
  const minSpend = Number(post.fields.minSpend ?? 0) || receiptQuote?.minThreshold || 0;

  // 入場時間由用家自己揀（唔估；開 app 嗰下唔等於入場時間）
  const parkingCalc = useMemo(() => {
    if (post.scenario !== "parking" || post.direction !== "have" || !mall || !entry || cantRedeem)
      return null;
    const m = entry.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hkNow = new Date(now + 8 * 3600 * 1000);
    let ts =
      Date.UTC(
        hkNow.getUTCFullYear(),
        hkNow.getUTCMonth(),
        hkNow.getUTCDate(),
        Number(m[1]),
        Number(m[2]),
      ) -
      8 * 3600 * 1000;
    if (ts > now) ts -= 24 * 3600 * 1000;
    return buyerParkingSaving(mall, offeredHours, ts, now);
  }, [post, mall, entry, now, offeredHours, cantRedeem]);
  const hoursAgo = (h: number) => {
    const d = new Date(now - h * 3600000 + 8 * 3600 * 1000);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  };

  function sendDraft() {
    const t = draft.trim();
    if (!t) return;
    if (CONTACT_RE.test(t)) toast.warning(CONTACT_WARNING, { duration: 6000 });
    send(t);
    setDraft("");
  }

  const joinWord = post.scenario === "groupbuy" ? "我夾" : "有興趣";

  return (
    <AppLayout hideNav>
      <TopBar title="詳情" onReport={() => setReportOpen(true)} />
      <ReportBlockSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targets={[{ userId: post.authorId, name: post.authorName }]}
        postId={post.id}
        onBlocked={() => navigate({ to: "/", replace: true })}
      />
      <div className="px-4 pt-4 pb-40 space-y-4">
        <PostSummary post={post} now={now} />
        <FairPriceNote post={post} who="buyer" />

        {/* 第一次用（例如朋友傳 link 嚟）：一句講明發生咩事 */}
        {!user.registered && post.authorId !== user.id && (
          <div className="text-sm rounded-2xl px-4 py-3 bg-[#FFF7D6] text-[#1a1a1a]">
            {post.direction === "want"
              ? `${post.authorName} 想要呢樣嘢。你有就撳「有興趣」，喺商場見面交收，你收返錢。`
              : post.scenario === "parking"
                ? `${post.authorName} 用唔着呢張單據，你啱用就撳「有興趣」，喺商場一齊去換泊車，換到先俾錢。`
                : `${post.authorName} 用唔着，你啱用就撳「${post.scenario === "groupbuy" ? "我夾" : "有興趣"}」，喺商場見面，一手交錢一手交貨。`}
          </div>
        )}

        {post.scenario === "parking" &&
          post.direction === "have" &&
          receiptCountNote(post.fields.receiptCount, "taker", mall?.stacking) && (
            <div className="text-xs rounded-xl px-3 py-2.5 bg-amber-50 text-amber-900 border border-amber-200">
              ⚠️ {receiptCountNote(post.fields.receiptCount, "taker", mall?.stacking)}
            </div>
          )}

        {cantRedeem && minSpend > 0 && (
          <div
            data-testid="cant-redeem"
            className="text-sm rounded-2xl px-4 py-3 bg-amber-50 text-amber-900 border border-amber-200 space-y-1"
          >
            <div>
              <b>碎單：呢張單自己一張換唔到泊車。</b>
              {`${post.mallName}今日要消費滿 $${minSpend} 先換到，呢張單 $${String(post.fields.receiptAmount)}，差 $${Math.max(0, Math.ceil(minSpend - Number(post.fields.receiptAmount ?? 0)))}。`}
            </div>
            <div>
              {stack.max === 1
                ? "呢個商場資料顯示唔准幾張單加埋計，可能換唔到。"
                : stack.known
                  ? `商場准最多 ${stack.max} 張唔同舖嘅單加埋計${stack.minEach ? `（每張最少 $${stack.minEach}）` : ""}：你有今日另一間舖嘅單加埋就換到。`
                  : "未知商場准唔准幾張單加埋計，接之前去登記處問清楚。"}
            </div>
          </div>
        )}
        {parkingCalc === null &&
          !cantRedeem &&
          post.scenario === "parking" &&
          post.direction === "have" && (
            <div className="bg-card rounded-2xl p-4 space-y-2">
              <div className="text-sm font-bold">你幾點入停車場？揀咗就計到你慳幾多</div>
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 3].map((h) => (
                  <Chip key={h} onClick={() => setEntry(hoursAgo(h))}>
                    大約 {h} 個鐘前
                  </Chip>
                ))}
                <Chip active={pickTime} onClick={() => setPickTime(true)}>
                  自己揀時間
                </Chip>
              </div>
              {pickTime && (
                <input
                  type="time"
                  aria-label="入場時間"
                  onChange={(e) => setEntry(e.target.value)}
                  className="h-11 px-3 rounded-xl border border-border bg-background outline-none"
                />
              )}
            </div>
          )}
        {parkingCalc && (
          <div className="bg-[#E3F5EC] text-[#1d6b47] rounded-2xl p-4 text-sm space-y-1">
            <div>
              你 {entry} 入場，泊咗 {parkingCalc.parked} 個鐘，按今日（{parkingCalc.dayLabel}
              ）收費要俾 ${parkingCalc.fee}。
            </div>
            <div className="font-black text-base">
              用呢張單據慳 ${parkingCalc.saving}
              {post.price
                ? `，扣埋 $${post.price} 淨慳 $${Math.max(0, parkingCalc.saving - post.price)}`
                : ""}
            </div>
            {parkingCalc.payAfter > 0 && (
              <div className="text-xs">用咗單據之後，停車場仲要俾 ${parkingCalc.payAfter}。</div>
            )}
            <button
              onClick={() => {
                setEntry("");
                setPickTime(false);
              }}
              className="text-xs underline"
            >
              改入場時間
            </button>
          </div>
        )}

        {post.scenario === "parking" && <ParkingHandover mall={mall} />}
        <ScenarioTips
          scenario={post.scenario}
          role={
            post.direction === "join"
              ? "taker"
              : authorRole(post.direction) === "giver"
                ? "taker"
                : "giver"
          }
          mall={mall}
          title="接之前要知"
        />
        <div className="text-xs bg-card rounded-xl px-3 py-2.5 text-muted-foreground">
          💡 {s.handoverHint}。{post.price ? "見面交收時先俾錢，唔好預先轉數。" : ""}
        </div>

        {/* 開通知提示放喺對話上面：捲落去睇對話時一齊見到 */}
        {mine?.status === "pending" && (
          <PushPrompt
            reason="對方一覆你就會通知你，閂咗 app 都收到。"
            onShown={() => chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" })}
          />
        )}

        {/* 對話（配對前） */}
        {mine && (
          <div className="bg-card rounded-2xl p-4 space-y-2">
            <div className="text-xs font-bold text-muted-foreground">
              同 {post.authorName} 嘅對話
            </div>
            {mine.messages.map((m, i) => (
              <div
                key={i}
                className={cn("flex items-end gap-1.5", m.from === user.id ? "justify-end" : "justify-start")}
              >
                {m.from === user.id && (mine.authorReadAt ?? 0) >= m.at && (
                  <span className="text-[10px] text-muted-foreground shrink-0 pb-0.5" data-testid="read-mark">
                    已讀
                  </span>
                )}
                <div
                  className={cn(
                    "px-3 py-2 rounded-2xl text-sm max-w-[80%]",
                    m.from === user.id ? "bg-[#1a1a1a] text-white" : "bg-accent",
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {mine.status === "pending" &&
              (() => {
                const last = mine.messages.at(-1);
                const seen = !!last && last.from === user.id && (mine.authorReadAt ?? 0) >= last.at;
                return (
                  <>
                    <div className="text-xs text-muted-foreground text-center pt-1" data-testid="queue">
                      {seen ? "對方睇咗，等緊佢覆…" : "等緊對方覆…"}
                      {queue && queue.total > 1 && (
                        <span className="block mt-0.5 font-semibold text-foreground">
                          {queue.ahead === 0
                            ? `你排第一（一共 ${queue.total} 個人有興趣）`
                            : `前面仲有 ${queue.ahead} 個人（一共 ${queue.total} 個），放單嘅人會揀`}
                        </span>
                      )}
                    </div>
                  </>
                );
              })()}
            <div ref={chatEnd} className="scroll-mb-44" />
          </div>
        )}
      </div>

      {/* 底部動作 */}
      <div className="fixed bottom-0 inset-x-0 z-30">
        <div className="max-w-lg mx-auto px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-background via-background to-transparent space-y-2">
          {!open ? (
            <div className="text-center text-sm font-semibold bg-card rounded-2xl py-4">
              {post.status === "matched" ? "已經俾咗人" : "呢個 post 已經結束"}
            </div>
          ) : banned ? (
            <div className="text-center text-sm bg-card rounded-2xl p-4">
              你嘅帳戶停用緊，暫時唔可以接 post。
              <Link to="/me" className="underline font-semibold">
                申訴
              </Link>
            </div>
          ) : mine?.status === "declined" ? (
            <div className="text-center text-sm bg-card rounded-2xl p-4">
              唔好意思，對方已經俾咗人
            </div>
          ) : mine?.status === "pending" ? (
            <>
              {!inRange && mine.enRoute && mine.etaAt && (
                <div className="text-xs text-center text-muted-foreground">
                  你話咗 {fmtClock(mine.etaAt)} 前到 {post.mallName}；去到會自動話對方知。
                </div>
              )}
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => send("你仲喺唔喺附近？")}
                  className="shrink-0 h-9 px-3 rounded-full border border-border bg-card text-sm font-semibold"
                >
                  你仲喺唔喺附近？
                </button>
                {post.price != null && post.price > 0 && (
                  <button
                    onClick={() => send(`$${offer} 得唔得？`, offer)}
                    className="shrink-0 h-9 px-3 rounded-full border border-border bg-card text-sm font-semibold"
                  >
                    ${offer} 得唔得？
                  </button>
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendDraft();
                }}
                className="flex gap-2"
              >
                <input
                  data-testid="interest-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={80}
                  placeholder={`同 ${post.authorName} 講…（喺 app 傾就夠，唔使留電話）`}
                  className="flex-1 min-w-0 h-12 px-4 rounded-2xl border border-border bg-card outline-none text-sm"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="傳送"
                  className="h-12 px-4 rounded-2xl bg-[#1a1a1a] text-white font-bold disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : !inRange && mine?.enRoute && mine.etaAt ? (
            <div className="bg-card rounded-2xl p-4 text-center space-y-1 shadow-lg">
              <div className="font-bold">
                你話咗 {fmtClock(mine.etaAt)} 前到 {post.mallName}
              </div>
              <div className="text-xs text-muted-foreground">
                去到商場會自動話對方知你到咗。過咗 {fmtClock(mine.etaAt + LATE_GRACE_MIN * 60000)}{" "}
                都未到，對方可以取消，會記你一次臨時取消。
              </div>
            </div>
          ) : !inRange && enRouteOk && !mine ? (
            <div className="bg-card rounded-2xl p-4 space-y-3 shadow-lg">
              <div>
                <div className="font-bold">未到 {post.mallName}？話對方知你去緊</div>
                <div className="text-xs text-muted-foreground">
                  {myDist != null ? `你而家距離約 ${fmtKm(myDist)}。` : ""}
                  對方會見到你幾點到，由佢揀接唔接。
                </div>
              </div>
              {choices.length === 0 ? (
                <div className="text-sm text-amber-800">
                  趕唔切喇：呢個 post {fmtClock(post.leaveAt)} 就完，要早 5 分鐘到。
                </div>
              ) : (
                <>
                  <div className="flex gap-2 flex-wrap">
                    {choices.map((m) => (
                      <Chip key={m} active={eta === m} onClick={() => setEta(m)}>
                        {m} 分鐘到
                      </Chip>
                    ))}
                  </div>
                  <div className="text-[11px] text-amber-800">
                    配對咗之後中途唔嚟，或者過咗講好時間 5 分鐘都未到，會記一次臨時取消（30
                    日內兩次停用一個月）。出 post 嘅人喺你去緊時無故取消，佢都會被記。
                  </div>
                  <button
                    disabled={eta == null}
                    onClick={() => eta != null && goEnRoute(eta)}
                    className="w-full h-12 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-black disabled:opacity-50"
                  >
                    {eta != null ? `我去緊・${fmtClock(now + eta * 60000)} 前到` : "揀幾耐到"}
                  </button>
                </>
              )}
            </div>
          ) : !inRange ? (
            <div className="text-center text-sm bg-card rounded-2xl p-4 space-y-3 shadow-lg">
              <div>
                去到 {post.mallName}
                {s.pushNearby ? " 或者附近商場" : ""} 就撳得「{joinWord}」
                {current.test && !testLocationAllowed()
                  ? "（GPS 確認咗你喺度就得）"
                  : !enRouteOk && post.scenario !== "groupbuy"
                    ? "（對方揀咗只限喺場嘅人）"
                    : ""}
              </div>
              {geo.status !== "ok" && (
                <button
                  onClick={() => {
                    if (!user.onboarded) aah.updateUser({ onboarded: true });
                    void geoStore.start();
                  }}
                  className="w-full h-12 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-black"
                >
                  我已經喺度：用定位確認
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => send("你仲喺唔喺附近？")}
                  className="shrink-0 h-10 px-3 rounded-full border border-border bg-card text-sm font-semibold"
                >
                  你仲喺唔喺附近？
                </button>
                {post.price != null && post.price > 0 && (
                  <div className="shrink-0 flex items-center gap-1 h-10 pl-1 pr-1 rounded-full border border-border bg-card">
                    <button
                      aria-label="減"
                      onClick={() => setOffer((o) => Math.max(0, o - 5))}
                      className="w-8 h-8 grid place-items-center rounded-full hover:bg-accent"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => send(`$${offer} 得唔得？`, offer)}
                      className="text-sm font-semibold px-1"
                    >
                      ${offer} 得唔得？
                    </button>
                    <button
                      aria-label="加"
                      onClick={() => setOffer((o) => o + 5)}
                      className="w-8 h-8 grid place-items-center rounded-full hover:bg-accent"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => send(joinWord)}
                disabled={!!mine}
                className="w-full h-14 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-black text-base shadow-lg disabled:opacity-60"
              >
                {mine ? "已經話咗有興趣" : joinWord}
              </button>
            </>
          )}
        </div>
      </div>

      <RegisterSheet
        open={regOpen}
        onClose={() => setRegOpen(false)}
        reason={`登記咗先撳得「${joinWord}」`}
        onDone={() => {
          setRegOpen(false);
          if (pending) void doExpress(pending.text, pending.offer, pending.opts);
          setPending(null);
        }}
      />
    </AppLayout>
  );
}

/* ================= 自己嘅 post：等待畫面 ================= */

function MyPostView({ post }: { post: Post }) {
  const navigate = useNavigate();
  const { posts, user } = useAahState();
  const { malls } = useAahMalls();
  const now = useNow(5000);
  const [pinOpen, setPinOpen] = useState(false);
  const s = SCENARIOS[post.scenario];
  const mall = malls.find((m) => m.id === post.mallId);
  const pinned = (post.pinnedUntil ?? 0) > now;
  const pending = sortInterests(post.interests.filter((i) => i.status === "pending"));
  const [reportTarget, setReportTarget] = useState<{ userId: string; name: string } | null>(null);
  const suggested = pending.length > 1 ? suggestedInterest(pending) : undefined;
  const age = now - post.createdAt;
  const pinEnabled = getRules().pinEnabled;
  const showPinPrompt =
    pinEnabled &&
    post.status === "open" &&
    !pinned &&
    post.interests.length === 0 &&
    age >= PIN_PROMPT_AFTER_MIN * 60000;

  // 已讀：開住自己個 post，有興趣嘅人講嘢就當睇咗
  const visible = useDocVisible();
  const markedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!visible || post.status !== "open") return;
    for (const it of pending) {
      const last = it.messages.at(-1);
      if (!it.id || !last || last.from === user.id || last.at <= (it.authorReadAt ?? 0)) continue;
      const k = `${it.id}:${last.at}`;
      if (markedRef.current.has(k)) continue;
      markedRef.current.add(k);
      aah.markRead("interest", it.id);
    }
  }, [pending, visible, post.status, user.id]);

  useEffect(() => {
    if (post.status === "matched" && post.matchId)
      navigate({ to: "/match/$matchId", params: { matchId: post.matchId } });
  }, [post.status, post.matchId, navigate]);

  const joined =
    post.scenario === "groupbuy" && post.matchId
      ? post.interests.filter((i) => i.status === "accepted").length
      : 0;
  const mode = useAahMode();

  async function act(p: Promise<unknown>, ok?: string) {
    try {
      await p;
      if (ok) toast(ok);
    } catch (e) {
      toast.error(aahErrorText(e));
    }
  }

  async function accept(userId: string, price?: number) {
    try {
      const matchId = await aah.acceptInterest(post.id, userId, price);
      if (matchId && post.scenario !== "groupbuy")
        navigate({ to: "/match/$matchId", params: { matchId } });
    } catch (e) {
      toast.error(aahErrorText(e));
    }
  }

  return (
    <AppLayout hideNav>
      <TopBar title="你嘅 post" />
      <ReportBlockSheet
        open={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targets={reportTarget ? [reportTarget] : []}
        postId={post.id}
      />
      <div className="px-4 pt-4 pb-10 space-y-4">
        {/* 狀態 */}
        {post.status === "open" ? (
          <div className="bg-[#1a1a1a] text-white rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-black text-lg">等緊有人接</div>
              <div className="text-xs flex items-center gap-1 opacity-80">
                <Clock className="w-3.5 h-3.5" />
                {fmtLeft(post.leaveAt - now)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-1 opacity-70 text-xs">
                  <Send className="w-3.5 h-3.5" />
                  {mode === "remote" ? "附近用戶" : "已推送"}
                </div>
                <div className="text-xl font-black">{post.pushedCount} 人</div>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-1 opacity-70 text-xs">
                  <Eye className="w-3.5 h-3.5" />
                  睇過
                </div>
                <div className="text-xl font-black">{post.viewCount} 人</div>
              </div>
            </div>
            {mode === "remote" ? (
              <div className="text-[11px] opacity-70">
                而家喺 {post.mallName}、有訂閱呢類嘅用戶。佢哋開 app 就會見到
                {pinEnabled ? "；置頂可以即刻推送通知俾佢哋" : ""}。
              </div>
            ) : (
              <div className="text-[11px] opacity-70 flex items-center gap-1.5">
                <DemoBadge /> 示範數字；正式版顯示真實推送人數。
              </div>
            )}
            {pinned && (
              <div className="text-xs bg-[#F5C518] text-[#1a1a1a] rounded-lg px-2 py-1 font-bold inline-block">
                置頂中・仲有 {Math.max(1, Math.round(((post.pinnedUntil ?? 0) - now) / 60000))} 分鐘
              </div>
            )}
            {post.scenario === "groupbuy" && (
              <div className="text-sm">
                已經有 {joined} 人加入，仲要 {Math.max(0, (post.needCount ?? 1) - joined)} 人
              </div>
            )}
            {post.scenario === "groupbuy" && post.matchId && (
              <Link
                to="/match/$matchId"
                params={{ matchId: post.matchId }}
                className="block text-center h-10 leading-[40px] rounded-xl bg-[#F5C518] text-[#1a1a1a] font-bold"
              >
                同已加入嘅人傾
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-2xl p-4 space-y-3">
            <div className="font-black text-lg">
              {post.status === "expired"
                ? "已經過咗預計時間"
                : post.status === "cancelled"
                  ? "已經取消"
                  : "已經配對"}
            </div>
            {post.status === "expired" && (
              <div className="flex gap-2">
                <button
                  onClick={() => act(aah.extendPost(post.id, 15))}
                  className="flex-1 h-11 rounded-2xl bg-[#1a1a1a] text-white font-bold"
                >
                  延長 15 分鐘
                </button>
                <button
                  onClick={() => act(aah.extendPost(post.id, 30))}
                  className="flex-1 h-11 rounded-2xl border border-border font-bold"
                >
                  延長 30 分鐘
                </button>
              </div>
            )}
            {post.matchId && (
              <Link
                to="/match/$matchId"
                params={{ matchId: post.matchId }}
                className="block text-center h-11 leading-[44px] rounded-2xl bg-[#F5C518] font-bold"
              >
                去配對畫面
              </Link>
            )}
          </div>
        )}

        {showPinPrompt && (
          <div className="bg-[#FFF6D6] border border-[#F5C518] rounded-2xl p-4 space-y-2">
            <div className="font-bold">15 分鐘都未有人理</div>
            <div className="text-sm">
              置頂 15 分鐘，同時推送俾而家喺{s.pushNearby ? "呢度同附近商場" : ` ${post.mallName} `}
              嘅人？
            </div>
            <button
              onClick={() => setPinOpen(true)}
              className="h-11 px-4 rounded-2xl bg-[#1a1a1a] text-white font-bold"
            >
              {pinIsFree(mode) ? "免費置頂 15 分鐘" : "置頂 15 分鐘"}
            </button>
          </div>
        )}

        <PostSummary post={post} now={now} />
        <FairPriceNote post={post} who="seller" />
        {post.scenario === "parking" && <ParkingHandover mall={mall} compact />}

        {/* 有興趣名單 */}
        {post.status === "open" && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-bold">有興趣嘅人（{pending.length}）</div>
            </div>
            {/* 唔得閒望住部機：開咗就自動俾第一個喺場、照原價嘅人 */}
            <label className="flex items-center justify-between gap-3 bg-card rounded-2xl px-4 py-3" data-testid="auto-accept">
              <div>
                <div className="font-semibold text-sm">自動配對</div>
                <div className="text-xs text-muted-foreground">
                  {post.autoAccept
                    ? `開咗：第一個喺場、照原價${post.price ? `（$${post.price}）` : ""}嘅人會即刻配對，唔使你揀`
                    : "唔得閒望住部機？開咗就自動俾第一個喺場、照原價嘅人"}
                </div>
              </div>
              <Switch
                checked={!!post.autoAccept}
                onCheckedChange={(on) =>
                  void act(aah.setAutoAccept(post.id, on), on ? "開咗自動配對" : "閂咗自動配對")
                }
              />
            </label>
            {pending.length > 1 && (
              <div className="text-[11px] text-muted-foreground">
                已喺場嘅排前；去緊嘅按邊個快到排。⭐
                係系統建議（穩陣交收為主，唔睇價錢），最後由你揀。
              </div>
            )}
            {pending.length === 0 ? (
              <div className="bg-card rounded-2xl p-5 text-center text-sm text-muted-foreground">
                未有人，有人撳「有興趣」會即刻通知你。
                {acceptsEnRoute(post) ? "未到商場、去緊嘅人都可以撳。" : ""}
              </div>
            ) : (
              pending.map((it) => (
                <div
                  key={it.userId}
                  className={cn(
                    "bg-card rounded-2xl p-4 space-y-3",
                    suggested?.userId === it.userId && "ring-2 ring-[#F5C518]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold flex items-center gap-1.5 flex-wrap">
                        {it.name}
                        {suggested?.userId === it.userId && (
                          <span className="text-[10px] font-bold bg-[#F5C518] text-[#1a1a1a] px-1.5 py-0.5 rounded-full">
                            ⭐ 建議
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[11px]">
                        {it.enRoute ? (
                          <span className="font-semibold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded-full">
                            去緊・約 {it.etaAt ? fmtClock(it.etaAt) : "?"} 到
                            {fmtKm(it.distanceM) ? `（${fmtKm(it.distanceM)}）` : ""}
                          </span>
                        ) : (
                          <span className="font-semibold bg-[#E3F5EC] text-[#1d6b47] px-1.5 py-0.5 rounded-full">
                            已喺場
                          </span>
                        )}
                        {it.completed != null && (
                          <span className="text-muted-foreground">完成 {it.completed} 次</span>
                        )}
                        {(it.noShows ?? 0) > 0 && (
                          <span className="font-semibold text-destructive">
                            冇出現 {it.noShows} 次
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground">{fmtAgo(it.at, now)}</span>
                      <button
                        onClick={() => setReportTarget({ userId: it.userId, name: it.name })}
                        aria-label={`舉報或封鎖 ${it.name}`}
                        className="w-8 h-8 -mr-1 grid place-items-center rounded-full hover:bg-accent text-muted-foreground"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {it.messages.map((m, i) => (
                      <div
                        key={i}
                        className={cn(
                          "inline-block mr-1.5 px-3 py-1.5 rounded-2xl text-sm",
                          m.from === user.id ? "bg-[#1a1a1a] text-white" : "bg-accent",
                        )}
                      >
                        {m.text}
                      </div>
                    ))}
                    {(() => {
                      const last = it.messages.at(-1);
                      return last && last.from === user.id && (it.buyerReadAt ?? 0) >= last.at ? (
                        <span className="text-[10px] text-muted-foreground" data-testid="read-mark">
                          已讀
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => accept(it.userId, post.price ?? undefined)}
                      className="h-10 px-3 rounded-full bg-[#1a1a1a] text-white text-sm font-bold"
                    >
                      {post.scenario === "groupbuy" ? "好呀，一齊夾" : "仲喺度，嚟啦"}
                    </button>
                    {it.offer != null && it.offer !== post.price && (
                      <button
                        onClick={() => accept(it.userId, it.offer)}
                        className="h-10 px-3 rounded-full bg-[#F5C518] text-[#1a1a1a] text-sm font-bold"
                      >
                        OK，${it.offer} 得
                      </button>
                    )}
                    <button
                      onClick={() => act(aah.declineInterest(post.id, it.userId))}
                      className="h-10 px-3 rounded-full border border-border text-sm font-semibold"
                    >
                      唔好意思，已經俾咗人
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {post.status === "open" && (
          <PushPrompt reason="有人撳「有興趣」會即刻通知你，閂咗 app 都收到。" />
        )}

        {post.status === "open" && (
          <div className="space-y-2">
            {pinEnabled && (
              <button
                onClick={() => setPinOpen(true)}
                className="w-full h-12 rounded-2xl border border-border bg-card font-bold inline-flex items-center justify-center gap-2"
              >
                <Pin className="w-4 h-4" /> {pinned ? "再置頂 15 分鐘" : "置頂 15 分鐘"}
              </button>
            )}
            <button
              onClick={() => act(aah.cancelPost(post.id), "已取消 post")}
              className="w-full h-11 rounded-2xl text-sm text-destructive font-semibold"
            >
              取消呢個 post
            </button>
            {mode === "local" && (
              <details className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm">
                <summary className="font-semibold text-amber-900">示範控制</summary>
                <div className="pt-3 space-y-2">
                  <button
                    onClick={() => aah.demoSomeoneInterested(post.id)}
                    className="w-full h-10 rounded-xl bg-white border border-amber-300 font-semibold"
                  >
                    模擬有人有興趣
                  </button>
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      <PinSheet
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        post={post}
        posts={posts}
        pinCredits={user.pinCredits}
        mallName={post.mallName}
        nearbyNames={mall ? nearbyMalls(malls, mall).map((m) => m.name) : []}
        nearbyAudience={
          mall ? nearbyMalls(malls, mall).reduce((s2, m) => s2 + demoAudience(m.id), 0) : 0
        }
        mallAudience={mall ? demoAudience(mall.id) : 0}
        now={now}
      />
    </AppLayout>
  );
}

function PinSheet({
  open,
  onClose,
  post,
  posts,
  pinCredits,
  mallName,
  nearbyNames,
  nearbyAudience,
  mallAudience,
  now,
}: {
  open: boolean;
  onClose: () => void;
  post: Post;
  posts: Post[];
  pinCredits: number;
  mallName: string;
  nearbyNames: string[];
  nearbyAudience: number;
  mallAudience: number;
  now: number;
}) {
  const s = SCENARIOS[post.scenario];
  const alreadyPinned = (post.pinnedUntil ?? 0) > now;
  const slotsUsed = pinnedCountInMall(posts, post.mallId, now) - (alreadyPinned ? 1 : 0);
  const full = slotsUsed >= MAX_PINNED_PER_MALL;
  const freeAt = nextPinFreeAt(posts, post.mallId, now);
  const leftMin = Math.floor((post.leaveAt - now) / 60000);
  const effective = Math.min(PIN_MINUTES, leftMin);
  const extra = s.pushNearby ? nearbyAudience : Math.round(mallAudience * 0.5);

  const mode = useAahMode();
  const [busy, setBusy] = useState(false);
  async function doPin(useCredit: boolean) {
    setBusy(true);
    try {
      await aah.pinPost(post.id, { useCredit, extraPushed: extra });
      toast.success(`已置頂 ${effective} 分鐘`, {
        description:
          s.pushNearby && nearbyNames.length
            ? `同時推送俾而家喺 ${mallName}、${nearbyNames.slice(0, 2).join("、")} 嘅人`
            : `同時推送俾而家喺 ${mallName} 嘅人`,
      });
      onClose();
    } catch (e) {
      toast.error(aahErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="置頂 15 分鐘">
      <div className="space-y-4 pb-2">
        <ul className="text-sm space-y-2">
          <li>📌 喺 feed 最頂顯示 15 分鐘，加「急」字標籤</li>
          <li>
            📣{" "}
            {s.pushNearby
              ? nearbyNames.length
                ? `推送俾而家喺 ${mallName} 同附近商場（${nearbyNames.slice(0, 3).join("、")}）、開咗通知嘅人`
                : `推送俾而家喺 ${mallName}、開咗通知嘅人（附近冇其他商場）`
              : `推送俾而家喺 ${mallName}、開咗通知嘅人（泊車單只喺本商場用得，所以唔推去其他商場）`}
          </li>
          <li>⏳ 配對成功、post 過期，或者你離開商場，置頂都會即刻結束</li>
        </ul>
        {leftMin < PIN_MINUTES && (
          <div className="text-xs bg-amber-50 text-amber-900 rounded-xl px-3 py-2">
            你 {fmtClock(post.leaveAt)} 走，置頂只會維持 {Math.max(0, leftMin)} 分鐘。
          </div>
        )}
        {full ? (
          <div className="text-sm bg-card rounded-xl p-3">
            置頂位已滿（最多 {MAX_PINNED_PER_MALL} 個），約{" "}
            {Math.max(1, Math.ceil((freeAt - now) / 60000))} 分鐘後有位。
          </div>
        ) : (
          <>
            {/* 免費期間唔使用積分次數，留返俾日後用 */}
            {!pinIsFree(mode) && pinCredits > 0 && (
              <button
                onClick={() => doPin(true)}
                className="w-full h-12 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-black"
              >
                用 1 次積分置頂（你有 {pinCredits} 次）
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => doPin(false)}
              className="w-full h-12 rounded-2xl bg-[#1a1a1a] text-white font-black disabled:opacity-50"
            >
              {pinIsFree(mode) ? "免費置頂 15 分鐘" : "置頂 15 分鐘"}
            </button>
            {pinIsFree(mode) && (
              <p className="text-[11px] text-muted-foreground text-center">
                現階段置頂免費，每人每日最多 3 次。
              </p>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
