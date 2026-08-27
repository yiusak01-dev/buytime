import { supabase } from "@/integrations/supabase/client";
import { ownSupabase } from "@/integrations/supabase/own-client";

const sb = () => supabase as any;
const ownSb = () => ownSupabase as any;

/* ---------------- Favourite malls ---------------- */

export async function fetchFavouriteMallIds(userId: string): Promise<number[]> {
  const { data, error } = await sb().from("user_favourite_malls").select("mall_id").eq("user_id", userId);
  if (error) { console.warn("[favourites] fetch failed", error); return []; }
  return (data ?? []).map((r: any) => Number(r.mall_id));
}

export async function toggleFavouriteMall(userId: string, mallId: number, isFav: boolean): Promise<boolean> {
  if (isFav) {
    const { error } = await sb().from("user_favourite_malls").delete().eq("user_id", userId).eq("mall_id", mallId);
    if (error) throw error;
    return false;
  }
  const { error } = await sb().from("user_favourite_malls").insert({ user_id: userId, mall_id: mallId });
  if (error) throw error;
  return true;
}

/* ---------------- Waitlist ---------------- */

export type WaitlistRow = { id: string; mall_id: number; created_at: string };

export async function fetchWaitlist(userId: string): Promise<WaitlistRow[]> {
  const { data, error } = await sb().from("waitlist").select("id, mall_id, created_at").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) { console.warn("[waitlist] fetch failed", error); return []; }
  return (data ?? []).map((r: any) => ({ id: String(r.id), mall_id: Number(r.mall_id), created_at: r.created_at }));
}

export async function addToWaitlist(userId: string, mallId: number) {
  const { error } = await sb().from("waitlist").insert({ user_id: userId, mall_id: mallId });
  if (error) throw error;
}

export async function removeFromWaitlist(userId: string, mallId: number) {
  const { error } = await sb().from("waitlist").delete().eq("user_id", userId).eq("mall_id", mallId);
  if (error) throw error;
}

/* ---------------- Price alerts ---------------- */

export type PriceAlertRow = { id: string; mall_id: number; max_price: number; active: boolean; created_at: string };

export async function fetchPriceAlerts(userId: string): Promise<PriceAlertRow[]> {
  const { data, error } = await ownSb().from("price_alerts").select("id, mall_id, max_price, active, created_at").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) { console.warn("[price_alerts] fetch failed", error); return []; }
  return (data ?? []).map((r: any) => ({ id: String(r.id), mall_id: Number(r.mall_id), max_price: Number(r.max_price ?? 0), active: r.active !== false, created_at: r.created_at }));
}

export async function savePriceAlert(userId: string, mallId: number, maxPrice: number) {
  const existing = await fetchPriceAlerts(userId);
  const match = existing.find((a) => a.mall_id === mallId);
  if (match) {
    const { error } = await ownSb().from("price_alerts").update({ max_price: maxPrice, active: true }).eq("id", match.id);
    if (error) throw error;
    return;
  }
  const { error } = await ownSb().from("price_alerts").insert({ user_id: userId, mall_id: mallId, max_price: maxPrice, active: true });
  if (error) throw error;
}

export async function deletePriceAlert(alertId: string) {
  const { error } = await ownSb().from("price_alerts").delete().eq("id", alertId);
  if (error) throw error;
}

/* ---------------- Market rate ---------------- */

export type MarketRate = { min: number; max: number; avg: number; median: number; count: number };

export async function fetchMarketRate(mallId: number | string): Promise<MarketRate | null> {
  const { data, error } = await ownSupabase.from("listings").select("asking_price, parking_hours").eq("mall_id", mallId).eq("status", "active");
  if (error) { console.warn("[marketRate] fetch failed", error); return null; }
  const perHour = (data ?? []).map((r: any) => {
    const hrs = Number(r.parking_hours ?? 0);
    const price = Number(r.asking_price ?? 0);
    return hrs > 0 && price > 0 ? price / hrs : null;
  }).filter((n: number | null): n is number => n != null);
  if (perHour.length === 0) return null;
  const sum = perHour.reduce((a: number, b: number) => a + b, 0);
  const sorted = [...perHour].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { median: Math.round(median), min: Math.round(Math.min(...perHour)), max: Math.round(Math.max(...perHour)), avg: Math.round(sum / perHour.length), count: perHour.length };
}

/* ---------------- Seller dashboard ---------------- */

export type SellerDashboard = { totalEarned: number; totalSales: number; avgRating: number | null; topMall: string | null; monthly: Array<{ month: string; earned: number }> };

export async function fetchSellerDashboard(userId: string): Promise<SellerDashboard> {
  const [txnRes, ratingRes] = await Promise.all([
    sb().from("transactions").select("seller_payout, mall_name, completed_at, created_at").eq("seller_id", userId).eq("status", "completed"),
    sb().from("ratings").select("rating").eq("ratee_id", userId),
  ]);
  const txns: any[] = txnRes.error ? [] : (txnRes.data ?? []);
  const ratings: any[] = ratingRes.error ? [] : (ratingRes.data ?? []);
  const totalEarned = txns.reduce((a, r) => a + Number(r.seller_payout ?? 0), 0);
  const mallCounts = new Map<string, number>();
  for (const r of txns) { if (r.mall_name) mallCounts.set(r.mall_name, (mallCounts.get(r.mall_name) ?? 0) + 1); }
  let topMall: string | null = null, topCount = 0;
  mallCounts.forEach((c, name) => { if (c > topCount) { topCount = c; topMall = name; } });
  const now = new Date();
  const monthly: Array<{ month: string; earned: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthly.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, earned: 0 });
  }
  for (const r of txns) {
    const ts = r.completed_at ?? r.created_at;
    if (!ts) continue;
    const d = new Date(ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthly.find((m) => m.month === key);
    if (bucket) bucket.earned += Number(r.seller_payout ?? 0);
  }
  return { totalEarned, totalSales: txns.length, avgRating: ratings.length > 0 ? ratings.reduce((a, r) => a + Number(r.rating ?? 0), 0) / ratings.length : null, topMall, monthly };
}

/* ---------------- Mall lookup (id + coords) ---------------- */

export type MallGeo = { id: number; name: string; lat: number | null; lng: number | null; emoji: string | null };

export async function fetchMallGeo(): Promise<MallGeo[]> {
  const { data, error } = await ownSupabase.from("malls").select("id, name, lat, lng, icon_emoji").eq("is_active", true);
  if (error) { console.warn("[mallGeo] fetch failed", error); return []; }
  return (data ?? []).map((m: any) => ({ id: Number(m.id), name: m.name ?? "", lat: m.lat != null ? Number(m.lat) : null, lng: m.lng != null ? Number(m.lng) : null, emoji: m.icon_emoji ?? null }));
}
