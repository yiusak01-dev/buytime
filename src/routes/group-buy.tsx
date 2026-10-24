import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Users, Clock, ChevronRight, Info, TrendingDown, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/group-buy")({
  head: () => ({
    meta: [
      { title: "夾單 · 啱啱好" },
      { name: "description", content: "夾單拼購，越夾越平！" },
    ],
  }),
  component: GroupBuyPage,
});

type GroupBuyCategory = "all" | "food" | "household" | "beauty" | "electronics";

const MOCK_GROUPS = [
  {
    id: "1",
    category: "food" as const,
    title: "城多士面包批量訂購",
    description: "城多士新出麵包，批量落單更便宜！每人最少1盒（6個裝）",
    organizer: "麵包控",
    unitPrice: 45,
    groupPrice: 32,
    minQty: 1,
    currentJoined: 8,
    targetJoined: 15,
    deadline: "2026-10-28",
    deliveryArea: "全港配送",
    emoji: "🍞",
    status: "open" as const,
  },
  {
    id: "2",
    category: "household" as const,
    title: "日本直送 Tiger 保溫瓶",
    description: "日本代購Tiger虎牌保溫瓶，比香港零售平30%！人數夠就落單。",
    organizer: "日系控",
    unitPrice: 380,
    groupPrice: 265,
    minQty: 1,
    currentJoined: 12,
    targetJoined: 20,
    deadline: "2026-11-01",
    deliveryArea: "荃灣自取",
    emoji: "🫖",
    status: "open" as const,
  },
  {
    id: "3",
    category: "beauty" as const,
    title: "Laneige 水面膜夾單",
    description: "韓國直運Laneige面膜，3盒起批，人越多越平",
    organizer: "美容達人",
    unitPrice: 210,
    groupPrice: 148,
    minQty: 3,
    currentJoined: 20,
    targetJoined: 20,
    deadline: "2026-10-26",
    deliveryArea: "觀塘自取",
    emoji: "💄",
    status: "full" as const,
  },
  {
    id: "4",
    category: "food" as const,
    title: "台灣零食大禮包",
    description: "台灣代購，各款人氣零食，每包$120起，最少10人開團",
    organizer: "台灣零食控",
    unitPrice: 180,
    groupPrice: 120,
    minQty: 1,
    currentJoined: 6,
    targetJoined: 10,
    deadline: "2026-11-05",
    deliveryArea: "九龍灣自取",
    emoji: "🍡",
    status: "open" as const,
  },
];

function daysLeft(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "已截止";
  if (diff === 0) return "今日截止";
  return `${diff}日後截止`;
}

function progressPct(current: number, target: number) {
  return Math.min(100, Math.round((current / target) * 100));
}

export function GroupBuyPage() {
  const [category, setCategory] = useState<GroupBuyCategory>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = MOCK_GROUPS.filter((g) => {
    if (category !== "all" && g.category !== category) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!g.title.toLowerCase().includes(q) && !g.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const selected = MOCK_GROUPS.find((g) => g.id === selectedId) ?? null;

  return (
    <AppLayout>
      {/* Header */}
      <header className="px-4 pt-5 pb-4 bg-gradient-to-br from-green-600 to-teal-600 text-white rounded-b-3xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-white/70">🛍️ 夾單</div>
            <div className="text-xl font-bold mt-0.5">夾單拼購</div>
            <div className="text-[11px] text-white/80 mt-0.5">越夾越平，集體慳錢</div>
          </div>
          <button
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition-colors rounded-full px-3 py-1.5 text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> 開團
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {([
            { key: "all", label: "全部" },
            { key: "food", label: "🍱 食品" },
            { key: "household", label: "🏠 家品" },
            { key: "beauty", label: "💄 美容" },
            { key: "electronics", label: "📱 電子" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={cn(
                "shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors",
                category === key
                  ? "bg-white text-green-700"
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
            placeholder="搜尋夾單…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Info banner */}
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50 rounded-xl px-3 py-2.5 flex gap-2 items-start">
          <Info className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
          <div className="text-xs text-green-700 dark:text-green-300">
            人數達標後開團主才落單。平台暫收款項，確認收貨後才放款。
          </div>
        </div>

        {/* Groups */}
        {filtered.length === 0 ? (
          <div className="bg-card rounded-2xl py-12 px-6 flex flex-col items-center text-center gap-2">
            <div className="text-4xl">🛍️</div>
            <div className="text-sm font-semibold">暫時沒有夾單</div>
            <div className="text-xs text-muted-foreground">係第一個開團！</div>
            <Button size="sm" className="mt-2 bg-green-600 hover:bg-green-700">
              <Plus className="w-3.5 h-3.5 mr-1" /> 我要開團
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((group) => {
              const pct = progressPct(group.currentJoined, group.targetJoined);
              const isFull = group.status === "full";
              const savings = Math.round((1 - group.groupPrice / group.unitPrice) * 100);

              return (
                <button
                  key={group.id}
                  onClick={() => setSelectedId(group.id)}
                  className="w-full text-left bg-card rounded-2xl p-4 shadow-[var(--shadow-card)] space-y-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3 items-start flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 grid place-items-center text-xl shrink-0">
                        {group.emoji}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{group.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{group.description}</div>
                      </div>
                    </div>
                    {isFull ? (
                      <span className="shrink-0 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full font-semibold">已滿額</span>
                    ) : (
                      <div className="text-right shrink-0">
                        <div className="text-base font-bold text-primary">HK${group.groupPrice}</div>
                        <div className="text-[10px] text-muted-foreground line-through">HK${group.unitPrice}</div>
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Users className="w-3 h-3" />
                        {group.currentJoined}/{group.targetJoined} 人
                      </span>
                      <span className={cn(
                        "text-xs",
                        isFull ? "text-gray-500" : "text-green-600 font-semibold"
                      )}>
                        {isFull ? "已滿額" : `${pct}%`}
                      </span>
                    </div>
                    <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isFull ? "bg-gray-400" : "bg-green-500"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2.5 py-1 rounded-full font-semibold">
                      <TrendingDown className="w-3 h-3" /> 慳 {savings}%
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" /> {daysLeft(group.deadline)}
                    </span>
                    <span className="text-xs text-muted-foreground">📍 {group.deliveryArea}</span>
                  </div>
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
              <div className="w-14 h-14 rounded-2xl bg-green-100 dark:bg-green-900/30 grid place-items-center text-3xl shrink-0">
                {selected.emoji}
              </div>
              <div>
                <div className="font-bold text-lg leading-snug">{selected.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">由 {selected.organizer} 開團</div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">{selected.description}</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-accent rounded-xl p-3">
                <div className="text-xs text-muted-foreground">單買價</div>
                <div className="text-xl font-bold mt-0.5 line-through text-muted-foreground">HK${selected.unitPrice}</div>
              </div>
              <div className="bg-green-50 dark:bg-green-950/30 rounded-xl p-3 border border-green-200 dark:border-green-800/50">
                <div className="text-xs text-green-600 font-semibold">夾單價</div>
                <div className="text-xl font-bold mt-0.5 text-green-700 dark:text-green-300">HK${selected.groupPrice}</div>
              </div>
              <div className="bg-accent rounded-xl p-3">
                <div className="text-xs text-muted-foreground">截止日期</div>
                <div className="text-sm font-semibold mt-0.5">{daysLeft(selected.deadline)}</div>
              </div>
              <div className="bg-accent rounded-xl p-3">
                <div className="text-xs text-muted-foreground">配送/自取</div>
                <div className="text-sm font-semibold mt-0.5">{selected.deliveryArea}</div>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">夾單進度</span>
                <span className="text-green-600 font-bold">{selected.currentJoined}/{selected.targetJoined} 人</span>
              </div>
              <div className="h-3 bg-accent rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${progressPct(selected.currentJoined, selected.targetJoined)}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                仲差 {Math.max(0, selected.targetJoined - selected.currentJoined)} 人即可開單
              </div>
            </div>

            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50 rounded-xl p-3 text-xs text-green-700 dark:text-green-300">
              💡 夾單流程：加入 → 人數達標 → 開團主落單 → 收貨確認 → 平台放款。未達標會全額退款。
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <div className="text-2xl font-bold text-primary">HK${selected.groupPrice}</div>
                <div className="text-xs text-muted-foreground">
                  最少 {selected.minQty} 件起 · 慳 {Math.round((1 - selected.groupPrice / selected.unitPrice) * 100)}%
                </div>
              </div>
              <Button
                disabled={selected.status === "full"}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-6"
                onClick={() => setSelectedId(null)}
              >
                {selected.status === "full" ? "已滿額" : (
                  <><ShoppingCart className="w-4 h-4 mr-1.5" /> 加入夾單</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
