import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { demoAudience } from "./malls";
import { useAahMode } from "./store";

/** 少過呢個數唔顯示人數（免得認到個別用戶，亦唔好令人覺得冷清） */
export const LIVE_MIN = 10;

export type LivePeople = { total: number | null; malls: Record<string, number> };

/**
 * 即時人數：30 分鐘內喺商場開過 app 嘅登記用戶（伺服器已經濾走少過 10 人嘅商場）。
 * 示範模式用估計數字，畫面已經標明係示範。
 */
export function useLivePeople() {
  const mode = useAahMode();
  const q = useQuery<LivePeople>({
    queryKey: ["aah", "livePeople"],
    enabled: mode === "remote",
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("aah_live_counts" as never);
      if (error) throw error;
      const d = (data ?? {}) as Partial<LivePeople>;
      return { total: d.total ?? null, malls: d.malls ?? {} };
    },
  });
  const demo = mode === "local";
  return {
    /** 呢個商場而家幾多人；未夠 LIVE_MIN 就 null */
    at(mallId: string | undefined | null): number | null {
      if (!mallId) return null;
      const n = demo ? demoAudience(mallId) : (q.data?.malls[mallId] ?? null);
      return n != null && n >= LIVE_MIN ? n : null;
    },
    total: demo ? null : q.data?.total != null && q.data.total >= LIVE_MIN ? q.data.total : null,
  };
}
