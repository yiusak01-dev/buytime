import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, TimerOff, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { aah, useAahState } from "@/lib/aah/store";
import { geoStore, useCurrentMall } from "@/lib/aah/geo";
import { useAahMalls } from "@/lib/aah/malls";
import { SCENARIOS, SCENARIO_LIST } from "@/lib/aah/scenarios";
import { Chip } from "@/components/aah/ui";
import { MallPicker } from "@/components/aah/MallPicker";

export const Route = createFileRoute("/welcome")({
  head: () => ({ meta: [{ title: "歡迎 · 啱啱好" }] }),
  component: Welcome,
});

function Welcome() {
  const navigate = useNavigate();
  const { user } = useAahState();
  const { malls } = useAahMalls();
  const current = useCurrentMall(malls);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [gpsResult, setGpsResult] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  function finish() {
    aah.updateUser({ onboarded: true });
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="app-shell min-h-screen bg-[#F5C518] text-[#1a1a1a] flex flex-col">
      <div className="px-6 pt-10 pb-6">
        <div className="flex items-center gap-1.5">
          <span className="text-3xl font-black tracking-tight">啱啱好</span>
          <span className="w-2 h-2 rounded-full bg-[#E8642A] -mt-4" />
        </div>
        <div className="mt-2 text-sm font-semibold text-[#1a1a1a]/70">啱時間・啱地方・啱啱好</div>
      </div>

      <div className="flex-1 bg-background text-foreground rounded-t-[32px] px-6 pt-7 pb-10 space-y-6">
        {step === 1 && (
          <>
            <div>
              <h1 className="text-2xl font-black leading-snug">啱啱好要用你嘅位置</h1>
              <p className="text-sm text-muted-foreground mt-1">咁先可以將同一個商場、同一時間嘅人即時配對。</p>
            </div>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <ShieldCheck className="w-6 h-6 text-[#2E9E6A] shrink-0" />
                <div>
                  <div className="font-bold">證明你真係喺度</div>
                  <div className="text-sm text-muted-foreground">對方見到「已確認喺場」，先放心同你約。</div>
                </div>
              </li>
              <li className="flex gap-3">
                <TimerOff className="w-6 h-6 text-[#3D7BE0] shrink-0" />
                <div>
                  <div className="font-bold">你走咗，post 自動取消</div>
                  <div className="text-sm text-muted-foreground">唔會有人白行一趟。</div>
                </div>
              </li>
              <li className="flex gap-3">
                <Sparkles className="w-6 h-6 text-[#E8642A] shrink-0" />
                <div>
                  <div className="font-bold">一到商場就話你知</div>
                  <div className="text-sm text-muted-foreground">附近有咩着數，即刻知。</div>
                </div>
              </li>
            </ul>
            <p className="text-[11px] text-muted-foreground">
              對方只會見到你喺邊個商場，唔會見到你嘅確實位置。位置紀錄用完就刪。
            </p>
            {gpsResult && <p className="text-sm text-destructive">{gpsResult}</p>}
            <button
              disabled={asking}
              onClick={async () => {
                setAsking(true);
                const r = await geoStore.start();
                setAsking(false);
                if (r === "ok") setStep(2);
                else setGpsResult(r === "denied" ? "你冇俾定位權限。冇定位都可以睇，但唔可以出 post 同接 post；可以之後喺瀏覽器或者手機設定再開。" : "搵唔到你嘅位置，可以遲啲再試。");
              }}
              className="w-full h-13 py-3.5 rounded-2xl bg-[#1a1a1a] text-white font-bold disabled:opacity-50"
            >
              {asking ? "搵緊你嘅位置…" : "開啟定位"}
            </button>
            {gpsResult && (
              <button onClick={() => setStep(2)} className="w-full py-3 rounded-2xl border border-border font-semibold">
                住先，淨係睇
              </button>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h1 className="text-2xl font-black leading-snug">想收邊類通知？</h1>
              <p className="text-sm text-muted-foreground mt-1">之後可以喺「我的配對」改。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SCENARIO_LIST.map((id) => {
                const on = user.notifyCats.includes(id);
                return (
                  <Chip
                    key={id}
                    active={on}
                    onClick={() => aah.updateUser({ notifyCats: on ? user.notifyCats.filter((c) => c !== id) : [...user.notifyCats, id] })}
                  >
                    {SCENARIOS[id].emoji} {SCENARIOS[id].label}
                  </Chip>
                );
              })}
            </div>
            <div className="space-y-3 bg-card rounded-2xl p-4">
              <label className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-sm">着數通知</div>
                  <div className="text-xs text-muted-foreground">到商場時話你知附近有咩着數</div>
                </div>
                <Switch checked={user.notifyOpportunities} onCheckedChange={(v) => aah.updateUser({ notifyOpportunities: v })} />
              </label>
              <label className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-sm">推廣通知</div>
                  <div className="text-xs text-muted-foreground">商戶優惠同廣告，要你另外同意先會收到</div>
                </div>
                <Switch checked={user.notifyPromotions} onCheckedChange={(v) => aah.updateUser({ notifyPromotions: v })} />
              </label>
            </div>
            <button onClick={() => (current.mall ? finish() : setStep(3))} className="w-full py-3.5 rounded-2xl bg-[#1a1a1a] text-white font-bold">
              下一步
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h1 className="text-2xl font-black leading-snug">你而家唔喺任何商場</h1>
              <p className="text-sm text-muted-foreground mt-1">
                示範期間可以揀一個商場做測試位置，試吓出 post、配對、見面成個流程。
              </p>
            </div>
            <button onClick={() => setPickerOpen(true)} className="w-full py-3.5 rounded-2xl bg-[#1a1a1a] text-white font-bold">
              揀測試位置
            </button>
            <button onClick={finish} className="w-full py-3 rounded-2xl border border-border font-semibold">
              淨係睇住先
            </button>
            <MallPicker
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              malls={malls}
              currentVerified={false}
              hasTest={!!user.testMallId}
              onPick={(m) => {
                aah.updateUser({ testMallId: m.id });
                setPickerOpen(false);
                finish();
              }}
              onClear={() => aah.updateUser({ testMallId: null })}
            />
          </>
        )}
      </div>
    </div>
  );
}
