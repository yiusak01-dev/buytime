// Referral system helpers (own Supabase project)
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ownSupabase } from "@/integrations/supabase/own-client";

const REF_KEY = "referral_code";

/** Capture ?ref=CODE from the URL and remember it until the user signs up. */
export function captureReferralFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref && ref.trim()) {
      window.localStorage.setItem(REF_KEY, ref.trim().toUpperCase());
    }
  } catch (e) {
    console.warn("[referral] capture failed", e);
  }
}

function randomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/** Make sure the signed-in user has a referral code; returns it (or null). */
export async function ensureReferralCode(userId: string): Promise<string | null> {
  try {
    const { data, error } = await (supabase as any)
      .from("users")
      .select("referral_code")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    const existing = (data as any)?.referral_code as string | undefined;
    if (existing) return existing;

    const code = randomCode();
    const { error: upErr } = await (supabase as any)
      .from("users")
      .update({ referral_code: code })
      .eq("id", userId);
    if (upErr) throw upErr;
    return code;
  } catch (e: any) {
    console.warn("[referral] ensureReferralCode failed:", e?.message ?? e);
    return null;
  }
}

/** Total platform credits (HK$) for a user. */
export async function fetchCreditBalance(userId: string): Promise<number> {
  try {
    const { data, error } = await ownSupabase
      .from("credits")
      .select("amount")
      .eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0);
  } catch (e: any) {
    console.warn("[referral] fetchCreditBalance failed:", e?.message ?? e);
    return 0;
  }
}

/** After sign-in/sign-up, link the new user to whoever referred them. */
export async function recordPendingReferral(user: User) {
  if (typeof window === "undefined") return;
  let pending: string | null = null;
  try {
    pending = window.localStorage.getItem(REF_KEY);
  } catch {
    return;
  }
  if (!pending) return;

  try {
    const { data: referrer, error } = await (supabase as any)
      .from("users")
      .select("id")
      .eq("referral_code", pending)
      .maybeSingle();
    if (error) throw error;
    if (!referrer || (referrer as any).id === user.id) {
      window.localStorage.removeItem(REF_KEY);
      return;
    }
    const { error: insErr } = await (supabase as any)
      .from("referrals")
      .upsert(
        { referrer_id: (referrer as any).id, referee_id: user.id },
        { onConflict: "referee_id", ignoreDuplicates: true },
      );
    if (insErr) throw insErr;

    window.localStorage.removeItem(REF_KEY);
  } catch (e: any) {
    console.warn("[referral] recordPendingReferral failed:", e?.message ?? e);
  }
}

/** Remaining discounted transactions for a user (from referrals + new-user bonus). */
export async function fetchDiscountTxnsRemaining(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("discount_txns_remaining")
      .eq("id", userId)
      .single();
    if (error) throw error;
    return Number((data as any)?.discount_txns_remaining ?? 0);
  } catch (e: any) {
    console.warn("[referral] fetchDiscountTxnsRemaining failed:", e?.message ?? e);
    return 0;
  }
}
