import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Camera } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { TabHeader } from "@/components/aah/TabHeader";
import { FeedRow, rowTitle } from "@/components/aah/FeedRow";
import { CatIcon, LiveDot } from "@/components/aah/CatIcon";
import { CatGroup } from "@/components/aah/Group";
import { priceLabel } from "@/components/aah/PostCard";
import { useQuickInterest } from "@/components/aah/useQuickInterest";
import { useAahState } from "@/lib/aah/store";
import { setPendingPhoto } from "@/lib/aah/pendingPhoto";
import { useAahMalls } from "@/lib/aah/malls";
import { fmtAgo, fmtLeft, useNow, useViewMall } from "@/lib/aah/geo";
import { useLivePeople } from "@/lib/aah/live";
import { CAT_STYLE, PARKING_EXPLAIN, VERBS } from "@/lib/aah/theme";
import type { Post, ScenarioId } from "@/lib/aah/types";
import type { QuickKind } from "./post.new";

export const Route = createFileRoute("/give")({
  head: () => ({
    meta: [
      { title: "放 · 啱啱好" },
      {
        name: "description",
        content: "用唔着嘅泊車單、排隊飛、優惠券，影相放出去，交俾啱用嘅人；或者開個夾單。",
      },
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

  const ACTIONS: { id: ScenarioId; sub: string; quick: QuickKind; action: string }[] = [
    { id: "dining", sub: "唔去食，張飛轉俾人", quick: "dining", action: "放出去" },
    { id: "offer", sub: "用唔晒嘅優惠券", quick: "offer", action: "放出去" },
    { id: "groupbuy", sub: "一個人買唔抵？搵人一齊買", quick: "groupbuy", action: "開夾單" },
  ];

  const wantRows = (id: ScenarioId) => {
    const list = wants.filter((p) => p.scenario === id).slice(0, 20);
    if (!list.length) return null;
    return (
      <div className="pt-1">
        <div className="text-xs font-black text-muted-foreground pt-1">有人想要</div>
        {list.map((p) => (
          <FeedRow
            key={p.id}
            post={p}
            mall={mallById.get(p.mallId)}
            now={now}
            meId={user.id}
            verb="give"
            onAct={interest}
            hideIcon
          />
        ))}
      </div>
    );
  };
  const mineRows = (id: ScenarioId) => {
    const list = mine.filter((p) => p.scenario === id);
    if (!list.length) return null;
    return (
      <div className="space-y-2 pt-2">
        <div className="text-xs font-black text-muted-foreground">你放咗嘅</div>
        {list.map((p) => (
          <MyPost key={p.id} post={p} now={now} />
        ))}
      </div>
    );
  };

  return (
    <AppLayout hideNav tint={VERBS.give.page}>
      <TabHeader active="give" />
      <div className="px-4 space-y-3">
        {demand && (
          <span
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-card text-[13px] font-bold"
            data-testid="give-demand"
          >
            <LiveDot />
            {demand}
          </span>
        )}

        <CatGroup tone="give" scenario="parking">
          {/* 泊車單：一撳就開相機，影完自動讀總數 */}
          <label
            className="flex items-center gap-3 py-2 cursor-pointer active:scale-[0.99] transition-transform"
            data-testid="give-parking"
          >
            <span className="flex-1 min-w-0 text-sm text-muted-foreground">{PARKING_EXPLAIN}</span>
            <span
              className="h-11 px-3.5 rounded-[14px] text-white text-sm font-black flex items-center gap-1.5 shrink-0"
              style={{ background: G.strong }}
            >
              <Camera className="w-4 h-4" />
              影相放出去
            </span>
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
          {wantRows("parking")}
          {mineRows("parking")}
        </CatGroup>

        {ACTIONS.map((a) => (
          <CatGroup tone="give" key={a.id} scenario={a.id}>
            <Link
              to="/post/new"
              search={{ quick: a.quick }}
              className="flex items-center gap-3 py-2 active:scale-[0.99] transition-transform"
            >
              <span className="flex-1 min-w-0 text-sm text-muted-foreground">{a.sub}</span>
              <span
                className="h-11 px-3.5 rounded-[14px] text-sm font-black grid place-items-center shrink-0"
                style={{ background: G.soft, color: G.text }}
              >
                {a.action}
              </span>
            </Link>
            {wantRows(a.id)}
            {mineRows(a.id)}
          </CatGroup>
        ))}
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
        <CatIcon tone="give" scenario={post.scenario} />
        <div className="flex-1 min-w-0">
          <div className="font-black text-[15px] truncate">
            {rowTitle(post)}
            {price ? `・${price}` : ""}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {matched
              ? "已經配對"
              : pending.length
                ? `最新一個 ${fmtAgo(latest, now)}撳咗有興趣`
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
