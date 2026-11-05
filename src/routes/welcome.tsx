import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { aah } from "@/lib/aah/store";
import { geoStore } from "@/lib/aah/geo";
import { SCENARIOS } from "@/lib/aah/scenarios";
import { GIVE_CATS, TAGLINE } from "@/lib/aah/copy";
import type { ScenarioId } from "@/lib/aah/types";

export const Route = createFileRoute("/welcome")({
  head: () => ({ meta: [{ title: "歡迎 · 啱啱好" }] }),
  component: Welcome,
});

const EXAMPLES: ScenarioId[] = ["parking", "dining", "offer"];

/**
 * 第一次開 app（例如睇完 IG 廣告）：一頁講明係咩、兩邊有咩着數，撳「開始用」就入去。
 * 「開始用」順手問定位（用嚟搵附近商場）；唔俾都入得去，可以先睇全港。
 */
function Welcome() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    aah.updateUser({ onboarded: true });
    // 唔等定位：問咗就入首頁，結果出咗會自動更新
    void geoStore.start();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="app-shell min-h-screen bg-[#F5C518] text-[#1a1a1a] flex flex-col">
      <div className="px-6 pt-10 pb-6">
        <div className="flex items-center gap-1.5">
          <span className="text-3xl font-black tracking-tight">啱啱好</span>
          <span className="w-2 h-2 rounded-full bg-[#E8642A] -mt-4" />
        </div>
        <h1 className="mt-4 text-[26px] font-black leading-snug">
          {TAGLINE.split("，").map((part, i, arr) => (
            <span key={i} className="block">
              {part}
              {i < arr.length - 1 ? "，" : ""}
            </span>
          ))}
        </h1>
      </div>

      <div className="flex-1 bg-background text-foreground rounded-t-[32px] px-6 pt-7 pb-10 flex flex-col gap-6">
        <ul className="space-y-3">
          {EXAMPLES.map((id) => (
            <li key={id} className="flex items-center gap-3 bg-card rounded-2xl p-4">
              <span className="w-11 h-11 rounded-full grid place-items-center text-xl shrink-0" style={{ background: SCENARIOS[id].soft }} aria-hidden="true">
                {SCENARIOS[id].emoji}
              </span>
              <span className="min-w-0">
                <span className="block font-black leading-snug">{GIVE_CATS[id].head}</span>
                <span className="block text-sm text-muted-foreground">{GIVE_CATS[id].sub}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="text-sm text-muted-foreground">喺商場見面交收，一手交錢一手交貨，平台唔經手錢。</p>

        <div className="mt-auto space-y-2">
          <button onClick={start} disabled={busy} className="w-full py-4 rounded-2xl bg-[#1a1a1a] text-white font-black text-base disabled:opacity-60">
            開始用
          </button>
          <p className="text-[11px] text-muted-foreground text-center">
            會問你攞定位，用嚟搵附近商場；對方只會見到你喺邊個商場。唔俾都可以先睇。
          </p>
        </div>
      </div>
    </div>
  );
}
