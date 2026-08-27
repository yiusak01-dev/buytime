import { useEffect, useState } from "react";
import { ownSupabase as rawSupabase } from "@/integrations/supabase/own-client";

const supabase = rawSupabase as any;

/** True when the signed-in user has at least one unread notification. */
export function useUnreadNotifications() {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (!uid || cancelled) return;
        const { data, error } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", uid)
          .eq("is_read", false)
          .limit(1);
        if (!cancelled && !error) setHasUnread((data ?? []).length > 0);
      } catch {
        /* table may not exist yet */
      }
    }

    check();
    const timer = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return hasUnread;
}
