import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Tag, Calendar, ChevronRight, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/offers")({
  head: () => ({
    meta: [
      { title: "優惠 · 啱啱好" },
      { name: "description", content: "轉讓未用優惠券、折扣碼、禮品券" },
    ],
  }),
  component: OffersPage,
});

type OfferCategory = "all" | "voucher" | "coupon" | "gift" | "membership";

const MOCK_OFFERS = [
  {
    id: "1",
    category: "voucher" as const,
    title: "HKTVmall HK$100 現金券",
    brand: "HKTVmall",
    faceValue: 100,
    price: 75,
    expiryDate: "2026-12-31",
    usageNote: "滿 HK$300 可用",
    emoji: "🛒",
    condition: "全新未用",
  },
  {
    id: "2",
    category: "coupon" as const,
    title: "Pizza Hut 8折優惠碼",
    brand: "Pizza Hut",
    faceValue: null,
    discount: "8折",
    price: 20,
    expiryDate: "2026-11-30",
    usageNote: "外賣自取適用",
    emoji: "🍕",
    condition: "未使用",
  },
  {
    id: "3",
    category: "gift" as const,
    title: "一田超市 HK$200 禮品卡",
    brand: "一田超市",
    faceValue: 200,
    price: 160,
    expiryDate: "2027-03-31",
    usageNote: "全線分店適用",
    emoji: "🎁",
    condition: "全新未用",
  },
  {
    id: "4",
    category: "membership" as const,
    title: "Pure Yoga 單堂體驗課",
    brand: "Pure Yoga",
    faceValue: 380,
    price: 120,
    expiryDate: "2026-12-31",
    usageNote: "新會員適用，全港分店",
    emoji: "🧘",
    condition: "未使用",
  },
  {
    id: "5",
    category: "voucher" as const,
    title: "屈臣氏 HK$50 現金券",
    brand: "屈臣氏",
    faceValue: 50,
    price: 38,
    expiryDate: "2026-10-31",
    usageNote: "不設找贖",
    emoji: "💊",
    condition: "全新未用",
  },
];

function formatExpiry(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "已過期";
  if (diffDays <= 7) return `⚠️ ${diffDays}日後到期`;
  if (diffDays <= 30) return `${diffDays}日後到期`;
  const month = d.toLocaleDateString("zh-HK", { year: "numeric", month: "long", day: "numeric" });
  return `有效至 ${month}`;
}

function savingsPct(face: number | null, price: number) {
  if (!face || face <= 0) return null;
  return Math.round((1 - price / face) * 100);
}

export function OffersPage() {
  const [category, setCategory] = useState<OfferCategory>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = MOCK_OFFERS.filter((o) => {
    if (category !== "all" && o.category !== category) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!o.title.toLowerCase().includes(q) && !o.brand.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const selected = MOCK_OFFERS.find((o) => o.id === selectedId) ?? null;

  return (
    <AppLayout>
      {/* Header */}
      <header className="px-4 pt-5 pb-4 bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-b-3xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-white/70">🎟️ 優惠</div>
            <div className="text-xl font-bold mt-0.5">優惠券 · 禮品卡</div>
            <div className="text-[11px] text-white/80 mt-0.5">未用優惠轉讓，慳錢互助</div>
          </div>
          <button
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition-colors rounded-full px-3 py-1.5 text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> 放售
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {([
            { key: "all", label: "全部" },
            { key: "voucher", label: "💳 現金券" },
            { key: "coupon", label: "🏷️ 折扣碼" },
            { key: "gift", label: "🎁 禮品卡" },
            { key: "membership", label: "👑 會員券" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={cn(
                "shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors",
                category === key
                  ? "bg-white text-purple-600"
                  : "bg-white/20 text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 pt-5 space-y-4">
        {/* Search */}
        <div className="flex items-center gap-2 bg-card rounded-xl px-3 py-2.5 shadow-[var(--shadow-card)]">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋品牌、優惠名稱…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Info banner */}
        <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 rounded-xl px-3 py-2.5 flex gap-2 items-start">
          <Info className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
          <div className="text-xs text-purple-700 dark:text-purple-300">
            優惠券轉讓前請確認品牌允許轉讓。買方以托管方式付款，確認優惠有效後方完成交收。
          </div>
        </div>

        {/* Listings */}
        {filtered.length === 0 ? (
          <div className="bg-card rounded-2xl py-12 px-6 flex flex-col items-center text-center gap-2">
            <div className="text-4xl">🎟️</div>
            <div className="text-sm font-semibold">暫時沒有優惠放售</div>
            <div className="text-xs text-muted-foreground">你有未用優惠？放出嚟互相幫忙！</div>
            <Button size="sm" className="mt-2 bg-purple-600 hover:bg-purple-700">
              <Plus className="w-3.5 h-3.5 mr-1" /> 我要放售
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((offer) => {
              const savings = savingsPct(offer.faceValue, offer.price);
              return (
                <button
                  key={offer.id}
                  onClick={() => setSelectedId(offer.id)}
                  className="w-full text-left bg-card rounded-2xl p-4 shadow-[var(--shadow-card)] space-y-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3 items-start flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 grid place-items-center text-xl shrink-0">
                        {offer.emoji}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{offer.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{offer.brand}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-primary">HK${offer.price}</div>
                      {offer.faceValue && (
                        <div className="text-[10px] text-muted-foreground line-through">HK${offer.faceValue}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {savings !== null && savings > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2.5 py-1 rounded-full font-semibold">
                        <Sparkles className="w-3 h-3" /> 慳 {savings}%
                      </span>
                    )}
                    {offer.discount && (
                      <span className="inline-flex items-center gap-1 text-xs bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 px-2.5 py-1 rounded-full font-semibold">
                        <Tag className="w-3 h-3" /> {offer.discount}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" /> {formatExpiry(offer.expiryDate)}
                    </span>
                  </div>

                  {offer.usageNote && (
                    <div className="text-[11px] text-muted-foreground">{offer.usageNote}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail bottom sheet */}
      {selected && (
        <div className="fixed inset-0 z-50" onClick={() => setSelectedId(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-card rounded-t-3xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-border rounded-full mx-auto" />
            <div className="flex gap-3 items-start">
              <div className="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-900/30 grid place-items-center text-3xl shrink-0">
                {selected.emoji}
              </div>
              <div>
                <div className="font-bold text-lg leading-snug">{selected.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{selected.brand} · {selected.condition}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {selected.faceValue && (
                <div className="bg-accent rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">面值</div>
                  <div className="text-xl font-bold mt-0.5">HK${selected.faceValue}</div>
                </div>
              )}
              {selected.discount && (
                <div className="bg-accent rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">折扣</div>
                  <div className="text-xl font-bold mt-0.5">{selected.discount}</div>
                </div>
              )}
              <div className="bg-accent rounded-xl p-3">
                <div className="text-xs text-muted-foreground">到期日</div>
                <div className="text-sm font-semibold mt-0.5">{formatExpiry(selected.expiryDate)}</div>
              </div>
              {selected.usageNote && (
                <div className="bg-accent rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">使用條件</div>
                  <div className="text-sm font-semibold mt-0.5">{selected.usageNote}</div>
                </div>
              )}
            </div>

            <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 rounded-xl p-3 text-xs text-purple-700 dark:text-purple-300">
              💡 平台以托管方式保障買賣雙方。優惠券以實物或電子方式交收，確認可用後方完成交易。
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <div className="text-2xl font-bold text-primary">HK${selected.price}</div>
                {selected.faceValue && (
                  <div className="text-xs text-muted-foreground">
                    原價 HK${selected.faceValue} · 慳 {savingsPct(selected.faceValue, selected.price)}%
                  </div>
                )}
              </div>
              <Button
                className="bg-purple-600 hover:bg-purple-700 text-white px-8"
                onClick={() => setSelectedId(null)}
              >
                我有興趣 <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
