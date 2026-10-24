import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Clock, MapPin, Users, ChevronRight, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dining")({
  head: () => ({
    meta: [
      { title: "食飯 · 啱啱好" },
      { name: "description", content: "轉讓餐廳排隊號碼、訂座，唔使等！" },
    ],
  }),
  component: DiningPage,
});

type DiningCategory = "all" | "queue" | "reservation" | "table";

const MOCK_LISTINGS = [
  {
    id: "1",
    type: "queue" as const,
    restaurant: "添好運點心專門店",
    location: "銅鑼灣希慎廣場",
    district: "銅鑼灣",
    queueNum: "A038",
    waitMinutes: 25,
    partySize: 2,
    price: 30,
    postedMins: 5,
    emoji: "🍱",
  },
  {
    id: "2",
    type: "reservation" as const,
    restaurant: "一笼小确幸",
    location: "尖沙咀K11 MUSEA",
    district: "尖沙咀",
    reservationTime: "今晚 7:30pm",
    partySize: 4,
    price: 80,
    postedMins: 12,
    emoji: "🍜",
  },
  {
    id: "3",
    type: "queue" as const,
    restaurant: "鼎泰豐",
    location: "沙田新城市廣場",
    district: "沙田",
    queueNum: "B012",
    waitMinutes: 15,
    partySize: 3,
    price: 20,
    postedMins: 3,
    emoji: "🥟",
  },
  {
    id: "4",
    type: "table" as const,
    restaurant: "稻香超級漁港",
    location: "荃灣愉景新城",
    district: "荃灣",
    reservationTime: "今日 12:00pm",
    partySize: 6,
    price: 50,
    postedMins: 20,
    emoji: "🦐",
  },
];

function timeAgo(mins: number) {
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins} 分鐘前`;
  return `${Math.round(mins / 60)} 小時前`;
}

export function DiningPage() {
  const { t } = useTranslation();
  const [category, setCategory] = useState<DiningCategory>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = MOCK_LISTINGS.filter((l) => {
    if (category !== "all" && l.type !== category) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!l.restaurant.toLowerCase().includes(q) && !l.location.toLowerCase().includes(q) && !l.district.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const selected = MOCK_LISTINGS.find((l) => l.id === selectedId) ?? null;

  return (
    <AppLayout>
      {/* Header */}
      <header className="px-4 pt-5 pb-4 bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-b-3xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-white/70">🍽️ 食飯</div>
            <div className="text-xl font-bold mt-0.5">排隊號碼 · 訂座轉讓</div>
            <div className="text-[11px] text-white/80 mt-0.5">唔使等，即轉即用</div>
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
            { key: "queue", label: "🎫 排隊號" },
            { key: "reservation", label: "📅 訂座" },
            { key: "table", label: "🍽️ 座位" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={cn(
                "shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors",
                category === key
                  ? "bg-white text-orange-600"
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
            placeholder="搜尋餐廳、商場、地區…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Info banner */}
        <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50 rounded-xl px-3 py-2.5 flex gap-2 items-start">
          <Info className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
          <div className="text-xs text-orange-700 dark:text-orange-300">
            排隊號碼於原排隊餐廳有效。買方自行前往餐廳確認號碼可用後完成交收。
          </div>
        </div>

        {/* Listings */}
        {filtered.length === 0 ? (
          <div className="bg-card rounded-2xl py-12 px-6 flex flex-col items-center text-center gap-2">
            <div className="text-4xl">🍽️</div>
            <div className="text-sm font-semibold">暫時沒有食飯放售</div>
            <div className="text-xs text-muted-foreground">係第一個放售排隊號碼或訂座！</div>
            <Button size="sm" className="mt-2 bg-orange-500 hover:bg-orange-600">
              <Plus className="w-3.5 h-3.5 mr-1" /> 我要放售
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((listing) => (
              <button
                key={listing.id}
                onClick={() => setSelectedId(listing.id)}
                className="w-full text-left bg-card rounded-2xl p-4 shadow-[var(--shadow-card)] space-y-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3 items-start flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 grid place-items-center text-xl shrink-0">
                      {listing.emoji}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{listing.restaurant}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{listing.location}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-bold text-primary">HK${listing.price}</div>
                    <div className="text-[10px] text-muted-foreground">{timeAgo(listing.postedMins)}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {listing.type === "queue" && listing.queueNum && (
                    <span className="inline-flex items-center gap-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2.5 py-1 rounded-full font-semibold">
                      🎫 號碼 {listing.queueNum}
                    </span>
                  )}
                  {(listing.type === "reservation" || listing.type === "table") && listing.reservationTime && (
                    <span className="inline-flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full font-semibold">
                      📅 {listing.reservationTime}
                    </span>
                  )}
                  {listing.waitMinutes && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" /> 等 ~{listing.waitMinutes}分鐘
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="w-3 h-3" /> {listing.partySize}人
                  </span>
                </div>
              </button>
            ))}
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
              <div className="w-14 h-14 rounded-2xl bg-orange-100 dark:bg-orange-900/30 grid place-items-center text-3xl shrink-0">
                {selected.emoji}
              </div>
              <div>
                <div className="font-bold text-lg">{selected.restaurant}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {selected.location}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {selected.queueNum && (
                <div className="bg-accent rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">排隊號碼</div>
                  <div className="text-xl font-bold mt-0.5">{selected.queueNum}</div>
                </div>
              )}
              {selected.reservationTime && (
                <div className="bg-accent rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">訂座時間</div>
                  <div className="text-base font-bold mt-0.5">{selected.reservationTime}</div>
                </div>
              )}
              <div className="bg-accent rounded-xl p-3">
                <div className="text-xs text-muted-foreground">人數</div>
                <div className="text-xl font-bold mt-0.5">{selected.partySize} 位</div>
              </div>
              {selected.waitMinutes && (
                <div className="bg-accent rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">等候時間</div>
                  <div className="text-xl font-bold mt-0.5">~{selected.waitMinutes}分鐘</div>
                </div>
              )}
            </div>

            <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50 rounded-xl p-3 text-xs text-orange-700 dark:text-orange-300">
              ⚠️ 買方自行前往餐廳確認號碼有效後方完成交收。平台以托管方式保障買賣雙方。
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <div className="text-2xl font-bold text-primary">HK${selected.price}</div>
                <div className="text-xs text-muted-foreground">平台手續費另計</div>
              </div>
              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white px-8"
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
