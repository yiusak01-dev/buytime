import { createClient } from "@supabase/supabase-js";

const OWN_URL = import.meta.env.VITE_OWN_SUPABASE_URL ?? "https://oadwfgujhjqgnydigwux.supabase.co";
const OWN_KEY = import.meta.env.VITE_OWN_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZHdmZ3VqaGpxZ255ZGlnd3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMTM0MjMsImV4cCI6MjA5ODc4OTQyM30.Zx2prlmxNXhPB6YWHG09QZr7wiNqHIXvrRcYfrXMnBY";

export const ownSupabase = createClient(OWN_URL, OWN_KEY, {
  auth: { persistSession: false },
}) as any;
