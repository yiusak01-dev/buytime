import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronRight, KeyRound, LogOut, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { AppLayout } from "@/components/AppLayout";
import { BottomSheet, Chip, DemoBadge, ScenarioTag } from "@/components/aah/ui";
import { RegisterSheet } from "@/components/aah/RegisterSheet";
import { MallPicker } from "@/components/aah/MallPicker";
import { PushSettingRow } from "@/components/aah/PushPrompt";
import { aah, aahErrorText, getSettings, useAahMode, useAahState, isBanned, DAY, BAN_DAYS } from "@/lib/aah/store";
import { useAahMalls } from "@/lib/aah/malls";
import { useCurrentMall, useNow, fmtClock, fmtAgo } from "@/lib/aah/geo";
import { SCENARIOS, SCENARIO_LIST } from "@/lib/aah/scenarios";
import { nicknameProblem, nextNicknameChangeAt } from "@/lib/aah/nickname";

export const Route = createFileRoute("/me")({
  head: () => ({ meta: [{ title: "我的配對 · 啱啱好" }] }),
  component: MePage,
});

const STATUS_LABEL = { active: "進行中", completed: "已完成", cancelled: "已取消", noshow: "有人冇出現" } as const;

function MePage() {
  const { user, posts, matches } = useAahState();
  const { malls } = useAahMalls();
  const current = useCurrentMall(malls);
  const now = useNow(30000);
  const [regOpen, setRegOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [nickOpen, setNickOpen] = useState(false);
  const [nickDraft, setNickDraft] = useState("");
  const [nickBusy, setNickBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const navigate = useNavigate();

  const myMatches = useMemo(() => matches.filter((m) => m.participants.some((p) => p.userId === user.id)), [matches, user.id]);
  const activeMatches = myMatches.filter((m) => m.status === "active");

  // 改暱稱：配對緊、有 post 開緊、30 日內改過就唔改得
  const nextNickAt = nextNicknameChangeAt(user.nicknameChangedAt, now);
  const myOpenPosts = posts.filter((p) => p.authorId === user.id && p.status === "open" && p.leaveAt > now);
  const pastMatches = myMatches.filter((m) => m.status !== "active");
  const nickBlock = nextNickAt
    ? `暱稱 30 日只可以改一次，${new Date(nextNickAt).toLocaleDateString("zh-HK")} 之後先改得。`
    : activeMatches.length > 0 || myOpenPosts.length > 0
      ? "你有 post 開緊或者配對緊，完成或者取消之後先改得暱稱。"
      : null;
  const myOldPosts = posts.filter((p) => p.authorId === user.id && (p.status === "expired" || p.status === "cancelled")).slice(0, 10);

  const banned = isBanned(user, now);
  const banStart = user.bannedUntil ? user.bannedUntil - BAN_DAYS * DAY : 0;
  // 只計今次停用之後提交嘅申訴（舊嘅申訴唔應該擋住今次）
  const appeal = user.appeal && user.appeal.at >= banStart - 60000 ? user.appeal : undefined;
  const canAppeal = banned && now - banStart < 2 * DAY && !appeal;
  const mode = useAahMode();

  return (
    <AppLayout>
      <header className="bg-[#F5C518] text-[#1a1a1a] px-5 pt-6 pb-5 rounded-b-[28px] space-y-3">
        <div className="text-[22px] font-black">我的配對</div>
        {user.registered ? (
          <div className="flex items-center justify-between bg-white/60 rounded-2xl px-4 py-3">
            <div>
              <div className="font-black text-lg">{user.nickname}</div>
              <div className="text-xs opacity-70">{user.email ?? user.phone?.replace(/(\+852)(\d{4})(\d{4})/, "$1 $2 ••••")}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold">完成 {user.completed} 次</div>
              <div className="text-[11px] opacity-70">交收</div>
            </div>
          </div>
        ) : (
          <button onClick={() => setRegOpen(true)} className="w-full flex items-center justify-between bg-white/60 rounded-2xl px-4 py-3 text-left">
            <div>
              <div className="font-black">{user.signedIn ? "未完成註冊" : "未註冊"}</div>
              <div className="text-xs opacity-70">{user.signedIn ? "改個暱稱就可以開始用" : "用 email 註冊或者登入"}</div>
            </div>
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </header>

      <div className="px-4 pt-4 pb-10 space-y-5">
        {/* 停用 + 申訴 */}
        {banned && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-3">
            <div className="font-black text-red-900 flex items-center gap-1.5"><ShieldAlert className="w-5 h-5" />帳戶停用中</div>
            <div className="text-sm text-red-900">
              因為有一次冇出現，帳戶停用到 {new Date(user.bannedUntil!).toLocaleDateString("zh-HK")}。期間可以睇，但唔可以出 post、接 post 同傾偈。
            </div>
            {appeal ? (
              <div className="text-sm bg-white rounded-xl p-3">
                {appeal.status === "rejected" ? "申訴審核咗，維持停用。" : `申訴已提交（${fmtAgo(appeal.at, now)}），人手審核緊。`}
              </div>
            ) : canAppeal ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold">覺得被誤會？48 小時內可以申訴：</div>
                <textarea
                  value={appealText}
                  onChange={(e) => setAppealText(e.target.value.slice(0, 300))}
                  placeholder="例如：電話冇電／停車場收唔到 GPS／對方冇去"
                  className="w-full min-h-24 rounded-xl border border-red-200 bg-white p-3 text-sm outline-none"
                />
                <button
                  disabled={appealText.trim().length < 5}
                  onClick={() =>
                    aah.submitAppeal(appealText.trim()).then(
                      () => toast.success("已提交申訴"),
                      (e) => toast.error(aahErrorText(e)),
                    )
                  }
                  className="w-full h-11 rounded-2xl bg-red-700 text-white font-bold disabled:opacity-40"
                >
                  提交申訴
                </button>
              </div>
            ) : (
              <div className="text-xs text-red-800">申訴期（48 小時）已經過咗。</div>
            )}
          </div>
        )}

        {/* 進行中 */}
        <section className="space-y-2">
          <div className="font-bold">進行中</div>
          {activeMatches.length === 0 && myOpenPosts.length === 0 ? (
            <div className="bg-card rounded-2xl p-5 text-sm text-muted-foreground text-center">
              暫時冇。<Link to="/" className="underline font-semibold">去睇吓附近嘅着數</Link>
            </div>
          ) : (
            <>
              {activeMatches.map((m) => (
                <Link key={m.id} to="/match/$matchId" params={{ matchId: m.id }} className="flex items-center gap-3 bg-card rounded-2xl p-4 shadow-[var(--shadow-card)] border-l-[6px]" style={{ borderLeftColor: SCENARIOS[m.scenario].color }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5"><ScenarioTag scenario={m.scenario} /><span className="text-[11px] font-bold text-[#E8642A]">配對中</span></div>
                    <div className="font-bold mt-1 truncate">{m.shop}・{m.meetPlace} {fmtClock(m.meetAt)}</div>
                    <div className="text-xs text-muted-foreground">同 {m.participants.filter((p) => p.userId !== user.id).map((p) => p.name).join("、")}</div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </Link>
              ))}
              {myOpenPosts.map((p) => (
                <Link key={p.id} to="/post/$postId" params={{ postId: p.id }} className="flex items-center gap-3 bg-card rounded-2xl p-4 shadow-[var(--shadow-card)] border-l-[6px]" style={{ borderLeftColor: SCENARIOS[p.scenario].color }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5"><ScenarioTag scenario={p.scenario} direction={p.direction} /><span className="text-[11px] text-muted-foreground">等緊有人接</span></div>
                    <div className="font-bold mt-1 truncate">{p.shop}・{p.mallName}</div>
                    <div className="text-xs text-muted-foreground">{p.interests.filter((i) => i.status === "pending").length} 人有興趣・{fmtClock(p.leaveAt)} 過期</div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </Link>
              ))}
            </>
          )}
        </section>

        {/* 紀錄 */}
        {(pastMatches.length > 0 || myOldPosts.length > 0) && (
          <section className="space-y-2">
            <div className="font-bold">紀錄</div>
            {pastMatches.map((m) => (
              <Link key={m.id} to="/match/$matchId" params={{ matchId: m.id }} className="flex items-center justify-between bg-card rounded-2xl px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{SCENARIOS[m.scenario].emoji} {m.shop}・{m.mallName}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtAgo(m.createdAt, now)}{m.rated ? (m.rated === "up" ? "・👍" : "・👎") : ""}</div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{STATUS_LABEL[m.status]}</span>
              </Link>
            ))}
            {myOldPosts.map((p) => (
              <Link key={p.id} to="/post/$postId" params={{ postId: p.id }} className="flex items-center justify-between bg-card rounded-2xl px-4 py-3">
                <div className="text-sm font-semibold truncate">{SCENARIOS[p.scenario].emoji} {p.shop}・{p.mallName}</div>
                <span className="text-xs text-muted-foreground shrink-0">{p.status === "expired" ? "已過期" : "已取消"}</span>
              </Link>
            ))}
          </section>
        )}

        {/* 設定 */}
        <section className="bg-card rounded-2xl p-4 space-y-4">
          <div className="font-bold">通知</div>
          <PushSettingRow />
          <div className="flex flex-wrap gap-2">
            {SCENARIO_LIST.map((id) => {
              const on = user.notifyCats.includes(id);
              return (
                <Chip key={id} active={on} onClick={() => aah.updateUser({ notifyCats: on ? user.notifyCats.filter((c) => c !== id) : [...user.notifyCats, id] })}>
                  {SCENARIOS[id].emoji} {SCENARIOS[id].label}
                </Chip>
              );
            })}
          </div>
          <label className="flex items-center justify-between">
            <span className="text-sm">着數通知（到商場時）</span>
            <Switch checked={user.notifyOpportunities} onCheckedChange={(v) => aah.updateUser({ notifyOpportunities: v })} />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm">推廣通知（商戶優惠、廣告）</span>
            <Switch checked={user.notifyPromotions} onCheckedChange={(v) => aah.updateUser({ notifyPromotions: v })} />
          </label>
        </section>

        {(mode === "local" || getSettings().allowTestLocation) && (
        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3 text-sm">
          <div className="font-bold text-amber-900 flex items-center gap-1.5"><DemoBadge />{mode === "local" ? "示範設定" : "試用設定"}</div>
          <button onClick={() => setPickerOpen(true)} className="w-full h-11 rounded-xl bg-white border border-amber-300 font-semibold">
            測試位置：{current.test ? current.mall?.name : current.verified ? `GPS（${current.mall?.name}）` : "未揀"}
          </button>
          {mode === "local" && (
            <button
              onClick={() => {
                aah.resetDemo();
                toast("已重設示範資料");
              }}
              className="w-full h-11 rounded-xl bg-white border border-amber-300 font-semibold"
            >
              重設示範資料
            </button>
          )}
        </section>
        )}

        {mode === "remote" && user.signedIn && (
          <section className="bg-card rounded-2xl p-4 space-y-1">
            <div className="font-bold pb-1">帳戶</div>
            {user.registered && (
              <button onClick={() => { setNickDraft(user.nickname ?? ""); setNickOpen(true); }} className="w-full flex items-center gap-3 py-2.5 text-left">
                <Pencil className="w-4 h-4 text-muted-foreground" />
                <span className="flex-1 text-sm">暱稱</span>
                <span className="text-sm text-muted-foreground">{user.nickname}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            {user.email && (
              <button
                onClick={() =>
                  aah.resetPassword(user.email!).then(
                    () => toast.success("已寄出重設密碼 email", { description: `去 ${user.email} 撳「重設密碼」就可以改` }),
                    (e) => toast.error(aahErrorText(e)),
                  )
                }
                className="w-full flex items-center gap-3 py-2.5 text-left"
              >
                <KeyRound className="w-4 h-4 text-muted-foreground" />
                <span className="flex-1 text-sm">改密碼</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <button
              onClick={() => aah.signOut().then(() => toast("已登出"), (e) => toast.error(aahErrorText(e)))}
              className="w-full flex items-center gap-3 py-2.5 text-left"
            >
              <LogOut className="w-4 h-4 text-muted-foreground" />
              <span className="flex-1 text-sm">登出</span>
            </button>
            <button
              onClick={() => {
                setDelText("");
                setDelOpen(true);
              }}
              className="w-full flex items-center gap-3 py-2.5 text-left text-destructive"
            >
              <Trash2 className="w-4 h-4" />
              <span className="flex-1 text-sm">刪除帳戶</span>
            </button>
          </section>
        )}

        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <Link to="/help" className="underline">常見問題</Link>
          <Link to="/terms" className="underline">服務條款</Link>
          <Link to="/privacy" className="underline">私隱政策</Link>
          <a href="mailto:support@buytime.hk" className="underline">聯絡我們</a>
        </div>
      </div>

      <RegisterSheet open={regOpen} onClose={() => setRegOpen(false)} onDone={() => setRegOpen(false)} />
      <BottomSheet open={delOpen} onClose={() => !delBusy && setDelOpen(false)} title="刪除帳戶">
        <div className="space-y-3 pb-2">
          <div className="bg-red-50 text-red-900 rounded-2xl p-4 text-sm space-y-1.5">
            <div className="font-bold">刪除之後冇得還原：</div>
            <div>・你嘅 email、暱稱、推送裝置同位置紀錄會被清走</div>
            <div>・仲開緊嘅 post 會收埋</div>
            <div>・對方嘅配對紀錄會保留，但你個名同訊息會變做「已刪除」</div>
            <div>・之後可以用同一個 email 重新註冊，但會係一個新帳戶</div>
          </div>
          {activeMatches.length > 0 && (
            <div className="text-sm bg-amber-50 text-amber-900 rounded-xl px-3 py-2">你有進行中嘅配對，完成或者取消咗先可以刪除。</div>
          )}
          <input
            value={delText}
            onChange={(e) => setDelText(e.target.value)}
            placeholder="輸入「刪除」確認"
            className="w-full h-12 px-4 rounded-2xl border border-border bg-background outline-none text-base"
          />
          <button
            disabled={delText.trim() !== "刪除" || delBusy || activeMatches.length > 0}
            onClick={() => {
              setDelBusy(true);
              aah.deleteAccount().then(
                () => {
                  setDelOpen(false);
                  toast.success("帳戶已經刪除", { description: "多謝你用過啱啱好" });
                  navigate({ to: "/" });
                },
                (err) => toast.error(aahErrorText(err)),
              ).finally(() => setDelBusy(false));
            }}
            className="w-full h-12 rounded-2xl bg-red-700 text-white font-bold disabled:opacity-40"
          >
            {delBusy ? "刪除緊…" : "永久刪除我嘅帳戶"}
          </button>
        </div>
      </BottomSheet>
      <BottomSheet open={nickOpen} onClose={() => setNickOpen(false)} title="改暱稱">
        <form
          className="space-y-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nickDraft.trim() || nickBlock || nicknameProblem(nickDraft)) return;
            setNickBusy(true);
            aah.changeNickname(nickDraft).then(
              () => {
                toast.success("已改暱稱");
                setNickOpen(false);
              },
              (err) => toast.error(aahErrorText(err)),
            ).finally(() => setNickBusy(false));
          }}
        >
          {nickBlock ? (
            <div className="text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-2xl px-4 py-3">{nickBlock}</div>
          ) : (
            <>
              <input
                value={nickDraft}
                onChange={(e) => setNickDraft(e.target.value.slice(0, 12))}
                placeholder="暱稱，例如 阿明"
                className="w-full h-12 px-4 rounded-2xl border border-border bg-background outline-none text-base"
              />
              {nickDraft.trim() && nickDraft.trim() !== user.nickname && nicknameProblem(nickDraft) && (
                <div className="text-xs text-destructive">{nicknameProblem(nickDraft)}</div>
              )}
            </>
          )}
          <ul className="text-xs text-muted-foreground space-y-0.5">
            <li>・最多 12 個字，30 日只可以改一次</li>
            <li>・有 post 開緊或者配對緊嗰陣唔改得，免得對方以為等錯人</li>
            <li>・唔可以用「啱啱好」「官方」「客服」呢類字，唔可以有電話號碼</li>
            <li>・已經發佈嘅 post 會保留舊名；完成次數跟帳戶，唔會因為改名而消失</li>
          </ul>
          {!nickBlock && (
            <button
              disabled={nickBusy || !nickDraft.trim() || nickDraft.trim() === user.nickname || !!nicknameProblem(nickDraft)}
              className="w-full h-12 rounded-2xl bg-[#1a1a1a] text-white font-bold disabled:opacity-40"
            >
              {nickBusy ? "儲存緊…" : "儲存"}
            </button>
          )}
        </form>
      </BottomSheet>
      <MallPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        malls={malls}
        currentVerified={current.verified}
        hasTest={!!user.testMallId}
        onPick={(m) => {
          aah.updateUser({ testMallId: m.id });
          setPickerOpen(false);
        }}
        onClear={() => {
          aah.updateUser({ testMallId: null });
          setPickerOpen(false);
        }}
      />
    </AppLayout>
  );
}
