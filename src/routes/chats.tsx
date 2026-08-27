import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Trash2, CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { requireSignedIn } from "@/lib/auth-guard";

export const Route = createFileRoute("/chats")({
  beforeLoad: requireSignedIn,
  head: () => ({ meta: [{ title: "聊天室 · 買時間" }] }),
  component: ChatsPage,
});

type ChatRow = {
  id: string;
  mall_name: string | null;
  sale_price: number | null;
  status: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  created_at: string;
};

type LastMsg = {
  content: string;
  sender_name: string | null;
  created_at: string;
  type: string;
};

function ChatsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [lastMsgs, setLastMsgs] = useState<Record<string, LastMsg>>({});
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [txIds, setTxIds] = useState<string[]>([]);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteSheet, setShowBatchDeleteSheet] = useState(false);

  const checkUnread = useCallback(async (uid: string, ids: string[]) => {
    if (ids.length === 0) return;
    const { data: reads } = await (supabase as any)
      .from("chat_reads")
      .select("transaction_id, last_read_at")
      .eq("user_id", uid)
      .in("transaction_id", ids);
    const readMap: Record<string, string> = {};
    (reads ?? []).forEach((r: any) => { readMap[r.transaction_id] = r.last_read_at; });
    const unread = new Set<string>();
    await Promise.all(
      ids.map(async (txId) => {
        const lastRead = readMap[txId] ?? null;
        let q = (supabase as any)
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("transaction_id", txId)
          .neq("sender_id", uid);
        if (lastRead) q = q.gt("created_at", lastRead);
        const { count } = await q;
        if ((count ?? 0) > 0) unread.add(txId);
      })
    );
    setUnreadIds(unread);
  }, []);

  const fetchLastMsgs = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const results: Record<string, LastMsg> = {};
    await Promise.all(
      ids.map(async (txId) => {
        const { data } = await (supabase as any)
          .from("messages")
          .select("content, sender_name, created_at, type")
          .eq("transaction_id", txId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) results[txId] = data as LastMsg;
      })
    );
    setLastMsgs(results);
  }, []);

  function startLongPress(chatId: string) {
    longPressTimer.current = setTimeout(() => {
      setPendingDeleteId(chatId);
      setShowDeleteSheet(true);
    }, 600);
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  async function deleteChat() {
    if (!myId || !pendingDeleteId) return;
    const chat = chats.find((c) => c.id === pendingDeleteId);
    if (!chat) return;
    const field = myId === chat.buyer_id ? "hidden_by_buyer" : "hidden_by_seller";
    const { error } = await (supabase as any).from("transactions").update({ [field]: true }).eq("id", pendingDeleteId);
    if (error) { toast.error(t("chats.deleteFailed")); return; }
    setChats((prev) => prev.filter((c) => c.id !== pendingDeleteId));
    setPendingDeleteId(null);
    setShowDeleteSheet(false);
    toast.success(t("chats.deleteSuccess"));
  }

  function toggleSelectId(chatId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function deleteSelected() {
    if (!myId || selectedIds.size === 0) return;
    const toDelete = chats.filter((c) => selectedIds.has(c.id));
    await Promise.all(
      toDelete.map(async (chat) => {
        const field = myId === chat.buyer_id ? "hidden_by_buyer" : "hidden_by_seller";
        await (supabase as any).from("transactions").update({ [field]: true }).eq("id", chat.id);
      })
    );
    setChats((prev) => prev.filter((c) => !selectedIds.has(c.id)));
    const count = selectedIds.size;
    setSelectedIds(new Set());
    setSelectMode(false);
    setShowBatchDeleteSheet(false);
    toast.success(t("chats.batchDeleteSuccess", { count }));
  }

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (!uid) { setLoading(false); return; }
      setMyId(uid);

      const { data } = await supabase
        .from("transactions")
        .select("id, mall_name, sale_price, status, buyer_id, seller_id, created_at, hidden_by_buyer, hidden_by_seller")
        .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`)
        .order("created_at", { ascending: false });

      const allRows = (data as unknown as (ChatRow & { hidden_by_buyer?: boolean; hidden_by_seller?: boolean })[]) ?? [];
      const rows = allRows.filter((r) => {
        if (r.buyer_id === uid && r.hidden_by_buyer) return false;
        if (r.seller_id === uid && r.hidden_by_seller) return false;
        return true;
      });
      setChats(rows);

      const ids = rows.map((r) => r.id);
      setTxIds(ids);
      await Promise.all([checkUnread(uid, ids), fetchLastMsgs(ids)]);
      setLoading(false);
    })();
  }, [checkUnread, fetchLastMsgs]);

  useEffect(() => {
    if (!myId || txIds.length === 0) return;
    const channel = supabase
      .channel("chats-unread-watch")
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "messages" },
        (payload: any) => {
          const msg = payload.new;
          if (!txIds.includes(msg.transaction_id)) return;
          setLastMsgs((prev) => ({
            ...prev,
            [msg.transaction_id]: {
              content: msg.content,
              sender_name: msg.sender_name,
              created_at: msg.created_at,
              type: msg.type ?? "text",
            },
          }));
          if (msg.sender_id !== myId) {
            setUnreadIds((prev) => new Set([...prev, msg.transaction_id]));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myId, txIds]);

  if (loading) return <AppLayout title={t("chats.title")}><div className="p-6 text-center text-muted-foreground text-sm">{t("common.loading")}</div></AppLayout>;

  return (
    <AppLayout
      title={t("chats.title")}
      headerRight={
        chats.length > 0 ? (
          <button onClick={selectMode ? exitSelectMode : () => setSelectMode(true)} className="text-sm text-primary font-medium">
            {selectMode ? t("common.cancel") : t("chats.select")}
          </button>
        ) : undefined
      }
    >
      <div className="divide-y divide-border">
        {chats.length === 0 && (
          <div className="py-16 text-center flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-full bg-accent grid place-items-center text-2xl">💬</div>
            <div className="text-sm font-semibold">{t("chats.emptyTitle")}</div>
            <div className="text-xs text-muted-foreground">{t("chats.emptyHint")}</div>
          </div>
        )}
        {chats.map((c) => {
          const role = c.seller_id === myId ? t("chats.roleSeller") : t("chats.roleBuyer");
          const hasUnread = unreadIds.has(c.id);
          const last = lastMsgs[c.id];
          return (
            <button
              key={c.id}
              className={`w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-accent/30 active:bg-accent/50 ${selectedIds.has(c.id) ? "bg-primary/5" : ""}`}
              onClick={() => { if (selectMode) { toggleSelectId(c.id); } else { navigate({ to: "/chat/$id", params: { id: c.id } }); } }}
              onTouchStart={() => { if (!selectMode) startLongPress(c.id); }}
              onTouchEnd={cancelLongPress}
              onTouchMove={cancelLongPress}
              onMouseDown={() => { if (!selectMode) startLongPress(c.id); }}
              onMouseUp={cancelLongPress}
              onMouseLeave={cancelLongPress}
            >
              {selectMode && (
                <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${selectedIds.has(c.id) ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                  {selectedIds.has(c.id) && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                </div>
              )}
              <div className="relative w-11 h-11 shrink-0">
                <div className="w-11 h-11 rounded-full bg-primary/10 grid place-items-center">
                  <MessageCircle className="w-5 h-5 text-primary" />
                </div>
                {hasUnread && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-destructive border-2 border-background" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-sm truncate ${hasUnread ? "font-bold" : "font-semibold"}`}>{c.mall_name ?? t("chats.fallbackMall")}</span>
                  <StatusBadge status={(c.status as any) ?? "active"} />
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">
                    {last
                      ? new Date(last.created_at).toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit", hour12: false })
                      : new Date(c.created_at).toLocaleDateString("zh-HK")}
                  </span>
                </div>
                <div className={`text-xs truncate ${hasUnread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {last
                    ? `${last.sender_name ?? t("chats.otherParty")}：${last.type === "image" ? "📷 圖片" : last.content}`
                    : `${role} · HK$${c.sale_price ?? ""}`}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectMode && (
        <div className="fixed bottom-16 left-0 right-0 z-40 bg-card border-t border-border px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("chats.selectedCount", { count: selectedIds.size })}</span>
          <button onClick={() => selectedIds.size > 0 && setShowBatchDeleteSheet(true)} disabled={selectedIds.size === 0} className="flex items-center gap-1.5 text-sm font-semibold text-destructive disabled:opacity-40">
            <Trash2 className="w-4 h-4" /> {t("chats.delete")}
          </button>
        </div>
      )}

      {showDeleteSheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => { setShowDeleteSheet(false); setPendingDeleteId(null); }}>
          <div className="w-full bg-card rounded-t-3xl p-6 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold mb-2">{t("chats.deleteTitle")}</h3>
            <p className="text-sm text-muted-foreground mb-6">{t("chats.deleteBody")}</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteSheet(false); setPendingDeleteId(null); }} className="flex-1 h-12 border border-border rounded-xl text-sm font-semibold">{t("common.back")}</button>
              <button onClick={deleteChat} className="flex-1 h-12 bg-destructive text-white rounded-xl text-sm font-bold">{t("chats.confirmDelete")}</button>
            </div>
          </div>
        </div>
      )}

      {showBatchDeleteSheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowBatchDeleteSheet(false)}>
          <div className="w-full bg-card rounded-t-3xl p-6 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold mb-2">{t("chats.batchDeleteTitle", { count: selectedIds.size })}</h3>
            <p className="text-sm text-muted-foreground mb-6">{t("chats.batchDeleteBody")}</p>
            <div className="flex gap-3">
              <button onClick={() => setShowBatchDeleteSheet(false)} className="flex-1 h-12 border border-border rounded-xl text-sm font-semibold">{t("common.back")}</button>
              <button onClick={deleteSelected} className="flex-1 h-12 bg-destructive text-white rounded-xl text-sm font-bold">{t("chats.confirmDelete")}</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
