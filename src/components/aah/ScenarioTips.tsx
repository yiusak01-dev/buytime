import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { SCENARIOS } from "@/lib/aah/scenarios";
import { discountedRate, mallDiningExtra } from "@/lib/aah/pricing";
import type { AahMall, ScenarioId } from "@/lib/aah/types";

/**
 * 交收前要知：按場景同角色（俾嘢／接收）顯示規則提示；泊車另外顯示商場換泊車條件（參考）。
 * 預設顯示頭兩項，撳「睇晒」展開。
 */
export function ScenarioTips({
  scenario,
  role,
  mall,
  title,
}: {
  scenario: ScenarioId;
  role: "giver" | "taker";
  mall?: AahMall | null;
  title?: string;
}) {
  const s = SCENARIOS[scenario];
  const tips = s.tips[role];
  const [open, setOpen] = useState(false);
  const shown = open ? tips : tips.slice(0, 2);
  const cond = scenario === "parking" && mall && (mall.condWeekday || mall.condWeekend);
  const disc = cond ? discountedRate(mall!.condWeekday) ?? discountedRate(mall!.condWeekend) : null;
  const extra = cond ? mallDiningExtra(mall) : null;

  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-950 rounded-2xl px-4 py-3 text-sm space-y-2">
      <div className="font-bold flex items-center gap-1.5">
        <Info className="w-4 h-4" />
        {title ?? "交收前要知"}
      </div>
      {cond && (
        <div className="bg-white/70 rounded-xl px-3 py-2 text-[13px] leading-relaxed">
          <div className="font-semibold">{mall!.name} 換泊車條件（參考）</div>
          {mall!.condWeekday && <div>平日：{mall!.condWeekday}</div>}
          {mall!.condWeekend && mall!.condWeekend !== mall!.condWeekday && <div>週末及假期：{mall!.condWeekend}</div>}
          {disc != null && <div className="font-semibold mt-0.5">換到嘅鐘數唔係免費：每個鐘仲要俾停車場 ${disc}。</div>}
          {extra != null && <div className="font-semibold">有食肆（餐廳）單額外多換 {extra} 個鐘：幾張單加埋夠數（一般最多 2 張），其中一張係食肆單都得。</div>}
          {mall!.stacking && !mall!.stacking.includes("待確認") && <div>拼單：{mall!.stacking}</div>}
          <div className="text-[11px] text-amber-800 mt-0.5">以商場最新公布為準</div>
        </div>
      )}
      <ul className="space-y-1.5 text-[13px] leading-relaxed">
        {shown.map((t) => (
          <li key={t} className="flex gap-1.5">
            <span className="shrink-0">・</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
      {tips.length > 2 && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold underline inline-flex items-center gap-0.5">
          {open ? "收埋" : `睇晒 ${tips.length} 項`}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
      <div className="text-[11px] text-amber-800">以上係一般提示，商場同商戶規則隨時會改，以佢哋最新規定為準。平台只係俾大家配對，交收風險要雙方自己衡量。</div>
    </div>
  );
}
