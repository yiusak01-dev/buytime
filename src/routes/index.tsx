import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, ChevronDown, Bell, X, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { PostCard } from "@/components/aah/PostCard";
import { BottomSheet, Chip, DemoBadge } from "@/components/aah/ui";
import { MallPicker } from "@/components/aah/MallPicker";
import { aah, testLocationAllowed, useAahMode, useAahState, MAX_PINNED_PER_MALL } from "@/lib/aah/store";
import { useAahMalls, nearbyMalls, distanceM } from "@/lib/aah/malls";
import { useCurrentMall, useGeo, useNow } from "@/lib/aah/geo";
import { SCENARIOS, SCENARIO_LIST } from "@/lib/aah/scenarios";
import { TAGLINE, FIND, GIVE, FIND_CATS, HOW_STEPS } from "@/lib/aah/copy";
import type { Post, ScenarioId } from "@/lib/aah/types";
import type { QuickKind } from "./post.new";

type HomeSearch = { cat?: ScenarioId };

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): HomeSearch => ({
    cat: typeof s.cat === "string" && (SCENARIO_LIST as string[]).includes(s.cat) ? (s.cat as ScenarioId) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "啱啱好 · 啱時間 啱地方 啱啱好" },
      { name: "description", content: "香港商場即時配對：泊車收據、餐廳飛、優惠券、夾單。用唔着嘅轉俾人，大家都有着數。" },
      { property: "og:title", content: "啱啱好 · 用唔着嘅轉俾人，大家都有着數" },
      { property: "og:description", content: "泊車收據、餐廳飛、優惠券、夾單：同一個商場、同一時間，即時配對。" },
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

function Home() {
  const navigate = useNavigate();
  const { cat } = Route.useSearch();
  const { user, posts } = useAahState();
  const { malls, isSample } = useAahMalls();
  const current = useCurrentMall(malls);
  const geo = useGeo();
  const now = useNow(15000);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [howSeen, setHowSeen] = useState(readHowSeen);
  const feedRef = useRef<HTMLDivElement>(null);

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
  const live = useMemo(() => posts.filter((p) => p.status === "open" && p.leaveAt > now), [posts, now]);

  // 每個類別有幾多（「搵」嗰度顯示）
  const scope = useMemo(() => (mall ? live.filter((p) => p.mallId === mall.id) : live), [live, mall]);
  const countBy = useMemo(() => {
    const m = new Map<ScenarioId, number>();
    for (const p of scope) m.set(p.scenario, (m.get(p.scenario) ?? 0) + 1);
    return m;
  }, [scope]);

  const feed = useMemo(() => {
    const byCat = (p: Post) => !cat || p.scenario === cat;
    if (!mall) {
      // 唔喺商場：全港最新
      return { pinned: [] as Post[], here: [] as Post[], nearbyPinned: [] as Post[], others: live.filter(byCat).sort((a, b) => b.createdAt - a.createdAt).slice(0, 40) };
    }
    const here = live.filter((p) => p.mallId === mall.id && byCat(p));
    const pinned = here
      .filter((p) => (p.pinnedUntil ?? 0) > now)
      .sort((a, b) => (b.pinnedUntil ?? 0) - (a.pinnedUntil ?? 0))
      .slice(0, MAX_PINNED_PER_MALL);
    const pinnedIds = new Set(pinned.map((p) => p.id));
    const rest = here.filter((p) => !pinnedIds.has(p.id)).sort((a, b) => b.createdAt - a.createdAt);
    // 附近商場：置頂（推埋過嚟）嘅同埋本商場冇嘢時嘅最新
    const near = nearbyMalls(malls, mall);
    const nearIds = new Set(near.map((m) => m.id));
    const nearLive = live.filter((p) => nearIds.has(p.mallId) && byCat(p));
    const nearbyPinned = nearLive.filter((p) => (p.pinnedUntil ?? 0) > now && SCENARIOS[p.scenario].pushNearby);
    const others = here.length === 0 ? nearLive.filter((p) => !nearbyPinned.includes(p)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20) : [];
    return { pinned, here: rest, nearbyPinned, others };
  }, [live, mall, malls, now, cat]);

  const hereCount = feed.pinned.length + feed.here.length;
  const nothingAnywhere = live.length === 0;

  function pickFind(id: ScenarioId | undefined) {
    setFindOpen(false);
    navigate({ to: "/", search: id ? { cat: id } : {} });
    setTimeout(() => feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  function dismissHow() {
    setHowSeen(true);
    try {
      localStorage.setItem(HOW_KEY, "1");
    } catch {
      /* 私隱模式等等：唔記得都冇問題 */
    }
  }
  const walkMins = (p: Post) => {
    const m = mallById.get(p.mallId);
    return mall && m ? Math.max(1, Math.round(distanceM(mall.lat, mall.lng, m.lat, m.lng) / 80)) : null;
  };

  return (
    <AppLayout>
      {/* 黃色品牌頭：一句講價值，兩個大掣 */}
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

        <h1 className="text-[22px] font-black leading-snug">{TAGLINE}</h1>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setFindOpen(true)}
            className="bg-white rounded-3xl p-4 text-left shadow-sm active:scale-[0.98] transition-transform"
            aria-label="搵着數"
          >
            <div className="text-[40px] font-black leading-none">{FIND.word}</div>
            <div className="text-[13px] font-bold mt-2 leading-snug">{FIND.value}</div>
            <div className="text-[11px] text-[#1a1a1a]/60 mt-1 leading-snug">{FIND.cats}</div>
          </button>
          <Link
            to="/post/new"
            className="bg-[#1a1a1a] text-white rounded-3xl p-4 text-left shadow-sm active:scale-[0.98] transition-transform"
            aria-label="放出去"
          >
            <div className="text-[40px] font-black leading-none text-[#F5C518]">{GIVE.word}</div>
            <div className="text-[13px] font-bold mt-2 leading-snug">{GIVE.value}</div>
            <div className="text-[11px] text-white/60 mt-1 leading-snug">{GIVE.cats}</div>
          </Link>
        </div>

        {/* 位置：細細行，撳就揀商場 */}
        <button onClick={() => setPickerOpen(true)} className="w-full flex items-center gap-2 bg-white/60 rounded-2xl px-3.5 py-2.5 text-left">
          <MapPin className="w-4 h-4 text-[#E8642A] shrink-0" />
          <div className="flex-1 min-w-0 text-[13px] font-bold truncate">
            {mall ? `你喺 ${mall.name}` : "睇緊全港，揀商場睇附近"}
            <span className="font-normal text-[#1a1a1a]/60">
              {mall
                ? current.verified
                  ? "・GPS 已確認"
                  : testLocationAllowed()
                    ? "・測試位置"
                    : "・淨係睇緊"
                : geo.status === "denied"
                  ? "・冇開定位"
                  : ""}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-[#1a1a1a]/50" />
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

        {/* 第一次用：3 步講明 */}
        {!user.registered && !howSeen && <HowItWorks onClose={dismissHow} />}

        <div ref={feedRef} className="scroll-mt-4 space-y-3">
          <div className="flex items-end justify-between gap-2">
            <h2 className="text-lg font-black">
              {mall ? `${mall.name} 而家有 ${hereCount} 個着數` : "全港最新着數"}
            </h2>
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
            <Chip active={!cat} onClick={() => pickFind(undefined)}>全部</Chip>
            {SCENARIO_LIST.map((id) => (
              <Chip key={id} active={cat === id} onClick={() => pickFind(id)}>
                {SCENARIOS[id].emoji} {FIND_CATS[id].name}
              </Chip>
            ))}
          </div>

          {mall && hereCount === 0 && <EmptyHere mallName={mall.name} cat={cat} />}

          {feed.pinned.map((p) => (
            <PostCard key={p.id} post={p} mall={mallById.get(p.mallId)} now={now} />
          ))}
          {feed.nearbyPinned.map((p) => {
            const mins = walkMins(p);
            return <PostCard key={p.id} post={p} mall={mallById.get(p.mallId)} now={now} otherMallLabel={`${p.mallName}${mins ? `（行路約 ${mins} 分鐘）` : ""}`} />;
          })}
          {feed.here.map((p) => (
            <PostCard key={p.id} post={p} mall={mallById.get(p.mallId)} now={now} />
          ))}

          {feed.others.length > 0 && (
            <>
              {mall && <div className="text-sm font-bold pt-2">附近商場最新</div>}
              {feed.others.map((p) => (
                <PostCard key={p.id} post={p} mall={mallById.get(p.mallId)} now={now} otherMallLabel={p.mallName} />
              ))}
            </>
          )}

          {!mall && feed.others.length === 0 && !nothingAnywhere && <EmptyCat cat={cat} />}

          {/* 啱啱開始、全港都未有人放：講明點用，加幾張示範例子 */}
          {nothingAnywhere && <ColdStart showHow={user.registered || howSeen} />}
        </div>
      </div>

      <FindSheet open={findOpen} onClose={() => setFindOpen(false)} countBy={countBy} scopeLabel={mall ? mall.name : "全港"} onPick={pickFind} />

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

/** 「搵」：揀類別，見到每類有幾多 */
function FindSheet({
  open,
  onClose,
  countBy,
  scopeLabel,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  countBy: Map<ScenarioId, number>;
  scopeLabel: string;
  onPick: (id: ScenarioId | undefined) => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="想搵咩？">
      <div className="space-y-2 pb-2">
        {SCENARIO_LIST.map((id) => {
          const n = countBy.get(id) ?? 0;
          return (
            <button key={id} onClick={() => onPick(id)} className="w-full flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-left active:scale-[0.99] transition-transform">
              <span className="w-11 h-11 rounded-full grid place-items-center text-xl shrink-0" style={{ background: SCENARIOS[id].soft }} aria-hidden="true">
                {SCENARIOS[id].emoji}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-black">{FIND_CATS[id].name}</span>
                <span className="block text-xs text-muted-foreground">{FIND_CATS[id].head}</span>
              </span>
              <span className={n > 0 ? "text-xs font-bold text-[#E8642A] shrink-0" : "text-xs text-muted-foreground shrink-0"}>
                {n > 0 ? `${scopeLabel}有 ${n} 個` : "暫時未有"}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          );
        })}
        <button onClick={() => onPick(undefined)} className="w-full text-sm font-semibold text-muted-foreground py-2">
          睇晒全部
        </button>
      </div>
    </BottomSheet>
  );
}

function HowItWorks({ onClose }: { onClose?: () => void }) {
  return (
    <div className="relative bg-card rounded-2xl p-4 shadow-sm">
      {onClose && (
        <button onClick={onClose} aria-label="收埋點用" className="absolute top-2 right-2 w-8 h-8 grid place-items-center rounded-full hover:bg-accent">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
      <div className="font-black">第一次用？3 步就明</div>
      <ol className="mt-3 space-y-2.5">
        {HOW_STEPS.map((s, i) => (
          <li key={s.word} className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-[#F5C518] grid place-items-center font-black shrink-0" aria-label={`第 ${i + 1} 步`}>
              {s.word}
            </span>
            <span className="text-sm">{s.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 「話人知你要」：搵唔到嘅時候，下一步做咩 */
const ASK_FOR: Partial<Record<ScenarioId, { label: string; quick: QuickKind }>> = {
  parking: { label: "話人知你要泊車", quick: "want" },
  offer: { label: "話人知你想要咩優惠", quick: "offerwant" },
  groupbuy: { label: "自己開個夾單", quick: "groupbuy" },
};

function NotifyButton() {
  return (
    <button
      onClick={() => {
        aah.updateUser({ notifyOpportunities: true });
        toast.success("有新嘢會通知你");
      }}
      className="h-11 rounded-2xl border border-border font-semibold inline-flex items-center justify-center gap-1.5"
    >
      <Bell className="w-4 h-4" /> 有新嘢通知我
    </button>
  );
}

function EmptyHere({ mallName, cat }: { mallName: string; cat?: ScenarioId }) {
  const ask = cat ? ASK_FOR[cat] : undefined;
  return (
    <div className="bg-card rounded-2xl p-5 text-center space-y-3">
      <div className="font-bold">{cat ? `${mallName} 暫時未有人放${FIND_CATS[cat].name}` : `${mallName} 暫時未有人放`}</div>
      <div className="flex flex-col gap-2">
        {ask ? (
          <Link to="/post/new" search={{ quick: ask.quick }} className="h-11 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-bold grid place-items-center">
            {ask.label}
          </Link>
        ) : (
          <Link to="/post/new" className="h-11 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-bold grid place-items-center">
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
    <div className="bg-card rounded-2xl p-5 text-center space-y-3">
      <div className="font-bold">{cat ? `暫時未有人放${FIND_CATS[cat].name}` : "暫時未有人放"}</div>
      <div className="flex flex-col gap-2">
        {ask && (
          <Link to="/post/new" search={{ quick: ask.quick }} className="h-11 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-bold grid place-items-center">
            {ask.label}
          </Link>
        )}
        <NotifyButton />
      </div>
    </div>
  );
}

/** 示範例子：清楚標明唔係真 post，撳唔到 */
const EXAMPLES: { scenario: ScenarioId; shop: string; mall: string; info: string; price: string; extra?: string }[] = [
  { scenario: "parking", shop: "停車場", mall: "APM", info: "收據 $600・1 張紙單", price: "$30", extra: "可換 3 個鐘・慳 $42" },
  { scenario: "dining", shop: "鼎泰豐", mall: "朗豪坊", info: "A052・2 位", price: "免費", extra: "去咗第二間食，飛唔要" },
  { scenario: "offer", shop: "屈臣氏", mall: "海港城", info: "$50 現金券（今日到期）", price: "$20", extra: "慳 $30" },
];

function ColdStart({ showHow }: { showHow: boolean }) {
  return (
    <div className="space-y-3">
      <div className="bg-card rounded-2xl p-5 text-center space-y-3">
        <div className="font-bold">啱啱開始，仲未有人放</div>
        <p className="text-sm text-muted-foreground">做第一個：用唔着嘅收據、飛、券，放出去俾啱用嘅人。</p>
        <div className="flex flex-col gap-2">
          <Link to="/post/new" className="h-11 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-bold grid place-items-center">
            放出去
          </Link>
          <NotifyButton />
        </div>
      </div>
      {showHow && <HowItWorks />}
      <div className="text-xs font-bold text-muted-foreground pt-1">放出去大概係咁樣：</div>
      {EXAMPLES.map((e) => {
        const s = SCENARIOS[e.scenario];
        return (
          <div key={e.shop} aria-label="示範例子" className="bg-card/70 rounded-2xl border-l-[6px] border border-dashed border-border p-4 space-y-1.5" style={{ borderLeftColor: s.color, borderLeftStyle: "solid" }}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">示範例子</span>
              <span className="text-base font-black">{e.price}</span>
            </div>
            <div className="font-bold text-[15px]">
              {s.emoji} {e.shop}
              <span className="text-xs font-semibold text-muted-foreground">・{e.mall}</span>
            </div>
            <div className="text-sm text-foreground/80">{e.info}</div>
            {e.extra && <div className="text-sm font-bold text-[#2E9E6A]">{e.extra}</div>}
          </div>
        );
      })}
    </div>
  );
}
