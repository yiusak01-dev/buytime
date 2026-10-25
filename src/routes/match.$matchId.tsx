import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MapPin, Clock, Keyboard, Flag, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { Avatar, describeOutfit } from "@/components/aah/Avatar";
import { OutfitEditor } from "@/components/aah/OutfitEditor";
import { BottomSheet, Chip, DemoBadge, ScenarioTag } from "@/components/aah/ui";
import { aah, aahErrorText, useAahMode, useAahState, todayKey, CHAT_CLOSE_AFTER_MIN, BAN_DAYS } from "@/lib/aah/store";
import { geoStore } from "@/lib/aah/geo";
import { useAahMalls } from "@/lib/aah/malls";
import { useCurrentMall, useNow, fmtClock } from "@/lib/aah/geo";
import { SCENARIOS, payLabel } from "@/lib/aah/scenarios";
import type { Match } from "@/lib/aah/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/match/$matchId")({
  head: () => ({ meta: [{ title: "配對 · 啱啱好" }] }),
  component: MatchPage,
});

const MIN = 60000;
/** 偵測交換電話／其他通訊 app */
const CONTACT_RE = /(\d[\s-]?){8,}|whats\s*app|\bwts\b|\bwa\b|telegram|\btg\b|signal|wechat|微信|line\s*id|ig\s*:|instagram/i;

function MatchPage() {
  const { matchId } = Route.useParams();
  const navigate = useNavigate();
  const { matches, user, posts } = useAahState();
  const { malls } = useAahMalls();
  const current = useCurrentMall(malls);
  const now = useNow(5000);
  const m = matches.find((x) => x.id === matchId);

  const [warnOpen, setWarnOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [outfitOpen, setOutfitOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSent = useRef<{ text: string; at: number } | null>(null);

  // 今日已經揀過衫就自動用返
  useEffect(() => {
    if (!m || m.status !== "active") return;
    if (!m.outfits[user.id] && user.outfitToday?.date === todayKey()) void aah.setOutfitToday(user.outfitToday.outfit, m.id).catch(() => {});
  }, [m?.id, m?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // 有新訊息先自動捲落去（第一次打開唔捲，等用家先睇到見面資料）
  const seenMsgs = useRef<number | null>(null);
  useEffect(() => {
    const n = m?.messages.length;
    if (n == null) return;
    if (seenMsgs.current != null && n > seenMsgs.current) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    seenMsgs.current = n;
  }, [m?.messages.length]);

  const others = useMemo(() => (m ? m.participants.filter((p) => p.userId !== user.id) : []), [m, user.id]);
  const mode = useAahMode();

  if (!m || !m.participants.some((p) => p.userId === user.id)) {
    return (
      <AppLayout hideNav>
        <div className="p-8 text-center space-y-3">
          <div className="text-4xl">🤷</div>
          <div className="font-bold">搵唔到呢個配對</div>
          <Link to="/me" className="inline-block h-11 px-5 leading-[44px] rounded-2xl bg-[#1a1a1a] text-white font-bold">返去我的配對</Link>
        </div>
      </AppLayout>
    );
  }

  const s = SCENARIOS[m.scenario];
  const active = m.status === "active";
  const iConfirmed = m.confirmedBy.includes(user.id);
  const allConfirmed = m.participants.every((p) => m.confirmedBy.includes(p.userId));
  const iArrived = !!m.arrived[user.id];
  const pastMeet = now > m.meetAt;
  const chatClosed = !active && now - (m.endedAt ?? now) > CHAT_CLOSE_AFTER_MIN * MIN;
  const missing = others.filter((o) => !m.arrived[o.userId]);
  const inMall = current.mall?.id === m.mallId;

  function guardedSend(t: string) {
    if (CONTACT_RE.test(t)) {
      toast.error("為咗安全，請喺 app 內溝通", { description: "唔好交換電話號碼或者其他通訊 app" });
      return;
    }
    // 防連撳：同一句 5 秒內唔重複發送
    const now2 = Date.now();
    if (lastSent.current && lastSent.current.text === t && now2 - lastSent.current.at < 5000) return;
    lastSent.current = { text: t, at: now2 };
    void act(aah.sendMessage(m!.id, t));
  }

  // 臨時取消：對方已經到咗，自己未到
  const lateIfCancel = !iArrived && others.some((o) => m.arrived[o.userId]);
  const cancelledByOther = m.status === "cancelled" && !!m.cancelledBy && m.cancelledBy !== user.id;
  const alternatives = posts.filter((p) => p.mallId === m.mallId && p.scenario === m.scenario && p.status === "open" && p.leaveAt > now && p.authorId !== user.id && p.id !== m.postId);

  async function act(p: Promise<unknown>, ok?: string) {
    try {
      await p;
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(aahErrorText(e));
    }
  }

  async function arrive() {
    if (!inMall) {
      toast.error(`GPS 未確認你喺 ${m!.mallName}`, { description: "去到見面地點再撳" });
      return;
    }
    const g = geoStore.get();
    try {
      const r = await aah.arrive(m!.id, { coords: g.lat != null && g.lng != null ? { lat: g.lat, lng: g.lng } : undefined });
      if (r === "completed") toast.success("見到面喇！已完成");
      else toast("已通知對方你到咗", { description: "舉起電話對一對公仔" });
    } catch (e) {
      toast.error(aahErrorText(e));
    }
  }

  const presets = [`喺${m.meetPlace}等`, "5 分鐘到", "10 分鐘到", "等我 2 分鐘", "搵唔到你"];

  return (
    <AppLayout hideNav>
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur px-4 pt-4 pb-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate({ to: "/me" })} aria-label="返回" className="w-9 h-9 grid place-items-center rounded-full hover:bg-accent">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <ScenarioTag scenario={m.scenario} />
              <span className="text-xs text-muted-foreground truncate">{m.mallName}</span>
            </div>
            <div className="font-black text-base truncate mt-0.5">
              {m.shop}・{m.price == null ? "夾單" : m.price === 0 ? "免費" : `$${m.price}`}
            </div>
          </div>
          {active && (
            <button onClick={() => setReportOpen(true)} aria-label="舉報或封鎖" className="w-9 h-9 grid place-items-center rounded-full hover:bg-accent text-muted-foreground">
              <Flag className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <div className="px-4 pt-4 pb-56 space-y-4">
        {/* 狀態 */}
        {m.status === "completed" && (
          <div className="bg-[#E3F5EC] text-[#1d6b47] rounded-2xl p-4 flex items-center gap-2 font-bold"><CheckCircle2 className="w-5 h-5" /> 已完成</div>
        )}
        {m.status === "cancelled" && (
          <div className="bg-card rounded-2xl p-4 space-y-3">
            <div className="font-bold">{cancelledByOther ? "對方取消咗配對" : "配對已取消"}</div>
            {cancelledByOther && m.lateCancel && iArrived && (
              <div className="text-sm text-muted-foreground">你已經到咗，對方先取消。已經記錄咗對方一次臨時取消，亦補償咗你 20 分。</div>
            )}
            {m.cancelledBy === user.id && m.lateCancel && (
              <div className="text-sm text-amber-800">對方已經到咗先取消，記咗一次臨時取消。</div>
            )}
            {cancelledByOther && (
              <Link
                to="/"
                search={{ cat: m.scenario }}
                className="flex items-center justify-between rounded-xl bg-[#FFF6D6] px-4 py-3 text-sm font-bold"
              >
                <span>{alternatives.length > 0 ? `${m.mallName}仲有 ${alternatives.length} 個${SCENARIOS[m.scenario].label}着數` : `睇吓${m.mallName}其他着數`}</span>
                <span>→</span>
              </Link>
            )}
          </div>
        )}
        {m.status === "noshow" &&
          (!m.arrived[user.id] ? (
            // 報告人一定撳咗「我到咗」，所以未到嘅就係被報告嘅人
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
              <div className="font-black text-red-900">對方報告你冇出現</div>
              <div className="text-sm text-red-900">
                {user.bannedUntil && user.bannedUntil > now ? `帳戶停用到 ${new Date(user.bannedUntil).toLocaleDateString("zh-HK")}。` : ""}
                如果有誤會（例如電話冇電、停車場收唔到 GPS），可以喺 48 小時內申訴。
              </div>
              <Link to="/me" className="flex items-center justify-center h-11 rounded-2xl bg-red-700 text-white font-bold">去申訴</Link>
            </div>
          ) : (
            <div className="bg-red-50 text-red-800 rounded-2xl p-4 font-bold">已記錄對方冇出現，配對已結束</div>
          ))}

        {/* 見面地點時間 */}
        <div className="bg-card rounded-2xl p-4 space-y-3 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-muted-foreground">見面</div>
            {allConfirmed ? <span className="text-xs font-bold text-[#2E9E6A]">雙方已確認</span> : iConfirmed ? <span className="text-xs text-muted-foreground">等對方確認</span> : null}
          </div>
          <div className="flex items-center gap-2 text-lg font-black"><MapPin className="w-5 h-5 text-[#E8642A]" />{m.meetPlace}</div>
          <div className="flex items-center gap-2 text-sm"><Clock className="w-4 h-4 text-muted-foreground" />{fmtClock(m.meetAt)}{pastMeet && active ? "（已經過咗約定時間）" : ""}</div>
          {active && !iConfirmed && (
            <div className="flex gap-2">
              <button onClick={() => setWarnOpen(true)} className="flex-1 h-11 rounded-2xl bg-[#1a1a1a] text-white font-bold">OK，就咁</button>
              <button onClick={() => setChangeOpen(true)} className="flex-1 h-11 rounded-2xl border border-border font-bold">改地點／時間</button>
            </div>
          )}
          {active && iConfirmed && (
            <button onClick={() => setChangeOpen(true)} className="text-xs underline text-muted-foreground">改地點／時間</button>
          )}
          <div className="text-xs text-muted-foreground">💡 {s.handoverHint}</div>
        </div>

        {/* 認人：公仔 */}
        <div className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)]">
          <div className="text-xs font-bold text-muted-foreground mb-2">見面認人</div>
          <div className="flex gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain">
            {others.map((o) => (
              <div key={o.userId} className="flex flex-col items-center text-center w-28 shrink-0">
                <Avatar outfit={m.outfits[o.userId]} size={64} />
                <div className="text-sm font-bold mt-1">{o.name}</div>
                <div className="text-[10px] text-muted-foreground leading-snug">{m.outfits[o.userId] ? describeOutfit(m.outfits[o.userId]) : "對方未揀衫"}</div>
                {m.arrived[o.userId] && <div className="text-[11px] font-bold text-[#2E9E6A] mt-1">已經到咗</div>}
              </div>
            ))}
            <div className="flex flex-col items-center text-center w-28 shrink-0 border-l border-border pl-4">
              <Avatar outfit={m.outfits[user.id]} size={64} />
              <div className="text-sm font-bold mt-1">你</div>
              {active && (
                <button onClick={() => setOutfitOpen(true)} className="text-[11px] underline text-muted-foreground mt-0.5">
                  {m.outfits[user.id] ? "改打扮" : "你今日著咩？"}
                </button>
              )}
            </div>
          </div>
          {active && !m.outfits[user.id] && (
            <button onClick={() => setOutfitOpen(true)} className="mt-3 w-full h-11 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-bold">揀你今日嘅打扮，方便對方認你</button>
          )}
        </div>

        {/* 交收提示 */}
        {m.price != null && m.price > 0 && (
          <div className="bg-card rounded-2xl p-4 text-sm space-y-1.5">
            <div className="font-bold">交收提示</div>
            <div>・見面先俾錢，唔好預先轉數</div>
            {m.payMethods.some((p) => p !== "cash") && <div>・用 {payLabel(m.payMethods.filter((p) => p !== "cash"))} 就掃對方 QR code，唔使交換電話</div>}
            <div>・收錢嗰位要睇自己電話嘅收款通知，唔好只睇對方截圖</div>
          </div>
        )}
        {m.scenario === "groupbuy" && <div className="bg-card rounded-2xl p-4 text-sm">🛍 見面一齊去收銀處，各自俾自己嗰份。</div>}

        {/* 過咗約定時間：對方到咗未？ */}
        {active && pastMeet && iArrived && missing.length > 0 && (
          <div className="bg-[#FFF6D6] border border-[#F5C518] rounded-2xl p-4 space-y-3">
            <div className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />對方到咗未？</div>
            {missing.map((o) => (
              <div key={o.userId} className="flex items-center gap-2">
                <div className="flex-1 text-sm font-semibold">{o.name}</div>
                <button onClick={() => act(aah.arrive(m.id, { userId: o.userId }))} className="h-9 px-3 rounded-full bg-[#1a1a1a] text-white text-sm font-bold">到咗喇</button>
                {m.confirmedBy.includes(o.userId) ? (
                  <button
                    onClick={() => {
                      void act(aah.reportNoShow(m.id, o.userId), `已記錄對方冇出現，對方帳戶會停用 ${BAN_DAYS} 日；佢可以申訴。`);
                    }}
                    className="h-9 px-3 rounded-full border border-border text-sm font-semibold"
                  >
                    冇出現
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground max-w-[7rem] leading-tight">對方未確認見面，唔使等可以直接取消</span>
                )}
              </div>
            ))}
          </div>
        )}
        {active && pastMeet && !iArrived && now - m.meetAt > 10 * MIN && (
          <div className="text-xs bg-amber-50 text-amber-900 rounded-xl px-3 py-2">你仲未撳「我到咗」。如果已經見咗面，記得撳。</div>
        )}

        {/* 對話 */}
        <div className="space-y-2">
          {m.messages.map((msg) =>
            msg.from === "system" ? (
              <div key={msg.id} className="text-center text-[11px] text-muted-foreground px-6">{msg.text}</div>
            ) : (
              <div key={msg.id} className={cn("flex", msg.from === user.id ? "justify-end" : "justify-start")}>
                <div className={cn("px-3 py-2 rounded-2xl text-sm max-w-[78%]", msg.from === user.id ? "bg-[#1a1a1a] text-white" : "bg-card shadow-[var(--shadow-card)]")}>
                  {msg.from !== user.id && m.participants.length > 2 && <div className="text-[10px] font-bold opacity-60">{m.participants.find((p) => p.userId === msg.from)?.name}</div>}
                  {msg.text}
                </div>
              </div>
            ),
          )}
          {/* scroll-mb：捲落嚟時唔好俾底部嗰排掣遮住 */}
          <div ref={bottomRef} className="scroll-mb-44" />
        </div>

        {active && mode === "local" && (
          <details className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm">
            <summary className="font-semibold text-amber-900">示範控制</summary>
            <div className="pt-3 space-y-2">
              <button onClick={() => aah.demoPartnerArrives(m.id)} className="w-full h-10 rounded-xl bg-white border border-amber-300 font-semibold">模擬對方到咗</button>
              <button onClick={() => aah.demoPartnerReportsMe(m.id)} className="w-full h-10 rounded-xl bg-white border border-amber-300 font-semibold">模擬對方報我冇出現</button>
            </div>
          </details>
        )}
      </div>

      {/* 底部：預設訊息 + 我到咗 */}
      <div className="fixed bottom-0 inset-x-0 z-30">
        <div className="max-w-lg mx-auto px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-background via-background to-transparent space-y-2">
          {chatClosed ? (
            <div className="text-center text-sm bg-card rounded-2xl py-4 text-muted-foreground">對話已關閉</div>
          ) : !active ? (
            <div className="text-center text-xs bg-card rounded-2xl py-3 text-muted-foreground">
              配對已結束，對話會喺 {fmtClock((m.endedAt ?? now) + CHAT_CLOSE_AFTER_MIN * MIN)} 關閉
            </div>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                {presets.map((t) => (
                  <button key={t} onClick={() => guardedSend(t)} className="shrink-0 h-10 px-3 rounded-full border border-border bg-card text-sm font-semibold">
                    {t}
                  </button>
                ))}
                <button onClick={() => setTyping((v) => !v)} aria-label="打字" className="shrink-0 h-10 w-10 grid place-items-center rounded-full border border-border bg-card">
                  <Keyboard className="w-4 h-4" />
                </button>
              </div>
              {typing && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!text.trim()) return;
                    guardedSend(text.trim().slice(0, 80));
                    setText("");
                  }}
                  className="flex gap-2"
                >
                  <input value={text} onChange={(e) => setText(e.target.value)} placeholder="打少少字（唔好留電話）" className="flex-1 h-10 px-3 rounded-full border border-border bg-card outline-none text-sm" />
                  <button className="h-10 px-4 rounded-full bg-[#1a1a1a] text-white text-sm font-bold">傳送</button>
                </form>
              )}
              <div className="flex gap-2">
                <button
                  onClick={arrive}
                  disabled={iArrived}
                  className="flex-1 h-14 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-black text-base shadow-lg disabled:opacity-60"
                >
                  {iArrived ? "已撳我到咗" : "我到咗"}
                </button>
                <button onClick={() => setCancelOpen(true)} className="h-14 px-4 rounded-2xl border border-border bg-card text-sm font-semibold">
                  取消
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 確認見面：冇出現警告 */}
      <BottomSheet open={warnOpen} onClose={() => setWarnOpen(false)} title="確認見面之前">
        <div className="space-y-4 pb-2">
          <div className="bg-red-50 text-red-900 rounded-2xl p-4 text-sm space-y-2">
            <div className="font-black flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />冇出現會被停用一個月</div>
            <div>確認之後，如果你最後冇出現，對方報告並經 GPS 核實，你嘅帳戶會停用 {BAN_DAYS} 日。</div>
            <div>有急事？喺約定時間（{fmtClock(m.meetAt)}）之前撳「取消」，唔會被罰。</div>
            <div>覺得被誤會（例如電話冇電、停車場收唔到 GPS），可以喺 48 小時內喺「我的配對」申訴。</div>
          </div>
          <button
            onClick={() => {
              setWarnOpen(false);
              void act(aah.confirmMeet(m.id), "已確認見面");
            }}
            className="w-full h-12 rounded-2xl bg-[#1a1a1a] text-white font-bold"
          >
            我明白，確認見面
          </button>
        </div>
      </BottomSheet>

      <ChangeMeetSheet open={changeOpen} onClose={() => setChangeOpen(false)} match={m} />

      <BottomSheet open={outfitOpen} onClose={() => setOutfitOpen(false)} title="你今日著咩？">
        <OutfitEditor
          initial={m.outfits[user.id] ?? user.outfitToday?.outfit}
          onSave={(o) => {
            void act(aah.setOutfitToday(o, m.id));
            setOutfitOpen(false);
          }}
        />
      </BottomSheet>

      <BottomSheet open={cancelOpen} onClose={() => setCancelOpen(false)} title="取消配對">
        <div className="space-y-2 pb-2">
          {lateIfCancel ? (
            <div className="bg-red-50 text-red-900 rounded-2xl p-4 text-sm space-y-1.5">
              <div className="font-black flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />對方已經到咗等緊你</div>
              <div>而家取消會記一次「臨時取消」，扣 30 分，並且補償對方 20 分。</div>
              {(user.lateCancels30d ?? 0) >= 1 ? (
                <div className="font-bold">你 30 日內已經有 {user.lateCancels30d} 次臨時取消，今次取消帳戶會停用一個月。</div>
              ) : (
                <div>30 日內第二次臨時取消，帳戶會停用一個月。</div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">對方未到，而家取消唔會被罰。</p>
          )}
          {["唔好意思，唔要喇", "我要走喇"].map((t) => (
            <button
              key={t}
              onClick={() => {
                const late = lateIfCancel;
                setCancelOpen(false);
                void aah.cancelMatch(m.id, t).then(
                  () => (late ? toast("已取消，記咗一次臨時取消", { description: "扣 30 分" }) : toast("已取消配對")),
                  (e) => toast.error(aahErrorText(e)),
                );
              }}
              className={lateIfCancel ? "w-full h-12 rounded-2xl border border-red-300 text-red-700 font-semibold" : "w-full h-12 rounded-2xl border border-border font-semibold"}
            >
              {t}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={reportOpen} onClose={() => setReportOpen(false)} title="舉報／封鎖">
        <div className="space-y-2 pb-2">
          {["對方要求預先轉數", "對方騷擾我", "收據／飛／券係假嘅", "其他"].map((t) => (
            <button
              key={t}
              onClick={() => {
                setReportOpen(false);
                const accused = others[0]?.userId;
                const kind = ({ 對方要求預先轉數: "prepay", 對方騷擾我: "harass", "收據／飛／券係假嘅": "fake", 其他: "other" } as Record<string, string>)[t] ?? "other";
                if (accused) void act(aah.report(m.id, accused, kind, t), "已收到舉報，我哋會人手跟進");
              }}
              className="w-full h-12 rounded-2xl border border-border font-semibold text-left px-4"
            >
              {t}
            </button>
          ))}
          {mode === "local" && <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><DemoBadge />示範版只會取消配對；正式版會送去人手審核。</p>}
        </div>
      </BottomSheet>
    </AppLayout>
  );
}

function ChangeMeetSheet({ open, onClose, match }: { open: boolean; onClose: () => void; match: Match }) {
  const s = SCENARIOS[match.scenario];
  const places = useMemo(() => {
    const base = match.scenario === "parking" ? s.meetPlaces : [`${match.shop}門口`, ...s.meetPlaces.filter((p) => !p.includes("門口") || p === "商場正門")];
    return Array.from(new Set(base));
  }, [match, s]);
  const [place, setPlace] = useState(match.meetPlace);
  const [mins, setMins] = useState(5);
  return (
    <BottomSheet open={open} onClose={onClose} title="改地點／時間">
      <div className="space-y-4 pb-2">
        <div className="space-y-2">
          <div className="text-sm font-bold">喺邊度見？</div>
          <div className="flex flex-wrap gap-2">
            {places.map((p) => (
              <Chip key={p} active={place === p} onClick={() => setPlace(p)}>{p}</Chip>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-bold">幾時見？</div>
          <div className="flex flex-wrap gap-2">
            {[5, 10, 15, 20].map((n) => (
              <Chip key={n} active={mins === n} onClick={() => setMins(n)}>{n} 分鐘後</Chip>
            ))}
          </div>
        </div>
        <button
          onClick={() => {
            aah.changeMeet(match.id, place, Date.now() + mins * MIN).catch((e) => toast.error(aahErrorText(e)));
            onClose();
          }}
          className="w-full h-12 rounded-2xl bg-[#1a1a1a] text-white font-bold"
        >
          改好，通知對方
        </button>
        <p className="text-[11px] text-muted-foreground">改咗之後，對方要再確認一次。</p>
      </div>
    </BottomSheet>
  );
}
