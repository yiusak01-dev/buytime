import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MapPin, ChevronDown, Bell, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { PostCard } from "@/components/aah/PostCard";
import { Chip, DemoBadge } from "@/components/aah/ui";
import { MallPicker } from "@/components/aah/MallPicker";
import { aah, testLocationAllowed, useAahMode, useAahState, MAX_PINNED_PER_MALL } from "@/lib/aah/store";
import { useAahMalls, nearbyMalls, distanceM } from "@/lib/aah/malls";
import { useCurrentMall, useGeo, useNow } from "@/lib/aah/geo";
import { SCENARIOS, SCENARIO_LIST } from "@/lib/aah/scenarios";
import type { ScenarioId } from "@/lib/aah/types";

type HomeSearch = { cat?: ScenarioId };

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): HomeSearch => ({
    cat: typeof s.cat === "string" && (SCENARIO_LIST as string[]).includes(s.cat) ? (s.cat as ScenarioId) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "啱啱好 · 啱時間 啱地方 啱啱好" },
      { name: "description", content: "香港商場即時資源配對：泊車、食飯候位、即時優惠、夾單。有人用唔着，你啱啱用得着。" },
      { property: "og:title", content: "啱啱好 · 啱時間 啱地方 啱啱好" },
      { property: "og:description", content: "同一個商場、同一時間，即時配對你需要嘅資源。" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { cat } = Route.useSearch();
  const { user, posts } = useAahState();
  const { malls, isSample } = useAahMalls();
  const current = useCurrentMall(malls);
  const geo = useGeo();
  const now = useNow(15000);
  const [pickerOpen, setPickerOpen] = useState(false);

  const modeNow = useAahMode();
  useEffect(() => {
    if (modeNow !== "detecting" && !user.onboarded) navigate({ to: "/welcome", replace: true });
  }, [user.onboarded, navigate, modeNow]);

  const mall = current.mall;

  const mode = useAahMode();
  useEffect(() => {
    if (mall) aah.ensureDemoPosts(mall);
  }, [mall?.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const mallById = useMemo(() => new Map(malls.map((m) => [m.id, m])), [malls]);

  const { pinned, rest, nearbyPinned, total } = useMemo(() => {
    if (!mall) return { pinned: [], rest: [], nearbyPinned: [], total: 0 };
    const live = posts.filter((p) => p.status === "open" && p.leaveAt > now && (!cat || p.scenario === cat));
    const here = live.filter((p) => p.mallId === mall.id);
    const pinnedHere = here
      .filter((p) => (p.pinnedUntil ?? 0) > now)
      .sort((a, b) => (b.pinnedUntil ?? 0) - (a.pinnedUntil ?? 0))
      .slice(0, MAX_PINNED_PER_MALL);
    const pinnedIds = new Set(pinnedHere.map((p) => p.id));
    const restHere = here.filter((p) => !pinnedIds.has(p.id)).sort((a, b) => b.createdAt - a.createdAt);
    // 附近商場嘅置頂 post（$5 置頂會推埋過嚟；泊車只推本商場）
    const nearIds = new Set(nearbyMalls(malls, mall).map((m) => m.id));
    const near = live.filter((p) => nearIds.has(p.mallId) && (p.pinnedUntil ?? 0) > now && SCENARIOS[p.scenario].pushNearby);
    return { pinned: pinnedHere, rest: restHere, nearbyPinned: near, total: here.length + near.length };
  }, [posts, mall, malls, now, cat]);

  const empty = total === 0;

  return (
    <AppLayout>
      {/* 黃色品牌頭 */}
      <header className="bg-[#F5C518] text-[#1a1a1a] px-5 pt-6 pb-5 rounded-b-[28px] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[26px] font-black tracking-tight leading-none">啱啱好</span>
            <span className="w-2 h-2 rounded-full bg-[#E8642A] -mt-3" />
          </div>
          <Link to="/me" className="h-9 px-3 rounded-full bg-white/50 text-xs font-bold grid place-items-center">
            {user.registered ? user.nickname : "登入"}
          </Link>
        </div>

        <div>
          <div className="text-[28px] font-black leading-[1.15]">啱時間・啱地方・啱啱好</div>
          <div className="text-sm mt-1.5 text-[#1a1a1a]/70">有人用唔着，你啱啱用得着。</div>
        </div>

        {/* 位置 */}
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full flex items-center gap-2 bg-white rounded-2xl px-4 py-3 text-left shadow-sm"
        >
          <MapPin className="w-5 h-5 text-[#E8642A] shrink-0" />
          <div className="flex-1 min-w-0">
            {mall ? (
              <>
                <div className="text-[15px] font-bold truncate">你而家喺 {mall.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {current.verified ? "GPS 已確認" : testLocationAllowed() ? "測試位置（唔喺商場都可以試用）" : "淨係睇緊：去到商場先可以出 post 同接"}
                </div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-bold">你唔喺任何商場</div>
                <div className="text-[11px] text-muted-foreground">
                  {geo.status === "denied" ? "冇開定位：可以睇，但要開定位先可以出 post" : testLocationAllowed() ? "揀一個商場試吓" : "揀一個商場睇吓有咩着數"}
                </div>
              </>
            )}
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </header>

      <div className="px-4 pt-4 space-y-4">
        {mode === "local" && (
          <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <DemoBadge />
            <span>示範模式：post 同配對只存喺呢部電話，其他人睇唔到。{isSample ? "商場資料係示範數字。" : ""}</span>
          </div>
        )}
        {mode === "remote" && isSample && (
          <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <DemoBadge />
            <span>讀唔到商場資料，暫時用緊示範商場。</span>
          </div>
        )}

        {mall && (
          <div className="flex items-end justify-between">
            <h1 className="text-xl font-black">
              {mall.name} 而家有 {total} 個着數
            </h1>
          </div>
        )}

        {/* 類別篩選 */}
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
          <Chip active={!cat} onClick={() => navigate({ to: "/", search: {} })}>全部</Chip>
          {SCENARIO_LIST.map((id) => (
            <Chip key={id} active={cat === id} onClick={() => navigate({ to: "/", search: { cat: id } })}>
              {SCENARIOS[id].emoji} {SCENARIOS[id].label}
            </Chip>
          ))}
        </div>

        {!mall ? (
          <div className="bg-card rounded-2xl p-6 text-center space-y-3">
            <div className="text-4xl">📍</div>
            <div className="font-bold">去到商場就會見到身邊嘅着數</div>
            <p className="text-sm text-muted-foreground">
              {testLocationAllowed()
                ? "而家未喺任何商場範圍。可以揀一個商場做測試位置，試吓成個流程。"
                : "而家未喺任何商場範圍。可以先揀一個商場睇吓有咩着數，去到先可以出 post 同接。"}
            </p>
            <button onClick={() => setPickerOpen(true)} className="h-11 px-5 rounded-2xl bg-[#1a1a1a] text-white font-bold">
              {testLocationAllowed() ? "揀商場" : "睇其他商場"}
            </button>
          </div>
        ) : empty ? (
          <div className="bg-card rounded-2xl p-6 text-center space-y-3">
            <div className="text-4xl">🙌</div>
            <div className="font-bold">呢度暫時冇人放，你做第一個？</div>
            <div className="flex flex-col gap-2">
              <Link to="/post/new" className="h-11 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-bold grid place-items-center">
                <span className="inline-flex items-center gap-1"><Plus className="w-4 h-4" /> 出 post</span>
              </Link>
              <button
                onClick={() => {
                  aah.updateUser({ notifyOpportunities: true });
                  toast.success("有新嘢會通知你");
                }}
                className="h-11 rounded-2xl border border-border font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Bell className="w-4 h-4" /> 有新嘢通知我
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {pinned.map((p) => (
              <PostCard key={p.id} post={p} mall={mallById.get(p.mallId)} now={now} />
            ))}
            {nearbyPinned.map((p) => {
              const m = mallById.get(p.mallId);
              const mins = m ? Math.max(1, Math.round(distanceM(mall.lat, mall.lng, m.lat, m.lng) / 80)) : null;
              return <PostCard key={p.id} post={p} mall={m} now={now} otherMallLabel={`${p.mallName}${mins ? `（行路約 ${mins} 分鐘）` : ""}`} />;
            })}
            {rest.map((p) => (
              <PostCard key={p.id} post={p} mall={mallById.get(p.mallId)} now={now} />
            ))}
          </div>
        )}
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
    </AppLayout>
  );
}
