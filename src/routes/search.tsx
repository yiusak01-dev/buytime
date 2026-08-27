import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { ReceiptCard } from "@/components/ReceiptCard";
import { ReceiptDetailSheet } from "@/components/ReceiptDetailSheet";
import { DistrictFilter } from "@/components/DistrictFilter";
import { useMalls, useReceipts } from "@/lib/queries";
import { useMemo, useState } from "react";
import type { ReceiptWithMall } from "@/lib/types";
import { mallDistrict, type District } from "@/lib/districts";
import { Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "搜尋收據 · 買時間" }] }),
  component: SearchPage,
});

function SearchPage() {
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState<District | null>(null);
  const [mallId, setMallId] = useState<string | null>(null);
  const [maxPriceCap, setMaxPriceCap] = useState<number | null>(null);
  const [selected, setSelected] = useState<ReceiptWithMall | null>(null);
  const [open, setOpen] = useState(false);
  const { data: malls = [] } = useMalls();
  const { data: receipts = [] } = useReceipts();

  const mallsInDistrict = useMemo(
    () => (district ? malls.filter((m) => mallDistrict(m.name) === district) : malls),
    [malls, district],
  );

  const filtered = useMemo(() => {
    return receipts.filter((r) => {
      if (district && mallDistrict(r.mall.name) !== district) return false;
      if (mallId && r.mall_id !== mallId) return false;
      if (maxPriceCap != null && r.listing_price > maxPriceCap) return false;
      if (q && !`${r.mall.name}${r.shop_name}`.includes(q)) return false;
      return true;
    });
  }, [receipts, district, mallId, maxPriceCap, q]);

  return (
    <AppLayout title="🔍 搜尋收據" subtitle="快速搵到你需要的免費泊車">
      <div className="px-4 pt-4 space-y-4">
        <div className="flex items-center gap-2 bg-card rounded-xl px-3 py-2.5 shadow-[var(--shadow-card)]">
          <SearchIcon className="w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="商場、商戶..."
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
        </div>

        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">地區</div>
          <DistrictFilter
            value={district}
            onChange={(d) => {
              setDistrict(d);
              setMallId(null);
            }}
          />
        </div>

        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">商場</div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
            <Chip active={mallId === null} onClick={() => setMallId(null)}>
              全部
            </Chip>
            {mallsInDistrict.map((m) => (
              <Chip
                key={m.id}
                active={mallId === m.id}
                onClick={() => setMallId(mallId === m.id ? null : m.id)}
              >
                {m.icon_emoji} {m.name}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">最高價錢</div>
          <div className="flex gap-2 flex-wrap">
            {[null, 10, 15, 25, 40].map((p, i) => (
              <Chip key={i} active={maxPriceCap === p} onClick={() => setMaxPriceCap(p)}>
                {p == null ? "不限" : `≤ HK$${p}`}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-sm font-semibold">{filtered.length} 個結果</span>
        </div>

        <div className="space-y-3 pb-6">
          {filtered.map((r) => (
            <ReceiptCard
              key={r.id}
              receipt={r}
              onClick={() => {
                setSelected(r);
                setOpen(true);
              }}
            />
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              未有符合條件的收據
            </div>
          )}
        </div>
      </div>
      <ReceiptDetailSheet receipt={selected} open={open} onOpenChange={setOpen} />
    </AppLayout>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground border-border",
      )}
    >
      {children}
    </button>
  );
}
