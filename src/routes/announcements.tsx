import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { Bell, Megaphone } from "lucide-react";
import { useEffect, useState } from "react";
import { ownSupabase as rawSupabase } from "@/integrations/supabase/own-client";
import { requireSignedIn } from "@/lib/auth-guard";

const supabase = rawSupabase as any;

type Notification = {
  id: string;
  title: string;
  body: string;
  chat_id: string | null;
  is_read: boolean;
  created_at: string;
};

const PLATFORM_ANNOUNCEMENTS = [
  { id: "a1", title: "歡迎使用買時間！", body: "歡迎使用買時間！如有問題請聯絡我們。" },
  { id: "a2", title: "推送通知已啟用", body: "推送通知已啟用，交易及新盤即時通知你。" },
];

export const Route = createFileRoute("/announcements")({
  beforeLoad: requireSignedIn,
  head: () => ({
    meta: [
      { title: "通告 · 買時間" },
      { name: "description", content: "查看買時間平台公告及你的交易通知記錄" },
      { property: "og:title", content: "通告 · 買時間" },
      { property: "og:description", content: "查看買時間平台公告及你的交易通知記錄" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnnouncementsPage,
});

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins} 分鐘前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小時前`;
  return `${Math.floor(hrs / 24)} 日前`;
}

function AnnouncementsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const today = new Date().toLocaleDateString("zh-HK");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (!uid) return;
        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(50);
        if (cancelled) return;
        if (error) {
          setTableMissing(true);
        } else {
          setItems((data ?? []) as Notification[]);
          const unreadIds = (data ?? []).filter((n: Notification) => !n.is_read).map((n: Notification) => n.id);
          if (unreadIds.length) {
            await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
          }
        }
      } catch {
        if (!cancelled) setTableMissing(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <AppLayout title="通告">
      <div className="px-4 py-5 space-y-6">
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Megaphone className="w-4 h-4" /> 平台公告
          </h2>
          {PLATFORM_ANNOUNCEMENTS.map((a) => (
            <article key={a.id} className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-sm">{a.title}</h3>
                <span className="text-[11px] text-muted-foreground shrink-0">{today}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{a.body}</p>
            </article>
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Bell className="w-4 h-4" /> 我的通知
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">載入中…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {tableMissing ? "通知功能即將推出" : "暫無通知"}
            </p>
          ) : (
            items.map((n) => (
              <article key={n.id} className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-sm">{n.title}</h3>
                  <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{n.body}</p>
              </article>
            ))
          )}
        </section>
      </div>
    </AppLayout>
  );
}
