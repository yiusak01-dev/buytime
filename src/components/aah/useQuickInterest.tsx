import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { RegisterSheet } from "./RegisterSheet";
import { aah, aahErrorText, isBanned } from "@/lib/aah/store";
import { useAahMalls } from "@/lib/aah/malls";
import { useCurrentMall } from "@/lib/aah/geo";
import { actWord, canActOn } from "@/lib/aah/act";
import type { Post } from "@/lib/aah/types";

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
      if (matchId) {
        toast.success("配對成功！");
        navigate({ to: "/match/$matchId", params: { matchId } });
      } else {
        toast.success("已話佢知", { description: "佢一應你就會通知你" });
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
