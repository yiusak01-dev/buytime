import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useUnreadChats() {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (!uid || cancelled) return;

      const { data: txs } = await supabase
        .from("transactions")
        .select("id")
        .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`);

      if (!txs?.length || cancelled) return;

      const { data: reads } = await (supabase as any)
        .from("chat_reads")
        .select("transaction_id, last_read_at")
        .eq("user_id", uid);

      const readMap = new Map(
        ((reads ?? []) as { transaction_id: string; last_read_at: string }[])
          .map((r) => [r.transaction_id, r.last_read_at])
      );

      for (const tx of txs) {
        const lastRead = readMap.get(tx.id);
        let query = (supabase as any)
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("transaction_id", tx.id)
          .neq("sender_id", uid);

        if (lastRead) query = query.gt("created_at", lastRead);

        const { count } = await query;
        if (count && count > 0) {
          if (!cancelled) setHasUnread(true);
          return;
        }
      }

      if (!cancelled) setHasUnread(false);
    }

    check();
    const interval = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return hasUnread;
}
