import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, Send, Pin, Minus, Plus, Clock } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { PushPrompt } from "@/components/aah/PushPrompt";
import { BottomSheet, DemoBadge, ScenarioTag } from "@/components/aah/ui";
import { RegisterSheet } from "@/components/aah/RegisterSheet";
import { postSaving, priceLabel } from "@/components/aah/PostCard";
import {
  aah,
  aahErrorText,
  getSettings,
  pinIsFree,
  testLocationAllowed,
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
import { useCurrentMall, useNow, fmtClock, fmtLeft, fmtAgo } from "@/lib/aah/geo";
import { SCENARIOS, keyInfo, payLabel, authorRole, receiptCountNote } from "@/lib/aah/scenarios";
import { ScenarioTips } from "@/components/aah/ScenarioTips";
import { buyerParkingSaving } from "@/lib/aah/pricing";
import type { Post } from "@/lib/aah/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/post/$postId")({
  head: () => ({ meta: [{ title: "着數詳情 · 啱啱好" }] }),
  component: PostPage,
});

function PostPage() {
  const { postId } = Route.useParams();
  const { posts, user } = useAahState();
  const post = posts.find((p) => p.id === postId);

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
          <Link to="/" className="inline-block h-11 px-5 leading-[44px] rounded-2xl bg-[#1a1a1a] text-white font-bold">返去睇着數</Link>
        </div>
      </AppLayout>
    );
  }
  return post.authorId === user.id ? <MyPostView post={post} /> : <PostDetailView post={post} />;
}

function TopBar({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur px-4 pt-4 pb-3 flex items-center gap-3 border-b border-border/60">
      <button onClick={() => (window.history.length > 1 ? window.history.back() : navigate({ to: "/" }))} aria-label="返回" className="w-9 h-9 grid place-items-center rounded-full hover:bg-accent">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div className="font-black text-lg">{title}</div>
    </header>
  );
}

function PostSummary({ post, now }: { post: Post; now: number }) {
  const { malls } = useAahMalls();
  const mall = malls.find((m) => m.id === post.mallId);
  const s = SCENARIOS[post.scenario];
  const saving = postSaving(post, mall, now);
  return (
    <div className="bg-card rounded-2xl shadow-[var(--shadow-card)] overflow-hidden border-l-[6px]" style={{ borderLeftColor: s.color }}>
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <ScenarioTag scenario={post.scenario} direction={post.direction} />
          <div className="text-xl font-black">{priceLabel(post)}</div>
        </div>
        <div className="font-black text-lg leading-snug">{post.shop}</div>
        <div className="text-sm text-muted-foreground">📍 {post.mallName}・{post.authorName}</div>
        <div className="text-[15px]">{keyInfo(post.scenario, post.direction, post.fields, post.needCount)}</div>
        {saving != null && saving > 0 && <div className="text-2xl font-black text-[#2E9E6A]">慳 ${saving}</div>}
        {post.payMethods.length > 0 && post.price != null && post.price > 0 && <div className="text-sm text-muted-foreground">收款：{payLabel(post.payMethods)}</div>}
        <div className="flex items-center gap-3 text-xs flex-wrap pt-1">
          <span className="text-muted-foreground">
            ⏰ {fmtClock(post.leaveAt)} 前{post.scenario === "dining" ? "叫號" : "喺度"}（{fmtLeft(post.leaveAt - now)}）
          </span>
          {post.verifiedOnSite && <span className="text-[#2E9E6A] font-semibold">📍 已確認喺場</span>}
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
  const [pending, setPending] = useState<{ text: string; offer?: number } | null>(null);
  const [offer, setOffer] = useState(() => (post.price && post.price > 10 ? post.price - 5 : post.price ?? 0));
  const [entry, setEntry] = useState("");

  const mine = post.interests.find((i) => i.userId === user.id);
  const lastSent = useRef<{ text: string; at: number } | null>(null);

  // 自己傳咗訊息或者對方覆：捲落對話度（唔好俾底部嗰排掣遮住）
  const chatEnd = useRef<HTMLDivElement>(null);
  const seenMsgs = useRef<number | null>(null);
  useEffect(() => {
    const n = mine?.messages.length ?? 0;
    if (seenMsgs.current != null && n > seenMsgs.current) chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    seenMsgs.current = n;
  }, [mine?.messages.length]);

  // 對方揀咗你 → 去配對畫面
  useEffect(() => {
    if (mine?.status === "accepted" && post.matchId) {
      toast.success("配對成功！");
      navigate({ to: "/match/$matchId", params: { matchId: post.matchId } });
    }
  }, [mine?.status, post.matchId, navigate]);

  // 要喺同一個商場；$5 置頂推到嚟嘅附近商場 post 都接得（泊車除外）
  const inRange = useMemo(() => {
    // 正式上線（唔准測試位置）：一定要 GPS 確認喺商場先接得
    if (!current.mall || (current.test && !testLocationAllowed())) return false;
    if (current.mall.id === post.mallId) return true;
    if (!s.pushNearby || !mall) return false;
    return nearbyMalls(malls, mall).some((m) => m.id === current.mall!.id);
  }, [current.mall, post.mallId, s.pushNearby, mall, malls]);

  const banned = isBanned(user);
  const open = post.status === "open" && post.leaveAt > now;

  function send(text: string, off?: number) {
    // 防連撳：同一句 5 秒內唔重複發送
    const t0 = Date.now();
    if (lastSent.current && lastSent.current.text === text && t0 - lastSent.current.at < 5000) return;
    lastSent.current = { text, at: t0 };
    const me = aah.get().user;
    if (isBanned(me)) return;
    if (!me.registered) {
      setPending({ text, offer: off });
      setRegOpen(true);
      return;
    }
    void doExpress(text, off);
  }

  async function doExpress(text: string, off?: number) {
    try {
      const matchId = await aah.expressInterest(post.id, text, off);
      if (matchId) {
        toast.success("配對成功！");
        navigate({ to: "/match/$matchId", params: { matchId } });
      }
    } catch (e) {
      toast.error(aahErrorText(e));
    }
  }

  const parkingCalc = useMemo(() => {
    if (post.scenario !== "parking" || post.direction !== "have" || !mall || !entry) return null;
    const m = entry.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hkNow = new Date(now + 8 * 3600 * 1000);
    const ts = Date.UTC(hkNow.getUTCFullYear(), hkNow.getUTCMonth(), hkNow.getUTCDate(), Number(m[1]), Number(m[2])) - 8 * 3600 * 1000;
    if (ts > now) return null;
    return buyerParkingSaving(mall, Number(post.fields.hours ?? 0), ts, now);
  }, [post, mall, entry, now]);

  const joinWord = post.scenario === "groupbuy" ? "我夾" : "有興趣";

  return (
    <AppLayout hideNav>
      <TopBar title="着數詳情" />
      <div className="px-4 pt-4 pb-40 space-y-4">
        <PostSummary post={post} now={now} />

        {post.scenario === "parking" && post.direction === "have" && receiptCountNote(post.fields.receiptCount, "taker") && (
          <div className="text-xs rounded-xl px-3 py-2.5 bg-amber-50 text-amber-900 border border-amber-200">
            ⚠️ {receiptCountNote(post.fields.receiptCount, "taker")}
          </div>
        )}

        {parkingCalc === null && post.scenario === "parking" && post.direction === "have" && (
          <div className="bg-card rounded-2xl p-4 space-y-2">
            <div className="text-sm font-bold">你幾點入停車場？計吓實際慳幾多</div>
            <input type="time" value={entry} onChange={(e) => setEntry(e.target.value)} className="h-11 px-3 rounded-xl border border-border bg-background outline-none" />
          </div>
        )}
        {parkingCalc && (
          <div className="bg-[#E3F5EC] text-[#1d6b47] rounded-2xl p-4 text-sm space-y-1">
            <div>你 {entry} 入場，泊咗 {parkingCalc.parked} 個鐘，按今日（{parkingCalc.dayLabel}）收費要俾 ${parkingCalc.fee}。</div>
            <div className="font-black text-base">用呢張收據慳 ${parkingCalc.saving}{post.price ? `，扣埋 $${post.price} 淨慳 $${Math.max(0, parkingCalc.saving - post.price)}` : ""}</div>
            {parkingCalc.payAfter > 0 && <div className="text-xs">用咗收據之後，停車場仲要俾 ${parkingCalc.payAfter}。</div>}
            <button onClick={() => setEntry("")} className="text-xs underline">改時間</button>
          </div>
        )}

        <ScenarioTips scenario={post.scenario} role={post.direction === "join" ? "taker" : authorRole(post.direction) === "giver" ? "taker" : "giver"} mall={mall} title="接之前要知" />
        <div className="text-xs bg-card rounded-xl px-3 py-2.5 text-muted-foreground">
          💡 {s.handoverHint}。{post.price ? "見面交收時先俾錢，唔好預先轉數。" : ""}
        </div>

        {/* 開通知提示放喺對話上面：捲落去睇對話時一齊見到 */}
        {mine?.status === "pending" && (
          <PushPrompt reason="對方一覆你就會通知你，閂咗 app 都收到。" onShown={() => chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" })} />
        )}

        {/* 對話（配對前） */}
        {mine && (
          <div className="bg-card rounded-2xl p-4 space-y-2">
            <div className="text-xs font-bold text-muted-foreground">同 {post.authorName} 嘅對話</div>
            {mine.messages.map((m, i) => (
              <div key={i} className={cn("flex", m.from === user.id ? "justify-end" : "justify-start")}>
                <div className={cn("px-3 py-2 rounded-2xl text-sm max-w-[80%]", m.from === user.id ? "bg-[#1a1a1a] text-white" : "bg-accent")}>{m.text}</div>
              </div>
            ))}
            {mine.status === "pending" && <div className="text-xs text-muted-foreground text-center pt-1">等緊對方覆…</div>}
            <div ref={chatEnd} className="scroll-mb-44" />
          </div>
        )}
      </div>

      {/* 底部動作 */}
      <div className="fixed bottom-0 inset-x-0 z-30">
        <div className="max-w-lg mx-auto px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-background via-background to-transparent space-y-2">
          {!open ? (
            <div className="text-center text-sm font-semibold bg-card rounded-2xl py-4">{post.status === "matched" ? "已經俾咗人" : "呢個 post 已經結束"}</div>
          ) : banned ? (
            <div className="text-center text-sm bg-card rounded-2xl p-4">
              你嘅帳戶停用緊，暫時唔可以接 post。<Link to="/me" className="underline font-semibold">申訴</Link>
            </div>
          ) : !inRange ? (
            <div className="text-center text-sm bg-card rounded-2xl p-4">要喺 {post.mallName}{s.pushNearby ? " 或者附近商場" : ""} 先可以接呢個 post{current.test && !testLocationAllowed() ? "（GPS 確認咗你喺度就得）" : ""}</div>
          ) : mine?.status === "declined" ? (
            <div className="text-center text-sm bg-card rounded-2xl p-4">唔好意思，對方已經俾咗人</div>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                <button onClick={() => send("你仲喺唔喺附近？")} className="shrink-0 h-10 px-3 rounded-full border border-border bg-card text-sm font-semibold">
                  你仲喺唔喺附近？
                </button>
                {post.price != null && post.price > 0 && (
                  <div className="shrink-0 flex items-center gap-1 h-10 pl-1 pr-1 rounded-full border border-border bg-card">
                    <button aria-label="減" onClick={() => setOffer((o) => Math.max(0, o - 5))} className="w-8 h-8 grid place-items-center rounded-full hover:bg-accent"><Minus className="w-3.5 h-3.5" /></button>
                    <button onClick={() => send(`$${offer} 得唔得？`, offer)} className="text-sm font-semibold px-1">${offer} 得唔得？</button>
                    <button aria-label="加" onClick={() => setOffer((o) => o + 5)} className="w-8 h-8 grid place-items-center rounded-full hover:bg-accent"><Plus className="w-3.5 h-3.5" /></button>
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
        reason="接 post 同傾偈要先註冊。"
        onDone={() => {
          setRegOpen(false);
          if (pending) void doExpress(pending.text, pending.offer);
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
  const pending = post.interests.filter((i) => i.status === "pending");
  const age = now - post.createdAt;
  const showPinPrompt = post.status === "open" && !pinned && post.interests.length === 0 && age >= PIN_PROMPT_AFTER_MIN * 60000;

  useEffect(() => {
    if (post.status === "matched" && post.matchId) navigate({ to: "/match/$matchId", params: { matchId: post.matchId } });
  }, [post.status, post.matchId, navigate]);

  const joined = post.scenario === "groupbuy" && post.matchId ? post.interests.filter((i) => i.status === "accepted").length : 0;
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
      if (matchId && post.scenario !== "groupbuy") navigate({ to: "/match/$matchId", params: { matchId } });
    } catch (e) {
      toast.error(aahErrorText(e));
    }
  }

  return (
    <AppLayout hideNav>
      <TopBar title="你嘅 post" />
      <div className="px-4 pt-4 pb-10 space-y-4">
        {/* 狀態 */}
        {post.status === "open" ? (
          <div className="bg-[#1a1a1a] text-white rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-black text-lg">等緊有人接</div>
              <div className="text-xs flex items-center gap-1 opacity-80"><Clock className="w-3.5 h-3.5" />{fmtLeft(post.leaveAt - now)}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-1 opacity-70 text-xs"><Send className="w-3.5 h-3.5" />{mode === "remote" ? "附近用戶" : "已推送"}</div>
                <div className="text-xl font-black">{post.pushedCount} 人</div>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-1 opacity-70 text-xs"><Eye className="w-3.5 h-3.5" />睇過</div>
                <div className="text-xl font-black">{post.viewCount} 人</div>
              </div>
            </div>
            {mode === "remote" ? (
              <div className="text-[11px] opacity-70">而家喺 {post.mallName}、有訂閱呢類着數嘅用戶。佢哋開 app 就會見到；置頂可以即刻推送通知俾佢哋。</div>
            ) : (
              <div className="text-[11px] opacity-70 flex items-center gap-1.5"><DemoBadge /> 示範數字；正式版顯示真實推送人數。</div>
            )}
            {pinned && <div className="text-xs bg-[#F5C518] text-[#1a1a1a] rounded-lg px-2 py-1 font-bold inline-block">置頂中・仲有 {Math.max(1, Math.round(((post.pinnedUntil ?? 0) - now) / 60000))} 分鐘</div>}
            {post.scenario === "groupbuy" && <div className="text-sm">已經有 {joined} 人加入，仲要 {Math.max(0, (post.needCount ?? 1) - joined)} 人</div>}
            {post.scenario === "groupbuy" && post.matchId && (
              <Link to="/match/$matchId" params={{ matchId: post.matchId }} className="block text-center h-10 leading-[40px] rounded-xl bg-[#F5C518] text-[#1a1a1a] font-bold">
                同已加入嘅人傾
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-2xl p-4 space-y-3">
            <div className="font-black text-lg">{post.status === "expired" ? "已經過咗預計時間" : post.status === "cancelled" ? "已經取消" : "已經配對"}</div>
            {post.status === "expired" && (
              <div className="flex gap-2">
                <button onClick={() => act(aah.extendPost(post.id, 15))} className="flex-1 h-11 rounded-2xl bg-[#1a1a1a] text-white font-bold">延長 15 分鐘</button>
                <button onClick={() => act(aah.extendPost(post.id, 30))} className="flex-1 h-11 rounded-2xl border border-border font-bold">延長 30 分鐘</button>
              </div>
            )}
            {post.matchId && (
              <Link to="/match/$matchId" params={{ matchId: post.matchId }} className="block text-center h-11 leading-[44px] rounded-2xl bg-[#F5C518] font-bold">
                去配對畫面
              </Link>
            )}
          </div>
        )}

        {showPinPrompt && (
          <div className="bg-[#FFF6D6] border border-[#F5C518] rounded-2xl p-4 space-y-2">
            <div className="font-bold">15 分鐘都未有人理</div>
            <div className="text-sm">置頂 15 分鐘，同時推送俾而家喺{s.pushNearby ? "呢度同附近商場" : ` ${post.mallName} `}嘅人？</div>
            <button onClick={() => setPinOpen(true)} className="h-11 px-4 rounded-2xl bg-[#1a1a1a] text-white font-bold">{pinIsFree(mode) ? "免費置頂 15 分鐘" : "$5 置頂 15 分鐘"}</button>
          </div>
        )}

        <PostSummary post={post} now={now} />

        {/* 有興趣名單 */}
        {post.status === "open" && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-bold">有興趣嘅人（{pending.length}）</div>
              {post.autoAccept && <span className="text-[11px] text-muted-foreground">第一個有興趣會自動配對</span>}
            </div>
            {pending.length === 0 ? (
              <div className="bg-card rounded-2xl p-5 text-center text-sm text-muted-foreground">未有人，有人撳「有興趣」會即刻通知你。</div>
            ) : (
              pending.map((it) => (
                <div key={it.userId} className="bg-card rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-bold">{it.name}</div>
                    <div className="text-xs text-muted-foreground">{fmtAgo(it.at, now)}</div>
                  </div>
                  <div className="space-y-1.5">
                    {it.messages.map((m, i) => (
                      <div key={i} className="inline-block mr-1.5 px-3 py-1.5 rounded-2xl bg-accent text-sm">{m.text}</div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => accept(it.userId, post.price ?? undefined)} className="h-10 px-3 rounded-full bg-[#1a1a1a] text-white text-sm font-bold">
                      {post.scenario === "groupbuy" ? "好呀，一齊夾" : "仲喺度，嚟啦"}
                    </button>
                    {it.offer != null && it.offer !== post.price && (
                      <button onClick={() => accept(it.userId, it.offer)} className="h-10 px-3 rounded-full bg-[#F5C518] text-[#1a1a1a] text-sm font-bold">
                        OK，${it.offer} 得
                      </button>
                    )}
                    <button onClick={() => act(aah.declineInterest(post.id, it.userId))} className="h-10 px-3 rounded-full border border-border text-sm font-semibold">
                      唔好意思，已經俾咗人
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {post.status === "open" && <PushPrompt reason="有人撳「有興趣」會即刻通知你，閂咗 app 都收到。" />}

        {post.status === "open" && (
          <div className="space-y-2">
            <button onClick={() => setPinOpen(true)} className="w-full h-12 rounded-2xl border border-border bg-card font-bold inline-flex items-center justify-center gap-2">
              <Pin className="w-4 h-4" /> {pinned ? "再置頂 15 分鐘" : "置頂 15 分鐘"}
            </button>
            <button onClick={() => act(aah.cancelPost(post.id), "已取消 post")} className="w-full h-11 rounded-2xl text-sm text-destructive font-semibold">
              取消呢個 post
            </button>
            {mode === "local" && <details className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm">
              <summary className="font-semibold text-amber-900">示範控制</summary>
              <div className="pt-3 space-y-2">
                <button onClick={() => aah.demoSomeoneInterested(post.id)} className="w-full h-10 rounded-xl bg-white border border-amber-300 font-semibold">模擬有人有興趣</button>
              </div>
            </details>}
          </div>
        )}
      </div>

      <PinSheet open={pinOpen} onClose={() => setPinOpen(false)} post={post} posts={posts} pinCredits={user.pinCredits} mallName={post.mallName} nearbyNames={mall ? nearbyMalls(malls, mall).map((m) => m.name) : []} nearbyAudience={mall ? nearbyMalls(malls, mall).reduce((s2, m) => s2 + demoAudience(m.id), 0) : 0} mallAudience={mall ? demoAudience(mall.id) : 0} now={now} />
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
        description: s.pushNearby && nearbyNames.length ? `同時推送俾而家喺 ${mallName}、${nearbyNames.slice(0, 2).join("、")} 嘅人` : `同時推送俾而家喺 ${mallName} 嘅人`,
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
            📣 {s.pushNearby
              ? nearbyNames.length
                ? `推送俾而家喺 ${mallName} 同附近商場（${nearbyNames.slice(0, 3).join("、")}）、開咗通知嘅人`
                : `推送俾而家喺 ${mallName}、開咗通知嘅人（附近冇其他商場）`
              : `推送俾而家喺 ${mallName}、開咗通知嘅人（泊車收據只喺本商場用得，所以唔推去其他商場）`}
          </li>
          <li>⏳ 配對成功、post 過期，或者你離開商場，置頂都會即刻結束</li>
        </ul>
        {leftMin < PIN_MINUTES && <div className="text-xs bg-amber-50 text-amber-900 rounded-xl px-3 py-2">你 {fmtClock(post.leaveAt)} 走，置頂只會維持 {Math.max(0, leftMin)} 分鐘。</div>}
        {full ? (
          <div className="text-sm bg-card rounded-xl p-3">置頂位已滿（最多 {MAX_PINNED_PER_MALL} 個），約 {Math.max(1, Math.ceil((freeAt - now) / 60000))} 分鐘後有位。</div>
        ) : (
          <>
            {/* 免費期間唔使用積分次數，留返俾日後用 */}
            {!pinIsFree(mode) && pinCredits > 0 && (
              <button onClick={() => doPin(true)} className="w-full h-12 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-black">
                用 1 次積分置頂（你有 {pinCredits} 次）
              </button>
            )}
            <button disabled={busy} onClick={() => doPin(false)} className="w-full h-12 rounded-2xl bg-[#1a1a1a] text-white font-black disabled:opacity-50">
              {pinIsFree(mode) ? "免費置頂 15 分鐘" : "$5 置頂 15 分鐘"}
            </button>
            {pinIsFree(mode) && <p className="text-[11px] text-muted-foreground text-center">現階段置頂免費，每人每日最多 3 次。</p>}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
