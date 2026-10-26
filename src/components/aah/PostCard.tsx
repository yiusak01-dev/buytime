import { Link } from "@tanstack/react-router";
import type { AahMall, Post } from "@/lib/aah/types";
import { SCENARIOS, keyInfo, payLabel, hasDiningReceipt } from "@/lib/aah/scenarios";
import { quoteParkingReceipt } from "@/lib/aah/pricing";
import { fmtClock, fmtLeft } from "@/lib/aah/geo";
import { ScenarioTag } from "./ui";

/** 呢個 post 可以慳幾多（顯示得比價錢大，強調係配對唔係買賣） */
export function postSaving(post: Post, mall: AahMall | undefined, now: number): number | null {
  if (post.scenario === "parking" && post.direction === "have" && mall) {
    const q = quoteParkingReceipt(mall, Number(post.fields.receiptAmount ?? 0), now, { dining: hasDiningReceipt(post.fields) });
    if (q.saving == null) return null;
    return Math.max(0, q.saving - (post.price ?? 0));
  }
  if (post.scenario === "offer" && post.direction === "have" && post.fields.faceValue) {
    return Math.max(0, Number(post.fields.faceValue) - (post.price ?? 0));
  }
  return null;
}

export function priceLabel(post: Post) {
  if (post.price == null) return post.scenario === "groupbuy" ? "一齊夾" : "";
  if (post.price === 0) return "免費";
  return post.direction === "want" ? `願意俾 $${post.price}` : `$${post.price}`;
}

export function PostCard({ post, mall, now, otherMallLabel }: { post: Post; mall?: AahMall; now: number; otherMallLabel?: string }) {
  const s = SCENARIOS[post.scenario];
  const pinned = (post.pinnedUntil ?? 0) > now;
  const saving = postSaving(post, mall, now);
  const left = post.leaveAt - now;

  return (
    <Link
      to="/post/$postId"
      params={{ postId: post.id }}
      className="block bg-card rounded-2xl shadow-[var(--shadow-card)] overflow-hidden border-l-[6px] active:scale-[0.99] transition-transform"
      style={{ borderLeftColor: s.color }}
    >
      <div className="p-4 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <ScenarioTag scenario={post.scenario} direction={post.direction} />
            {pinned && <span className="text-[10px] font-bold bg-[#F5C518] text-[#1a1a1a] px-1.5 py-0.5 rounded-full">急・置頂</span>}
          </div>
          <div className="text-base font-black text-[#1a1a1a] dark:text-white shrink-0">{priceLabel(post)}</div>
        </div>

        <div className="font-bold text-[15px] leading-snug">
          {post.shop}
          {otherMallLabel && <span className="text-xs font-semibold text-muted-foreground">・{otherMallLabel}</span>}
        </div>
        <div className="text-sm text-foreground/80">{keyInfo(post.scenario, post.direction, post.fields, post.needCount)}</div>
        {post.fields.remark && <div className="text-xs text-muted-foreground line-clamp-1">備注：{String(post.fields.remark)}</div>}

        {saving != null && saving > 0 && <div className="text-lg font-black text-[#2E9E6A]">慳 ${saving}</div>}

        {post.payMethods.length > 0 && post.price !== 0 && post.price != null && (
          <div className="text-xs text-muted-foreground">{payLabel(post.payMethods)}</div>
        )}

        <div className="flex items-center gap-3 text-xs pt-0.5 flex-wrap">
          <span className={left < 5 * 60000 ? "text-destructive font-semibold" : "text-muted-foreground"}>
            ⏰ {fmtClock(post.leaveAt)} 前{post.scenario === "dining" ? "叫號" : "喺度"}（{fmtLeft(left)}）
          </span>
          {post.verifiedOnSite && <span className="text-[#2E9E6A] font-semibold">📍 已確認喺場</span>}
        </div>
      </div>
    </Link>
  );
}
