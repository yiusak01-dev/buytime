import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { LiveDot } from "./CatIcon";
import { MallPicker } from "./MallPicker";
import { RegisterSheet } from "./RegisterSheet";
import { aah, useAahState } from "@/lib/aah/store";
import { useAahMalls } from "@/lib/aah/malls";
import { useCurrentMall, useViewMall } from "@/lib/aah/geo";
import { useLivePeople } from "@/lib/aah/live";
import { MUTED, VERBS, type Verb } from "@/lib/aah/theme";

/** 搵／放／夾三頁共用嘅頭：商場掣（即時人數）、登入／我的、三個分頁 */
export function TabHeader({ active }: { active: Verb }) {
  const { user, matches } = useAahState();
  const { malls } = useAahMalls();
  const current = useCurrentMall(malls);
  const view = useViewMall(malls);
  const live = useLivePeople();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [regOpen, setRegOpen] = useState(false);

  const hasActive = useMemo(
    () =>
      matches.some(
        (m) => m.status === "active" && m.participants.some((p) => p.userId === user.id),
      ),
    [matches, user.id],
  );
  const n = live.at(view.mall?.id);
  const label = view.mall
    ? `${view.mall.name}${n ? ` ${n} 人` : ""}`
    : `全港${live.total ? ` ${live.total} 人` : ""}`;

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
          {user.registered ? (
            <Link
              to="/me"
              aria-label={hasActive ? "我的，有進行中嘅配對" : "我的"}
              className="relative w-10 h-10 rounded-full bg-card shadow-[0_4px_12px_rgba(80,40,20,0.08)] grid place-items-center shrink-0"
            >
              <UserRound className="w-5 h-5" />
              {hasActive && (
                <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-[#9A3B0E] ring-2 ring-card" />
              )}
            </Link>
          ) : (
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

      <nav
        aria-label="搵放夾"
        className="grid grid-cols-3 gap-1.5 bg-card rounded-3xl p-1.5 shadow-[var(--shadow-card)]"
      >
        {(["find", "give", "join"] as Verb[]).map((v) => {
          const s = VERBS[v];
          const on = v === active;
          return (
            <Link
              key={v}
              to={s.to}
              aria-current={on ? "page" : undefined}
              className="rounded-[18px] py-1.5 flex flex-col items-center"
              style={on ? { background: s.soft, color: s.text } : { color: MUTED }}
            >
              <span className="text-[22px] font-black leading-tight">{s.word}</span>
              <span className="text-[10.5px] font-bold tracking-tight px-1 text-center leading-tight">
                {s.sub}
              </span>
            </Link>
          );
        })}
      </nav>

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
      <RegisterSheet
        open={regOpen}
        onClose={() => setRegOpen(false)}
        onDone={() => setRegOpen(false)}
      />
    </header>
  );
}
