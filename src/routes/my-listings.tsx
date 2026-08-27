import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ownSupabase } from "@/integrations/supabase/own-client";
import { requireSignedIn } from "@/lib/auth-guard";

export const Route = createFileRoute("/my-listings")({
  beforeLoad: requireSignedIn,
  head: () => ({
    meta: [
      { title: "我的放單 · 買時間" },
      { name: "description", content: "查看及管理你在買時間放售中的泊車收據" },
      { property: "og:title", content: "我的放單 · 買時間" },
      { property: "og:description", content: "查看及管理你在買時間放售中的泊車收據" },
    ],
  }),
  component: MyListingsPage,
});

const STATUS_LABEL: Record<string, string> = {
  active: "放售中",
  sold: "已售出",
  expired: "已過期",
  cancelled: "已下架",
};

function statusTone(status: string) {
  if (status === "active") return "bg-success/10 text-success";
  if (status === "sold") return "bg-primary/10 text-primary";
  return "bg-muted text-muted-foreground";
}

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("zh-HK", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function MyListingsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error } = await ownSupabase
      .from("listings")
      .select("id,mall_name,merchant_name,asking_price,parking_hours,status,created_at,expires_at")
      .eq("seller_id", uid)
      .order("created_at", { ascending: false });
    if (error) toast.error("載入失敗：" + error.message);
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function cancelListing(id: string) {
    setBusyId(id);
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) { setBusyId(null); return; }

    // Check if any transaction already exists for this listing (direct DB, no edge function)
    const { data: txs } = await (supabase as any)
      .from("transactions")
      .select("id")
      .eq("listing_id", id)
      .limit(1);

    if (Array.isArray(txs) && txs.length > 0) {
      setBusyId(null);
      toast.error("已有買家對此放單感興趣，無法下架");
      return;
    }

    // Update directly via DB (no edge function needed)
    const { error } = await (supabase as any)
      .from("listings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("seller_id", uid);

    setBusyId(null);
    if (error) {
      toast.error("下架失敗：" + error.message);
      return;
    }
    toast("已下架");
    load();
  }

  return (
    <div className="app-shell pb-16">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md px-4 pt-4 pb-3 border-b border-border/60 flex items-center gap-2">
        <button
          onClick={() => navigate({ to: "/profile" })}
          className="w-9 h-9 -ml-2 grid place-items-center rounded-full hover:bg-accent"
          aria-label="返回"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold leading-tight">我的放單</h1>
      </header>

      <main className="px-4 py-5 space-y-3">
        {loading && <div className="text-sm text-muted-foreground text-center py-10">載入中…</div>}

        {!loading && rows.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-10">你暫時未有放售中的收據</div>
        )}

        {rows.map((r) => (
          <div key={r.id} className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)] space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{r.mall_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground truncate">{r.merchant_name ?? "—"}</div>
              </div>
              <span
                className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md ${statusTone(r.status)}`}
              >
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>有效期至 {fmt(r.expires_at)}</span>
              <span className="text-base font-bold text-foreground">HK${Number(r.asking_price ?? 0)}</span>
            </div>
            {r.status === "active" && (
              <button
                disabled={busyId === r.id}
                onClick={() => cancelListing(String(r.id))}
                className="w-full h-10 rounded-xl border border-destructive/40 text-destructive text-sm font-semibold disabled:opacity-50"
              >
                {busyId === r.id ? "處理中…" : "下架"}
              </button>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
