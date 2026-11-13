import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { CatIcon, LiveDot } from "./CatIcon";
import { postSaving, priceLabel } from "./PostCard";
import { fmtAgo } from "@/lib/aah/geo";
import { actWord } from "@/lib/aah/act";
import { VERBS, type Verb } from "@/lib/aah/theme";
import { getRules } from "@/lib/aah/store";
import { postPriceCheck } from "@/lib/aah/rules";
import type { AahMall, Post } from "@/lib/aah/types";

/** 一行嘅標題：一眼睇到係咩 */
export function rowTitle(p: Post): string {
  const f = p.fields;
  switch (p.scenario) {
    case "parking":
      if (p.direction === "want") return `想要 ${f.hours} 個鐘泊車`;
      return f.hours ? `可換 ${f.hours} 個鐘泊車` : `單據 $${f.receiptAmount}`;
    case "dining":
      return `${p.shop} 飛號 ${f.queueNo}・${f.partySize} 位`;
    case "offer":
      return `${p.shop} ${f.title ?? ""}`.trim();
    case "groupbuy":
      return `${p.shop} ${f.deal ?? ""}`.trim();
  }
}

/** 列表一行：圖示、標題、價錢同幾耐前放，右邊直接撳 */
export function FeedRow({
  post,
  mall,
  now,
  meId,
  verb = "find",
  otherMall,
  onAct,
}: {
  post: Post;
  mall?: AahMall;
  now: number;
  meId: string;
  verb?: Verb;
  otherMall?: string;
  onAct: (p: Post) => void;
}) {
  const v = VERBS[verb];
  const pinned = (post.pinnedUntil ?? 0) > now;
  const saving = postSaving(post, mall, now);
  const price = priceLabel(post);
  const mine = post.interests.find((i) => i.userId === meId);
  const own = post.authorId === meId;

  const bits: string[] = [];
  const pcLevel = postPriceCheck(post, getRules(), mall, now)?.level;
  const overRef = pcLevel !== undefined && pcLevel !== "ok";
  if (overRef) bits.push("高過參考價");
  if (saving != null && saving > 0) bits.push(`慳 $${saving}`);
  if (post.scenario === "dining" && post.fields.calling)
    bits.push(`而家叫到 ${post.fields.calling}`);
  if (post.scenario === "groupbuy" && post.needCount) bits.push(`仲要 ${post.needCount} 人`);
  bits.push(`${fmtAgo(post.createdAt, now)}放上嚟`);
  if (otherMall) bits.push(otherMall);

  let action;
  if (own)
    action = <span className="text-xs font-bold text-muted-foreground px-2 shrink-0">你嘅</span>;
  else if (mine?.status === "accepted" && post.matchId)
    action = (
      <Link
        to="/match/$matchId"
        params={{ matchId: post.matchId }}
        className="h-11 px-3 rounded-[14px] text-[13px] font-black grid place-items-center shrink-0 text-white"
        style={{ background: v.strong }}
      >
        去見面
      </Link>
    );
  else if (mine?.status === "declined")
    action = <span className="text-xs text-muted-foreground px-2 shrink-0">已俾咗人</span>;
  else if (mine)
    action = (
      <span
        className="h-11 px-2.5 rounded-[14px] text-[13px] font-black flex items-center gap-1.5 shrink-0"
        style={{ background: v.soft, color: v.text }}
      >
        {mine.status === "pending" ? <LiveDot /> : <Check className="w-3.5 h-3.5" />}等緊佢應
      </span>
    );
  else
    action = (
      <button
        type="button"
        onClick={() => onAct(post)}
        className="h-11 px-3 rounded-[14px] text-[13px] font-black shrink-0 active:scale-95 transition-transform"
        style={{ background: v.soft, color: v.text }}
      >
        {actWord(post)}
      </button>
    );

  return (
    <div
      className="flex items-center gap-3 py-2.5 border-b border-[#F3ECE4] last:border-0"
      data-testid="feed-row"
    >
      <Link
        to="/post/$postId"
        params={{ postId: post.id }}
        className="flex-1 min-w-0 flex items-center gap-3"
      >
        <CatIcon scenario={post.scenario} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="font-black text-[15px] truncate">{rowTitle(post)}</span>
            {pinned && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-[#FFD9C2] text-[#6E2F0C] shrink-0">
                急
              </span>
            )}
          </span>
          <span className="block text-xs text-muted-foreground truncate">
            {price && <b className="text-foreground">{price}</b>}
            {price && "・"}
            {bits.join("・")}
          </span>
        </span>
      </Link>
      {action}
    </div>
  );
}
