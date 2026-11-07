import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Camera } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { TabHeader } from "@/components/aah/TabHeader";
import { FeedRow, rowTitle } from "@/components/aah/FeedRow";
import { CatIcon, LiveDot } from "@/components/aah/CatIcon";
import { priceLabel } from "@/components/aah/PostCard";
import { useQuickInterest } from "@/components/aah/useQuickInterest";
import { useAahState } from "@/lib/aah/store";
import { setPendingPhoto } from "@/lib/aah/pendingPhoto";
import { useAahMalls } from "@/lib/aah/malls";
import { fmtAgo, fmtLeft, useNow, useViewMall } from "@/lib/aah/geo";
import { useLivePeople } from "@/lib/aah/live";
import { CAT_STYLE, VERBS } from "@/lib/aah/theme";
import type { Post, ScenarioId } from "@/lib/aah/types";

export const Route = createFileRoute("/give")({
  head: () => ({
    meta: [
      { title: "放 · 啱啱好" },
      { name: "description", content: "用唔着嘅泊車收據、餐廳飛、優惠券，影相放出去，換返錢。" },
    ],
  }),
  component: Give,
});

const G = VERBS.give;

function Give() {
  const navigate = useNavigate();
  const { user, posts } = useAahState();
  const { malls } = useAahMalls();
  const view = useViewMall(malls);
  const now = useNow(15000);
  const live = useLivePeople();
  const { interest, sheet } = useQuickInterest();
  const mall = view.mall;
  const mallById = useMemo(() => new Map(malls.map((m) => [m.id, m])), [malls]);

  const mine = useMemo(
    () =>
      user.registered
        ? posts
            .filter(
              (p) =>
                p.authorId === user.id &&
                ((p.status === "open" && p.leaveAt > now) ||
                  (p.status === "matched" && p.matchId && now - p.createdAt < 12 * 3600 * 1000)),
            )
            .sort((a, b) => b.createdAt - a.createdAt)
        : [],
    [posts, user.id, user.registered, now],
  );
  // 有人話要：你有就撳「我有」
  const wants = useMemo(
    () =>
      posts
        .filter(
          (p) =>
            p.status === "open" &&
            p.leaveAt > now &&
            p.direction === "want" &&
            p.authorId !== user.id &&
            (!mall || p.mallId === mall.id),
        )
        .sort((a, b) => b.createdAt - a.createdAt),
    [posts, now, user.id, mall],
  );

  const demand = useMemo(() => {
    const where = mall?.name ?? "全港";
    if (wants.length) {
      const by = new Map<ScenarioId, number>();
      for (const p of wants) by.set(p.scenario, (by.get(p.scenario) ?? 0) + 1);
      const [top] = [...by.entries()].sort((a, b) => b[1] - a[1]);
      return `${where} 而家 ${wants.length} 個人想要${by.size === 1 ? CAT_STYLE[top[0]].name : "嘢"}`;
    }
    const n = live.at(mall?.id) ?? (mall ? null : live.total);
    return n ? `${where} 而家 ${n} 人用緊` : null;
  }, [wants, mall, live]);

  return (
    <AppLayout hideNav>
      <TabHeader active="give" />
      <div className="px-4 space-y-4">
        <div className="rounded-[28px] p-5 space-y-3.5" style={{ background: G.soft }}>
          <div className="space-y-1" style={{ color: G.text }}>
            <h1 className="text-[21px] font-black">放你用唔着嘅收據、排隊飛、優惠券</h1>
            <p className="text-[13px] font-bold">影相放上嚟，有人要就喺商場見面收錢</p>
          </div>
          {demand && (
            <span
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-card text-[13px] font-bold"
              data-testid="give-demand"
            >
              <LiveDot />
              {demand}
            </span>
          )}
          {/* 影相：直接開相機，影完自動讀總數（泊車收據） */}
          <label
            className="h-14 rounded-[20px] text-white text-[17px] font-black flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition-transform"
            style={{ background: G.strong }}
          >
            <Camera className="w-5 h-5" />
            影泊車收據
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              data-testid="give-camera"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setPendingPhoto(f);
                navigate({ to: "/post/new", search: { quick: "receipt" } });
              }}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <Link
              to="/post/new"
              search={{ quick: "dining" }}
              className="h-11 rounded-2xl bg-card text-sm font-black grid place-items-center"
            >
              餐廳排隊飛
            </Link>
            <Link
              to="/post/new"
              search={{ quick: "offer" }}
              className="h-11 rounded-2xl bg-card text-sm font-black grid place-items-center"
            >
              優惠券
            </Link>
            <Link
              to="/post/new"
              className="h-11 rounded-2xl bg-card text-sm font-bold grid place-items-center text-muted-foreground"
            >
              自己揀
            </Link>
          </div>
        </div>

        {mine.length > 0 && (
          <section className="space-y-2.5">
            <h2 className="text-base font-black">你放咗嘅</h2>
            {mine.map((p) => (
              <MyPost key={p.id} post={p} now={now} />
            ))}
          </section>
        )}

        {wants.length > 0 && (
          <section className="space-y-2.5">
            <h2 className="text-base font-black">有人想要</h2>
            <div className="bg-card rounded-3xl px-3.5 py-1.5 shadow-[var(--shadow-card)]">
              {wants.slice(0, 20).map((p) => (
                <FeedRow
                  key={p.id}
                  post={p}
                  mall={mallById.get(p.mallId)}
                  now={now}
                  meId={user.id}
                  verb="give"
                  onAct={interest}
                />
              ))}
            </div>
          </section>
        )}

        {mine.length === 0 && (
          <div className="bg-card rounded-3xl p-4 space-y-2.5">
            <div className="text-sm font-black">點樣放</div>
            {[
              "影張收據，總數同可換幾多個鐘會自動計",
              "揀價錢：建議價已經揀好，唔改都得",
              "有人撳有興趣，你揀人，喺商場見面交收",
            ].map((t, i) => (
              <div key={t} className="flex items-center gap-3 text-sm">
                <span
                  className="w-7 h-7 rounded-full grid place-items-center text-xs font-black shrink-0"
                  style={{ background: G.soft, color: G.text }}
                >
                  {i + 1}
                </span>
                {t}
              </div>
            ))}
          </div>
        )}
      </div>
      {sheet}
    </AppLayout>
  );
}

function MyPost({ post, now }: { post: Post; now: number }) {
  const pending = post.interests.filter((i) => i.status === "pending");
  const latest = pending.reduce((a, i) => Math.max(a, i.at), 0);
  const price = priceLabel(post);
  const matched = post.status === "matched" && post.matchId;
  return (
    <div
      className="bg-card rounded-3xl p-4 space-y-3 shadow-[var(--shadow-card)]"
      data-testid="my-post"
    >
      <div className="flex items-center gap-3">
        <CatIcon scenario={post.scenario} />
        <div className="flex-1 min-w-0">
          <div className="font-black text-[15px] truncate">
            {rowTitle(post)}
            {price ? `・${price}` : ""}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {matched
              ? "已經配對"
              : pending.length
                ? `最新一個 ${fmtAgo(latest, now)}撳`
                : `等緊人撳有興趣・${fmtLeft(post.leaveAt - now)}`}
          </div>
        </div>
        {pending.length > 0 && !matched && (
          <span
            className="h-7 px-2.5 rounded-full text-xs font-black flex items-center gap-1.5 shrink-0"
            style={{ background: G.soft, color: G.text }}
          >
            <LiveDot />
            {pending.length} 人有興趣
          </span>
        )}
      </div>
      {matched ? (
        <Link
          to="/match/$matchId"
          params={{ matchId: post.matchId! }}
          className="h-12 rounded-2xl text-white font-black grid place-items-center"
          style={{ background: VERBS.find.strong }}
        >
          去見面
        </Link>
      ) : pending.length > 0 ? (
        <Link
          to="/post/$postId"
          params={{ postId: post.id }}
          className="h-12 rounded-2xl text-white font-black grid place-items-center"
          style={{ background: G.strong }}
        >
          揀人
        </Link>
      ) : (
        <Link
          to="/post/$postId"
          params={{ postId: post.id }}
          className="h-11 rounded-2xl border border-border font-bold grid place-items-center text-sm"
        >
          睇吓
        </Link>
      )}
    </div>
  );
}
