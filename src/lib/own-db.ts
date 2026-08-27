// Writes + user-scoped reads against the user's own Supabase project.
import { supabase as rawSupabase } from "@/integrations/supabase/client";
const supabase = rawSupabase as any;
import type { User } from "@supabase/supabase-js";

// -------- USERS --------
// Schema: id, phone, display_name, avatar_text, rating, rating_count,
// sell_count, buy_count, is_verified, created_at, updated_at (NO email)
export async function syncUserToOwn(user: User, extra?: { name?: string }) {
  const displayName =
    extra?.name ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "用戶";
  const payload = {
    id: user.id,
    phone: user.phone || null,
    display_name: displayName,
    avatar_text: displayName.charAt(0).toUpperCase(),
    email: user.email ?? null,
    discount_txns_remaining: 3, // 只喺 INSERT 生效，現有用戶唔會被覆蓋
  };
  const { error } = await supabase
    .from("users")
    .upsert(payload, { onConflict: "id", ignoreDuplicates: true });
  if (error) console.warn("[syncUserToOwn] upsert failed:", error.message);
}

export async function fetchOwnUserStats(userId: string) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[fetchOwnUserStats] failed:", error.message);
    return null;
  }
  return data;
}

// -------- LISTINGS (sell) --------
export type NewListingInput = {
  seller_id: string;
  mall_id: string | number;
  mall_name?: string;
  district?: string;
  merchant_name: string;
  receipt_amount: number;
  asking_price: number;
  parking_hours: number;
  expires_at: string;         // ISO
  receipt_serial?: string;
  cap_price?: number;
  suggested_price?: number;
  receipt_date?: string;
  receipt_photo_url?: string;
  payment_method?: string;
  seller_assist?: boolean;
};

export async function createOwnListing(input: NewListingInput) {
  const payload: Record<string, unknown> = {
    seller_id: input.seller_id,
    mall_id: input.mall_id,
    merchant_name: input.merchant_name,
    receipt_amount: input.receipt_amount,
    asking_price: input.asking_price,
    parking_hours: input.parking_hours,
    expires_at: input.expires_at,
    receipt_serial: input.receipt_serial ?? null,
    status: "active",
  };
  if (input.mall_name !== undefined) payload.mall_name = input.mall_name;
  if (input.district !== undefined) payload.district = input.district;
  if (input.cap_price !== undefined) payload.cap_price = input.cap_price;
  if (input.suggested_price !== undefined) payload.suggested_price = input.suggested_price;
  if (input.receipt_date !== undefined) payload.receipt_date = input.receipt_date;
  if (input.receipt_photo_url !== undefined) payload.receipt_photo_url = input.receipt_photo_url;
  if (input.payment_method !== undefined) payload.payment_method = input.payment_method;
  if (input.seller_assist !== undefined) payload.seller_assist = input.seller_assist;

  let { data, error } = await supabase
    .from("listings")
    .insert(payload)
    .select()
    .maybeSingle();

  // 若 DB 未有 payment_method / seller_assist 欄位，退回唔帶該欄位再試
  if (error && /payment_method|seller_assist/i.test(error.message ?? "")) {
    if (/payment_method/i.test(error.message ?? "")) delete payload.payment_method;
    if (/seller_assist/i.test(error.message ?? "")) delete payload.seller_assist;
    ({ data, error } = await supabase
      .from("listings")
      .insert(payload)
      .select()
      .maybeSingle());
  }
  if (error) throw error;
  return data;
}

// -------- TRANSACTIONS --------
export async function fetchOwnTransactions(userId: string, side: "buy" | "sell") {
  const column = side === "buy" ? "buyer_id" : "seller_id";
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq(column, userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[fetchOwnTransactions] failed:", error.message);
    return [];
  }
  return data ?? [];
}

export async function createOwnTransaction(input: {
  listing_id: string;
  buyer_id: string;
  seller_id: string | null;
  sale_price: number;
  status?: string;
  mall_name?: string;
  receipt_amount?: number;
  meetup_location?: string;
  auto_confirm_at?: string;
}) {
  const newId = crypto.randomUUID();
  const payload: Record<string, unknown> = {
    id: newId,
    listing_id: input.listing_id,
    buyer_id: input.buyer_id,
    seller_id: input.seller_id,
    sale_price: input.sale_price,
    status: input.status ?? "pending_exchange",
  };
  if (input.mall_name !== undefined) payload.mall_name = input.mall_name;
  if (input.receipt_amount !== undefined) payload.receipt_amount = input.receipt_amount;
  if (input.meetup_location !== undefined) payload.meetup_location = input.meetup_location;
  if (input.auto_confirm_at !== undefined) payload.auto_confirm_at = input.auto_confirm_at;

  const { error } = await supabase.from("transactions").insert(payload);
  if (error) {
    console.warn("[createOwnTransaction] failed:", error.message);
    return null;
  }
  return { id: newId } as { id: string };
}

export async function fetchOwnCompletedBuySavings(userId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("listing_price")
    .eq("buyer_id", userId)
    .eq("status", "completed");
  if (error) {
    console.warn("[fetchOwnCompletedBuySavings] failed:", error.message);
    return { total: 0, count: 0 };
  }
  const rows = data ?? [];
  const total = rows.reduce((sum: number, row: { listing_price?: number | string }) => sum + Number(row.listing_price ?? 0), 0);
  return { total, count: rows.length };
}

// 賺取／節省統計（用於個人檔案）
export async function fetchEarningsAndSavings(userId: string) {
  const COMPLETED = ["completed", "buyer_confirmed", "auto_released", "resolved_release"];

  const { data: sellRows } = await supabase
    .from("transactions")
    .select("sale_price, status")
    .eq("seller_id", userId);

  const { data: buyRows } = await supabase
    .from("transactions")
    .select("sale_price, receipt_amount, status")
    .eq("buyer_id", userId);

  const earned = (sellRows ?? [])
    .filter((r: any) => COMPLETED.includes(String(r.status)))
    .reduce((s: number, r: any) => s + Number(r.sale_price ?? 0), 0);

  const saved = (buyRows ?? [])
    .filter((r: any) => COMPLETED.includes(String(r.status)))
    .reduce(
      (s: number, r: any) =>
        s + Math.max(0, Number(r.receipt_amount ?? 0) - Number(r.sale_price ?? 0)),
      0,
    );

  return { earned: Math.round(earned), saved: Math.round(saved) };
}

export async function notifyListingAlerts(params: {
  listing_id?: string;
  mall_id: number;
  seller_id: string;
  asking_price: number;
  mall_name: string;
  parking_hours: number;
}): Promise<void> {
  try {
    const res = await fetch("/api/public/notify-price-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const json = await res.json().catch(() => null);
    console.log("[notifyListingAlerts]", res.status, json);
  } catch (e) {
    console.warn("[notifyListingAlerts] failed:", e);
  }
}
