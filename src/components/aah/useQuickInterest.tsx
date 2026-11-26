import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { RegisterSheet } from "./RegisterSheet";
import { aah, aahErrorText, isBanned } from "@/lib/aah/store";
import { useAahMalls } from "@/lib/aah/malls";
import { useCurrentMall } from "@/lib/aah/geo";
import { actWord, canActOn } from "@/lib/aah/act";
import type { Post } from "@/lib/aah/types";
import { done } from "@/lib/aah/notify";

/**
 * 列表直接撳「有興趣／我夾」：
 * 未登記 → 彈登記，登記完自動幫你撳；未到商場 → 入詳情（可以話對方知你去緊）。
 */
export function useQuickInterest() {
  const navigate = useNavigate();
  const { malls } = useAahMalls();
  const current = useCurrentMall(malls);
  const [gate, setGate] = useState<{ reason: string; after?: () => void } | null>(null);
  const busy = useRef<Set<string>>(new Set());

  function ask(reason: string, after?: () => void) {
    setGate({ reason, after });
  }

  async function interest(p: Post) {
    const me = aah.get().user;
    const word = actWord(p);
    if (!me.registered) {
      ask(`登記咗先撳得「${word}」`, () => void interest(p));
      return;
    }
    if (isBanned(me) || !canActOn(p, current, malls)) {
      navigate({ to: "/post/$postId", params: { postId: p.id } });
      return;
    }
    if (busy.current.has(p.id)) return;
    busy.current.add(p.id);
    try {
      const matchId = await aah.expressInterest(
        p.id,
        word,
        undefined,
        current.verified ? { onSite: true } : undefined,
      );
      // 撳完直接入去：即刻配對就去交收版面；未配對就去詳情頁等（對方一揀你會自動跳去交收版面）
      const now = aah.get().posts.find((x) => x.id === p.id);
      const mid = matchId ?? (now?.interests.some((i) => i.userId === me.id && i.status === "accepted") ? now?.matchId : undefined);
      if (mid) {
        done("配對成功！");
        navigate({ to: "/match/$matchId", params: { matchId: mid } });
      } else {
        done("已話佢知", "喺度等佢覆，佢揀你就會自動入交收版面");
        navigate({ to: "/post/$postId", params: { postId: p.id } });
      }
    } catch (e) {
      toast.error(aahErrorText(e));
    } finally {
      busy.current.delete(p.id);
    }
  }

  const sheet = (
    <RegisterSheet
      open={!!gate}
      reason={gate?.reason}
      onClose={() => setGate(null)}
      onDone={() => {
        const after = gate?.after;
        setGate(null);
        if (after) setTimeout(after, 0);
      }}
    />
  );

  return { interest, ask, sheet };
}
