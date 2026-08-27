// award-referral-discount: give both referrer and referee +1 discount_txns_remaining
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/award-referral-discount")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const url = process.env["SUPABASE_URL"]!;
          const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
          const anonKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!;

          const { referrer_id, referee_id } = (await request.json()) as {
            referrer_id?: string;
            referee_id?: string;
          };
          if (!referrer_id || !referee_id) {
            return json({ error: "missing referrer_id or referee_id" }, 400);
          }

          // Verify the caller is the referee — prevents arbitrary self-awarding
          const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
          if (!token) return json({ error: "unauthorized" }, 401);
          const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
          const { data: userData, error: authErr } = await authClient.auth.getUser(token);
          if (authErr || !userData?.user || userData.user.id !== referee_id) {
            return json({ error: "unauthorized" }, 401);
          }

          const db = createClient(url, serviceKey, { auth: { persistSession: false } });

          // The referral row must exist (created by the client before calling)
          const { data: referral } = await db
            .from("referrals")
            .select("referrer_id, referee_id")
            .eq("referrer_id", referrer_id)
            .eq("referee_id", referee_id)
            .maybeSingle();
          if (!referral) return json({ error: "referral not found" }, 404);

          for (const id of [referrer_id, referee_id]) {
            const { data: row } = await db
              .from("users")
              .select("discount_txns_remaining")
              .eq("id", id)
              .single();
            await db
              .from("users")
              .update({
                discount_txns_remaining:
                  Number((row as Record<string, unknown> | null)?.["discount_txns_remaining"] ?? 0) + 1,
              })
              .eq("id", id);
          }

          return json({ ok: true });
        } catch (e) {
          console.error(e);
          return json({ error: (e as Error).message }, 500);
        }
      },
    },
  },
});
