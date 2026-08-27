import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldAlert, RefreshCcw, CheckCircle, XCircle, Clock, Search, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import {
  isAdmin,
  fetchMyRoles,
  fetchAdminDisputes,
  fetchAuditLog,
  resolveDisputeRefund,
  resolveDisputeRelease,
  searchUsers,
  adminActOnUser,
  type Dispute,
  type AppRole,
} from "@/lib/escrow-db";

export const Route = createFileRoute("/admin")({
  component: AdminPanel,
});

type Tab = "disputes" | "audit" | "users" | "reports";

const REASON_LABEL: Record<string, string> = {
  seller_no_show: "賣家冇出現",
  invalid_receipt: "收據無效／過期",
  receipt_mismatch: "收據與 listing 不符",
  other: "其他",
};

function countdown(deadline: string | null): string {
  if (!deadline) return "—";
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "已到期";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function AdminPanel() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState<string | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [tab, setTab] = useState<Tab>("disputes");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) {
        toast.error("請先登入");
        navigate({ to: "/auth" });
        return;
      }
      const ok = await isAdmin(uid);
      if (!ok) {
        toast.error("無權限");
        navigate({ to: "/" });
        return;
      }
      setMe(uid);
      setRoles(await fetchMyRoles(uid));
      setChecking(false);
    })();
  }, [navigate]);

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isSuper = roles.includes("super_admin");

  return (
    <AppLayout title="Admin Panel" subtitle={isSuper ? "Super Admin" : "Admin"}>
      <div className="sticky top-[73px] z-20 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="flex">
          {([
            ["disputes", "爭議"],
            ["audit", "Audit Log"],
            ["reports", "檢舉記錄"],
            ...(isSuper ? ([["users", "用戶"]] as [Tab, string][]) : []),
          ] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold border-b-2 ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {tab === "disputes" && me && <DisputesTab adminId={me} />}
        {tab === "audit" && <AuditTab />}
        {tab === "reports" && me && <ReportsTab adminId={me} />}
        {tab === "users" && isSuper && me && <UsersTab adminId={me} />}
      </div>
    </AppLayout>
  );
}

function DisputesTab({ adminId }: { adminId: string }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; outcome: "refund" | "release" } | null>(null);
  const [note, setNote] = useState("");
  const [followUpAction, setFollowUpAction] = useState<"none" | "warn" | "ban">("none");
  const [zoom, setZoom] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const rows = await fetchAdminDisputes();
      setItems(rows);
    } catch (e: any) {
      toast.error("載入失敗", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  async function doResolve() {
    if (!confirm) return;
    setBusyId(confirm.id);
    try {
      if (confirm.outcome === "refund") {
        await resolveDisputeRefund(confirm.id, adminId, note.trim() || undefined);
        toast.success("已退款買家");
      } else {
        await resolveDisputeRelease(confirm.id, adminId, note.trim() || undefined);
        toast.success("已放款賣家");
      }
      const targetUserId =
        confirm.outcome === "refund"
          ? items.find((d) => d.id === confirm.id)?.transaction?.seller_id
          : items.find((d) => d.id === confirm.id)?.transaction?.buyer_id;
      if (followUpAction !== "none" && targetUserId) {
        await adminActOnUser({
          admin_id: adminId,
          target_user_id: targetUserId,
          action: followUpAction === "warn" ? "user_warn" : "user_ban",
          note: `爭議 ${confirm.id} 裁決後行動`,
        });
        toast.success(followUpAction === "warn" ? "已警告責任方" : "已封禁責任方");
      }
      setConfirm(null);
      setNote("");
      setFollowUpAction("none");
      await load();
    } catch (e: any) {
      toast.error("操作失敗", { description: e?.message });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="py-12 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!items.length) {
    return (
      <div className="py-16 text-center">
        <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">目前無待處理爭議</p>
        <button onClick={load} className="mt-4 text-xs text-primary inline-flex items-center gap-1">
          <RefreshCcw className="w-3 h-3" /> 重新整理
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3" key={tick}>
      {items.map((d) => {
        const tx = d.transaction;
        const amount = tx?.buyer_total ?? tx?.amount ?? tx?.listing_price ?? 0;
        return (
          <div key={d.id} className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-muted-foreground">爭議 #{d.id.slice(0, 8)}</p>
                <p className="text-base font-bold">HK${Number(amount).toFixed(2)}</p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 text-xs bg-warning/10 text-warning-foreground px-2 py-1 rounded-full">
                  <Clock className="w-3 h-3" /> {countdown(d.evidence_deadline_at)}
                </span>
              </div>
            </div>
            <div className="text-xs space-y-1">
              <div><span className="text-muted-foreground">原因：</span>{REASON_LABEL[d.reason] ?? d.reason}</div>
              <div><span className="text-muted-foreground">提出者：</span>{d.reported_by?.slice(0, 8) ?? "—"}</div>
              <div><span className="text-muted-foreground">買家：</span>{tx?.buyer_id?.slice(0, 8) ?? "—"}</div>
              <div><span className="text-muted-foreground">賣家：</span>{tx?.seller_id?.slice(0, 8) ?? "—"}</div>
              <div><span className="text-muted-foreground">提交時間：</span>{new Date(d.created_at).toLocaleString("zh-HK", { hour12: false })}</div>
              {d.description && <div className="pt-1"><span className="text-muted-foreground">說明：</span>{d.description}</div>}
            </div>
            {d.evidence_urls?.length ? (
              <div className="flex gap-2 overflow-x-auto">
                {d.evidence_urls.map((u: string, i: number) => (
                  <button key={i} onClick={() => setZoom(u)} className="shrink-0">
                    <img src={u} className="w-16 h-16 object-cover rounded-lg border border-border" />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2 pt-2">
              <button
                disabled={busyId === d.id}
                onClick={() => setConfirm({ id: d.id, outcome: "refund" })}
                className="flex-1 bg-destructive/10 text-destructive font-bold text-xs py-2.5 rounded-xl disabled:opacity-50"
              >💰 退款買家</button>
              <button
                disabled={busyId === d.id}
                onClick={() => setConfirm({ id: d.id, outcome: "release" })}
                className="flex-1 bg-success/10 text-success font-bold text-xs py-2.5 rounded-xl disabled:opacity-50"
              >✅ 放款賣家</button>
            </div>
          </div>
        );
      })}

      {zoom && (
        <div className="fixed inset-0 z-50 bg-black/80 grid place-items-center p-4" onClick={() => setZoom(null)}>
          <img src={zoom} className="max-w-full max-h-full rounded-lg" />
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => { if (!busyId) { setConfirm(null); setNote(""); setFollowUpAction("none"); } }}>
          <div className="w-full bg-card rounded-t-3xl p-6 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold mb-2">
              {confirm.outcome === "refund" ? "確認退款買家？" : "確認放款賣家？"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">此操作會即時更新交易狀態並寫入 audit log，無法撤銷。</p>
            <label className="text-xs font-semibold mb-1 block">備注（選填）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="裁決理由…"
              className="w-full border border-border rounded-lg p-3 text-sm mb-4 resize-none"
            />
            <div className="mb-4">
              <label className="text-xs font-semibold block mb-2">
                順帶行動（{confirm.outcome === "refund" ? "對賣家" : "對買家"}）
              </label>
              <div className="flex gap-2">
                <button onClick={() => setFollowUpAction("none")} className={`flex-1 py-2 text-xs font-bold rounded-xl border ${followUpAction === "none" ? "bg-primary text-white border-primary" : "bg-background text-muted-foreground border-border"}`}>不需要</button>
                <button onClick={() => setFollowUpAction("warn")} className={`flex-1 py-2 text-xs font-bold rounded-xl border ${followUpAction === "warn" ? "bg-warning text-white border-warning" : "bg-background text-muted-foreground border-border"}`}>⚠️ 警告</button>
                <button onClick={() => setFollowUpAction("ban")} className={`flex-1 py-2 text-xs font-bold rounded-xl border ${followUpAction === "ban" ? "bg-destructive text-white border-destructive" : "bg-background text-muted-foreground border-border"}`}>🚫 封禁</button>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setConfirm(null); setNote(""); setFollowUpAction("none"); }} disabled={!!busyId} className="flex-1 h-12 border border-border rounded-xl text-sm font-semibold disabled:opacity-50">取消</button>
              <button onClick={doResolve} disabled={!!busyId} className={`flex-1 h-12 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 ${confirm.outcome === "refund" ? "bg-destructive" : "bg-success"}`}>
                {busyId ? <><Loader2 className="w-4 h-4 animate-spin" />處理中…</> : "確認"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditTab() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    try { setRows(await fetchAuditLog(200)); }
    catch (e: any) { toast.error("載入失敗", { description: e?.message }); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  if (loading) return <div className="py-12 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!rows.length) return <p className="py-16 text-center text-sm text-muted-foreground">未有記錄</p>;

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="bg-card border border-border rounded-xl p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="font-semibold">{r.action}</span>
            <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("zh-HK", { hour12: false })}</span>
          </div>
          <div className="text-muted-foreground">Admin: {r.admin_id?.slice(0, 8)}</div>
          <div className="text-muted-foreground">Target: {r.target_type} · {r.target_id?.slice(0, 8)}</div>
          {r.note && <div className="pt-1 border-t border-border/50">{r.note}</div>}
        </div>
      ))}
    </div>
  );
}

function UsersTab({ adminId }: { adminId: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function doSearch() {
    setSearching(true);
    try { setResults(await searchUsers(q)); }
    finally { setSearching(false); }
  }

  async function act(userId: string, action: "user_suspend" | "user_ban" | "user_unban" | "user_warn") {
    let note: string | undefined;
    if (action === "user_ban") {
      const reason = window.prompt("封號原因：", "違反平台規則");
      if (reason === null) return;
      note = reason.trim() || "Admin ban";
    } else {
      const labels: Record<string, string> = { user_suspend: "確認暫停帳號？", user_unban: "確認解封此用戶？", user_warn: "確認發出警告？" };
      if (!window.confirm(labels[action])) return;
    }
    setBusy(userId + action);
    try {
      await adminActOnUser({ admin_id: adminId, target_user_id: userId, action, note });
      const msg: Record<string, string> = { user_suspend: "已暫停（已記錄）", user_ban: "已封號", user_unban: "已解封", user_warn: "已發出警告" };
      toast.success(msg[action]);
      setResults((prev) => prev.map((u) => u.id !== userId ? u : action === "user_ban" ? { ...u, is_banned: true, ban_reason: note } : action === "user_unban" ? { ...u, is_banned: false, ban_reason: null } : action === "user_warn" ? { ...u, warning_count: (u.warning_count ?? 0) + 1 } : u));
    } catch (e: any) {
      toast.error("失敗", { description: e?.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <div className="flex-1 flex items-center bg-card border border-border rounded-xl px-3">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="用戶 ID 或名稱"
            className="flex-1 bg-transparent px-2 py-2.5 text-sm outline-none"
          />
        </div>
        <button onClick={doSearch} disabled={searching} className="px-4 bg-primary text-white text-sm font-semibold rounded-xl disabled:opacity-50">搜尋</button>
      </div>

      {!results.length && !searching && <p className="text-center text-xs text-muted-foreground py-8">輸入用戶 ID 或名稱搜尋</p>}

      <div className="space-y-2">
        {results.map((u) => {
          const banned = (u.is_banned ?? false) === true;
          const warns = u.warning_count ?? 0;
          return (
            <div key={u.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-sm">{u.name ?? "無名"}</p>
                    {banned && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">🚫 已封禁</span>}
                    {warns > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/10 text-warning-foreground">⚠️ {warns} 次警告</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{u.email ?? ""}</p>
                  <p className="text-xs text-muted-foreground font-mono">{u.id?.slice(0, 12)}…</p>
                </div>
                <div className="text-right text-xs">
                  <div>評分：{Number(u.rating ?? 0).toFixed(1)}</div>
                  <div className="text-muted-foreground">完成：{u.deals_count ?? 0}</div>
                  <div className="text-muted-foreground">爭議：{u.dispute_count ?? 0}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => act(u.id, "user_warn")} disabled={busy === u.id + "user_warn"} className="flex-1 bg-warning/10 text-warning-foreground text-xs font-bold py-2 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1"><XCircle className="w-3.5 h-3.5" />警告</button>
                {banned ? (
                  <button onClick={() => act(u.id, "user_unban")} disabled={busy === u.id + "user_unban"} className="flex-1 bg-success/10 text-success text-xs font-bold py-2 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1"><CheckCircle className="w-3.5 h-3.5" />解封</button>
                ) : (
                  <button onClick={() => act(u.id, "user_ban")} disabled={busy === u.id + "user_ban"} className="flex-1 bg-destructive/10 text-destructive text-xs font-bold py-2 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1"><CheckCircle className="w-3.5 h-3.5" />封號</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground mt-4 text-center">
        注意：暫停／封號操作暫時只寫入 audit_log，尚未強制登出用戶（待後續 Edge Function）。
      </p>
    </div>
  );
}

function ReportsTab({ adminId }: { adminId: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [msgCache, setMsgCache] = useState<Record<string, any[]>>({});
  const [actionSheet, setActionSheet] = useState<{ reportId: string; reportedId: string } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [showBanInput, setShowBanInput] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data: reports, error } = await (supabase as any)
        .from("reports").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      if (!reports?.length) { setRows([]); setLoading(false); return; }
      const allIds = [...new Set(reports.flatMap((r: any) => [r.reporter_id, r.reported_id].filter(Boolean)))];
      const { data: profilesData } = await (supabase as any).from("profiles").select("id, name").in("id", allIds);
      const nameMap: Record<string, string> = {};
      (profilesData ?? []).forEach((p: any) => { nameMap[p.id] = p.name ?? p.id?.slice(0, 8); });
      setRows(reports.map((r: any) => ({ ...r, reporter_name: nameMap[r.reporter_id] ?? r.reporter_id?.slice(0, 8), reported_name: nameMap[r.reported_id] ?? r.reported_id?.slice(0, 8) })));
    } catch (e: any) {
      toast.error("載入失敗", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(transactionId: string) {
    if (msgCache[transactionId]) return;
    const { data } = await (supabase as any).rpc("admin_get_report_context", { p_transaction_id: transactionId });
    setMsgCache((prev) => ({ ...prev, [transactionId]: data ?? [] }));
  }

  async function toggleExpand(reportId: string, transactionId: string | null) {
    if (expanded === reportId) { setExpanded(null); return; }
    setExpanded(reportId);
    if (transactionId) await loadMessages(transactionId);
  }

  async function markReportResolved(id: string) {
    await (supabase as any).from("reports").update({ status: "resolved" }).eq("id", id);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "resolved" } : r)));
  }

  function closeSheet() { setActionSheet(null); setBanReason(""); setShowBanInput(false); }

  async function handleAction(kind: "warn" | "ban" | "none") {
    if (!actionSheet) return;
    if (kind === "ban" && !showBanInput) { setShowBanInput(true); return; }
    setActionBusy(true);
    try {
      if (kind === "warn") {
        await adminActOnUser({ admin_id: adminId, target_user_id: actionSheet.reportedId, action: "user_warn", note: `檢舉 ${actionSheet.reportId}` });
      } else if (kind === "ban") {
        await adminActOnUser({ admin_id: adminId, target_user_id: actionSheet.reportedId, action: "user_ban", note: banReason.trim() || "違反平台規則" });
      }
      await markReportResolved(actionSheet.reportId);
      toast.success(kind === "warn" ? "已警告用戶並標記已處理" : kind === "ban" ? "已封禁用戶並標記已處理" : "已標記為已處理");
      closeSheet();
    } catch (e: any) {
      toast.error("操作失敗", { description: e?.message });
    } finally {
      setActionBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="py-12 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!rows.length) return (
    <div className="py-16 text-center">
      <Flag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">目前沒有檢舉記錄</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const isExpanded = expanded === r.id;
        const msgs: any[] = r.transaction_id ? (msgCache[r.transaction_id] ?? []) : [];
        return (
          <div key={r.id} className="bg-card border border-border rounded-xl p-3 space-y-2">
            <div className="flex justify-between items-start">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.status === "resolved" ? "bg-success/10 text-success" : "bg-warning/10 text-warning-foreground"}`}>
                {r.status === "resolved" ? "✅ 已處理" : "⏳ 待處理"}
              </span>
              <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString("zh-HK", { hour12: false })}</span>
            </div>
            <div className="text-xs space-y-0.5">
              <div><span className="text-muted-foreground">檢舉者：</span><span className="font-semibold">{r.reporter_name}</span></div>
              <div><span className="text-muted-foreground">被檢舉：</span><span className="font-semibold text-destructive">{r.reported_name}</span></div>
              <div className="pt-1 border-t border-border/50"><span className="text-muted-foreground">原因：</span>{r.reason}</div>
            </div>
            {r.transaction_id && (
              <div className="flex gap-2">
                <a href={`/chat/${r.transaction_id}`} className="flex-1 text-center text-xs font-semibold py-2 rounded-lg bg-primary/10 text-primary" target="_blank" rel="noreferrer">💬 查看聊天室</a>
                <button onClick={() => toggleExpand(r.id, r.transaction_id)} className="flex-1 text-xs font-semibold py-2 rounded-lg bg-accent text-foreground">
                  {isExpanded ? "▲ 收起訊息" : "▼ 睇最近訊息"}
                </button>
              </div>
            )}
            {isExpanded && r.transaction_id && (
              <div className="bg-accent/30 rounded-lg p-2 space-y-1 max-h-48 overflow-y-auto">
                {msgs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">載入中…</p>
                ) : (
                  [...msgs].reverse().map((m: any, i: number) => (
                    <div key={i} className="text-xs">
                      <span className="font-semibold text-primary">{m.sender_name ?? "?"}: </span>
                      <span>{m.msg_type === "image" ? "📷 [圖片]" : m.content}</span>
                      <span className="text-muted-foreground ml-1 text-[10px]">{new Date(m.created_at).toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                    </div>
                  ))
                )}
              </div>
            )}
            {r.status === "pending" && (
              <button onClick={() => setActionSheet({ reportId: r.id, reportedId: r.reported_id })} className="w-full py-2 text-xs font-bold bg-primary/10 text-primary rounded-lg">
                處理投訴 ▶
              </button>
            )}
          </div>
        );
      })}

      {actionSheet && (
        <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={closeSheet} />
          <div className="relative w-full bg-card rounded-t-2xl p-4 space-y-3 max-h-[80vh] overflow-y-auto">
            <div className="text-sm font-bold">處理投訴</div>
            <p className="text-xs text-muted-foreground font-mono">被投訴者：{actionSheet.reportedId.slice(0, 12)}…</p>
            {showBanInput ? (
              <div className="space-y-2">
                <label className="block text-xs font-semibold">封禁原因</label>
                <textarea value={banReason} onChange={(e) => setBanReason(e.target.value)} rows={3} placeholder="例：提供無效收據、詐騙行為" className="w-full border border-input rounded-xl p-2 text-sm bg-background outline-none" />
                <div className="flex gap-2">
                  <button onClick={() => setShowBanInput(false)} disabled={actionBusy} className="flex-1 py-2.5 text-xs font-bold bg-accent text-foreground rounded-xl disabled:opacity-50">返回</button>
                  <button onClick={() => handleAction("ban")} disabled={actionBusy} className="flex-1 py-2.5 text-xs font-bold bg-destructive text-white rounded-xl disabled:opacity-50">{actionBusy ? "處理中…" : "確認封禁"}</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button onClick={() => handleAction("warn")} disabled={actionBusy} className="w-full py-3 text-sm font-bold bg-warning/10 text-warning-foreground rounded-xl disabled:opacity-50">⚠️ 警告被投訴者</button>
                <button onClick={() => handleAction("ban")} disabled={actionBusy} className="w-full py-3 text-sm font-bold bg-destructive/10 text-destructive rounded-xl disabled:opacity-50">🚫 封禁被投訴者</button>
                <button onClick={() => handleAction("none")} disabled={actionBusy} className="w-full py-3 text-sm font-bold bg-primary/10 text-primary rounded-xl disabled:opacity-50">✅ 不需行動，標記已處理</button>
                <button onClick={closeSheet} disabled={actionBusy} className="w-full py-2.5 text-xs font-semibold text-muted-foreground">取消</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
