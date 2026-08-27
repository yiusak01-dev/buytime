import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Route guard for signed-in-only routes.
 * The session lives in browser storage, so the check is client-side only;
 * during SSR/prerender we let the route render and the client guard runs on hydration.
 */
export async function requireSignedIn() {
  if (typeof window === "undefined") return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw redirect({ to: "/auth" });
  }
}
