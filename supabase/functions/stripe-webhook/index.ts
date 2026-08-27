// Stripe webhook: sync PaymentIntent status back to transactions.
import Stripe from "npm:stripe@17.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const _secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const SUPABASE_SERVICE_ROLE_KEY =
  (_secretKeys.service_role_key as string | undefined) ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" as any });

  let event: Stripe.Event;
  try {
    if (!sig || !STRIPE_WEBHOOK_SECRET) {
      // Fallback: parse without signature verification (dev only)
      event = JSON.parse(body) as Stripe.Event;
    } else {
      event = await stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET);
    }
  } catch (e) {
    console.error("webhook signature verification failed", e);
    return new Response("bad signature", { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      await admin
        .from("transactions")
        .update({ status: "paid_held", escrow_status: "paid_held" })
        .eq("stripe_payment_intent_id", pi.id);
    } else if (
      event.type === "payment_intent.payment_failed" ||
      event.type === "payment_intent.canceled"
    ) {
      const pi = event.data.object as Stripe.PaymentIntent;
      // Cancel the transaction and get the listing_id
      const { data: tx } = await admin
        .from("transactions")
        .update({ status: "cancelled", escrow_status: "cancelled" })
        .eq("stripe_payment_intent_id", pi.id)
        .select("listing_id")
        .maybeSingle();
      // Release the listing back to active so others can buy it
      if (tx?.listing_id) {
        await admin
          .from("listings")
          .update({ status: "active" })
          .eq("id", tx.listing_id);
      }
    }
  } catch (e) {
    console.error("webhook handler failed", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
