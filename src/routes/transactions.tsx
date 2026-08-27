import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { formatHKD } from "@/lib/fees";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Inbox, ChevronRight } from "lucide-react";
import { ownSupabase } from "@/integrations/supabase/own-client";
import { supabase } from "@/integrations/supabase/client";
import { fetchOwnTransactions } from "@/lib/own-db";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { requireSignedIn } from "@/lib/auth-guard";

export const Route = createFileRoute("/transactions")({
  beforeLoad: requireSignedIn,
  head: () => ({ meta: [{ title: "我的交易 · 買時間" }] }),
  component: Transactions,
});

type Listing = {
  id: string;
  mall_name?: string | null;
  merchant_name?: string | null;
  asking_price?: number | null;
  parking_hours?: number | null;
  status?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
};

type Tx = {
  id: string;
  mall_name?: string | null;
  sale_price?: number | null;
  listing_price?: number | null;
  receipt_amount?: number | null;
  status?: string | null;
  created_at?: string | null;
};

function formatTime(ts: string | null | undefined, t: (k: any, o?: any) => string) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.minsAgo", { mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("time.hoursAgo", { hours: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return t("time.daysAgo", { days });
  return d.toLocaleDateString("zh-HK");
}

function normalizeStatus(s?: string | null) {
  const allowed = ["active", "pending_exchange", "validating", "completed", "disputed", "cancelled", "expired"] as const;
  return (allowed as readonly string[]).includes(s ?? "") ? (s as typeof allowed[number]) : "active";
}

function Transactions() {
  const { t } = useTranslation();
  const [mainTab, setMainTab] = useState<"listings" | "history">("listings");
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [listings, setListings] = useState<Listing[]>([]);
  const [buys, setBuys] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCancelId, setShowCancelId] = useState<string | null>(null);
  const navigate = useNavigate();

  async function cancelListing(listingId: string) {
    const { data: txs } = await (supabase as any)
      .from("transactions")
      .select("id")
      .eq("listing_id", listingId)
      .limit(1);

    if (Array.isArray(txs) && txs.length > 0) {
      toast.error(t("transactions.cancelHasBuyer"));
      return;
    }

    const { error } = await (supabase as any)
      .from("listings")
      .update({ status: "cancelled" })
      .eq("id", listingId);

    if (error) {
      toast.error(t("transactions.cancelFailed"));
      return;
    }

    setListings((prev) => prev.map((l) => l.id === listingId ? { ...l, status: "cancelled" } : l));
    toast.success(t("transactions.cancelSuccess"));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (cancelled) return;
      if (!uid) {
        setListings([]);
        setBuys([]);
        setLoading(false);
        return;
      }
      const [lRes, txRes] = await Promise.all([
        ownSupabase
          .from("listings")
          .select("id, mall_name, merchant_name, asking_price, parking_hours, status, created_at, expires_at")
          .eq("seller_id", uid)
          .order("created_at", { ascending: false }),
        fetchOwnTransactions(uid, "buy"),
      ]);
      if (cancelled) return;
      setListings((lRes.data as Listing[]) ?? []);
      setBuys((txRes as Tx[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <AppLayout title="交易 & 放單">
      <div className="px-4 pt-4">
        <div className="bg-accent rounded-xl p-1 grid grid-cols-2 gap-1 mb-4">
          {([["listings", "放單中"], ["history", "交易紀錄"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMainTab(k)}
              className={cn(
                "py-2 rounded-lg text-sm font-semibold",
                mainTab === k ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mainTab === "listings" && <ActiveListingsPanel />}

      {mainTab === "history" && (
        <div className="px-4">
          <div className="bg-accent rounded-xl p-1 grid grid-cols-2 gap-1 mb-4">
            {(["buy", "sell"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn(
                  "py-2 rounded-lg text-sm font-semibold",
                  tab === k ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                )}
              >
                {k === "buy" ? t("transactions.tabBuy") : t("transactions.tabSell")}
              </button>
            ))}
          </div>

          {tab === "buy" && (
            <div className="space-y-3">
              {loading ? (
                <LoadingState />
              ) : buys.length === 0 ? (
                <EmptyState />
              ) : (
                buys.map((tx) => (
                  <button
                    key={tx.id}
                    onClick={() => navigate({ to: "/chat/$id", params: { id: tx.id } } as any)}
                    className="w-full text-left bg-card rounded-2xl p-4 shadow-[var(--shadow-card)]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm">{tx.mall_name ?? "商場"}</div>
                      <StatusBadge status={normalizeStatus(tx.status)} />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-xs text-muted-foreground">{formatTime(tx.created_at, t)}</div>
                      <div className="flex items-center gap-1">
                        <div className="text-sm font-bold text-primary">
                          {formatHKD(Number(tx.sale_price ?? tx.listing_price ?? 0))}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {tab === "sell" && (
            <div className="space-y-3">
              {loading ? (
                <LoadingState />
              ) : listings.length === 0 ? (
                <EmptyState />
              ) : (
                listings.map((l) => (
                  <div key={l.id} className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)]">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm">{l.mall_name ?? "商場"}</div>
                      <StatusBadge status={normalizeStatus(l.status)} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {l.merchant_name ?? ""}{l.parking_hours ? ` · ${l.parking_hours}h` : ""}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-xs text-muted-foreground">{formatTime(l.created_at, t)}</div>
                      <div className="flex items-center gap-2">
                        {l.status === "active" && (
                          <button
                            onClick={() => setShowCancelId(l.id)}
                            className="text-xs text-destructive border border-destructive/30 rounded-lg px-2.5 py-1 font-medium"
                          >
                            {t("transactions.cancelListing")}
                          </button>
                        )}
                        <div className="text-sm font-bold text-primary">
                          {formatHKD(Number(l.asking_price ?? 0))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {showCancelId && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowCancelId(null)}>
          <div className="w-full bg-card rounded-t-3xl p-6 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold mb-2">{t("transactions.cancelListingTitle")}</h3>
            <p className="text-sm text-muted-foreground mb-6">{t("transactions.cancelListingDesc")}</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelId(null)} className="flex-1 h-12 border border-border rounded-xl text-sm font-semibold">{t("transactions.keepListing")}</button>
              <button
                onClick={() => { const id = showCancelId; setShowCancelId(null); cancelListing(id); }}
                className="flex-1 h-12 bg-destructive text-white rounded-xl text-sm font-bold"
              >
                {t("transactions.confirmCancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function LoadingState() {
  const { t } = useTranslation();
  return <div className="py-16 text-center text-sm text-muted-foreground">{t("common.loading")}</div>;
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="py-16 flex flex-col items-center gap-3 text-center">
      <div className="w-16 h-16 rounded-full bg-accent grid place-items-center">
        <Inbox className="w-7 h-7 text-muted-foreground" />
      </div>
      <div className="font-semibold">{t("transactions.emptyTitle")}</div>
      <div className="text-xs text-muted-foreground">{t("transactions.emptyHint")}</div>
    </div>
  );
}

function listingStatusTone(status: string) {
  if (status === "active") return "bg-success/10 text-success";
  if (status === "sold") return "bg-primary/10 text-primary";
  return "bg-muted text-muted-foreground";
}

function fmtDate(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-HK", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const LISTING_STATUS_LABEL: Record<string, string> = {
  active: "放售中",
  sold: "已售出",
  expired: "已過期",
  cancelled: "已下架",
};

function ActiveListingsPanel() {
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) { setRows([]); setLoading(false); return; }
    const { data, error } = await ownSupabase
      .from("listings")
      .select("id,mall_name,merchant_name,asking_price,parking_hours,status,created_at,expires_at")
      .eq("seller_id", uid)
      .order("created_at", { ascending: false });
    if (error) toast.error("載入失敗：" + error.message);
    setRows((data as Listing[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function cancelListing(id: string) {
    setBusyId(id);
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) { setBusyId(null); return; }

    const { data: txs } = await (supabase as any)
      .from("transactions").select("id").eq("listing_id", id).limit(1);
    if (Array.isArray(txs) && txs.length > 0) {
      setBusyId(null);
      toast.error("已有買家對此放單感興趣，無法下架");
      return;
    }

    const { error } = await (supabase as any)
      .from("listings").update({ status: "cancelled" }).eq("id", id).eq("seller_id", uid);
    setBusyId(null);
    if (error) { toast.error("下架失敗：" + error.message); return; }
    toast("已下架");
    load();
  }

  return (
    <div className="px-4 pb-4 space-y-3">
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
            <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md ${listingStatusTone(String(r.status))}`}>
              {LISTING_STATUS_LABEL[String(r.status)] ?? r.status}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>有效期至 {fmtDate(r.expires_at)}</span>
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
    </div>
  );
}
