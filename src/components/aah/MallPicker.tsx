import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { BottomSheet } from "./ui";
import { useGeo } from "@/lib/aah/geo";
import { nearestMalls } from "@/lib/aah/malls";
import { testLocationAllowed } from "@/lib/aah/store";
import type { AahMall } from "@/lib/aah/types";

export function MallPicker({
  open,
  onClose,
  malls,
  onPick,
  onClear,
  hasTest,
  currentVerified,
}: {
  open: boolean;
  onClose: () => void;
  malls: AahMall[];
  onPick: (m: AahMall) => void;
  onClear: () => void;
  hasTest: boolean;
  currentVerified: boolean;
}) {
  const geo = useGeo();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const base =
      geo.status === "ok" && geo.lat != null && geo.lng != null
        ? nearestMalls(malls, geo.lat, geo.lng, malls.length)
        : [...malls].sort((a, b) => a.name.localeCompare(b.name, "zh-HK")).map((m) => ({ ...m, distance: -1 }));
    const s = q.trim().toLowerCase();
    return s ? base.filter((m) => m.name.toLowerCase().includes(s) || m.district.toLowerCase().includes(s)) : base;
  }, [malls, geo.status, geo.lat, geo.lng, q]);

  const testing = testLocationAllowed();
  return (
    <BottomSheet open={open} onClose={onClose} title={testing ? "揀測試位置" : "睇其他商場"}>
      <div className="space-y-3 pb-2">
        <p className="text-xs text-muted-foreground">
          {currentVerified
            ? "GPS 已經確認你喺商場，會優先用真實位置。"
            : testing
              ? "試用期間可以揀一個商場扮自己喺嗰度，試吓成個流程。"
              : "揀一個商場睇吓而家有咩着數。要出 post 或者接，就要去到商場，等 GPS 確認。"}
        </p>
        <div className="flex items-center gap-2 border border-border rounded-2xl px-3 h-11">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋商場或者地區" className="flex-1 bg-transparent outline-none text-sm" />
        </div>
        <div className="divide-y divide-border">
          {list.slice(0, 40).map((m) => (
            <button key={m.id} onClick={() => onPick(m)} className="w-full py-3 flex items-center justify-between text-left">
              <div>
                <div className="font-semibold text-sm">{m.name}</div>
                <div className="text-[11px] text-muted-foreground">{m.district}</div>
              </div>
              {m.distance >= 0 && (
                <div className="text-xs text-muted-foreground">{m.distance < 1000 ? `${Math.round(m.distance)} 米` : `${(m.distance / 1000).toFixed(1)} 公里`}</div>
              )}
            </button>
          ))}
        </div>
        {hasTest && (
          <button onClick={onClear} className="w-full h-11 rounded-2xl border border-border text-sm font-semibold">
            {testing ? "取消測試位置" : "返去用 GPS 位置"}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
