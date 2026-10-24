import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronRight, Gift, Pin, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { AppLayout } from "@/components/AppLayout";
import { Chip, DemoBadge, ScenarioTag } from "@/components/aah/ui";
import { RegisterSheet } from "@/components/aah/RegisterSheet";
import { MallPicker } from "@/components/aah/MallPicker";
import { aah, useAahState, isBanned, DAY, BAN_DAYS } from "@/lib/aah/store";
import { POINTS, levelOf } from "@/lib/aah/points";
import { useAahMalls } from "@/lib/aah/malls";
import { useCurrentMall, useNow, fmtClock, fmtAgo } from "@/lib/aah/geo";
import { SCENARIOS, SCENARIO_LIST } from "@/lib/aah/scenarios";

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

  const myMatches = useMemo(() => matches.filter((m) => m.participants.some((p) => p.userId === user.id)), [matches, user.id]);
  const activeMatches = myMatches.filter((m) => m.status === "active");
  const pastMatches = myMatches.filter((m) => m.status !== "active");
  const myOpenPosts = posts.filter((p) => p.authorId === user.id && p.status === "open" && p.leaveAt > now);
  const myOldPosts = posts.filter((p) => p.authorId === user.id && (p.status === "expired" || p.status === "cancelled")).slice(0, 10);

  const lv = levelOf(user.lifetimePoints);
  const banned = isBanned(user, now);
  const banStart = user.bannedUntil ? user.bannedUntil - BAN_DAYS * DAY : 0;
  const canAppeal = banned && now - banStart < 2 * DAY && !user.appeal;
  const accountDays = user.registeredAt ? Math.floor((now - user.registeredAt) / DAY) : 0;
  const voucherPending = user.voucherRequests.filter((v) => v.status === "pending").length;

  return (
    <AppLayout>
      <header className="bg-[#F5C518] text-[#1a1a1a] px-5 pt-6 pb-5 rounded-b-[28px] space-y-3">
        <div className="text-[22px] font-black">我的配對</div>
        {user.registered ? (
          <div className="flex items-center justify-between bg-white/60 rounded-2xl px-4 py-3">
            <div>
              <div className="font-black text-lg">{user.nickname}</div>
              <div className="text-xs opacity-70">{user.phone?.replace(/(\+852)(\d{4})(\d{4})/, "$1 $2 ••••")}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold">{lv.badge} {lv.label}</div>
              <div className="text-[11px] opacity-70">完成 {user.completed} 次</div>
            </div>
          </div>
        ) : (
          <button onClick={() => setRegOpen(true)} className="w-full flex items-center justify-between bg-white/60 rounded-2xl px-4 py-3 text-left">
            <div>
              <div className="font-black">未註冊</div>
              <div className="text-xs opacity-70">用香港手機號碼註冊，30 秒搞掂</div>
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
            {user.appeal ? (
              <div className="text-sm bg-white rounded-xl p-3">申訴已提交（{fmtAgo(user.appeal.at, now)}），人手審核緊。</div>
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
                  onClick={() => {
                    aah.submitAppeal(appealText.trim());
                    toast.success("已提交申訴");
                  }}
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

        {/* 積分 */}
        <section className="bg-card rounded-2xl p-4 space-y-3 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <div className="font-bold">積分</div>
            <div className="text-2xl font-black">{user.points} 分</div>
          </div>
          {lv.next && (
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-accent overflow-hidden">
                <div className="h-full bg-[#F5C518]" style={{ width: `${Math.min(100, (user.lifetimePoints / lv.next.min) * 100)}%` }} />
              </div>
              <div className="text-[11px] text-muted-foreground">再儲 {lv.next.min - user.lifetimePoints} 分升做 {lv.next.badge} {lv.next.label}</div>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            完成交收儲分：有嘢俾人 {POINTS.giver} 分、接收 {POINTS.taker} 分、夾單每人 {POINTS.groupbuy} 分。同一對人一星期內唔重複計分，每日最多 {POINTS.dailyCap} 分。
          </div>
          <button
            onClick={() => (aah.redeemPin() ? toast.success("換咗 1 次置頂") : toast.error(`要 ${POINTS.pinCost} 分先換到`))}
            className="w-full rounded-2xl border border-border flex items-center gap-3 px-4 py-3 text-left"
          >
            <Pin className="w-5 h-5 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-sm">{POINTS.pinCost} 分換 1 次置頂</span>
              <span className="block text-xs text-muted-foreground">你有 {user.pinCredits} 次</span>
            </span>
          </button>
          <button
            onClick={() => {
              if (!user.registered) return setRegOpen(true);
              if (accountDays < POINTS.voucherMinAccountDays) return toast.error(`帳戶要用夠 ${POINTS.voucherMinAccountDays} 日先可以換禮券`, { description: `你已經用咗 ${accountDays} 日` });
              if (aah.requestVoucher()) toast.success("已提交換領申請", { description: "人手審核後會用短訊通知你" });
              else toast.error(`要 ${POINTS.voucherCost} 分先換到`);
            }}
            className="w-full rounded-2xl border border-border flex items-center gap-3 px-4 py-3 text-left"
          >
            <Gift className="w-5 h-5 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-sm">{POINTS.voucherCost.toLocaleString()} 分換 ${POINTS.voucherValue} 百佳電子禮券</span>
              <span className="block text-xs text-muted-foreground">每月限量 {POINTS.voucherMonthlyQuota} 張・帳戶要用夠 {POINTS.voucherMinAccountDays} 日</span>
            </span>
          </button>
          {voucherPending > 0 && <div className="text-xs text-muted-foreground">有 {voucherPending} 張禮券審核緊</div>}
          <div className="text-[11px] text-muted-foreground">積分唔可以換現金、唔可以轉俾人。冇出現扣 {POINTS.noShowPenalty} 分。</div>
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

        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3 text-sm">
          <div className="font-bold text-amber-900 flex items-center gap-1.5"><DemoBadge />示範設定</div>
          <button onClick={() => setPickerOpen(true)} className="w-full h-11 rounded-xl bg-white border border-amber-300 font-semibold">
            測試位置：{current.test ? current.mall?.name : current.verified ? `GPS（${current.mall?.name}）` : "未揀"}
          </button>
          <button
            onClick={() => {
              aah.resetDemo();
              toast("已重設示範資料");
            }}
            className="w-full h-11 rounded-xl bg-white border border-amber-300 font-semibold"
          >
            重設示範資料
          </button>
        </section>

        <div className="flex justify-center gap-4 text-xs text-muted-foreground">
          <Link to="/terms" className="underline">使用條款</Link>
          <Link to="/privacy" className="underline">私隱政策</Link>
        </div>
      </div>

      <RegisterSheet open={regOpen} onClose={() => setRegOpen(false)} onDone={() => setRegOpen(false)} />
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
