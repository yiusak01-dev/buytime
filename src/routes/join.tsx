import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bell, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { TabHeader } from "@/components/aah/TabHeader";
import { LiveDot } from "@/components/aah/CatIcon";
import { useQuickInterest } from "@/components/aah/useQuickInterest";
import { aah, useAahState } from "@/lib/aah/store";
import { useAahMalls } from "@/lib/aah/malls";
import { fmtAgo, fmtLeft, useNow, useViewMall } from "@/lib/aah/geo";
import { FREE_LIMIT, VERBS } from "@/lib/aah/theme";
import type { Post } from "@/lib/aah/types";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "夾 · 啱啱好" },
      { name: "description", content: "第二件半價、買一送一，一個人買唔抵？喺商場搵人一齊夾。" },
    ],
  }),
  component: Join,
});

const J = VERBS.join;
const DEALS = [
  { title: "第二件半價", sub: "兩個人各買一件" },
  { title: "買一送一", sub: "一人一半錢" },
  { title: "買二送一", sub: "三個人分" },
  { title: "滿額減", sub: "夾夠數先有減" },
];

function Join() {
  const { user, posts } = useAahState();
  const { malls } = useAahMalls();
  const view = useViewMall(malls);
  const now = useNow(15000);
  const { interest, ask, sheet } = useQuickInterest();
  const mall = view.mall;

  const all = useMemo(
    () =>
      posts
        .filter((p) => p.scenario === "groupbuy" && p.status === "open" && p.leaveAt > now)
        .sort((a, b) => b.createdAt - a.createdAt),
    [posts, now],
  );
  const here = useMemo(() => (mall ? all.filter((p) => p.mallId === mall.id) : all), [all, mall]);
  const others = mall && here.length === 0 ? all.slice(0, 20) : [];
  const list = here.length ? here : others;
  const limited = !user.registered;
  const shown = limited ? list.slice(0, FREE_LIMIT) : list;
  const hidden = list.length - shown.length;
  const latest = here[0] ?? all[0];
  const ticker =
    latest && now - latest.createdAt < 3 * 3600 * 1000
      ? `${fmtAgo(latest.createdAt, now)}有人開咗 ${latest.shop} 夾單`
      : null;

  return (
    <AppLayout hideNav>
      <TabHeader active="join" />
      <div className="px-4 space-y-3">
        <Link
          to="/post/new"
          search={{ quick: "groupbuy" }}
          className="h-14 rounded-[20px] text-white text-base font-black flex items-center justify-center gap-2"
          style={{ background: J.strong }}
        >
          <Plus className="w-5 h-5" strokeWidth={2.6} />
          開個夾單
        </Link>

        {list.length > 0 ? (
          <>
            <div className="flex items-center justify-between gap-2 pt-1">
              <h1 className="text-sm font-bold text-muted-foreground">
                {here.length
                  ? `${mall?.name ?? "全港"}有 ${here.length} 張夾單等緊人`
                  : `${mall?.name} 暫時未有夾單，以下係全港嘅`}
              </h1>
              {ticker && (
                <span
                  className="text-xs font-bold flex items-center gap-1.5 min-w-0"
                  data-testid="join-ticker"
                >
                  <LiveDot />
                  <span className="truncate">{ticker}</span>
                </span>
              )}
            </div>
            {shown.map((p) => (
              <JoinCard
                key={p.id}
                post={p}
                now={now}
                meId={user.id}
                showMall={!here.length}
                onJoin={interest}
              />
            ))}
            {hidden > 0 && (
              <div
                className="bg-card rounded-3xl p-5 flex flex-col items-center gap-2 shadow-[var(--shadow-card)]"
                data-testid="lock-card"
              >
                <span className="text-[15px] font-black flex items-center gap-1.5">
                  <Lock className="w-4 h-4" />
                  仲有 {hidden} 單
                </span>
                <button
                  onClick={() => ask("登記咗就睇晒全部，免費")}
                  className="h-11 px-5 rounded-[14px] text-white text-sm font-black"
                  style={{ background: VERBS.find.strong }}
                >
                  登記睇晒（免費）
                </button>
              </div>
            )}
          </>
        ) : (
          <Empty mallName={mall?.name} />
        )}
      </div>
      {sheet}
    </AppLayout>
  );
}

function JoinCard({
  post,
  now,
  meId,
  showMall,
  onJoin,
}: {
  post: Post;
  now: number;
  meId: string;
  showMall: boolean;
  onJoin: (p: Post) => void;
}) {
  const need = Math.max(0, post.needCount ?? 1);
  const mine = post.interests.find((i) => i.userId === meId);
  const own = post.authorId === meId;
  let action;
  if (own) action = <span className="text-xs font-bold text-muted-foreground">你開嘅</span>;
  else if (mine?.status === "accepted" && post.matchId)
    action = (
      <Link
        to="/match/$matchId"
        params={{ matchId: post.matchId }}
        className="h-11 px-4 rounded-[14px] text-white font-black grid place-items-center"
        style={{ background: J.strong }}
      >
        去見面
      </Link>
    );
  else if (mine)
    action = (
      <span
        className="h-11 px-3 rounded-[14px] text-[13px] font-black flex items-center gap-1.5"
        style={{ background: J.soft, color: J.text }}
      >
        <LiveDot />
        等緊佢應
      </span>
    );
  else
    action = (
      <button
        onClick={() => onJoin(post)}
        className="h-11 px-5 rounded-[14px] text-white font-black active:scale-95 transition-transform"
        style={{ background: J.strong }}
      >
        我夾
      </button>
    );
  return (
    <div
      className="bg-card rounded-3xl p-4 space-y-2.5 shadow-[var(--shadow-card)]"
      data-testid="join-card"
    >
      <Link to="/post/$postId" params={{ postId: post.id }} className="block space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-black truncate">
            {post.shop}
            {showMall && (
              <span className="text-xs font-bold text-muted-foreground">・{post.mallName}</span>
            )}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {fmtLeft(post.leaveAt - now)}
          </span>
        </div>
        <div className="text-[15px] font-bold">
          {String(post.fields.deal ?? "")}
          {post.fields.note ? `・${post.fields.note}` : ""}
        </div>
      </Link>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="w-7 h-7 rounded-full"
            style={{ background: "#A9E5C4" }}
          />
          {Array.from({ length: Math.min(need, 3) }).map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="w-7 h-7 rounded-full border-2 border-dashed"
              style={{ borderColor: J.strong }}
            />
          ))}
          <span className="text-[13px] font-black" style={{ color: J.text }}>
            仲要 {need} 人
          </span>
        </div>
        {action}
      </div>
    </div>
  );
}

function Empty({ mallName }: { mallName?: string }) {
  return (
    <div className="space-y-4 pt-1">
      <div className="bg-card rounded-[26px] p-5 space-y-3">
        <div className="text-xs font-bold text-muted-foreground">
          {mallName ? `${mallName} 暫時未有人開夾單` : "暫時未有人開夾單"}
        </div>
        <h1 className="text-[22px] font-black leading-snug">
          一個人買唔抵？
          <br />
          開個夾單，搵人分
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          見到第二件半價、買一送一，自己用唔晒？開個夾單，附近想買嘅人會撳「我夾」，喺舖頭門口見面一齊埋單。
        </p>
      </div>
      <div className="space-y-2">
        <div className="text-sm font-black">商場常見可以夾嘅優惠</div>
        <div className="grid grid-cols-2 gap-2.5">
          {DEALS.map((d) => (
            <Link
              key={d.title}
              to="/post/new"
              search={{ quick: "groupbuy" }}
              className="bg-card rounded-[18px] px-3.5 py-3"
            >
              <div className="font-black">{d.title}</div>
              <div className="text-xs text-muted-foreground">{d.sub}</div>
            </Link>
          ))}
        </div>
      </div>
      <button
        onClick={() => {
          aah.updateUser({ notifyOpportunities: true });
          toast.success("有人開夾單會通知你");
        }}
        className="w-full h-12 rounded-2xl border border-border font-bold inline-flex items-center justify-center gap-1.5"
      >
        <Bell className="w-4 h-4" /> 有人開夾單通知我
      </button>
    </div>
  );
}
