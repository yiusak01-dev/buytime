import { supabase } from "@/integrations/supabase/client";
import { getMode } from "./store";
import { deviceId } from "./device";

export type EventName =
  | "feed_empty"
  | "post_start"
  | "post_abandon"
  | "post_done"
  | "register_start"
  | "register_abandon"
  | "register_done"
  | "limit_hit"
  | "price_warned"
  | "price_blocked"
  | "contact_warned";

/** 記低用法（例如搵唔到嘢、放到一半走咗），每週問題報告用；示範模式唔記 */
export function logEvent(name: EventName, props: Record<string, string | number | boolean | null | undefined> = {}) {
  if (getMode() !== "remote") return;
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(props)) if (v !== undefined) clean[k] = typeof v === "string" ? v.slice(0, 80) : v;
  const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: object) => PromiseLike<unknown>;
  void rpc("aah_log_event", { p_name: name, p_props: clean, p_device: deviceId() }).then(
    () => undefined,
    () => undefined,
  );
}
