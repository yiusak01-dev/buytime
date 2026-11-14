import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { TabHeader } from "@/components/aah/TabHeader";
import { FeedRow } from "@/components/aah/FeedRow";
import { CatGroup, LockRow } from "@/components/aah/Group";
import { CatIcon, LiveDot } from "@/components/aah/CatIcon";
import { DemoBadge } from "@/components/aah/ui";
import { useQuickInterest } from "@/components/aah/useQuickInterest";
import { aah, isDemoForced, useAahMode, useAahState, MAX_PINNED_PER_MALL } from "@/lib/aah/store";
import { useAahMalls, nearbyMalls, distanceM } from "@/lib/aah/malls";
import { useNow, useViewMall } from "@/lib/aah/geo";
import { SCENARIOS } from "@/lib/aah/scenarios";
import { CAT_STYLE, FIND_SCENARIOS, FREE_LIMIT, VERBS } from "@/lib/aah/theme";
import type { Post, ScenarioId } from "@/lib/aah/types";
import type { QuickKind } from "./post.new";
import { logEvent } from "@/lib/aah/track";

type HomeSearch = { cat?: ScenarioId; how?: "1" };

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): HomeSearch => ({
    cat:
      typeof s.cat === "string" && ["parking", "dining", "offer", "groupbuy"].includes(s.cat)
        ? (s.cat as ScenarioId)
        : undefined,
    how: s.how === "1" || s.how === 1 ? "1" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "啱啱好 · 啱時間 啱地方 啱啱好" },
      {
        name: "description",
        content:
          "香港商場即時配對：泊車單、餐廳排隊飛、優惠券、夾單。用唔着嘅交俾啱用嘅人。",
      },
      { property: "og:title", content: "啱啱好 · 有人用唔着，有人啱用" },
      {
        property: "og:description",
        content: "泊車單、餐廳排隊飛、優惠券、夾單：同一個商場、同一時間，即時配對。",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Home,
});

function Home() {
  const { cat } = Route.useSearch();
  const { user, posts } = useAahState();
  const { malls, isSample } = useAahMalls();
  const view = useViewMall(malls);
  const now = useNow(15000);
  const mode = useAahMode();
  const { interest, ask, sheet } = useQuickInterest();

  const mall = view.mall;
  useEffect(() => {
    if (mall) aah.ensureDemoPosts(mall);
  }, [mall?.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const mallById = useMemo(() => new Map(malls.map((m) => [m.id, m])), [malls]);
  const live = useMemo(
    () => posts.filter((p) => p.status === "open" && p.leaveAt > now),
    [posts, now],
  );
  // 「搵」：有人放出嚟嘅泊車單、排隊飛、優惠券、夾單（想要嘅喺「放」版面）
  const findable = useMemo(
    () => live.filter((p) => FIND_SCENARIOS.includes(p.scenario) && p.direction !== "want"),
    [live],
  );

  const feed = useMemo(() => {
    const newest = (a: Post, b: Post) => b.createdAt - a.createdAt;
    if (!mall)
      return {
        main: [] as Post[],
        others: [...findable].sort(newest).slice(0, 40),
        othersLabel: "全港最新",
      };
    const here = findable.filter((p) => p.mallId === mall.id);
    const pinned = here
      .filter((p) => (p.pinnedUntil ?? 0) > now)
      .sort((a, b) => (b.pinnedUntil ?? 0) - (a.pinnedUntil ?? 0))
      .slice(0, MAX_PINNED_PER_MALL);
    const pinnedIds = new Set(pinned.map((p) => p.id));
    const rest = here.filter((p) => !pinnedIds.has(p.id)).sort(newest);
    const near = nearbyMalls(malls, mall);
    const nearIds = new Set(near.map((m) => m.id));
    const nearLive = findable.filter((p) => nearIds.has(p.mallId));
    const nearbyPinned = nearLive.filter(
      (p) => (p.pinnedUntil ?? 0) > now && SCENARIOS[p.scenario].pushNearby,
    );
    let others: Post[] = [];
    let othersLabel = "附近商場最新";
    if (here.length === 0) {
      others = nearLive
        .filter((p) => !nearbyPinned.includes(p))
        .sort(newest)
        .slice(0, 20);
      // 附近都冇：出全港最新，好奇打開嘅人都有嘢睇
      if (others.length === 0 && nearbyPinned.length === 0) {
        others = findable
          .filter((p) => p.mallId !== mall.id)
          .sort(newest)
          .slice(0, 20);
        othersLabel = "全港最新";
      }
    }
    return { main: [...pinned, ...nearbyPinned, ...rest], others, othersLabel };
  }, [findable, mall, malls, now]);

  const groupsOf = (list: Post[]) =>
    FIND_SCENARIOS.map((id) => ({ id, posts: list.filter((p) => p.scenario === id) })).filter(
      (g) => g.posts.length,
    );
  const mainGroups = useMemo(() => groupsOf(feed.main), [feed.main]); // eslint-disable-line react-hooks/exhaustive-deps
  const otherGroups = useMemo(() => groupsOf(feed.others), [feed.others]); // eslint-disable-line react-hooks/exhaustive-deps

  // 未註冊：每組睇到頭 3 個，其餘鎖住
  const limited = !user.registered;
  const unlock = () => ask("註冊咗就睇晒全部，免費");

  const hereCount = feed.main.length;
  const nothingAnywhere = live.length === 0;

  // 搵唔到嘢：記低（每個商場一次），每週問題報告用
  useEffect(() => {
    if (!mall || hereCount > 0 || mode !== "remote") return;
    const key = `aah:empty:${mall.id}:all`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* 記唔到就照記 */
    }
    logEvent("feed_empty", { mall: mall.id, cat: "all" });
  }, [mall?.id, hereCount, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const walkLabel = (p: Post) => {
    const m = mallById.get(p.mallId);
    if (!mall || !m || m.id === mall.id) return undefined;
    const mins = Math.max(1, Math.round(distanceM(mall.lat, mall.lng, m.lat, m.lng) / 80));
    return `${p.mallName}（行路約 ${mins} 分鐘）`;
  };
  const row = (p: Post, other?: string) => (
    <FeedRow
      key={p.id}
      post={p}
      mall={mallById.get(p.mallId)}
      now={now}
      meId={user.id}
      onAct={interest}
      otherMall={other}
      hideIcon
    />
  );
  const renderGroups = (groups: { id: ScenarioId; posts: Post[] }[], other: (p: Post) => string | undefined) =>
    groups.map((g) => {
      const shown = limited ? g.posts.slice(0, FREE_LIMIT) : g.posts;
      const locked = g.posts.length - shown.length;
      return (
        <CatGroup
          key={`${g.id}-${cat ?? ""}`}
          scenario={g.id}
          count={g.posts.length}
          defaultOpen={!cat || cat === g.id}
        >
          {shown.map((p) => row(p, other(p)))}
          {locked > 0 && <LockRow count={locked} onClick={unlock} />}
        </CatGroup>
      );
    });

  return (
    <AppLayout hideNav>
      <TabHeader active="find" />

      <div className="px-4 space-y-3">
        {mode === "local" && (
          <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <DemoBadge />
            <span>
              示範模式：post 同配對只存喺呢部電話，其他人睇唔到。
              {isSample ? "商場資料係示範數字。" : ""}
            </span>
            {isDemoForced() && (
              <a href="/?demo=0" className="ml-auto shrink-0 font-black underline">
                離開示範
              </a>
            )}
          </div>
        )}
        {mode === "remote" && isSample && (
          <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <DemoBadge />
            <span>讀唔到商場資料，暫時用緊示範商場。</span>
          </div>
        )}

        {cat && mall && !nothingAnywhere && hereCount > 0 && !mainGroups.some((g) => g.id === cat) && (
          <EmptyFor mallName={mall.name} cat={cat} />
        )}
        {renderGroups(mainGroups, walkLabel)}

        {mall && hereCount === 0 && !nothingAnywhere && <EmptyHere mallName={mall.name} />}

        {otherGroups.length > 0 && (
          <>
            <div className="text-sm font-black pt-1">{feed.othersLabel}</div>
            {renderGroups(otherGroups, (p) => p.mallName)}
          </>
        )}

        {nothingAnywhere && <ColdStart where={mall?.name ?? "全港"} />}
      </div>
      {sheet}
    </AppLayout>
  );
}

function NotifyButton() {
  return (
    <button
      onClick={() => {
        aah.updateUser({ notifyOpportunities: true });
        toast.success("有新嘢會通知你");
      }}
      className="h-11 rounded-2xl border border-border bg-card font-bold inline-flex items-center justify-center gap-1.5"
    >
      <Bell className="w-4 h-4" /> 有新嘢通知我
    </button>
  );
}

function EmptyHere({ mallName }: { mallName: string }) {
  return (
    <div className="bg-card rounded-3xl p-5 text-center space-y-3">
      <div className="font-bold">{mallName} 暫時未有人放</div>
      <div className="flex flex-col gap-2">
        <Link
          to="/give"
          className="h-11 rounded-2xl font-black grid place-items-center"
          style={{ background: VERBS.give.soft, color: VERBS.give.text }}
        >
          放出去
        </Link>
        <NotifyButton />
      </div>
    </div>
  );
}

/** 連結指定咗類別，但呢個商場冇：講一句，俾個下一步 */
const ASK_FOR: Partial<Record<ScenarioId, { label: string; quick: QuickKind }>> = {
  parking: { label: "話人知你要泊車", quick: "want" },
  offer: { label: "話人知你想要咩優惠券", quick: "offerwant" },
  groupbuy: { label: "自己開個夾單", quick: "groupbuy" },
};

function EmptyFor({ mallName, cat }: { mallName: string; cat: ScenarioId }) {
  const ask = ASK_FOR[cat];
  return (
    <div className="bg-card rounded-3xl p-5 text-center space-y-3" data-testid="empty-cat">
      <div className="font-bold">
        {mallName} 暫時未有人放{CAT_STYLE[cat].short}
      </div>
      <div className="flex flex-col gap-2">
        {ask && (
          <Link
            to="/post/new"
            search={{ quick: ask.quick }}
            className="h-11 rounded-2xl font-black grid place-items-center text-white"
            style={{ background: VERBS.find.strong }}
          >
            {ask.label}
          </Link>
        )}
        <NotifyButton />
      </div>
    </div>
  );
}

/** 示範例子：寫死喺度，撳唔到 */
const EXAMPLES: { scenario: ScenarioId; title: string; sub: string }[] = [
  { scenario: "parking", title: "可換 3 個鐘泊車", sub: "$30・慳 $42・APM" },
  { scenario: "dining", title: "鼎泰豐 飛號 A052・2 位", sub: "免費・唔去食，張飛轉俾人・朗豪坊" },
  { scenario: "offer", title: "屈臣氏 $50 現金券", sub: "$20・慳 $30・海港城" },
];

/** 全港都未有人放：短短一句＋兩個掣，下面幾個例子 */
function ColdStart({ where }: { where: string }) {
  return (
    <div className="space-y-3">
      <div className="bg-card rounded-3xl p-5 text-center space-y-3">
        <div className="font-bold flex items-center justify-center gap-2">
          <LiveDot />
          {where} 暫時未有人放
        </div>
        <div className="flex flex-col gap-2">
          <Link
            to="/give"
            className="h-11 rounded-2xl font-black grid place-items-center"
            style={{ background: VERBS.give.soft, color: VERBS.give.text }}
          >
            放出去
          </Link>
          <NotifyButton />
        </div>
      </div>
      <div className="text-sm font-black pt-1">已經有人喺度配對成功</div>
      <div className="bg-card/70 rounded-3xl px-3.5 py-1.5 border border-dashed border-border">
        {EXAMPLES.map((e) => (
          <div
            key={e.title}
            aria-label="例子"
            className="flex items-center gap-3 py-2.5 border-b border-[#F3ECE4] last:border-0"
          >
            <CatIcon scenario={e.scenario} />
            <span className="flex-1 min-w-0">
              <span className="block font-black text-[15px]">{e.title}</span>
              <span className="block text-xs text-muted-foreground">{e.sub}</span>
            </span>
            <span className="text-[11px] font-bold bg-[#E3F5EA] text-[#16774A] px-2 py-0.5 rounded-full shrink-0">
              配對成功
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
