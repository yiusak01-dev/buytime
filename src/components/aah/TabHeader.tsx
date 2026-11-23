import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { LiveDot } from "./CatIcon";
import { MallPicker } from "./MallPicker";
import { RegisterSheet } from "./RegisterSheet";
import { Onboarding, readHowSeen } from "./Onboarding";
import { aah, useAahState } from "@/lib/aah/store";
import { useAahMalls } from "@/lib/aah/malls";
import { useCurrentMall, useViewMall } from "@/lib/aah/geo";
import { useLivePeople } from "@/lib/aah/live";
import { VERBS, type Verb } from "@/lib/aah/theme";

/** 搵／放兩個版面共用嘅頭：商場掣（即時人數）、未登入就出登入掣；切換頁面用底部列（每頁一樣）；第一次開先出新手教學 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TabHeader({ active }: { active: Verb }) {
  const { user } = useAahState();
  const { malls } = useAahMalls();
  const current = useCurrentMall(malls);
  const view = useViewMall(malls);
  const live = useLivePeople();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [regOpen, setRegOpen] = useState(false);
  const navigate = useNavigate();
  const replay = useRouterState({
    select: (s) => new URLSearchParams(s.location.searchStr).get("how") === "1",
  });
  const [howSeen, setHowSeen] = useState(readHowSeen);
  const showHow = replay || (!howSeen && !user.onboarded);

  const n = live.at(view.mall?.id);
  const label = view.mall
    ? `${view.mall.name}${n ? ` ${n} 人喺度` : ""}`
    : `全港${live.total ? ` ${live.total} 人用緊` : ""}`;

  return (
    <header className="px-4 pt-4 pb-2 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[22px] font-black tracking-tight shrink-0">啱啱好</span>
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-label={`轉商場，而家睇緊${view.mall?.name ?? "全港"}`}
            data-testid="mall-chip"
            className="h-9 px-3 rounded-full bg-card shadow-[0_4px_12px_rgba(80,40,20,0.08)] text-[13px] font-bold flex items-center gap-1.5 min-w-0"
          >
            <LiveDot />
            <span className="truncate max-w-[10rem]">{label}</span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          </button>
          {!user.registered && (
            <button
              type="button"
              onClick={() => setRegOpen(true)}
              className="h-9 px-4 rounded-full text-[13px] font-black text-white shrink-0"
              style={{ background: VERBS.find.strong }}
            >
              登入
            </button>
          )}
        </div>
      </div>

      <MallPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        malls={malls}
        currentVerified={current.verified}
        onPick={(m) => {
          aah.updateUser({ testMallId: m.id });
          setPickerOpen(false);
        }}
        onClear={() => {
          aah.updateUser({ testMallId: null });
          setPickerOpen(false);
        }}
        hasTest={!!user.testMallId}
      />
      {showHow && (
        <Onboarding
          onDone={() => {
            setHowSeen(true);
            if (replay) navigate({ to: ".", search: {}, replace: true });
          }}
        />
      )}
      <RegisterSheet
        open={regOpen}
        onClose={() => setRegOpen(false)}
        onDone={() => setRegOpen(false)}
      />
    </header>
  );
}
