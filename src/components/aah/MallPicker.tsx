import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { BottomSheet } from "./ui";
import { useGeo } from "@/lib/aah/geo";
import { distanceM, fmtDistance, hotMalls, nearestMalls, trafficLabel, useLiveCounts } from "@/lib/aah/malls";
import { testLocationAllowed } from "@/lib/aah/store";
import type { AahMall } from "@/lib/aah/types";

/**
 * 揀商場：冇搜尋時分三段 —— 附近（最近 5 個）、熱門（而家有着數嘅先，之後人流高嘅）、其他（按距離）。
 * 有搜尋就淨係列出符合嘅商場。
 */
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
  const counts = useLiveCounts();
  const [q, setQ] = useState("");
  const here = geo.status === "ok" && geo.lat != null && geo.lng != null ? { lat: geo.lat, lng: geo.lng } : null;
  const dist = (m: AahMall) => (here ? distanceM(here.lat, here.lng, m.lat, m.lng) : -1);

  const sections = useMemo(() => {
    const s = q.trim().toLowerCase();
    const byDistance = here
      ? nearestMalls(malls, here.lat, here.lng, malls.length)
      : [...malls].sort((a, b) => a.name.localeCompare(b.name, "zh-HK"));
    if (s) {
      return [{ title: null as string | null, items: byDistance.filter((m) => m.name.toLowerCase().includes(s) || (m.district ?? "").toLowerCase().includes(s)) }];
    }
    const near = here ? byDistance.slice(0, 5) : [];
    const used = new Set(near.map((m) => m.id));
    const hot = hotMalls(malls, counts, here).filter((m) => !used.has(m.id));
    hot.forEach((m) => used.add(m.id));
    const rest = byDistance.filter((m) => !used.has(m.id));
    return [
      ...(near.length ? [{ title: "附近", items: near }] : []),
      ...(hot.length ? [{ title: "熱門", items: hot }] : []),
      { title: here ? "其他商場（按距離）" : "全部商場", items: rest },
    ];
  }, [malls, counts, here?.lat, here?.lng, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const testing = testLocationAllowed();
  return (
    <BottomSheet open={open} onClose={onClose} title={testing ? "揀測試位置" : "睇其他商場"}>
      <div className="space-y-3 pb-2">
        <p className="text-xs text-muted-foreground">
          {currentVerified
            ? "GPS 已經確認你喺商場，會優先用真實位置。"
            : testing
              ? "試用期間可以揀一個商場扮自己喺嗰度，試吓成個流程。"
              : "揀一個商場睇吓而家有咩着數。要出 post 或者接，就要去到商場（出 post 嘅人開咗「接受去緊嘅人」，就可以喺路上接）。"}
        </p>
        <div className="flex items-center gap-2 border border-border rounded-2xl px-3 h-11">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋商場或者地區" className="flex-1 bg-transparent outline-none text-sm" />
        </div>
        {sections.map((sec, i) => (
          <div key={sec.title ?? i}>
            {sec.title && <div className="text-xs font-bold text-muted-foreground pt-2">{sec.title}</div>}
            {sec.items.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">搵唔到相關商場</div>
            ) : (
              <div className="divide-y divide-border">
                {sec.items.map((m) => {
                  const n = counts.get(m.id) ?? 0;
                  const t = trafficLabel(m.traffic);
                  const d = dist(m);
                  return (
                    <button key={m.id} onClick={() => onPick(m)} className="w-full py-3 flex items-center justify-between gap-3 text-left">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{m.name}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                          {m.district && <span>{m.district}</span>}
                          {n > 0 && <span className="font-bold text-[#E8642A]">🔥 而家有 {n} 個着數</span>}
                          {t && <span>{t}</span>}
                        </div>
                      </div>
                      {d >= 0 && <div className="text-xs text-muted-foreground shrink-0">{fmtDistance(d)}</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {hasTest && (
          <button onClick={onClear} className="w-full h-11 rounded-2xl border border-border text-sm font-semibold">
            {testing ? "取消測試位置" : "返去用 GPS 位置"}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
