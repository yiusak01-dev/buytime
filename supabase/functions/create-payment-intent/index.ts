// Create Stripe PaymentIntent for a listing purchase (escrow hold).
import Stripe from "npm:stripe@17.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

// Own Supabase — use built-in service role env vars (set automatically for functions
// deployed on this project, bypasses RLS for all DB operations)
const OWN_SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://oadwfgujhjqgnydigwux.supabase.co";
const OWN_SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { listing_id, buyer_id, use_discount: rawUseDiscount } = await req.json();
    const useDiscount = rawUseDiscount === true;
    if (!listing_id || !buyer_id) {
      return new Response(JSON.stringify({ error: "missing listing_id or buyer_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(OWN_SUPABASE_URL, OWN_SUPABASE_KEY);

    // Load listing from v_active_listings (has pre-calculated fees)
    const { data: listing, error: lErr } = await db
      .from("v_active_listings")
      .select("listing_id, seller_id, mall_name, receipt_amount, asking_price, parking_hours, buyer_fee, seller_fee, buyer_total, seller_payout")
      .eq("listing_id", listing_id)
      .maybeSingle();

    if (lErr || !listing) {
      return new Response(JSON.stringify({ error: "listing not found or expired" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (listing.seller_id === buyer_id) {
      return new Response(JSON.stringify({ error: "cannot buy your own listing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const askingPrice = Number(listing.asking_price);
    // Fees computed here (10% rate) — do NOT trust the view's legacy 8% columns
    const FLAT_FEE = 2.5;
    const FEE_PCT = 0.10;
    const MIN_PCT_FEE = 3;
    const hours = Number(listing.parking_hours) || 0;
    const calcFee = hours <= 1
      ? FLAT_FEE
      : Math.max(MIN_PCT_FEE, Math.round(askingPrice * FEE_PCT * 100) / 100);
    const buyerFee = calcFee;
    const sellerFee = calcFee;
    const amountCharged = Math.round((askingPrice + buyerFee) * 100) / 100;
    const sellerPayout = Math.round((askingPrice - sellerFee) * 100) / 100;


    // Apply new-user discount (50% off buyer fee)
    let discountApplied = false;
    let finalBuyerFee = buyerFee;
    if (useDiscount) {
      const { data: userData } = await db
        .from("users")
        .select("discount_txns_remaining")
        .eq("id", buyer_id)
        .single();
      if (userData && userData.discount_txns_remaining > 0) {
        finalBuyerFee = Math.round(buyerFee * 0.5 * 100) / 100;
        discountApplied = true;
      }
    }

    const amountChargedFinal = Math.max(
      1,
      Math.round((askingPrice + finalBuyerFee) * 100) / 100,
    );

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" as any });

    // Look up or create a Stripe Customer for this buyer (enables saved cards)
    const { data: buyerData } = await db
      .from("users")
      .select("stripe_customer_id")
      .eq("id", buyer_id)
      .single();

    let stripeCustomerId: string;
    if (buyerData?.stripe_customer_id) {
      stripeCustomerId = buyerData.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        metadata: { supabase_user_id: buyer_id },
      });
      stripeCustomerId = customer.id;
      await db.from("users").update({ stripe_customer_id: stripeCustomerId }).eq("id", buyer_id);
    }

    const pi = await stripe.paymentIntents.create({
      amount: Math.round(amountChargedFinal * 100),
      currency: "hkd",
      customer: stripeCustomerId,

      capture_method: "automatic",
      automatic_payment_methods: { enabled: true },
      metadata: {
        listing_id,
        buyer_id,
        seller_id: listing.seller_id ?? "",
        seller_payout: String(sellerPayout),
        buyer_fee: String(buyerFee),
        seller_fee: String(sellerFee),
        discount_applied: String(discountApplied),
      },
    });

    // Create Customer Session so PaymentElement shows saved cards on return visits
    const customerSession = await stripe.customerSessions.create({
      customer: stripeCustomerId,
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_redisplay: "enabled",
            payment_method_save: "enabled",
            payment_method_save_usage: "on_session",
            payment_method_remove: "enabled",
          },
        },
      },
    });

    // Insert pending transaction into own Supabase
    const txId = crypto.randomUUID();

    const { error: txErr } = await db.from("transactions").insert({
      id: txId,
      listing_id,
      buyer_id,
      seller_id: listing.seller_id,
      mall_name: listing.mall_name ?? null,
      receipt_amount: Number(listing.receipt_amount ?? 0),
      sale_price: askingPrice,
      status: "pending_exchange",
      stripe_payment_intent_id: pi.id,
    });

    if (txErr) {
      console.error("tx insert failed", txErr);
      return new Response(JSON.stringify({ error: txErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        client_secret: pi.client_secret,
        customer_session_client_secret: customerSession.client_secret,
        transaction_id: txId,
        amount_charged: amountChargedFinal,
        seller_payout: sellerPayout,
        buyer_fee: finalBuyerFee,
        seller_fee: sellerFee,
        asking_price: askingPrice,
        discount_applied: discountApplied,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
