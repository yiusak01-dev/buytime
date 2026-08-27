// Notifies users with an active listing alert for a mall when a new listing appears.
// External-safe endpoint: no PII is returned, only a count.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const OWN_URL = "https://oadwfgujhjqgnydigwux.supabase.co";
const OWN_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZHdmZ3VqaGpxZ255ZGlnd3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMTM0MjMsImV4cCI6MjA5ODc4OTQyM30.Zx2prlmxNXhPB6YWHG09QZr7wiNqHIXvrRcYfrXMnBY";

export const Route = createFileRoute("/api/public/notify-price-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            listing_id?: string;
            mall_id?: number | string;
            asking_price?: number;
            parking_hours?: number;
            seller_id?: string;
            mall_name?: string;
          };

          if (body.mall_id === undefined || body.mall_id === null) {
            return Response.json({ error: "missing mall_id" }, { status: 400 });
          }

          // Service role for the marketplace project lets us read every user's alert row.
          // Falls back to the publishable key (RLS applies) when the secret is not configured.
          const key = process.env["OWN_SUPABASE_SERVICE_ROLE_KEY"] || OWN_ANON;
          const db = createClient(OWN_URL, key, {
            auth: { persistSession: false, autoRefreshToken: false },
          }) as any;

          let sellerId = body.seller_id ?? null;
          let price = Number(body.asking_price ?? 0);
          let hours = Number(body.parking_hours ?? 0);
          let mallName = body.mall_name ?? null;

          if (body.listing_id && (!sellerId || !price || !hours || !mallName)) {
            const { data: listing } = await db
              .from("listings")
              .select("seller_id, asking_price, parking_hours, mall_name")
              .eq("id", body.listing_id)
              .maybeSingle();
            if (listing) {
              sellerId = sellerId ?? listing.seller_id ?? null;
              price = price || Number(listing.asking_price ?? 0);
              hours = hours || Number(listing.parking_hours ?? 0);
              mallName = mallName ?? listing.mall_name ?? null;
            }
          }

          if (!mallName) {
            const { data: mall } = await db
              .from("malls")
              .select("name")
              .eq("id", body.mall_id)
              .maybeSingle();
            mallName = mall?.name ?? "商場";
          }

          let query = db
            .from("price_alerts")
            .select("user_id, max_price")
            .eq("mall_id", body.mall_id)
            .eq("active", true);
          if (sellerId) query = query.neq("user_id", sellerId);

          const { data: alerts, error } = await query;
          if (error) {
            console.error("[notify-price-alerts] query error", error.message);
            return Response.json({ error: "query failed" }, { status: 500 });
          }

          const recipients = (alerts ?? []).filter((a: { max_price?: number }) => {
            const max = Number(a.max_price ?? 0);
            return max >= 9999 || max >= price;
          });

          const title = "🔔 新泊車單出現";
          const text = `${mallName} — HK$${price} / ${hours}小時`;

          await Promise.all(
            recipients.map(async (a: { user_id: string }) => {
              // Send FCM push
              await fetch(`${OWN_URL}/functions/v1/send-push`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${OWN_ANON}`,
                  apikey: OWN_ANON,
                },
                body: JSON.stringify({ recipient_id: a.user_id, title, body: text }),
              }).catch((e) => console.warn("[notify-price-alerts] send-push failed", e));

              // Also persist in notifications table so it appears on 通告 page
              await db
                .from("notifications")
                .insert({ user_id: a.user_id, title, body: text })
                .then(({ error }: { error: any }) => {
                  if (error) console.warn("[notify-price-alerts] save notification failed", error.message);
                })
                .catch((e: any) => console.warn("[notify-price-alerts] save notification error", e));
            }),
          );

          return Response.json({ ok: true, sent: recipients.length });
        } catch (e) {
          console.error("[notify-price-alerts]", e);
          return Response.json({ error: "unexpected error" }, { status: 500 });
        }
      },
    },
  },
});
