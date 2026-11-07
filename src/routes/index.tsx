import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, Lock } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { TabHeader } from "@/components/aah/TabHeader";
import { FeedRow } from "@/components/aah/FeedRow";
import { CatIcon, LiveDot } from "@/components/aah/CatIcon";
import { DemoBadge } from "@/components/aah/ui";
import { useQuickInterest } from "@/components/aah/useQuickInterest";
import { aah, useAahMode, useAahState, MAX_PINNED_PER_MALL } from "@/lib/aah/store";
import { useAahMalls, nearbyMalls, distanceM } from "@/lib/aah/malls";
import { fmtAgo, geoStore, useNow, useViewMall } from "@/lib/aah/geo";
import { SCENARIOS } from "@/lib/aah/scenarios";
import { CAT_STYLE, FIND_SCENARIOS, FREE_LIMIT, LIVE_TEXT, VERBS } from "@/lib/aah/theme";
import type { Post, ScenarioId } from "@/lib/aah/types";
import type { QuickKind } from "./post.new";
import { cn } from "@/lib/utils";

type HomeSearch = { cat?: ScenarioId };

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): HomeSearch => ({
    cat:
      typeof s.cat === "string" && ["parking", "dining", "offer", "groupbuy"].includes(s.cat)
        ? (s.cat as ScenarioId)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "啱啱好 · 啱時間 啱地方 啱啱好" },
      {
        name: "description",
        content: "香港商場即時配對：泊車收據、餐廳飛、優惠券、夾單。用唔着嘅轉俾人，大家都有着數。",
      },
      { property: "og:title", content: "啱啱好 · 用唔着嘅轉俾人，大家都有着數" },
      {
        property: "og:description",
        content: "泊車收據、餐廳飛、優惠券、夾單：同一個商場、同一時間，即時配對。",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Home,
});

const HOW_KEY = "aah:howSeen";
function readHowSeen(): boolean {
  try {
    return localStorage.getItem(HOW_KEY) === "1";
  } catch {
    return false;
  }
}

/** 「有人啱啱放咗…」：只講最近 3 個鐘內嘅，舊嘅唔扮即時 */
function tickerText(p: Post, now: number, showMall: boolean): string | null {
  if (now - p.createdAt > 3 * 3600 * 1000) return null;
  const where = showMall ? `喺${p.mallName}` : "";
  const what =
    p.scenario === "groupbuy"
      ? `開咗夾單：${p.shop} ${p.fields.deal ?? ""}`.trim()
      : p.direction === "want"
        ? `話要${CAT_STYLE[p.scenario].name}`
        : `放咗${CAT_STYLE[p.scenario].name}`;
  return `${fmtAgo(p.createdAt, now)}，有人${where}${what}`;
}

function Home() {
  const navigate = useNavigate();
  const { cat } = Route.useSearch();
  const { user, posts } = useAahState();
  const { malls, isSample } = useAahMalls();
  const view = useViewMall(malls);
  const now = useNow(15000);
  const mode = useAahMode();
  const [howSeen, setHowSeen] = useState(readHowSeen);
  const { interest, ask, sheet } = useQuickInterest();

  // 夾單喺「夾」頁
  useEffect(() => {
    if (cat === "groupbuy") navigate({ to: "/join", replace: true });
  }, [cat, navigate]);

  const mall = view.mall;
  useEffect(() => {
    if (mall) aah.ensureDemoPosts(mall);
  }, [mall?.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const mallById = useMemo(() => new Map(malls.map((m) => [m.id, m])), [malls]);
  const live = useMemo(
    () => posts.filter((p) => p.status === "open" && p.leaveAt > now),
    [posts, now],
  );
  // 「搵」：有人放出嚟嘅泊車收據、餐廳飛、優惠券（想要嘅喺「放」頁、夾單喺「夾」頁）
  const findable = useMemo(
    () => live.filter((p) => FIND_SCENARIOS.includes(p.scenario) && p.direction !== "want"),
    [live],
  );
  const scope = useMemo(
    () => (mall ? findable.filter((p) => p.mallId === mall.id) : findable),
    [findable, mall],
  );
  const countBy = useMemo(() => {
    const m = new Map<ScenarioId, number>();
    for (const p of scope) m.set(p.scenario, (m.get(p.scenario) ?? 0) + 1);
    return m;
  }, [scope]);

  const feed = useMemo(() => {
    const byCat = (p: Post) => !cat || p.scenario === cat;
    const newest = (a: Post, b: Post) => b.createdAt - a.createdAt;
    if (!mall)
      return {
        main: [] as Post[],
        others: findable.filter(byCat).sort(newest).slice(0, 40),
        othersLabel: "全港最新",
      };
    const here = findable.filter((p) => p.mallId === mall.id && byCat(p));
    const pinned = here
      .filter((p) => (p.pinnedUntil ?? 0) > now)
      .sort((a, b) => (b.pinnedUntil ?? 0) - (a.pinnedUntil ?? 0))
      .slice(0, MAX_PINNED_PER_MALL);
    const pinnedIds = new Set(pinned.map((p) => p.id));
    const rest = here.filter((p) => !pinnedIds.has(p.id)).sort(newest);
    const near = nearbyMalls(malls, mall);
    const nearIds = new Set(near.map((m) => m.id));
    const nearLive = findable.filter((p) => nearIds.has(p.mallId) && byCat(p));
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
          .filter((p) => p.mallId !== mall.id && byCat(p))
          .sort(newest)
          .slice(0, 20);
        othersLabel = "全港最新";
      }
    }
    return { main: [...pinned, ...nearbyPinned, ...rest], others, othersLabel };
  }, [findable, mall, malls, now, cat]);

  // 冇揀類別：按類別分段
  const sections = useMemo(() => {
    if (cat) return [{ id: cat, posts: feed.main }];
    return FIND_SCENARIOS.map((id) => ({
      id,
      posts: feed.main.filter((p) => p.scenario === id),
    })).filter((s) => s.posts.length);
  }, [feed.main, cat]);

  // 未登記：頭 3 個免費睇
  const limited = !user.registered;
  const flat = useMemo(
    () => [...sections.flatMap((s) => s.posts), ...feed.others],
    [sections, feed.others],
  );
  const visible = useMemo(
    () => new Set((limited ? flat.slice(0, FREE_LIMIT) : flat).map((p) => p.id)),
    [flat, limited],
  );
  const hidden = flat.length - visible.size;

  const tickerPost = useMemo(() => {
    const pool = mall ? live.filter((p) => p.mallId === mall.id) : live;
    const src = pool.length ? pool : live;
    return src.reduce<Post | null>((a, p) => (!a || p.createdAt > a.createdAt ? p : a), null);
  }, [live, mall]);
  const ticker = tickerPost
    ? tickerText(tickerPost, now, !mall || tickerPost.mallId !== mall.id)
    : null;

  const hereCount = feed.main.length;
  const nothingAnywhere = live.length === 0;
  const showCoach = !user.registered && !howSeen;

  function dismissCoach() {
    setHowSeen(true);
    try {
      localStorage.setItem(HOW_KEY, "1");
    } catch {
      /* 私隱模式：唔記得都冇問題 */
    }
    if (!user.onboarded) aah.updateUser({ onboarded: true });
    // 搵最近嘅商場
    void geoStore.start();
  }
  function pickCat(id: ScenarioId | undefined) {
    navigate({ to: "/", search: id ? { cat: id } : {}, replace: true });
  }
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
    />
  );

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
          </div>
        )}
        {mode === "remote" && isSample && (
          <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <DemoBadge />
            <span>讀唔到商場資料，暫時用緊示範商場。</span>
          </div>
        )}

        {showCoach && <Coach onClose={dismissCoach} />}

        {ticker && (
          <div
            className="bg-card rounded-[18px] px-3.5 py-2.5 flex items-center gap-2.5 shadow-[var(--shadow-card)]"
            data-testid="live-ticker"
          >
            <LiveDot />
            <span className="text-[13px] font-black shrink-0" style={{ color: LIVE_TEXT }}>
              即時
            </span>
            <span className="text-[13px] font-bold truncate">{ticker}</span>
          </div>
        )}

        {!nothingAnywhere && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5 scrollbar-hide">
            <CatChip active={!cat} onClick={() => pickCat(undefined)}>
              全部 {scope.length}
            </CatChip>
            {FIND_SCENARIOS.map((id) => (
              <CatChip key={id} active={cat === id} onClick={() => pickCat(id)}>
                {CAT_STYLE[id].short} {countBy.get(id) ?? 0}
              </CatChip>
            ))}
          </div>
        )}

        {mall && !nothingAnywhere && (
          <h1 className="text-[17px] font-black pt-1">
            {mall.name} 而家有 {hereCount} 個
            {view.nearest ? (
              <span className="text-xs font-bold text-muted-foreground">・離你最近</span>
            ) : null}
          </h1>
        )}

        {sections.some((s) => s.posts.some((p) => visible.has(p.id))) && (
          <div className="bg-card rounded-3xl px-3.5 py-1.5 shadow-[var(--shadow-card)]">
            {sections.map((s) => {
              const shown = s.posts.filter((p) => visible.has(p.id));
              if (!shown.length) return null;
              return (
                <div key={s.id}>
                  {!cat && (
                    <div
                      className="pt-2 pb-0.5 text-xs font-black"
                      style={{ color: CAT_STYLE[s.id].fg }}
                    >
                      {CAT_STYLE[s.id].name}・{s.posts.length}
                    </div>
                  )}
                  {shown.map((p) => row(p, walkLabel(p)))}
                </div>
              );
            })}
          </div>
        )}

        {mall && hereCount === 0 && !nothingAnywhere && (
          <EmptyHere mallName={mall.name} cat={cat} />
        )}

        {feed.others.some((p) => visible.has(p.id)) && (
          <>
            <div className="text-sm font-black pt-1">{feed.othersLabel}</div>
            <div className="bg-card rounded-3xl px-3.5 py-1.5 shadow-[var(--shadow-card)]">
              {feed.others.filter((p) => visible.has(p.id)).map((p) => row(p, p.mallName))}
            </div>
          </>
        )}

        {hidden > 0 && <LockCard count={hidden} onClick={() => ask("登記咗就睇晒全部，免費")} />}

        {!mall && feed.others.length === 0 && !nothingAnywhere && <EmptyCat cat={cat} />}

        {nothingAnywhere && <ColdStart />}
      </div>
      {sheet}
    </AppLayout>
  );
}

function CatChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={cn(
        "shrink-0 h-9 px-3.5 rounded-full text-[13px] font-bold",
        active ? "bg-[#2B2433] text-white" : "bg-card",
      )}
    >
      {children}
    </button>
  );
}

/** 第一次打開：三個字點用，指住上面三個分頁 */
function Coach({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="relative bg-[#2B2433] text-white rounded-3xl px-4 py-3.5 space-y-2"
      data-testid="coach"
    >
      <span
        aria-hidden="true"
        className="absolute -top-1.5 left-16 w-3.5 h-3.5 bg-[#2B2433] rotate-45"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-black">第一次用？得三個字</span>
        <button
          onClick={onClose}
          className="h-9 px-3.5 rounded-xl bg-white text-[#2B2433] text-[13px] font-black"
        >
          知道
        </button>
      </div>
      <div className="text-sm leading-relaxed space-y-0.5">
        <div>
          <b className="text-[#C9C0FF] mr-3">搵</b>人哋用唔着嘅，你攞嚟用
        </div>
        <div>
          <b className="text-[#FFC6A3] mr-3">放</b>你用唔着嘅，轉俾人
        </div>
        <div>
          <b className="text-[#A9E5C4] mr-3">夾</b>一個人買唔抵，搵人一齊
        </div>
      </div>
    </div>
  );
}

function LockCard({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <div
      className="relative bg-card rounded-3xl p-3.5 shadow-[var(--shadow-card)] overflow-hidden h-32"
      data-testid="lock-card"
    >
      <div aria-hidden="true" className="space-y-3.5 blur-[3px] opacity-60">
        {[150, 120].map((w) => (
          <div key={w} className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-[#FBE6EF]" />
            <span className="space-y-1.5">
              <span className="block h-3 rounded-full bg-[#D9CFC4]" style={{ width: w }} />
              <span className="block h-2.5 rounded-full bg-[#E8DFD5]" style={{ width: w - 50 }} />
            </span>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60">
        <span className="text-[15px] font-black flex items-center gap-1.5">
          <Lock className="w-4 h-4" />
          仲有 {count} 個
        </span>
        <button
          onClick={onClick}
          className="h-11 px-5 rounded-[14px] text-white text-sm font-black"
          style={{ background: VERBS.find.strong }}
        >
          登記睇晒（免費）
        </button>
      </div>
    </div>
  );
}

/** 「話人知你要」：搵唔到嘅時候，下一步做咩 */
const ASK_FOR: Partial<Record<ScenarioId, { label: string; quick: QuickKind }>> = {
  parking: { label: "話人知你要泊車", quick: "want" },
  offer: { label: "話人知你想要咩優惠", quick: "offerwant" },
};

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

function EmptyHere({ mallName, cat }: { mallName: string; cat?: ScenarioId }) {
  const ask = cat ? ASK_FOR[cat] : undefined;
  return (
    <div className="bg-card rounded-3xl p-5 text-center space-y-3">
      <div className="font-bold">
        {cat ? `${mallName} 暫時未有人放${CAT_STYLE[cat].name}` : `${mallName} 暫時未有人放`}
      </div>
      <div className="flex flex-col gap-2">
        {ask ? (
          <Link
            to="/post/new"
            search={{ quick: ask.quick }}
            className="h-11 rounded-2xl font-black grid place-items-center text-white"
            style={{ background: VERBS.find.strong }}
          >
            {ask.label}
          </Link>
        ) : (
          <Link
            to="/give"
            className="h-11 rounded-2xl font-black grid place-items-center"
            style={{ background: VERBS.give.soft, color: VERBS.give.text }}
          >
            有用唔着嘅？放出去
          </Link>
        )}
        <NotifyButton />
      </div>
    </div>
  );
}

function EmptyCat({ cat }: { cat?: ScenarioId }) {
  const ask = cat ? ASK_FOR[cat] : undefined;
  return (
    <div className="bg-card rounded-3xl p-5 text-center space-y-3">
      <div className="font-bold">{cat ? `暫時未有人放${CAT_STYLE[cat].name}` : "暫時未有人放"}</div>
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

/** 示範例子：清楚標明唔係真 post，撳唔到 */
const EXAMPLES: { scenario: ScenarioId; title: string; sub: string }[] = [
  { scenario: "parking", title: "可換 3 個鐘", sub: "$30・慳 $42・APM" },
  { scenario: "dining", title: "鼎泰豐 A052・2 位", sub: "免費・去咗第二間食・朗豪坊" },
  { scenario: "offer", title: "屈臣氏 $50 現金券", sub: "$20・慳 $30・海港城" },
];

function ColdStart() {
  return (
    <div className="space-y-3">
      <div className="bg-card rounded-3xl p-5 text-center space-y-3">
        <div className="font-bold">啱啱開始，仲未有人放</div>
        <p className="text-sm text-muted-foreground">
          做第一個：用唔着嘅收據、飛、券，放出去俾啱用嘅人。
        </p>
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
      <div className="text-xs font-bold text-muted-foreground pt-1">放出去大概係咁樣：</div>
      <div className="bg-card/70 rounded-3xl px-3.5 py-1.5 border border-dashed border-border">
        {EXAMPLES.map((e) => (
          <div
            key={e.title}
            aria-label="示範例子"
            className="flex items-center gap-3 py-2.5 border-b border-[#F3ECE4] last:border-0"
          >
            <CatIcon scenario={e.scenario} />
            <span className="flex-1 min-w-0">
              <span className="block font-black text-[15px]">{e.title}</span>
              <span className="block text-xs text-muted-foreground">{e.sub}</span>
            </span>
            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded shrink-0">
              示範例子
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
