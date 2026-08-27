// Helpers + types for escrow transactions, disputes, ratings, audit_log, roles.
import { supabase as rawSupabase } from "@/integrations/supabase/client";
const supabase = rawSupabase as any;

// ============ Types ============
export type TxStatus =
  | "pending_payment" | "paid_held" | "delivery_confirmed" | "buyer_confirmed"
  | "auto_released" | "disputed" | "completed" | "refunded" | "cancelled";

export type EscrowTransaction = {
  id: string; receipt_id: string; buyer_id: string | null; seller_id: string | null;
  amount: number | null; platform_fee: number; seller_payout_amount: number | null;
  status: TxStatus | string; stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null; delivery_confirmed_at: string | null;
  delivery_photo_url: string | null; buyer_confirmed_at: string | null;
  auto_release_at: string | null; completed_at: string | null;
  created_at: string; updated_at: string;
};

export type DisputeReason = "seller_no_show" | "invalid_receipt" | "receipt_mismatch" | "other";
export type DisputeStatus = "open" | "evidence_submitted" | "under_review" | "resolved_refund" | "resolved_release";

export type Dispute = {
  id: string; transaction_id: string; reported_by: string | null;
  reason: DisputeReason | string; description: string | null;
  evidence_urls: string[] | null; status: DisputeStatus | string;
  admin_decision: string | null; admin_decided_by: string | null;
  admin_decided_at: string | null; admin_note: string | null;
  evidence_deadline_at: string | null; created_at: string; updated_at: string;
};

export type Rating = {
  id: string; transaction_id: string; rater_id: string; ratee_id: string;
  rating: 1 | 5; bad_reason: string | null; comment: string | null;
  submitted_at: string; revealed_at: string | null; created_at: string;
};

export type AppRole = "user" | "admin" | "super_admin";
export type AuditAction = "dispute_refund" | "dispute_release" | "user_suspend" | "user_ban" | "user_unban" | "user_warn" | "listing_remove";

// ============ Transactions ============
export async function markDeliveryConfirmed(transactionId: string, photoUrl?: string) {
  const now = new Date();
  const auto = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  const { error } = await supabase.from("transactions").update({
    status: "delivery_confirmed",
    delivery_confirmed_at: now.toISOString(),
    delivery_photo_url: photoUrl ?? null,
    auto_release_at: auto,
  }).eq("id", transactionId);
  if (error) throw error;
}

export async function markBuyerConfirmed(transactionId: string) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("transactions").update({
    status: "buyer_confirmed",
    buyer_confirmed_at: now,
    completed_at: now,
  }).eq("id", transactionId);
  if (error) throw error;
}

// ============ Disputes ============
export async function raiseDispute(input: {
  transaction_id: string; reported_by: string; reason: DisputeReason;
  description?: string; evidence_urls?: string[];
}) {
  const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from("disputes").insert({
    transaction_id: input.transaction_id,
    reported_by: input.reported_by,
    reason: input.reason,
    description: input.description ?? null,
    evidence_urls: input.evidence_urls ?? null,
    status: "open",
    evidence_deadline_at: deadline,
  }).select().maybeSingle();
  if (error) throw error;
  await supabase.from("transactions").update({ status: "disputed" }).eq("id", input.transaction_id);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-seller`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ recipient_id: null, admin_email: "yiusak01@gmail.com", transaction_id: input.transaction_id, type: "dispute", mall_name: "", buyer_name: "User" }),
    });
  } catch (e) { console.warn("admin notify failed", e); }
  return data as Dispute;
}

export async function submitDisputeEvidence(disputeId: string, evidenceUrls: string[]) {
  const { error } = await supabase.from("disputes").update({ evidence_urls: evidenceUrls, status: "evidence_submitted" }).eq("id", disputeId);
  if (error) throw error;
}

// ============ Ratings ============
export async function submitRating(input: {
  transaction_id: string; rater_id: string; ratee_id: string;
  rating: 1 | 5; bad_reason?: string; comment?: string;
}) {
  if (input.rating === 1 && !input.bad_reason) throw new Error("差評必須選擇原因");
  const { error } = await supabase.from("ratings").insert({
    transaction_id: input.transaction_id, rater_id: input.rater_id,
    ratee_id: input.ratee_id, rating: input.rating,
    bad_reason: input.bad_reason ?? null, comment: input.comment ?? null,
  });
  if (error) throw error;
  const { data: both } = await supabase.from("ratings").select("id").eq("transaction_id", input.transaction_id);
  if ((both?.length ?? 0) >= 2) {
    await supabase.from("ratings").update({ revealed_at: new Date().toISOString() }).eq("transaction_id", input.transaction_id).is("revealed_at", null);
  }
}

export async function fetchRatingsForUser(userId: string) {
  const { data, error } = await supabase.from("ratings").select("*").eq("ratee_id", userId).not("revealed_at", "is", null).order("submitted_at", { ascending: false });
  if (error) { console.warn("[fetchRatingsForUser]", error.message); return [] as Rating[]; }
  return (data ?? []) as Rating[];
}

export type RatingStats = {
  total: number; good: number; bad: number; goodRate: number; badRate: number;
  isNewUser: boolean; recentBadStreak: number;
};

export async function fetchUserRatingStats(userId: string): Promise<RatingStats> {
  const { data, error } = await supabase.from("ratings").select("rating, submitted_at").eq("ratee_id", userId).order("submitted_at", { ascending: false });
  if (error) { console.warn("[fetchUserRatingStats]", error.message); return { total: 0, good: 0, bad: 0, goodRate: 0, badRate: 0, isNewUser: true, recentBadStreak: 0 }; }
  const rows = (data ?? []) as { rating: number }[];
  const total = rows.length;
  const good = rows.filter((r) => r.rating === 5).length;
  const bad = total - good;
  let streak = 0;
  for (const r of rows) { if (r.rating === 1) streak++; else break; }
  return { total, good, bad, goodRate: total ? good / total : 0, badRate: total ? bad / total : 0, isNewUser: total < 5, recentBadStreak: streak };
}

export async function fetchMyRatingForTx(transactionId: string, raterId: string) {
  const { data } = await supabase.from("ratings").select("*").eq("transaction_id", transactionId).eq("rater_id", raterId).maybeSingle();
  return (data ?? null) as Rating | null;
}

export async function fetchOpponentRatingForTx(transactionId: string, raterId: string) {
  const { data } = await supabase.from("ratings").select("*").eq("transaction_id", transactionId).neq("rater_id", raterId).not("revealed_at", "is", null).maybeSingle();
  return (data ?? null) as Rating | null;
}

// ============ Roles ============
export async function fetchMyRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) return [];
  return (data ?? []).map((r: { role: AppRole }) => r.role);
}

export async function isAdmin(userId: string): Promise<boolean> {
  const roles = await fetchMyRoles(userId);
  return roles.includes("admin") || roles.includes("super_admin");
}

// ============ Audit log ============
export async function writeAuditLog(input: {
  admin_id: string; action: AuditAction;
  target_type: "transaction" | "user" | "listing" | "dispute";
  target_id: string; note?: string;
}) {
  const { error } = await supabase.from("audit_log").insert({ admin_id: input.admin_id, action: input.action, target_type: input.target_type, target_id: input.target_id, note: input.note ?? null });
  if (error) throw error;
}

// ============ Admin dispute resolution ============
export async function fetchAdminDisputes(): Promise<Dispute[]> {
  const { data, error } = await supabase.from("disputes").select("*").in("status", ["open", "evidence_submitted", "under_review"]).order("created_at", { ascending: false });
  if (error) throw error;
  const disputes = (data ?? []) as Dispute[];
  const txIds = [...new Set(disputes.map((d: any) => d.transaction_id).filter(Boolean))];
  let txMap: Record<string, any> = {};
  if (txIds.length > 0) {
    const { data: txData } = await supabase.from("transactions").select("id, mall_name, sale_price, buyer_total, amount, buyer_id, seller_id, status").in("id", txIds);
    for (const tx of txData ?? []) { txMap[String(tx.id)] = tx; }
  }
  return disputes.map((d: any) => ({ ...d, transaction: txMap[String(d.transaction_id)] ?? null }));
}

export async function fetchAuditLog(limit = 100) {
  const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

async function resolveDispute(disputeId: string, adminId: string, outcome: "refund" | "release", note?: string) {
  const { data: dispute, error: dErr } = await supabase.from("disputes").select("id, transaction_id").eq("id", disputeId).maybeSingle();
  if (dErr) throw dErr;
  if (!dispute) throw new Error("爭議不存在");
  const now = new Date().toISOString();
  const disputeStatus = outcome === "refund" ? "resolved_refund" : "resolved_release";
  const txStatus = outcome === "refund" ? "resolved_refund" : "resolved_release";
  const { error: updDErr } = await supabase.from("disputes").update({ status: disputeStatus, admin_decision: outcome, admin_decided_by: adminId, admin_decided_at: now, admin_note: note ?? null }).eq("id", disputeId);
  if (updDErr) throw updDErr;
  const txUpdate: Record<string, unknown> = { status: txStatus };
  if (outcome === "release") txUpdate.completed_at = now;
  const { error: updTErr } = await supabase.from("transactions").update(txUpdate).eq("id", dispute.transaction_id);
  if (updTErr) throw updTErr;
  await writeAuditLog({ admin_id: adminId, action: outcome === "refund" ? "dispute_refund" : "dispute_release", target_type: "dispute", target_id: disputeId, note });
}

export async function resolveDisputeRefund(disputeId: string, adminId: string, note?: string) { return resolveDispute(disputeId, adminId, "refund", note); }
export async function resolveDisputeRelease(disputeId: string, adminId: string, note?: string) { return resolveDispute(disputeId, adminId, "release", note); }

// ============ Admin user management ============
export async function searchUsers(query: string) {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase.rpc("admin_search_users", { search_query: q });
  if (error) { console.warn("[searchUsers]", error.message); return []; }
  return data ?? [];
}

export async function adminActOnUser(input: {
  admin_id: string; target_user_id: string;
  action: "user_suspend" | "user_ban" | "user_unban" | "user_warn"; note?: string;
}) {
  if (input.action === "user_ban") {
    const { error } = await supabase.rpc("admin_ban_user", { p_user_id: input.target_user_id, p_banned: true, p_reason: input.note ?? "Admin ban" });
    if (error) throw error;
  } else if (input.action === "user_unban") {
    const { error } = await supabase.rpc("admin_ban_user", { p_user_id: input.target_user_id, p_banned: false, p_reason: null });
    if (error) throw error;
  } else if (input.action === "user_warn") {
    const { error } = await supabase.rpc("admin_warn_user", { p_user_id: input.target_user_id });
    if (error) throw error;
  }
  await writeAuditLog({ admin_id: input.admin_id, action: input.action as AuditAction, target_type: "user", target_id: input.target_user_id, note: input.note });
}
