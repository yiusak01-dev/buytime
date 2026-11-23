import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useAahState } from "@/lib/aah/store";
import { useNow } from "@/lib/aah/geo";
import { rowTitle } from "./FeedRow";

type Item = { key: string; to: "/match/$matchId" | "/post/$postId"; id: string; title: string; sub: string; hot: boolean };

/**
 * 「搵」「放」頂部：進行中嘅配對、等緊回覆嘅對話、有人想要你個 post。
 * 一撳就返去，唔使入「我的」再搵。
 */
export function LiveBanner() {
  const { user, posts, matches } = useAahState();
  const now = useNow(15000);
  if (!user.registered) return null;

  const items: Item[] = [];
  for (const m of matches) {
    if (m.status !== "active" || !m.participants.some((p) => p.userId === user.id)) continue;
    const post = posts.find((p) => p.id === m.postId);
    const last = m.messages.filter((x) => x.from !== "system").at(-1);
    const myRead = m.readAt?.[user.id];
    const unread = !!last && last.from !== user.id && (myRead == null || last.at > myRead);
    const who = last ? m.participants.find((p) => p.userId === last.from)?.name ?? "對方" : "";
    items.push({
      key: `m:${m.id}`,
      to: "/match/$matchId",
      id: m.id,
      title: `配對緊・${post ? rowTitle(post) : m.scenario === "parking" ? "泊車單" : m.shop}`,
      sub: unread ? `${who}：${last!.text}` : `見面：${m.meetPlace}`,
      hot: unread,
    });
  }
  for (const p of posts) {
    if (p.status !== "open" || p.leaveAt <= now) continue;
    if (p.authorId === user.id) {
      const pending = p.interests.filter((i) => i.status === "pending");
      if (!pending.length) continue;
      const fresh = pending.some((i) => {
        const last = i.messages.at(-1);
        return !!last && last.from !== user.id && last.at > (i.authorReadAt ?? 0);
      });
      items.push({
        key: `p:${p.id}`,
        to: "/post/$postId",
        id: p.id,
        title: `${pending.length} 個人想要你個「${rowTitle(p)}」`,
        sub: fresh ? "有新訊息，揀邊個" : "撳入去揀邊個",
        hot: fresh,
      });
      continue;
    }
    const mine = p.interests.find((i) => i.userId === user.id && i.status === "pending");
    if (!mine) continue;
    const last = mine.messages.at(-1);
    const replied = !!last && last.from !== user.id;
    items.push({
      key: `i:${p.id}`,
      to: "/post/$postId",
      id: p.id,
      title: rowTitle(p),
      sub: replied ? `${p.authorName || "對方"}：${last!.text}` : `等緊 ${p.authorName || "對方"} 覆`,
      hot: replied && last!.at > (mine.buyerReadAt ?? 0),
    });
  }
  if (!items.length) return null;
  // 有新嘢嘅排頭；最多出三行，唔好遮晒個 feed
  items.sort((a, b) => Number(b.hot) - Number(a.hot));

  return (
    <div className="space-y-2" data-testid="live-banner">
      {items.slice(0, 3).map((it) => (
        <Link
          key={it.key}
          to={it.to}
          params={it.to === "/match/$matchId" ? { matchId: it.id } : { postId: it.id }}
          className="flex items-center gap-3 rounded-2xl bg-[#1a1a1a] text-white px-4 py-3"
        >
          {it.hot && <span className="w-2 h-2 rounded-full bg-[#F5C518] shrink-0" aria-label="新訊息" />}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-black truncate">{it.title}</div>
            <div className="text-xs opacity-75 truncate">{it.sub}</div>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 opacity-70" />
        </Link>
      ))}
    </div>
  );
}
